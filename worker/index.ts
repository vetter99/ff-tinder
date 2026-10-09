/**
 * Cloudflare Worker: serves the static app and a small read-only proxy for MyFantasyLeague,
 * whose API doesn't allow browser (CORS) requests from other sites.
 *
 *   GET /api/mfl/search?q=<name or id>   → leagues matching a name, or one league by id
 *   GET /api/mfl/league?id=<league id>   → league name, settings hints and every franchise's roster
 *   GET /api/mfl/players?ids=<a,b,c>     → names/positions for MFL player ids
 *
 * Only these fixed, public export requests are forwarded, so this can't be used as an open proxy.
 */

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const MFL_API = 'https://api.myfantasyleague.com';
/** MFL asks API clients to identify themselves. */
const USER_AGENT = 'FF-Tinder/1.0';
const LEAGUE_TTL_S = 300;
const PLAYERS_TTL_S = 86_400;

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

    try {
      switch (url.pathname) {
        case '/api/mfl/search':
          return await cached(request, ctx, LEAGUE_TTL_S, () => search(url.searchParams.get('q')));
        case '/api/mfl/league':
          return await cached(request, ctx, LEAGUE_TTL_S, () => league(url.searchParams.get('id')));
        case '/api/mfl/players':
          return await cached(request, ctx, PLAYERS_TTL_S, () => players(url.searchParams.get('ids')));
        default:
          return json({ error: 'Not found' }, 404);
      }
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 502;
      return json({ error: e instanceof Error ? e.message : 'MyFantasyLeague request failed' }, status);
    }
  },
};

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
  const [leagueBody, rostersBody] = await Promise.all([
    mfl('league', { L: id }),
    mfl('rosters', { L: id }),
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
    franchises: franchises.map((f) => ({
      id: f.id,
      name: f.name ?? `Team ${f.id}`,
      playerIds: rosters.get(f.id) ?? [],
    })),
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

async function cached(
  request: Request,
  ctx: { waitUntil(p: Promise<unknown>): void },
  ttlSeconds: number,
  load: () => Promise<unknown>,
): Promise<Response> {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(request.url, { method: 'GET' });
  const hit = await cache?.match(key);
  if (hit) return hit;
  const res = json(await load(), 200, ttlSeconds);
  if (cache) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
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
