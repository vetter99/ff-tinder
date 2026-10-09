import { computed, inject, Service } from '@angular/core';
import { CALIBRATION_COMPARISONS } from '../../domain/active-learning';
import {
  fitModel,
  MODEL,
  personalValues,
  personalWeight,
  positionLeans,
} from '../../domain/preference';
import { findValueGaps, valueGaps } from '../../domain/targets';
import { generateOneForOne } from '../../domain/trades';
import { Player, PlayerId } from '../../domain/types';
import { RankingsService } from './rankings.service';
import { StoreService } from './store.service';

/** Derives everything the screens show from market data + the user's roster and swipes. */
@Service()
export class ValuationService {
  private readonly rankings = inject(RankingsService);
  private readonly store = inject(StoreService);

  readonly players = this.rankings.players;
  readonly playersById = computed(
    () => new Map<PlayerId, Player>(this.players().map((p) => [p.id, p])),
  );

  /** Roster entries resolved to players; ids missing from current data are reported separately. */
  readonly roster = computed(() => {
    const byId = this.playersById();
    return this.store
      .roster()
      .map((id) => byId.get(id))
      .filter((p): p is Player => !!p);
  });
  readonly unrankedRosterIds = computed(() =>
    this.store.roster().filter((id) => !this.playersById().has(id)),
  );

  readonly model = computed(() =>
    fitModel(this.store.comparisons(), this.playersById(), {
      positionLean: this.store.options().positionLean,
    }),
  );
  readonly values = computed(() => personalValues(this.players(), this.model()));
  readonly weight = computed(() => personalWeight(this.model().evidence));
  /** 0–1 share of the maximum personalization reached. */
  readonly confidence = computed(() => this.weight() / MODEL.maxPersonalWeight);
  readonly leans = computed(() => positionLeans(this.model()));
  readonly calibrated = computed(
    () => this.store.comparisons().length >= CALIBRATION_COMPARISONS,
  );

  readonly gaps = computed(() =>
    findValueGaps(this.players(), this.values(), this.store.rosterIds(), {
      requirePlayerEvidence: this.store.options().requirePlayerEvidence,
    }),
  );

  /** Players the user is higher/lower on than consensus, regardless of roster. */
  private readonly allGaps = computed(() =>
    valueGaps(this.players(), this.values(), {
      requirePlayerEvidence: this.store.options().requirePlayerEvidence,
    }),
  );
  readonly higherThanConsensus = computed(() =>
    this.allGaps().filter((g) => g.personal.gap > 0).slice(0, 15),
  );
  readonly lowerThanConsensus = computed(() =>
    this.allGaps().filter((g) => g.personal.gap < 0).slice(0, 15),
  );

  readonly trades = computed(() =>
    generateOneForOne({
      players: this.players(),
      roster: this.roster(),
      values: this.values(),
      requirePlayerEvidence: this.store.options().requirePlayerEvidence,
    }),
  );
}
