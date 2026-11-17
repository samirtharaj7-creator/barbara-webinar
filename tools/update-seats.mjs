// Reads how many seats are left in each month from GoHighLevel and writes seats.json.
// Runs in GitHub Actions every 10 minutes. Needs the GHL_TOKEN secret
// (a GoHighLevel Private Integration token with the "View Prices" scope).
import { readFile, writeFile } from 'node:fs/promises';

const TOKEN = process.env.GHL_TOKEN;
const LOCATION = 'pcUHM2MDvoDgeO1iXSiT';
const PRODUCT = '6afbbdcfef0fdd31635b125a'; // Cancer & Lyme Program Seat Reservation
const OUT = new URL('../seats.json', import.meta.url);

// Price id of each month's variant in GoHighLevel
const MONTHS = {
  '6afbbdcfef0fdd31635b1262': 'December 2026',
  '6afbc5a3e60b5cf5df8791fc': 'January 2027',
  '6afbc5a3e60b5cf5df879204': 'February 2027',
  '6afbc5a3e60b5cf5df87920c': 'March 2027',
  '6afbc5a3e60b5cf5df879214': 'April 2027',
  '6afbc5a3e60b5cf5df87921c': 'May 2027',
  '6afbc5a3e60b5cf5df879224': 'June 2027',
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

const seats = {};
for (const p of prices) {
  const id = p._id || p.id;
  if (!MONTHS[id]) continue;
  if (!p.trackInventory) throw new Error(`Inventory tracking is off for ${MONTHS[id]}`);
  seats[MONTHS[id]] = Math.max(0, Number(p.availableQuantity) || 0);
}
const missing = Object.values(MONTHS).filter(m => !(m in seats));
if (missing.length) throw new Error(`No seat count for: ${missing.join(', ')}`);

const next = JSON.stringify({ seats }, null, 2) + '\n';
let prev = '';
try { prev = await readFile(OUT, 'utf8'); } catch {}
if (prev === next) { console.log('No change.'); process.exit(0); }
await writeFile(OUT, next);
console.log('Updated seats:', seats);
