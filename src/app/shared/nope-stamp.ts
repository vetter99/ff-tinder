import { Component } from '@angular/core';
import { X } from 'lucide';
import { Icon } from './icon';

/** The "NOPE" stamp on a card being rejected with "I would never". */
@Component({
  selector: 'app-nope-stamp',
  imports: [Icon],
  template: `NOPE <app-icon [icon]="x" [size]="14" [strokeWidth]="3" />`,
  host: {
    class:
      'stamp-pop pointer-events-none absolute top-10 right-4 z-10 flex items-center gap-1 rounded-lg border-2 border-rose-400 bg-zinc-950/70 px-2 py-0.5 text-sm font-black tracking-widest text-rose-300',
    'aria-hidden': 'true',
  },
})
export class NopeStamp {
  protected readonly x = X;
}
