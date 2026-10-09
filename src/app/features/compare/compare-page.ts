import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CALIBRATION_COMPARISONS, selectNextPair } from '../../../domain/active-learning';
import { Player } from '../../../domain/types';
import { StoreService } from '../../core/store.service';
import { ValuationService } from '../../core/valuation.service';
import { PlayerAvatar } from '../../shared/player-avatar';
import { PositionBadge } from '../../shared/position-badge';

/** Horizontal drag distance (px) that counts as a swipe. */
const SWIPE_THRESHOLD = 70;

@Component({
  selector: 'app-compare-page',
  imports: [PlayerAvatar, PositionBadge, RouterLink],
  templateUrl: './compare-page.html',
  host: { '(window:keydown)': 'onKey($event)' },
})
export class ComparePage {
  private readonly store = inject(StoreService);
  protected readonly valuation = inject(ValuationService);

  protected readonly pair = signal<[Player, Player] | null>(null);
  protected readonly dragDx = signal(0);
  private dragStartX: number | null = null;
  private suppressClick = false;

  protected readonly count = computed(() => this.store.comparisons().length);
  protected readonly calibrationTotal = CALIBRATION_COMPARISONS;
  protected readonly calibrating = computed(() => this.count() < CALIBRATION_COMPARISONS);
  protected readonly confidencePct = computed(() => Math.round(this.valuation.confidence() * 100));
  protected readonly hasRoster = computed(() => this.store.roster().length > 0);

  constructor() {
    effect(() => {
      if (!this.pair() && this.valuation.players().length > 0) untracked(() => this.next());
    });
  }

  protected choose(winner: Player, loser: Player): void {
    this.store.recordComparison(winner.id, loser.id);
    this.next();
  }

  protected skip(): void {
    const pair = this.pair();
    if (!pair) return;
    this.store.recordComparison(pair[0].id, pair[1].id, true);
    this.next();
  }

  protected undo(): void {
    const last = this.store.undoLastComparison();
    const byId = this.valuation.playersById();
    const a = last && byId.get(last.winner);
    const b = last && byId.get(last.loser);
    if (a && b) this.pair.set([a, b]);
  }

  private next(): void {
    this.pair.set(
      selectNextPair(
        this.valuation.players(),
        this.valuation.model(),
        this.store.rosterIds(),
        this.store.comparisons(),
      ),
    );
  }

  protected pick(side: 0 | 1): void {
    if (this.suppressClick) return;
    const pair = this.pair();
    if (pair) this.choose(pair[side], pair[1 - side]);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey) return;
    if (event.key === 'ArrowLeft') this.pick(0);
    else if (event.key === 'ArrowRight') this.pick(1);
    else if (event.key === 'ArrowDown' || event.key === ' ') this.skip();
    else if (event.key === 'u') this.undo();
    else return;
    event.preventDefault();
  }

  protected onPointerDown(event: PointerEvent): void {
    this.dragStartX = event.clientX;
    this.suppressClick = false;
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.dragStartX !== null) this.dragDx.set(event.clientX - this.dragStartX);
  }

  /** Swiping toward a player picks them: left swipe = left card. */
  protected onPointerUp(): void {
    const dx = this.dragDx();
    this.dragStartX = null;
    this.dragDx.set(0);
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    this.pick(dx < 0 ? 0 : 1);
    // The browser fires a click after pointerup; don't let it pick again.
    this.suppressClick = true;
    setTimeout(() => (this.suppressClick = false));
  }

  protected onPointerCancel(): void {
    this.dragStartX = null;
    this.dragDx.set(0);
  }

  protected wholeYears(age: number): number {
    return Math.floor(age);
  }

  protected leaning(side: 0 | 1): boolean {
    const dx = this.dragDx();
    return side === 0 ? dx < -SWIPE_THRESHOLD / 2 : dx > SWIPE_THRESHOLD / 2;
  }
}
