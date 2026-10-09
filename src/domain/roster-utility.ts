import { LeagueSettings, Player, PlayerId, Position, ReplacementLevels } from './types';

export type Slot = 'QB' | 'RB' | 'WR' | 'TE' | 'FLEX' | 'SUPERFLEX';

const ELIGIBLE: Record<Slot, readonly Position[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'],
  SUPERFLEX: ['QB', 'RB', 'WR', 'TE'],
};

/** Dedicated slots come first so greedy filling is optimal for this lineup shape. */
export function lineupSlots(settings: LeagueSettings): Slot[] {
  const slots: Slot[] = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX'];
  if (settings.superflex) slots.push('SUPERFLEX');
  return slots;
}

/** Bench players are insurance, not points: only the top few above replacement carry weight. */
export const BENCH_WEIGHTS = { depth: 0.25, depthCount: 3, rest: 0.05 };

export interface RosterEvaluation {
  total: number;
  starterValue: number;
  benchValue: number;
  starters: { slot: Slot; id: PlayerId }[];
  bench: PlayerId[];
}

/**
 * Simplified roster utility: value of the best possible starting lineup plus a small, discounted
 * credit for bench depth above replacement level. This is what makes one elite starter worth more
 * than two good players who would not both start.
 */
export function evaluateRoster(
  roster: readonly Player[],
  valueOf: (p: Player) => number,
  settings: LeagueSettings,
  replacement: ReplacementLevels,
): RosterEvaluation {
  const remaining = [...roster].sort((a, b) => valueOf(b) - valueOf(a));
  const starters: RosterEvaluation['starters'] = [];
  let starterValue = 0;

  for (const slot of lineupSlots(settings)) {
    const idx = remaining.findIndex((p) => ELIGIBLE[slot].includes(p.position));
    if (idx === -1) continue;
    const [p] = remaining.splice(idx, 1);
    starters.push({ slot, id: p.id });
    starterValue += valueOf(p);
  }

  let benchValue = 0;
  remaining.forEach((p, i) => {
    const weight = i < BENCH_WEIGHTS.depthCount ? BENCH_WEIGHTS.depth : BENCH_WEIGHTS.rest;
    benchValue += weight * Math.max(0, valueOf(p) - replacement[p.position]);
  });

  return {
    total: starterValue + benchValue,
    starterValue,
    benchValue,
    starters,
    bench: remaining.map((p) => p.id),
  };
}
