import { TestBed } from '@angular/core/testing';
import { DEFAULT_SETTINGS } from '../../domain/types';
import { parseFantasyCalc } from './fantasycalc';
import { RankingsService } from './rankings.service';

const rows = Array.from({ length: 150 }, (_, i) => ({
  player: { id: i, name: `Player ${i}`, position: i % 2 ? 'RB' : 'WR', sleeperId: String(1000 + i) },
  value: 10000 - i * 60,
  overallRank: i + 1,
  positionRank: Math.floor(i / 2) + 1,
}));

const response = (body: unknown, ok = true) =>
  Promise.resolve({ ok, status: ok ? 200 : 503, json: () => Promise.resolve(body) } as Response);

describe('parseFantasyCalc', () => {
  it('accepts a well-formed payload', () => {
    expect(parseFantasyCalc(rows)).toHaveLength(150);
  });

  it('rejects truncated or reshaped payloads', () => {
    expect(() => parseFantasyCalc(rows.slice(0, 10))).toThrow();
    expect(() => parseFantasyCalc([{ name: 'x' }])).toThrow();
  });
});

describe('RankingsService fallback chain', () => {
  let service: RankingsService;

  beforeEach(() => {
    localStorage.clear();
    service = TestBed.inject(RankingsService);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('uses live FantasyCalc data and caches it', async () => {
    const fetch = vi.fn(() => response(rows));
    vi.stubGlobal('fetch', fetch);
    await service.load(DEFAULT_SETTINGS);
    expect(service.source()).toBe('live');
    expect(service.players()).toHaveLength(150);

    await service.load(DEFAULT_SETTINGS);
    expect(service.source()).toBe('cache');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to a stale cache when FantasyCalc is down', async () => {
    localStorage.setItem(
      'ff-tinder:rankings',
      JSON.stringify({ settingsKey: '12-1-1qb', fetchedAt: '2020-01-01T00:00:00Z', rows }),
    );
    vi.stubGlobal('fetch', vi.fn(() => response(null, false)));
    await service.load(DEFAULT_SETTINGS);
    expect(service.source()).toBe('stale-cache');
    expect(service.status()).toBe('ready');
  });

  it('falls back to the bundled snapshot and flags a settings mismatch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('snapshot')
          ? response({ fetchedAt: '2026-10-08T00:00:00Z', settings: DEFAULT_SETTINGS, rows })
          : Promise.reject(new Error('offline')),
      ),
    );
    await service.load({ ...DEFAULT_SETTINGS, superflex: true });
    expect(service.source()).toBe('snapshot');
    expect(service.settingsMismatch()).toBe(true);
  });

  it('reports an error only when every source fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await service.load(DEFAULT_SETTINGS);
    expect(service.status()).toBe('error');
  });
});
