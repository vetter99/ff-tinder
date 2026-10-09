export type Position = 'QB' | 'RB' | 'WR' | 'TE';
export const POSITIONS: readonly Position[] = ['QB', 'RB', 'WR', 'TE'];

/** Canonical player id: the Sleeper id (falls back to `fc:<fantasycalcId>` when missing). */
export type PlayerId = string;

export interface Player {
  id: PlayerId;
  name: string;
  team: string | null;
  position: Position;
  age: number | null;
  ids: { sleeper: string | null; espn: string | null; mfl: string | null; fantasycalc: number };
  market: {
    /** Raw FantasyCalc trade value. */
    rawValue: number;
    overallRank: number;
    positionRank: number;
    tier: number | null;
    trend30Day: number;
    /** Normalized market value on a 0–100 scale (100 = most valuable player). */
    baseline: number;
  };
}

export interface LeagueSettings {
  teams: number;
  ppr: 0 | 0.5 | 1;
  superflex: boolean;
  /** Dynasty (long-term) values instead of redraft (rest-of-season) values. */
  dynasty: boolean;
}

export const DEFAULT_SETTINGS: LeagueSettings = {
  teams: 12,
  ppr: 1,
  superflex: false,
  dynasty: false,
};

/** One answer to "who would you rather own?". The append-only log of these is the source of truth. */
export interface Comparison {
  id: string;
  ts: number;
  winner: PlayerId;
  loser: PlayerId;
  /** "Too close to call": winner/loser are just the two players shown. */
  tie?: boolean;
  /**
   * "I would never": the user rejected a suggested trade of winner (theirs) for loser. Counts as a
   * strong answer, and that trade is never suggested again.
   */
  veto?: boolean;
  /** Market baselines of [winner, loser] when the answer was given; used to spot stale answers. */
  baselines?: [number, number];
}

/** User-facing switches for how preferences turn into suggestions. */
export interface ModelOptions {
  /** Learn and apply "you like RBs more than consensus" offsets across a whole position. */
  positionLean: boolean;
  /** Only suggest targets/trades involving players the user has directly compared. */
  requirePlayerEvidence: boolean;
  /** Comparison screen: the picked player stays on for the next matchup. */
  winnerStays: boolean;
}

export const DEFAULT_MODEL_OPTIONS: ModelOptions = {
  positionLean: false,
  requirePlayerEvidence: false,
  winnerStays: false,
};
