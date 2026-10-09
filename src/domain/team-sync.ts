// Type-only import: the Cloudflare Worker bundles this file too.
import type { Comparison } from './types';

/**
 * Answers saved per league team, so picking your team on any device brings them back. Devices
 * merge their logs: comparisons are combined by id, and deleted ids (undo, clear) are kept as
 * tombstones so a device that still has a deleted answer doesn't bring it back.
 */
export interface ComparisonLog {
  comparisons: Comparison[];
  /** Ids of comparisons removed on some device. */
  deleted: string[];
}

export const SYNC_LIMITS = {
  /** Oldest answers beyond this are dropped; by then they've faded to almost nothing anyway. */
  maxComparisons: 5000,
  maxDeleted: 10000,
};

/** Identifies a league team, e.g. "mfl:43745:0001". */
export function teamKey(leagueId: string, franchiseId: string): string {
  return `mfl:${leagueId}:${franchiseId}`;
}

/** Combines two logs: every comparison either has, minus anything either deleted. */
export function mergeLogs(a: ComparisonLog, b: ComparisonLog, limits = SYNC_LIMITS): ComparisonLog {
  const deleted = [...new Set([...a.deleted, ...b.deleted])].slice(-limits.maxDeleted);
  const gone = new Set(deleted);
  const byId = new Map<string, Comparison>();
  for (const c of [...a.comparisons, ...b.comparisons]) {
    if (!gone.has(c.id) && !byId.has(c.id)) byId.set(c.id, c);
  }
  const comparisons = [...byId.values()]
    .sort((x, y) => x.ts - y.ts || (x.id < y.id ? -1 : 1))
    .slice(-limits.maxComparisons);
  return { comparisons, deleted };
}

/** Whether two logs hold the same comparisons and deletions (ignoring order). */
export function sameLog(a: ComparisonLog, b: ComparisonLog): boolean {
  const ids = (cs: Comparison[]) => cs.map((c) => c.id).sort().join();
  return ids(a.comparisons) === ids(b.comparisons) && [...a.deleted].sort().join() === [...b.deleted].sort().join();
}

/** Validates an uploaded log, keeping only known fields. Returns null if it isn't one. */
export function parseLog(raw: unknown, limits = SYNC_LIMITS): ComparisonLog | null {
  if (!raw || typeof raw !== 'object') return null;
  const { comparisons, deleted } = raw as Record<string, unknown>;
  if (!Array.isArray(comparisons) || !Array.isArray(deleted)) return null;
  if (comparisons.length > limits.maxComparisons || deleted.length > limits.maxDeleted) return null;
  if (!deleted.every(isId)) return null;
  const parsed: Comparison[] = [];
  for (const c of comparisons) {
    const comparison = parseComparison(c);
    if (!comparison) return null;
    parsed.push(comparison);
  }
  return { comparisons: parsed, deleted: deleted as string[] };
}

function parseComparison(raw: unknown): Comparison | null {
  if (!raw || typeof raw !== 'object') return null;
  const { id, ts, winner, loser, tie, veto, baselines } = raw as Record<string, unknown>;
  if (!isId(id) || !isPlayerId(winner) || !isPlayerId(loser)) return null;
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  if ((tie !== undefined && typeof tie !== 'boolean') || (veto !== undefined && typeof veto !== 'boolean')) return null;
  const validBaselines =
    Array.isArray(baselines) && baselines.length === 2 && baselines.every((b) => typeof b === 'number' && Number.isFinite(b));
  if (baselines !== undefined && !validBaselines) return null;
  return {
    id,
    ts,
    winner,
    loser,
    ...(tie ? { tie: true } : {}),
    ...(veto ? { veto: true } : {}),
    ...(validBaselines ? { baselines: baselines as [number, number] } : {}),
  };
}

function isId(v: unknown): v is string {
  return typeof v === 'string' && /^[\w-]{1,64}$/.test(v);
}

function isPlayerId(v: unknown): v is string {
  return typeof v === 'string' && /^[\w:.-]{1,40}$/.test(v);
}
