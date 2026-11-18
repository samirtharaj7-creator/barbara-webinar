// Reads seats sold per session from GoHighLevel and writes seats.json with only the
// sessions that are full (no counts are published). The 12 spots per session are shared
// by both programs: a session is full once 12 reservations are made across both.
// Runs in GitHub Actions every 10 minutes. Needs the GHL_TOKEN secret
// (a GoHighLevel Private Integration token with the "View Prices" scope).
import { readFile, writeFile } from 'node:fs/promises';

const TOKEN = process.env.GHL_TOKEN;
const LOCATION = 'pcUHM2MDvoDgeO1iXSiT';
const SPOTS = 12; // per session, shared; each variant also starts at 12 in GoHighLevel
// Older products: one product per program, one variant per session. No longer sold
// (checkout links retired 2026-11-18) but their reservations still count.
const PRODUCTS = {
  '6afbbdcfef0fdd31635b125a': '14-Day Intensive Program',
  '6afd313fac90a35bbd5fdb8d': 'Diabetes & Hypertension Program',
};
// Current products: one product per program AND session, so GoHighLevel workflows can
// tell sessions apart. Each has a single $100 price with 12 in stock.
const SESSION_PRODUCTS = {
  '6afde938a1eeb90210ca1768': ['dec6',  '14-Day Intensive'],
  '6afde9a0a1eeb90210ca4161': ['jan3',  '14-Day Intensive'],
  '6afde9cbdffeb0e4c813d9e9': ['jan24', '14-Day Intensive'],
  '6afde9dec4fb2d0206e73e43': ['feb14', '14-Day Intensive'],
  '6afdea05a1eeb90210ca7b35': ['mar7',  '14-Day Intensive'],
  '6afdea1806bcfd16a247eb89': ['mar28', '14-Day Intensive'],
  '6afdea41622ba14fc6fa0954': ['dec6',  'Diabetes & Hypertension'],
  '6afdea53dffeb0e4c814246a': ['jan3',  'Diabetes & Hypertension'],
  '6afdea79dffeb0e4c81430a7': ['jan24', 'Diabetes & Hypertension'],
  '6afdea8ca1eeb90210cab5b3': ['feb14', 'Diabetes & Hypertension'],
  '6afdeaa8dffeb0e4c81441fe': ['mar7',  'Diabetes & Hypertension'],
  '6afdeac3dffeb0e4c8144efd': ['mar28', 'Diabetes & Hypertension'],
};
// Session key used by offer.html -> text that appears in the variant name
const SESSIONS = {
  dec6:  'December 6',
  jan3:  'January 3',
  jan24: 'January 24',
  feb14: 'February 14',
  mar7:  'March 7',
  mar28: 'March 28',
};
const OUT = new URL('../seats.json', import.meta.url);

if (!TOKEN) { console.log('GHL_TOKEN is not set; leaving seats.json as it is.'); process.exit(0); }

async function getPrices(product, version) {
  const url = `https://services.leadconnectorhq.com/products/${product}/price?locationId=${LOCATION}&limit=50`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Version: version, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GoHighLevel answered ${res.status} (Version ${version}): ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).prices || [];
}
async function prices(product) {
  try { return await getPrices(product, '2021-07-28'); }
  catch (e) { console.log(e.message); return await getPrices(product, 'v3'); }
}

const sold = Object.fromEntries(Object.keys(SESSIONS).map(k => [k, 0]));
const soldOut = new Set();
for (const [product, label] of Object.entries(PRODUCTS)) {
  const list = await prices(product);
  const seen = new Set();
  for (const p of list) {
    const name = p.name || '';
    const key = Object.keys(SESSIONS).find(k => name.includes(SESSIONS[k]));
    if (!key) continue; // e.g. the unused June variant
    if (!p.trackInventory) throw new Error(`Inventory tracking is off for ${label}: ${name}`);
    const left = Math.max(0, Number(p.availableQuantity) || 0);
    sold[key] += Math.max(0, SPOTS - left);
    if (left === 0) soldOut.add(key);
    seen.add(key);
  }
  const missing = Object.keys(SESSIONS).filter(k => !seen.has(k));
  if (missing.length) throw new Error(`${label}: no variant found for ${missing.join(', ')}`);
}
for (const [product, [key, label]] of Object.entries(SESSION_PRODUCTS)) {
  const list = await prices(product);
  if (!list.length) throw new Error(`${label} ${key}: no price found`);
  for (const p of list) {
    if (!p.trackInventory) throw new Error(`Inventory tracking is off for ${label} ${key}`);
    const left = Math.max(0, Number(p.availableQuantity) || 0);
    sold[key] += Math.max(0, SPOTS - left);
    if (left === 0) soldOut.add(key);
  }
}
console.log('Reserved per session (all programs):', sold);

const full = Object.keys(SESSIONS).filter(k => sold[k] >= SPOTS || soldOut.has(k));
const next = JSON.stringify({ full }, null, 2) + '\n';
let prev = '';
try { prev = await readFile(OUT, 'utf8'); } catch {}
if (prev === next) { console.log('No change.'); process.exit(0); }
await writeFile(OUT, next);
console.log('Updated full sessions:', full);
