import { computed, effect, Service, signal } from '@angular/core';
import {
  Comparison,
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_SETTINGS,
  LeagueSettings,
  ModelOptions,
  PlayerId,
} from '../../domain/types';
import { normalizeSettings } from '../../domain/format';
import { LeagueLink } from '../../domain/league-import';
import { ComparisonLog, mergeLogs, sameLog, teamKey } from '../../domain/team-sync';
import { readJson, removeKey, writeJson } from './storage';

// Keeps the app's original name so existing saved data still loads after the rename.
const STORAGE_KEY = 'ff-tinder:state';
const SCHEMA_VERSION = 1;

export interface PersistedState {
  schemaVersion: number;
  settings: LeagueSettings;
  options: ModelOptions;
  roster: PlayerId[];
  /** Set when the roster was imported from a league site. */
  league: LeagueLink | null;
  comparisons: Comparison[];
  /** Ids of removed comparisons, so syncing with the team's saved answers doesn't restore them. */
  deletedComparisons: string[];
  /** The league team (see `teamKey`) whose saved answers these comparisons were merged with. */
  syncedTeam: string | null;
}

function emptyState(): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: DEFAULT_SETTINGS,
    options: DEFAULT_MODEL_OPTIONS,
    roster: [],
    league: null,
    comparisons: [],
    deletedComparisons: [],
    syncedTeam: null,
  };
}

/** Upgrades older saved state. Add a case per schema bump; unknown shapes start fresh. */
function migrate(raw: Partial<PersistedState> | null): PersistedState {
  if (!raw || raw.schemaVersion !== SCHEMA_VERSION) return emptyState();
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: normalizeSettings({ ...DEFAULT_SETTINGS, ...raw.settings }),
    options: { ...DEFAULT_MODEL_OPTIONS, ...raw.options },
    roster: Array.isArray(raw.roster) ? raw.roster : [],
    league: raw.league ?? null,
    comparisons: Array.isArray(raw.comparisons) ? raw.comparisons : [],
    deletedComparisons: Array.isArray(raw.deletedComparisons) ? raw.deletedComparisons : [],
    syncedTeam: typeof raw.syncedTeam === 'string' ? raw.syncedTeam : null,
  };
}

/** All user state. Lives in localStorage; the comparison log is the source of truth for the model. */
@Service()
export class StoreService {
  private readonly state = signal<PersistedState>(migrate(readJson(STORAGE_KEY)));

  readonly settings = computed(() => this.state().settings);
  readonly options = computed(() => this.state().options);
  readonly roster = computed(() => this.state().roster);
  readonly rosterIds = computed(() => new Set(this.state().roster));
  readonly league = computed(() => this.state().league);
  readonly comparisons = computed(() => this.state().comparisons);
  /** Comparisons plus deletions, as synced with the linked team's saved answers. */
  readonly log = computed<ComparisonLog>(() => ({
    comparisons: this.state().comparisons,
    deleted: this.state().deletedComparisons,
  }));

  constructor() {
    effect(() => writeJson(STORAGE_KEY, this.state()));
  }

  updateSettings(patch: Partial<LeagueSettings>): void {
    this.state.update((s) => ({ ...s, settings: normalizeSettings({ ...s.settings, ...patch }) }));
  }

  setOption<K extends keyof ModelOptions>(key: K, value: ModelOptions[K]): void {
    this.state.update((s) => ({ ...s, options: { ...s.options, [key]: value } }));
  }

  addToRoster(id: PlayerId): void {
    this.state.update((s) => (s.roster.includes(id) ? s : { ...s, roster: [...s.roster, id] }));
  }

  /** Replaces the roster with an imported one and remembers where it came from. */
  /**
   * Replaces the roster with an imported one and remembers where it came from. Switching to a
   * different team than the answers were synced with starts from that team's saved answers instead.
   */
  importRoster(ids: PlayerId[], league: LeagueLink, settings: Partial<LeagueSettings>): void {
    this.state.update((s) => {
      const otherTeam = s.syncedTeam !== null && s.syncedTeam !== teamKey(league.leagueId, league.franchiseId);
      return {
        ...s,
        roster: [...new Set(ids)],
        league,
        settings: normalizeSettings({ ...s.settings, ...settings }),
        ...(otherTeam ? { comparisons: [], deletedComparisons: [], syncedTeam: null } : {}),
      };
    });
  }

  /** Merges the team's saved answers into the local ones (new answers made meanwhile are kept). */
  mergeTeamLog(team: string, remote: ComparisonLog): void {
    this.state.update((s) => {
      const local = { comparisons: s.comparisons, deleted: s.deletedComparisons };
      const merged = mergeLogs(local, remote);
      if (sameLog(local, merged)) return s.syncedTeam === team ? s : { ...s, syncedTeam: team };
      return { ...s, comparisons: merged.comparisons, deletedComparisons: merged.deleted, syncedTeam: team };
    });
  }

  unlinkLeague(): void {
    this.state.update((s) => ({ ...s, league: null }));
  }

  removeFromRoster(id: PlayerId): void {
    this.state.update((s) => ({ ...s, roster: s.roster.filter((r) => r !== id) }));
  }

  recordComparison(
    winner: PlayerId,
    loser: PlayerId,
    {
      tie = false,
      veto = false,
      baselines,
    }: { tie?: boolean; veto?: boolean; baselines?: [number, number] } = {},
  ): Comparison {
    const comparison: Comparison = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      winner,
      loser,
      ...(tie ? { tie: true } : {}),
      ...(veto ? { veto: true } : {}),
      ...(baselines ? { baselines } : {}),
    };
    this.state.update((s) => ({ ...s, comparisons: [...s.comparisons, comparison] }));
    return comparison;
  }

  removeComparison(id: string): void {
    this.state.update((s) => withoutComparisons(s, [id]));
  }

  undoLastComparison(): Comparison | undefined {
    const last = this.state().comparisons.at(-1);
    if (last) this.state.update((s) => withoutComparisons(s, [last.id]));
    return last;
  }

  exportJson(): string {
    return JSON.stringify(this.state(), null, 2);
  }

  /** Replaces all state with an exported file. Throws on invalid input. */
  importJson(text: string): void {
    const parsed = JSON.parse(text) as Partial<PersistedState>;
    if (parsed.schemaVersion !== SCHEMA_VERSION) throw new Error('Unsupported or invalid file');
    this.state.set(migrate(parsed));
  }

  clearComparisons(): void {
    this.state.update((s) => withoutComparisons(s, s.comparisons.map((c) => c.id)));
  }

  resetAll(): void {
    removeKey(STORAGE_KEY);
    this.state.set(emptyState());
  }
}

/** Removes comparisons and remembers their ids, so other devices delete them too. */
function withoutComparisons(s: PersistedState, ids: string[]): PersistedState {
  const gone = new Set(ids);
  return {
    ...s,
    comparisons: s.comparisons.filter((c) => !gone.has(c.id)),
    deletedComparisons: [...s.deletedComparisons, ...ids],
  };
}
