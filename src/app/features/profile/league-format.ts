import { Component, computed, inject } from '@angular/core';
import { SCORING_LABELS, SUPPORTED_FORMATS } from '../../../domain/format';
import { LeagueSettings } from '../../../domain/types';
import { StoreService } from '../../core/store.service';

/** Which FantasyCalc market values to use: only formats FantasyCalc publishes are offered. */
@Component({
  selector: 'app-league-format',
  template: `
    <div class="space-y-3">
      @for (group of groups(); track group.label) {
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span class="w-16 text-xs text-zinc-400" [id]="'fmt-' + group.label">{{ group.label }}</span>
          <div class="flex flex-wrap gap-1.5" role="radiogroup" [attr.aria-labelledby]="'fmt-' + group.label">
            @for (o of group.options; track o.label) {
              <button
                type="button"
                role="radio"
                class="rounded-full border px-3 py-1.5 text-sm"
                [class]="
                  o.selected
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                "
                [attr.aria-checked]="o.selected"
                (click)="store.updateSettings(o.patch)"
              >
                {{ o.label }}
              </button>
            }
          </div>
        </div>
      }
    </div>
    <p class="mt-3 text-xs text-zinc-500">
      @if (store.league()) {
        Set from your MFL import.
      }
      Dynasty uses long-term values instead of rest-of-season.
    </p>
  `,
  host: { class: 'block' },
})
export class LeagueFormat {
  protected readonly store = inject(StoreService);

  /** Every choice FantasyCalc supports, grouped for tap-to-select buttons. */
  protected readonly groups = computed(() => {
    const s = this.store.settings();
    const option = (label: string, patch: Partial<LeagueSettings>, selected: boolean) => ({
      label,
      patch,
      selected,
    });
    return [
      {
        label: 'Type',
        options: [
          option('Redraft', { dynasty: false }, !s.dynasty),
          option('Dynasty', { dynasty: true }, s.dynasty),
        ],
      },
      {
        label: 'Teams',
        options: SUPPORTED_FORMATS.teams.map((n) => option(String(n), { teams: n }, s.teams === n)),
      },
      {
        label: 'Scoring',
        options: ([1, 0.5, 0] as const).map((ppr) => option(SCORING_LABELS[ppr], { ppr }, s.ppr === ppr)),
      },
      {
        label: 'QBs',
        options: [
          option('1 QB', { superflex: false }, !s.superflex),
          option('Superflex', { superflex: true }, s.superflex),
        ],
      },
    ];
  });
}
