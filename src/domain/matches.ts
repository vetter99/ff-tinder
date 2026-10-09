// Type-only imports: the Cloudflare Worker bundles this file too.
import type { PersonalValue } from './preference';
import type { Player, PlayerId } from './types';

/**
 * League trade matches: 1-for-1 swaps between two real teams in the same league where *both*
 * managers prefer what they'd receive by more than consensus does, at a fair market price.
 *
 * Members share their values keyed by MyFantasyLeague player id, so the server can match them
 * against the league's actual rosters without knowing anything else about the app's players.
 */

/** One player's shared value: [market baseline, personal value, 1 if QB else 0]. */
export type SharedValue = [baseline: number, value: number, qb: 0 | 1];
/** A member's shared values by MFL player id. */
export type SharedValues = Record<string, SharedValue>;

export interface LeagueMember {
  franchiseId: string;
  franchiseName: string;
  /** MFL player ids on the team's current roster. */
  roster: readonly string[];
  values: SharedValues;
}

export interface TradeMatch {
  franchiseId: string;
  franchiseName: string;
  /** MFL id of the player you'd send. */
  send: string;
  /** MFL id of the player you'd receive. */
  receive: string;
  /** How much more than consensus you prefer the incoming player, relative to the outgoing one. */
  yourEdge: number;
  /** The same for the other manager, for the player you'd send them. */
  theirEdge: number;
  /** Strength of the match: the smaller of the two edges, so both sides must want it. */
  score: number;
}

export const MATCH_RULES = {
  /** Both edges must reach this. Equal to the solo trade ideas' minimum edge. */
  minEdge: 1,
  /** Either side may give up this share of the larger side's market value (both want the deal). */
  maxMarketShare: 0.12,
  /** Absolute slack for low-value players, in baseline points. */
  marketFloor: 1,
  maxPerIncoming: 2,
  maxPerOutgoing: 3,
  limit: 10,
  /** 3-way matches shown, and how often one player may appear in them. */
  threeWayLimit: 5,
  threeWayPerPlayer: 2,
};

/**
 * A three-team loop: you send `send` to `first`, `first` sends `first.sends` to `second`, and
 * `second` sends `second.sends` to you. Each manager prefers what they receive over what they give
 * up by more than consensus does, and each manager's swap is fair by market.
 */
export interface ThreeWayMatch {
  send: string;
  first: { franchiseId: string; franchiseName: string; sends: string };
  second: { franchiseId: string; franchiseName: string; sends: string };
  /** Your edge on what you receive (`second.sends`) over what you send. */
  yourEdge: number;
  /** The smallest of the three managers' edges. */
  score: number;
}

/** Values to share with the league, keyed by MFL id and rounded to keep the upload small. */
export function shareableValues(
  players: readonly Player[],
  values: ReadonlyMap<PlayerId, PersonalValue>,
): SharedValues {
  const out: SharedValues = {};
  for (const p of players) {
    const v = values.get(p.id);
    if (!p.ids.mfl || !v) continue;
    out[p.ids.mfl] = [round1(v.baseline), round1(v.value), p.position === 'QB' ? 1 : 0];
  }
  return out;
}

/** Validates an uploaded values object; returns null if it isn't one. */
export function parseSharedValues(raw: unknown, maxPlayers = 1000): SharedValues | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > maxPlayers) return null;
  const out: SharedValues = {};
  for (const [id, v] of entries) {
    if (!/^\d{1,6}$/.test(id) || !Array.isArray(v) || v.length !== 3) return null;
    const [baseline, value, qb] = v as unknown[];
    if (!isScore(baseline) || !isScore(value) || (qb !== 0 && qb !== 1)) return null;
    out[id] = [baseline, value, qb];
  }
  return out;
}

/**
 * Every match between `me` and the other members, strongest first, varied so no player dominates.
 * Market fairness is checked with both members' baselines, in case their formats differ.
 */
export function findMatches(
  me: LeagueMember,
  others: readonly LeagueMember[],
  rules = MATCH_RULES,
): TradeMatch[] {
  const all: TradeMatch[] = [];
  for (const them of others) {
    if (them.franchiseId === me.franchiseId) continue;
    for (const send of me.roster) {
      for (const receive of them.roster) {
        const match = evaluate(me.values, them.values, send, receive, rules);
        if (match) all.push({ franchiseId: them.franchiseId, franchiseName: them.franchiseName, send, receive, ...match });
      }
    }
  }
  all.sort((a, b) => b.score - a.score);

  const perIncoming = new Map<string, number>();
  const perOutgoing = new Map<string, number>();
  const picked: TradeMatch[] = [];
  for (const m of all) {
    const inCount = perIncoming.get(m.receive) ?? 0;
    const outCount = perOutgoing.get(m.send) ?? 0;
    if (inCount >= rules.maxPerIncoming || outCount >= rules.maxPerOutgoing) continue;
    perIncoming.set(m.receive, inCount + 1);
    perOutgoing.set(m.send, outCount + 1);
    picked.push(m);
    if (picked.length >= rules.limit) break;
  }
  return picked;
}

/**
 * Every 3-way loop that includes `me`, strongest first. Built from each manager's acceptable swaps
 * so it never tries every combination of three rosters.
 */
export function findThreeWayMatches(
  me: LeagueMember,
  others: readonly LeagueMember[],
  rules = MATCH_RULES,
): ThreeWayMatch[] {
  const teams = others.filter((t) => t.franchiseId !== me.franchiseId);
  const all: ThreeWayMatch[] = [];
  for (const x of me.roster) {
    // Who would take X: team B giving up Y.
    const takers = teams.flatMap((b) =>
      b.roster.flatMap((y) => {
        const edge = accepts(b.values, y, x, rules);
        return edge === null ? [] : [{ team: b, player: y, edge }];
      }),
    );
    if (takers.length === 0) continue;
    // What you'd take for X: team C giving up Z.
    const offers = teams.flatMap((c) =>
      c.roster.flatMap((z) => {
        const edge = accepts(me.values, x, z, rules);
        return edge === null ? [] : [{ team: c, player: z, edge }];
      }),
    );
    for (const b of takers) {
      for (const c of offers) {
        if (c.team.franchiseId === b.team.franchiseId) continue; // that's a 2-team trade
        // C gives up Z and receives Y.
        const cEdge = accepts(c.team.values, c.player, b.player, rules);
        if (cEdge === null) continue;
        all.push({
          send: x,
          first: { franchiseId: b.team.franchiseId, franchiseName: b.team.franchiseName, sends: b.player },
          second: { franchiseId: c.team.franchiseId, franchiseName: c.team.franchiseName, sends: c.player },
          yourEdge: c.edge,
          score: Math.min(b.edge, c.edge, cEdge),
        });
      }
    }
  }
  all.sort((a, b) => b.score - a.score);

  const uses = new Map<string, number>();
  const picked: ThreeWayMatch[] = [];
  for (const m of all) {
    const players = [m.send, m.first.sends, m.second.sends];
    if (players.some((p) => (uses.get(p) ?? 0) >= rules.threeWayPerPlayer)) continue;
    for (const p of players) uses.set(p, (uses.get(p) ?? 0) + 1);
    picked.push(m);
    if (picked.length >= rules.threeWayLimit) break;
  }
  return picked;
}

/**
 * A manager's edge for giving up `out` to get `incoming` (by their own values and market), or null
 * if they wouldn't: unknown player, QB for non-QB, unfair by market, or edge below the minimum.
 */
function accepts(values: SharedValues, out: string, incoming: string, rules: typeof MATCH_RULES): number | null {
  const [o, i] = [values[out], values[incoming]];
  if (!o || !i || o[2] !== i[2] || !fair(o[0], i[0], rules)) return null;
  const edge = i[1] - i[0] - (o[1] - o[0]);
  return edge >= rules.minEdge ? edge : null;
}

function evaluate(
  mine: SharedValues,
  theirs: SharedValues,
  send: string,
  receive: string,
  rules: typeof MATCH_RULES,
): Pick<TradeMatch, 'yourEdge' | 'theirEdge' | 'score'> | null {
  const [mySend, myReceive, theirSend, theirReceive] = [mine[send], mine[receive], theirs[send], theirs[receive]];
  if (!mySend || !myReceive || !theirSend || !theirReceive) return null;
  // QBs are only ever traded for QBs.
  if (mySend[2] !== myReceive[2]) return null;
  if (!fair(mySend[0], myReceive[0], rules) || !fair(theirSend[0], theirReceive[0], rules)) return null;

  const gap = (v: SharedValue) => v[1] - v[0];
  const yourEdge = gap(myReceive) - gap(mySend);
  const theirEdge = gap(theirSend) - gap(theirReceive);
  if (yourEdge < rules.minEdge || theirEdge < rules.minEdge) return null;
  return { yourEdge, theirEdge, score: Math.min(yourEdge, theirEdge) };
}

function fair(a: number, b: number, rules: typeof MATCH_RULES): boolean {
  const larger = Math.max(a, b);
  return larger >= rules.marketFloor && Math.abs(a - b) <= Math.max(rules.marketFloor, rules.maxMarketShare * larger);
}

function isScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -100 && v <= 200;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
