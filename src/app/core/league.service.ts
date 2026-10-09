import { computed, effect, inject, Service, signal } from '@angular/core';
import { Player } from '../../domain/types';
import { MflContract, MflLeague, MflService } from './mfl.service';
import { StoreService } from './store.service';

export interface LeaguePlayerInfo {
  leagueName: string;
  /** Owning team in the linked league, or null for a free agent. */
  owner: { name: string; mine: boolean } | null;
  contract: MflContract | null;
}

/** Live details of the linked league: who owns each player and their salary/contract. */
@Service()
export class LeagueService {
  private readonly store = inject(StoreService);
  private readonly mfl = inject(MflService);
  private readonly league = signal<MflLeague | null>(null);

  constructor() {
    // Re-fetches whenever the link changes, including after "Sync roster".
    effect(() => {
      const id = this.store.league()?.leagueId;
      this.league.set(null);
      if (id) void this.load(id);
    });
  }

  private readonly owners = computed(() => {
    const owners = new Map<string, { id: string; name: string }>();
    for (const f of this.league()?.franchises ?? []) {
      for (const pid of f.playerIds) owners.set(pid, { id: f.id, name: f.name });
    }
    return owners;
  });

  /** League details for a player, or null when no league is linked (or it hasn't loaded). */
  info(player: Player): LeaguePlayerInfo | null {
    const league = this.league();
    const link = this.store.league();
    if (!league || !link || league.id !== link.leagueId || !player.ids.mfl) return null;
    const owner = this.owners().get(player.ids.mfl);
    return {
      leagueName: league.name,
      owner: owner ? { name: owner.name, mine: owner.id === link.franchiseId } : null,
      contract: league.contracts?.[player.ids.mfl] ?? null,
    };
  }

  private async load(id: string): Promise<void> {
    try {
      const league = await this.mfl.league(id);
      if (this.store.league()?.leagueId === id) this.league.set(league);
    } catch {
      // League details are extras on the player sheet; skip them if MFL is unavailable.
    }
  }
}
