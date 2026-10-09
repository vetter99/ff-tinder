import { computed, effect, inject, Service, signal, untracked } from '@angular/core';
import { shareableValues, SharedValues, TradeMatch } from '../../domain/matches';
import { vetoKey } from '../../domain/trades';
import { Player } from '../../domain/types';
import { StoreService } from './store.service';
import { ValuationService } from './valuation.service';

/** Wait this long after the last answer before re-sharing values. */
const SYNC_DEBOUNCE_MS = 4000;

export type MatchStatus = 'off' | 'syncing' | 'ready' | 'claimed' | 'unavailable' | 'error';

export interface LeagueMatch extends Omit<TradeMatch, 'send' | 'receive'> {
  send: Player;
  receive: Player;
}

interface SyncResult {
  teams: number;
  members: number;
  matches: TradeMatch[];
}

/**
 * League trade matches. While a roster is linked to an MFL league, this shares the user's values
 * with the app's server (debounced as answers change) and keeps the mutual matches it returns.
 */
@Service()
export class LeagueMatchesService {
  private readonly store = inject(StoreService);
  private readonly valuation = inject(ValuationService);

  readonly status = signal<MatchStatus>('off');
  readonly error = signal<string | null>(null);
  private readonly result = signal<SyncResult | null>(null);
  /** The team this device last shared values for (left on the server when it changes). */
  private linked: TeamKey | null = null;
  /** Whether a sync has been tried for the linked team yet. */
  private attempted = false;

  readonly teams = computed(() => this.result()?.teams ?? null);
  readonly members = computed(() => this.result()?.members ?? null);
  readonly matches = computed<LeagueMatch[]>(() => {
    const byMfl = new Map(
      this.valuation.players().flatMap((p) => (p.ids.mfl ? [[p.ids.mfl, p] as const] : [])),
    );
    const vetoed = this.valuation.vetoed();
    return (this.result()?.matches ?? []).flatMap((m) => {
      const send = byMfl.get(m.send);
      const receive = byMfl.get(m.receive);
      if (!send || !receive || vetoed.has(vetoKey(send.id, receive.id))) return [];
      return [{ ...m, send, receive }];
    });
  });

  private readonly values = computed(() =>
    shareableValues(this.valuation.players(), this.valuation.values()),
  );

  constructor() {
    effect((onCleanup) => {
      const key = this.currentKey();
      untracked(() => this.switchTeam(key));
      const values = this.values();
      if (!key || Object.keys(values).length === 0) return; // not linked, or rankings still loading
      // The first sync for a team runs right away; later ones wait for answers to settle.
      const delay = this.attempted ? SYNC_DEBOUNCE_MS : 0;
      const timer = setTimeout(() => this.sync(key, values), delay);
      onCleanup(() => clearTimeout(timer));
    });
  }

  /** Shares values now and fetches fresh matches (e.g. when opening the Trades page). */
  refresh(): void {
    const key = this.currentKey();
    const values = this.values();
    if (key && Object.keys(values).length > 0) void this.sync(key, values);
  }

  /** Unlinking, switching teams or resetting removes the previous team's values from the server. */
  private switchTeam(key: TeamKey | null): void {
    if (sameTeam(this.linked, key)) return;
    if (this.linked) void post('/api/league/leave', this.linked).catch(() => undefined);
    this.linked = key;
    this.attempted = false;
    this.result.set(null);
    this.error.set(null);
    this.status.set(key ? 'syncing' : 'off');
  }

  private async sync(key: TeamKey, values: SharedValues): Promise<void> {
    this.attempted = true;
    this.status.set('syncing');
    try {
      const res = await post<SyncResult>('/api/league/sync', { ...key, values });
      // Ignore a response that arrives after the user switched teams.
      if (!sameTeam(key, this.currentKey())) return;
      this.result.set(res);
      this.status.set('ready');
      this.error.set(null);
    } catch (e) {
      if (!sameTeam(key, this.currentKey())) return;
      const status = e instanceof RequestError ? e.status : 0;
      this.result.set(null);
      this.status.set(status === 409 ? 'claimed' : status === 404 || status === 503 ? 'unavailable' : 'error');
      this.error.set(e instanceof Error ? e.message : 'Could not reach the server');
    }
  }

  private currentKey(): TeamKey | null {
    const link = this.store.league();
    return link
      ? { leagueId: link.leagueId, franchiseId: link.franchiseId, token: this.store.deviceToken() }
      : null;
  }
}

interface TeamKey {
  leagueId: string;
  franchiseId: string;
  token: string;
}

function sameTeam(a: TeamKey | null, b: TeamKey | null): boolean {
  if (!a || !b) return a === b;
  return a.leagueId === b.leagueId && a.franchiseId === b.franchiseId && a.token === b.token;
}

class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) throw new RequestError(res.status, data?.error ?? `Request failed (${res.status})`);
  return data;
}
