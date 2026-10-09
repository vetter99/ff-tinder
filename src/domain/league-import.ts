import { Player } from './types';

/** Which external league and team the roster was imported from. */
export interface LeagueLink {
  provider: 'mfl';
  leagueId: string;
  leagueName: string;
  franchiseId: string;
  franchiseName: string;
  importedAt: number;
}

/**
 * Matches a league roster (MFL player ids) to players we have market values for. Players outside
 * the FantasyCalc universe (kickers, defenses, IDP, deep bench) come back as `unmatched`.
 */
export function matchMflRoster(
  mflPlayerIds: readonly string[],
  players: readonly Player[],
): { matched: Player[]; unmatched: string[] } {
  const byMfl = new Map(players.filter((p) => p.ids.mfl).map((p) => [p.ids.mfl!, p]));
  const matched: Player[] = [];
  const unmatched: string[] = [];
  for (const id of mflPlayerIds) {
    const player = byMfl.get(id);
    if (player) matched.push(player);
    else unmatched.push(id);
  }
  matched.sort((a, b) => b.market.baseline - a.market.baseline);
  return { matched, unmatched };
}
