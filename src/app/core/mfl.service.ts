import { Service } from '@angular/core';

export interface MflLeagueSummary {
  id: string;
  name: string;
}

export interface MflLeague {
  id: string;
  name: string;
  teams: number;
  superflex: boolean;
  franchises: { id: string; name: string; playerIds: string[] }[];
}

export interface MflPlayer {
  id: string;
  name: string;
  position: string;
  team: string | null;
}

/** Talks to MyFantasyLeague through the app's own /api/mfl proxy (MFL blocks direct browser calls). */
@Service()
export class MflService {
  async search(query: string): Promise<MflLeagueSummary[]> {
    const res = await get<{ leagues: MflLeagueSummary[] }>(
      `/api/mfl/search?q=${encodeURIComponent(query)}`,
    );
    return res.leagues;
  }

  league(id: string): Promise<MflLeague> {
    return get<MflLeague>(`/api/mfl/league?id=${encodeURIComponent(id)}`);
  }

  async players(ids: readonly string[]): Promise<MflPlayer[]> {
    if (ids.length === 0) return [];
    const res = await get<{ players: MflPlayer[] }>(`/api/mfl/players?ids=${ids.join(',')}`);
    return res.players;
  }
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) {
    throw new Error(
      body?.error ??
        (res.status === 404
          ? 'League import is unavailable here (the /api server isn’t running)'
          : `Request failed (${res.status})`),
    );
  }
  return body;
}
