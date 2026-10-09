import { Component, computed, inject, input } from '@angular/core';
import { TrendingDown, TrendingUp } from 'lucide';
import { ValueGap } from '../../domain/targets';
import { ValuationService } from '../core/valuation.service';
import { EmptyState } from './empty-state';
import { Icon } from './icon';
import { PlayerLine } from './player-line';

/** Players with their positional rank by your values next to the market's ("You WR8 · Market WR14"). */
@Component({
  selector: 'app-gap-list',
  imports: [EmptyState, Icon, PlayerLine],
  template: `
    @if (rows().length > 0) {
      <ul class="divide-y divide-zinc-800/70 rounded-lg border border-zinc-800">
        @for (r of rows(); track r.gap.player.id) {
          <li class="px-3 py-3">
            <div class="flex items-center justify-between gap-3">
              <app-player-line [player]="r.gap.player" />
              <span class="flex shrink-0 items-center gap-3">
                <span class="text-right text-xs leading-tight tabular-nums">
                  <span class="block text-zinc-200">You {{ r.position }}{{ r.yours }}</span>
                  <span class="block text-zinc-500">Market {{ r.position }}{{ r.market }}</span>
                </span>
                @if (r.move === 0) {
                  <span class="w-12 text-center text-sm text-zinc-500" aria-label="Same rank">–</span>
                } @else {
                  <span
                    class="flex w-12 items-center justify-center gap-0.5 rounded px-1.5 py-0.5 text-sm font-semibold tabular-nums"
                    [class]="r.up ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'"
                    [attr.aria-label]="(r.up ? 'Up ' : 'Down ') + r.move + ' spots'"
                  >
                    <app-icon [icon]="r.up ? up : down" [size]="14" />{{ r.move }}
                  </span>
                }
              </span>
            </div>
            @if (detail(); as fn) {
              @if (fn(r.gap); as text) {
                <p class="mt-1.5 text-xs text-emerald-300/90">{{ text }}</p>
              } @else if (detailEmpty()) {
                <p class="mt-1.5 text-xs text-zinc-500">{{ detailEmpty() }}</p>
              }
            }
          </li>
        }
      </ul>
    } @else {
      <app-empty-state>{{ empty() }}</app-empty-state>
    }
  `,
  host: { class: 'block' },
})
export class GapList {
  readonly gaps = input.required<ValueGap[]>();
  readonly empty = input('Nothing yet.');
  /** Optional highlighted second line (e.g. the best trade offer); falls back to `detailEmpty`. */
  readonly detail = input<((g: ValueGap) => string | null) | null>(null);
  readonly detailEmpty = input<string | null>(null);
  private readonly valuation = inject(ValuationService);
  protected readonly up = TrendingUp;
  protected readonly down = TrendingDown;

  protected readonly rows = computed(() => {
    const { personal, market } = this.valuation.positionRanks();
    return this.gaps().map((gap) => {
      const yours = personal.get(gap.player.id) ?? 0;
      const mkt = market.get(gap.player.id) ?? 0;
      return {
        gap,
        position: gap.player.position,
        yours,
        market: mkt,
        move: Math.abs(mkt - yours),
        up: gap.personal.gap > 0,
      };
    });
  });
}
