import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { RankingsService } from './core/rankings.service';

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

  it('renders the primary navigation', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const links = [...(fixture.nativeElement as HTMLElement).querySelectorAll('nav a')].map((a) =>
      a.textContent?.trim(),
    );
    expect(links).toContain('Compare');
    expect(links).toContain('Trades');
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
