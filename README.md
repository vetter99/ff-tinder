# FF Tinder

A browser-based fantasy football trade finder. You answer quick "who would you rather own?"
matchups. The app learns how your valuations differ from the market and suggests 1-for-1 trades
you'd like that are still fair by consensus value.

Phase 1 is single-player: there are no accounts, no league sync and no backend. Everything you enter stays in your browser.

## Scoring algorithm

All of the scoring logic lives in [src/domain/](src/domain/). It's plain TypeScript with no
Angular, and every constant below is defined in one of these files.

### 1. Market value (the baseline)

Each player's market value comes from [FantasyCalc](https://fantasycalc.com) redraft trade values,
which are built from real trades in current leagues. Mid-season, that means they reflect what a
player is worth for the rest of the season. Values are rescaled so the most valuable player is
**100**: today Bijan Robinson ≈ 100, Chris Olave ≈ 60, and the 100th player ≈ 7. This baseline
stands in for "what the league would accept."
([normalize.ts](src/domain/normalize.ts))

### 2. Learning from your answers

Each answer to "who would you rather own?" is stored with the time you gave it and both players'
market values at that moment. The model ([preference.ts](src/domain/preference.ts)) is a
Bradley–Terry model that uses the market value as its starting point:

    your value of a player = market value + player offset (+ position offset)
    P(you pick A over B)   = logistic((your value of A − your value of B) / 8)

- **Player offset:** how much more or less you like this specific player than the market does. It
  starts at 0, with an uncertainty of ±12 points.
- **Position offset** (only when the *Position lean* setting is on): how much you favor a whole
  position, starting at 0 ± 6.
- **Updating:** each answer nudges the winner up and the loser down, and shrinks their
  uncertainty. Surprising answers move things a lot: picking a lower-valued player over a
  higher-valued one does. Expected answers barely move anything. A "too close to call" answer
  pulls the two players toward each other.
- **Rebuilt each time:** the whole answer history is replayed against today's market values
  whenever the app opens or anything changes, so nothing is lost when values update.

### 3. Freshness: why old answers fade

Player values change every week because of injuries, trades and role changes, so each answer is
weighted by how current it still is:

| Rule | Effect |
|---|---|
| **Time decay** | An answer's weight halves every **21 days**: 100% today, 50% after 3 weeks, 25% after 6 weeks, about 12% after 9. |
| **Big market moves** | If either player's market value has moved more than **25%** since you answered, that answer keeps only **20%** of its weight. Moves are measured against a value of at least 10, so small wiggles in low-value players don't count. |

The weight scales how much an answer moves the model and how much it counts as evidence. As a
result:
- If you stop swiping, your values drift back toward the market instead of freezing.
- The *personalization* percentage drops as answers age, so it shows how **current** your
  profile is, not just how many answers you've given.
- A compared player "needs a refresh" once the average weight of their answers falls below 50%.
  The Profile and comparison screens show how many players need one, and matchups favor those
  players (the weekly check-in, see section 5).

Answers recorded before market values were saved with each answer are still faded by age, but
they can't be checked for big moves.

### 4. Blending: how much your answers count

    your value = market value + weight × (player offset + position offset)

The weight starts at **10%** after your first answer and grows with *recent informative evidence*:
about **25%** after 10 close calls and about **42%** after 50, approaching but never exceeding
**50%**. "Informative" means a close call counts fully, while an obvious pick (a star over a
bench player) counts almost nothing. "Recent" means each answer's evidence is multiplied by its
freshness weight from section 3.

### 5. Choosing matchups

Matchups aren't random ([active-learning.ts](src/domain/active-learning.ts)). Each possible pair
of players gets a score, and the next matchup is drawn from the 10 best. Pairs score higher when:
- the outcome is uncertain (the model thinks it's close to 50/50);
- the model knows little about either player;
- the players play different positions (×3 during your first 10 answers, ×1.5 after);
- either player is close in value to someone on your roster (×1.5);
- either player had a surprising earlier answer, which the next matchup re-tests;
- **either player needs a refresh (×2 each)**, which makes the weekly check-in happen
  naturally;
- the players are valuable: low-value pairs are down-weighted.

Players far apart in value are never paired (no Ja'Marr Chase vs. a bench WR), and recently shown
players and repeated pairs are down-weighted. QBs are only matched against QBs, with at least one
QB matchup in every 8.

### 6. Trade targets and sell candidates

- **Targets:** players not on your roster whose blended value is at least **1.5 points** above
  market.
- **Sell candidates:** your own players at least 1.5 points below market.

Players worth less than 3 are ignored. With *Only players I've compared* on, a player needs at
least one direct comparison to appear. ([targets.ts](src/domain/targets.ts))

### 7. Trade ideas (1-for-1)

The app checks every pair of one player you own and one you don't
([trades.ts](src/domain/trades.ts)). A trade is suggested only if all of these hold:
1. **QBs are only traded for QBs.**
2. **The market would accept it:** you may overpay by up to **12%** of market value, but you never
   receive more than **5%** extra.
3. **You have an edge:** (how far above market you are on the incoming player) − (how far above
   market you are on the outgoing player) is at least **1 point**.
4. With *Only players I've compared* on, you've compared at least one of the two players.

Ideas are ranked by that edge, minus anything you'd overpay. Each incoming player appears at most
twice and each of your players at most four times. Your lineup plays no part: thin positions and
positional needs are ignored, so ideas come only from how you value players compared with the
market.

Because the scoring code doesn't depend on Angular, it can later run on a server for multi-manager
trade matching.

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

Hosted on Cloudflare Workers (static assets). Every push to `main` redeploys it.

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Node version | from `.node-version` (or set the `NODE_VERSION` environment variable) |

[wrangler.jsonc](wrangler.jsonc) points the Worker at `dist/ff-tinder/browser` and serves
`index.html` for app routes like `/compare`. No server code or secrets are involved.
