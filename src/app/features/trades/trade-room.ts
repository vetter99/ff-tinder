import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatSalaryShort } from '../../../domain/league-import';
import { PackageGroup, TradePackage } from '../../../domain/packages';
import { buildPitch } from '../../../domain/pitch';
import { SCOUT_GOAL, scoutCount } from '../../../domain/scouting';
import { Player } from '../../../domain/types';
import { LeagueService, LeagueTeam } from '../../core/league.service';
import { StoreService } from '../../core/store.service';
import { ValuationService } from '../../core/valuation.service';
import { TradeCard } from './trade-card';

/** Offers already ticked when a team is opened. */
const PRESELECTED = 3;

const GROUPS: { group: PackageGroup; title: string; hint: string }[] = [
  { group: 'one-for-one', title: '1 for 1', hint: 'Straight swaps.' },
  { group: 'two-for-two', title: '2 for 2', hint: 'Two of yours for two of theirs.' },
  { group: 'consolidate', title: 'Consolidate', hint: 'Send more players than you get back.' },
  { group: 'spread', title: 'Add depth', hint: 'Turn one of yours into more of theirs.' },
];

/**
 * Trading with one team: scout your players against theirs, then pick from fair offers (1-for-1 up
 * to 2-for-3) built from their actual roster and send them a pitch. They don't need the app.
 */
@Component({
  selector: 'app-trade-room',
  imports: [RouterLink, TradeCard],
  template: `
    <h2 class="truncate text-lg font-semibold text-zinc-50">Trade with {{ team().name }}</h2>

    <div
      class="mt-3 rounded-xl border p-4"
      [class]="scouted() >= goal ? 'border-zinc-800 bg-zinc-900/40' : 'border-sky-500/40 bg-sky-500/10'"
    >
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-zinc-100">
            @if (scouted() >= goal) {
              ✅ Scouted · {{ scouted() }} matchups
            } @else {
              🔍 Scout {{ team().name }}
            }
          </p>
          <p class="mt-0.5 text-xs text-zinc-400">
            @if (scouted() >= goal) {
              Keep going anytime to sharpen these offers.
            } @else {
              Swipe your players against theirs, then see your offers. {{ scouted() }}/{{ goal }}
            }
          </p>
        </div>
        <a
          [routerLink]="['/compare']"
          [queryParams]="{ scout: team().id }"
          class="shrink-0 rounded-full px-4 py-2 text-sm font-semibold"
          [class]="scouted() >= goal ? 'border border-zinc-700 text-zinc-200 hover:bg-zinc-800' : 'bg-sky-400 text-zinc-950 hover:bg-sky-300'"
        >
          {{ scouted() === 0 ? 'Start' : scouted() >= goal ? 'Scout more' : 'Continue' }}
        </a>
      </div>
      <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
        <div class="h-full rounded-full bg-sky-400 transition-all" [style.width.%]="(100 * Math.min(scouted(), goal)) / goal"></div>
      </div>
    </div>

    @for (g of groups(); track g.group) {
      <section class="mt-6" [attr.aria-labelledby]="'group-' + g.group">
        <h3 [id]="'group-' + g.group" class="text-sm font-semibold text-zinc-200">
          {{ g.title }} <span class="font-normal text-zinc-500">· {{ g.hint }}</span>
        </h3>
        <ul class="mt-2 space-y-4">
          @for (t of g.packages; track key(t)) {
            <li>
              <app-trade-card [offer]="t" [receiveLabel]="'From ' + team().name">
                <label class="flex cursor-pointer items-center gap-2 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    class="size-4 accent-emerald-400"
                    [checked]="selected().has(key(t))"
                    (change)="toggle(t)"
                  />
                  Add to pitch
                </label>
              </app-trade-card>
            </li>
          }
        </ul>
      </section>
    } @empty {
      <p class="mt-6 rounded-lg border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
        No fair trades with {{ team().name }} yet.
        <a [routerLink]="['/compare']" [queryParams]="{ scout: team().id }" class="text-sky-300 hover:underline"
          >Scout their roster</a
        >
        to find some.
      </p>
    }

    @if (offers().length > 0) {
      <section class="mt-8 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4" aria-labelledby="pitch-heading">
        <h3 id="pitch-heading" class="text-sm font-semibold text-emerald-200">
          Your pitch to {{ team().name }}
          <span class="font-normal text-zinc-400">· {{ picked().length }} offer{{ picked().length === 1 ? '' : 's' }}</span>
        </h3>
        @if (picked().length === 0) {
          <p class="mt-2 text-sm text-zinc-400">Tick "Add to pitch" on the offers you'd make.</p>
        } @else {
          <label for="pitch-text" class="sr-only">Pitch message</label>
          <textarea
            id="pitch-text"
            rows="8"
            class="mt-3 w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm leading-relaxed text-zinc-100 focus:border-emerald-500 focus:outline-none"
            [value]="pitch()"
            (input)="pitch.set($any($event.target).value)"
          ></textarea>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
              (click)="copy()"
            >
              {{ copied() ? 'Copied ✓' : 'Copy message' }}
            </button>
            @if (canShare) {
              <button
                type="button"
                class="rounded-full border border-emerald-500/50 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/10"
                (click)="share()"
              >
                Share…
              </button>
            }
            <span class="text-xs text-zinc-500" role="status">{{
              copied() ? 'Paste it in a text or your league chat.' : ''
            }}</span>
          </div>
        }
      </section>
    }
  `,
  host: { class: 'block' },
})
export class TradeRoom {
  readonly team = input.required<LeagueTeam>();
  private readonly valuation = inject(ValuationService);
  private readonly league = inject(LeagueService);
  private readonly store = inject(StoreService);
  protected readonly goal = SCOUT_GOAL;
  protected readonly Math = Math;

  protected readonly scouted = computed(() =>
    scoutCount(this.store.comparisons(), this.store.rosterIds(), new Set(this.team().players.map((p) => p.id))),
  );
  protected readonly offers = computed(() => this.valuation.packagesFor(this.team().players));
  protected readonly groups = computed(() =>
    GROUPS.map((g) => ({ ...g, packages: this.offers().filter((p) => p.group === g.group) })).filter(
      (g) => g.packages.length > 0,
    ),
  );
  /** Offers in the pitch; the best few start ticked. */
  protected readonly selected = linkedSignal(
    () => new Set(this.offers().slice(0, PRESELECTED).map((t) => this.key(t))),
  );
  protected readonly picked = computed(() => this.offers().filter((t) => this.selected().has(this.key(t))));
  /** The message, regenerated when the picks change; the user can edit it before sending. */
  protected readonly pitch = linkedSignal(() =>
    buildPitch(
      this.store.league()?.franchiseName ?? 'me',
      this.team().name,
      this.picked().map((t) => ({
        send: t.send,
        receive: t.receive,
        sendSalary: this.salary(t.send),
        receiveSalary: this.salary(t.receive),
      })),
    ),
  );
  protected readonly copied = signal(false);
  protected readonly canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  protected key(t: TradePackage): string {
    return `${t.send.map((p) => p.id).join('+')}>${t.receive.map((p) => p.id).join('+')}`;
  }

  protected toggle(t: TradePackage): void {
    const key = this.key(t);
    this.selected.update((s) => {
      const next = new Set(s);
      if (!next.delete(key)) next.add(key);
      return next;
    });
    this.copied.set(false);
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.pitch());
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }

  protected async share(): Promise<void> {
    try {
      await navigator.share({ text: this.pitch() });
    } catch {
      // Cancelled or unavailable; the copy button still works.
    }
  }

  /** A side's total salary, if every player on it has one. */
  private salary(players: readonly Player[]): string | null {
    const salaries = players.map((p) => this.league.salary(p));
    return salaries.every((s) => s !== null) ? formatSalaryShort(salaries.reduce((a, b) => a + b!, 0)) : null;
  }
}
