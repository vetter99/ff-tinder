import { Component, computed, inject, signal } from '@angular/core';
import { POSITIONS } from '../../../domain/types';
import { RankingsService } from '../../core/rankings.service';
import { StoreService } from '../../core/store.service';
import { ValuationService } from '../../core/valuation.service';
import { relativeTime, signed } from '../../shared/format';
import { GapList } from '../../shared/gap-list';
import { PositionBadge } from '../../shared/position-badge';

@Component({
  selector: 'app-profile-page',
  imports: [GapList, PositionBadge],
  templateUrl: './profile-page.html',
})
export class ProfilePage {
  protected readonly store = inject(StoreService);
  protected readonly rankings = inject(RankingsService);
  protected readonly valuation = inject(ValuationService);
  protected readonly signed = signed;
  protected readonly message = signal<string | null>(null);

  protected readonly stats = computed(() => ({
    comparisons: this.store.comparisons().length,
    informative: this.valuation.model().evidence,
    personalization: Math.round(this.valuation.confidence() * 100),
    personalShare: Math.round(this.valuation.weight() * 100),
  }));

  protected readonly leans = computed(() => {
    const leans = this.valuation.leans();
    const max = Math.max(1, ...POSITIONS.map((p) => Math.abs(leans[p])));
    return POSITIONS.map((position) => ({
      position,
      value: leans[position],
      width: (Math.abs(leans[position]) / max) * 50,
    }));
  });

  protected readonly dataLabel = computed(() => {
    const at = this.rankings.fetchedAt();
    return at ? relativeTime(at, Date.now()) : '—';
  });

  protected exportData(): void {
    const blob = new Blob([this.store.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ff-tinder-profile.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  protected async importData(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      this.store.importJson(await file.text());
      this.message.set('Profile imported.');
    } catch {
      this.message.set("That file isn't a valid FF Tinder export.");
    }
  }

  protected clearComparisons(): void {
    if (confirm('Delete all comparisons? Your roster is kept.')) this.store.clearComparisons();
  }

  protected resetAll(): void {
    if (confirm('Delete your roster, comparisons and settings from this browser?')) {
      this.store.resetAll();
    }
  }

  protected refresh(): void {
    this.rankings.load(this.store.settings(), { force: true });
  }
}
