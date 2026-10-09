import { TestBed } from '@angular/core/testing';
import { StoreService } from './store.service';

describe('StoreService', () => {
  beforeEach(() => localStorage.clear());

  it('persists roster and comparisons to localStorage', () => {
    const store = TestBed.inject(StoreService);
    store.addToRoster('1');
    store.addToRoster('1');
    store.recordComparison('1', '2');
    TestBed.tick();

    const saved = JSON.parse(localStorage.getItem('ff-tinder:state')!);
    expect(saved.roster).toEqual(['1']);
    expect(saved.comparisons).toHaveLength(1);
  });

  it('round-trips export/import and rejects junk', () => {
    const store = TestBed.inject(StoreService);
    store.addToRoster('9');
    const exported = store.exportJson();
    store.resetAll();
    expect(store.roster()).toEqual([]);

    store.importJson(exported);
    expect(store.roster()).toEqual(['9']);
    expect(() => store.importJson('{"hello":1}')).toThrow();
  });

  it('undo removes only the latest comparison', () => {
    const store = TestBed.inject(StoreService);
    store.recordComparison('a', 'b');
    store.recordComparison('c', 'd', { tie: true });
    expect(store.undoLastComparison()?.winner).toBe('c');
    expect(store.comparisons().map((c) => c.winner)).toEqual(['a']);
  });
});
