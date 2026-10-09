import { baselineFromRank, FantasyCalcRow, normalizeFantasyCalc } from './normalize';

const row = (id: number, name: string, position: string, value: number, sleeperId?: string): FantasyCalcRow => ({
  player: { id, name, position, sleeperId, maybeTeam: 'ATL' },
  value,
  overallRank: id,
  positionRank: 1,
});

describe('normalizeFantasyCalc', () => {
  it('scales values to 0–100 and sorts by baseline', () => {
    const players = normalizeFantasyCalc([
      row(2, 'B', 'WR', 5000, '20'),
      row(1, 'A', 'RB', 10000, '10'),
    ]);
    expect(players.map((p) => p.id)).toEqual(['10', '20']);
    expect(players[0].market.baseline).toBe(100);
    expect(players[1].market.baseline).toBe(50);
  });

  it('drops non-skill positions and falls back to a FantasyCalc id', () => {
    const players = normalizeFantasyCalc([row(1, 'A', 'RB', 100), row(2, 'Pick', 'PICK', 50)]);
    expect(players).toHaveLength(1);
    expect(players[0].id).toBe('fc:1');
  });

  it('keeps numeric MFL ids and drops placeholders like "UNK"', () => {
    const players = normalizeFantasyCalc([
      { ...row(1, 'A', 'RB', 100, '10'), player: { ...row(1, 'A', 'RB', 100, '10').player, mflId: '13604' } },
      { ...row(2, 'B', 'WR', 90, '20'), player: { ...row(2, 'B', 'WR', 90, '20').player, mflId: 'UNK' } },
    ]);
    expect(players.map((p) => p.ids.mfl)).toEqual(['13604', null]);
  });
});

describe('baselineFromRank', () => {
  it('is decreasing and concave: early gaps are larger than late gaps', () => {
    expect(baselineFromRank(1)).toBe(100);
    const early = baselineFromRank(1) - baselineFromRank(10);
    const late = baselineFromRank(91) - baselineFromRank(100);
    expect(early).toBeGreaterThan(late * 5);
  });
});
