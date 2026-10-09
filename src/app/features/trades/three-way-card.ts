import { Component, computed, inject, input, signal } from '@angular/core';
import { LeagueThreeWay } from '../../core/team-sync.service';
import { StoreService } from '../../core/store.service';
import { TradeVetoService } from '../../core/trade-veto.service';
import { ArrowRight, Check, Copy, Star } from 'lucide';
import { Icon } from '../../shared/icon';
import { NopeStamp } from '../../shared/nope-stamp';
import { PlayerLine } from '../../shared/player-line';
import { StrengthMeter } from '../../shared/strength-meter';
import { NeverButton } from './never-button';

/** A gold 3-way match: you → team B → team C → you, with a message for the three-team chat. */
@Component({
  selector: 'app-three-way-card',
  imports: [Icon, NeverButton, NopeStamp, PlayerLine, StrengthMeter],
  template: `
    @if (leaving()) {
      <app-nope-stamp />
    }
    <p class="flex items-center gap-2 bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950">
      <app-icon [icon]="star" [size]="15" [filled]="true" /> 3-way match
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
            <p class="flex items-center gap-1 truncate text-xs font-medium text-zinc-500">
              {{ leg.from }} <app-icon [icon]="arrow" [size]="12" /> {{ leg.to }}
            </p>
            <app-player-line class="mt-1" [player]="leg.player" />
          </div>
        </li>
      }
    </ol>
    <div class="px-4 pb-4">
      <app-strength-meter [score]="match().score" tone="bg-amber-400" />
      <p class="mt-2 text-xs text-zinc-400">All three teams come out ahead · fair prices</p>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 px-3.5 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/10"
          (click)="copy()"
        >
          <app-icon [icon]="copied() ? check : copyIcon" [size]="14" />
          {{ copied() ? 'Copied' : 'Copy for group chat' }}
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
      'relative block overflow-hidden rounded-xl border border-amber-400/60 bg-amber-500/5',
    '[class.never-out]': 'leaving()',
  },
})
export class ThreeWayCard {
  readonly match = input.required<LeagueThreeWay>();
  protected readonly veto = inject(TradeVetoService);
  private readonly store = inject(StoreService);
  protected readonly star = Star;
  protected readonly arrow = ArrowRight;
  protected readonly check = Check;
  protected readonly copyIcon = Copy;
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
