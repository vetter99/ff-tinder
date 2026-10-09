import { allPackages, findPackages, headline, packageValue } from './packages';
import { emptyModel, personalValues, PersonalValue } from './preference';
import { makePlayer, makePlayers } from './testing';
import { Player, PlayerId } from './types';

function valuesWith(players: Player[], gaps: Record<PlayerId, number>): Map<PlayerId, PersonalValue> {
  const values = personalValues(players, emptyModel());
  for (const [id, gap] of Object.entries(gaps)) {
    const v = values.get(id)!;
    values.set(id, { ...v, value: v.baseline + gap, gap, playerPart: gap });
  }
  return values;
}

const ids = (ps: Player[]) => ps.map((p) => p.id).sort();

describe('packageValue', () => {
  it('equals the player for one and discounts depth for several', () => {
    expect(packageValue([40])).toBeCloseTo(40);
    expect(packageValue([30, 30])).toBeGreaterThan(45);
    expect(packageValue([30, 30])).toBeLessThan(52);
  });
});

describe('findPackages', () => {
  it('scores a 1-for-1 exactly like the solo trade ideas', () => {
    const mine = [makePlayer('m', 'WR', 50)];
    const theirs = [makePlayer('t', 'WR', 51)];
    const players = [...mine, ...theirs];
    const [pkg] = allPackages({ roster: mine, theirs, values: valuesWith(players, { t: 3, m: -1 }) });
    expect(pkg.group).toBe('one-for-one');
    expect(pkg.edge).toBeCloseTo(4);
    expect(pkg.marketDelta).toBeCloseTo(1);
  });

  it('finds a consolidation when you like their star more than consensus', () => {
    const mine = [makePlayer('a', 'RB', 30), makePlayer('b', 'WR', 30)];
    const theirs = [makePlayer('star', 'WR', 48)];
    const players = [...mine, ...theirs];
    const pkgs = allPackages({ roster: mine, theirs, values: valuesWith(players, { star: 5 }) });
    const consolidate = pkgs.find((p) => p.group === 'consolidate');
    expect(consolidate && ids(consolidate.send)).toEqual(['a', 'b']);
    expect(consolidate && ids(consolidate.receive)).toEqual(['star']);
  });

  it('puts a QB on both sides or neither', () => {
    const mine = [makePlayer('qb1', 'QB', 40), makePlayer('rb1', 'RB', 30)];
    const theirs = [makePlayer('qb2', 'QB', 41), makePlayer('rb2', 'RB', 31)];
    const players = [...mine, ...theirs];
    const pkgs = allPackages({ roster: mine, theirs, values: valuesWith(players, { qb2: 4, rb2: 4 }) });
    expect(pkgs.length).toBeGreaterThan(0);
    for (const p of pkgs) {
      expect(p.send.some((x) => x.position === 'QB')).toBe(p.receive.some((x) => x.position === 'QB'));
    }
  });

  it('skips padded deals that are just a better smaller deal plus an even swap', () => {
    const mine = [makePlayer('m1', 'WR', 50), makePlayer('m2', 'RB', 20)];
    const theirs = [makePlayer('t1', 'WR', 50), makePlayer('t2', 'RB', 20)];
    const players = [...mine, ...theirs];
    const pkgs = allPackages({ roster: mine, theirs, values: valuesWith(players, { t1: 6 }) });
    expect(pkgs.some((p) => p.group === 'two-for-two')).toBe(false);
    expect(pkgs[0].group).toBe('one-for-one');
  });

  it('leaves out filler players worth far less than the best one in the deal', () => {
    const mine = [makePlayer('m1', 'WR', 50), makePlayer('junk', 'TE', 5)];
    const theirs = [makePlayer('t1', 'WR', 54)];
    const players = [...mine, ...theirs];
    const pkgs = allPackages({ roster: mine, theirs, values: valuesWith(players, { t1: 6 }) });
    expect(pkgs.every((p) => !p.send.some((x) => x.id === 'junk'))).toBe(true);
  });

  it('skips a 2-for-3 that is a 1-for-2 plus a side swap', () => {
    const mine = [makePlayer('m1', 'WR', 50), makePlayer('m2', 'TE', 20)];
    const theirs = [makePlayer('t1', 'WR', 31), makePlayer('t2', 'RB', 31), makePlayer('t3', 'TE', 20)];
    const players = [...mine, ...theirs];
    const pkgs = allPackages({ roster: mine, theirs, values: valuesWith(players, { t1: 4, t2: 4 }) });
    expect(pkgs.some((p) => p.group === 'spread' && p.receive.length === 2)).toBe(true);
    expect(pkgs.some((p) => p.send.length === 2 && p.receive.length === 3)).toBe(false);
  });

  it('names a package by each side’s best player', () => {
    const [a, b, c] = [makePlayer('a', 'WR', 30), makePlayer('b', 'WR', 40), makePlayer('c', 'RB', 45)];
    expect(headline({ send: [a, b], receive: [c] }).map((p) => p.id)).toEqual(['b', 'c']);
  });

  it('searches two full rosters quickly and keeps the list varied', () => {
    const players = makePlayers(120);
    const mine = players.filter((_, i) => i % 6 === 0).slice(0, 25);
    const theirs = players.filter((_, i) => i % 6 === 1).slice(0, 25);
    const gaps = Object.fromEntries(players.map((p, i) => [p.id, ((i * 7919) % 11) - 5]));
    const start = performance.now();
    const pkgs = findPackages({ roster: mine, theirs, values: valuesWith(players, gaps) });
    expect(performance.now() - start).toBeLessThan(1000);
    expect(pkgs.length).toBeGreaterThan(0);
    const counts = new Map<string, number>();
    for (const p of pkgs) {
      for (const x of [...p.send, ...p.receive]) {
        const key = `${p.group}:${x.id}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });
});
