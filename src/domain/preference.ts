import { Comparison, Player, PlayerId, POSITIONS, Position } from './types';

/**
 * Personal preference model: Bradley–Terry with the market baseline as the prior.
 *
 *   u_i = baseline_i + positionOffset(pos_i) + playerOffset_i
 *   P(i preferred over j) = sigmoid((u_i - u_j) / SCALE)
 *
 * Offsets start at 0 with Gaussian uncertainty and are updated one comparison at a time with a
 * Laplace (extended-Kalman) step, so every offset carries a mean and a variance. Position offsets
 * let a single "RB over WR" answer nudge every RB, which is what makes ~10 swipes useful.
 */
export const MODEL = {
  /** Baseline points that move the pick probability from 50% to ~73%. */
  scale: 8,
  playerPriorSd: 12,
  positionPriorSd: 6,
  /** Variances never shrink below this share of the prior, so tastes can keep drifting. */
  minVarianceShare: 0.05,
  /** Personal weight approaches this cap as evidence accumulates. */
  maxPersonalWeight: 0.5,
  minPersonalWeight: 0.1,
  /** Informative comparisons at which the personal weight reaches half of its cap. */
  halfWeightEvidence: 10,
};

/**
 * How answers lose influence over time. Values change week to week (injuries, trades, roles),
 * so old answers fade and answers about players whose market value has since moved a lot are
 * mostly discounted.
 */
export const FRESHNESS = {
  /** An answer's weight halves every this many days. */
  halfLifeDays: 21,
  /** A player whose market value moved more than this share since the answer makes it stale… */
  staleMoveShare: 0.25,
  /** …and a stale answer keeps only this much of its weight. */
  staleWeight: 0.2,
  /** Relative moves are measured against at least this baseline, so low-value noise is ignored. */
  minBaselineForMove: 10,
  /** A player "needs a refresh" when their answers' average weight falls below this. */
  refreshBelow: 0.5,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Weight of a past answer today: time decay × stale-move discount. */
export function comparisonWeight(
  c: Comparison,
  winner: Player,
  loser: Player,
  now: number,
): number {
  const ageDays = Math.max(0, (now - c.ts) / DAY_MS);
  let weight = 0.5 ** (ageDays / FRESHNESS.halfLifeDays);
  if (c.baselines) {
    const moved = (then: number, current: number) =>
      Math.abs(current - then) / Math.max(then, FRESHNESS.minBaselineForMove) >
      FRESHNESS.staleMoveShare;
    if (moved(c.baselines[0], winner.market.baseline) || moved(c.baselines[1], loser.market.baseline)) {
      weight *= FRESHNESS.staleWeight;
    }
  }
  return weight;
}

export interface Belief {
  mean: number;
  variance: number;
}

export interface PlayerBelief extends Belief {
  comparisons: number;
  /** Sum of the current weights of this player's answers (≤ comparisons). */
  weightedComparisons: number;
}

export interface PreferenceModel {
  /** When false, position offsets are neither learned nor applied. */
  positionLean: boolean;
  players: Map<PlayerId, PlayerBelief>;
  positions: Record<Position, Belief>;
  /**
   * Effective number of informative comparisons: Σ weight·4·p·(1−p), so obvious answers and
   * old or stale answers count for little.
   */
  evidence: number;
  comparisons: number;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const playerPrior = () => MODEL.playerPriorSd ** 2;
const positionPrior = () => MODEL.positionPriorSd ** 2;

export function emptyModel(positionLean = true): PreferenceModel {
  const positions = {} as Record<Position, Belief>;
  for (const pos of POSITIONS) positions[pos] = { mean: 0, variance: positionPrior() };
  return { positionLean, players: new Map(), positions, evidence: 0, comparisons: 0 };
}

function playerBelief(model: PreferenceModel, id: PlayerId): PlayerBelief {
  let b = model.players.get(id);
  if (!b) {
    b = { mean: 0, variance: playerPrior(), comparisons: 0, weightedComparisons: 0 };
    model.players.set(id, b);
  }
  return b;
}

/** The model's full (unblended) estimate of how the user values a player. */
export function latentValue(model: PreferenceModel, p: Player): number {
  return p.market.baseline + model.positions[p.position].mean + (model.players.get(p.id)?.mean ?? 0);
}

/** Variance of (u_a − u_b). Shared position offsets cancel when both players play the same position. */
function differenceVariance(model: PreferenceModel, a: Player, b: Player): number {
  const va = model.players.get(a.id)?.variance ?? playerPrior();
  const vb = model.players.get(b.id)?.variance ?? playerPrior();
  const positional =
    !model.positionLean || a.position === b.position
      ? 0
      : model.positions[a.position].variance + model.positions[b.position].variance;
  return va + vb + positional;
}

/** Probability the user prefers `a` over `b`, accounting for model uncertainty. */
export function preferenceProbability(model: PreferenceModel, a: Player, b: Player): number {
  const s = MODEL.scale;
  const v = differenceVariance(model, a, b);
  const z = (latentValue(model, a) - latentValue(model, b)) / s;
  return sigmoid(z / Math.sqrt(1 + (Math.PI * v) / (8 * s * s)));
}

/**
 * Applies one comparison in place. `outcome` is 1 if `winner` was picked, 0.5 for a tie.
 * `weight` (0–1) scales how much the answer counts; see {@link comparisonWeight}.
 */
export function applyComparison(
  model: PreferenceModel,
  winner: Player,
  loser: Player,
  outcome: 1 | 0.5,
  weight = 1,
): void {
  const s = MODEL.scale;
  const p = preferenceProbability(model, winner, loser);
  const v = differenceVariance(model, winner, loser);
  const gradient = (weight * (outcome - p)) / s;
  const curvature = (weight * p * (1 - p)) / (s * s);
  const denom = 1 + v * curvature;

  const step = (b: Belief, sign: 1 | -1, prior: number) => {
    const varBefore = b.variance;
    b.mean += (sign * varBefore * gradient) / denom;
    b.variance = Math.max(
      varBefore * (1 - (varBefore * curvature) / denom),
      prior * MODEL.minVarianceShare,
    );
  };

  const w = playerBelief(model, winner.id);
  const l = playerBelief(model, loser.id);
  step(w, 1, playerPrior());
  step(l, -1, playerPrior());
  for (const b of [w, l]) {
    b.comparisons++;
    b.weightedComparisons += weight;
  }
  if (model.positionLean && winner.position !== loser.position) {
    step(model.positions[winner.position], 1, positionPrior());
    step(model.positions[loser.position], -1, positionPrior());
  }
  model.evidence += weight * 4 * p * (1 - p);
  model.comparisons++;
}

/**
 * Rebuilds the model by replaying the comparison log against current baselines, weighting each
 * answer by its age and by how much the players' market values have moved since. Comparisons that
 * reference players no longer in the dataset are skipped.
 */
export function fitModel(
  comparisons: readonly Comparison[],
  playersById: ReadonlyMap<PlayerId, Player>,
  { positionLean = true, now = Date.now() } = {},
): PreferenceModel {
  const model = emptyModel(positionLean);
  for (const c of comparisons) {
    const winner = playersById.get(c.winner);
    const loser = playersById.get(c.loser);
    if (!winner || !loser) continue;
    applyComparison(model, winner, loser, c.tie ? 0.5 : 1, comparisonWeight(c, winner, loser, now));
  }
  return model;
}

/** Whether a compared player's answers have faded enough that it's worth asking about them again. */
export function needsRefresh(belief: PlayerBelief | undefined): boolean {
  return (
    !!belief &&
    belief.comparisons > 0 &&
    belief.weightedComparisons / belief.comparisons < FRESHNESS.refreshBelow
  );
}

/** Share of a player's value that comes from the personal model (the rest is market baseline). */
export function personalWeight(evidence: number): number {
  if (evidence <= 0) return 0;
  const w = (MODEL.maxPersonalWeight * evidence) / (evidence + MODEL.halfWeightEvidence);
  return Math.max(MODEL.minPersonalWeight, w);
}

export interface PersonalValue {
  baseline: number;
  /** Blended value: baseline + weight × (positionOffset + playerOffset). */
  value: number;
  /** value − baseline. */
  gap: number;
  /** Part of the gap from player-specific answers. */
  playerPart: number;
  /** Part of the gap from the user's lean on this position. */
  positionPart: number;
  /** 0–1: how far player-specific uncertainty has shrunk from the prior. */
  confidence: number;
  comparisons: number;
}

export function personalValues(
  players: readonly Player[],
  model: PreferenceModel,
): Map<PlayerId, PersonalValue> {
  const w = personalWeight(model.evidence);
  const out = new Map<PlayerId, PersonalValue>();
  for (const p of players) {
    const belief = model.players.get(p.id);
    const playerPart = w * (belief?.mean ?? 0);
    const positionPart = w * model.positions[p.position].mean;
    const baseline = p.market.baseline;
    out.set(p.id, {
      baseline,
      value: baseline + playerPart + positionPart,
      gap: playerPart + positionPart,
      playerPart,
      positionPart,
      confidence: belief ? 1 - belief.variance / playerPrior() : 0,
      comparisons: belief?.comparisons ?? 0,
    });
  }
  return out;
}

/** Position leans in blended baseline points (what the user sees). */
export function positionLeans(model: PreferenceModel): Record<Position, number> {
  const w = personalWeight(model.evidence);
  const leans = {} as Record<Position, number>;
  for (const pos of POSITIONS) leans[pos] = w * model.positions[pos].mean;
  return leans;
}
