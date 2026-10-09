import { Component, computed, inject, signal } from '@angular/core';
import { valueChart } from '../../../domain/value-chart';
import { ModelOptions, Position, POSITIONS } from '../../../domain/types';
import { RankingsService } from '../../core/rankings.service';
import { StoreService } from '../../core/store.service';
import { ValuationService } from '../../core/valuation.service';
import { relativeTime, signed } from '../../shared/format';
import { GapList } from '../../shared/gap-list';
import { HelpTip } from '../../shared/help-tip';
import { PlayerLine } from '../../shared/player-line';
import { PositionBadge } from '../../shared/position-badge';

const CHART_PREVIEW_ROWS = 50;

@Component({
  selector: 'app-profile-page',
  imports: [GapList, HelpTip, PlayerLine, PositionBadge],
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

  protected readonly chartFilters: (Position | null)[] = [null, ...POSITIONS];
  protected readonly chartPosition = signal<Position | null>(null);
  protected readonly chartShowAll = signal(false);
  private readonly chart = computed(() =>
    valueChart(this.valuation.players(), this.valuation.values(), this.chartPosition()),
  );
  protected readonly chartRows = computed(() =>
    this.chartShowAll() ? this.chart() : this.chart().slice(0, CHART_PREVIEW_ROWS),
  );
  protected readonly chartHidden = computed(() => this.chart().length - this.chartRows().length);

  protected readonly dataLabel = computed(() => {
    const at = this.rankings.fetchedAt();
    return at ? relativeTime(at, Date.now()) : '—';
  });

  protected setOption(key: keyof ModelOptions, value: boolean): void {
    this.store.setOption(key, value);
  }

  protected rankShift(row: { yourRank: number; marketRank: number }): string {
    const d = row.marketRank - row.yourRank;
    if (d === 0) return '—';
    return d > 0 ? `▲${d}` : `▼${-d}`;
  }

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
