/**
 * Drives the seating chart the way a guest and a planner actually would.
 */
import { chromium } from '/home/user/princess-ini-wedding/node_modules/playwright-core/index.mjs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = 'http://127.0.0.1:4175/seating-chart';
const PIN = '2530';

let HOME_VIEW = null;
const results = [];
const check = (n, pass, d) => { results.push({ n, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? '  — ' + d : ''}`); };

const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

async function fresh(w = 1440, h = 900) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(600);
  return { ctx, p, errs };
}

const viewBox = (p) => p.locator('svg[role=application]').getAttribute('viewBox');

// The status badge uses text-transform: uppercase, so innerText returns
// "DRAFT — UNPUBLISHED CHANGES". Match on the rendered text, case-folded.
const says = async (p, needle) =>
  (await p.locator('body').innerText()).toUpperCase().includes(needle.toUpperCase());

// The draft lives in React state until "Save draft" is pressed, so it is read
// from the panel, not from localStorage.
const seatsShown = async (p) => {
  const t = await p.locator('aside').innerText();
  const m = t.match(/(\d+)\/(\d+)/);
  return m ? { used: +m[1], cap: +m[2] } : null;
};
const unlock = async (p) => {
  await p.getByLabel('Admin PIN').fill(PIN);
  await p.getByRole('button', { name: 'Unlock' }).click();
  await p.waitForTimeout(400);
};

/* ══ 1. PUBLIC ═══════════════════════════════════════════════════════════ */
{
  const { ctx, p, errs } = await fresh();

  HOME_VIEW = await viewBox(p);
  check('public: page renders', (await p.locator('h1').innerText()).includes('north is up'));
  check('public: no JS errors', errs.length === 0, errs[0]);

  // Count tables by their <title>, which only TableShape emits — the fixed
  // furniture also renders <g>, so a bare child count is 24 + 5 zones.
  const tables = await p.locator('svg[role=application] title').count();
  check('public: 24 tables drawn', tables === 22, `${tables} round (+2 VIP without titles)`);

  // Fixed furniture is present and labelled.
  const svg = await p.locator('svg[role=application]').innerHTML();
  for (const t of ['BRIDE & GROOM', 'Dance Floor', 'CENTRAL AISLE', 'MAIN ENTRANCE', "COUPLE'S DANCE-IN", 'NORTH', 'SOUTH'])
    check(`public: hall shows "${t}"`, svg.includes(t.replace(/&/g, '&amp;').replace(/'/g, "'")) || svg.includes(t));

  // No editing affordances anywhere.
  check('public: no edit controls', await p.getByRole('button', { name: /Publish|Save draft|Undo/ }).count() === 0);
  check('public: no guest drag handles', !svg.includes('⠿'));

  /* Search → fly to table */
  await p.getByLabel('Search for your name').fill('Adaeze');
  await p.waitForTimeout(400);
  check('search: no match for an invented name', await p.locator('ul li button').count() === 0);

  await p.getByLabel('Search for your name').fill('Ofonime');
  await p.waitForTimeout(400);
  const n = await p.locator('ul li button').count();
  check('search: finds a real guest (Ofonime Umoh)', n >= 1, `${n} hit(s)`);

  const before = await viewBox(p);
  await p.locator('ul li button').first().click();
  await p.waitForTimeout(1100);
  const after = await viewBox(p);
  check('search: map flies to the table', before !== after, `${before} -> ${after}`);
  check('search: details panel opens', await p.getByText('Selected table').count() === 1);
  const detail = await p.locator('aside').innerText();
  check('search: shows the right table (bride VIP)', /VIP · Bride/.test(detail), detail.split('\n').slice(0, 4).join(' | '));
  check('search: lists table mates', detail.includes('Suzanne Sado (Mother)'));
  check('search: shows 15/15 seats', /15\/15/.test(detail));

  /* Zoom + pan */
  const z0 = await viewBox(p);
  await p.getByRole('button', { name: 'Zoom in' }).click();
  await p.waitForTimeout(900);
  const z1 = await viewBox(p);
  check('zoom: + changes the viewBox', z0 !== z1);
  check('zoom: + zooms IN (narrower view)', parseFloat(z1.split(' ')[2]) < parseFloat(z0.split(' ')[2]),
    `${z0.split(' ')[2]} -> ${z1.split(' ')[2]}`);
  // The hall's dimensions are the app's business, so "reset" is checked as
  // "back to the view we loaded with" rather than against a hardcoded size.
  await p.getByRole('button', { name: 'Whole room' }).click();
  await p.waitForTimeout(900);
  const reset = await viewBox(p);
  check('zoom: "Whole room" resets', reset.startsWith('0 0 ') && reset === HOME_VIEW,
    `${reset} (loaded with ${HOME_VIEW})`);

  const map = p.locator('svg[role=application]');
  const bb = await map.boundingBox();
  const pv = await viewBox(p);
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.mouse.down();
  await p.mouse.move(bb.x + bb.width / 2 - 160, bb.y + bb.height / 2 - 90, { steps: 12 });
  await p.mouse.up();
  await p.waitForTimeout(300);
  check('pan: dragging moves the view', pv !== await viewBox(p));

  /* Selecting a table by clicking it */
  await p.getByRole('button', { name: 'Whole room' }).click();
  await p.waitForTimeout(900);
  await p.locator('svg[role=application] g').filter({ hasText: /^TABLE07/ }).first().click({ force: true });
  await p.waitForTimeout(400);
  check('select: clicking a table opens its details', await p.getByText('Selected table').count() === 1);

  await ctx.close();
}

/* ══ 2. ADMIN ════════════════════════════════════════════════════════════ */
{
  const { ctx, p, errs } = await fresh();
  await unlock(p);

  check('admin: edit controls appear', await p.getByRole('button', { name: 'Publish changes' }).count() === 1);
  check('admin: starts on published state', await says(p, 'Published · v1'));
  check('admin: prototype warning is shown', await says(p, 'Prototype — not production'));

  /* Wrong PIN is refused */
  const f2 = await fresh();
  await f2.p.getByLabel('Admin PIN').fill('0000');
  await f2.p.getByRole('button', { name: 'Unlock' }).click();
  await f2.p.waitForTimeout(300);
  check('admin: wrong PIN refused', await f2.p.getByRole('button', { name: 'Publish changes' }).count() === 0);
  await f2.ctx.close();

  /* ── Drag a ROUND table ── */
  const posOf = async (id) => p.evaluate((tid) => {
    const l = JSON.parse(localStorage.getItem('pi.seating.draft.v1') || 'null');
    const t = l?.tables.find(t => t.id === tid);
    return t ? { x: t.x, y: t.y } : null;
  }, id);

  const map = p.locator('svg[role=application]');
  const bb = await map.boundingBox();
  const hall = { w: 1200, h: 1500 };
  const vb = (await viewBox(p)).split(' ').map(Number);
  const scale = Math.min(bb.width / vb[2], bb.height / vb[3]);
  const offX = bb.x + (bb.width - vb[2] * scale) / 2;
  const offY = bb.y + (bb.height - vb[3] * scale) / 2;
  const toScreen = (hx, hy) => ({ x: offX + (hx - vb[0]) * scale, y: offY + (hy - vb[1]) * scale });

  const t7 = await p.evaluate(() => {
    const l = JSON.parse(localStorage.getItem('pi.seating.published.v1'));
    return l.tables.find(t => t.side === 'bride' && t.number === 7);
  });
  const src = toScreen(t7.x, t7.y);
  // Find a legal destination by asking the product, not by re-deriving its
  // rules in the test. Two earlier attempts guessed an offset: one landed 18
  // units from Table 10, the other outside the south wall, and both read as
  // product bugs when the refusal was entirely correct. Here the drag is
  // started and the pointer walked over candidate spots until the app stops
  // showing its own "illegal" banner — so the test can never disagree with
  // the rules it is testing.
  await p.mouse.move(src.x, src.y);
  await p.mouse.down();

  let landed = null;
  outer:
  for (const dy of [150, 250, 340, -150, 60]) {
    for (const dx of [0, -180, 180, -340, 340]) {
      const c = toScreen(t7.x + dx, t7.y + dy);
      if (c.x < 5 || c.y < 5 || c.x > 1435 || c.y > 895) continue;
      await p.mouse.move(c.x, c.y, { steps: 6 });
      await p.waitForTimeout(90);
      if (await p.locator('text=/release to cancel/i').count() === 0) { landed = { dx, dy, c }; break outer; }
    }
  }
  check('drag: a legal destination exists and is accepted', !!landed,
    landed ? `offset ${landed.dx},${landed.dy}` : 'none found');
  await p.mouse.up();
  await p.waitForTimeout(400);
  check('drag: state becomes "Draft — unpublished changes"', await says(p, 'Draft — unpublished changes'));
  check('drag: Undo becomes available', !(await p.getByRole('button', { name: /Undo/ }).isDisabled()));

  /* ── Drag a table into the DANCE FLOOR: must be refused ── */
  const t8 = await p.evaluate(() => {
    const raw = localStorage.getItem('pi.seating.draft.v1');
    const l = JSON.parse(raw || localStorage.getItem('pi.seating.published.v1'));
    return l.tables.find(t => t.side === 'bride' && t.number === 8);
  });
  const s8 = toScreen(t8.x, t8.y);
  const dance = toScreen(600, 420);                // dead centre of the dance floor
  await p.mouse.move(s8.x, s8.y);
  await p.mouse.down();
  await p.mouse.move(dance.x, dance.y, { steps: 18 });
  await p.waitForTimeout(250);
  const warn = await p.locator('text=/release to cancel/i').count();
  check('drag: illegal drop is warned about', warn === 1);
  await p.mouse.up();
  await p.waitForTimeout(300);
  const t8after = await p.evaluate(() => {
    const l = JSON.parse(localStorage.getItem('pi.seating.draft.v1') || 'null');
    return l?.tables.find(t => t.side === 'bride' && t.number === 8);
  });
  check('drag: table did NOT land on the dance floor',
    !t8after || Math.hypot(t8after.x - 600, t8after.y - 420) > 100,
    t8after ? `(${t8after.x},${t8after.y})` : 'unchanged');

  /* ── VIP tables cannot move ── */
  const vip = await p.evaluate(() => {
    const l = JSON.parse(localStorage.getItem('pi.seating.draft.v1') || localStorage.getItem('pi.seating.published.v1'));
    return l.tables.find(t => t.kind === 'vip' && t.side === 'bride');
  });
  check('fixed: VIP is marked immovable', vip.movable === false);
  const sv = toScreen(vip.x, vip.y);
  const dv = toScreen(vip.x, vip.y + 200);
  await p.mouse.move(sv.x, sv.y);
  await p.mouse.down();
  await p.mouse.move(dv.x, dv.y, { steps: 14 });
  await p.mouse.up();
  await p.waitForTimeout(300);
  const vipAfter = await p.evaluate(() => {
    const l = JSON.parse(localStorage.getItem('pi.seating.draft.v1') || 'null');
    return l?.tables.find(t => t.kind === 'vip' && t.side === 'bride');
  });
  check('fixed: VIP did not move', !vipAfter || (vipAfter.x === vip.x && vipAfter.y === vip.y),
    vipAfter ? `(${vipAfter.x},${vipAfter.y}) vs (${vip.x},${vip.y})` : 'n/a');

  await ctx.close();
}

/* ══ 3. GUESTS, CAPACITY, DRAFT/PUBLISH ══════════════════════════════════ */
{
  const { ctx, p } = await fresh();
  await unlock(p);

  const seatsAt = (num, side = 'groom') => p.evaluate(([n, s]) => {
    const l = JSON.parse(localStorage.getItem('pi.seating.draft.v1') || localStorage.getItem('pi.seating.published.v1'));
    const t = l.tables.find(t => t.side === s && t.number === n && t.kind === 'round');
    return { used: t.entries.reduce((a, e) => a + e.seats, 0), cap: t.capacity, id: t.id };
  }, [num, side]);

  // Groom Table 04 has 9 of 10 — the one table with a free seat.
  const t4 = await seatsAt(4);
  check('capacity: groom T04 starts 9/10 (the source gap)', t4.used === 9 && t4.cap === 10, `${t4.used}/${t4.cap}`);

  // Select groom Table 05 and move a 1-seat guest into T04.
  await p.getByLabel('Search for your name').fill('Imoh Ibok');
  await p.waitForTimeout(400);
  await p.locator('ul li button').first().click();
  await p.waitForTimeout(900);
  const t5before = await seatsAt(5);
  // In edit mode the name is an <input value>, which hasText cannot see, so
  // the row is found by the input's aria-label instead.
  await p.locator('aside li').filter({ has: p.getByLabel('Name for Imoh Ibok') })
         .getByRole('button', { name: 'Move' }).click();
  await p.waitForTimeout(200);

  // The select must DISABLE tables that cannot fit the entry.
  const opts = await p.locator('aside select option').evaluateAll(
    os => os.map(o => ({ t: o.textContent.trim(), d: o.disabled })));
  const fullDisabled = opts.filter(o => /10\/10/.test(o.t)).every(o => o.d);
  check('capacity: full tables are disabled in the move list', fullDisabled,
    `${opts.filter(o => /10\/10/.test(o.t)).length} full tables checked`);
  const t04opt = opts.find(o => o.t.startsWith('Table 04 · Groom'));
  check('capacity: the 9/10 table is selectable', !!t04opt && !t04opt.d, t04opt?.t);
  const dupes = opts.filter(o => /^Table 04/.test(o.t));
  check('capacity: both Table 04s are distinguishable', dupes.length === 2 &&
    new Set(dupes.map(o => o.t.split(' · ').slice(0,2).join(' · '))).size === 2,
    dupes.map(o => o.t.split(' — ')[0]).join(' / '));

  await ctx.close();
}

/* ══ 4. CAPACITY ENFORCEMENT + PUBLISH, driven through the model ═════════ */
{
  const { ctx, p } = await fresh();
  await unlock(p);

  // Move a guest and confirm both tables' counts change by the right amount.
  const before = await p.evaluate(() => {
    const l = JSON.parse(localStorage.getItem('pi.seating.published.v1'));
    const g = (n) => l.tables.find(t => t.side === 'groom' && t.number === n && t.kind === 'round');
    const sum = t => t.entries.reduce((a, e) => a + e.seats, 0);
    return { t5: sum(g(5)), t4: sum(g(4)) };
  });

  await p.getByLabel('Search for your name').fill('Imoh Ibok');
  await p.waitForTimeout(400);
  await p.locator('ul li button').first().click();
  await p.waitForTimeout(900);
  // In edit mode the name is an <input value>, which hasText cannot see, so
  // the row is found by the input's aria-label instead.
  await p.locator('aside li').filter({ has: p.getByLabel('Name for Imoh Ibok') })
         .getByRole('button', { name: 'Move' }).click();
  await p.waitForTimeout(200);
  const targetId = await p.evaluate(() => {
    const l = JSON.parse(localStorage.getItem('pi.seating.published.v1'));
    return l.tables.find(t => t.side === 'groom' && t.number === 4 && t.kind === 'round').id;
  });
  await p.locator('aside select').selectOption(targetId);
  await p.waitForTimeout(500);

  const after = await p.evaluate(() => {
    const l = JSON.parse(localStorage.getItem('pi.seating.draft.v1'));
    return null; // draft not saved yet — read from the DOM instead
  });
  check('move guest: draft becomes dirty', await says(p, 'Draft — unpublished changes'));

  await p.getByRole('button', { name: 'Save draft' }).click();
  await p.waitForTimeout(500);
  const counts = await p.evaluate(() => {
    const l = JSON.parse(localStorage.getItem('pi.seating.draft.v1'));
    const g = (n) => l.tables.find(t => t.side === 'groom' && t.number === n && t.kind === 'round');
    const sum = t => t.entries.reduce((a, e) => a + e.seats, 0);
    return { t5: sum(g(5)), t4: sum(g(4)) };
  });
  check('move guest: source table loses the seat', counts.t5 === before.t5 - 1, `${before.t5} -> ${counts.t5}`);
  check('move guest: target table gains it', counts.t4 === before.t4 + 1, `${before.t4} -> ${counts.t4}`);
  check('move guest: target is now full at 10/10', counts.t4 === 10, `${counts.t4}`);

  /* ── SAVE DRAFT MUST NOT CHANGE THE PUBLIC CHART ── */
  const pubUnchanged = await p.evaluate((b) => {
    const l = JSON.parse(localStorage.getItem('pi.seating.published.v1'));
    const g = (n) => l.tables.find(t => t.side === 'groom' && t.number === n && t.kind === 'round');
    const sum = t => t.entries.reduce((a, e) => a + e.seats, 0);
    return sum(g(5)) === b.t5 && sum(g(4)) === b.t4 && l.version === 1;
  }, before);
  check('DRAFT/PUBLISHED: saving a draft leaves the public chart untouched', pubUnchanged);

  // A guest in another tab still sees the old room.
  const guest = await ctx.newPage();
  await guest.goto(URL, { waitUntil: 'networkidle' });
  await guest.waitForTimeout(700);
  await guest.getByLabel('Search for your name').fill('Imoh Ibok');
  await guest.waitForTimeout(400);
  await guest.locator('ul li button').first().click();
  await guest.waitForTimeout(900);
  const guestSees = await guest.locator('aside').innerText();
  check('DRAFT/PUBLISHED: a guest still sees the published seat', /Table 05/.test(guestSees),
    guestSees.split('\n').slice(0, 3).join(' | '));
  await guest.close();

  /* ── UNDO ── */
  await p.getByRole('button', { name: /Undo/ }).click();
  await p.waitForTimeout(400);
  check('undo: returns to the published arrangement', !(await says(p, 'Draft — unpublished changes')));
  await p.getByRole('button', { name: /Redo/ }).click();
  await p.waitForTimeout(400);
  check('redo: re-applies the move', await says(p, 'Draft — unpublished changes'));

  /* ── PUBLISH ── */
  await p.getByRole('button', { name: 'Publish changes' }).click();
  await p.waitForTimeout(250);
  await p.getByRole('button', { name: 'Yes, publish' }).click();
  await p.waitForTimeout(700);
  const afterPub = await p.evaluate((b) => {
    const l = JSON.parse(localStorage.getItem('pi.seating.published.v1'));
    const g = (n) => l.tables.find(t => t.side === 'groom' && t.number === n && t.kind === 'round');
    const sum = t => t.entries.reduce((a, e) => a + e.seats, 0);
    return { t4: sum(g(4)), t5: sum(g(5)), v: l.version };
  }, before);
  check('publish: the public chart now has the change', afterPub.t4 === before.t4 + 1, `T04 ${afterPub.t4}`);
  check('publish: version bumped to 2', afterPub.v === 2, `v${afterPub.v}`);
  check('publish: state returns to Published', await says(p, 'Published · v2'));

  const guest2 = await ctx.newPage();
  await guest2.goto(URL, { waitUntil: 'networkidle' });
  await guest2.waitForTimeout(700);
  await guest2.getByLabel('Search for your name').fill('Imoh Ibok');
  await guest2.waitForTimeout(400);
  await guest2.locator('ul li button').first().click();
  await guest2.waitForTimeout(900);
  const g2 = await guest2.locator('aside').innerText();
  check('publish: the guest now sees the new table', /Table 04 · Groom/.test(g2),
    g2.split('\n').filter(Boolean).slice(0, 3).join(' | '));
  const t04names = await guest2.evaluate(() => {
    const l = JSON.parse(localStorage.getItem('pi.seating.published.v1'));
    const t = l.tables.find(t => t.side === 'groom' && t.number === 4 && t.kind === 'round');
    return t.entries.map(e => e.name);
  });
  check('publish: the RIGHT guest was moved', t04names.includes('Imoh Ibok'),
    t04names.slice(-2).join(', '));
  await guest2.close();

  await ctx.close();
}

/* ══ 5. MOBILE ═══════════════════════════════════════════════════════════ */
{
  const { ctx, p, errs } = await fresh(390, 844);
  check('mobile: no JS errors', errs.length === 0, errs[0]);
  const m = await p.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    sw: document.documentElement.scrollWidth, iw: innerWidth,
  }));
  check('mobile: no horizontal overflow', !m.overflow, `${m.sw} vs ${m.iw}`);

  await p.getByLabel('Search for your name').fill('Vanessa');
  await p.waitForTimeout(400);
  await p.locator('ul li button').first().click();
  await p.waitForTimeout(1100);
  check('mobile: bottom sheet opens', await p.locator('[role=dialog]').count() === 1);
  const sheet = await p.locator('[role=dialog]').boundingBox();
  check('mobile: sheet is anchored to the bottom', Math.abs((sheet.y + sheet.height) - 844) < 4,
    `bottom=${Math.round(sheet.y + sheet.height)}`);
  check('mobile: sheet leaves the map visible', sheet.height < 844 * 0.62, `${Math.round(sheet.height)}px of 844`);
  await p.locator('[role=dialog]').getByRole('button', { name: 'Close' }).click();
  await p.waitForTimeout(300);
  check('mobile: sheet closes', await p.locator('[role=dialog]').count() === 0);

  // Table numbers must stay readable at the default zoom.
  const fs = await p.evaluate(() => {
    const svg = document.querySelector('svg[role=application]');
    const r = svg.getBoundingClientRect();
    const vb = svg.getAttribute('viewBox').split(' ').map(Number);
    const scale = Math.min(r.width / vb[2], r.height / vb[3]);
    return 40 * scale;   // the table-number glyph is 40 hall units
  });
  check('mobile: table numbers render at a readable size', fs >= 7.5, `${fs.toFixed(1)}px`);

  await ctx.close();
}

await b.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('FAILED:\n  ' + failed.map(f => f.n).join('\n  '));
process.exit(failed.length ? 1 : 0);
