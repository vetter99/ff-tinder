import { Component, computed, inject, input, signal } from '@angular/core';
import { LeagueThreeWay } from '../../core/team-sync.service';
import { StoreService } from '../../core/store.service';
import { TradeVetoService } from '../../core/trade-veto.service';
import { signed } from '../../shared/format';
import { PlayerLine } from '../../shared/player-line';
import { NeverButton } from './never-button';

/** A gold 3-way match: you → team B → team C → you, with a message for the three-team chat. */
@Component({
  selector: 'app-three-way-card',
  imports: [PlayerLine, NeverButton],
  template: `
    @if (leaving()) {
      <span
        class="stamp-pop pointer-events-none absolute top-10 right-4 z-10 rounded-lg border-2 border-rose-400 bg-zinc-950/70 px-2 py-0.5 text-sm font-black tracking-widest text-rose-300"
        aria-hidden="true"
        >NOPE ✕</span
      >
    }
    <p
      class="flex items-center gap-2 bg-gradient-to-r from-amber-400 to-yellow-300 px-4 py-1.5 text-sm font-semibold text-zinc-950"
    >
      <span aria-hidden="true">★</span> 3-way match: all three teams want this
    </p>
    <ol class="space-y-3 p-4">
      @for (leg of legs(); track $index) {
        <li class="flex items-center gap-3">
          <span
            class="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-xs font-bold text-amber-200"
            aria-hidden="true"
            >{{ $index + 1 }}</span
          >
          <div class="min-w-0 flex-1">
            <p class="truncate text-[11px] font-semibold tracking-wider text-amber-200/80 uppercase">
              {{ leg.from }} → {{ leg.to }}
            </p>
            <app-player-line class="mt-1" [player]="leg.player" />
          </div>
        </li>
      }
    </ol>
    <div class="px-4 pb-4">
      <p class="text-xs text-zinc-400">
        You like {{ match().second.sends.name }} more than consensus does next to {{ match().send.name }}
        (edge <span class="font-semibold text-amber-200 tabular-nums">{{ signed(match().yourEdge) }}</span>),
        and the other two teams each prefer what they get too. Every swap is fair by market.
      </p>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          class="rounded-full border border-amber-400/50 px-3.5 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/10"
          (click)="copy()"
        >
          {{ copied() ? 'Copied ✓' : 'Copy for the group chat' }}
        </button>
        <app-never-button
          [send]="match().send"
          [receive]="match().second.sends"
          [disabled]="veto.leaving() !== null"
          (pressed)="veto.never(match().send, match().second.sends)"
        />
      </div>
    </div>
  `,
  host: {
    class:
      'relative block overflow-hidden rounded-xl border border-amber-400/60 bg-amber-500/5 shadow-[0_0_24px_-8px] shadow-amber-400/40',
    '[class.never-out]': 'leaving()',
  },
})
export class ThreeWayCard {
  readonly match = input.required<LeagueThreeWay>();
  protected readonly veto = inject(TradeVetoService);
  private readonly store = inject(StoreService);
  protected readonly signed = signed;
  protected readonly copied = signal(false);

  private readonly me = computed(() => this.store.league()?.franchiseName.trim() || 'Me');
  protected readonly leaving = computed(() => this.veto.isLeaving(this.match().send, this.match().second.sends));
  protected readonly legs = computed(() => {
    const m = this.match();
    return [
      { from: 'You', to: m.first.franchiseName, player: m.send },
      { from: m.first.franchiseName, to: m.second.franchiseName, player: m.first.sends },
      { from: m.second.franchiseName, to: 'You', player: m.second.sends },
    ];
  });

  protected async copy(): Promise<void> {
    const m = this.match();
    const text = [
      '3-way trade idea:',
      `• ${this.me()} sends ${m.send.name} to ${m.first.franchiseName}`,
      `• ${m.first.franchiseName} sends ${m.first.sends.name} to ${m.second.franchiseName}`,
      `• ${m.second.franchiseName} sends ${m.second.sends.name} to ${this.me()}`,
      'Each of us gets a player we like more than the one we give up. In?',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }
}
