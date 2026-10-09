import { DestroyRef, inject, Service, signal } from '@angular/core';

/** The user's choice; "system" follows the device's light/dark setting. */
export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'trade-bait:theme';

/**
 * Light or dark sports-book look, applied as data-theme on <html>. index.html applies the saved
 * choice before the first paint; this keeps it in sync when the user or the device changes it.
 */
@Service()
export class ThemeService {
  readonly preference = signal<ThemePreference>(readPreference());
  private readonly media = matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    const onChange = () => this.apply();
    this.media.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => this.media.removeEventListener('change', onChange));
    this.apply();
  }

  set(preference: ThemePreference): void {
    this.preference.set(preference);
    try {
      localStorage.setItem(STORAGE_KEY, preference); // plain string: index.html reads it before Angular loads
    } catch {
      // The choice just won't persist.
    }
    this.apply();
  }

  private apply(): void {
    const pref = this.preference();
    const dark = pref === 'dark' || (pref === 'system' && this.media.matches);
    document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#020617' : '#f1f5f9');
  }
}

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'book') return 'light';
    if (saved === 'dark') return 'dark';
  } catch {
    // fall through
  }
  return 'system';
}
