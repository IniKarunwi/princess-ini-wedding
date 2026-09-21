/**
 * The renumbering rules, tested against the model directly.
 *
 * The browser test in ui-test.mjs proves a renumber reaches another device
 * and a guest. This proves the rules themselves, fast and without a server:
 * a number is a LABEL, an id is the TABLE, and relabelling must never move a
 * person, a table or a seat.
 *
 *   node scripts/seating/renumber-test.mjs
 */

import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outfile = join(mkdtempSync(join(tmpdir(), 'model-')), 'model.mjs');
await build({
  entryPoints: [join(ROOT, 'src/features/seating/model.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'warning',
});
const { buildInitialLayout, renumberTable, swapTableNumbers,
        hasUnpublishedChanges, moveEntry } = await import(`file://${outfile}`);

const results = [];
const ck = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? '✓' : '✗'} ${name}${!pass && detail !== undefined ? `  — ${detail}` : ''}`);
};
const eq = (name, got, want) => ck(name, got === want, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

const base = buildInitialLayout();
const get = (l, id) => l.tables.find((t) => t.id === id);
const rounds = (l, side) => l.tables.filter((t) => t.kind === 'round' && t.side === side);
const snapshot = (t) => JSON.stringify([t.x, t.y, t.capacity, t.entries.map((e) => [e.id, e.name, e.seats])]);

const bride = rounds(base, 'bride');
const groom = rounds(base, 'groom');
const spare = Math.max(...bride.map((t) => t.number)) + 5;

console.log('\nRenumbering');
{
  const before = snapshot(get(base, bride[0].id));
  const r = renumberTable(base, bride[0].id, spare);
  ck('a free number is accepted', r.ok === true);
  eq('the table shows it', get(r.layout, bride[0].id).number, spare);
  eq('the id is untouched', get(r.layout, bride[0].id).id, bride[0].id);
  eq('nothing about the table itself changed', snapshot(get(r.layout, bride[0].id)), before);
  eq('and no other table moved number',
    rounds(r.layout, 'bride').filter((t) => t.id !== bride[0].id)
      .map((t) => t.number).join(','),
    bride.filter((t) => t.id !== bride[0].id).map((t) => t.number).join(','));
  ck('the original layout is not mutated', get(base, bride[0].id).number === bride[0].number);
}

console.log('\nWhat is refused');
{
  const taken = renumberTable(base, bride[0].id, bride[1].number);
  ck('a number already used on that side is refused', taken.ok === false);
  ck('the reason names the number', /already exists on this side/i.test(taken.reason), taken.reason);
  eq('and points at the other table so a swap can be offered', taken.conflictId, bride[1].id);
  ck('which it says is possible', taken.canSwap === true);

  for (const bad of [0, -1, 100, 1.5, NaN]) {
    const r = renumberTable(base, bride[0].id, bad);
    ck(`${bad} is refused`, r.ok === false);
  }

  const vip = base.tables.find((t) => t.kind === 'vip');
  const v = renumberTable(base, vip.id, 4);
  ck('a VIP table cannot be numbered', v.ok === false);
  ck('and says why', /only the round tables/i.test(v.reason), v.reason);

  const none = renumberTable(base, 'no-such-table', 4);
  ck('an unknown table is refused', none.ok === false);

  const same = renumberTable(base, bride[0].id, bride[0].number);
  ck('renumbering to its own number is a no-op, not an error', same.ok === true);
  ck('and returns the layout unchanged', same.layout === base);
}

console.log('\nThe other side');
{
  // Both sides are numbered 01–11 in the source document, so every number is
  // already in use twice and none is free on the bride's side to begin with.
  // Free one first, then take it — that is the case that must produce a NOTE
  // and not a block, because a duplicate across sides is the room's existing
  // and intended state.
  const freed = bride[2].number;
  const cleared = renumberTable(base, bride[2].id, spare);
  ck('a number can be freed up first', cleared.ok === true);

  const r = renumberTable(cleared.layout, bride[0].id, freed);
  ck('the same number on the other side is allowed', r.ok === true);
  ck('with a note explaining it', typeof r.note === 'string' && /also has a table/i.test(r.note), r.note);
  eq('and the groom table with that number is untouched',
     get(r.layout, groom.find((t) => t.number === freed).id).number, freed);
}

console.log('\nSwapping');
{
  const [a, b] = bride;
  const beforeA = snapshot(get(base, a.id));
  const beforeB = snapshot(get(base, b.id));
  const r = swapTableNumbers(base, a.id, b.id);
  ck('a swap is accepted', r.ok === true);
  eq('the first takes the second number', get(r.layout, a.id).number, b.number);
  eq('the second takes the first', get(r.layout, b.id).number, a.number);
  eq('the first table did not move or lose anyone', snapshot(get(r.layout, a.id)), beforeA);
  eq('nor the second', snapshot(get(r.layout, b.id)), beforeB);

  const withVip = swapTableNumbers(base, a.id, base.tables.find((t) => t.kind === 'vip').id);
  ck('a VIP table cannot be swapped', withVip.ok === false);
}

console.log('\nPublishing notices a renumber');
{
  const published = { ...base, status: 'published' };
  const draft = renumberTable({ ...base, status: 'draft' }, bride[0].id, spare).layout;
  ck('a renumber-only edit counts as an unpublished change',
    hasUnpublishedChanges(draft, published) === true);
  ck('an untouched draft does not',
    hasUnpublishedChanges({ ...base, status: 'draft' }, published) === false);
}

console.log('\nMoving a guest is still a different thing entirely');
{
  const r = renumberTable(base, bride[0].id, spare);
  const seatedBefore = get(r.layout, bride[0].id).entries.length;
  const from = r.layout.tables.find((t) => t.kind === 'round' && t.entries.length);
  const entry = from.entries[0];
  const to = r.layout.tables.find(
    (t) => t.kind === 'round' && t.id !== from.id
      && t.capacity - t.entries.reduce((n, e) => n + e.seats, 0) >= entry.seats);

  const moved = moveEntry(r.layout, entry.id, to.id);
  ck('a guest can still be moved after a renumber', moved.ok === true);
  if (moved.ok) {
    eq('the destination keeps its number', get(moved.layout, to.id).number, get(r.layout, to.id).number);
    ck('and the renumbered table is still renumbered',
      get(moved.layout, bride[0].id).number === spare);
  }
  void seatedBefore;
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
