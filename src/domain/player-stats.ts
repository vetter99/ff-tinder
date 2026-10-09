import { LeagueSettings } from './types';

/** One week of Sleeper stats (only the fields the app uses). */
export interface SleeperWeekStats {
  gp?: number;
  pts_ppr?: number;
  pts_half_ppr?: number;
  pts_std?: number;
  pos_rank_ppr?: number;
  pos_rank_half_ppr?: number;
  pos_rank_std?: number;
  pass_yd?: number;
  pass_td?: number;
  pass_int?: number;
  rush_att?: number;
  rush_yd?: number;
  rush_td?: number;
  rec?: number;
  rec_tgt?: number;
  rec_yd?: number;
  rec_td?: number;
  off_snp?: number;
  tm_off_snp?: number;
}

/** Sleeper's `stats/nfl/player/:id?grouping=week` shape: week number → stats (null = bye/unplayed). */
export type SleeperWeeklyStats = Record<string, { stats?: SleeperWeekStats | null } | null>;

export interface WeekLine {
  week: number;
  points: number;
  positionRank: number | null;
}

export interface SeasonSummary {
  games: number;
  pointsPerGame: number | null;
  last: WeekLine | null;
  weeks: WeekLine[];
  /** Share of team offensive snaps, 0–1, when available. */
  snapShare: number | null;
  totals: {
    passYd: number;
    passTd: number;
    int: number;
    rushAtt: number;
    rushYd: number;
    rushTd: number;
    rec: number;
    targets: number;
    recYd: number;
    recTd: number;
  };
}

const KEYS: Record<LeagueSettings['ppr'], { pts: keyof SleeperWeekStats; rank: keyof SleeperWeekStats }> = {
  1: { pts: 'pts_ppr', rank: 'pos_rank_ppr' },
  0.5: { pts: 'pts_half_ppr', rank: 'pos_rank_half_ppr' },
  0: { pts: 'pts_std', rank: 'pos_rank_std' },
};

/** Turns Sleeper weekly stats into a season summary in the league's scoring format. */
export function summarizeSeason(raw: SleeperWeeklyStats, ppr: LeagueSettings['ppr']): SeasonSummary {
  const { pts, rank } = KEYS[ppr];
  const played = Object.entries(raw)
    .map(([week, entry]) => ({ week: Number(week), stats: entry?.stats ?? null }))
    .filter((w): w is { week: number; stats: SleeperWeekStats } => !!w.stats && (w.stats.gp ?? 0) > 0)
    .sort((a, b) => a.week - b.week);

  const sum = (key: keyof SleeperWeekStats) => played.reduce((s, w) => s + (w.stats[key] ?? 0), 0);
  const weeks = played.map((w) => ({
    week: w.week,
    points: w.stats[pts] ?? 0,
    positionRank: w.stats[rank] ?? null,
  }));
  const snaps = sum('off_snp');
  const teamSnaps = sum('tm_off_snp');

  return {
    games: weeks.length,
    pointsPerGame: weeks.length ? weeks.reduce((s, w) => s + w.points, 0) / weeks.length : null,
    last: weeks.at(-1) ?? null,
    weeks,
    snapShare: teamSnaps > 0 ? snaps / teamSnaps : null,
    totals: {
      passYd: sum('pass_yd'),
      passTd: sum('pass_td'),
      int: sum('pass_int'),
      rushAtt: sum('rush_att'),
      rushYd: sum('rush_yd'),
      rushTd: sum('rush_td'),
      rec: sum('rec'),
      targets: sum('rec_tgt'),
      recYd: sum('rec_yd'),
      recTd: sum('rec_td'),
    },
  };
}

/** Short injury tag from Sleeper's injury status (e.g. "Questionable" → "Q"). */
export function injuryTag(status: string | null | undefined): string | null {
  if (!status) return null;
  const tags: Record<string, string> = {
    Questionable: 'Q',
    Doubtful: 'D',
    Out: 'OUT',
    IR: 'IR',
    PUP: 'PUP',
    Sus: 'SUS',
    NA: 'NA',
  };
  return tags[status] ?? status.toUpperCase();
}
