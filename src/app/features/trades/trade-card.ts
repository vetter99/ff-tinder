import { Component, computed, inject, input } from '@angular/core';
import { formatSalaryShort } from '../../../domain/league-import';
import { headline } from '../../../domain/packages';
import { TradeIdea } from '../../../domain/trades';
import { Player } from '../../../domain/types';
import { LeagueService } from '../../core/league.service';
import { TradeVetoService } from '../../core/trade-veto.service';
import { signed } from '../../shared/format';
import { PlayerLine } from '../../shared/player-line';
import { NeverButton } from './never-button';

/** What a trade card shows: one or more players each way. */
export interface TradeOffer {
  send: readonly Player[];
  receive: readonly Player[];
  personalGain: number;
  marketDeltaShare: number;
  reasons: readonly string[];
}

export function offerFromIdea(idea: TradeIdea): TradeOffer {
  return { ...idea, send: [idea.send], receive: [idea.receive] };
}

/**
 * A trade: the players each way, value and market summary, salaries in salary leagues, the reasons,
 * and "I would never". Extra controls can be projected into the footer's left side.
 */
@Component({
  selector: 'app-trade-card',
  imports: [PlayerLine, NeverButton],
  template: `
    @if (leaving()) {
      <span
        class="stamp-pop pointer-events-none absolute top-10 right-4 z-10 rounded-lg border-2 border-rose-400 bg-zinc-950/70 px-2 py-0.5 text-sm font-black tracking-widest text-rose-300"
        aria-hidden="true"
        >NOPE ✕</span
      >
    }
    <div class="grid grid-cols-2 gap-4">
      <div class="min-w-0">
        <p class="mb-2 text-[11px] font-semibold tracking-wider text-rose-300/80 uppercase">You send</p>
        <ul class="space-y-2">
          @for (p of offer().send; track p.id) {
            <li><app-player-line [player]="p" /></li>
          }
        </ul>
      </div>
      <div class="min-w-0">
        <p class="mb-2 truncate text-[11px] font-semibold tracking-wider text-emerald-300/80 uppercase">
          {{ receiveLabel() }}
        </p>
        <ul class="space-y-2">
          @for (p of offer().receive; track p.id) {
            <li><app-player-line [player]="p" /></li>
          }
        </ul>
      </div>
    </div>
    <div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
      <span class="text-zinc-400">
        Your value
        <span class="font-semibold text-emerald-300 tabular-nums">{{ signed(offer().personalGain) }}</span>
      </span>
      <span class="text-zinc-400">
        Market <span class="font-semibold text-zinc-200 tabular-nums">{{ market() }}</span>
      </span>
      @if (salaries(); as s) {
        <span class="text-zinc-400">
          Salary
          <span class="font-semibold text-zinc-200 tabular-nums">{{ s.send }} → {{ s.receive }}</span>
        </span>
      }
    </div>
    <ul class="mt-3 space-y-1 text-xs text-zinc-500">
      @for (r of offer().reasons; track $index) {
        <li>{{ r }}</li>
      }
    </ul>
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
  protected readonly signed = signed;

  /** "I would never" applies to each side's best player, which is what the deal hinges on. */
  protected readonly headliners = computed(() =>
    headline(this.offer()),
  );
  protected readonly leaving = computed(() => this.veto.isLeaving(...this.headliners()));

  protected readonly market = computed(() => {
    const share = this.offer().marketDeltaShare;
    const pct = Math.round(Math.abs(share) * 100);
    if (pct <= 2) return 'even';
    return share > 0 ? `you +${pct}%` : `you −${pct}%`;
  });

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
