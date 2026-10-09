import { selectNextPair } from './active-learning';
import { emptyModel, personalValues, PersonalValue } from './preference';
import { findValueGaps } from './targets';
import { makePlayer, makePlayers, seededRandom } from './testing';
import { generateOneForOne, TRADE_RULES } from './trades';
import { DEFAULT_SETTINGS, Player, PlayerId, ReplacementLevels } from './types';

const repl: ReplacementLevels = { QB: 10, RB: 5, WR: 5, TE: 5 };

function valuesWith(players: Player[], gaps: Record<PlayerId, number>): Map<PlayerId, PersonalValue> {
  const values = personalValues(players, emptyModel());
  for (const [id, gap] of Object.entries(gaps)) {
    const v = values.get(id)!;
    values.set(id, { ...v, value: v.baseline + gap, gap, playerPart: gap });
  }
  return values;
}

describe('generateOneForOne', () => {
  const roster = [
    makePlayer('qb', 'QB', 40),
    makePlayer('rb1', 'RB', 70),
    makePlayer('rb2', 'RB', 50),
    makePlayer('wr1', 'WR', 72),
    makePlayer('wr2', 'WR', 45),
    makePlayer('te', 'TE', 25),
    makePlayer('flex', 'WR', 30),
  ];
  const market = [
    makePlayer('breece', 'RB', 70),
    makePlayer('lopsided', 'RB', 95),
    makePlayer('wr-even', 'WR', 71),
  ];
  const players = [...roster, ...market];

  it('proposes trades toward players the user likes, within market tolerance', () => {
    const values = valuesWith(players, { breece: 12, wr1: -6, lopsided: 30 });
    const ideas = generateOneForOne({ players, roster, values, settings: DEFAULT_SETTINGS, replacement: repl });

    expect(ideas[0].receive.id).toBe('breece');
    expect(ideas.some((i) => i.receive.id === 'lopsided')).toBe(false);
    for (const idea of ideas) {
      expect(idea.marketDeltaShare).toBeLessThanOrEqual(TRADE_RULES.maxWinShare);
      expect(idea.marketDeltaShare).toBeGreaterThanOrEqual(-TRADE_RULES.maxOverpayShare);
      expect(idea.personalGain).toBeGreaterThanOrEqual(TRADE_RULES.minGain);
    }
  });

  it('ranks a preferred player above a slightly richer one the user is neutral on', () => {
    const pool = [...roster, makePlayer('liked', 'RB', 68), makePlayer('richer', 'RB', 73)];
    const values = valuesWith(pool, { liked: 6 });
    const ideas = generateOneForOne({
      players: pool,
      roster,
      values,
      settings: DEFAULT_SETTINGS,
      replacement: repl,
    });
    const fromRb1 = ideas.filter((i) => i.send.id === 'rb1').map((i) => i.receive.id);
    expect(fromRb1[0]).toBe('liked');
  });

  it('never trades a QB for a non-QB or vice versa', () => {
    const pool = [...roster, makePlayer('qb-rival', 'QB', 41), makePlayer('rb-even', 'RB', 40)];
    const values = valuesWith(pool, { 'qb-rival': 10, 'rb-even': 15, qb: -10 });
    const ideas = generateOneForOne({
      players: pool,
      roster,
      values,
      settings: DEFAULT_SETTINGS,
      replacement: repl,
    });
    expect(ideas.some((i) => i.send.id === 'qb' && i.receive.id === 'qb-rival')).toBe(true);
    for (const idea of ideas) {
      expect(idea.send.position === 'QB').toBe(idea.receive.position === 'QB');
    }
  });

  it('never proposes trades where the other side overpays by more than the cap', () => {
    const pool = [...roster, makePlayer('steal', 'RB', 77)];
    const ideas = generateOneForOne({
      players: pool,
      roster,
      values: valuesWith(pool, {}),
      settings: DEFAULT_SETTINGS,
      replacement: repl,
    });
    expect(ideas.find((i) => i.receive.id === 'steal' && i.send.id === 'rb1')).toBeUndefined();
  });

  it('suggests nothing when personal values equal consensus and the lineup cannot improve', () => {
    const values = valuesWith(players, {});
    const ideas = generateOneForOne({ players, roster, values, settings: DEFAULT_SETTINGS, replacement: repl });
    expect(ideas.every((i) => i.personalGain >= TRADE_RULES.minGain)).toBe(true);
    expect(ideas.find((i) => i.receive.id === 'wr-even' && i.send.id === 'wr1')).toBeUndefined();
  });
});

describe('selectNextPair', () => {
  it('never pairs players with absurd value gaps', () => {
    const players = makePlayers();
    const random = seededRandom(7);
    for (let i = 0; i < 25; i++) {
      const [a, b] = selectNextPair(players, emptyModel(), new Set(), [], random)!;
      const hi = Math.max(a.market.baseline, b.market.baseline);
      const lo = Math.min(a.market.baseline, b.market.baseline);
      expect(hi - lo).toBeLessThanOrEqual(Math.max(12, 0.25 * hi));
    }
  });

  it('prefers cross-position matchups during calibration', () => {
    const players = makePlayers();
    const random = seededRandom(3);
    let cross = 0;
    for (let i = 0; i < 30; i++) {
      const [a, b] = selectNextPair(players, emptyModel(), new Set(), [], random)!;
      if (a.position !== b.position) cross++;
    }
    expect(cross).toBeGreaterThan(20);
  });
});

describe('findValueGaps', () => {
  it('splits targets (off-roster, above consensus) from sells (on-roster, below)', () => {
    const players = makePlayers(30);
    const values = valuesWith(players, { p5: 5, p6: -5, p7: 4, p8: -4 });
    const { targets, sells } = findValueGaps(players, values, new Set(['p6', 'p7']));
    expect(targets.map((t) => t.player.id)).toEqual(['p5']);
    expect(sells.map((t) => t.player.id)).toEqual(['p6']);
  });
});
