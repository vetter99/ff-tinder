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

/** A salary abbreviated for cards: "$11.3M", "$850K", "$6.25". */
export function formatSalaryShort(salary: number): string {
  const abs = Math.abs(salary);
  const short = (n: number, unit: string) => `$${Number(n.toFixed(1))}${unit}`;
  if (abs >= 1e6) return short(salary / 1e6, 'M');
  if (abs >= 1e3) return short(salary / 1e3, 'K');
  return formatSalary(salary);
}

/**
 * A league salary as money: big salary-cap numbers in whole dollars ("$10,856,472"), small auction
 * values with cents only when needed ("$6.25", "$35").
 */
export function formatSalary(salary: number): string {
  return salary.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(salary) >= 1000 ? 0 : 2,
  });
}
