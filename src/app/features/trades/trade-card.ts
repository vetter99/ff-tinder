import { Component, computed, inject, input } from '@angular/core';
import { formatSalaryShort } from '../../../domain/league-import';
import { headline } from '../../../domain/packages';
import { TradeIdea } from '../../../domain/trades';
import { Player } from '../../../domain/types';
import { LeagueService } from '../../core/league.service';
import { TradeVetoService } from '../../core/trade-veto.service';
import { NopeStamp } from '../../shared/nope-stamp';
import { PlayerLine } from '../../shared/player-line';
import { StrengthMeter } from '../../shared/strength-meter';
import { NeverButton } from './never-button';

/** What a trade card shows: one or more players each way. */
export interface TradeOffer {
  send: readonly Player[];
  receive: readonly Player[];
  /** Your edge less any overpay, in baseline points (drives the strength meter). */
  score: number;
  summary: string;
}

export function offerFromIdea(idea: TradeIdea): TradeOffer {
  return { ...idea, send: [idea.send], receive: [idea.receive] };
}

/**
 * A trade: the players each way, how good it is for you, one line on why, salaries in salary
 * leagues, and "I would never". Extra controls can be projected into the footer's left side.
 */
@Component({
  selector: 'app-trade-card',
  imports: [NeverButton, NopeStamp, PlayerLine, StrengthMeter],
  template: `
    @if (leaving()) {
      <app-nope-stamp />
    }
    <div class="grid grid-cols-2 gap-4">
      <div class="min-w-0">
        <p class="mb-2 text-xs font-medium text-zinc-500">You send</p>
        <ul class="space-y-2">
          @for (p of offer().send; track p.id) {
            <li><app-player-line [player]="p" /></li>
          }
        </ul>
      </div>
      <div class="min-w-0">
        <p class="mb-2 truncate text-xs font-medium text-zinc-500">{{ receiveLabel() }}</p>
        <ul class="space-y-2">
          @for (p of offer().receive; track p.id) {
            <li><app-player-line [player]="p" /></li>
          }
        </ul>
      </div>
    </div>
    <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
      <app-strength-meter [score]="offer().score" />
      @if (salaries(); as s) {
        <span class="text-xs text-zinc-500 tabular-nums">Salary {{ s.send }} out, {{ s.receive }} in</span>
      }
    </div>
    <p class="mt-2 text-xs text-zinc-400">{{ offer().summary }}</p>
    <div class="mt-3 flex items-center justify-between gap-3">
      <span class="min-w-0"><ng-content /></span>
      <app-never-button
        [send]="headliners()[0]"
        [receive]="headliners()[1]"
        [disabled]="veto.leaving() !== null"
        (pressed)="veto.never(headliners()[0], headliners()[1])"
      />
    </div>
  `,
  host: {
    class: 'relative block overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40 p-4',
    '[class.never-out]': 'leaving()',
  },
})
export class TradeCard {
  readonly offer = input.required<TradeOffer>();
  readonly receiveLabel = input('You receive');
  protected readonly veto = inject(TradeVetoService);
  private readonly league = inject(LeagueService);

  /** "I would never" applies to each side's best player, which is what the deal hinges on. */
  protected readonly headliners = computed(() => headline(this.offer()));
  protected readonly leaving = computed(() => this.veto.isLeaving(...this.headliners()));

  /** Total salaries out and in, when every player in the deal has one. */
  protected readonly salaries = computed(() => {
    const total = (ps: readonly Player[]) => {
      const salaries = ps.map((p) => this.league.salary(p));
      return salaries.every((s) => s !== null) ? salaries.reduce((a, b) => a + b!, 0) : null;
    };
    const send = total(this.offer().send);
    const receive = total(this.offer().receive);
    return send === null || receive === null
      ? null
      : { send: formatSalaryShort(send), receive: formatSalaryShort(receive) };
  });
}
