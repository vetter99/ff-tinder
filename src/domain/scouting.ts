import { Comparison, PlayerId } from './types';

/** Matchups (your players vs. theirs) that complete a scouting session for one team. */
export const SCOUT_GOAL = 12;

/** How many answered matchups pit one of your players against one of theirs ("I would never" excluded). */
export function scoutCount(
  comparisons: readonly Comparison[],
  mine: ReadonlySet<PlayerId>,
  theirs: ReadonlySet<PlayerId>,
): number {
  return comparisons.filter(
    (c) =>
      !c.veto &&
      ((mine.has(c.winner) && theirs.has(c.loser)) || (theirs.has(c.winner) && mine.has(c.loser))),
  ).length;
}
