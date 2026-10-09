import { mergeLogs, parseLog, sameLog, teamKey } from './team-sync';
import { Comparison } from './types';

const c = (id: string, ts: number, extra: Partial<Comparison> = {}): Comparison => ({
  id,
  ts,
  winner: 'a',
  loser: 'b',
  ...extra,
});

describe('mergeLogs', () => {
  it('combines answers from two devices in time order without duplicates', () => {
    const phone = { comparisons: [c('1', 10), c('3', 30)], deleted: [] };
    const laptop = { comparisons: [c('2', 20), c('1', 10)], deleted: [] };
    expect(mergeLogs(phone, laptop).comparisons.map((x) => x.id)).toEqual(['1', '2', '3']);
  });

  it('keeps deletions from either side, so an undo on one device sticks everywhere', () => {
    const phone = { comparisons: [c('1', 10)], deleted: ['2'] };
    const server = { comparisons: [c('1', 10), c('2', 20)], deleted: [] };
    const merged = mergeLogs(phone, server);
    expect(merged.comparisons.map((x) => x.id)).toEqual(['1']);
    expect(merged.deleted).toEqual(['2']);
  });

  it('drops the oldest answers beyond the limit', () => {
    const log = { comparisons: [c('1', 10), c('2', 20), c('3', 30)], deleted: [] };
    const merged = mergeLogs(log, { comparisons: [], deleted: [] }, { maxComparisons: 2, maxDeleted: 10 });
    expect(merged.comparisons.map((x) => x.id)).toEqual(['2', '3']);
  });

  it('sameLog ignores order', () => {
    const a = { comparisons: [c('1', 10), c('2', 20)], deleted: ['x', 'y'] };
    const b = { comparisons: [c('2', 20), c('1', 10)], deleted: ['y', 'x'] };
    expect(sameLog(a, b)).toBe(true);
    expect(sameLog(a, { ...b, deleted: ['x'] })).toBe(false);
  });
});

describe('parseLog', () => {
  it('accepts real comparisons and strips unknown fields', () => {
    const raw = {
      comparisons: [{ ...c('abc-1', 5, { veto: true, baselines: [40, 41] }), extra: 'nope' }],
      deleted: ['old-1'],
    };
    expect(parseLog(raw)).toEqual({
      comparisons: [{ id: 'abc-1', ts: 5, winner: 'a', loser: 'b', veto: true, baselines: [40, 41] }],
      deleted: ['old-1'],
    });
  });

  it('rejects malformed logs', () => {
    expect(parseLog(null)).toBeNull();
    expect(parseLog({ comparisons: [] })).toBeNull();
    expect(parseLog({ comparisons: [{ id: '1', ts: 'x', winner: 'a', loser: 'b' }], deleted: [] })).toBeNull();
    expect(parseLog({ comparisons: [c('1', 1, { baselines: [1] as never })], deleted: [] })).toBeNull();
    expect(parseLog({ comparisons: [], deleted: ['<script>'] })).toBeNull();
    expect(parseLog({ comparisons: [c('1', 1), c('2', 2)], deleted: [] }, { maxComparisons: 1, maxDeleted: 1 })).toBeNull();
  });

  it('names teams by league and franchise', () => {
    expect(teamKey('43745', '0001')).toBe('mfl:43745:0001');
  });
});
