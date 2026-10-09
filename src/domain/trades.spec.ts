import { selectNextPair } from './active-learning';
import { emptyModel, fitModel, personalValues, PersonalValue } from './preference';
import { findValueGaps } from './targets';
import { makePlayer, makePlayers, seededRandom } from './testing';
import { generateOneForOne, TRADE_RULES } from './trades';
import { Comparison, Player, PlayerId } from './types';

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
  ];
  const market = [
    makePlayer('breece', 'RB', 70),
    makePlayer('lopsided', 'RB', 95),
    makePlayer('wr-even', 'WR', 71),
  ];
  const players = [...roster, ...market];
  const ideasFor = (pool: Player[], gaps: Record<PlayerId, number>) =>
    generateOneForOne({ players: pool, roster, values: valuesWith(pool, gaps) });

  it('proposes trades toward players the user likes, within the market window', () => {
    const ideas = ideasFor(players, { breece: 12, wr1: -6, lopsided: 30 });
    expect(ideas[0].receive.id).toBe('breece');
    expect(ideas.some((i) => i.receive.id === 'lopsided')).toBe(false);
    for (const idea of ideas) {
      expect(idea.marketDeltaShare).toBeLessThanOrEqual(TRADE_RULES.maxWinShare);
      expect(idea.marketDeltaShare).toBeGreaterThanOrEqual(-TRADE_RULES.maxOverpayShare);
    }
  });

  it('suggests nothing when the user agrees with consensus on everyone', () => {
    expect(ideasFor(players, {})).toEqual([]);
  });

  it('ignores lineup needs: a position the roster lacks is not a reason to trade', () => {
    // No TE upgrade is wanted by preference, so even a thin TE spot produces no idea.
    const pool = [...players, makePlayer('te-upgrade', 'TE', 74)];
    expect(ideasFor(pool, {}).some((i) => i.receive.id === 'te-upgrade')).toBe(false);
  });

  it('ranks a preferred player above a slightly richer one the user is neutral on', () => {
    const pool = [...roster, makePlayer('liked', 'RB', 68), makePlayer('richer', 'RB', 73)];
    const fromRb1 = ideasFor(pool, { liked: 6 })
      .filter((i) => i.send.id === 'rb1')
      .map((i) => i.receive.id);
    expect(fromRb1).toEqual(['liked']);
  });

  it('never trades a QB for a non-QB or vice versa', () => {
    const pool = [...roster, makePlayer('qb-rival', 'QB', 41), makePlayer('rb-even', 'RB', 40)];
    const ideas = ideasFor(pool, { 'qb-rival': 10, 'rb-even': 15, qb: -10 });
    expect(ideas.some((i) => i.send.id === 'qb' && i.receive.id === 'qb-rival')).toBe(true);
    for (const idea of ideas) {
      expect(idea.send.position === 'QB').toBe(idea.receive.position === 'QB');
    }
  });

  it('can require that at least one side was directly compared', () => {
    const values = valuesWith(players, { breece: 12 }); // e.g. a position lean, no direct answers
    const loose = generateOneForOne({ players, roster, values });
    const strict = generateOneForOne({ players, roster, values, requirePlayerEvidence: true });
    expect(loose.length).toBeGreaterThan(0);
    expect(strict).toEqual([]);

    values.set('breece', { ...values.get('breece')!, comparisons: 2 });
    expect(generateOneForOne({ players, roster, values, requirePlayerEvidence: true })[0].receive.id).toBe('breece');
  });

  it('never proposes trades where the other side overpays by more than the cap', () => {
    const pool = [...roster, makePlayer('steal', 'RB', 77)];
    expect(ideasFor(pool, { steal: 10 }).find((i) => i.receive.id === 'steal' && i.send.id === 'rb1')).toBeUndefined();
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

  it('only pairs QBs with QBs, and still asks about QBs', () => {
    const players = makePlayers();
    const byId = new Map(players.map((p) => [p.id, p]));
    const random = seededRandom(5);
    const log: Comparison[] = [];
    let qbPairs = 0;
    for (let i = 0; i < 60; i++) {
      const [a, b] = selectNextPair(players, fitModel(log, byId), new Set(), log, random)!;
      expect(a.position === 'QB').toBe(b.position === 'QB');
      // Without a roster, matchups should stay among players who matter.
      expect(Math.max(a.market.overallRank, b.market.overallRank)).toBeLessThanOrEqual(100);
      if (a.position === 'QB') qbPairs++;
      log.push({ id: String(i), ts: i, winner: a.id, loser: b.id });
    }
    expect(qbPairs).toBeGreaterThanOrEqual(60 / 8 - 1);
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
