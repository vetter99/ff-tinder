import { Component, computed, input } from '@angular/core';
import { summarizeSeason } from '../../domain/player-stats';
import { LeagueSettings } from '../../domain/types';
import { InfoState } from '../core/player-info.service';
import { relativeTime } from './format';

/** Compact injury / production / latest-news line for a comparison card. */
@Component({
  selector: 'app-player-snapshot',
  template: `
    <span class="flex flex-wrap items-center justify-center gap-1.5 text-xs">
      @switch (state()?.status) {
        @case ('ready') {
          @if (injury(); as inj) {
            <span
              class="rounded px-1.5 py-0.5 font-bold"
              [class]="severe() ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'"
              [title]="inj.status + (inj.bodyPart ? ' · ' + inj.bodyPart : '')"
              >{{ inj.tag }}{{ inj.bodyPart ? ' · ' + inj.bodyPart : '' }}</span
            >
          }
          @if (season().pointsPerGame !== null) {
            <span class="rounded bg-white/10 px-1.5 py-0.5 text-zinc-200 tabular-nums">
              {{ season().pointsPerGame!.toFixed(1) }} ppg
            </span>
          }
          @if (season().last; as last) {
            <span class="rounded bg-white/10 px-1.5 py-0.5 text-zinc-300 tabular-nums">
              Wk {{ last.week }}: {{ last.points.toFixed(1) }}
            </span>
          }
        }
        @case ('loading') {
          <span class="h-5 w-28 animate-pulse rounded bg-white/10" aria-label="Loading player info"></span>
        }
      }
    </span>
    @if (latest(); as n) {
      <span class="mt-1.5 line-clamp-1 max-w-full px-2 text-[11px] leading-snug text-zinc-400 sm:line-clamp-2">
        <span class="text-zinc-500">{{ age() }}</span> · {{ n.headline }}
      </span>
    }
  `,
  host: { class: 'flex flex-col items-center' },
})
export class PlayerSnapshot {
  readonly state = input<InfoState | undefined>();
  readonly ppr = input.required<LeagueSettings['ppr']>();

  private readonly info = computed(() => {
    const s = this.state();
    return s?.status === 'ready' ? s.info : null;
  });
  protected readonly injury = computed(() => this.info()?.injury ?? null);
  protected readonly severe = computed(() =>
    ['OUT', 'IR', 'PUP', 'SUS', 'D'].includes(this.injury()?.tag ?? ''),
  );
  protected readonly season = computed(() => summarizeSeason(this.info()?.weeklyStats ?? {}, this.ppr()));
  /** Only show news from the last ~10 days on the card; older items live in the details sheet. */
  protected readonly latest = computed(() => {
    const n = this.info()?.news[0];
    if (!n?.published) return null;
    return Date.now() - Date.parse(n.published) < 10 * 24 * 60 * 60 * 1000 ? n : null;
  });
  protected readonly age = computed(() => {
    const p = this.latest()?.published;
    return p ? relativeTime(p, Date.now()) : '';
  });
}
