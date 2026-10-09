import { Component, input, output } from '@angular/core';
import { Ban } from 'lucide';
import { Player } from '../../../domain/types';
import { Icon } from '../../shared/icon';

/** The "I would never" button on a trade card. Wiggles on hover; the card handles the exit. */
@Component({
  selector: 'app-never-button',
  imports: [Icon],
  template: `
    <button
      type="button"
      class="never-btn inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/10 px-3.5 py-1.5 text-xs font-semibold text-rose-200 transition hover:border-rose-300 hover:bg-rose-500/20 active:scale-90 disabled:opacity-60"
      [disabled]="disabled()"
      [attr.aria-label]="'I would never trade ' + send().name + ' for ' + receive().name"
      (click)="pressed.emit()"
    >
      <app-icon class="never-emoji" [icon]="ban" [size]="15" [strokeWidth]="2.5" />
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
  protected readonly ban = Ban;
}
