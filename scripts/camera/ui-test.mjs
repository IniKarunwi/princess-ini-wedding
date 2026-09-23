/**
 * Browser tests for the Instant Camera.
 *
 * ── What is real here and what is not ───────────────────────────────────────
 * REAL: the built application in a real Chromium, the real React state
 * machine, the real preparation path (a real image is decoded, downscaled and
 * re-encoded by the browser's own canvas), the real fetch calls, and the real
 * disabled/enabled states of every control.
 *
 * NOT REAL: the server. /api/photos/sign and the Supabase PUT are intercepted
 * so a failure can be produced on demand — which is the only way to test that
 * a failed send keeps the photograph. api-test.mjs covers the real endpoint.
 *
 * NOT TESTABLE HERE: the capture itself. A headless browser has no camera app
 * to hand off to, so the file input is filled directly — which is exactly
 * what the OS does when the guest presses the shutter. The real hand-off
 * needs a real phone; see the checklist in the pull request.
 *
 *   npm run test:camera-ui      (a dev server must be running on 8080)
 */

import { chromium } from '/home/user/princess-ini-wedding/node_modules/playwright-core/index.mjs';

const BASE = process.env.CAMERA_TEST_BASE ?? 'http://127.0.0.1:8080';

let pass = 0;
const failures = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ✗ ${name} ${extra}`); }
};
const eq = (name, got, want) =>
  ok(name, got === want, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

/* ── The server, faked ───────────────────────────────────────────────────── */

let signCalls = 0;
let uploadCalls = 0;
let signBodies = [];
let mode = 'ok';           // 'ok' | 'network' | 'reject'

await page.route('**/api/photos/sign', async (route) => {
  signCalls++;
  signBodies.push(JSON.parse(route.request().postData() ?? '{}'));
  if (mode === 'network') return route.abort('connectionfailed');
  if (mode === 'reject') {
    return route.fulfill({
      status: 415,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'unsupported_type', detail: 'We cannot send that kind of file.' }),
    });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      uploadUrl: 'https://storage.test/object/upload/sign/guest-photos/x.jpg?token=t',
      path: 'session/x.jpg',
      contentType: 'image/jpeg',
    }),
  });
});

await page.route('https://storage.test/**', async (route) => {
  uploadCalls++;
  return route.fulfill({ status: 200, body: '' });
});

/* ── A real photograph to "take" ─────────────────────────────────────────── */

/**
 * Painted in the page and handed to the input as a File, so the canvas
 * downscale runs on genuine pixels rather than on a stub.
 */
async function takePhoto(page, { width = 4032, height = 3024, type = 'image/jpeg', name = 'IMG_0001.jpg', busy = false } = {}) {
  const dataUrl = await page.evaluate(async ([w, h, t, busy]) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#1b4332'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e3cf9a'; g.fillRect(w * 0.2, h * 0.2, w * 0.6, h * 0.6);

    if (busy === 'photo') {
      // Closer to the entropy of a real photograph than either flat colour
      // or pure noise: a graded background, a few hundred soft shapes at
      // varying scales, then a light grain over the whole frame. Flat
      // colour under-reports the size wildly and noise over-reports it, so
      // neither is a number worth quoting.
      const grd = g.createLinearGradient(0, 0, w, h);
      grd.addColorStop(0, '#12210f'); grd.addColorStop(0.5, '#2d6a4f'); grd.addColorStop(1, '#e8b7a6');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        g.globalAlpha = 0.15 + Math.random() * 0.5;
        g.fillStyle = `hsl(${Math.random() * 360}, ${30 + Math.random() * 50}%, ${20 + Math.random() * 60}%)`;
        const r = 6 + Math.random() * (w / 9);
        g.beginPath();
        g.ellipse(Math.random() * w, Math.random() * h, r, r * (0.4 + Math.random()), Math.random() * 3.14, 0, 6.28);
        g.fill();
      }
      g.globalAlpha = 1;
      const im = g.getImageData(0, 0, w, h);
      const dd = im.data;
      for (let i = 0; i < dd.length; i += 4) {
        const n = (Math.random() - 0.5) * 26;
        dd[i] = Math.max(0, Math.min(255, dd[i] + n));
        dd[i + 1] = Math.max(0, Math.min(255, dd[i + 1] + n));
        dd[i + 2] = Math.max(0, Math.min(255, dd[i + 2] + n));
      }
      g.putImageData(im, 0, 0);
    } else if (busy) {
      // Per-pixel noise: the worst case for a JPEG encoder, and a stand-in
      // for a crowded, high-detail reception photograph.
      const img = g.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() * 255) | 0;
        d[i] = n; d[i + 1] = (n * 7) & 255; d[i + 2] = (n * 13) & 255;
      }
      g.putImageData(img, 0, 0);
    }
    return c.toDataURL(t, 0.9);
  }, [width, height, type, busy]);

  const b64 = dataUrl.split(',')[1];
  await page.setInputFiles('[data-testid="camera-input"]', {
    name, mimeType: type, buffer: Buffer.from(b64, 'base64'),
  });
}

/* ── The hub ─────────────────────────────────────────────────────────────── */

console.log('\nThe hub at /wedding');
await page.goto(`${BASE}/wedding`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Food Menu');
{
  const body = await page.innerText('body');
  ok('the Instant Camera card is there', body.includes('Instant Camera'));
  ok('and is no longer Coming Soon', !/coming soon/i.test(body), body.match(/.{0,40}coming soon.{0,40}/i)?.[0]);
  ok('the Food Menu is untouched', body.includes('Food Menu'));
  ok('no Drinks card came back', !/drinks/i.test(body));

  const href = await page.getAttribute('a:has-text("Instant Camera")', 'href');
  eq('the card links to the camera', href, '/wedding/camera');
}

/* ── Reaching the camera ─────────────────────────────────────────────────── */

console.log('\nOpening the camera');
await page.click('a:has-text("Instant Camera")');
await page.waitForSelector('[data-testid="take-photo"]');
{
  eq('the URL is the camera', new URL(page.url()).pathname, '/wedding/camera');
  const body = await page.innerText('body');
  ok('the title survived', body.includes('The Wedding Through Your Eyes'));
  ok('the shutter is offered', await page.isVisible('[data-testid="take-photo"]'));

  const input = page.locator('[data-testid="camera-input"]');
  eq('the input asks for the rear camera', await input.getAttribute('capture'), 'environment');
  eq('and accepts images', await input.getAttribute('accept'), 'image/*');

  ok('no preview yet', !(await page.isVisible('[data-testid="preview-image"]')));
  ok('no video element — getUserMedia is gone',
     (await page.locator('video').count()) === 0);

  // The shutter, its label and its hint must read as one centred unit.
  // `display: grid` made the button a block-level box, which text-align
  // cannot centre, so it sat against the left gutter at every width while
  // the label stayed centred. Measured, not eyeballed — this shipped to a
  // real phone precisely because nobody measured it.
  const centres = await page.evaluate(() => {
    const mid = (el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; };
    const byText = (re) => [...document.querySelectorAll('p')].find((n) => re.test(n.textContent));
    return {
      shutter: mid(document.querySelector('[data-testid="take-photo"]')),
      label: mid(byText(/take a photo/i)),
      hint: mid(byText(/camera will open/i)),
      page: window.innerWidth / 2,
    };
  });
  ok('the shutter is centred in the viewport',
     Math.abs(centres.shutter - centres.page) <= 1,
     `shutter at ${Math.round(centres.shutter)}, centre is ${Math.round(centres.page)}`);
  ok('the label sits on the same axis',
     Math.abs(centres.shutter - centres.label) <= 1,
     `shutter ${Math.round(centres.shutter)} vs label ${Math.round(centres.label)}`);
  ok('and so does the hint',
     Math.abs(centres.shutter - centres.hint) <= 1,
     `shutter ${Math.round(centres.shutter)} vs hint ${Math.round(centres.hint)}`);
}

/* ── Capture → preview ───────────────────────────────────────────────────── */

console.log('\nCapture and preview');
await takePhoto(page);
await page.waitForSelector('[data-testid="preview-image"]');
{
  ok('the photo is shown', await page.isVisible('[data-testid="preview-image"]'));
  ok('Retake is offered', await page.isVisible('[data-testid="retake"]'));
  ok('Send is offered', await page.isVisible('[data-testid="send-photo"]'));
  // innerText reflects text-transform: uppercase, so compare case-insensitively.
  eq('and reads Send Photo',
     (await page.innerText('[data-testid="send-photo"]')).trim().toLowerCase(), 'send photo');
  eq('nothing has been uploaded yet', uploadCalls, 0);
  eq('and nothing has been signed yet', signCalls, 0);
}

/* ── Retake ──────────────────────────────────────────────────────────────── */

console.log('\nRetake');
await page.click('[data-testid="retake"]');
await page.waitForSelector('[data-testid="take-photo"]');
{
  ok('the preview is gone', !(await page.isVisible('[data-testid="preview-image"]')));
  eq('and still nothing was sent', signCalls, 0);
}

/* ── Send ────────────────────────────────────────────────────────────────── */

console.log('\nSending');
await takePhoto(page);
await page.waitForSelector('[data-testid="preview-image"]');

// Hold the upload open so the in-flight state can actually be observed.
let releaseUpload;
const held = new Promise((r) => { releaseUpload = r; });
await page.unroute('https://storage.test/**');
await page.route('https://storage.test/**', async (route) => {
  uploadCalls++;
  await held;
  return route.fulfill({ status: 200, body: '' });
});

await page.click('[data-testid="send-photo"]');
await page.waitForFunction(() =>
  document.querySelector('[data-testid="send-photo"]')?.textContent?.includes('Sending'));
{
  ok('Send is disabled while uploading',
     await page.locator('[data-testid="send-photo"]').isDisabled());
  ok('Retake is disabled too',
     await page.locator('[data-testid="retake"]').isDisabled());

  // A double tap must not produce a second upload.
  const before = signCalls;
  await page.locator('[data-testid="send-photo"]').dispatchEvent('click');
  await page.locator('[data-testid="send-photo"]').dispatchEvent('click');
  await page.waitForTimeout(150);
  eq('a double tap signs nothing extra', signCalls, before);
}

releaseUpload();
await page.waitForSelector('[data-testid="success"]');
{
  const body = await page.innerText('body');
  ok('the success screen appears', body.includes('Thank you'));
  ok('with the right words', body.includes('Thank you for capturing a piece of our day'));
  ok('and a count', /1 photo sent/i.test(body));
  ok('Take Another is offered', await page.isVisible('[data-testid="take-another"]'));
  eq('exactly one sign call', signCalls, 1);
  eq('exactly one upload', uploadCalls, 1);
}

/* ── What was actually sent ──────────────────────────────────────────────── */

console.log('\nWhat the client claimed');
{
  const sent = signBodies[0];
  eq('a jpeg', sent.contentType, 'image/jpeg');
  ok('a uuid session id', /^[0-9a-f-]{36}$/.test(sent.sessionId));
  ok('downscaled to 2400 on the long edge', Math.max(sent.width, sent.height) === 2400,
     `${sent.width}x${sent.height}`);
  ok('aspect ratio preserved (4032x3024 is 4:3)',
     Math.abs((sent.width / sent.height) - (4032 / 3024)) < 0.01,
     `${sent.width}x${sent.height}`);
  ok('and is far smaller than an original', sent.bytes < 4 * 1024 * 1024, `${sent.bytes} bytes`);
}

/* ── Take another ────────────────────────────────────────────────────────── */

console.log('\nTake another');
await page.unroute('https://storage.test/**');
await page.route('https://storage.test/**', async (route) => {
  uploadCalls++;
  return route.fulfill({ status: 200, body: '' });
});
await page.click('[data-testid="take-another"]');
await takePhoto(page, { width: 1200, height: 1600, name: 'IMG_0002.jpg' });
await page.waitForSelector('[data-testid="preview-image"]');
{
  ok('a second photo previews', await page.isVisible('[data-testid="preview-image"]'));
}
await page.click('[data-testid="send-photo"]');
await page.waitForSelector('[data-testid="success"]');
{
  const body = await page.innerText('body');
  ok('the count went up', /2 photos sent/i.test(body), body.match(/\d+ photos? sent/i)?.[0]);
  eq('two signs in total', signCalls, 2);

  const second = signBodies[1];
  ok('a small photo is not upscaled',
     Math.max(second.width, second.height) === 1600, `${second.width}x${second.height}`);
  ok('the session id is the same across photos', second.sessionId === signBodies[0].sessionId);
}

/* ── A failed send keeps the photograph ──────────────────────────────────── */

console.log('\nWhen the network drops');
mode = 'network';
await page.click('[data-testid="take-another"]');
await takePhoto(page, { name: 'IMG_0003.jpg' });
await page.waitForSelector('[data-testid="preview-image"]');
await page.click('[data-testid="send-photo"]');

// Two retries at 2s and 6s, plus the attempts themselves.
await page.waitForSelector('[data-testid="send-error"]', { timeout: 30_000 });
{
  ok('the photo is still on screen', await page.isVisible('[data-testid="preview-image"]'));
  ok('an error explains why', (await page.innerText('[data-testid="send-error"]')).length > 0);
  const body = await page.innerText('body');
  ok('and says the photo was kept', /still here/i.test(body));
  eq('the button becomes Try Again',
     (await page.innerText('[data-testid="send-photo"]')).trim().toLowerCase(), 'try again');
  ok('and is enabled again', await page.locator('[data-testid="send-photo"]').isEnabled());
  ok('it retried rather than giving up at once', signCalls >= 5, `${signCalls} sign calls total`);
  ok('no success screen', !(await page.isVisible('[data-testid="success"]')));
}

console.log('\nRetrying the same photo');
mode = 'ok';
await page.click('[data-testid="send-photo"]');
await page.waitForSelector('[data-testid="success"]');
{
  const body = await page.innerText('body');
  ok('the retry succeeds without retaking', /3 photos sent/i.test(body),
     body.match(/\d+ photos? sent/i)?.[0]);
}

/* ── A refusal is not retried ────────────────────────────────────────────── */

console.log('\nWhen the server refuses');
mode = 'reject';
const beforeReject = signCalls;
await page.click('[data-testid="take-another"]');
await takePhoto(page, { name: 'IMG_0004.jpg' });
await page.waitForSelector('[data-testid="preview-image"]');
await page.click('[data-testid="send-photo"]');
await page.waitForSelector('[data-testid="send-error"]');
{
  eq('a 4xx is asked exactly once', signCalls - beforeReject, 1);
  ok('the reason is the server\'s own',
     (await page.innerText('[data-testid="send-error"]')).includes('cannot send that kind of file'));
  ok('and the photo is still held', await page.isVisible('[data-testid="preview-image"]'));
}

/* ── Oversized files never reach the server ──────────────────────────────── */

console.log('\nToo large');
mode = 'ok';
await page.click('[data-testid="retake"]');
await page.waitForSelector('[data-testid="take-photo"]');
{
  const before = signCalls;
  await page.setInputFiles('[data-testid="camera-input"]', {
    name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(21 * 1024 * 1024, 7),
  });
  await page.waitForSelector('[data-testid="prepare-error"]');
  const text = await page.innerText('[data-testid="prepare-error"]');
  ok('the guest is told', /too large/i.test(text), text);
  eq('and nothing was signed', signCalls, before);
  ok('no preview is shown', !(await page.isVisible('[data-testid="preview-image"]')));
}

console.log('\nA file that is not an image');
{
  const before = signCalls;
  await page.setInputFiles('[data-testid="camera-input"]', {
    name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4'),
  });
  await page.waitForSelector('[data-testid="prepare-error"]');
  const text = await page.innerText('[data-testid="prepare-error"]');
  ok('it is refused', /not a photo/i.test(text), text);
  eq('and nothing was signed', signCalls, before);
}

/* ── Backing out of the camera app ───────────────────────────────────────── */

console.log('\nBacking out of the camera');
{
  const before = signCalls;
  await page.setInputFiles('[data-testid="camera-input"]', []);
  await page.waitForTimeout(200);
  ok('no preview', !(await page.isVisible('[data-testid="preview-image"]')));
  eq('nothing signed', signCalls, before);
  ok('the shutter is still there', await page.isVisible('[data-testid="take-photo"]'));
}

/* ── No credentials in the page ──────────────────────────────────────────── */

console.log('\nSecrets');
{
  const html = await page.content();
  ok('no service-role key in the document', !/service[_-]?role/i.test(html));
  const scripts = await page.evaluate(async () => {
    const urls = [...document.querySelectorAll('script[src]')].map((s) => s.src);
    const bodies = await Promise.all(urls.map((u) => fetch(u).then((r) => r.text()).catch(() => '')));
    return bodies.join('\n');
  });
  ok('nor in the bundle', !/service[_-]?role/i.test(scripts));
  ok('the bundle does not reference the bucket directly', !scripts.includes('guest-photos'),
     'the browser should only ever learn the path from the server');
}

/* ── What a prepared photograph actually weighs ──────────────────────────── */

/**
 * Reads the size of the blob the client actually produced, straight off the
 * preview. The objective is roughly a megabyte for a typical photograph, so
 * this reports rather than merely asserting — a number nobody looks at is a
 * number that drifts.
 *
 * "Typical" and "busy" are two different tests on purpose. A JPEG encoder
 * spends its bytes on detail, so a smooth frame and a noisy one are the two
 * ends of what a wedding will actually produce.
 */
console.log('\nPrepared sizes');
mode = 'ok';

async function measure(label, opts) {
  await page.click('[data-testid="retake"]').catch(() => {});
  await page.waitForSelector('[data-testid="take-photo"]').catch(() => {});
  await takePhoto(page, opts);
  await page.waitForSelector('[data-testid="preview-image"]');
  const out = await page.evaluate(async () => {
    const img = document.querySelector('[data-testid="preview-image"]');
    const blob = await fetch(img.src).then((r) => r.blob());
    const bmp = await createImageBitmap(blob);
    const dims = `${bmp.width}x${bmp.height}`;
    bmp.close?.();
    return { bytes: blob.size, dims };
  });
  console.log(`      ${label}: ${out.dims}, ${(out.bytes / 1024 / 1024).toFixed(2)} MB`);
  return out;
}

{
  // The number that actually matters for the storage budget.
  const real = await measure('12MP landscape, photograph-like', { width: 4032, height: 3024, busy: 'photo' });
  eq('a photograph-like frame becomes 2400x1800', real.dims, '2400x1800');
  ok('and lands near a megabyte', real.bytes <= 2 * 1024 * 1024, `${real.bytes} bytes`);

  const realPortrait = await measure('12MP portrait, photograph-like', { width: 3024, height: 4032, busy: 'photo' });
  eq('portrait becomes 1800x2400', realPortrait.dims, '1800x2400');

  const landscape = await measure('12MP landscape, flat colour', { width: 4032, height: 3024 });
  eq('a flat frame becomes 2400x1800 too', landscape.dims, '2400x1800');
  ok('and is around a megabyte or less', landscape.bytes <= 1.5 * 1024 * 1024,
     `${landscape.bytes} bytes`);

  const small = await measure('1200x1600, not upscaled', { width: 1200, height: 1600 });
  eq('a small photo keeps its own size', small.dims, '1200x1600');

  const busy = await measure('12MP busy/high-detail', { width: 4032, height: 3024, busy: true });
  eq('a busy frame is still 2400 on the long edge',
     busy.dims.split('x')[0], '2400');
  ok('and stays well inside the 20MB ceiling', busy.bytes < 20 * 1024 * 1024,
     `${busy.bytes} bytes`);
  console.log('      (a busy frame is allowed to exceed ~1MB — there is no recompression loop)');
}

/* ── Done ────────────────────────────────────────────────────────────────── */

await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  • ${f}`)); process.exit(1); }
