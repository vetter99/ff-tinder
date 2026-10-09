import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowRight, X } from 'lucide';
import { Player, POSITIONS } from '../../../domain/types';
import { StoreService } from '../../core/store.service';
import { ValuationService } from '../../core/valuation.service';
import { EmptyState } from '../../shared/empty-state';
import { Icon } from '../../shared/icon';
import { PlayerLine } from '../../shared/player-line';
import { MflImport } from './mfl-import';

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9 ]/g, '');

@Component({
  selector: 'app-roster-page',
  imports: [EmptyState, Icon, MflImport, PlayerLine, RouterLink],
  templateUrl: './roster-page.html',
})
export class RosterPage {
  protected readonly store = inject(StoreService);
  protected readonly valuation = inject(ValuationService);

  protected readonly query = signal('');
  protected readonly arrow = ArrowRight;
  protected readonly x = X;
  protected readonly results = computed(() => {
    const tokens = normalize(this.query()).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const rostered = this.store.rosterIds();
    return this.valuation
      .players()
      .filter((p) => !rostered.has(p.id))
      .filter((p) => {
        const words = normalize(`${p.name} ${p.team ?? ''} ${p.position}`).split(/\s+/);
        return tokens.every((t) => words.some((w) => w.startsWith(t)));
      })
      .slice(0, 8);
  });

  /** Roster grouped by position, most valuable first. */
  protected readonly groups = computed(() => {
    const roster = [...this.valuation.roster()].sort(
      (a, b) => b.market.baseline - a.market.baseline,
    );
    return POSITIONS.map((position) => ({
      position,
      players: roster
        .filter((p) => p.position === position)
        .map((player) => ({ player })),
    })).filter((g) => g.players.length > 0);
  });

  protected add(player: Player): void {
    this.store.addToRoster(player.id);
    this.query.set('');
  }

  protected addFirst(): void {
    const first = this.results()[0];
    if (first) this.add(first);
  }
}
