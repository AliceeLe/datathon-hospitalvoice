// Screenshot every screen at 1440px and 390px (CLAUDE.md "Before finishing any UI change").
// Planner district data (virtue_clean) is not readable locally, so /api/dashboard/{states,state,district,districts,facilities}
// are answered with an obviously made-up LAYOUT FIXTURE below. It exists only in this test script.
// Usage: node scripts/screenshots.mjs [baseUrl] [outDir]   (server: python tools/run_local.py)
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8000';
const OUT = process.argv[3] || 'screenshots';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(OUT, { recursive: true });

const sizes = [
  { name: '1440', width: 1440, height: 900, mobile: false },
  { name: '390', width: 390, height: 844, mobile: true },
];

// LAYOUT FIXTURE (made-up numbers, not real data) for the planner screens.
const D = ['Almora', 'Bageshwar', 'Chamoli', 'Champawat', 'Dehradun', 'Haridwar', 'Nainital', 'Pauri Garhwal', 'Pithoragarh',
           'Rudraprayag', 'Tehri Garhwal', 'Udham Singh Nagar', 'Uttarkashi'];
const row = (d, i) => ({ district: d, n_facilities: 20 + i * 9, n_hospitals: i % 5 === 0 ? 0 : 4 + i, total_beds_listed: 120 + i * 85,
  n_icu: i % 4, n_blood_bank: i % 3, n_dialysis: i % 2, n_ct_scan: i % 3, n_mri: i % 2, n_emergency_c_section: i % 3,
  km_nearest_emergency_c_section: 10 + i * 9, km_nearest_dialysis: 15 + i * 11, km_nearest_mri: 30 + i * 14,
  km_nearest_trauma_emergency: 8 + i * 6, km_nearest_icu: 12 + i * 7, km_nearest_blood_bank: 9 + i * 5, km_nearest_nicu: 20 + i * 8,
  km_nearest_ct_scan: 25 + i * 9, km_nearest_cardiac_surgery: 60 + i * 20, km_nearest_burn_care: 70 + i * 18,
  institutional_birth_5y_pct: 70 + i, mothers_who_had_at_least_4_anc_visits_lb5y_pct: 50 + i,
  child_12_23m_fully_vaccinated_based_on_information_from_eit_pct: 75 + i, hh_member_covered_health_insurance_pct: 30 + i,
  child_u5_who_are_stunted_height_for_age_18_pct: 28 + i / 2, all_w15_49_who_are_anaemic_pct: 40 + i });
const rows = D.map(row);
const sum = (k) => rows.reduce((a, r) => a + r[k], 0), avg = (k) => sum(k) / rows.length, mx = (k) => Math.max(...rows.map((r) => r[k]));
const keys = Object.keys(rows[0]).filter((k) => k !== 'district');
const stateAgg = { n_districts: rows.length,
  ...Object.fromEntries(keys.map((k) => [k, k.startsWith('n_') || k === 'total_beds_listed' ? sum(k) : avg(k)])),
  ...Object.fromEntries(keys.filter((k) => k.startsWith('km_')).map((k) => ['max_' + k, mx(k)])), districts: rows };
const facs = D.flatMap((d, i) => [0, 1, 2, 3].map((j) => ({ name: 'Fixture facility ' + i + '-' + j, district: d,
  facility_type: j ? 'clinic' : 'hospital', beds: j ? null : 50 + i, doctors: 2 + j, official_phone: j % 2 ? null : '+91 135 000 0000',
  lat_final: 30 + i / 10, lon_final: 78 + j / 10 })));
function fixture(url) {
  const u = new URL(url); const p = u.pathname; const dist = u.searchParams.get('district');
  if (p === '/api/dashboard/states') return { states: ['Bihar', 'Uttar Pradesh', 'Uttarakhand'] };
  if (p === '/api/dashboard/state') return stateAgg;
  if (p === '/api/dashboard/districts') return { districts: rows };
  if (p === '/api/dashboard/district') return rows.find((r) => r.district === dist) ?? rows[0];
  if (p === '/api/dashboard/facilities') return { facilities: dist ? facs.filter((f) => f.district === dist) : facs };
  return null;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const problems = [];
for (const s of sizes) {
  const page = await browser.newPage();
  await page.setViewport({ width: s.width, height: s.height, deviceScaleFactor: 1, isMobile: s.mobile, hasTouch: s.mobile });
  await page.setRequestInterception(true);
  page.on('request', (r) => { const f = fixture(r.url()); f ? r.respond({ contentType: 'application/json', body: JSON.stringify(f) }) : r.continue(); });
  page.on('pageerror', (e) => problems.push(`${s.name} page error: ${e.message}`));
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);

  // Overlap / truncation check: elements whose text overflows their box (ignores intentional `truncate`).
  const check = async (label) => {
    const bad = await page.evaluate(() => [...document.querySelectorAll('button, a, h1, h2, h3, span, label, dd')]
      .filter((el) => el.offsetParent && !el.closest('.truncate') && !el.classList.contains('sr-only')
        && !el.querySelector('[class*="sr-only"]') && el.getBoundingClientRect().width > 1   // skip visually-hidden labels
        && getComputedStyle(el).position !== 'fixed' && !el.closest('.leaflet-container, table')
        && (el.scrollWidth > el.clientWidth + 1) && getComputedStyle(el).overflow !== 'visible')
      .map((el) => (el.textContent || '').trim().slice(0, 40)));
    const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (bad.length || hScroll) problems.push(`${s.name} ${label}: overflow=${JSON.stringify(bad)} horizontalScroll=${hScroll}`);
  };

  await page.screenshot({ path: `${OUT}/step1_${s.name}.png` }); await check('step1');
  await page.click('main .grid button');                                  // Childbirth
  await page.waitForFunction(() => document.querySelector('h1')?.textContent?.includes('Where'));
  await page.screenshot({ path: `${OUT}/step2_${s.name}.png` }); await check('step2');
  await page.type('main form input', 'Barabanki');
  await page.click('main form button[type=submit]');
  await page.waitForFunction(() => document.querySelector('h1')?.textContent?.includes('urgent'));
  await page.screenshot({ path: `${OUT}/step3_${s.name}.png` }); await check('step3');
  if (s.mobile) {
    await page.click('header button[aria-label="Menu"]');
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: `${OUT}/menu_${s.name}.png` });
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const full = (name) => page.screenshot({ path: `${OUT}/${name}_${s.name}.png`, fullPage: true });

  // Results (sample chat) + Contact
  await page.goto(BASE + '/#/chat/demo1', { waitUntil: 'networkidle0' });
  await page.waitForSelector('main h3');
  await full('results'); await check('results');
  const contact = await page.$$('main button.bg-brand');
  if (contact[0]) { await contact[0].click(); await wait(800); await page.screenshot({ path: `${OUT}/contact_${s.name}.png` }); await check('contact'); }

  // Search dialog
  await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control');
  await wait(300); await page.type('dialog input', 'dialysis'); await wait(300);
  await page.screenshot({ path: `${OUT}/search_${s.name}.png` }); await page.keyboard.press('Escape');

  // Referral tracker (real demo rows for this coordinator)
  await page.goto(BASE + '/#/tracker', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('main table') || document.querySelector('main [role=alert]'), { timeout: 120000 });
  await full('tracker'); await check('tracker');

  // Planner: India, then a state, then a district (fixture data)
  await page.goto(BASE + '/#/planner', { waitUntil: 'networkidle0' });
  await wait(1500); await full('planner_india'); await check('planner_india');
  await page.select('main select', 'Uttarakhand');
  await page.waitForFunction(() => document.querySelectorAll('main table').length >= 2, { timeout: 120000 });
  await wait(2500); await full('planner_state'); await check('planner_state');
  const selects = await page.$$('main select');
  await selects[1].select('Dehradun');
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Dehradun');
  await wait(2500); await full('planner_district'); await check('planner_district');
  await page.close();
}
await browser.close();
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'no overflow or horizontal scroll found');
