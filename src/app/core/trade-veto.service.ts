import { inject, Service, signal } from '@angular/core';
import { vetoKey } from '../../domain/trades';
import { Player } from '../../domain/types';
import { StoreService } from './store.service';

/** Length of a trade card's exit animation (.never-out in styles.css). */
const NEVER_EXIT_MS = 750;

/** "I would never" on trade cards: the exit animation, recording the answer, and its undo. */
@Service()
export class TradeVetoService {
  private readonly store = inject(StoreService);

  /** The trade whose card is playing its exit animation ("send>receive"). */
  readonly leaving = signal<string | null>(null);
  /** The latest veto, for the Undo notice. */
  readonly last = signal<{ id: string; send: Player; receive: Player } | null>(null);

  isLeaving(send: Player, receive: Player): boolean {
    return this.leaving() === vetoKey(send.id, receive.id);
  }

  /** Stamps and flings the card away, then records the answer (which hides the trade). */
  never(send: Player, receive: Player): void {
    if (this.leaving()) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.record(send, receive);
      return;
    }
    navigator.vibrate?.(25);
    this.leaving.set(vetoKey(send.id, receive.id));
    setTimeout(() => {
      this.leaving.set(null);
      this.record(send, receive);
    }, NEVER_EXIT_MS);
  }

  undo(): void {
    const v = this.last();
    if (v) this.store.removeComparison(v.id);
    this.last.set(null);
  }

  /** Records a strong preference for keeping `send`; the trade is hidden from now on. */
  private record(send: Player, receive: Player): void {
    const { id } = this.store.recordComparison(send.id, receive.id, {
      veto: true,
      baselines: [send.market.baseline, receive.market.baseline],
    });
    this.last.set({ id, send, receive });
  }
}
