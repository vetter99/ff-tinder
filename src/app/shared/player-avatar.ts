import { Component, computed, input, linkedSignal } from '@angular/core';
import { Player } from '../../domain/types';

/** Sleeper headshot with a team-neutral initials fallback when the image is missing or blocked. */
@Component({
  selector: 'app-player-avatar',
  template: `
    @if (src() && !failed()) {
      <img
        [src]="src()"
        alt=""
        [width]="size()"
        [height]="size()"
        loading="lazy"
        (error)="failed.set(true)"
        class="shrink-0 rounded-full bg-zinc-800 object-cover"
        [style.width.px]="size()"
        [style.height.px]="size()"
      />
    } @else {
      <span
        aria-hidden="true"
        class="flex shrink-0 items-center justify-center rounded-full bg-zinc-800 font-medium text-zinc-300"
        [style.width.px]="size()"
        [style.height.px]="size()"
        [style.font-size.px]="size() * 0.36"
        >{{ initials() }}</span
      >
    }
  `,
  host: { class: 'contents' },
})
export class PlayerAvatar {
  readonly player = input.required<Player>();
  readonly size = input(40);

  protected readonly src = computed(() => {
    const id = this.player().ids.sleeper;
    return id ? `https://sleepercdn.com/content/nfl/players/thumb/${id}.jpg` : null;
  });
  protected readonly failed = linkedSignal(() => {
    this.player();
    return false;
  });
  protected readonly initials = computed(() =>
    this.player()
      .name.split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase(),
  );
}
