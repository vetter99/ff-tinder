import { PersonalValue } from './preference';
import { evaluateRoster, Slot } from './roster-utility';
import { signed } from './targets';
import { LeagueSettings, Player, PlayerId, ReplacementLevels } from './types';

export const TRADE_RULES = {
  /** The user may overpay by up to this share of the larger side's market value… */
  maxOverpayShare: 0.12,
  /** …but may only receive this much more, or the other manager would plausibly refuse. */
  maxWinShare: 0.05,
  /** Absolute slack for low-value players, in baseline points. */
  marketFloor: 1,
  /** Minimum improvement in the user's personal roster utility. */
  minGain: 0.75,
  maxPerIncoming: 2,
  maxPerOutgoing: 4,
  limit: 25,
};

export interface TradeIdea {
  send: Player;
  receive: Player;
  /** Change in the user's roster utility, using their personal values. */
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
  settings: LeagueSettings;
  replacement: ReplacementLevels;
}

/**
 * 1-for-1 trades that improve the user's personal roster utility while staying within a market
 * window the other manager would plausibly accept: the user may overpay a little by consensus,
 * but never takes much more than they give.
 */
export function generateOneForOne(ctx: TradeContext, rules = TRADE_RULES): TradeIdea[] {
  const { players, roster, values, settings, replacement } = ctx;
  const personal = (p: Player) => values.get(p.id)?.value ?? p.market.baseline;
  const rosterIds = new Set(roster.map((p) => p.id));
  const before = evaluateRoster(roster, personal, settings, replacement);
  const candidates = players.filter((p) => !rosterIds.has(p.id));

  const ideas: TradeIdea[] = [];
  for (const send of roster) {
    const ms = send.market.baseline;
    for (const receive of candidates) {
      // QBs are only ever traded for QBs.
      if ((send.position === 'QB') !== (receive.position === 'QB')) continue;
      const mr = receive.market.baseline;
      const delta = mr - ms;
      const larger = Math.max(ms, mr);
      if (larger < rules.marketFloor) continue;
      if (delta > Math.max(rules.marketFloor, rules.maxWinShare * larger)) continue;
      if (-delta > Math.max(rules.marketFloor, rules.maxOverpayShare * larger)) continue;

      const next = roster.filter((p) => p.id !== send.id).concat(receive);
      const after = evaluateRoster(next, personal, settings, replacement);
      const gain = after.total - before.total;
      if (gain < rules.minGain) continue;

      ideas.push({
        send,
        receive,
        personalGain: gain,
        marketDelta: delta,
        marketDeltaShare: delta / Math.max(ms, mr),
        // Market value the other side gives away for free isn't a reason to rank a trade higher:
        // ideas should win on the user's preferences and lineup fit.
        score: gain - Math.max(0, delta),
        reasons: explainTrade(send, receive, values, before.starters, after.starters, delta),
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
  values: ReadonlyMap<PlayerId, PersonalValue>,
  startersBefore: { slot: Slot; id: PlayerId }[],
  startersAfter: { slot: Slot; id: PlayerId }[],
  marketDelta: number,
): string[] {
  const reasons: string[] = [];
  const gapIn = values.get(receive.id)?.gap ?? 0;
  const gapOut = values.get(send.id)?.gap ?? 0;
  if (gapIn >= 0.5) reasons.push(`You value ${receive.name} ${signed(gapIn)} above consensus.`);
  if (gapOut <= -0.5) reasons.push(`You value ${send.name} ${signed(gapOut)} below consensus.`);

  const slotIn = startersAfter.find((s) => s.id === receive.id)?.slot;
  const slotOut = startersBefore.find((s) => s.id === send.id)?.slot;
  if (slotIn && !slotOut) reasons.push(`${receive.name} would start at ${slotIn}; ${send.name} wasn't starting.`);
  else if (slotIn) reasons.push(`${receive.name} would start at ${slotIn}.`);

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
