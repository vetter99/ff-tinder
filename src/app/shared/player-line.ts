import { Component, input } from '@angular/core';
import { Player } from '../../domain/types';
import { PlayerAvatar } from './player-avatar';
import { PositionBadge } from './position-badge';

/** Compact avatar + name + position/team row used across lists. */
@Component({
  selector: 'app-player-line',
  imports: [PlayerAvatar, PositionBadge],
  template: `
    <app-player-avatar [player]="player()" [size]="size()" />
    <span class="min-w-0">
      <span class="block truncate font-medium text-zinc-100">{{ player().name }}</span>
      <span class="flex items-center gap-1.5 text-xs text-zinc-400">
        <app-position-badge [position]="player().position" />
        {{ player().team ?? 'FA' }}
      </span>
    </span>
  `,
  host: { class: 'flex min-w-0 items-center gap-3' },
})
export class PlayerLine {
  readonly player = input.required<Player>();
  readonly size = input(36);
}
