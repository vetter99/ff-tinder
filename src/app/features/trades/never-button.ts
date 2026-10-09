import { Component, input, output } from '@angular/core';
import { Player } from '../../../domain/types';

/** The "I would never" button on a trade card. Wiggles on hover; the card handles the exit. */
@Component({
  selector: 'app-never-button',
  template: `
    <button
      type="button"
      class="never-btn inline-flex items-center gap-1.5 rounded-full border border-rose-400/50 bg-gradient-to-r from-rose-500/20 to-pink-500/20 px-3.5 py-1.5 text-xs font-bold text-rose-100 shadow-[0_0_16px_-6px] shadow-rose-500/60 transition hover:border-rose-300 hover:from-rose-500/35 hover:to-pink-500/35 active:scale-90 disabled:opacity-60"
      [disabled]="disabled()"
      [attr.aria-label]="'I would never trade ' + send().name + ' for ' + receive().name"
      (click)="pressed.emit()"
    >
      <span class="never-emoji text-base leading-none" aria-hidden="true">🙅</span>
      I would never
    </button>
  `,
  host: { class: 'contents' },
})
export class NeverButton {
  readonly send = input.required<Player>();
  readonly receive = input.required<Player>();
  readonly disabled = input(false);
  readonly pressed = output();
}
