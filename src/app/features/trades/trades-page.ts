import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CALIBRATION_COMPARISONS } from '../../../domain/active-learning';
import { vetoKey } from '../../../domain/trades';
import { Player } from '../../../domain/types';
import { LeagueMatchesService } from '../../core/league-matches.service';
import { StoreService } from '../../core/store.service';
import { ValuationService } from '../../core/valuation.service';
import { signed } from '../../shared/format';
import { PlayerLine } from '../../shared/player-line';
import { NeverButton } from './never-button';

/** Length of the card's exit animation (.never-out in styles.css). */
const NEVER_EXIT_MS = 750;

@Component({
  selector: 'app-trades-page',
  imports: [PlayerLine, RouterLink, NeverButton],
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

    @if (lastVeto(); as v) {
      <div
        class="mt-4 flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300"
        role="status"
      >
        <span>Got it: you'd never trade {{ v.send.name }} for {{ v.receive.name }}. Suggestions updated.</span>
        <button type="button" class="shrink-0 font-medium text-emerald-400 hover:underline" (click)="undoNever()">
          Undo
        </button>
      </div>
    }

    @if (store.league(); as link) {
      <section class="mt-6" aria-labelledby="matches-heading">
        <div class="flex items-baseline justify-between gap-3">
          <h2 id="matches-heading" class="shrink-0 text-sm font-medium text-amber-200">League matches</h2>
          @if (leagueMatches.members(); as members) {
            <p class="text-right text-xs text-zinc-500">
              {{ members }} of {{ leagueMatches.teams() }} teams in {{ link.leagueName }} on FF Tinder
            </p>
          }
        </div>
        @switch (leagueMatches.status()) {
          @case ('claimed') {
            <p class="mt-2 rounded-lg border border-dashed border-zinc-800 px-4 py-4 text-sm text-zinc-400">
              {{ link.franchiseName }} is already linked on another device, so matches show there. To
              move here, export your data from that device's Profile page and import it on this one.
            </p>
          }
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
            <ul class="mt-2 space-y-4">
              @for (m of leagueMatches.matches(); track m.franchiseId + m.send.id + m.receive.id) {
                <li
                  class="relative overflow-hidden rounded-xl border border-amber-400/60 bg-amber-500/5 shadow-[0_0_24px_-8px] shadow-amber-400/40"
                  [class.never-out]="isLeaving(m.send, m.receive)"
                >
                  @if (isLeaving(m.send, m.receive)) {
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
                        [disabled]="leaving() !== null"
                        (pressed)="never(m.send, m.receive)"
                      />
                    </div>
                  </div>
                </li>
              } @empty {
                <li class="rounded-lg border border-dashed border-amber-400/30 px-4 py-4 text-sm text-zinc-400">
                  @if (leagueMatches.status() === 'syncing' && leagueMatches.members() === null) {
                    Checking your league for matches…
                  } @else if (leagueMatches.members() === 1) {
                    You're the first from {{ link.leagueName }} here. When leaguemates import their
                    teams, trades you both want show up here in gold.
                  } @else {
                    No mutual trades yet. Matches update as you and your leaguemates keep comparing.
                  }
                </li>
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
      @for (t of valuation.trades(); track t.send.id + t.receive.id) {
        <li
          class="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
          [class.never-out]="isLeaving(t.send, t.receive)"
        >
          @if (isLeaving(t.send, t.receive)) {
            <span
              class="stamp-pop pointer-events-none absolute top-10 right-4 z-10 rounded-lg border-2 border-rose-400 bg-zinc-950/70 px-2 py-0.5 text-sm font-black tracking-widest text-rose-300"
              aria-hidden="true"
              >NOPE ✕</span
            >
          }
          <div class="grid grid-cols-2 gap-4">
            <div class="min-w-0">
              <p class="mb-2 text-[11px] font-semibold tracking-wider text-rose-300/80 uppercase">
                You send
              </p>
              <app-player-line [player]="t.send" />
            </div>
            <div class="min-w-0">
              <p
                class="mb-2 text-[11px] font-semibold tracking-wider text-emerald-300/80 uppercase"
              >
                You receive
              </p>
              <app-player-line [player]="t.receive" />
            </div>
          </div>
          <div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <span class="text-zinc-400">
              Your value
              <span class="font-semibold text-emerald-300 tabular-nums">{{
                signed(t.personalGain)
              }}</span>
            </span>
            <span class="text-zinc-400">
              Market
              <span class="font-semibold text-zinc-200 tabular-nums">{{
                marketLabel(t.marketDeltaShare)
              }}</span>
            </span>
          </div>
          <ul class="mt-3 space-y-1 text-xs text-zinc-500">
            @for (r of t.reasons; track $index) {
              <li>{{ r }}</li>
            }
          </ul>
          <div class="mt-3 flex justify-end">
            <app-never-button
              [send]="t.send"
              [receive]="t.receive"
              [disabled]="leaving() !== null"
              (pressed)="never(t.send, t.receive)"
            />
          </div>
        </li>
      } @empty {
        <li
          class="rounded-lg border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500"
        >
          No fair trades match your preferences yet. Keep comparing, or add more of your roster.
        </li>
      }
    </ul>
  `,
})
export class TradesPage {
  protected readonly store = inject(StoreService);
  protected readonly valuation = inject(ValuationService);
  protected readonly leagueMatches = inject(LeagueMatchesService);
  protected readonly signed = signed;
  protected readonly remaining = computed(() =>
    Math.max(0, CALIBRATION_COMPARISONS - this.store.comparisons().length),
  );

  protected readonly lastVeto = signal<{ id: string; send: Player; receive: Player } | null>(null);

  constructor() {
    // Leaguemates may have answered since the last sync.
    this.leagueMatches.refresh();
  }

  /** The trade whose card is playing its exit animation ("send>receive"). */
  protected readonly leaving = signal<string | null>(null);

  protected isLeaving(send: Player, receive: Player): boolean {
    return this.leaving() === vetoKey(send.id, receive.id);
  }

  /** "I would never": stamp and fling the card away, then record the answer (which hides it). */
  protected never(send: Player, receive: Player): void {
    if (this.leaving()) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      this.recordNever(send, receive);
      return;
    }
    navigator.vibrate?.(25);
    this.leaving.set(vetoKey(send.id, receive.id));
    setTimeout(() => {
      this.leaving.set(null);
      this.recordNever(send, receive);
    }, NEVER_EXIT_MS);
  }

  /** Records a strong preference for keeping `send`; the trade is hidden from now on. */
  private recordNever(send: Player, receive: Player): void {
    const { id } = this.store.recordComparison(send.id, receive.id, {
      veto: true,
      baselines: [send.market.baseline, receive.market.baseline],
    });
    this.lastVeto.set({ id, send, receive });
  }

  protected undoNever(): void {
    const v = this.lastVeto();
    if (v) this.store.removeComparison(v.id);
    this.lastVeto.set(null);
  }

  protected marketLabel(share: number): string {
    const pct = Math.round(Math.abs(share) * 100);
    if (pct <= 2) return 'even';
    return share > 0 ? `you +${pct}%` : `you −${pct}%`;
  }
}
