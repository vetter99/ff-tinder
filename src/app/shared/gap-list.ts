import { Component, input } from '@angular/core';
import { ValueGap } from '../../domain/targets';
import { signed } from './format';
import { PlayerLine } from './player-line';

/** List of players with consensus value → personal value and the gap between them. */
@Component({
  selector: 'app-gap-list',
  imports: [PlayerLine],
  template: `
    @if (gaps().length > 0) {
      <ul class="divide-y divide-zinc-800/70 rounded-lg border border-zinc-800 bg-zinc-900/40">
        @for (g of gaps(); track g.player.id) {
          <li class="px-3 py-3">
            <div class="flex items-center justify-between gap-3">
              <app-player-line [player]="g.player" />
              <span class="flex shrink-0 items-center gap-3 text-right">
                <span class="text-xs text-zinc-500">
                  {{ g.personal.baseline.toFixed(0) }} → {{ g.personal.value.toFixed(0) }}
                </span>
                <span
                  class="w-14 rounded px-1.5 py-0.5 text-center text-sm font-semibold tabular-nums"
                  [class]="
                    g.personal.gap > 0
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-rose-500/15 text-rose-300'
                  "
                  >{{ signed(g.personal.gap) }}</span
                >
              </span>
            </div>
            @if (explain(); as fn) {
              <p class="mt-1.5 text-xs text-zinc-500">{{ fn(g) }}</p>
            }
          </li>
        }
      </ul>
    } @else {
      <p class="rounded-lg border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
        {{ empty() }}
      </p>
    }
  `,
  host: { class: 'block' },
})
export class GapList {
  readonly gaps = input.required<ValueGap[]>();
  readonly empty = input('Nothing yet.');
  readonly explain = input<((g: ValueGap) => string) | null>(null);
  protected readonly signed = signed;
}
