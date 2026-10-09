import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CALIBRATION_COMPARISONS } from '../../../domain/active-learning';
import { LeagueService } from '../../core/league.service';
import { TeamSyncService } from '../../core/team-sync.service';
import { TradeVetoService } from '../../core/trade-veto.service';
import { StoreService } from '../../core/store.service';
import { ValuationService } from '../../core/valuation.service';
import { signed } from '../../shared/format';
import { PlayerLine } from '../../shared/player-line';
import { NeverButton } from './never-button';
import { ThreeWayCard } from './three-way-card';
import { offerFromIdea, TradeCard } from './trade-card';
import { TradeRoom } from './trade-room';

@Component({
  selector: 'app-trades-page',
  imports: [PlayerLine, RouterLink, NeverButton, ThreeWayCard, TradeCard, TradeRoom],
  template: `
    <h1 class="text-xl font-semibold">Trade ideas</h1>
    <p class="mt-1 text-sm text-zinc-400">
      1-for-1 swaps for players you value more than consensus does, relative to what you give up, at
      prices the other manager could accept. Your lineup needs are ignored.
    </p>

    @if (remaining() > 0) {
      <p class="mt-4 rounded-md bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
        Ideas come from your answers.
        <a routerLink="/compare" class="text-emerald-400 hover:underline"
          >{{ remaining() }} more comparison{{ remaining() === 1 ? '' : 's' }}</a
        >
        will make them more reliable.
      </p>
    }

    @if (veto.last(); as v) {
      <div
        class="mt-4 flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300"
        role="status"
      >
        <span>Got it: you'd never trade {{ v.send.name }} for {{ v.receive.name }}. Suggestions updated.</span>
        <button type="button" class="shrink-0 font-medium text-emerald-400 hover:underline" (click)="veto.undo()">
          Undo
        </button>
      </div>
    }

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
                <span
                  class="rounded-full px-1.5 text-xs tabular-nums"
                  [class]="t.offers > 0 ? 'bg-emerald-500/20 text-emerald-200' : 'bg-zinc-800 text-zinc-500'"
                  [attr.aria-label]="t.offers + ' offers'"
                  >{{ t.offers }}</span
                >
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
          <h2 id="matches-heading" class="shrink-0 text-sm font-medium text-amber-200">League matches</h2>
          @if (teamSync.members(); as members) {
            <p class="text-right text-xs text-zinc-500">
              {{ members }} of {{ teamSync.teams() }} teams in {{ link.leagueName }} on FF Tinder
            </p>
          }
        </div>
        @switch (teamSync.status()) {
          @case ('unavailable') {
            <p class="mt-2 rounded-lg border border-dashed border-zinc-800 px-4 py-4 text-sm text-zinc-500">
              League matching isn't available on this server.
            </p>
          }
          @case ('error') {
            <p class="mt-2 rounded-lg border border-dashed border-zinc-800 px-4 py-4 text-sm text-zinc-500" role="status">
              Couldn't check for matches right now. They'll update on your next visit.
            </p>
          }
          @default {
            @if (teamSync.threeWay().length > 0) {
              <ul class="mt-2 space-y-4" aria-label="3-way matches">
                @for (m of teamSync.threeWay(); track m.send.id + m.first.sends.id + m.second.sends.id) {
                  <li><app-three-way-card [match]="m" /></li>
                }
              </ul>
            }
            <ul class="mt-4 space-y-4">
              @for (m of teamSync.matches(); track m.franchiseId + m.send.id + m.receive.id) {
                <li
                  class="relative overflow-hidden rounded-xl border border-amber-400/60 bg-amber-500/5 shadow-[0_0_24px_-8px] shadow-amber-400/40"
                  [class.never-out]="veto.isLeaving(m.send, m.receive)"
                >
                  @if (veto.isLeaving(m.send, m.receive)) {
                    <span
                      class="stamp-pop pointer-events-none absolute top-10 right-4 z-10 rounded-lg border-2 border-rose-400 bg-zinc-950/70 px-2 py-0.5 text-sm font-black tracking-widest text-rose-300"
                      aria-hidden="true"
                      >NOPE ✕</span
                    >
                  }
                  <p class="flex items-center gap-2 bg-gradient-to-r from-amber-400 to-yellow-300 px-4 py-1.5 text-sm font-semibold text-zinc-950">
                    <span aria-hidden="true">★</span> It's a match: you both want this
                  </p>
                  <div class="p-4">
                    <div class="grid grid-cols-2 gap-4">
                      <div class="min-w-0">
                        <p class="mb-2 text-[11px] font-semibold tracking-wider text-rose-300/80 uppercase">You send</p>
                        <app-player-line [player]="m.send" />
                      </div>
                      <div class="min-w-0">
                        <p class="mb-2 text-[11px] font-semibold tracking-wider text-emerald-300/80 uppercase">
                          From {{ m.franchiseName }}
                        </p>
                        <app-player-line [player]="m.receive" />
                      </div>
                    </div>
                    <p class="mt-3 text-xs text-zinc-400">
                      You like {{ m.receive.name }} more than consensus does next to {{ m.send.name }}
                      (edge <span class="font-semibold text-amber-200 tabular-nums">{{ signed(m.yourEdge) }}</span>),
                      and {{ m.franchiseName }} feels the same about {{ m.send.name }}. Fair by market.
                    </p>
                    <div class="mt-3 flex justify-end">
                      <app-never-button
                        [send]="m.send"
                        [receive]="m.receive"
                        [disabled]="veto.leaving() !== null"
                        (pressed)="veto.never(m.send, m.receive)"
                      />
                    </div>
                  </div>
                </li>
              } @empty {
                @if (teamSync.threeWay().length === 0) {
                <li class="rounded-lg border border-dashed border-amber-400/30 px-4 py-4 text-sm text-zinc-400">
                  @if (teamSync.status() === 'syncing' && teamSync.members() === null) {
                    Checking your league for matches…
                  } @else if (teamSync.members() === 1) {
                    You're the first from {{ link.leagueName }} here. When leaguemates import their
                    teams, trades you both want show up here in gold.
                  } @else {
                    No mutual trades yet. Matches update as you and your leaguemates keep comparing.
                  }
                </li>
                }
              }
            </ul>
          }
        }
      </section>
    } @else {
      <p class="mt-4 rounded-md bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
        <a routerLink="/roster" class="text-amber-200 hover:underline">Import your team from MyFantasyLeague</a>
        to see trades your leaguemates want too.
      </p>
    }

    <h2 class="mt-8 text-sm font-medium text-zinc-300">Ideas from your preferences</h2>
    <ul class="mt-2 space-y-4">
      @for (t of ideas(); track t.send[0].id + t.receive[0].id) {
        <li><app-trade-card [offer]="t" /></li>
      } @empty {
        <li
          class="rounded-lg border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500"
        >
          No fair trades match your preferences yet. Keep comparing, or add more of your roster.
        </li>
      }
    </ul>
    }
  `,
})
export class TradesPage {
  /** `?team=<franchise id>`: trade with one team in the linked league. */
  readonly team = input<string>();
  protected readonly store = inject(StoreService);
  protected readonly valuation = inject(ValuationService);
  protected readonly teamSync = inject(TeamSyncService);
  protected readonly league = inject(LeagueService);
  protected readonly veto = inject(TradeVetoService);
  protected readonly signed = signed;
  protected readonly ideas = computed(() => this.valuation.trades().map(offerFromIdea));
  protected readonly remaining = computed(() =>
    Math.max(0, CALIBRATION_COMPARISONS - this.store.comparisons().length),
  );

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
