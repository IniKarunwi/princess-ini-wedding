#!/usr/bin/env node
/**
 * The live viewfinder.
 *
 *   npm run test:camera-live      (a preview server must be running on 8080)
 *
 * Chromium's fake capture device gives a real MediaStream, so getUserMedia,
 * the <video> element, the canvas frame grab and the JPEG encode are all
 * genuinely exercised — this is not a mock of the camera, it is a camera with
 * a test pattern in front of it.
 *
 * ── The property being defended ────────────────────────────────────────────
 * The camera does not go away. Everything else here is detail; the reason
 * this file exists is that the previous design handed the screen to the OS
 * camera and got it back one photograph at a time, and a guest trying to
 * catch three seconds of a first dance cannot afford a round trip through two
 * screens between shots.
 *
 * So every capture asserts the viewfinder is STILL VISIBLE afterwards, and
 * that nothing has gone near the network.
 */

import { chromium } from '/home/user/princess-ini-wedding/node_modules/playwright-core/index.mjs';

const ORIGIN = 'http://127.0.0.1:8080';

let pass = 0;
const failures = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ✗ ${name} ${extra}`); }
};
const eq = (name, got, want) =>
  ok(name, got === want, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

/* ── With a camera ───────────────────────────────────────────────────────── */

const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ['camera'],
});
const page = await ctx.newPage();

let signs = 0;
let uploads = 0;
let concurrent = 0;
let maxConcurrent = 0;

await page.route('**/api/photos/sign', async (route) => {
  signs++;
  await route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ uploadUrl: 'https://storage.test/o?token=t', path: `s/${signs}.jpg` }),
  });
});
await page.route('https://storage.test/**', async (route) => {
  uploads++; concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent);
  await new Promise((r) => setTimeout(r, 80));
  concurrent--;
  await route.fulfill({ status: 200, body: '' });
});

const count = async () => (await page.innerText('[data-testid="roll-count"]')).trim();

console.log('\nStarting the camera');
await page.goto(`${ORIGIN}/wedding/camera`);
await page.click('[data-testid="take-photo"]');          // the intro shutter
await page.waitForSelector('[data-testid="viewfinder"]', { timeout: 15_000 });
{
  ok('the viewfinder is on screen', await page.isVisible('[data-testid="viewfinder"]'));
  ok('the video is actually playing, not a still element', await page.evaluate(() => {
    const v = document.querySelector('[data-testid="viewfinder"]');
    return !!v?.srcObject && v.videoWidth > 0 && !v.paused;
  }));
  eq('and nothing has been taken yet', await count(), '0 PHOTOS · UP TO 10');
  eq('no sign call', signs, 0);
}

console.log('\nThe camera stays put — the whole point');
{
  const t0 = Date.now();
  for (let i = 1; i <= 4; i++) {
    await page.click('[data-testid="take-photo"]');
    await page.waitForFunction(
      (n) => document.querySelector('[data-testid="roll-count"]')?.textContent?.trim().startsWith(String(n)),
      i, { timeout: 8000 });
    ok(`capture ${i}: the viewfinder is STILL there`,
       await page.isVisible('[data-testid="viewfinder"]'));
    ok(`capture ${i}: and still playing`, await page.evaluate(() => {
      const v = document.querySelector('[data-testid="viewfinder"]');
      return !!v?.srcObject && !v.paused;
    }));
  }
  const elapsed = Date.now() - t0;
  ok(`four photographs without leaving the camera (${elapsed}ms)`, elapsed < 8000, `${elapsed}ms`);

  eq('the count says so', await count(), '4 PHOTOS · UP TO 10');
  ok('the most recent one is shown as a thumbnail',
     await page.isVisible('[data-testid="last-thumb"]'));
  eq('and Send offers the batch',
     (await page.innerText('[data-testid="send-photos"]')).trim().toLowerCase(), 'send 4 photos');

  eq('NOTHING has been signed', signs, 0);
  eq('and nothing uploaded', uploads, 0);
}

console.log('\nThe frame is a real photograph, prepared like any other');
{
  const out = await page.evaluate(async () => {
    const img = document.querySelector('[data-testid="last-thumb"]');
    const blob = await fetch(img.src).then((r) => r.blob());
    const bmp = await createImageBitmap(blob);
    const dims = `${bmp.width}x${bmp.height}`;
    bmp.close?.();
    return { dims, type: blob.type, bytes: blob.size };
  });
  eq('downscaled to the same 1920 long edge', Math.max(...out.dims.split('x').map(Number)), 1920);
  eq('encoded as JPEG', out.type, 'image/jpeg');
  ok('and is a plausible size', out.bytes > 1000, `${out.bytes} bytes`);
}

console.log('\nThe thumbnail is the way into the roll');
{
  await page.click('[data-testid="review-roll"]');
  await page.waitForSelector('[data-testid="roll-grid"]');
  eq('all four are there', await page.locator('[data-testid="roll-grid"] img').count(), 4);
  ok('the camera has been released', await page.evaluate(() =>
    !document.querySelector('[data-testid="viewfinder"]')));

  await page.locator('[data-testid="remove-photo"]').first().click();
  await page.waitForFunction(() =>
    document.querySelectorAll('[data-testid="roll-grid"] img').length === 3);
  eq('one can be removed', await page.locator('[data-testid="roll-grid"] img').count(), 3);

  // Back to shooting, and the camera comes back rather than the OS sheet.
  await page.click('[data-testid="take-photo"]');
  await page.waitForSelector('[data-testid="viewfinder"]', { timeout: 15_000 });
  ok('and the viewfinder resumes', await page.isVisible('[data-testid="viewfinder"]'));
  eq('with the roll intact', await count(), '3 PHOTOS · UP TO 10');
}

console.log('\nSending, from the viewfinder');
{
  await page.click('[data-testid="send-photos"]');
  await page.waitForSelector('[data-testid="success"]', { timeout: 40_000 });
  const body = await page.innerText('body');
  ok('the batch goes', /3 photos sent/i.test(body), body.match(/\d+ photos? sent/i)?.[0]);
  eq('three signs', signs, 3);
  eq('three uploads', uploads, 3);
  eq('one at a time', maxConcurrent, 1);
  ok('and the camera is off behind the thank-you', await page.evaluate(() =>
    !document.querySelector('[data-testid="viewfinder"]')));
}

console.log('\nThe cap is per batch');
{
  await page.click('[data-testid="take-another"]');
  await page.waitForSelector('[data-testid="viewfinder"]', { timeout: 15_000 });
  eq('a new batch starts empty', await count(), '0 PHOTOS · UP TO 10');

  for (let i = 1; i <= 10; i++) {
    await page.click('[data-testid="take-photo"]');
    try {
      await page.waitForFunction(
        (n) => document.querySelector('[data-testid="roll-count"]')?.textContent?.trim().startsWith(`${n} `),
        i, { timeout: 8000 });
    } catch {
      ok(`capture ${i} of ten`, false, `stuck at "${await count()}"`);
      break;
    }
  }
  eq('ten fit', await count(), '10 PHOTOS · UP TO 10');
  ok('the shutter closes at the cap',
     await page.locator('[data-testid="take-photo"]').isDisabled());
  ok('and says why', /send these and you can take more/i.test(await page.innerText('body')));
  ok('the viewfinder is still up, so nothing is lost',
     await page.isVisible('[data-testid="viewfinder"]'));
}

await ctx.close();

/* ── Without one ─────────────────────────────────────────────────────────── */

console.log('\nWith the camera refused, the OS camera still works');
{
  // No fake device and no permission: getUserMedia fails exactly as it does
  // in an in-app browser, which is the case this fallback exists for.
  const plain = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: [],
  });
  const p2 = await plain.newPage();
  await p2.addInitScript(() => {
    // Deny it outright, the way a guest tapping "Don't Allow" does.
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: () => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' })) },
      configurable: true,
    });
  });
  await p2.goto(`${ORIGIN}/wedding/camera`);
  await p2.click('[data-testid="take-photo"]');
  await p2.waitForTimeout(600);

  ok('no viewfinder', !(await p2.isVisible('[data-testid="viewfinder"]')));
  ok('the file input is still there to fall back on',
     await p2.locator('[data-testid="camera-input"]').count() === 1);

  await p2.setInputFiles('[data-testid="camera-input"]', {
    name: 'IMG_1.jpg', mimeType: 'image/jpeg',
    buffer: await makeJpeg(p2),
  });
  await p2.waitForSelector('[data-testid="thumb-ready"]', { timeout: 15_000 });
  ok('and a photograph still reaches the roll',
     (await p2.locator('[data-testid="roll-grid"] img').count()) === 1);
  eq('with the same Send',
     (await p2.innerText('[data-testid="send-photos"]')).trim().toLowerCase(), 'send 1 photo');
  await plain.close();
}

async function makeJpeg(target) {
  const bytes = await target.evaluate(async () => {
    const c = new OffscreenCanvas(1600, 1200);
    const x = c.getContext('2d');
    x.fillStyle = '#4a6b3f'; x.fillRect(0, 0, 1600, 1200);
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  return Buffer.from(bytes);
}

await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  • ${f}`)); process.exit(1); }
