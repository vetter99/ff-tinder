import { Component, input } from '@angular/core';
import { Position } from '../../domain/types';

const CLASSES: Record<Position, string> = {
  QB: 'bg-rose-500/15 text-rose-300',
  RB: 'bg-emerald-500/15 text-emerald-300',
  WR: 'bg-sky-500/15 text-sky-300',
  TE: 'bg-amber-500/15 text-amber-300',
};

@Component({
  selector: 'app-position-badge',
  template: `<span
    class="inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide {{
      classes[position()]
    }}"
    >{{ position() }}</span
  >`,
})
export class PositionBadge {
  readonly position = input.required<Position>();
  protected readonly classes = CLASSES;
}
