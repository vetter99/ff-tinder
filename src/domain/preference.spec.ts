import { selectNextPair } from './active-learning';
import {
  applyComparison,
  comparisonWeight,
  emptyModel,
  fitModel,
  FRESHNESS,
  latentValue,
  needsRefresh,
  personalValues,
  personalWeight,
  positionLeans,
  preferenceProbability,
} from './preference';
import { findValueGaps } from './targets';
import { makePlayer, makePlayers, seededRandom } from './testing';
import { Comparison, Player, PlayerId } from './types';

describe('preference model', () => {
  const a = makePlayer('a', 'RB', 50);
  const b = makePlayer('b', 'WR', 50);

  it('moves the winner up, the loser down, and shrinks uncertainty', () => {
    const model = emptyModel();
    applyComparison(model, a, b, 1);
    const wa = model.players.get('a')!;
    const wb = model.players.get('b')!;
    expect(wa.mean).toBeGreaterThan(0);
    expect(wb.mean).toBeLessThan(0);
    expect(wa.variance).toBeLessThan(144);
    expect(model.positions.RB.mean).toBeGreaterThan(0);
    expect(preferenceProbability(model, a, b)).toBeGreaterThan(0.5);
  });

  it('with position lean off, only the two compared players move', () => {
    const model = emptyModel(false);
    applyComparison(model, a, b, 1);
    expect(model.positions.RB.mean).toBe(0);
    expect(model.positions.WR.mean).toBe(0);
    expect(model.players.get('a')!.mean).toBeGreaterThan(0);
    const values = personalValues([a, b, makePlayer('other-rb', 'RB', 50)], model);
    expect(values.get('other-rb')!.gap).toBe(0);
  });

  it('does not touch position offsets for same-position comparisons', () => {
    const model = emptyModel();
    applyComparison(model, a, makePlayer('c', 'RB', 50), 1);
    expect(model.positions.RB.mean).toBe(0);
  });

  it('learns almost nothing from an answer that matches a large baseline gap', () => {
    const model = emptyModel();
    applyComparison(model, makePlayer('star', 'WR', 95), makePlayer('scrub', 'WR', 5), 1);
    expect(model.evidence).toBeLessThan(0.05);
    expect(model.players.get('star')!.mean).toBeLessThan(0.5);
  });

  it('replays a log deterministically and skips unknown players', () => {
    const byId = new Map<PlayerId, Player>([['a', a], ['b', b]]);
    const log: Comparison[] = [
      { id: '1', ts: 1, winner: 'a', loser: 'b' },
      { id: '2', ts: 2, winner: 'a', loser: 'gone' },
      { id: '3', ts: 3, winner: 'b', loser: 'a', tie: true },
    ];
    const now = 10;
    const m1 = fitModel(log, byId, { now });
    const m2 = fitModel(log, byId, { now });
    expect(m1.comparisons).toBe(2);
    expect(m1.players.get('a')).toEqual(m2.players.get('a'));
  });

  it('caps personalization and grows it with evidence', () => {
    expect(personalWeight(0)).toBe(0);
    expect(personalWeight(1)).toBeCloseTo(0.1);
    expect(personalWeight(10)).toBeCloseTo(0.25);
    expect(personalWeight(50)).toBeGreaterThan(0.4);
    expect(personalWeight(10_000)).toBeLessThan(0.5);
  });
});

describe('answer freshness', () => {
  const now = Date.UTC(2026, 9, 15);
  const day = 24 * 60 * 60 * 1000;
  const a = makePlayer('a', 'RB', 50);
  const b = makePlayer('b', 'WR', 50);
  const byId = new Map<PlayerId, Player>([['a', a], ['b', b]]);
  const answer = (daysAgo: number, baselines?: [number, number]): Comparison => ({
    id: String(daysAgo),
    ts: now - daysAgo * day,
    winner: 'a',
    loser: 'b',
    baselines,
  });

  it('halves an answer\'s weight every half-life', () => {
    expect(comparisonWeight(answer(0), a, b, now)).toBeCloseTo(1);
    expect(comparisonWeight(answer(FRESHNESS.halfLifeDays), a, b, now)).toBeCloseTo(0.5);
    expect(comparisonWeight(answer(2 * FRESHNESS.halfLifeDays), a, b, now)).toBeCloseTo(0.25);
  });

  it('mostly discounts answers about players whose market value moved a lot since', () => {
    expect(comparisonWeight(answer(0, [52, 48]), a, b, now)).toBeCloseTo(1);
    expect(comparisonWeight(answer(0, [80, 50]), a, b, now)).toBeCloseTo(FRESHNESS.staleWeight);
    // Small absolute wiggles in low-value players don't count as big moves.
    const scrub = makePlayer('s', 'WR', 4);
    expect(comparisonWeight({ ...answer(0, [50, 2]), loser: 's' }, a, scrub, now)).toBeCloseTo(1);
  });

  it('lets old answers count less, so values and confidence drift back toward the market', () => {
    const fresh = fitModel([answer(0)], byId, { now });
    const old = fitModel([answer(63)], byId, { now });
    expect(old.players.get("a")!.mean).toBeLessThan(fresh.players.get("a")!.mean / 3);
    expect(old.evidence).toBeLessThan(fresh.evidence / 4);
    expect(needsRefresh(old.players.get('a'))).toBe(true);
    expect(needsRefresh(fresh.players.get('a'))).toBe(false);
  });
});

describe('simulated user', () => {
  /**
   * A hidden "true" taste: consensus + 10 for every RB + 25 extra for one specific WR.
   * The simulated user answers with Bradley–Terry noise.
   */
  function simulate(
    seed: number,
    swipes: number,
    choose: 'active' | 'random',
    rosterShape: 'near-favorite' | 'spread' = 'near-favorite',
  ) {
    const players = makePlayers();
    const byId = new Map(players.map((p) => [p.id, p]));
    const favorite = players.find((p) => p.position === 'WR' && p.market.overallRank > 25)!;
    const truth = (p: Player) =>
      p.market.baseline + (p.position === 'RB' ? 10 : 0) + (p.id === favorite.id ? 25 : 0);
    // Either a roster clustered near the favorite's value (so the favorite is roster-relevant)
    // or a realistic roster spread across tiers.
    const roster = new Set(
      (rosterShape === 'spread'
        ? players.filter((_, i) => i % 12 === 5).slice(0, 15)
        : players.filter(
            (p) =>
              Math.abs(p.market.overallRank - favorite.market.overallRank) <= 6 &&
              p.id !== favorite.id,
          )
      ).map((p) => p.id),
    );

    const random = seededRandom(seed);
    const log: Comparison[] = [];
    let model = fitModel(log, byId);
    for (let i = 0; i < swipes; i++) {
      let pair: [Player, Player] | null;
      if (choose === 'active') {
        pair = selectNextPair(players, model, roster, log, random);
      } else {
        const x = players[Math.floor(random() * 120)];
        const y = players[Math.floor(random() * 120)];
        // Same rule as the app: QBs are only compared with QBs.
        const mixedQb = (x.position === 'QB') !== (y.position === 'QB');
        pair = x.id === y.id || mixedQb ? null : [x, y];
      }
      if (!pair) continue;
      const [x, y] = pair;
      const pX = 1 / (1 + Math.exp(-(truth(x) - truth(y)) / 8));
      const xWins = random() < pX;
      log.push({ id: String(i), ts: Date.now(), winner: xWins ? x.id : y.id, loser: xWins ? y.id : x.id });
      model = fitModel(log, byId);
    }
    const values = personalValues(players, model);
    return { players, model, values, favorite, roster, truth };
  }

  it('learns the RB lean within ~20 swipes', () => {
    const { model } = simulate(1, 20, 'active');
    const leans = positionLeans(model);
    expect(leans.RB).toBeGreaterThan(leans.WR);
    expect(leans.RB).toBeGreaterThan(0.5);
  });

  // A single-player preference needs a few exposures to separate from noise; with the current
  // settings this holds in ~7/10 runs at 60 swipes.
  it('surfaces the hidden favorite as a top trade target after 60 swipes', () => {
    let hits = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const { players, values, favorite, roster } = simulate(seed, 60, 'active');
      const { targets } = findValueGaps(players, values, roster);
      const wrTargets = targets.filter((t) => t.player.position === 'WR');
      if (wrTargets.slice(0, 3).some((t) => t.player.id === favorite.id)) hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(6);
  });

  it('active selection learns more per swipe than random matchups', () => {
    // Mean absolute error of the unblended estimate, centered: only relative values matter.
    const errorOf = (r: ReturnType<typeof simulate>) => {
      const top = r.players.slice(0, 80);
      const diffs = top.map((p) => latentValue(r.model, p) - r.truth(p));
      const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
      return diffs.reduce((s, d) => s + Math.abs(d - mean), 0) / diffs.length;
    };
    let active = 0;
    let random = 0;
    for (let seed = 1; seed <= 12; seed++) {
      active += errorOf(simulate(seed, 30, 'active', 'spread'));
      random += errorOf(simulate(seed, 30, 'random', 'spread'));
    }
    expect(active).toBeLessThan(random * 0.85);
  });
});
