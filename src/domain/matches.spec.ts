import { findMatches, findThreeWayMatches, LeagueMember, parseSharedValues, shareableValues, SharedValue, SharedValues } from './matches';
import { PersonalValue } from './preference';
import { makePlayer } from './testing';

/** Market values everyone agrees on: two RBs, two WRs and two QBs at similar prices. */
const MARKET: Record<string, [number, 0 | 1]> = {
  '1': [50, 0], // RB on my team
  '2': [51, 0], // RB on their team
  '3': [40, 0], // WR on my team
  '4': [20, 0], // WR on their team, much cheaper
  '5': [60, 1], // QB on my team
  '6': [61, 1], // QB on their team
};

/** Shared values where each listed player's personal value differs from market by `gaps[id]`. */
function values(gaps: Record<string, number>): SharedValues {
  return Object.fromEntries(
    Object.entries(MARKET).map(([id, [b, qb]]) => [id, [b, b + (gaps[id] ?? 0), qb]]),
  );
}

function member(id: string, roster: string[], gaps: Record<string, number>): LeagueMember {
  return { franchiseId: id, franchiseName: `Team ${id}`, roster, values: values(gaps) };
}

describe('findMatches', () => {
  it('matches a fair swap both managers prefer by more than consensus', () => {
    const me = member('0001', ['1', '3', '5'], { '2': 3 });
    const them = member('0002', ['2', '4', '6'], { '1': 2 });
    const [match, ...rest] = findMatches(me, [them]);
    expect(rest).toEqual([]);
    expect(match).toMatchObject({ franchiseId: '0002', send: '1', receive: '2', yourEdge: 3, theirEdge: 2, score: 2 });
  });

  it('needs both sides to want it', () => {
    const me = member('0001', ['1'], { '2': 3 });
    const indifferent = member('0002', ['2'], {});
    const opposed = member('0003', ['2'], { '2': 3 });
    expect(findMatches(me, [indifferent, opposed])).toEqual([]);
  });

  it('skips unfair prices and QB-for-non-QB swaps', () => {
    // WR 3 (40) for WR 4 (20) is lopsided; RB 1 for QB 6 crosses the QB line.
    const me = member('0001', ['1', '3'], { '4': 15, '6': 10 });
    const them = member('0002', ['4', '6'], { '3': 10, '1': 10 });
    expect(findMatches(me, [them])).toEqual([]);
  });

  it('checks fairness with each manager’s own market values', () => {
    const me = member('0001', ['1'], { '2': 3 });
    const them = member('0002', ['2'], { '1': 3 });
    them.values['2'] = [80, 80, 0]; // in their format, player 2 is worth far more
    expect(findMatches(me, [them])).toEqual([]);
  });

  it('ignores my own team and ranks by the weaker side’s edge', () => {
    const me = member('0001', ['1', '5'], { '2': 5, '6': 2 });
    const self = { ...member('0001', ['2'], { '1': 9 }) };
    const them = member('0002', ['2', '6'], { '1': 1.5, '5': 4 });
    const matches = findMatches(me, [self, them]);
    expect(matches.map((m) => m.receive)).toEqual(['6', '2']);
    expect(matches.map((m) => m.score)).toEqual([2, 1.5]);
  });
});

describe('shareableValues / parseSharedValues', () => {
  it('keys values by MFL id and round-trips through validation', () => {
    const qb = { ...makePlayer('a', 'QB', 70.04), ids: { sleeper: 'a', espn: null, mfl: '1234', fantasycalc: 1 } };
    const noMfl = makePlayer('b', 'WR', 50);
    const personal = new Map<string, PersonalValue>([
      ['a', { baseline: 70.04, value: 74.26 } as PersonalValue],
      ['b', { baseline: 50, value: 50 } as PersonalValue],
    ]);
    const shared = shareableValues([qb, noMfl], personal);
    expect(shared).toEqual({ '1234': [70, 74.3, 1] });
    expect(parseSharedValues(JSON.parse(JSON.stringify(shared)))).toEqual(shared);
  });

  it('rejects malformed uploads', () => {
    expect(parseSharedValues(null)).toBeNull();
    expect(parseSharedValues([1, 2])).toBeNull();
    expect(parseSharedValues({ abc: [1, 2, 0] })).toBeNull();
    expect(parseSharedValues({ '1': [1, 2] })).toBeNull();
    expect(parseSharedValues({ '1': [1, 'x', 0] })).toBeNull();
    expect(parseSharedValues({ '1': [1, 2, 3] })).toBeNull();
    expect(parseSharedValues({ '1': [1e9, 2, 0] })).toBeNull();
    expect(parseSharedValues({ '1': [1, 2, 0], '2': [1, 2, 0] }, 1)).toBeNull();
  });
});

describe('findThreeWayMatches', () => {
  // Three WRs at similar prices: each team likes the next team's player more than consensus does.
  const wr = (b: number): [number, 0] => [b, 0];
  const base: Record<string, [number, 0]> = { a: wr(50), b: wr(51), c: wr(50) };
  const team = (id: string, roster: string[], likes: string): LeagueMember => ({
    franchiseId: id,
    franchiseName: `Team ${id}`,
    roster,
    values: Object.fromEntries(
      Object.entries(base).map(([pid, [b, qb]]) => [pid, [b, b + (pid === likes ? 4 : 0), qb]]),
    ),
  });

  it('finds a loop where each team gets the player it likes more than consensus', () => {
    // Me (A) owns a and likes c; B owns b and likes a; C owns c and likes b.
    const me = team('A', ['a'], 'c');
    const b = team('B', ['b'], 'a');
    const c = team('C', ['c'], 'b');
    const [m, ...rest] = findThreeWayMatches(me, [b, c]);
    expect(rest).toEqual([]);
    expect(m).toMatchObject({
      send: 'a',
      first: { franchiseId: 'B', sends: 'b' },
      second: { franchiseId: 'C', sends: 'c' },
      yourEdge: 4,
      score: 4,
    });
    // No 2-team match exists here: nobody likes what a single partner owns in return.
    expect(findMatches(me, [b, c])).toEqual([]);
  });

  it('needs all three managers to want their side', () => {
    const me = team('A', ['a'], 'c');
    const b = team('B', ['b'], 'a');
    const indifferentC = team('C', ['c'], 'nobody');
    expect(findThreeWayMatches(me, [b, indifferentC])).toEqual([]);
  });

  it('stays fast for a full league', () => {
    const ids = Array.from({ length: 300 }, (_, i) => String(1000 + i));
    const market = Object.fromEntries(ids.map((id, i) => [id, 80 - (i % 75)]));
    const members: LeagueMember[] = Array.from({ length: 12 }, (_, t) => ({
      franchiseId: `T${t}`,
      franchiseName: `Team ${t}`,
      roster: ids.slice(t * 25, t * 25 + 25),
      values: Object.fromEntries(
        ids.map((id, i) => [id, [market[id], market[id] + (((i * 31 + t * 17) % 9) - 4), 0] as SharedValue]),
      ),
    }));
    const start = performance.now();
    const found = findThreeWayMatches(members[0], members.slice(1));
    expect(performance.now() - start).toBeLessThan(200);
    expect(found.length).toBeGreaterThan(0);
  });
});
