# FF Tinder

A browser-based fantasy football trade finder. You answer quick "who would you rather own?"
matchups. The app learns how your valuations differ from the market and suggests 1-for-1 trades
you'd like that are still fair by consensus value.

Phase 1 is single-player: there are no accounts, no league sync and no backend. Everything you enter stays in your browser.

## How it works

- **Market value** comes from [FantasyCalc](https://fantasycalc.com) redraft trade values, which
  are fetched directly from the browser. They're normalized to a 0–100 baseline.
- **Personal value** comes from a Bradley–Terry model that uses the baseline as its prior. Each
  answer updates a per-player offset, and each offset carries its own uncertainty. Turning on the
  optional *position lean* setting also learns a per-position offset. A second setting,
  *only players I've compared*, limits suggestions to players you've directly compared. Both settings
  start off. Your answers make up at most 50% of a player's value. Their share grows with the
  number of *informative* answers, so easy calls count for very little.
- **Matchups** are picked by active learning. The app favors close calls, players it knows little
  about, players from different positions, players near your roster's value and higher-value players.
  It also re-tests surprising answers. QBs are only matched against QBs.
- **Trade ideas** are 1-for-1 swaps for a player you value more than consensus does, relative to
  the player you send. They ignore your roster: lineup needs and positional holes play no part.
  You may overpay by up to 12% of market value, but you may never receive more than 5% extra. QBs
  are only ever traded for QBs.

The domain logic lives in [src/domain/](src/domain/). It's plain TypeScript with no Angular, so it can
later run on a server for multi-manager trade matching.

## Development

Requires Node 22.22.3+ or 24.15+ (the Angular 22 minimums).

```sh
npm install
npm start          # http://localhost:4200
npm test           # unit tests, including simulated-user learning tests
npm run build      # static site in dist/ff-tinder/browser
npm run snapshot   # refresh public/data/snapshot.json, the offline fallback
```

## Data and fallbacks

Player values load from the first source that works, in this order:

1. A cache in localStorage that's less than 6 hours old.
2. Live data from FantasyCalc.
3. The same cache, however old it is.
4. The bundled `public/data/snapshot.json`, which is always 12-team PPR 1QB data. The header shows
   a notice when this doesn't match your league settings.

Headshots load from Sleeper's CDN, with initials shown when an image is missing. FantasyCalc has no
published API terms, so check with them before any commercial use.

## Deployment

The build output is fully static, so it can be served from Cloudflare Pages, Netlify, Vercel or
GitHub Pages without a server.
