/**
 * Cloudflare Worker: serves the static app and a small read-only proxy for MyFantasyLeague,
 * whose API doesn't allow browser (CORS) requests from other sites.
 *
 *   GET /api/mfl/search?q=<name or id>   → leagues matching a name, or one league by id
 *   GET /api/mfl/league?id=<league id>   → league name, settings hints and every franchise's roster
 *   GET /api/mfl/players?ids=<a,b,c>     → names/positions for MFL player ids
 *   GET /api/news?espn=<ESPN player id>   → a player's latest news blurbs, trimmed from ESPN's feed
 *
 * Only these fixed, public read-only requests are forwarded, so this can't be used as an open proxy.
 *
 * Each league team's answers and shared values live in D1 (binding DB):
 *
 *   POST /api/league/sync  { leagueId, franchiseId, values, log } → merges the team's answers with
 *                          the saved ones; returns them, how many teams take part, and the matches
 *
 * There are no accounts yet: whoever picks a team on any device gets that team's answers. Members
 * only ever receive their own matches, never another member's values.
 */

import { findMatches, LeagueMember, parseSharedValues } from '../src/domain/matches';
import { mergeLogs, parseLog } from '../src/domain/team-sync';

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB?: D1Database;
}

/** The subset of Cloudflare's D1 API used here. */
interface D1Database {
  prepare(sql: string): D1Statement;
  exec(sql: string): Promise<unknown>;
}
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
type Ctx = { waitUntil(p: Promise<unknown>): void };

const MFL_API = 'https://api.myfantasyleague.com';
/** MFL asks API clients to identify themselves. */
const USER_AGENT = 'FF-Tinder/1.0';
const LEAGUE_TTL_S = 300;
const PLAYERS_TTL_S = 86_400;
const NEWS_TTL_S = 1_800;
/** Members who haven't synced for this long are left out of matching. */
const MEMBER_ACTIVE_DAYS = 30;
/** Room for the full answer log (a few thousand answers). */
const MAX_BODY_BYTES = 1_500_000;
const DAY_MS = 86_400_000;

export default {
  async fetch(request: Request, env: Env, ctx: Ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      if (url.pathname.startsWith('/api/league/')) {
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
        const db = await database(env);
        const body = await readBody(request);
        switch (url.pathname) {
          case '/api/league/sync':
            return json(await syncTeam(db, ctx, body));
          default:
            return json({ error: 'Not found' }, 404);
        }
      }
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      switch (url.pathname) {
        case '/api/mfl/search':
          return await cached(request, ctx, LEAGUE_TTL_S, () => search(url.searchParams.get('q')));
        case '/api/mfl/league':
          return await cached(request, ctx, LEAGUE_TTL_S, () => league(url.searchParams.get('id')));
        case '/api/mfl/players':
          return await cached(request, ctx, PLAYERS_TTL_S, () => players(url.searchParams.get('ids')));
        case '/api/news':
          return await cached(request, ctx, NEWS_TTL_S, () => news(url.searchParams.get('espn')));
        default:
          return json({ error: 'Not found' }, 404);
      }
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 502;
      return json({ error: e instanceof Error ? e.message : 'MyFantasyLeague request failed' }, status);
    }
  },
};

let schemaReady: Promise<unknown> | null = null;

/** The D1 database, with its table created on first use. */
async function database(env: Env): Promise<D1Database> {
  const db = env.DB;
  if (!db) throw new HttpError(503, 'League matching isn’t set up on this server');
  schemaReady ??= db
    .exec(
      // league_members held the earlier per-device claims; teams replaced it.
      'DROP TABLE IF EXISTS league_members; ' +
        'CREATE TABLE IF NOT EXISTS teams (' +
        'league_id TEXT NOT NULL, franchise_id TEXT NOT NULL, values_json TEXT NOT NULL, ' +
        'log_json TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (league_id, franchise_id))',
    )
    .catch((e) => {
      schemaReady = null;
      throw e;
    });
  await schemaReady;
  return db;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'Request too large');
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new HttpError(400, 'Invalid JSON body');
}

interface TeamRow {
  franchise_id: string;
  values_json: string;
  log_json: string;
  updated_at: number;
}

/**
 * Merges this team's answers with the saved ones, saves its values, and returns the merged answers
 * plus the team's matches with the rest of the league.
 */
async function syncTeam(db: D1Database, ctx: Ctx, body: Record<string, unknown>) {
  const { leagueId, franchiseId } = body;
  if (typeof leagueId !== 'string' || !/^\d{4,6}$/.test(leagueId)) throw new HttpError(400, 'Invalid league ID');
  if (typeof franchiseId !== 'string' || !/^\d{4}$/.test(franchiseId)) throw new HttpError(400, 'Invalid team ID');
  const values = parseSharedValues(body['values']);
  if (!values) throw new HttpError(400, 'Invalid values');
  const log = parseLog(body['log']);
  if (!log) throw new HttpError(400, 'Invalid answers');
  const now = Date.now();

  const lg = await cachedData(`https://ff-tinder.internal/league/${leagueId}`, ctx, LEAGUE_TTL_S, () =>
    league(leagueId),
  );
  const names = new Map(lg.franchises.map((f) => [f.id, f.name]));
  if (!names.has(franchiseId)) throw new HttpError(400, 'That team isn’t in this league');

  const { results } = await db
    .prepare('SELECT franchise_id, values_json, log_json, updated_at FROM teams WHERE league_id = ?')
    .bind(leagueId)
    .all<TeamRow>();
  const saved = results.find((r) => r.franchise_id === franchiseId);
  const merged = saved ? mergeLogs(parseLog(JSON.parse(saved.log_json)) ?? { comparisons: [], deleted: [] }, log) : log;
  await db
    .prepare(
      'INSERT INTO teams (league_id, franchise_id, values_json, log_json, updated_at) VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT (league_id, franchise_id) DO UPDATE SET ' +
        'values_json = excluded.values_json, log_json = excluded.log_json, updated_at = excluded.updated_at',
    )
    .bind(leagueId, franchiseId, JSON.stringify(values), JSON.stringify(merged), now)
    .run();

  const rosters = new Map(lg.franchises.map((f) => [f.id, f.playerIds]));
  const member = (id: string, v: LeagueMember['values']): LeagueMember => ({
    franchiseId: id,
    franchiseName: names.get(id) ?? `Team ${id}`,
    roster: rosters.get(id) ?? [],
    values: v,
  });
  const others = results
    .filter((r) => r.franchise_id !== franchiseId && names.has(r.franchise_id))
    .filter((r) => now - r.updated_at < MEMBER_ACTIVE_DAYS * DAY_MS)
    .map((r) => member(r.franchise_id, parseSharedValues(JSON.parse(r.values_json)) ?? {}));

  return {
    log: merged,
    teams: lg.teams,
    members: others.length + 1,
    matches: findMatches(member(franchiseId, values), others),
  };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The NFL season MFL files leagues under: January–February still belong to last year's season. */
export function currentSeason(now = new Date()): number {
  return now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

/** MFL returns a single object instead of a one-element array; normalize to arrays. */
function list<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

async function mfl(type: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const query = new URLSearchParams({ TYPE: type, ...params, JSON: '1' });
  // fetch follows MFL's redirect from api.myfantasyleague.com to the league's own server.
  const res = await fetch(`${MFL_API}/${currentSeason()}/export?${query}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (res.status === 429) throw new HttpError(429, 'MyFantasyLeague is rate limiting requests; try again shortly');
  if (!res.ok) throw new HttpError(502, `MyFantasyLeague responded ${res.status}`);
  const body = (await res.json()) as Record<string, unknown> & { error?: { $t?: string } | string };
  if (body.error) {
    const message = typeof body.error === 'string' ? body.error : (body.error.$t ?? 'Request failed');
    throw new HttpError(/log ?in|private|permission/i.test(message) ? 403 : 400, message);
  }
  return body;
}

interface MflLeagueSummary {
  id: string;
  name: string;
}

async function search(q: string | null) {
  const query = (q ?? '').trim();
  const id = query.match(/(?:^|\/home\/|[?&]L=)(\d{4,6})(?:\D|$)/)?.[1];
  if (!id && query.length < 3) throw new HttpError(400, 'Enter at least 3 characters or a league ID');
  const body = await mfl('leagueSearch', id ? { ID: id } : { SEARCH: query });
  const leagues = list((body['leagues'] as { league?: MflLeagueSummary | MflLeagueSummary[] })?.league);
  return { leagues: leagues.slice(0, 50).map((l) => ({ id: l.id, name: l.name })) };
}

interface MflFranchise {
  id: string;
  name?: string;
}
interface MflRosterFranchise {
  id: string;
  player?: { id: string; status?: string } | { id: string; status?: string }[];
}
interface MflStarterPosition {
  name: string;
  limit: string;
}

async function league(id: string | null) {
  if (!id || !/^\d{4,6}$/.test(id)) throw new HttpError(400, 'Invalid league ID');
  const [leagueBody, rostersBody, rulesBody] = await Promise.all([
    mfl('league', { L: id }),
    mfl('rosters', { L: id }),
    mfl('rules', { L: id }).catch(() => null),
  ]);
  const info = leagueBody['league'] as {
    name: string;
    franchises?: { franchise?: MflFranchise | MflFranchise[] };
    starters?: { position?: MflStarterPosition | MflStarterPosition[] };
  };
  const rosters = new Map(
    list((rostersBody['rosters'] as { franchise?: MflRosterFranchise | MflRosterFranchise[] })?.franchise).map(
      (f) => [f.id, list(f.player).map((p) => p.id)],
    ),
  );
  const franchises = list(info.franchises?.franchise);
  const qbLimit = list(info.starters?.position).find((p) => p.name === 'QB')?.limit ?? '1';
  return {
    id,
    name: info.name,
    teams: franchises.length,
    // A QB limit like "1-2" means a second QB can start: superflex.
    superflex: /-\s*[2-9]/.test(qbLimit) || Number(qbLimit) >= 2,
    ppr: rulesBody ? receptionPoints(rulesBody) : null,
    franchises: franchises.map((f) => ({
      id: f.id,
      name: f.name ?? `Team ${f.id}`,
      playerIds: rosters.get(f.id) ?? [],
    })),
  };
}

interface MflRule {
  event: { $t: string } | string;
  points: { $t: string } | string;
}
interface MflPositionRules {
  positions: string;
  rule?: MflRule | MflRule[];
}

/** Points per reception for WRs from the league's scoring rules ("*1" = PPR, "*.5" = half). */
export function receptionPoints(rulesBody: Record<string, unknown>): number {
  const text = (v: { $t: string } | string) => (typeof v === 'string' ? v : v.$t);
  const groups = list((rulesBody['rules'] as { positionRules?: MflPositionRules | MflPositionRules[] })?.positionRules);
  for (const group of groups) {
    if (!group.positions.split('|').includes('WR')) continue;
    const catchRule = list(group.rule).find((r) => text(r.event) === 'CC');
    if (catchRule) return Number(text(catchRule.points).replace('*', '')) || 0;
  }
  return 0;
}

interface EspnNewsItem {
  type?: string;
  headline?: string;
  story?: string;
  description?: string;
  published?: string;
}

/** Latest player updates (RotoWire blurbs on ESPN), trimmed to a few hundred bytes. */
async function news(espnId: string | null) {
  if (!espnId || !/^\d{1,10}$/.test(espnId)) throw new HttpError(400, 'Invalid player ID');
  const res = await fetch(
    `https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?limit=15&playerId=${espnId}`,
    { headers: { 'User-Agent': USER_AGENT } },
  );
  if (!res.ok) throw new HttpError(502, `ESPN responded ${res.status}`);
  const feed = ((await res.json()) as { feed?: EspnNewsItem[] }).feed ?? [];
  const plain = (html = '') =>
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return {
    items: feed
      .filter((item) => item.type === 'Rotowire' && item.headline)
      .slice(0, 4)
      .map((item) => {
        const story = plain(item.story ?? item.description);
        return {
          headline: plain(item.headline),
          summary: story.length > 280 ? `${story.slice(0, 277).trimEnd()}…` : story,
          published: item.published ?? null,
        };
      }),
  };
}

async function players(ids: string | null) {
  const list_ = (ids ?? '').split(',').filter((x) => /^\d{1,6}$/.test(x)).slice(0, 100);
  if (list_.length === 0) return { players: [] };
  const body = await mfl('players', { PLAYERS: list_.join(',') });
  const found = list((body['players'] as { player?: unknown })?.player) as {
    id: string;
    name: string;
    position: string;
    team?: string;
  }[];
  return {
    players: found.map((p) => ({
      id: p.id,
      // MFL names are "Last, First".
      name: p.name.includes(',') ? p.name.split(',').reverse().map((s) => s.trim()).join(' ') : p.name,
      position: p.position,
      team: p.team ?? null,
    })),
  };
}

async function cached(request: Request, ctx: Ctx, ttlSeconds: number, load: () => Promise<unknown>): Promise<Response> {
  const cache = edgeCache();
  const key = new Request(request.url, { method: 'GET' });
  const hit = await cache?.match(key);
  if (hit) return hit;
  const res = json(await load(), 200, ttlSeconds);
  if (cache) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

/** Like `cached`, for data the Worker uses itself; `cacheUrl` is only a cache key. */
async function cachedData<T>(cacheUrl: string, ctx: Ctx, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const cache = edgeCache();
  const key = new Request(cacheUrl, { method: 'GET' });
  const hit = await cache?.match(key);
  if (hit) return (await hit.json()) as T;
  const data = await load();
  if (cache) ctx.waitUntil(cache.put(key, json(data, 200, ttlSeconds)));
  return data;
}

function edgeCache(): Cache | undefined {
  return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
}

function json(body: unknown, status = 200, ttlSeconds = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': ttlSeconds ? `public, max-age=${ttlSeconds}` : 'no-store',
    },
  });
}
