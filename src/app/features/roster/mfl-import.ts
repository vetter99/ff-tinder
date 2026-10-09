import { Component, computed, inject, signal } from '@angular/core';
import { supportedPpr } from '../../../domain/format';
import { matchMflRoster } from '../../../domain/league-import';
import { LeagueSettings, Player } from '../../../domain/types';
import { LeagueMatchesService } from '../../core/league-matches.service';
import { MflLeague, MflLeagueSummary, MflService } from '../../core/mfl.service';
import { StoreService } from '../../core/store.service';
import { ValuationService } from '../../core/valuation.service';
import { relativeTime } from '../../shared/format';
import { HelpTip } from '../../shared/help-tip';
import { PlayerLine } from '../../shared/player-line';

interface FranchiseOption {
  id: string;
  name: string;
  matched: Player[];
  unmatched: string[];
  /** A few of the team's best players, to help recognize it. */
  preview: string;
}

/** Find an MFL league, pick your team, and import its roster. */
@Component({
  selector: 'app-mfl-import',
  imports: [PlayerLine, HelpTip],
  templateUrl: './mfl-import.html',
  host: { class: 'block' },
})
export class MflImport {
  private readonly mfl = inject(MflService);
  protected readonly store = inject(StoreService);
  private readonly valuation = inject(ValuationService);
  private readonly leagueMatches = inject(LeagueMatchesService);

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly busy = signal<'search' | 'league' | 'sync' | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly results = signal<MflLeagueSummary[] | null>(null);
  protected readonly league = signal<MflLeague | null>(null);
  protected readonly franchiseId = signal<string | null>(null);
  protected readonly unmatchedNames = signal<string[]>([]);

  protected readonly franchises = computed<FranchiseOption[]>(() => {
    const league = this.league();
    if (!league) return [];
    const players = this.valuation.players();
    return league.franchises.map((f) => {
      const { matched, unmatched } = matchMflRoster(f.playerIds, players);
      const preview = matched
        .slice(0, 3)
        .map((p) => p.name)
        .join(', ');
      return { id: f.id, name: f.name, matched, unmatched, preview };
    });
  });
  protected readonly selected = computed(
    () => this.franchises().find((f) => f.id === this.franchiseId()) ?? null,
  );
  protected readonly syncedLabel = computed(() => {
    const link = this.store.league();
    return link ? relativeTime(new Date(link.importedAt).toISOString(), Date.now()) : '';
  });

  protected readonly matchSummary = computed(() => {
    const m = this.leagueMatches;
    switch (m.status()) {
      case 'claimed':
        return 'League matching is active for this team on another device.';
      case 'unavailable':
        return 'League matching isn’t available on this server.';
      case 'error':
        return 'Couldn’t reach league matching right now.';
    }
    const members = m.members();
    if (members === null) return 'Finding trade matches with your league…';
    const count = m.matches().length;
    const others = members - 1;
    if (others === 0) return 'Trade matching is on. No leaguemates have joined yet.';
    return `${others} leaguemate${others === 1 ? '' : 's'} here · ${count} trade match${count === 1 ? '' : 'es'}`;
  });

  protected start(): void {
    this.open.set(true);
    this.reset();
  }

  protected cancel(): void {
    this.open.set(false);
    this.reset();
  }

  private reset(): void {
    this.results.set(null);
    this.league.set(null);
    this.franchiseId.set(null);
    this.error.set(null);
  }

  protected async search(): Promise<void> {
    const q = this.query().trim();
    if (!q) return;
    await this.run('search', async () => {
      this.league.set(null);
      this.franchiseId.set(null);
      const leagues = await this.mfl.search(q);
      // A pasted league ID or URL matches exactly one league: skip straight to picking a team.
      if (leagues.length === 1) await this.chooseLeague(leagues[0].id);
      else this.results.set(leagues);
    });
  }

  protected async chooseLeague(id: string): Promise<void> {
    await this.run('league', async () => {
      this.league.set(await this.mfl.league(id));
      this.results.set(null);
      this.franchiseId.set(null);
    });
  }

  protected async chooseFranchise(id: string): Promise<void> {
    this.franchiseId.set(id);
    this.unmatchedNames.set([]);
    const unmatched = this.selected()?.unmatched ?? [];
    try {
      const names = await this.mfl.players(unmatched);
      if (this.franchiseId() === id) {
        this.unmatchedNames.set(names.map((p) => `${p.name} (${p.position})`));
      }
    } catch {
      // Names are a nicety; the import works without them.
    }
  }

  protected importSelected(): void {
    const league = this.league();
    const franchise = this.selected();
    if (!league || !franchise) return;
    this.store.importRoster(
      franchise.matched.map((p) => p.id),
      {
        provider: 'mfl',
        leagueId: league.id,
        leagueName: league.name,
        franchiseId: franchise.id,
        franchiseName: franchise.name,
        importedAt: Date.now(),
      },
      this.formatFrom(league),
    );
    this.cancel();
  }

  /** Re-imports the linked team's current roster. */
  protected async sync(): Promise<void> {
    const link = this.store.league();
    if (!link) return;
    await this.run('sync', async () => {
      const league = await this.mfl.league(link.leagueId);
      const franchise = league.franchises.find((f) => f.id === link.franchiseId);
      if (!franchise) throw new Error('Your team is no longer in that league');
      const { matched } = matchMflRoster(franchise.playerIds, this.valuation.players());
      this.store.importRoster(
        matched.map((p) => p.id),
        { ...link, leagueName: league.name, franchiseName: franchise.name, importedAt: Date.now() },
        this.formatFrom(league),
      );
    });
  }

  /** League settings implied by the MFL league (the store maps them to supported formats). */
  private formatFrom(league: MflLeague): Partial<LeagueSettings> {
    return {
      teams: league.teams,
      superflex: league.superflex,
      ...(league.ppr === null ? {} : { ppr: supportedPpr(league.ppr) }),
    };
  }

  private async run(kind: 'search' | 'league' | 'sync', task: () => Promise<void>): Promise<void> {
    this.busy.set(kind);
    this.error.set(null);
    try {
      await task();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong';
      this.error.set(
        /log ?in|private|permission/i.test(message)
          ? 'That league is private. Importing private leagues needs MFL sign-in, which isn’t supported yet.'
          : message,
      );
    } finally {
      this.busy.set(null);
    }
  }
}
