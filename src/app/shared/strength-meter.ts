import { Component, computed, input } from '@angular/core';

/** Score thresholds (baseline points of edge) for 2–5 bars; anything that qualifies gets 1. */
const STEPS = [2, 3.5, 5, 7];
const LABELS = ['Slight', 'Decent', 'Good', 'Strong', 'Great'];

/** How good a deal is for you, as 1–5 bars instead of a raw number. */
@Component({
  selector: 'app-strength-meter',
  template: `
    <span class="flex items-end gap-0.5" aria-hidden="true">
      @for (i of bars; track i) {
        <span
          class="w-1.5 rounded-sm"
          [style.height.px]="6 + i * 3"
          [class]="i < level() ? tone() : 'bg-zinc-700'"
        ></span>
      }
    </span>
    <span class="text-xs font-medium text-zinc-300">{{ label() }}</span>
  `,
  host: {
    class: 'inline-flex items-center gap-2',
    role: 'img',
    '[attr.aria-label]': "label() + ' deal for you, ' + level() + ' of 5'",
  },
})
export class StrengthMeter {
  /** The deal's score: your edge in baseline points, less any overpay. */
  readonly score = input.required<number>();
  /** Bar colour class. */
  readonly tone = input('bg-emerald-400');
  protected readonly bars = [0, 1, 2, 3, 4];
  protected readonly level = computed(() => 1 + STEPS.filter((s) => this.score() >= s).length);
  protected readonly label = computed(() => LABELS[this.level() - 1]);
}
