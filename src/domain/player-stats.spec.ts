import { injuryTag, summarizeSeason } from './player-stats';

describe('summarizeSeason', () => {
  const raw = {
    '1': { stats: { gp: 1, pts_ppr: 31.3, pts_std: 23.3, pts_half_ppr: 27.3, pos_rank_ppr: 6, rush_yd: 83, rec: 8, off_snp: 46, tm_off_snp: 60 } },
    '2': { stats: { gp: 1, pts_ppr: 11.1, pts_std: 8.1, pts_half_ppr: 9.6, pos_rank_ppr: 30, rush_yd: 40, rec: 3, off_snp: 40, tm_off_snp: 64 } },
    '3': null, // bye
    '4': { stats: { gp: 0 } }, // inactive
    '5': { stats: { gp: 1, pts_ppr: 27.7, pts_std: 20.7, pts_half_ppr: 24.2, pos_rank_ppr: 4, rush_yd: 120, rec: 7 } },
  };

  it('averages only games played, in the league scoring format', () => {
    const ppr = summarizeSeason(raw, 1);
    expect(ppr.games).toBe(3);
    expect(ppr.pointsPerGame).toBeCloseTo((31.3 + 11.1 + 27.7) / 3);
    expect(ppr.last).toEqual({ week: 5, points: 27.7, positionRank: 4 });
    expect(summarizeSeason(raw, 0).pointsPerGame).toBeCloseTo((23.3 + 8.1 + 20.7) / 3);
  });

  it('totals stats and snap share across the season', () => {
    const s = summarizeSeason(raw, 1);
    expect(s.totals.rushYd).toBe(243);
    expect(s.totals.rec).toBe(18);
    expect(s.snapShare).toBeCloseTo(86 / 124);
  });

  it('handles players with no games', () => {
    const s = summarizeSeason({}, 1);
    expect(s.pointsPerGame).toBeNull();
    expect(s.last).toBeNull();
  });
});

describe('injuryTag', () => {
  it('abbreviates common statuses', () => {
    expect(injuryTag('Questionable')).toBe('Q');
    expect(injuryTag('IR')).toBe('IR');
    expect(injuryTag(null)).toBeNull();
  });
});
