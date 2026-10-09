import { PersonalValue } from './preference';
import { signed } from './targets';
import { Player, PlayerId } from './types';

export const TRADE_RULES = {
  /** The user may overpay by up to this share of the larger side's market value… */
  maxOverpayShare: 0.12,
  /** …but may only receive this much more, or the other manager would plausibly refuse. */
  maxWinShare: 0.05,
  /** Absolute slack for low-value players, in baseline points. */
  marketFloor: 1,
  /** Minimum preference edge: how much more than consensus the user prefers the incoming side. */
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
  /** Market value received minus sent (positive = user gets more by consensus). */
  marketDelta: number;
  marketDeltaShare: number;
  score: number;
  reasons: string[];
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
        reasons: explainTrade(send, receive, gap(send), gap(receive), delta),
      });
    }
  }

  ideas.sort((a, b) => b.score - a.score);
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

function explainTrade(
  send: Player,
  receive: Player,
  gapOut: number,
  gapIn: number,
  marketDelta: number,
): string[] {
  const reasons: string[] = [];
  if (gapIn >= 0.5) reasons.push(`You value ${receive.name} ${signed(gapIn)} above consensus.`);
  if (gapOut <= -0.5) reasons.push(`You value ${send.name} ${signed(gapOut)} below consensus.`);
  if (reasons.length === 0) {
    reasons.push(`You prefer ${receive.name} to ${send.name} by more than consensus does.`);
  }
  const pct = Math.round(
    (100 * Math.abs(marketDelta)) / Math.max(send.market.baseline, receive.market.baseline),
  );
  reasons.push(
    pct <= 2
      ? 'Market values are essentially even.'
      : `By consensus you ${marketDelta > 0 ? 'gain' : 'give up'} about ${pct}% in market value.`,
  );
  return reasons;
}
