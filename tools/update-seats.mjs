// Reads how many seats are left in each session from GoHighLevel and writes seats.json
// with only the sessions that are full (no counts are published).
// Runs in GitHub Actions every 10 minutes. Needs the GHL_TOKEN secret
// (a GoHighLevel Private Integration token with the "View Prices" scope).
import { readFile, writeFile } from 'node:fs/promises';

const TOKEN = process.env.GHL_TOKEN;
const LOCATION = 'pcUHM2MDvoDgeO1iXSiT';
const PRODUCT = '6afbbdcfef0fdd31635b125a'; // Cancer & Lyme Program Seat Reservation
const OUT = new URL('../seats.json', import.meta.url);

// Price id of each session's variant in GoHighLevel -> key used by offer.html.
// (June 2027 is an unused variant and is left out.)
const SESSIONS = {
  '6afbbdcfef0fdd31635b1262': 'dec6',   // December 6-20, 2026
  '6afbc5a3e60b5cf5df8791fc': 'jan3',   // January 3-17, 2027
  '6afbc5a3e60b5cf5df879204': 'jan24',  // January 24 - February 7, 2027
  '6afbc5a3e60b5cf5df87920c': 'feb14',  // February 14-28, 2027
  '6afbc5a3e60b5cf5df879214': 'mar7',   // March 7-21, 2027
  '6afbc5a3e60b5cf5df87921c': 'mar28',  // March 28 - April 11, 2027
};

if (!TOKEN) { console.log('GHL_TOKEN is not set; leaving seats.json as it is.'); process.exit(0); }

async function getPrices(version) {
  const url = `https://services.leadconnectorhq.com/products/${PRODUCT}/price?locationId=${LOCATION}&limit=50`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Version: version, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GoHighLevel answered ${res.status} (Version ${version}): ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).prices || [];
}

let prices;
try { prices = await getPrices('2021-07-28'); }
catch (e) { console.log(e.message); prices = await getPrices('v3'); }

const left = {};
for (const p of prices) {
  const id = p._id || p.id;
  if (!SESSIONS[id]) continue;
  if (!p.trackInventory) throw new Error(`Inventory tracking is off for ${SESSIONS[id]}`);
  left[SESSIONS[id]] = Math.max(0, Number(p.availableQuantity) || 0);
}
const missing = Object.values(SESSIONS).filter(k => !(k in left));
if (missing.length) throw new Error(`No seat count for: ${missing.join(', ')}`);
console.log('Seats left:', left);

// Only the full sessions are published; the page crosses them out.
const full = Object.values(SESSIONS).filter(k => left[k] === 0);
const next = JSON.stringify({ full }, null, 2) + '\n';
let prev = '';
try { prev = await readFile(OUT, 'utf8'); } catch {}
if (prev === next) { console.log('No change.'); process.exit(0); }
await writeFile(OUT, next);
console.log('Updated full sessions:', full);
