import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CALIBRATION_COMPARISONS } from '../../../domain/active-learning';
import { StoreService } from '../../core/store.service';
import { ValuationService } from '../../core/valuation.service';
import { signed } from '../../shared/format';
import { PlayerLine } from '../../shared/player-line';

@Component({
  selector: 'app-trades-page',
  imports: [PlayerLine, RouterLink],
  template: `
    <h1 class="text-xl font-semibold">Trade ideas</h1>
    <p class="mt-1 text-sm text-zinc-400">
      1-for-1 trades that improve your lineup by your own values while staying close to consensus
      market value.
    </p>

    @if (store.roster().length === 0) {
      <p class="mt-8 rounded-lg border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
        <a routerLink="/roster" class="text-emerald-400 hover:underline">Add your roster</a> to get
        trade ideas.
      </p>
    } @else {
      @if (remaining() > 0) {
        <p class="mt-4 rounded-md bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
          These are based mostly on consensus and lineup fit.
          <a routerLink="/compare" class="text-emerald-400 hover:underline"
            >{{ remaining() }} more comparison{{ remaining() === 1 ? '' : 's' }}</a
          >
          will start personalizing them.
        </p>
      }

      <ul class="mt-6 space-y-4">
        @for (t of valuation.trades(); track t.send.id + t.receive.id) {
          <li class="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="min-w-0">
                <p class="mb-2 text-[11px] font-semibold tracking-wider text-rose-300/80 uppercase">You send</p>
                <app-player-line [player]="t.send" />
              </div>
              <div class="min-w-0">
                <p class="mb-2 text-[11px] font-semibold tracking-wider text-emerald-300/80 uppercase">You receive</p>
                <app-player-line [player]="t.receive" />
              </div>
            </div>
            <div class="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs">
              <span class="text-zinc-400">
                Your lineup value
                <span class="font-semibold text-emerald-300 tabular-nums">{{ signed(t.personalGain) }}</span>
              </span>
              <span class="text-zinc-400">
                Market
                <span class="font-semibold text-zinc-200 tabular-nums">{{ marketLabel(t.marketDeltaShare) }}</span>
              </span>
            </div>
            <ul class="mt-3 space-y-1 text-xs text-zinc-500">
              @for (r of t.reasons; track $index) {
                <li>{{ r }}</li>
              }
            </ul>
          </li>
        } @empty {
          <li class="rounded-lg border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
            No fair trades improve your lineup yet. Keep comparing, or add more of your roster.
          </li>
        }
      </ul>
    }
  `,
})
export class TradesPage {
  protected readonly store = inject(StoreService);
  protected readonly valuation = inject(ValuationService);
  protected readonly signed = signed;
  protected readonly remaining = computed(() =>
    Math.max(0, CALIBRATION_COMPARISONS - this.store.comparisons().length),
  );

  protected marketLabel(share: number): string {
    const pct = Math.round(Math.abs(share) * 100);
    if (pct <= 2) return 'even';
    return share > 0 ? `you +${pct}%` : `you −${pct}%`;
  }
}
