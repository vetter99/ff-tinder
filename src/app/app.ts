import { Component, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { RankingsService } from './core/rankings.service';
import { StoreService } from './core/store.service';
import { relativeTime } from './shared/format';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App {
  private readonly store = inject(StoreService);
  protected readonly rankings = inject(RankingsService);

  protected readonly nav = [
    { path: '/roster', label: 'Roster' },
    { path: '/compare', label: 'Compare' },
    { path: '/targets', label: 'Targets' },
    { path: '/trades', label: 'Trades' },
    { path: '/profile', label: 'Profile' },
  ];

  protected readonly freshness = computed(() => {
    const at = this.rankings.fetchedAt();
    const source = this.rankings.source();
    if (!at || !source) return null;
    const label = source === 'snapshot' ? 'Offline snapshot' : 'FantasyCalc';
    return `${label} · ${relativeTime(at, Date.now())}`;
  });

  constructor() {
    effect(() => {
      const settings = this.store.settings();
      untracked(() => this.rankings.load(settings));
    });
  }
}
