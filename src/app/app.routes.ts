import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { StoreService } from './core/store.service';

const hasRoster = () => inject(StoreService).roster().length > 0;

/** Every page except Roster needs a roster to be useful; send new users to set one up first. */
const requireRoster: CanActivateFn = () =>
  hasRoster() || inject(Router).createUrlTree(['/roster']);

export const routes: Routes = [
  // New users start by setting up their roster; returning users go straight to comparing.
  { path: '', pathMatch: 'full', redirectTo: () => (hasRoster() ? 'compare' : 'roster') },
  {
    path: 'roster',
    title: 'Roster · Trade Bait',
    loadComponent: () => import('./features/roster/roster-page').then((m) => m.RosterPage),
  },
  {
    path: 'compare',
    title: 'Swipe · Trade Bait',
    canActivate: [requireRoster],
    loadComponent: () => import('./features/compare/compare-page').then((m) => m.ComparePage),
  },
  // Targets became the "Buy & sell" view of Trades.
  { path: 'targets', redirectTo: () => inject(Router).parseUrl('/trades?view=market') },
  {
    path: 'trades',
    title: 'Trades · Trade Bait',
    canActivate: [requireRoster],
    loadComponent: () => import('./features/trades/trades-page').then((m) => m.TradesPage),
  },
  {
    path: 'profile',
    title: 'Me · Trade Bait',
    canActivate: [requireRoster],
    loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
  },
  { path: '**', redirectTo: 'roster' },
];
