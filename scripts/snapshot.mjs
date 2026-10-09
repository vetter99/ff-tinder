// Refreshes the bundled fallback rankings used when FantasyCalc and the local cache are unavailable.
// Usage: npm run snapshot
import { writeFile } from 'node:fs/promises';

const settings = { teams: 12, ppr: 1, superflex: false };
const url =
  'https://api.fantasycalc.com/values/current' +
  `?isDynasty=false&numQbs=${settings.superflex ? 2 : 1}&numTeams=${settings.teams}&ppr=${settings.ppr}`;

const res = await fetch(url);
if (!res.ok) throw new Error(`FantasyCalc responded ${res.status}`);
const rows = await res.json();
if (!Array.isArray(rows) || rows.length < 100) throw new Error(`Unexpected payload (${rows?.length} rows)`);

const snapshot = { source: 'fantasycalc', fetchedAt: new Date().toISOString(), settings, rows };
await writeFile(new URL('../public/data/snapshot.json', import.meta.url), JSON.stringify(snapshot));
console.log(`Wrote ${rows.length} players to public/data/snapshot.json`);
