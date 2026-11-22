// Screenshot the Find Facility flow at 1440px and 390px (CLAUDE.md "Before finishing any UI change").
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

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const problems = [];
for (const s of sizes) {
  const page = await browser.newPage();
  await page.setViewport({ width: s.width, height: s.height, deviceScaleFactor: 1, isMobile: s.mobile, hasTouch: s.mobile });
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);

  // Overlap / truncation check: elements whose text overflows their box (ignores intentional `truncate`).
  const check = async (label) => {
    const bad = await page.evaluate(() => [...document.querySelectorAll('button, a, h1, span, label')]
      .filter((el) => el.offsetParent && !el.closest('.truncate') && !el.classList.contains('sr-only')
        && !el.querySelector('[class*="sr-only"]') && el.getBoundingClientRect().width > 1   // skip visually-hidden labels
        && getComputedStyle(el).position !== 'fixed'
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
  await page.close();
}
await browser.close();
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'no overflow or horizontal scroll found');
