import { PersonalValue } from './preference';
import { ValueGap } from './targets';
import { Comparison, Player, PlayerId } from './types';

export const TRADE_RULES = {
  /** The user may overpay by up to this share of the larger side's market value… */
  maxOverpayShare: 0.12,
  /** …but may only receive this much more, or the other manager would plausibly refuse. */
  maxWinShare: 0.05,
  /** Absolute slack for low-value players, in baseline points. */
  marketFloor: 1,
  /** Minimum preference edge: how much more than the market the user prefers the incoming side. */
  minEdge: 1,
  maxPerIncoming: 2,
  maxPerOutgoing: 4,
  limit: 25,
};

export interface TradeIdea {
  send: Player;
  receive: Player;
  /** Personal value received minus sent. */
  personalGain: number;
  /** Market value received minus sent (positive = user gets more by market value). */
  marketDelta: number;
  marketDeltaShare: number;
  score: number;
  /** One plain line explaining the deal. */
  summary: string;
}

export interface TradeContext {
  players: readonly Player[];
  roster: readonly Player[];
  values: ReadonlyMap<PlayerId, PersonalValue>;
  /** Only suggest trades where the user has compared at least one of the two players. */
  requirePlayerEvidence?: boolean;
}

/**
 * Roster-agnostic 1-for-1 trades: swap a player for one the user values more than consensus does,
 * relative to what they give up. Lineup needs are deliberately ignored; only player values matter.
 *
 * The trade must sit in a market window the other manager would plausibly accept: the user may
 * overpay a little by consensus, but never takes much more than they give. Ideas are ranked by
 * preference edge (gap received − gap sent), minus any market value the user overpays.
 */
export function generateOneForOne(ctx: TradeContext, rules = TRADE_RULES): TradeIdea[] {
  return pickDiverse(allOneForOneIdeas(ctx, rules), rules);
}

/** Every acceptable 1-for-1, best first, before limiting how often each player appears. */
export function allOneForOneIdeas(ctx: TradeContext, rules = TRADE_RULES): TradeIdea[] {
  const { players, roster, values, requirePlayerEvidence = false } = ctx;
  const gap = (p: Player) => values.get(p.id)?.gap ?? 0;
  const compared = (p: Player) => (values.get(p.id)?.comparisons ?? 0) > 0;
  const rosterIds = new Set(roster.map((p) => p.id));
  const candidates = players.filter((p) => !rosterIds.has(p.id));

  const ideas: TradeIdea[] = [];
  for (const send of roster) {
    const ms = send.market.baseline;
    for (const receive of candidates) {
      // QBs are only ever traded for QBs.
      if ((send.position === 'QB') !== (receive.position === 'QB')) continue;
      if (requirePlayerEvidence && !compared(send) && !compared(receive)) continue;
      const mr = receive.market.baseline;
      const delta = mr - ms;
      const larger = Math.max(ms, mr);
      if (larger < rules.marketFloor) continue;
      if (delta > Math.max(rules.marketFloor, rules.maxWinShare * larger)) continue;
      if (-delta > Math.max(rules.marketFloor, rules.maxOverpayShare * larger)) continue;

      const edge = gap(receive) - gap(send);
      if (edge < rules.minEdge) continue;
      const personalGain = delta + edge;
      if (personalGain <= 0) continue;

      ideas.push({
        send,
        receive,
        personalGain,
        marketDelta: delta,
        marketDeltaShare: delta / larger,
        // Market value the other side gives away isn't a reason to rank a trade higher.
        score: edge + Math.min(0, delta),
        summary: tradeSummary([send], [receive], gap, delta / larger),
      });
    }
  }

  return ideas.sort((a, b) => b.score - a.score);
}

/** Key for a vetoed trade: the user would never send `send` for `receive`. */
export function vetoKey(send: PlayerId, receive: PlayerId): string {
  return `${send}>${receive}`;
}

/** The trades the user said they would never make, from the comparison log. */
export function vetoedTrades(comparisons: readonly Comparison[]): Set<string> {
  return new Set(comparisons.filter((c) => c.veto).map((c) => vetoKey(c.winner, c.loser)));
}

/** Keeps the list varied: each player appears a limited number of times. */
export function pickDiverse(ideas: readonly TradeIdea[], rules = TRADE_RULES): TradeIdea[] {
  const perIncoming = new Map<PlayerId, number>();
  const perOutgoing = new Map<PlayerId, number>();
  const picked: TradeIdea[] = [];
  for (const idea of ideas) {
    const inCount = perIncoming.get(idea.receive.id) ?? 0;
    const outCount = perOutgoing.get(idea.send.id) ?? 0;
    if (inCount >= rules.maxPerIncoming || outCount >= rules.maxPerOutgoing) continue;
    perIncoming.set(idea.receive.id, inCount + 1);
    perOutgoing.set(idea.send.id, outCount + 1);
    picked.push(idea);
    if (picked.length >= rules.limit) break;
  }
  return picked;
}

/**
 * One plain line for a trade card, e.g. "You're higher on Kyren Williams than the market · even
 * price": the player who most drives the deal, then the price by market value.
 */
export function tradeSummary(
  send: readonly Player[],
  receive: readonly Player[],
  gap: (p: Player) => number,
  marketShare: number,
): string {
  const liked = [...receive].sort((a, b) => gap(b) - gap(a))[0];
  const disliked = [...send].sort((a, b) => gap(a) - gap(b))[0];
  const why =
    liked && gap(liked) >= 0.5 && gap(liked) >= -gap(disliked)
      ? `You're higher on ${liked.name} than the market`
      : disliked && gap(disliked) <= -0.5
        ? `You're lower on ${disliked.name} than the market`
        : 'You like this side more than the market does';
  return `${why} · ${priceLabel(marketShare)}`;
}

/** The price of a deal by market value: "even price", "you pay 7% more", "you get 4% more value". */
export function priceLabel(marketShare: number): string {
  const pct = Math.round(Math.abs(marketShare) * 100);
  return pct <= 2 ? 'even price' : marketShare > 0 ? `you get ${pct}% more value` : `you pay ${pct}% more`;
}

export interface RankedTarget extends ValueGap {
  /** The best fair 1-for-1 the user could offer from their roster, if any. */
  bestOffer: TradeIdea | null;
}

/**
 * Orders trade targets by how good a deal the user can actually make: the best fair offer's edge
 * (how much more the user likes the target than consensus does, minus how much more they like the
 * player they'd send), less any overpay. Targets with no fair offer on the roster come last.
 */
export function rankTargets(targets: readonly ValueGap[], ideas: readonly TradeIdea[]): RankedTarget[] {
  const best = new Map<PlayerId, TradeIdea>();
  for (const idea of ideas) {
    if (!best.has(idea.receive.id)) best.set(idea.receive.id, idea); // ideas are sorted best first
  }
  return targets
    .map((t) => ({ ...t, bestOffer: best.get(t.player.id) ?? null }))
    .sort((a, b) => {
      if (a.bestOffer && b.bestOffer) return b.bestOffer.score - a.bestOffer.score;
      if (a.bestOffer || b.bestOffer) return a.bestOffer ? -1 : 1;
      return b.personal.gap - a.personal.gap;
    });
}
