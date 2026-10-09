import { matchMflRoster } from './league-import';
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
