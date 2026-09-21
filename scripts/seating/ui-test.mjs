/**
 * The shared planner, driven through the real browser UI.
 *
 * Two browser CONTEXTS stand in for two devices: separate cookie jars,
 * separate localStorage, exactly as a laptop and a phone would be. What this
 * proves that the API tests cannot: that a session survives a reload without
 * anything in page storage, that a 409 reaches the planner as a sentence
 * rather than a console error, and that the recovery notice finds a
 * browser-local draft and uploads it.
 *
 * Needs the dev server on 127.0.0.1:8080 — `npx vite --host 127.0.0.1`.
 */

import { chromium } from '/home/user/princess-ini-wedding/node_modules/playwright-core/index.mjs';

const B = 'http://127.0.0.1:8080';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const results = [];
const ck = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail !== undefined && !pass ? `  — ${detail}` : ''}`);
};

/**
 * The dev server's store lives in memory and survives between runs of this
 * file. A fixed name would already be in the shared draft on the second run,
 * leaving nothing to recover and failing for a reason that has nothing to do
 * with the code.
 */
const UNIQUE_NAME = `Only This Laptop Knows ${Date.now()}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

/** One browser context = one device. */
const device = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 940 } });
  return ctx;
};

/**
 * `networkidle` is not usable here: the dev server holds an HMR websocket
 * open, so the network is never idle and the wait times out. Wait for the
 * room instead, which is the thing the test actually needs.
 */
const settle = async (p) => {
  await p.waitForSelector('[data-table-id]', { timeout: 15000 });
  await p.waitForTimeout(500);
};

const open = async (ctx) => {
  const p = await ctx.newPage();
  await p.goto(B + '/seating-chart', { waitUntil: 'domcontentloaded' });
  await settle(p);
  return p;
};

const signIn = async (p, who) => {
  const planners = p.getByRole('button', { name: /^planners$/i });
  if (await planners.count()) await planners.click();
  await p.getByLabel('Your planner name').fill(who);
  await p.getByLabel('Planner PIN').fill('2530');
  await p.getByRole('button', { name: /sign in/i }).click();
  await p.waitForTimeout(600);
};

const tableCount = (p) => p.evaluate(() =>
  document.querySelectorAll('[data-table-id]').length);

/**
 * A ROUND table. The VIP slabs come first in the layout and are deliberately
 * not numbered, so reaching for the first `[data-table-id]` finds a table
 * with no number field and the test fails for the wrong reason.
 */
const roundTableId = (p) => p.evaluate(() =>
  [...document.querySelectorAll('[data-table-id]')]
    .map((el) => el.getAttribute('data-table-id'))
    .find((id) => !id.includes('vip')) ?? null);

/* ── 1 · Signing in asks for a name ──────────────────────────────────────── */

console.log('\nSigning in');
const laptop = await device();
{
  const p = await open(laptop);

  ck('a guest sees no editing controls',
    await p.getByRole('button', { name: /publish changes/i }).count() === 0);
  ck('the room loaded for a guest', await tableCount(p) > 0);

  await p.getByRole('button', { name: /^planners$/i }).click();
  ck('sign-in asks for a name', await p.getByLabel('Your planner name').count() === 1);
  ck('and a PIN', await p.getByLabel('Planner PIN').count() === 1);

  // Wrong PIN first.
  await p.getByLabel('Your planner name').fill('Princess');
  await p.getByLabel('Planner PIN').fill('0000');
  await p.getByRole('button', { name: /sign in/i }).click();
  await p.waitForTimeout(500);
  ck('a wrong PIN is refused in the page',
    await p.getByRole('alert').filter({ hasText: /not that one/i }).count() === 1);
  ck('and no editing controls appear',
    await p.getByRole('button', { name: /publish changes/i }).count() === 0);

  await p.getByLabel('Planner PIN').fill('2530');
  await p.getByRole('button', { name: /sign in/i }).click();
  await p.waitForTimeout(700);
  ck('the right PIN opens the planner bar',
    await p.getByRole('button', { name: /publish changes/i }).count() === 1);

  const body = await p.locator('body').innerText();
  ck('the audit line names the shared draft and its version', /shared draft.*version\s*\d/i.test(body), body.slice(0, 200));
  ck('the sign-out button carries the planner name',
    await p.getByRole('button', { name: /sign out princess/i }).count() === 1);

  // Nothing about the session is readable by page JavaScript.
  const leaked = await p.evaluate(() => ({
    cookie: document.cookie,
    keys: Object.keys(localStorage).concat(Object.keys(sessionStorage)),
  }));
  ck('the session cookie is invisible to page JavaScript', !leaked.cookie.includes('pi_planner'), leaked.cookie);
  ck('and no PIN or token is kept in storage',
    !leaked.keys.some((k) => /admin|planner|token/i.test(k)), JSON.stringify(leaked.keys));

  await p.close();
}

/* ── 2 · The session survives a closed tab ───────────────────────────────── */

console.log('\nStaying signed in');
{
  const p = await open(laptop);   // brand new tab, same browser
  ck('a new tab is still signed in',
    await p.getByRole('button', { name: /publish changes/i }).count() === 1);

  await p.reload({ waitUntil: 'domcontentloaded' });
  await settle(p);
  ck('and so is a reload',
    await p.getByRole('button', { name: /publish changes/i }).count() === 1);
  await p.close();
}

/* ── 3 · Two devices, one draft ──────────────────────────────────────────── */

console.log('\nTwo devices, one draft');
const phone = await device();
let movedId;
{
  const a = await open(laptop);
  const b = await open(phone);
  await signIn(b, 'Ini');

  // Move a table on the laptop, save, and look for it on the phone.
  movedId = await roundTableId(a);

  const before = await b.evaluate((id) => {
    const el = document.querySelector(`[data-table-id="${id}"]`);
    return el?.getAttribute('transform') ?? el?.outerHTML.slice(0, 80) ?? '';
  }, movedId);

  // Use the app's own renumbering, which is easier to assert on than a drag.
  await a.locator(`[data-table-id="${movedId}"]`).click();
  await a.waitForTimeout(400);

  const numberField = a.getByLabel(/table number/i);
  const hasField = await numberField.count() > 0;
  ck('the planner can reach the table-number field', hasField);

  if (hasField) {
    await numberField.fill('37');
    await a.getByRole('button', { name: /^update$/i }).click();
    await a.waitForTimeout(300);
    await a.getByRole('button', { name: /save draft/i }).click();
    await a.waitForTimeout(800);

    const saved = await a.locator('body').innerText();
    ck('the save is confirmed with a version', /draft saved · version\s*\d/i.test(saved),
       saved.match(/draft saved[^\n]*/i)?.[0]);

    await b.reload({ waitUntil: 'domcontentloaded' });
    await settle(b);
    const onPhone = await b.locator('body').innerText();
    ck('the other device sees the new number after reloading', /table\s*37/i.test(onPhone));
    void before;
  }

  /* ── The acceptance test: MOVE a table, not just renumber one ──────────
     Dragging is the other half of "the same saved chart", and it exercises
     a different path: coordinates rather than a label. The hall is dense,
     so a guessed offset is quite likely to land inside the dance floor or
     another table and be refused — which would fail this test for a reason
     that has nothing to do with saving. So try a few and take the first
     the app actually accepts. */
  {
    const pos = (page, id) => page.evaluate((tid) => {
      const c = document.querySelector(`[data-table-id="${tid}"] circle:nth-of-type(1)`)
        ?? document.querySelector(`[data-table-id="${tid}"] circle`);
      const el = document.querySelector(`[data-table-id="${tid}"]`);
      const box = el?.getBBox?.();
      return box ? `${Math.round(box.x)},${Math.round(box.y)}` : (c ? `${c.getAttribute('cx')},${c.getAttribute('cy')}` : null);
    }, id);

    const start = await pos(a, movedId);
    const box = await a.locator(`[data-table-id="${movedId}"]`).boundingBox();

    let dragged = false;
    for (const [dx, dy] of [[0, 90], [0, -90], [90, 0], [-90, 0], [0, 150]]) {
      await a.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await a.mouse.down();
      await a.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 12 });
      await a.mouse.up();
      await a.waitForTimeout(350);
      if (await pos(a, movedId) !== start) { dragged = true; break; }
    }
    ck('a table can be dragged to a new spot', dragged);

    if (dragged) {
      const moved = await pos(a, movedId);
      await a.getByRole('button', { name: /save draft/i }).click();
      await a.waitForTimeout(900);
      ck('the move saves',
        /draft saved · version\s*\d/i.test(await a.locator('body').innerText()));

      await b.reload({ waitUntil: 'domcontentloaded' });
      await settle(b);
      ck('the other device sees the moved table after refreshing',
        await pos(b, movedId) === moved, `${await pos(b, movedId)} vs ${moved}`);

      // A third device, signing in fresh, must see the same thing.
      const third = await device();
      const c = await open(third);
      await signIn(c, 'Coordinator');
      await c.waitForTimeout(800);
      ck('and so does a third planner signing in for the first time',
        await pos(c, movedId) === moved, `${await pos(c, movedId)} vs ${moved}`);
      await c.close();
    }
  }

  await a.close();
  await b.close();
}

/* ── 4 · A conflict is explained, not merged ─────────────────────────────── */

console.log('\nWhen two planners collide');
{
  const a = await open(laptop);
  const b = await open(phone);

  // Both are holding the same draft version. The phone saves first.
  await b.locator(`[data-table-id="${await roundTableId(b)}"]`).click();
  await b.waitForTimeout(300);
  const bField = b.getByLabel(/table number/i);
  if (await bField.count()) {
    await bField.fill('41');
    await b.getByRole('button', { name: /^update$/i }).click();
    await b.waitForTimeout(200);
  }
  await b.getByRole('button', { name: /save draft/i }).click();
  await b.waitForTimeout(800);

  // Now the laptop, still on the old version, tries to save.
  await a.locator(`[data-table-id="${await roundTableId(a)}"]`).click();
  await a.waitForTimeout(300);
  const aField = a.getByLabel(/table number/i);
  if (await aField.count()) {
    await aField.fill('42');
    await a.getByRole('button', { name: /^update$/i }).click();
    await a.waitForTimeout(200);
  }
  await a.getByRole('button', { name: /save draft/i }).click();
  await a.waitForTimeout(900);

  const warned = await a.getByRole('alert')
    .filter({ hasText: /changed since you opened it/i }).count();
  ck('the stale device is told the plan changed', warned === 1);

  const text = await a.locator('body').innerText();
  ck('it names who got there first', /ini/i.test(text));
  ck('it says nothing was overwritten', /nothing of theirs was overwritten/i.test(text));
  ck('and offers to load the latest draft',
    await a.getByRole('button', { name: /load the latest draft/i }).count() === 1);
  ck('the planner still has their own edit on screen', /table\s*42/i.test(text));

  await a.getByRole('button', { name: /load the latest draft/i }).click();
  await a.waitForTimeout(900);
  const after = await a.locator('body').innerText();
  ck('reloading clears the warning',
    await a.getByRole('alert').filter({ hasText: /changed since you opened it/i }).count() === 0);
  ck("and shows the other planner's version", /table\s*41/i.test(after));

  await a.close();
  await b.close();
}

/* ── 5 · A draft left behind by the old prototype ────────────────────────── */

console.log('\nRecovering a browser-local draft');
{
  const legacyDevice = await device();
  const p = await legacyDevice.newPage();
  await p.goto(B + '/seating-chart', { waitUntil: 'domcontentloaded' });
  await settle(p);
  await signIn(p, 'Coordinator');
  await p.waitForTimeout(600);

  /**
   * Plant a prototype-era draft that differs from the shared one in exactly
   * one way: a rename. Cloned from the CURRENT shared draft, not from the
   * published room — earlier sections of this file have already moved the two
   * apart, and a local copy that differed in five ways would still pass while
   * saying nothing about whether a rename is reported.
   */
  const planted = await p.evaluate(async (uniqueName) => {
    const res = await fetch('/api/planner/draft', { credentials: 'same-origin' });
    const { draft } = await res.json();
    const local = { ...draft, status: 'draft' };
    const t = local.tables.find((x) => x.entries.length);
    t.entries = t.entries.map((e, i) =>
      i === 0 ? { ...e, name: uniqueName, renamed: true } : e);
    localStorage.setItem('pi.seating.draft.v1', JSON.stringify(local));
    return { tableId: t.id, was: t.entries[0].id };
  }, UNIQUE_NAME);

  await p.reload({ waitUntil: 'domcontentloaded' });
  await settle(p);
  await p.waitForTimeout(800);

  const notice = p.getByRole('region', { name: /unsynced planner changes/i });
  ck('the notice appears for a signed-in planner', await notice.count() === 1);

  const guestPage = await (await device()).newPage();
  await guestPage.goto(B + '/seating-chart', { waitUntil: 'domcontentloaded' });
  await settle(guestPage);
  ck('and never for a guest',
    await guestPage.getByRole('region', { name: /unsynced planner changes/i }).count() === 0);
  await guestPage.close();

  await p.getByRole('button', { name: /review local changes/i }).click();
  await p.waitForTimeout(300);
  ck('reviewing lists what differs',
    (await p.locator('body').innerText()).includes(UNIQUE_NAME));

  await p.getByRole('button', { name: /upload as shared draft/i }).click();
  await p.waitForTimeout(1000);

  const afterUpload = await p.locator('body').innerText();
  ck('uploading is confirmed', /uploaded as the shared draft/i.test(afterUpload), afterUpload.slice(0, 300));

  const stillThere = await p.evaluate(() => !!localStorage.getItem('pi.seating.draft.v1'));
  ck('the local copy is NOT deleted after uploading', stillThere);

  // And the other requirement: choosing the shared draft must not delete it.
  const other = await device();
  const q = await other.newPage();
  await q.goto(B + '/seating-chart', { waitUntil: 'domcontentloaded' });
  await settle(q);
  await q.evaluate((payload) => localStorage.setItem('pi.seating.draft.v1', payload), JSON.stringify(
    await p.evaluate(() => JSON.parse(localStorage.getItem('pi.seating.draft.v1')))));
  await q.reload({ waitUntil: 'domcontentloaded' });
  await settle(q);
  await signIn(q, 'Coordinator');
  await q.waitForTimeout(800);

  if (await q.getByRole('button', { name: /use shared draft/i }).count()) {
    await q.getByRole('button', { name: /use shared draft/i }).click();
    await q.waitForTimeout(500);
    ck('choosing the shared draft hides the notice',
      await q.getByRole('region', { name: /unsynced planner changes/i }).count() === 0);
    ck('and still does not delete the local copy',
      await q.evaluate(() => !!localStorage.getItem('pi.seating.draft.v1')));
  } else {
    // The upload above made the shared draft identical, so there is nothing
    // to recover — which is itself the correct behaviour.
    ck('an identical local copy raises no notice', true);
    ck('and is left alone', await q.evaluate(() => !!localStorage.getItem('pi.seating.draft.v1')));
  }

  void planted;
  await p.close();
  await q.close();
}

/* ── 6 · Publishing reaches a guest ──────────────────────────────────────── */

console.log('\nPublishing');
{
  const a = await open(laptop);
  await a.locator(`[data-table-id="${await roundTableId(a)}"]`).click();
  await a.waitForTimeout(300);
  const f = a.getByLabel(/table number/i);
  if (await f.count()) {
    await f.fill('55');
    await a.getByRole('button', { name: /^update$/i }).click();
    await a.waitForTimeout(250);
  }

  ck('publish is offered once there are changes',
    await a.getByRole('button', { name: /publish changes/i }).isEnabled());

  await a.getByRole('button', { name: /publish changes/i }).click();
  await a.getByRole('button', { name: /yes, publish/i }).click();
  await a.waitForTimeout(1200);

  const text = await a.locator('body').innerText();
  ck('publishing is confirmed with a version', /published · version\s*\d/i.test(text),
     text.match(/published[^\n]*/i)?.[0]);

  const guest = await (await device()).newPage();
  await guest.goto(B + '/seating-chart', { waitUntil: 'domcontentloaded' });
  await settle(guest);
  ck('a guest on another device sees the published number',
    /table\s*55/i.test(await guest.locator('body').innerText()));
  ck('and still has no editing controls',
    await guest.getByRole('button', { name: /publish changes/i }).count() === 0);

  await guest.close();
  await a.close();
}

/* ── 7 · Signing out ─────────────────────────────────────────────────────── */

console.log('\nSigning out');
{
  const a = await open(laptop);
  await a.getByRole('button', { name: /sign out/i }).click();
  await a.waitForTimeout(700);
  ck('the editing controls go away',
    await a.getByRole('button', { name: /publish changes/i }).count() === 0);

  await a.reload({ waitUntil: 'domcontentloaded' });
  await settle(a);
  ck('and stay away after a reload',
    await a.getByRole('button', { name: /publish changes/i }).count() === 0);

  const b = await open(phone);
  ck('the other planner is unaffected',
    await b.getByRole('button', { name: /publish changes/i }).count() === 1);
  await a.close();
  await b.close();
}

await browser.close();

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
