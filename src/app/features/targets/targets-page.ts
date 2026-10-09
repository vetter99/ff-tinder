import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { explainGap, signed, ValueGap } from '../../../domain/targets';
import { StoreService } from '../../core/store.service';
import { ValuationService } from '../../core/valuation.service';
import { GapList } from '../../shared/gap-list';

@Component({
  selector: 'app-targets-page',
  imports: [GapList, RouterLink],
  template: `
    <h1 class="text-xl font-semibold">Trade targets</h1>
    <p class="mt-1 text-sm text-zinc-400">
      Players you value above consensus, ranked by the best fair trade you could offer for them: the
      more you like their player <em>and</em> the less you'd give up of what you like, the higher
      they rank.
    </p>

    @if (count() === 0) {
      <p
        class="mt-8 rounded-lg border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500"
      >
        Answer a few
        <a routerLink="/compare" class="text-emerald-400 hover:underline">comparisons</a>
        to discover where you differ from consensus.
      </p>
    } @else {
      <section class="mt-6" aria-labelledby="buy-heading">
        <h2 id="buy-heading" class="text-sm font-medium text-zinc-300">
          Buy: you're higher than consensus
        </h2>
        <app-gap-list
          class="mt-2"
          [gaps]="valuation.rankedTargets()"
          [explain]="explain"
          [detail]="offerNote"
          detailEmpty="No fair 1-for-1 from your roster for this player."
          empty="No players stand out yet. Keep comparing."
        />
      </section>

      <section class="mt-8" aria-labelledby="sell-heading">
        <h2 id="sell-heading" class="text-sm font-medium text-zinc-300">
          Sell: your players you're lower on
        </h2>
        <app-gap-list
          class="mt-2"
          [gaps]="valuation.gaps().sells"
          [explain]="explain"
          empty="You are in line with consensus on your roster so far."
        />
      </section>
    }
  `,
})
export class TargetsPage {
  protected readonly store = inject(StoreService);
  protected readonly valuation = inject(ValuationService);
  protected readonly count = computed(() => this.store.comparisons().length);
  protected readonly explain = explainGap;

  private readonly offers = computed(
    () => new Map(this.valuation.rankedTargets().map((t) => [t.player.id, t.bestOffer])),
  );

  /** "Best offer: Chris Olave (even) · edge +4.1" for a ranked target. */
  protected readonly offerNote = (g: ValueGap): string | null => {
    const offer = this.offers().get(g.player.id);
    if (!offer) return null;
    const pct = Math.round(Math.abs(offer.marketDeltaShare) * 100);
    const market = pct <= 2 ? 'even by market' : offer.marketDelta > 0 ? `you +${pct}% by market` : `you overpay ${pct}%`;
    return `Best offer: ${offer.send.name} (${market}) · your edge ${signed(offer.score)}`;
  };
}
