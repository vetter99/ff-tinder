import { MODEL, PreferenceModel, preferenceProbability } from './preference';
import { Comparison, Player, PlayerId } from './types';

/** Comparisons shown before trade ideas are considered meaningful. */
export const CALIBRATION_COMPARISONS = 10;

export const SELECTION = {
  /** Only consider the most valuable players (plus the roster) for matchups. */
  poolSize: 150,
  /** Never pair players further apart than max(minBand, bandShare × the larger baseline). */
  minBand: 12,
  bandShare: 0.25,
  crossPositionBonus: 0.5,
  calibrationCrossPositionBonus: 2,
  /** Players within this many baseline points of a roster player are "roster relevant". */
  rosterRelevanceBand: 15,
  rosterBonus: 0.5,
  /** Players seen in this many recent comparisons are down-weighted. */
  recentWindow: 6,
  recentPenalty: 0.3,
  /** Re-test players whose estimated offset is large: confirms or refutes a surprising answer. */
  confirmBonus: 0.75,
  repeatPairPenalty: 0.05,
  /** Down-weights matchups between low-value players: score × (baseline/100)^exponent. */
  importanceExponent: 0.35,
  /** At least one QB-vs-QB matchup in every this many. */
  qbEvery: 8,
  /** Sample from the best N pairs so the sequence doesn't feel scripted. */
  topK: 10,
  temperature: 0.15,
};

export interface ScoredPair {
  a: Player;
  b: Player;
  score: number;
}

const pairKey = (a: PlayerId, b: PlayerId) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Scores every plausible pair by how much its answer is expected to teach the model:
 * outcome uncertainty × parameter uncertainty, boosted for cross-position and roster-relevant pairs.
 */
export function scorePairs(
  players: readonly Player[],
  model: PreferenceModel,
  rosterIds: ReadonlySet<PlayerId>,
  history: readonly Comparison[],
): ScoredPair[] {
  const pool = players
    .filter((p, i) => (i < SELECTION.poolSize || rosterIds.has(p.id)) && p.market.baseline > 1)
    .sort((x, y) => x.market.baseline - y.market.baseline);

  const rosterBaselines = players
    .filter((p) => rosterIds.has(p.id))
    .map((p) => p.market.baseline);
  const relevant = (p: Player) =>
    rosterIds.has(p.id) ||
    rosterBaselines.some((b) => Math.abs(b - p.market.baseline) <= SELECTION.rosterRelevanceBand);

  const recent = new Set(history.slice(-SELECTION.recentWindow).flatMap((c) => [c.winner, c.loser]));
  const asked = new Set(history.map((c) => pairKey(c.winner, c.loser)));
  const calibrating = history.length < CALIBRATION_COMPARISONS;
  const crossBonus = calibrating
    ? SELECTION.calibrationCrossPositionBonus
    : SELECTION.crossPositionBonus;
  const priorVar = MODEL.playerPriorSd ** 2;
  const variance = (p: Player) => model.players.get(p.id)?.variance ?? priorVar;
  const surprise = (p: Player) =>
    1 + SELECTION.confirmBonus * Math.min(1, Math.abs(model.players.get(p.id)?.mean ?? 0) / MODEL.playerPriorSd);

  const pairs: ScoredPair[] = [];
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i];
    for (let j = i + 1; j < pool.length; j++) {
      const b = pool[j];
      const band = Math.max(SELECTION.minBand, SELECTION.bandShare * b.market.baseline);
      if (b.market.baseline - a.market.baseline > band) break; // pool is sorted ascending
      // QBs are only ever compared with QBs, matching the trade rule.
      if ((a.position === 'QB') !== (b.position === 'QB')) continue;

      const p = preferenceProbability(model, a, b);
      let score = p * (1 - p) * ((variance(a) + variance(b)) / (2 * priorVar));
      // Matchups between low-value players look maximally uncertain but barely matter for trades.
      score *= (b.market.baseline / 100) ** SELECTION.importanceExponent;
      score *= surprise(a) * surprise(b);
      // QB-vs-QB is the only way to learn about QBs, so it gets the same boost as cross-position.
      if (a.position !== b.position || a.position === 'QB') score *= 1 + crossBonus;
      if (relevant(a) || relevant(b)) score *= 1 + SELECTION.rosterBonus;
      if (recent.has(a.id)) score *= SELECTION.recentPenalty;
      if (recent.has(b.id)) score *= SELECTION.recentPenalty;
      if (asked.has(pairKey(a.id, b.id))) score *= SELECTION.repeatPairPenalty;
      pairs.push({ a, b, score });
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}

/** Picks the next matchup: softmax sample over the top-scoring pairs. Sides are randomized. */
export function selectNextPair(
  players: readonly Player[],
  model: PreferenceModel,
  rosterIds: ReadonlySet<PlayerId>,
  history: readonly Comparison[],
  random: () => number = Math.random,
): [Player, Player] | null {
  let pairs = scorePairs(players, model, rosterIds, history);
  // QBs can only be compared with each other and are worth less than top RBs/WRs in 1QB formats,
  // so without a quota they would never come up.
  const qbIds = new Set(players.filter((p) => p.position === 'QB').map((p) => p.id));
  const recent = history.slice(-(SELECTION.qbEvery - 1));
  if (recent.length === SELECTION.qbEvery - 1 && !recent.some((c) => qbIds.has(c.winner))) {
    const qbPairs = pairs.filter((p) => p.a.position === 'QB');
    if (qbPairs.length > 0) pairs = qbPairs;
  }
  const top = pairs.slice(0, SELECTION.topK);
  if (top.length === 0) return null;

  const best = top[0].score;
  const weights = top.map((p) => Math.exp((p.score / best - 1) / SELECTION.temperature));
  let r = random() * weights.reduce((s, w) => s + w, 0);
  let chosen = top[top.length - 1];
  for (let i = 0; i < top.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      chosen = top[i];
      break;
    }
  }
  return random() < 0.5 ? [chosen.a, chosen.b] : [chosen.b, chosen.a];
}
