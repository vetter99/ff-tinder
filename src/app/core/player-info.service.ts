import { Service, signal } from '@angular/core';
import { injuryTag, SleeperWeeklyStats } from '../../domain/player-stats';
import { Player, PlayerId } from '../../domain/types';

export interface NewsItem {
  headline: string;
  summary: string;
  published: string | null;
}

export interface PlayerInfo {
  injury: {
    tag: string;
    status: string;
    bodyPart: string | null;
    notes: string | null;
    practice: string | null;
  } | null;
  depthChart: string | null;
  number: number | null;
  weeklyStats: SleeperWeeklyStats;
  news: NewsItem[];
}

export type InfoState = { status: 'loading' } | { status: 'ready'; info: PlayerInfo } | { status: 'error' };

interface SleeperPlayer {
  injury_status?: string | null;
  injury_body_part?: string | null;
  injury_notes?: string | null;
  practice_participation?: string | null;
  depth_chart_position?: string | null;
  depth_chart_order?: number | null;
  number?: number | null;
}

/** How long fetched info is reused before refetching. */
const TTL_MS = 15 * 60 * 1000;

/**
 * Injury status, weekly stats and news for a player: Sleeper (injuries, stats) is called directly,
 * news comes through the app's /api/news proxy. Results are cached in memory for the session.
 */
@Service()
export class PlayerInfoService {
  private readonly cache = signal(new Map<PlayerId, InfoState & { at: number }>());

  state(id: PlayerId): InfoState | undefined {
    return this.cache().get(id);
  }

  /** Starts loading info for these players unless it's cached and fresh. */
  ensure(players: readonly Player[]): void {
    for (const p of players) {
      const cached = this.cache().get(p.id);
      if (cached && cached.status !== 'error' && Date.now() - cached.at < TTL_MS) continue;
      this.set(p.id, { status: 'loading' });
      this.load(p).then(
        (info) => this.set(p.id, { status: 'ready', info }),
        () => this.set(p.id, { status: 'error' }),
      );
    }
  }

  private set(id: PlayerId, state: InfoState): void {
    this.cache.update((m) => new Map(m).set(id, { ...state, at: Date.now() }));
  }

  private async load(player: Player): Promise<PlayerInfo> {
    const sleeperId = player.ids.sleeper;
    const season = currentSeason();
    const [details, weeklyStats, news] = await Promise.all([
      sleeperId ? getJson<SleeperPlayer>(`https://api.sleeper.com/players/nfl/${sleeperId}`) : null,
      sleeperId
        ? getJson<SleeperWeeklyStats>(
            `https://api.sleeper.com/stats/nfl/player/${sleeperId}?season_type=regular&season=${season}&grouping=week`,
          )
        : null,
      player.ids.espn
        ? getJson<{ items: NewsItem[] }>(`/api/news?espn=${player.ids.espn}`).catch(() => null)
        : null,
    ]);
    const tag = injuryTag(details?.injury_status);
    return {
      injury:
        tag && details?.injury_status
          ? {
              tag,
              status: details.injury_status,
              bodyPart: details.injury_body_part ?? null,
              notes: details.injury_notes ?? null,
              practice: details.practice_participation ?? null,
            }
          : null,
      depthChart:
        details?.depth_chart_position && details.depth_chart_order
          ? `${details.depth_chart_position}${details.depth_chart_order}`
          : null,
      number: details?.number ?? null,
      weeklyStats: weeklyStats ?? {},
      news: news?.items ?? [],
    };
  }
}

/** NFL season year: January–February games belong to the previous season. */
function currentSeason(now = new Date()): number {
  return now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear();
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return (await res.json()) as T;
}
