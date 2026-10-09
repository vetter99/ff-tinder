import { computed, effect, inject, Service, signal, untracked } from '@angular/core';
import { shareableValues, SharedValues, TradeMatch } from '../../domain/matches';
import { ComparisonLog, teamKey } from '../../domain/team-sync';
import { vetoKey } from '../../domain/trades';
import { Player } from '../../domain/types';
import { StoreService } from './store.service';
import { ValuationService } from './valuation.service';

/** Wait this long after the last answer before syncing again. */
const SYNC_DEBOUNCE_MS = 4000;

export type SyncStatus = 'off' | 'syncing' | 'ready' | 'unavailable' | 'error';

export interface LeagueMatch extends Omit<TradeMatch, 'send' | 'receive'> {
  send: Player;
  receive: Player;
}

interface SyncResult {
  log: ComparisonLog;
  teams: number;
  members: number;
  matches: TradeMatch[];
}

interface Team {
  leagueId: string;
  franchiseId: string;
}

/**
 * Keeps the linked league team's answers in sync with the app's server, so picking the team on any
 * device brings them back, and fetches the team's league trade matches. Syncs right away when a
 * team is linked and again a few seconds after answers stop changing.
 */
@Service()
export class TeamSyncService {
  private readonly store = inject(StoreService);
  private readonly valuation = inject(ValuationService);

  readonly status = signal<SyncStatus>('off');
  private readonly result = signal<Omit<SyncResult, 'log'> | null>(null);
  /** The team being synced, and whether a sync was tried for it yet. */
  private team: string | null = null;
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
      const team = this.currentTeam();
      untracked(() => this.switchTeam(team));
      const log = this.store.log();
      const values = this.values();
      if (!team || Object.keys(values).length === 0) return; // not linked, or rankings still loading
      // The first sync for a team runs right away; later ones wait for answers to settle.
      const delay = this.attempted ? SYNC_DEBOUNCE_MS : 0;
      const timer = setTimeout(() => this.sync(team, log, values), delay);
      onCleanup(() => clearTimeout(timer));
    });
  }

  /** Syncs now (e.g. when opening the Trades page, as leaguemates may have answered since). */
  refresh(): void {
    const team = this.currentTeam();
    const values = this.values();
    if (team && Object.keys(values).length > 0) void this.sync(team, this.store.log(), values);
  }

  private switchTeam(team: Team | null): void {
    const key = team && teamKey(team.leagueId, team.franchiseId);
    if (key === this.team) return;
    this.team = key;
    this.attempted = false;
    this.result.set(null);
    this.status.set(key ? 'syncing' : 'off');
  }

  private async sync(team: Team, log: ComparisonLog, values: SharedValues): Promise<void> {
    const key = teamKey(team.leagueId, team.franchiseId);
    this.attempted = true;
    this.status.set('syncing');
    try {
      const res = await post<SyncResult>('/api/league/sync', { ...team, values, log });
      // Ignore a response that arrives after the user switched teams.
      if (key !== this.team) return;
      this.store.mergeTeamLog(key, res.log);
      this.result.set({ teams: res.teams, members: res.members, matches: res.matches });
      this.status.set('ready');
    } catch (e) {
      if (key !== this.team) return;
      const status = e instanceof RequestError ? e.status : 0;
      this.status.set(status === 404 || status === 503 ? 'unavailable' : 'error');
    }
  }

  private currentTeam(): Team | null {
    const link = this.store.league();
    return link ? { leagueId: link.leagueId, franchiseId: link.franchiseId } : null;
  }
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
