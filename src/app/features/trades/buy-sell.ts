import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ValueGap } from '../../../domain/targets';
import { priceLabel } from '../../../domain/trades';
import { StoreService } from '../../core/store.service';
import { ValuationService } from '../../core/valuation.service';
import { EmptyState } from '../../shared/empty-state';
import { GapList } from '../../shared/gap-list';

/** Buy: players you rank above the market, best fair offer first. Sell: your players you rank below it. */
@Component({
  selector: 'app-buy-sell',
  imports: [EmptyState, GapList, RouterLink],
  template: `
    @if (count() === 0) {
      <app-empty-state>
        <a routerLink="/compare" class="text-emerald-400 hover:underline">Swipe a few matchups</a>
        to see where you and the market disagree.
      </app-empty-state>
    } @else {
      <section aria-labelledby="buy-heading">
        <h2 id="buy-heading" class="text-sm font-semibold text-zinc-200">
          Buy <span class="font-normal text-zinc-500">· best deal first</span>
        </h2>
        <app-gap-list
          class="mt-2"
          [gaps]="valuation.rankedTargets()"
          [detail]="offerNote"
          detailEmpty="No fair 1-for-1 from your roster."
          empty="Nobody stands out yet. Keep swiping."
        />
      </section>

      <section class="mt-8" aria-labelledby="sell-heading">
        <h2 id="sell-heading" class="text-sm font-semibold text-zinc-200">
          Sell <span class="font-normal text-zinc-500">· your players you rank lower</span>
        </h2>
        <app-gap-list class="mt-2" [gaps]="valuation.gaps().sells" empty="You're in line with the market on your roster." />
      </section>
    }
  `,
  host: { class: 'block' },
})
export class BuySell {
  private readonly store = inject(StoreService);
  protected readonly valuation = inject(ValuationService);
  protected readonly count = computed(() => this.store.comparisons().length);

  private readonly offers = computed(
    () => new Map(this.valuation.rankedTargets().map((t) => [t.player.id, t.bestOffer])),
  );

  /** "Best offer: Chris Olave · even price" for a ranked target. */
  protected readonly offerNote = (g: ValueGap): string | null => {
    const offer = this.offers().get(g.player.id);
    return offer ? `Best offer: ${offer.send.name} · ${priceLabel(offer.marketDeltaShare)}` : null;
  };
}
