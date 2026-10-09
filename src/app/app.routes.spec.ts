import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { routes } from './app.routes';
import { StoreService } from './core/store.service';

describe('routing', () => {
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    router = TestBed.inject(Router);
  });

  it('sends new users to the roster page, even from /compare', async () => {
    await router.navigateByUrl('/');
    expect(router.url).toBe('/roster');
    await router.navigateByUrl('/compare');
    expect(router.url).toBe('/roster');
  });

  it('sends users with a roster straight to comparing', async () => {
    TestBed.inject(StoreService).addToRoster('4034');
    await router.navigateByUrl('/');
    expect(router.url).toBe('/compare');
  });
});
