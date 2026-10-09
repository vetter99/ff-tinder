# FF Tinder

A browser-based fantasy football trade finder. You answer quick "who would you rather own?"
matchups. The app learns how your valuations differ from the market and suggests 1-for-1 trades
you'd like that are still fair by consensus value.

It's single-player for now: there are no accounts, and everything you enter stays in your browser.
You can import your roster from a public MyFantasyLeague league or add players by hand.

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
- one of the players **is** on your roster (another ×1.3, so about half of matchups include one of
  your players, up from about a quarter, but not every one);
- either player had a surprising earlier answer, which the next matchup re-tests;
- **either player needs a refresh (×2 each)**, which makes the weekly check-in happen
  naturally;
- the players are valuable: low-value pairs are down-weighted.

**Winner stays** (an option on the comparison screen, off by default): the player you pick stays
for the next matchup against a new challenger, chosen the same way from pairs that include them. A
player who wins 5 in a row retires, and "too close to call" also starts a fresh matchup.

Players far apart in value are never paired (no Ja'Marr Chase vs. a bench WR), and recently shown
players and repeated pairs are down-weighted. QBs are only matched against QBs, with at least one
QB matchup in every 8.

### 6. Trade targets and sell candidates

- **Targets:** players not on your roster whose blended value is at least **1.5 points** above
  market. They're ranked by the **best fair trade you could offer** for each: of all acceptable
  1-for-1s (the rules in section 7), the one with the highest edge, meaning (how far above
  consensus you are on the target) − (how far above consensus you are on the player you'd send),
  minus any overpay. Each target shows that best offer. Targets with no fair offer on your roster
  come last, ordered by gap.
- **Sell candidates:** your own players at least 1.5 points below market, biggest gap first.

Players worth less than 3 are ignored. With *Only players I've compared* on, a player needs at
least one direct comparison to appear. ([targets.ts](src/domain/targets.ts),
[trades.ts](src/domain/trades.ts))

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
twice and each of your players at most four times.

**"I would never":** every suggestion (including league matches) has this button. It records an
answer that you prefer the player you'd send over the one you'd receive. That answer counts as
**two** ordinary picks, so it fades and goes stale like any other answer. That exact trade is also
never suggested again, even after the answer fades. An Undo link removes it. Your lineup plays no part: thin positions and
positional needs are ignored, so ideas come only from how you value players compared with the
market.

### 8. League matches (both managers want it)

When teams from the same MyFantasyLeague league have imported their rosters, the server looks for
1-for-1 swaps between two real teams that **both** managers want
([matches.ts](src/domain/matches.ts)). These show on the Trades page as gold
"It's a match" cards. A match needs all of these:
1. **Real rosters:** you send a player on your MFL roster for one on theirs. Rosters come straight
   from MFL, not from what anyone typed in.
2. **QBs are only traded for QBs.**
3. **Fair by market:** the two players' market values are within **12%** of each other (1 point
   for cheap players). This is checked with both managers' market values, in case their formats
   differ.
4. **You both have an edge** of at least **1 point**: you prefer their player over yours by more than
   consensus does, *and* they prefer yours over theirs by more than consensus does.

Matches are ranked by the smaller of the two edges, so the best match is the one both sides want
most. The list holds up to 10, with each incoming player at most twice and each of your players at
most three times.

**What's shared:** while your roster is linked to an MFL league, the app sends your market and
personal value for each player (keyed by MFL player ID) to the server. Matching happens on the
server, and each manager only receives their own matches, never anyone else's values. Teams that
haven't synced in 30 days are left out.

### 9. Your answers follow your team

A linked team's answers are saved on the server under that league and team
([team-sync.ts](src/domain/team-sync.ts)). Pick the same team on any device and its answers load.
Answers from every device are combined.

- **Syncing:** right away when a team is linked or the app opens, and 4 seconds after you stop
  answering. The Trades page also syncs on open.
- **Merging:** answers are combined by their ID. Undo, *I would never → Undo* and *Clear
  comparisons* record the removed IDs, so a removal on one device sticks on all of them.
- **Switching teams** starts from the new team's saved answers; the old team's answers stay saved
  under it. *Unlink* and *Reset everything* only affect this browser: picking the team again brings
  its answers back.
- **No logins yet:** anyone who picks your team can see and change its answers. Accounts will fix
  this.
- Up to 5,000 answers are kept per team (the oldest are dropped first, by which time they've faded
  away anyway).

## Development

Requires Node 22.22.3+ or 24.15+ (the Angular 22 minimums).

```sh
npm install
npm run worker     # the /api server (MFL proxy, league matches with a local D1 database) on :8787
npm start          # http://localhost:4200, forwards /api to the worker
npm test           # unit tests, including simulated-user learning tests
npm run build      # static site in dist/ff-tinder/browser
npm run snapshot   # refresh public/data/snapshot.json, the offline fallback
```

## League import (MyFantasyLeague)

On the Roster page, **Import from MyFantasyLeague** lets you search by league name, league ID or a
pasted MFL link, pick your team, and import its roster. The league's team count and superflex
setting are applied too. The league stays linked, so **Sync roster** re-imports it after trades or
pickups.

- Players are matched by MFL player ID using the IDs FantasyCalc provides. Players FantasyCalc
  doesn't value (kickers, defenses, IDP, deep bench) aren't imported, and the import screen lists
  them by name.
- MFL doesn't allow requests from other websites' browsers, so calls go through a small Cloudflare
  Worker ([worker/index.ts](worker/index.ts)). It only forwards three fixed read-only MFL requests:
  league search, league details with rosters, and player names. It caches responses for 5 minutes
  (player names for a day).
- **Only public leagues work for now.** Private leagues need MFL sign-in, which isn't built yet.
- A linked team saves its answers to the server so they follow you to any device (see
  [section 9](#9-your-answers-follow-your-team)), and joins league matching (see
  [section 8](#8-league-matches-both-managers-want-it)). The linked-league card shows how many
  leaguemates are on FF Tinder.

## Player info on cards

Each comparison card shows the player's injury tag, points per game, and last game in your
league's scoring, plus their latest news headline if it's under 10 days old. The **i** button opens
a sheet with injury details and practice status, depth chart, weekly points, season stats and the
latest news.

- Injuries, depth chart and weekly stats come from Sleeper's public API, called directly.
- News comes from RotoWire player updates on ESPN's fantasy feed. It's fetched through
  `/api/news` in the Worker, which trims about 90 KB down to a few hundred bytes and caches it for
  30 minutes.
- Info is cached in memory for 15 minutes per player.

## League formats

The format controls on the Roster page offer only what FantasyCalc publishes distinct values for:
**Redraft or Dynasty**, **8/10/12/14 teams**, **Standard/Half/Full PPR**, and **1 QB or
Superflex**. Its API accepts other values (16 teams, 0.25 PPR, …) but silently returns default
values for them, so saved or imported settings are mapped to the nearest supported option. An MFL
import sets team count, superflex, and scoring (from the league's points-per-catch rule)
automatically. The header shows the current format, and tapping it opens these settings.

## Data and fallbacks

Player values load from the first source that works, in this order:

1. A cache in localStorage that's less than 6 hours old.
2. Live data from FantasyCalc.
3. The same cache, however old it is.
4. The bundled `public/data/snapshot.json`, which is always 12-team PPR 1QB redraft data. The header shows
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

[wrangler.jsonc](wrangler.jsonc) serves `dist/ff-tinder/browser` as static assets (falling back to
`index.html` for app routes like `/compare`) and runs [worker/index.ts](worker/index.ts) for
`/api/*` requests. No secrets are involved.

Team answers and league matches are stored in a Cloudflare **D1** database bound as `DB`. The
Worker creates its table on first use. Because `wrangler.jsonc` names the database without an ID, `wrangler deploy`
creates it on the first deploy. If your build refuses to create it, run
`npx wrangler d1 create ff-tinder` once and add the `database_id` it prints to `wrangler.jsonc`.
Without a database, the rest of the app still works locally, and the Trades page says league
matching isn't available.
