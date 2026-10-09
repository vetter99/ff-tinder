import { emptyModel, personalValues } from './preference';
import { makePlayer } from './testing';
import { valueChart } from './value-chart';

describe('valueChart', () => {
  const players = [makePlayer('a', 'RB', 90), makePlayer('b', 'WR', 80), makePlayer('c', 'RB', 70)];

  it('ranks by personal value and reports the market rank alongside', () => {
    const values = personalValues(players, emptyModel());
    values.set('c', { ...values.get('c')!, value: 95, gap: 25 });
    const rows = valueChart(players, values);
    expect(rows.map((r) => [r.player.id, r.yourRank, r.marketRank])).toEqual([
      ['c', 1, 3],
      ['a', 2, 1],
      ['b', 3, 2],
    ]);
  });

  it('uses positional ranks when filtered', () => {
    const rows = valueChart(players, personalValues(players, emptyModel()), 'RB');
    expect(rows.map((r) => [r.player.id, r.yourRank, r.marketRank])).toEqual([
      ['a', 1, 1],
      ['c', 2, 2],
    ]);
  });
});
