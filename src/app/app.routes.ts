import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'roster' },
  {
    path: 'roster',
    title: 'Roster · FF Tinder',
    loadComponent: () => import('./features/roster/roster-page').then((m) => m.RosterPage),
  },
  {
    path: 'compare',
    title: 'Compare · FF Tinder',
    loadComponent: () => import('./features/compare/compare-page').then((m) => m.ComparePage),
  },
  {
    path: 'targets',
    title: 'Targets · FF Tinder',
    loadComponent: () => import('./features/targets/targets-page').then((m) => m.TargetsPage),
  },
  {
    path: 'trades',
    title: 'Trade Ideas · FF Tinder',
    loadComponent: () => import('./features/trades/trades-page').then((m) => m.TradesPage),
  },
  {
    path: 'profile',
    title: 'Profile · FF Tinder',
    loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
  },
  { path: '**', redirectTo: 'roster' },
];
