import { Component, computed, inject, input } from '@angular/core';
import { Star } from 'lucide';
import { LeagueMatch } from '../../core/team-sync.service';
import { TradeVetoService } from '../../core/trade-veto.service';
import { Icon } from '../../shared/icon';
import { NopeStamp } from '../../shared/nope-stamp';
import { PlayerLine } from '../../shared/player-line';
import { StrengthMeter } from '../../shared/strength-meter';
import { NeverButton } from './never-button';

/** A gold 2-team match: a 1-for-1 that you and a leaguemate both want. */
@Component({
  selector: 'app-match-card',
  imports: [Icon, NeverButton, NopeStamp, PlayerLine, StrengthMeter],
  template: `
    @if (leaving()) {
      <app-nope-stamp />
    }
    <p class="flex items-center gap-2 bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950">
      <app-icon [icon]="star" [size]="15" [filled]="true" /> It's a match
    </p>
    <div class="p-4">
      <div class="grid grid-cols-2 gap-4">
        <div class="min-w-0">
          <p class="mb-2 text-xs font-medium text-zinc-500">You send</p>
          <app-player-line [player]="match().send" />
        </div>
        <div class="min-w-0">
          <p class="mb-2 truncate text-xs font-medium text-zinc-500">From {{ match().franchiseName }}</p>
          <app-player-line [player]="match().receive" />
        </div>
      </div>
      <div class="mt-4">
        <app-strength-meter [score]="match().score" tone="bg-amber-400" />
      </div>
      <p class="mt-2 text-xs text-zinc-400">You both come out ahead · fair price</p>
      <div class="mt-3 flex justify-end">
        <app-never-button
          [send]="match().send"
          [receive]="match().receive"
          [disabled]="veto.leaving() !== null"
          (pressed)="veto.never(match().send, match().receive)"
        />
      </div>
    </div>
  `,
  host: {
    class: 'relative block overflow-hidden rounded-xl border border-amber-400/60 bg-amber-500/5',
    '[class.never-out]': 'leaving()',
  },
})
export class MatchCard {
  readonly match = input.required<LeagueMatch>();
  protected readonly veto = inject(TradeVetoService);
  protected readonly star = Star;
  protected readonly leaving = computed(() => this.veto.isLeaving(this.match().send, this.match().receive));
}
