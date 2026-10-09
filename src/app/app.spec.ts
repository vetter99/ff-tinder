import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { RankingsService } from './core/rankings.service';
import { StoreService } from './core/store.service';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: RankingsService, useValue: stubRankings() },
      ],
    }).compileComponents();
  });

  const navText = (fixture: { nativeElement: HTMLElement }, selector: string) =>
    [...fixture.nativeElement.querySelectorAll(selector)].map((el) => el.textContent?.trim());

  it('locks every tab except Roster until there is a roster', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(navText(fixture, 'nav a')).not.toContain('Compare');
    expect(navText(fixture, 'nav [aria-disabled="true"]')).toContain('Compare');
    expect(navText(fixture, 'nav a')).toContain('Roster');
  });

  it('unlocks the tabs once there is a roster', async () => {
    TestBed.inject(StoreService).addToRoster('4034');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(navText(fixture, 'nav a')).toContain('Compare');
    expect(navText(fixture, 'nav a')).toContain('Trades');
  });
});

function stubRankings() {
  const value = <T>(v: T) => () => v;
  return {
    status: value('ready'),
    players: value([]),
    source: value('live'),
    fetchedAt: value(new Date().toISOString()),
    settingsMismatch: value(false),
    error: value(null),
    load: () => Promise.resolve(),
  };
}
