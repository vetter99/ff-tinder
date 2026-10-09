import { scoutCount } from './scouting';
import { Comparison } from './types';

describe('scoutCount', () => {
  it('counts answered matchups between the two rosters, not vetoes or other pairs', () => {
    const c = (winner: string, loser: string, extra: Partial<Comparison> = {}): Comparison => ({
      id: winner + loser,
      ts: 1,
      winner,
      loser,
      ...extra,
    });
    const mine = new Set(['m1', 'm2']);
    const theirs = new Set(['t1']);
    const log = [c('m1', 't1'), c('t1', 'm2', { tie: true }), c('m1', 'm2'), c('m1', 'x'), c('m2', 't1', { veto: true })];
    expect(scoutCount(log, mine, theirs)).toBe(2);
  });
});
