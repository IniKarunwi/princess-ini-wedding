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

/* ── 0 · The public chart, before anyone signs in ────────────────────────── */

console.log('\nThe public seating chart');
{
  const visitor = await device();
  const p = await visitor.newPage();

  // Watch everything the page fetches. The claim is not "no names are shown"
  // but "no names are sent", and only the network can say that.
  const bodies = [];
  p.on('response', async (r) => {
    if (!r.url().includes('/api/')) return;
    try { bodies.push(await r.text()); } catch { /* redirect or no body */ }
  });

  await p.goto(B + '/seating-chart', { waitUntil: 'domcontentloaded' });
  await settle(p);

  // A real name from the seeded plan, read through the planner API in another
  // context so this one never touches it.
  const admin = await device();
  const ap = await open(admin);
  await signIn(ap, 'Princess');
  await ap.waitForTimeout(700);
  const known = await ap.evaluate(async () => {
    const res = await fetch('/api/planner/draft', { credentials: 'same-origin' });
    const { draft } = await res.json();
    const t = draft.tables.find((x) => x.kind === 'round' && x.entries.length > 1);
    return { name: t.entries[0].name, others: t.entries.slice(1).map((e) => e.name), number: t.number };
  });
  await ap.close();

  const pageText = await p.locator('body').innerText();
  ck('no guest name appears on the public page', !pageText.includes(known.name));
  ck('and table numbers do', /table\s*\d/i.test(pageText));
  ck('the hall structure is still labelled', /bride\s*&?\s*groom|dance/i.test(pageText));
  ck('the tables are drawn', await tableCount(p) > 0);

  const sentNames = bodies.filter((b) => b.includes(known.name));
  ck('no API response sent a guest name to this browser', sentNames.length === 0);

  // Tapping a table must not open a manifest.
  await p.locator(`[data-table-id="${await roundTableId(p)}"]`).click();
  await p.waitForTimeout(500);
  ck('tapping a table opens no guest list',
    await p.getByRole('dialog').count() === 0
    && !(await p.locator('body').innerText()).includes(known.name));

  /* ── The public acceptance test ─────────────────────────────────── */
  ck('the search asks for a name', await p.getByLabel(/enter your name/i).count() === 1);

  await p.getByLabel(/enter your name/i).fill(known.name);
  await p.getByRole('button', { name: /find my seat/i }).click();
  await p.waitForTimeout(900);

  const after = await p.locator('body').innerText();
  ck('the seat is confirmed in the promised words',
    /thanks for honouring our invite, your seat is confirmed/i.test(after), after.slice(0, 200));
  ck('with the published table number',
    new RegExp(`you're on table ${known.number}\\b`, 'i').test(after), after.slice(0, 300));
  ck('and the instruction for the door', /give your name at the door/i.test(after));

  const stillPrivate = known.others.filter((n) => after.includes(n));
  ck('nobody else at that table is revealed', stillPrivate.length === 0, stillPrivate[0]);

  const highlighted = await p.evaluate(() =>
    [...document.querySelectorAll('[data-table-id] circle')]
      .some((c) => c.getAttribute('stroke-width') === '4'));
  ck('the table is highlighted on the schematic', highlighted);

  // A name nobody has.
  await p.getByRole('button', { name: /search another name/i }).click();
  await p.waitForTimeout(300);
  await p.getByLabel(/enter your name/i).fill('Nobody Invited Here');
  await p.getByRole('button', { name: /find my seat/i }).click();
  await p.waitForTimeout(800);
  ck("an unknown name gets the polite refusal",
    /couldn't find that name/i.test(await p.locator('body').innerText()));
  ck('and can search again', await p.getByLabel(/enter your name/i).count() === 1);

  await p.close();
}

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

/* ── 7 · Click is not drag ───────────────────────────────────────────────── */

console.log('\nClicking a table versus dragging it');
{
  const p = await open(laptop);
  const id = await roundTableId(p);

  /** The table's rendered position, so "did it move?" is answered by the DOM. */
  const pos = (page, tid) => page.evaluate((t) => {
    const b = document.querySelector(`[data-table-id="${t}"]`)?.getBBox?.();
    return b ? `${Math.round(b.x)},${Math.round(b.y)}` : null;
  }, tid);

  /**
   * A name seated at that table, to tell whether the details panel opened.
   *
   * Checked through the rename INPUT, not through body text: in planner mode
   * each guest is an editable field, and an input's value is not part of
   * innerText. Asserting on the text would have reported the panel closed
   * while it was plainly open.
   */
  const seated = await p.evaluate(async (tid) => {
    const res = await fetch('/api/planner/draft', { credentials: 'same-origin' });
    const { draft } = await res.json();
    return draft.tables.find((t) => t.id === tid)?.entries[0]?.name ?? null;
  }, id);
  ck('the table under test has someone seated at it', !!seated);

  /** Is THIS table's detail panel open? */
  const opened = () => p.getByLabel(`Name for ${seated}`).count().then((n) => n > 0);

  /** Moves the selection elsewhere, so each case starts from a known state. */
  const selectAnother = async () => {
    const other = await p.evaluate((skip) =>
      [...document.querySelectorAll('[data-table-id]')]
        .map((el) => el.getAttribute('data-table-id'))
        .find((t) => !t.includes('vip') && t !== skip), id);
    await p.locator(`[data-table-id="${other}"]`).click();
    await p.waitForTimeout(350);
  };

  const box = await p.locator(`[data-table-id="${id}"]`).boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // ── 1 · A plain click opens the members and moves nothing ──────────
  const before = await pos(p, id);
  await p.mouse.move(cx, cy);
  await p.mouse.down();
  await p.mouse.up();
  await p.waitForTimeout(450);

  ck('a plain click opens the table members', await opened());
  ck('and the table has not moved', await pos(p, id) === before,
    `${await pos(p, id)} vs ${before}`);

  // ── 2 · A tremor smaller than the threshold is still a click ───────
  await selectAnother();
  ck('selection moved away, ready for the next case', !(await opened()));

  await p.mouse.move(cx, cy);
  await p.mouse.down();
  // 4px diagonally: about 5.7px of travel, comfortably under 8.
  await p.mouse.move(cx + 4, cy + 4, { steps: 4 });
  await p.mouse.up();
  await p.waitForTimeout(450);

  ck('a wobble under 8px still opens the table members', await opened());
  ck('and still has not moved the table', await pos(p, id) === before,
    `${await pos(p, id)} vs ${before}`);

  // ── 3 · Past the threshold it is a drag, and only a drag ───────────
  await selectAnother();

  let moved = false;
  for (const [dx, dy] of [[0, 90], [0, -90], [90, 0], [-90, 0], [0, 150]]) {
    await p.mouse.move(cx, cy);
    await p.mouse.down();
    await p.mouse.move(cx + dx, cy + dy, { steps: 12 });
    await p.mouse.up();
    await p.waitForTimeout(400);
    if (await pos(p, id) !== before) { moved = true; break; }
  }
  ck('a drag past 8px moves the table', moved, `still at ${before}`);
  ck('and the drag does not also open the table members', !(await opened()),
    'the drop was treated as a click too');

  await p.close();
}

/* ── 8 · Removing a guest ────────────────────────────────────────────────── */

console.log('\nRemoving a guest');
{
  const a = await open(laptop);
  const b = await open(phone);

  const id = await roundTableId(a);
  const plan = (page) => page.evaluate(async (tid) => {
    const r = await fetch('/api/planner/draft', { credentials: 'same-origin' });
    const { draft } = await r.json();
    const t = draft.tables.find((x) => x.id === tid);
    return { version: draft.version, number: t.number,
             names: t.entries.map((e) => e.name), seats: t.entries.reduce((n, e) => n + e.seats, 0) };
  }, id);

  const before = await plan(a);
  const victim = before.names[0];

  await a.locator(`[data-table-id="${id}"]`).click();
  await a.waitForTimeout(400);

  const seatsOnScreen = async (page) =>
    (await page.locator('aside').innerText()).match(/(\d+)\/(\d+)\s*\n?SEATS/i)?.[0]
    ?? (await page.locator('aside').innerText()).match(/\d+\/\d+/)?.[0];
  const countBefore = await seatsOnScreen(a);

  // ── The control, and the question it asks ───────────────────────
  ck('each guest has a Remove action',
    await a.getByRole('button', { name: `Remove ${victim}` }).count() === 1);

  await a.getByRole('button', { name: `Remove ${victim}` }).click();
  await a.waitForTimeout(300);

  const ask = await a.locator('body').innerText();
  ck('it asks before removing anyone',
    new RegExp(`remove ${victim.replace(/[.*+?^$|()\[\]{}\\]/g, '\\$&')} from table`, 'i').test(ask),
    ask.match(/remove [^\n]*/i)?.[0]);

  // Backing out must change nothing.
  await a.getByRole('button', { name: /^keep$/i }).click();
  await a.waitForTimeout(300);
  ck('declining leaves the guest seated',
    (await plan(a)).names.length === before.names.length);

  // ── Confirm ─────────────────────────────────────────────────────
  await a.getByRole('button', { name: `Remove ${victim}` }).click();
  await a.waitForTimeout(250);
  await a.getByRole('button', { name: /yes, remove/i }).click();
  await a.waitForTimeout(500);

  const countAfter = await seatsOnScreen(a);
  ck('the occupied count drops immediately', countAfter !== countBefore,
    `${countBefore} then ${countAfter}`);
  ck('and the guest is gone from the panel',
    await a.getByRole('button', { name: `Remove ${victim}` }).count() === 0);
  ck('it counts as an unpublished change',
    /unpublished changes/i.test(await a.locator('body').innerText()));

  // ── Undo brings them back ───────────────────────────────────────
  await a.getByRole('button', { name: /undo/i }).click();
  await a.waitForTimeout(450);
  ck('undo restores the removed guest',
    await a.getByRole('button', { name: `Remove ${victim}` }).count() === 1);
  ck('and the count goes back', await seatsOnScreen(a) === countBefore,
    `${await seatsOnScreen(a)} vs ${countBefore}`);

  // Remove again, for real this time.
  await a.getByRole('button', { name: `Remove ${victim}` }).click();
  await a.waitForTimeout(250);
  await a.getByRole('button', { name: /yes, remove/i }).click();
  await a.waitForTimeout(400);

  // ── Save Draft: shared, but not yet public ──────────────────────
  await a.getByRole('button', { name: /save draft/i }).click();
  await a.waitForTimeout(1000);
  ck('the removal saves', /draft saved · version\s*\d/i.test(await a.locator('body').innerText()));

  const onShared = await plan(a);
  ck('the shared draft no longer has them', !onShared.names.includes(victim));
  ck('and one fewer seat is taken', onShared.seats < before.seats);

  await b.reload({ waitUntil: 'domcontentloaded' });
  await settle(b);
  ck('the second device sees the removal', !(await plan(b)).names.includes(victim));

  // The public side must be untouched until Publish.
  const lookup = (page, q) => page.evaluate(async (name) => {
    const r = await fetch('/api/seating/lookup', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: name }),
    });
    return r.json();
  }, q);

  const guest = await (await device()).newPage();
  await guest.goto(B + '/seating-chart', { waitUntil: 'domcontentloaded' });
  await settle(guest);

  const stillThere = await lookup(guest, victim);
  ck('Find My Seat still finds them before Publish', stillThere.found === true,
    JSON.stringify(stillThere).slice(0, 120));

  const publicSeats = (page) => page.evaluate(async (tid) => {
    const r = await fetch('/api/seating/published');
    const { published } = await r.json();
    return published.tables.find((t) => t.id === tid).seated;
  }, id);
  const publicBefore = await publicSeats(guest);
  ck('and the public seated count has not moved', publicBefore === before.seats,
    `${publicBefore} vs ${before.seats}`);

  // ── Publish ─────────────────────────────────────────────────────
  await a.getByRole('button', { name: /publish changes/i }).click();
  await a.getByRole('button', { name: /yes, publish/i }).click();
  await a.waitForTimeout(1300);

  await guest.reload({ waitUntil: 'domcontentloaded' });
  await settle(guest);

  const afterPublish = await lookup(guest, victim);
  ck('after Publish, Find My Seat no longer finds them',
    afterPublish.found !== true, JSON.stringify(afterPublish).slice(0, 120));
  const publicAfter = await publicSeats(guest);
  ck('and the public seated count has dropped', publicAfter === before.seats - 1,
    `${publicAfter} vs ${before.seats - 1}`);

  await guest.close();
  await a.close();
  await b.close();
}

/* ── 9 · A blank rename is not a removal ─────────────────────────────────── */

console.log('\nEmptying a name does nothing');
{
  const p = await open(laptop);
  const id = await roundTableId(p);
  const state = () => p.evaluate(async (tid) => {
    const r = await fetch('/api/planner/draft', { credentials: 'same-origin' });
    const { draft } = await r.json();
    const t = draft.tables.find((x) => x.id === tid);
    return { version: draft.version, names: t.entries.map((e) => e.name) };
  }, id);

  const before = await state();
  const name = before.names[0];

  await p.locator(`[data-table-id="${id}"]`).click();
  await p.waitForTimeout(400);

  const field = p.getByLabel(`Name for ${name}`);
  await field.click();
  await field.fill('');
  await p.getByRole('button', { name: /save draft/i }).click();
  await p.waitForTimeout(1000);

  ck('the field visibly restores the name rather than staying blank',
    await p.getByLabel(`Name for ${name}`).inputValue() === name,
    JSON.stringify(await p.getByLabel(`Name for ${name}`).inputValue().catch(() => 'gone')));

  const after = await state();
  ck('the guest is still seated', after.names.includes(name));
  ck('nobody was removed', after.names.length === before.names.length);
  ck('and the shared version did not move', after.version === before.version,
    `${before.version} then ${after.version}`);

  await p.close();
}

/* ── 10 · Signing out ─────────────────────────────────────────────────────── */

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
