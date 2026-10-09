import { Component, computed, ElementRef, inject, input, output, viewChild, afterNextRender } from '@angular/core';
import { formatSalary } from '../../domain/league-import';
import { summarizeSeason } from '../../domain/player-stats';
import { LeagueSettings, Player } from '../../domain/types';
import { LeagueService } from '../core/league.service';
import { InfoState } from '../core/player-info.service';
import { relativeTime } from './format';
import { X } from 'lucide';
import { Icon } from './icon';
import { PlayerAvatar } from './player-avatar';
import { PositionBadge } from './position-badge';

/** Bottom sheet with a player's injury status, this season's weekly points, stats and news. */
@Component({
  selector: 'app-player-details',
  imports: [Icon, PlayerAvatar, PositionBadge],
  template: `
    <div class="fixed inset-0 z-50 bg-black/60" (click)="closed.emit()" aria-hidden="true"></div>
    <section
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="player().name + ' details'"
      class="sheet-in fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-zinc-800 bg-zinc-950 px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:left-1/2 sm:w-[32rem] sm:-translate-x-1/2"
    >
      <div class="flex items-center gap-3">
        <app-player-avatar [player]="player()" [size]="56" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-lg font-semibold text-zinc-50">{{ player().name }}</p>
          <p class="flex items-center gap-1.5 text-xs text-zinc-400">
            <app-position-badge [position]="player().position" />
            {{ player().team ?? 'FA' }}
            @if (info()?.number) {
              · #{{ info()!.number }}
            }
            @if (info()?.depthChart) {
              · Depth {{ info()!.depthChart }}
            }
          </p>
        </div>
        <button
          #close
          type="button"
          class="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          aria-label="Close"
          (click)="closed.emit()"
        >
          <app-icon [icon]="x" [size]="18" />
        </button>
      </div>

      @if (leagueInfo(); as l) {
        <dl class="mt-4 flex flex-wrap gap-2 text-sm" [attr.aria-label]="'In ' + l.leagueName">
          @if (l.contract?.salary != null) {
            <div class="rounded-lg bg-emerald-500/10 px-3 py-1.5">
              <dt class="text-[11px] text-emerald-300/80">Salary</dt>
              <dd class="font-semibold text-emerald-200 tabular-nums">{{ salary(l.contract!.salary!) }}</dd>
            </div>
          }
          <div class="min-w-0 rounded-lg bg-zinc-900 px-3 py-1.5">
            <dt class="text-[11px] text-zinc-500">In {{ l.leagueName }}</dt>
            <dd class="truncate font-semibold text-zinc-100">
              {{ l.owner ? (l.owner.mine ? 'Your team' : l.owner.name) : 'Free agent' }}
            </dd>
          </div>
        </dl>
        @if (l.contract?.info; as note) {
          <p class="mt-1.5 text-xs text-zinc-500">Contract: {{ note }}</p>
        }
      }

      @switch (state()?.status) {
        @case ('loading') {
          <p class="mt-6 text-sm text-zinc-500" role="status">Loading…</p>
        }
        @case ('error') {
          <p class="mt-6 text-sm text-zinc-500">Couldn't load player info right now.</p>
        }
      }

      @if (info(); as i) {
        @if (i.injury; as inj) {
          <div class="mt-4 rounded-lg bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
            <span class="font-semibold">{{ inj.status }}</span>
            @if (inj.bodyPart) {
              · {{ inj.bodyPart }}
            }
            @if (inj.practice) {
              · Practice: {{ inj.practice }}
            }
            @if (inj.notes) {
              <p class="mt-1 text-xs text-rose-300/80">{{ inj.notes }}</p>
            }
          </div>
        }

        <h3 class="mt-5 text-xs font-semibold tracking-wider text-zinc-500 uppercase">This season</h3>
        @if (season().games > 0) {
          <dl class="mt-2 grid grid-cols-3 gap-2 text-center">
            <div class="rounded-lg bg-zinc-900 py-2">
              <dt class="text-[11px] text-zinc-500">Points/game</dt>
              <dd class="text-lg font-semibold tabular-nums">{{ season().pointsPerGame!.toFixed(1) }}</dd>
            </div>
            <div class="rounded-lg bg-zinc-900 py-2">
              <dt class="text-[11px] text-zinc-500">Games</dt>
              <dd class="text-lg font-semibold tabular-nums">{{ season().games }}</dd>
            </div>
            <div class="rounded-lg bg-zinc-900 py-2">
              <dt class="text-[11px] text-zinc-500">Snap share</dt>
              <dd class="text-lg font-semibold tabular-nums">
                {{ season().snapShare === null ? '—' : (season().snapShare! * 100).toFixed(0) + '%' }}
              </dd>
            </div>
          </dl>

          <div class="mt-3 flex h-24 items-end gap-1" aria-label="Fantasy points by week">
            @for (w of season().weeks; track w.week) {
              <div class="flex flex-1 flex-col items-center gap-1">
                <span class="text-[10px] text-zinc-400 tabular-nums">{{ w.points.toFixed(0) }}</span>
                <span
                  class="w-full rounded-t bg-emerald-500/70"
                  [style.height.px]="barHeight(w.points)"
                ></span>
                <span class="text-[10px] text-zinc-600">{{ w.week }}</span>
              </div>
            }
          </div>

          <p class="mt-3 text-xs text-zinc-400">{{ statLine() }}</p>
        } @else {
          <p class="mt-2 text-sm text-zinc-500">No games played yet this season.</p>
        }

        <h3 class="mt-5 text-xs font-semibold tracking-wider text-zinc-500 uppercase">Latest news</h3>
        @for (n of i.news; track $index) {
          <article class="mt-3 border-l-2 border-zinc-800 pl-3">
            <p class="text-sm text-zinc-100">{{ n.headline }}</p>
            @if (n.summary) {
              <p class="mt-1 text-xs leading-relaxed text-zinc-400">{{ n.summary }}</p>
            }
            @if (n.published) {
              <p class="mt-1 text-[11px] text-zinc-600">{{ ago(n.published) }}</p>
            }
          </article>
        } @empty {
          <p class="mt-2 text-sm text-zinc-500">No recent news.</p>
        }
        <p class="mt-5 text-[11px] text-zinc-600">Stats and injuries: Sleeper · News: RotoWire via ESPN</p>
      }
    </section>
  `,
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class PlayerDetails {
  readonly player = input.required<Player>();
  readonly state = input<InfoState | undefined>();
  readonly ppr = input.required<LeagueSettings['ppr']>();
  readonly closed = output<void>();
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('close');
  private readonly league = inject(LeagueService);
  protected readonly x = X;

  /** Owner, salary and contract in the linked league. */
  protected readonly leagueInfo = computed(() => this.league.info(this.player()));
  protected readonly salary = formatSalary;

  protected readonly info = computed(() => {
    const s = this.state();
    return s?.status === 'ready' ? s.info : null;
  });
  protected readonly season = computed(() => summarizeSeason(this.info()?.weeklyStats ?? {}, this.ppr()));
  private readonly maxPoints = computed(() => Math.max(1, ...this.season().weeks.map((w) => w.points)));

  protected readonly statLine = computed(() => {
    const t = this.season().totals;
    const parts: string[] = [];
    if (t.passYd) parts.push(`${t.passYd} pass yds, ${t.passTd} TD, ${t.int} INT`);
    if (t.rushAtt) parts.push(`${t.rushAtt} rush, ${t.rushYd} yds, ${t.rushTd} TD`);
    if (t.targets || t.rec) parts.push(`${t.rec}/${t.targets} rec, ${t.recYd} yds, ${t.recTd} TD`);
    return parts.join(' · ');
  });

  constructor() {
    afterNextRender(() => this.closeButton()?.nativeElement.focus());
  }

  protected barHeight(points: number): number {
    return Math.max(2, (Math.max(0, points) / this.maxPoints()) * 56);
  }

  protected ago(iso: string): string {
    return relativeTime(iso, Date.now());
  }
}
