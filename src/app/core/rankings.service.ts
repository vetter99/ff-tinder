import { computed, Service, signal } from '@angular/core';
import { FantasyCalcRow, normalizeFantasyCalc } from '../../domain/normalize';
import { LeagueSettings, Player } from '../../domain/types';
import { fantasyCalcUrl, parseFantasyCalc } from './fantasycalc';
import { readJson, writeJson } from './storage';

const CACHE_KEY = 'ff-tinder:rankings';
/** Cached data younger than this is used without refetching. */
const FRESH_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

interface CachedRankings {
  settingsKey: string;
  fetchedAt: string;
  rows: FantasyCalcRow[];
}

interface Snapshot {
  fetchedAt: string;
  settings: LeagueSettings;
  rows: unknown;
}

export type RankingsSource = 'live' | 'cache' | 'stale-cache' | 'snapshot';

export interface RankingsState {
  status: 'loading' | 'ready' | 'error';
  players: Player[];
  source: RankingsSource | null;
  fetchedAt: string | null;
  /** True when the data is for different league settings than requested (snapshot fallback). */
  settingsMismatch: boolean;
  error: string | null;
}

const settingsKey = (s: LeagueSettings) => `${s.teams}-${s.ppr}-${s.superflex ? 2 : 1}qb`;

/**
 * Loads market values with a fallback chain so a FantasyCalc outage never breaks the app:
 * fresh cache → live FantasyCalc → stale cache → bundled snapshot.
 */
@Service()
export class RankingsService {
  private readonly state = signal<RankingsState>({
    status: 'loading',
    players: [],
    source: null,
    fetchedAt: null,
    settingsMismatch: false,
    error: null,
  });
  private requestId = 0;

  readonly status = computed(() => this.state().status);
  readonly players = computed(() => this.state().players);
  readonly source = computed(() => this.state().source);
  readonly fetchedAt = computed(() => this.state().fetchedAt);
  readonly settingsMismatch = computed(() => this.state().settingsMismatch);
  readonly error = computed(() => this.state().error);

  async load(settings: LeagueSettings, { force = false } = {}): Promise<void> {
    const id = ++this.requestId;
    const key = settingsKey(settings);
    const cached = readJson<CachedRankings>(CACHE_KEY);
    const cacheMatches = cached?.settingsKey === key;
    if (this.state().players.length === 0 || !cacheMatches) {
      this.state.update((s) => ({ ...s, status: 'loading' }));
    }

    if (!force && cacheMatches && Date.now() - Date.parse(cached.fetchedAt) < FRESH_MS) {
      this.set(id, cached.rows, 'cache', cached.fetchedAt, false);
      return;
    }

    try {
      const rows = parseFantasyCalc(await fetchJson(fantasyCalcUrl(settings)));
      const fetchedAt = new Date().toISOString();
      writeJson(CACHE_KEY, { settingsKey: key, fetchedAt, rows } satisfies CachedRankings);
      this.set(id, rows, 'live', fetchedAt, false);
      return;
    } catch (e) {
      console.warn('FantasyCalc unavailable, falling back', e);
    }

    if (cacheMatches) {
      this.set(id, cached.rows, 'stale-cache', cached.fetchedAt, false);
      return;
    }

    try {
      const snapshot = (await fetchJson('data/snapshot.json')) as Snapshot;
      const rows = parseFantasyCalc(snapshot.rows);
      this.set(id, rows, 'snapshot', snapshot.fetchedAt, settingsKey(snapshot.settings) !== key);
    } catch (e) {
      if (id !== this.requestId) return;
      this.state.update((s) => ({
        ...s,
        status: 'error',
        error: e instanceof Error ? e.message : 'Could not load player values',
      }));
    }
  }

  private set(
    id: number,
    rows: FantasyCalcRow[],
    source: RankingsSource,
    fetchedAt: string,
    settingsMismatch: boolean,
  ): void {
    if (id !== this.requestId) return; // a newer load superseded this one
    this.state.set({
      status: 'ready',
      players: normalizeFantasyCalc(rows),
      source,
      fetchedAt,
      settingsMismatch,
      error: null,
    });
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${url} responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
