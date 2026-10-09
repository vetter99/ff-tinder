import { baselineFromRank } from './normalize';
import { Player, Position } from './types';

const PATTERN: Position[] = ['RB', 'WR', 'WR', 'RB', 'WR', 'TE', 'QB', 'WR', 'RB', 'QB'];

/** A synthetic player universe with FantasyCalc-like baselines, sorted by value. */
export function makePlayers(count = 200): Player[] {
  const posRanks: Partial<Record<Position, number>> = {};
  return Array.from({ length: count }, (_, i) => {
    const position = PATTERN[i % PATTERN.length];
    posRanks[position] = (posRanks[position] ?? 0) + 1;
    return makePlayer(`p${i + 1}`, position, baselineFromRank(i + 1), i + 1, posRanks[position]);
  });
}

export function makePlayer(
  id: string,
  position: Position,
  baseline: number,
  overallRank = 1,
  positionRank = 1,
): Player {
  return {
    id,
    name: `${position} ${id}`,
    team: 'FA',
    position,
    age: 25,
    ids: { sleeper: id, espn: null, fantasycalc: 0 },
    market: { rawValue: baseline * 100, overallRank, positionRank, tier: null, trend30Day: 0, baseline },
  };
}

/** Deterministic PRNG (mulberry32) for reproducible simulations. */
export function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
