import { PersonalValue } from './preference';
import { signed } from './targets';
import { vetoKey } from './trades';
import { Player, PlayerId } from './types';

/**
 * Multi-player trades with one team: 1-for-1, 2-for-2, consolidating (2-for-1, 3-for-2) and
 * spreading out (1-for-2, 2-for-3), built from both teams' actual rosters.
 *
 * Package value isn't a plain sum: two average players are worth less than one star, because only
 * so many can start. Each side is valued as (Σ vᵏ)^(1/k), which equals v for a single player and
 * discounts depth (two 30s ≈ 49 at k = 1.4). Market and personal values use the same formula, so a
 * 1-for-1 scores exactly as it does in the Trade ideas list.
 */
export const PACKAGE_RULES = {
  valueExponent: 1.4,
  /** Market window, as for 1-for-1 ideas. */
  maxOverpayShare: 0.12,
  maxWinShare: 0.05,
  marketFloor: 1,
  minEdge: 1,
  /** Every player in a package must be worth this share of the best player in it (no filler)… */
  minPieceShare: 0.25,
  /** …and at least this many baseline points. */
  minPieceBaseline: 3,
  /** Only each team's most valuable players are combined, which keeps the search fast. */
  sidePool: 16,
  /** Ideas kept per shape group, and how often one player may appear within a group. */
  perGroup: 4,
  maxAppearances: 2,
};

/** [players you send, players you receive], smallest deals first so sub-deals are scored first. */
const SHAPES: readonly [number, number][] = [
  [1, 1],
  [2, 1],
  [1, 2],
  [2, 2],
  [3, 2],
  [2, 3],
];

export type PackageGroup = 'one-for-one' | 'two-for-two' | 'consolidate' | 'spread';

export interface TradePackage {
  send: Player[];
  receive: Player[];
  group: PackageGroup;
  /** Personal package value received minus sent. */
  personalGain: number;
  /** Market package value received minus sent (positive = you get more by consensus). */
  marketDelta: number;
  marketDeltaShare: number;
  /** How much more than consensus you prefer what you receive over what you send. */
  edge: number;
  score: number;
  reasons: string[];
}

export interface PackageContext {
  roster: readonly Player[];
  /** The other team's players. */
  theirs: readonly Player[];
  values: ReadonlyMap<PlayerId, PersonalValue>;
  requirePlayerEvidence?: boolean;
  /** "I would never" trades ("send>receive"); packages headlined by one are hidden. */
  vetoed?: ReadonlySet<string>;
}

/** (Σ vᵏ)^(1/k): a package's value in baseline points, discounting depth. */
export function packageValue(values: readonly number[], k = PACKAGE_RULES.valueExponent): number {
  const total = values.reduce((sum, v) => sum + Math.max(0, v) ** k, 0);
  return total ** (1 / k);
}

/** The best few packages in each shape group (each group picked on its own), best first. */
export function findPackages(ctx: PackageContext, rules = PACKAGE_RULES): TradePackage[] {
  const vetoed = ctx.vetoed ?? new Set<string>();
  const all = allPackages(ctx, rules).filter((pkg) => {
    const [send, receive] = headline(pkg);
    return !vetoed.has(vetoKey(send.id, receive.id));
  });
  const appearances = new Map<string, number>(); // "group:playerId"
  const perGroup = new Map<PackageGroup, number>();
  const picked: TradePackage[] = [];
  for (const pkg of all) {
    if ((perGroup.get(pkg.group) ?? 0) >= rules.perGroup) continue;
    const keys = [...pkg.send, ...pkg.receive].map((p) => `${pkg.group}:${p.id}`);
    if (keys.some((k) => (appearances.get(k) ?? 0) >= rules.maxAppearances)) continue;
    for (const k of keys) appearances.set(k, (appearances.get(k) ?? 0) + 1);
    perGroup.set(pkg.group, (perGroup.get(pkg.group) ?? 0) + 1);
    picked.push(pkg);
  }
  return picked;
}

/** Every acceptable package, best first. */
export function allPackages(ctx: PackageContext, rules = PACKAGE_RULES): TradePackage[] {
  const { values, requirePlayerEvidence = false } = ctx;
  const usable = (players: readonly Player[]) =>
    players
      .filter((p) => p.market.baseline >= rules.minPieceBaseline && values.has(p.id))
      .sort((a, b) => b.market.baseline - a.market.baseline)
      .slice(0, rules.sidePool);
  const mine = usable(ctx.roster);
  const mineIds = new Set(mine.map((p) => p.id));
  const theirs = usable(ctx.theirs).filter((p) => !mineIds.has(p.id));

  const personal = (p: Player) => values.get(p.id)!.value;
  const gap = (p: Player) => values.get(p.id)!.gap;
  const compared = (p: Player) => (values.get(p.id)?.comparisons ?? 0) > 0;
  const k = rules.valueExponent;

  const scores = new Map<string, number>(); // acceptable deals by key, to drop padded bigger ones
  const packages: TradePackage[] = [];
  for (const [nSend, nReceive] of SHAPES) {
    for (const send of combinations(mine, nSend)) {
      for (const receive of combinations(theirs, nReceive)) {
        // If a QB is involved, both sides need one.
        if (send.some(isQb) !== receive.some(isQb)) continue;
        const pieces = [...send, ...receive];
        const top = Math.max(...pieces.map((p) => p.market.baseline));
        if (pieces.some((p) => p.market.baseline < rules.minPieceShare * top)) continue;
        if (requirePlayerEvidence && !pieces.some(compared)) continue;

        const marketOut = packageValue(send.map((p) => p.market.baseline), k);
        const marketIn = packageValue(receive.map((p) => p.market.baseline), k);
        const delta = marketIn - marketOut;
        const larger = Math.max(marketIn, marketOut);
        if (delta > Math.max(rules.marketFloor, rules.maxWinShare * larger)) continue;
        if (-delta > Math.max(rules.marketFloor, rules.maxOverpayShare * larger)) continue;

        const personalGain = packageValue(receive.map(personal), k) - packageValue(send.map(personal), k);
        const edge = personalGain - delta;
        if (edge < rules.minEdge || personalGain <= 0) continue;
        const score = edge + Math.min(0, delta);

        // A bigger deal must beat every smaller deal inside it; otherwise just make that one.
        const bestSmaller = Math.max(
          -Infinity,
          ...subsets(send).flatMap((s) =>
            subsets(receive)
              .filter((r) => s.length + r.length < nSend + nReceive)
              .map((r) => scores.get(dealKey(s, r)) ?? -Infinity),
          ),
        );
        if (bestSmaller >= score) continue;
        scores.set(dealKey(send, receive), score);

        packages.push({
          send,
          receive,
          group: groupOf(nSend, nReceive),
          personalGain,
          marketDelta: delta,
          marketDeltaShare: delta / larger,
          edge,
          score,
          reasons: explain(send, receive, gap, delta / larger),
        });
      }
    }
  }
  return packages.sort((a, b) => b.score - a.score);
}

/** The players that define a package, for "I would never" and hiding it: each side's best. */
export function headline(pkg: { send: readonly Player[]; receive: readonly Player[] }): [Player, Player] {
  const best = (ps: readonly Player[]) => ps.reduce((a, b) => (b.market.baseline > a.market.baseline ? b : a));
  return [best(pkg.send), best(pkg.receive)];
}

function groupOf(nSend: number, nReceive: number): PackageGroup {
  if (nSend === nReceive) return nSend === 1 ? 'one-for-one' : 'two-for-two';
  return nSend > nReceive ? 'consolidate' : 'spread';
}

function explain(
  send: Player[],
  receive: Player[],
  gap: (p: Player) => number,
  marketShare: number,
): string[] {
  const reasons: string[] = [];
  for (const p of receive) if (gap(p) >= 0.5) reasons.push(`You value ${p.name} ${signed(gap(p))} above consensus.`);
  for (const p of send) if (gap(p) <= -0.5) reasons.push(`You value ${p.name} ${signed(gap(p))} below consensus.`);
  if (send.length > receive.length) reasons.push('Consolidating: fewer players back, freeing roster spots.');
  if (send.length < receive.length) reasons.push('Adds depth: more players back than you send.');
  if (reasons.length === 0) reasons.push('You prefer what you receive by more than consensus does.');
  const pct = Math.round(Math.abs(marketShare) * 100);
  reasons.push(
    pct <= 2
      ? 'Market values are essentially even.'
      : `By consensus you ${marketShare > 0 ? 'gain' : 'give up'} about ${pct}% in market value.`,
  );
  return reasons;
}

function isQb(p: Player): boolean {
  return p.position === 'QB';
}

function dealKey(send: readonly Player[], receive: readonly Player[]): string {
  return `${send.map((p) => p.id).join('+')}>${receive.map((p) => p.id).join('+')}`;
}

/** Every non-empty subset, keeping order (so keys match how combinations are built). */
function subsets<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let mask = 1; mask < 1 << items.length; mask++) out.push(items.filter((_, i) => mask & (1 << i)));
  return out;
}

/** All size-n subsets of `items`, in order. */
function combinations<T>(items: readonly T[], n: number): T[][] {
  if (n === 1) return items.map((x) => [x]);
  const out: T[][] = [];
  const pick = (start: number, acc: T[]) => {
    if (acc.length === n) {
      out.push(acc);
      return;
    }
    for (let i = start; i <= items.length - (n - acc.length); i++) pick(i + 1, [...acc, items[i]]);
  };
  pick(0, []);
  return out;
}
