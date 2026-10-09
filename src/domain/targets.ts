import { PersonalValue } from './preference';
import { Player, PlayerId } from './types';

export interface ValueGap {
  player: Player;
  personal: PersonalValue;
}

export const TARGET_THRESHOLDS = {
  /** Minimum |value − baseline| (in 0–100 baseline points) to call out a player. */
  minGap: 1.5,
  /** Ignore players with essentially no market value. */
  minBaseline: 3,
};

/** Players whose personal value differs materially from consensus, largest gaps first. */
export function valueGaps(
  players: readonly Player[],
  values: ReadonlyMap<PlayerId, PersonalValue>,
  { requirePlayerEvidence = false } = {},
): ValueGap[] {
  return players
    .filter((p) => p.market.baseline >= TARGET_THRESHOLDS.minBaseline && values.has(p.id))
    .map((player) => ({ player, personal: values.get(player.id)! }))
    .filter((g) => !requirePlayerEvidence || g.personal.comparisons > 0)
    .filter((g) => Math.abs(g.personal.gap) >= TARGET_THRESHOLDS.minGap)
    .sort((a, b) => Math.abs(b.personal.gap) - Math.abs(a.personal.gap));
}

/**
 * Trade targets: non-roster players the user values materially above consensus.
 * Sell candidates: roster players the user values materially below consensus.
 */
export function findValueGaps(
  players: readonly Player[],
  values: ReadonlyMap<PlayerId, PersonalValue>,
  rosterIds: ReadonlySet<PlayerId>,
  { limit = 20, requirePlayerEvidence = false } = {},
): { targets: ValueGap[]; sells: ValueGap[] } {
  const gaps = valueGaps(players, values, { requirePlayerEvidence });
  return {
    targets: gaps
      .filter((g) => !rosterIds.has(g.player.id) && g.personal.gap > 0)
      .slice(0, limit),
    sells: gaps.filter((g) => rosterIds.has(g.player.id) && g.personal.gap < 0).slice(0, limit),
  };
}

/** Human-readable explanation of where a gap comes from. */
export function explainGap(g: ValueGap): string {
  const { personal, player } = g;
  const dir = personal.gap > 0 ? 'higher' : 'lower';
  const parts: string[] = [];
  if (Math.abs(personal.playerPart) >= 0.5) {
    parts.push(
      `${signed(personal.playerPart)} from ${personal.comparisons} direct comparison${personal.comparisons === 1 ? '' : 's'}`,
    );
  }
  if (Math.abs(personal.positionPart) >= 0.5) {
    parts.push(`${signed(personal.positionPart)} from your overall ${player.position} lean`);
  }
  const detail = parts.length ? ` (${parts.join(', ')})` : '';
  return `You're ${Math.abs(personal.gap).toFixed(1)} points ${dir} than consensus on ${player.name}${detail}.`;
}

export const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;
