import { formatSalary, formatSalaryShort, matchMflRoster } from './league-import';
import { makePlayer } from './testing';

describe('matchMflRoster', () => {
  it('maps MFL ids to valued players and reports the rest', () => {
    const chase = { ...makePlayer('s1', 'WR', 95), ids: { sleeper: 's1', espn: null, mfl: '15281', fantasycalc: 1 } };
    const bijan = { ...makePlayer('s2', 'RB', 100), ids: { sleeper: 's2', espn: null, mfl: '16161', fantasycalc: 2 } };
    const { matched, unmatched } = matchMflRoster(['15281', '13198', '16161'], [chase, bijan]);
    expect(matched.map((p) => p.id)).toEqual(['s2', 's1']);
    expect(unmatched).toEqual(['13198']);
  });
});

describe('formatSalary', () => {
  it('shows salary-cap dollars whole and auction values with cents only when needed', () => {
    expect(formatSalary(10856472)).toBe('$10,856,472');
    expect(formatSalary(6.25)).toBe('$6.25');
    expect(formatSalary(35)).toBe('$35');
  });

  it('abbreviates salaries for cards', () => {
    expect(formatSalaryShort(11_300_000)).toBe('$11.3M');
    expect(formatSalaryShort(10_856_472)).toBe('$10.9M');
    expect(formatSalaryShort(2_000_000)).toBe('$2M');
    expect(formatSalaryShort(850_000)).toBe('$850K');
    expect(formatSalaryShort(6.25)).toBe('$6.25');
  });
});
