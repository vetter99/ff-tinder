import { LeagueSettings } from './types';

/**
 * League formats FantasyCalc actually distinguishes. Other values are accepted by its API but
 * silently return the default (12-team, full PPR) values, so the app only offers these.
 */
export const SUPPORTED_FORMATS = {
  teams: [8, 10, 12, 14] as const,
  ppr: [0, 0.5, 1] as const,
};

export const SCORING_LABELS: Record<LeagueSettings['ppr'], string> = {
  1: 'PPR',
  0.5: 'Half PPR',
  0: 'Standard',
};

/** Closest supported league size (ties round up, e.g. 16 → 14, 6 → 8, 11 → 12). */
export function supportedTeams(teams: number): number {
  return [...SUPPORTED_FORMATS.teams].sort(
    (a, b) => Math.abs(a - teams) - Math.abs(b - teams) || b - a,
  )[0];
}

/** Closest supported points-per-reception value. */
export function supportedPpr(ppr: number): LeagueSettings['ppr'] {
  return [...SUPPORTED_FORMATS.ppr].sort((a, b) => Math.abs(a - ppr) - Math.abs(b - ppr) || b - a)[0];
}

/** Coerces any saved or imported settings to a format FantasyCalc supports. */
export function normalizeSettings(settings: LeagueSettings): LeagueSettings {
  return {
    ...settings,
    teams: supportedTeams(settings.teams),
    ppr: supportedPpr(settings.ppr),
    superflex: !!settings.superflex,
    dynasty: !!settings.dynasty,
  };
}

/** Short label like "12-team PPR" or "10-team Half PPR SF Dynasty". */
export function formatLabel(s: LeagueSettings): string {
  return [
    `${s.teams}-team`,
    SCORING_LABELS[s.ppr],
    s.superflex ? 'SF' : null,
    s.dynasty ? 'Dynasty' : null,
  ]
    .filter(Boolean)
    .join(' ');
}
