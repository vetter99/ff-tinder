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

  it('sends new users to the roster page from every other page', async () => {
    for (const url of ['/', '/compare', '/targets', '/trades', '/profile']) {
      await router.navigateByUrl(url);
      expect(router.url, url).toBe('/roster');
    }
  });

  it('opens every page once there is a roster', async () => {
    TestBed.inject(StoreService).addToRoster('4034');
    for (const url of ['/compare', '/targets', '/trades', '/profile']) {
      await router.navigateByUrl(url);
      expect(router.url).toBe(url);
    }
  });

  it('sends users with a roster straight to comparing', async () => {
    TestBed.inject(StoreService).addToRoster('4034');
    await router.navigateByUrl('/');
    expect(router.url).toBe('/compare');
  });
});
