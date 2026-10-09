import { formatLabel, normalizeSettings, supportedPpr, supportedTeams } from './format';

describe('league formats', () => {
  it('maps any league size to the nearest one FantasyCalc supports', () => {
    expect(supportedTeams(12)).toBe(12);
    expect(supportedTeams(16)).toBe(14);
    expect(supportedTeams(6)).toBe(8);
    expect(supportedTeams(11)).toBe(12);
    expect(supportedTeams(9)).toBe(10);
  });

  it('maps reception points to standard, half or full PPR', () => {
    expect(supportedPpr(0.25)).toBe(0.5);
    expect(supportedPpr(1.5)).toBe(1);
    expect(supportedPpr(0.1)).toBe(0);
  });

  it('normalizes saved settings and labels them', () => {
    const s = normalizeSettings({ teams: 16, ppr: 1, superflex: true, dynasty: true });
    expect(s).toEqual({ teams: 14, ppr: 1, superflex: true, dynasty: true });
    expect(formatLabel(s)).toBe('14-team PPR SF Dynasty');
  });
});
