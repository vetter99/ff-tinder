import { computed, effect, Service, signal } from '@angular/core';
import { Comparison, DEFAULT_SETTINGS, LeagueSettings, PlayerId } from '../../domain/types';
import { readJson, removeKey, writeJson } from './storage';

const STORAGE_KEY = 'ff-tinder:state';
const SCHEMA_VERSION = 1;

export interface PersistedState {
  schemaVersion: number;
  settings: LeagueSettings;
  roster: PlayerId[];
  comparisons: Comparison[];
}

function emptyState(): PersistedState {
  return { schemaVersion: SCHEMA_VERSION, settings: DEFAULT_SETTINGS, roster: [], comparisons: [] };
}

/** Upgrades older saved state. Add a case per schema bump; unknown shapes start fresh. */
function migrate(raw: Partial<PersistedState> | null): PersistedState {
  if (!raw || raw.schemaVersion !== SCHEMA_VERSION) return emptyState();
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS, ...raw.settings },
    roster: Array.isArray(raw.roster) ? raw.roster : [],
    comparisons: Array.isArray(raw.comparisons) ? raw.comparisons : [],
  };
}

/** All user state. Lives in localStorage; the comparison log is the source of truth for the model. */
@Service()
export class StoreService {
  private readonly state = signal<PersistedState>(migrate(readJson(STORAGE_KEY)));

  readonly settings = computed(() => this.state().settings);
  readonly roster = computed(() => this.state().roster);
  readonly rosterIds = computed(() => new Set(this.state().roster));
  readonly comparisons = computed(() => this.state().comparisons);

  constructor() {
    effect(() => writeJson(STORAGE_KEY, this.state()));
  }

  updateSettings(patch: Partial<LeagueSettings>): void {
    this.state.update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  }

  addToRoster(id: PlayerId): void {
    this.state.update((s) => (s.roster.includes(id) ? s : { ...s, roster: [...s.roster, id] }));
  }

  removeFromRoster(id: PlayerId): void {
    this.state.update((s) => ({ ...s, roster: s.roster.filter((r) => r !== id) }));
  }

  recordComparison(winner: PlayerId, loser: PlayerId, tie = false): void {
    const comparison: Comparison = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      winner,
      loser,
      ...(tie ? { tie: true } : {}),
    };
    this.state.update((s) => ({ ...s, comparisons: [...s.comparisons, comparison] }));
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
    removeKey(STORAGE_KEY);
    this.state.set(emptyState());
  }
}
