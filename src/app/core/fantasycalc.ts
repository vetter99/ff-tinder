import * as z from 'zod/mini';
import { FantasyCalcRow } from '../../domain/normalize';
import { LeagueSettings } from '../../domain/types';

const rowSchema = z.object({
  player: z.object({
    id: z.number(),
    name: z.string(),
    position: z.string(),
    sleeperId: z.nullish(z.string()),
    espnId: z.nullish(z.string()),
    maybeTeam: z.nullish(z.string()),
    maybeAge: z.nullish(z.number()),
  }),
  value: z.number(),
  overallRank: z.number(),
  positionRank: z.number(),
  maybeTier: z.nullish(z.number()),
  trend30Day: z.nullish(z.number()),
});

/** Below this many players the payload is treated as broken rather than used. */
const MIN_ROWS = 100;

export function fantasyCalcUrl(settings: LeagueSettings): string {
  const params = new URLSearchParams({
    isDynasty: 'false',
    numQbs: settings.superflex ? '2' : '1',
    numTeams: String(settings.teams),
    ppr: String(settings.ppr),
  });
  return `https://api.fantasycalc.com/values/current?${params}`;
}

/** Validates a FantasyCalc payload. Throws if the shape changed or the data looks truncated. */
export function parseFantasyCalc(json: unknown): FantasyCalcRow[] {
  const rows = z.array(rowSchema).parse(json);
  if (rows.length < MIN_ROWS) throw new Error(`FantasyCalc returned only ${rows.length} players`);
  if (!rows.some((r) => r.value > 0)) throw new Error('FantasyCalc returned no positive values');
  return rows;
}
