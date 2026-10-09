import { PersonalValue } from './preference';
import { Player, PlayerId, Position } from './types';

export interface ValueChartRow {
  player: Player;
  personal: PersonalValue;
  /** Rank by the user's blended value (1 = most valuable to them). */
  yourRank: number;
  /** Rank by market baseline. */
  marketRank: number;
}

/**
 * The user's personal trade value chart: every player ranked by their blended value, next to the
 * market rank, optionally limited to one position (ranks are then positional).
 */
export function valueChart(
  players: readonly Player[],
  values: ReadonlyMap<PlayerId, PersonalValue>,
  position: Position | null = null,
): ValueChartRow[] {
  const pool = players.filter((p) => values.has(p.id) && (!position || p.position === position));
  const marketRanks = new Map(
    [...pool]
      .sort((a, b) => b.market.baseline - a.market.baseline)
      .map((p, i) => [p.id, i + 1]),
  );
  return pool
    .map((player) => ({ player, personal: values.get(player.id)! }))
    .sort((a, b) => b.personal.value - a.personal.value)
    .map((row, i) => ({ ...row, yourRank: i + 1, marketRank: marketRanks.get(row.player.id)! }));
}
