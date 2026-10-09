import { Component, computed, effect, inject, untracked } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TeamSyncService } from './core/team-sync.service';
import { RankingsService } from './core/rankings.service';
import { StoreService } from './core/store.service';
import { ArrowLeftRight, Layers, User, Users } from 'lucide';
import { Icon } from './shared/icon';

@Component({
  selector: 'app-root',
  imports: [Icon, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App {
  private readonly store = inject(StoreService);
  private readonly router = inject(Router);
  protected readonly rankings = inject(RankingsService);
  /** Created at startup so the linked team's answers and matches stay in sync from any page. */
  private readonly teamSync = inject(TeamSyncService);

  protected readonly nav = [
    { path: '/roster', label: 'Roster', icon: Users, needsRoster: false },
    { path: '/compare', label: 'Swipe', icon: Layers, needsRoster: true },
    { path: '/trades', label: 'Trades', icon: ArrowLeftRight, needsRoster: true },
    { path: '/profile', label: 'Me', icon: User, needsRoster: true },
  ];
  protected readonly hasRoster = computed(() => this.store.roster().length > 0);

  constructor() {
    effect(() => {
      const settings = this.store.settings();
      untracked(() => this.rankings.load(settings));
    });
    // If the roster empties while on another page (e.g. "Reset everything"), go back to Roster.
    effect(() => {
      if (this.hasRoster()) return;
      untracked(() => {
        if (this.router.navigated && !this.router.url.startsWith('/roster')) {
          this.router.navigateByUrl('/roster');
        }
      });
    });
  }
}
