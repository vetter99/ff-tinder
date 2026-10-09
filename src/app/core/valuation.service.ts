import { computed, inject, Service } from '@angular/core';
import { CALIBRATION_COMPARISONS } from '../../domain/active-learning';
import {
  fitModel,
  MODEL,
  needsRefresh,
  personalValues,
  personalWeight,
  positionLeans,
} from '../../domain/preference';
import { findValueGaps, valueGaps } from '../../domain/targets';
import {
  allOneForOneIdeas,
  pickDiverse,
  rankTargets,
  TradeIdea,
  vetoedTrades,
  vetoKey,
} from '../../domain/trades';
import { findPackages, TradePackage } from '../../domain/packages';
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
  /** Players whose answers have faded or gone stale (the weekly check-in). */
  readonly refreshCount = computed(
    () => [...this.model().players.values()].filter((b) => needsRefresh(b)).length,
  );
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

  /**
   * Each player's rank within their position by the user's values and by market value, so lists
   * can say "You WR8 · Market WR14" instead of showing raw model points.
   */
  readonly positionRanks = computed(() => {
    const values = this.values();
    const personal = new Map<PlayerId, number>();
    const market = new Map<PlayerId, number>();
    const byPosition = new Map<string, Player[]>();
    for (const p of this.players()) byPosition.set(p.position, [...(byPosition.get(p.position) ?? []), p]);
    for (const group of byPosition.values()) {
      const rank = (score: (p: Player) => number, into: Map<PlayerId, number>) =>
        [...group].sort((a, b) => score(b) - score(a)).forEach((p, i) => into.set(p.id, i + 1));
      rank((p) => values.get(p.id)?.value ?? p.market.baseline, personal);
      rank((p) => p.market.baseline, market);
    }
    return { personal, market };
  });

  /** Players the user is higher/lower on than the market, regardless of roster. */
  private readonly allGaps = computed(() =>
    valueGaps(this.players(), this.values(), {
      requirePlayerEvidence: this.store.options().requirePlayerEvidence,
    }),
  );
  readonly higherThanMarket = computed(() =>
    this.allGaps().filter((g) => g.personal.gap > 0).slice(0, 15),
  );
  readonly lowerThanMarket = computed(() =>
    this.allGaps().filter((g) => g.personal.gap < 0).slice(0, 15),
  );

  private readonly tradeContext = computed(() => ({
    players: this.players(),
    roster: this.roster(),
    values: this.values(),
    requirePlayerEvidence: this.store.options().requirePlayerEvidence,
  }));
  /** Trades the user said they would never make ("send>receive" keys). */
  readonly vetoed = computed(() => vetoedTrades(this.store.comparisons()));
  /** Every fair 1-for-1 the user hasn't vetoed, best first. */
  private readonly allIdeas = computed(() => this.unvetoed(allOneForOneIdeas(this.tradeContext())));
  /** Trade Ideas page: the best ideas, varied so no player dominates the list. */
  readonly trades = computed(() => pickDiverse(this.allIdeas()));
  /** Targets ranked by the best fair offer the user could make for each. */
  readonly rankedTargets = computed(() => rankTargets(this.gaps().targets, this.allIdeas()));

  /** Fair trades with one team (1-for-1 up to 2-for-3), best first and varied. */
  packagesFor(theirPlayers: readonly Player[]): TradePackage[] {
    const ctx = this.tradeContext();
    return findPackages({
      roster: ctx.roster,
      theirs: theirPlayers,
      values: ctx.values,
      requirePlayerEvidence: ctx.requirePlayerEvidence,
      vetoed: this.vetoed(),
    });
  }

  private unvetoed(ideas: TradeIdea[]): TradeIdea[] {
    const vetoed = this.vetoed();
    return ideas.filter((t) => !vetoed.has(vetoKey(t.send.id, t.receive.id)));
  }
}
