import { evaluateRoster } from './roster-utility';
import { makePlayer } from './testing';
import { DEFAULT_SETTINGS, ReplacementLevels } from './types';

const repl: ReplacementLevels = { QB: 10, RB: 5, WR: 5, TE: 5 };
const value = (p: { market: { baseline: number } }) => p.market.baseline;

describe('evaluateRoster', () => {
  it('fills dedicated slots first, then flex with the best remaining eligible player', () => {
    const roster = [
      makePlayer('qb', 'QB', 40),
      makePlayer('rb1', 'RB', 90),
      makePlayer('rb2', 'RB', 60),
      makePlayer('rb3', 'RB', 50),
      makePlayer('wr1', 'WR', 80),
      makePlayer('wr2', 'WR', 30),
      makePlayer('te', 'TE', 20),
      makePlayer('qb2', 'QB', 35),
    ];
    const r = evaluateRoster(roster, value, DEFAULT_SETTINGS, repl);
    expect(r.starters.find((s) => s.slot === 'FLEX')?.id).toBe('rb3');
    expect(r.bench).toEqual(['qb2']);
    expect(r.starterValue).toBe(40 + 90 + 60 + 80 + 30 + 20 + 50);
    expect(r.benchValue).toBeCloseTo(0.25 * (35 - 10));
  });

  it('values one elite starter above two players who cannot both start', () => {
    const core = [makePlayer('qb', 'QB', 40), makePlayer('te', 'TE', 20)];
    const rbs = [makePlayer('r1', 'RB', 50), makePlayer('r2', 'RB', 50), makePlayer('r3', 'RB', 50)];
    const wrs = [makePlayer('w1', 'WR', 50), makePlayer('w2', 'WR', 50)];
    const base = [...core, ...rbs, ...wrs];

    const elite = evaluateRoster([...base, makePlayer('star', 'WR', 90)], value, DEFAULT_SETTINGS, repl);
    const twoGood = evaluateRoster(
      [...base, makePlayer('g1', 'WR', 50), makePlayer('g2', 'WR', 45)],
      value,
      DEFAULT_SETTINGS,
      repl,
    );
    expect(elite.total).toBeGreaterThan(twoGood.total);
  });

  it('adds a superflex slot when enabled', () => {
    const roster = [makePlayer('qb1', 'QB', 60), makePlayer('qb2', 'QB', 50)];
    const r = evaluateRoster(roster, value, { ...DEFAULT_SETTINGS, superflex: true }, repl);
    expect(r.starters.map((s) => s.slot)).toEqual(['QB', 'SUPERFLEX']);
  });
});
