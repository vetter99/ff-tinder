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
import { readJson, removeKey, writeJson } from './storage';

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
  /**
   * Random id that claims the linked league team for league matching. Moves with Export/Import so
   * another device can take over the claim; kept on reset so a reset can't lock you out of it.
   */
  deviceToken: string;
}

function emptyState(deviceToken: string = crypto.randomUUID()): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: DEFAULT_SETTINGS,
    options: DEFAULT_MODEL_OPTIONS,
    roster: [],
    league: null,
    comparisons: [],
    deviceToken,
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
    deviceToken: typeof raw.deviceToken === 'string' ? raw.deviceToken : crypto.randomUUID(),
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
  readonly deviceToken = computed(() => this.state().deviceToken);

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
  importRoster(ids: PlayerId[], league: LeagueLink, settings: Partial<LeagueSettings>): void {
    this.state.update((s) => ({
      ...s,
      roster: [...new Set(ids)],
      league,
      settings: normalizeSettings({ ...s.settings, ...settings }),
    }));
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
    this.state.update((s) => ({ ...s, comparisons: s.comparisons.filter((c) => c.id !== id) }));
  }

  undoLastComparison(): Comparison | undefined {
    const last = this.state().comparisons.at(-1);
    this.state.update((s) => ({ ...s, comparisons: s.comparisons.slice(0, -1) }));
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
    this.state.update((s) => ({ ...s, comparisons: [] }));
  }

  resetAll(): void {
    const token = this.state().deviceToken;
    removeKey(STORAGE_KEY);
    this.state.set(emptyState(token));
  }
}
