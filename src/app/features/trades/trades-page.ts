import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CALIBRATION_COMPARISONS } from '../../../domain/active-learning';
import { LeagueService } from '../../core/league.service';
import { StoreService } from '../../core/store.service';
import { TeamSyncService } from '../../core/team-sync.service';
import { TradeVetoService } from '../../core/trade-veto.service';
import { ValuationService } from '../../core/valuation.service';
import { EmptyState } from '../../shared/empty-state';
import { BuySell } from './buy-sell';
import { MatchCard } from './match-card';
import { ThreeWayCard } from './three-way-card';
import { offerFromIdea, TradeCard } from './trade-card';
import { TradeRoom } from './trade-room';

@Component({
  selector: 'app-trades-page',
  imports: [BuySell, EmptyState, MatchCard, RouterLink, ThreeWayCard, TradeCard, TradeRoom],
  template: `
    <h1 class="text-xl font-semibold">Trades</h1>

    <nav class="mt-4 grid grid-cols-2 rounded-lg bg-zinc-900 p-1 text-sm font-medium" aria-label="Trades view">
      <a
        routerLink="/trades"
        class="rounded-md py-1.5 text-center"
        [class]="market() ? 'text-zinc-400 hover:text-zinc-100' : 'bg-zinc-800 text-zinc-50'"
        [attr.aria-current]="market() ? null : 'page'"
        >Ideas</a
      >
      <a
        routerLink="/trades"
        [queryParams]="{ view: 'market' }"
        class="rounded-md py-1.5 text-center"
        [class]="market() ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-100'"
        [attr.aria-current]="market() ? 'page' : null"
        >Buy & sell</a
      >
    </nav>

    @if (remaining() > 0) {
      <p class="mt-4 text-xs text-zinc-400">
        <a routerLink="/compare" class="text-emerald-400 hover:underline">{{ remaining() }} more swipes</a>
        will sharpen these.
      </p>
    }

    @if (veto.last(); as v) {
      <div
        class="mt-4 flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300"
        role="status"
      >
        <span>Noted: you'd never trade {{ v.send.name }} for {{ v.receive.name }}.</span>
        <button type="button" class="shrink-0 font-medium text-emerald-400 hover:underline" (click)="veto.undo()">
          Undo
        </button>
      </div>
    }

    @if (market()) {
      <app-buy-sell class="mt-6" />
    } @else {
      @if (league.otherTeams().length > 0) {
        <nav class="-mx-4 mt-5 overflow-x-auto px-4" aria-label="Trade with a team">
          <ul class="flex w-max gap-2 pb-1">
            <li>
              <a
                routerLink="/trades"
                class="block rounded-full border px-3 py-1.5 text-sm whitespace-nowrap"
                [class]="selectedTeam() ? 'border-zinc-800 text-zinc-400 hover:text-zinc-100' : 'border-emerald-400 bg-emerald-500/10 text-emerald-200'"
                [attr.aria-current]="selectedTeam() ? null : 'page'"
                >All teams</a
              >
            </li>
            @for (t of teamChips(); track t.team.id) {
              <li>
                <a
                  routerLink="/trades"
                  [queryParams]="{ team: t.team.id }"
                  class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap"
                  [class]="selectedTeam()?.id === t.team.id ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200' : 'border-zinc-800 text-zinc-300 hover:text-zinc-100'"
                  [attr.aria-current]="selectedTeam()?.id === t.team.id ? 'page' : null"
                >
                  {{ t.team.name }}
                  <span class="text-xs text-zinc-500 tabular-nums" [attr.aria-label]="t.offers + ' offers'">{{ t.offers }}</span>
                </a>
              </li>
            }
          </ul>
        </nav>
      }

      @if (selectedTeam(); as team) {
        <app-trade-room class="mt-5" [team]="team" />
      } @else {
        @if (store.league(); as link) {
          <section class="mt-6" aria-labelledby="matches-heading">
            <div class="flex items-baseline justify-between gap-3">
              <h2 id="matches-heading" class="shrink-0 text-sm font-semibold text-amber-200">League matches</h2>
              @if (teamSync.members(); as members) {
                <p class="text-right text-xs text-zinc-500">{{ members }} of {{ teamSync.teams() }} teams here</p>
              }
            </div>
            <div class="mt-2 space-y-4">
              @switch (teamSync.status()) {
                @case ('unavailable') {
                  <app-empty-state>League matching isn't available on this server.</app-empty-state>
                }
                @case ('error') {
                  <app-empty-state role="status">Couldn't check for matches. Try again later.</app-empty-state>
                }
                @default {
                  @for (m of teamSync.threeWay(); track m.send.id + m.first.sends.id + m.second.sends.id) {
                    <app-three-way-card [match]="m" />
                  }
                  @for (m of teamSync.matches(); track m.franchiseId + m.send.id + m.receive.id) {
                    <app-match-card [match]="m" />
                  }
                  @if (teamSync.matches().length === 0 && teamSync.threeWay().length === 0) {
                    <app-empty-state>
                      @if (teamSync.status() === 'syncing' && teamSync.members() === null) {
                        Checking your league…
                      } @else if (teamSync.members() === 1) {
                        You're the first from {{ link.leagueName }}. Trades you and a leaguemate both want
                        show up here.
                      } @else {
                        No mutual trades yet.
                      }
                    </app-empty-state>
                  }
                }
              }
            </div>
          </section>
        } @else {
          <p class="mt-5 text-xs text-zinc-400">
            <a routerLink="/roster" class="text-amber-200 hover:underline">Import your MFL team</a>
            to find trades your leaguemates want too.
          </p>
        }

        <h2 class="mt-8 text-sm font-semibold text-zinc-200">Ideas</h2>
        <ul class="mt-2 space-y-4">
          @for (t of ideas(); track t.send[0].id + t.receive[0].id) {
            <li><app-trade-card [offer]="t" /></li>
          } @empty {
            <li><app-empty-state>No fair trades yet. Keep swiping.</app-empty-state></li>
          }
        </ul>
      }
    }
  `,
})
export class TradesPage {
  /** `?team=<franchise id>`: trade with one team in the linked league. */
  readonly team = input<string>();
  /** `?view=market`: the Buy & sell view. */
  readonly view = input<string>();
  protected readonly store = inject(StoreService);
  protected readonly valuation = inject(ValuationService);
  protected readonly teamSync = inject(TeamSyncService);
  protected readonly league = inject(LeagueService);
  protected readonly veto = inject(TradeVetoService);
  protected readonly market = computed(() => this.view() === 'market');
  protected readonly remaining = computed(() =>
    Math.max(0, CALIBRATION_COMPARISONS - this.store.comparisons().length),
  );
  protected readonly ideas = computed(() => this.valuation.trades().map(offerFromIdea));

  protected readonly selectedTeam = computed(() => this.league.team(this.team() ?? null));
  /** Every other team with how many fair offers you have for them. */
  protected readonly teamChips = computed(() =>
    this.league.otherTeams().map((team) => ({ team, offers: this.valuation.packagesFor(team.players).length })),
  );

  constructor() {
    // Leaguemates may have answered since the last sync.
    this.teamSync.refresh();
  }
}
