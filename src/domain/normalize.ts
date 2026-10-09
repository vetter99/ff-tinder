import { LeagueSettings, Player, POSITIONS, Position, ReplacementLevels } from './types';

/** The subset of a FantasyCalc `/values/current` row that the app relies on. */
export interface FantasyCalcRow {
  player: {
    id: number;
    name: string;
    position: string;
    sleeperId?: string | null;
    espnId?: string | null;
    maybeTeam?: string | null;
    maybeAge?: number | null;
  };
  value: number;
  overallRank: number;
  positionRank: number;
  maybeTier?: number | null;
  trend30Day?: number | null;
}

const isPosition = (p: string): p is Position => (POSITIONS as readonly string[]).includes(p);

/**
 * Converts FantasyCalc rows into players with a 0–100 baseline.
 * FantasyCalc values are already a nonlinear market scale, so the baseline is a linear rescale.
 */
export function normalizeFantasyCalc(rows: readonly FantasyCalcRow[]): Player[] {
  const usable = rows.filter((r) => isPosition(r.player.position));
  const max = Math.max(1, ...usable.map((r) => r.value));
  return usable
    .map((r) => ({
      id: r.player.sleeperId || `fc:${r.player.id}`,
      name: r.player.name,
      team: r.player.maybeTeam ?? null,
      position: r.player.position as Position,
      age: r.player.maybeAge ?? null,
      ids: {
        sleeper: r.player.sleeperId ?? null,
        espn: r.player.espnId ?? null,
        fantasycalc: r.player.id,
      },
      market: {
        rawValue: r.value,
        overallRank: r.overallRank,
        positionRank: r.positionRank,
        tier: r.maybeTier ?? null,
        trend30Day: r.trend30Day ?? 0,
        baseline: Math.max(0, (100 * r.value) / max),
      },
    }))
    .sort((a, b) => b.market.baseline - a.market.baseline);
}

/**
 * Fallback for rank-only sources: exponential decay so the gap between ranks 1 and 10 is far larger
 * than between 91 and 100. k = 0.03 was fit against FantasyCalc values (rank 10 ≈ 76, rank 100 ≈ 5).
 */
export function baselineFromRank(rank: number, k = 0.03): number {
  return 100 * Math.exp(-k * (rank - 1));
}

/** League-wide starters per team at each position, including an estimated share of flex slots. */
export function startersPerTeam(settings: LeagueSettings): Record<Position, number> {
  const sf = settings.superflex;
  return {
    QB: 1 + (sf ? 0.8 : 0),
    RB: 2.45 + (sf ? 0.1 : 0),
    WR: 2.45 + (sf ? 0.1 : 0),
    TE: 1.1,
  };
}

/** Baseline of the best player at each position who would not start on any team in the league. */
export function replacementLevels(
  players: readonly Player[],
  settings: LeagueSettings,
): ReplacementLevels {
  const perTeam = startersPerTeam(settings);
  const levels = {} as ReplacementLevels;
  for (const pos of POSITIONS) {
    const atPos = players
      .filter((p) => p.position === pos)
      .map((p) => p.market.baseline)
      .sort((a, b) => b - a);
    levels[pos] = atPos[Math.round(settings.teams * perTeam[pos])] ?? 0;
  }
  return levels;
}
