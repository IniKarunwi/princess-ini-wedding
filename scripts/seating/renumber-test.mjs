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
        hasUnpublishedChanges, moveEntry, renameEntry,
        removeEntry, addEntry } = await import(`file://${outfile}`);

// The source notes live beside the data and are checked against it below.
const sourceOut = join(dirname(outfile), 'source.mjs');
await build({
  entryPoints: [join(ROOT, 'src/features/seating/data/seatingSource.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile: sourceOut, logLevel: 'warning',
});
const { SOURCE_FLAGS } = await import(`file://${sourceOut}`);

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

console.log('\nThe dataset itself');
{
  /**
   * Entry ids are how a person is addressed: moveEntry() finds them by id,
   * and the public lookup resolves a guest's choice by id. Two rows sharing
   * one would silently act on the wrong person, and nothing else in the app
   * would notice. This has already happened once, from an over-broad
   * find-and-replace, so it is checked rather than assumed.
   */
  const ids = base.tables.flatMap((t) => t.entries.map((e) => e.id));
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  ck('every guest entry has a unique id', dupes.length === 0, `duplicated: ${[...new Set(dupes)].join(', ')}`);

  const tableIds = base.tables.map((t) => t.id);
  ck('every table has a unique id', new Set(tableIds).size === tableIds.length);
  ck('every entry id belongs to its own table',
    base.tables.every((t) => t.entries.every((e) => e.id.startsWith(t.id + '-'))));

  // The source notes are rendered in the planner bar, and AdminPanel is
  // imported unconditionally — so anything quoted there ships to every
  // visitor. They must cite row ids, never names.
  const flagged = SOURCE_FLAGS.join(' ');
  const leaked = base.tables.flatMap((t) => t.entries.map((e) => e.name))
    .filter((n) => n.length > 5 && flagged.includes(n));
  ck('the source notes quote no guest names', leaked.length === 0, leaked[0]);

  // And the ids they DO cite must resolve, or the note sends a planner to a
  // row that does not exist.
  const cited = [...flagged.matchAll(/\b((?:bride|groom)-\d{2}-\d{2})\b/g)].map((m) => m[1]);
  const unknown = cited.filter((id) => !ids.includes(id));
  ck('and every row id they cite exists', unknown.length === 0, unknown.join(', '));
}

console.log('\nAdding a guest');
{
  const table = base.tables.find((t) => t.kind === 'round' && t.entries.length > 1);
  const seatsAt = (l, id) => get(l, id).entries.reduce((n, e) => n + e.seats, 0);

  // Free one seat first, so there is somewhere to add.
  const freed = removeEntry(base, table.entries[0].id);
  ck('a seat can be freed', freed.ok === true);
  const nine = freed.layout;
  eq('the table is now one short', seatsAt(nine, table.id), table.capacity - table.entries[0].seats);

  const added = addEntry(nine, table.id, 'Newly Invited Guest');
  ck('a guest can be added to a table with room', added.ok === true);
  const after = get(added.layout, table.id);
  eq('the table is back to capacity', seatsAt(added.layout, table.id), table.capacity);
  eq('one more row', after.entries.length, get(nine, table.id).entries.length + 1);

  const fresh = after.entries.at(-1);
  eq('the new guest has the name given', fresh.name, 'Newly Invited Guest');
  eq('and takes one seat by default', fresh.seats, 1);
  ck('with an id that is unique in the whole room', added.layout.tables
    .flatMap((t) => t.entries).filter((e) => e.id === fresh.id).length === 1);
  ck('and belongs to the table it was added to', fresh.id.startsWith(`${table.id}-`));
  ck('the original layout is not mutated',
    get(nine, table.id).entries.length === after.entries.length - 1);

  ck('adding counts as an unpublished change',
    hasUnpublishedChanges({ ...added.layout, status: 'draft' },
                          { ...nine, status: 'published' }) === true);

  // ── Capacity, counted in seats ─────────────────────────────────
  const full = addEntry(added.layout, table.id, 'One Too Many');
  ck('a full table refuses another guest', full.ok === false);
  ck('and says it is full', /full/i.test(full.reason), full.reason);

  const pair = addEntry(nine, table.id, 'A Couple', 2);
  ck('a two-seat guest will not fit in one free seat', pair.ok === false);
  ck('and the reason counts seats, not rows',
    /seat/i.test(pair.reason) && /needs 2/.test(pair.reason), pair.reason);

  // Two seats free, two-seat guest: fits exactly.
  const twoFree = removeEntry(nine, get(nine, table.id).entries[0].id);
  const couple = addEntry(twoFree.layout, table.id, 'A Couple', 2);
  ck('...but fits when two seats are free', couple.ok === true);
  eq('and fills the table exactly', seatsAt(couple.layout, table.id), table.capacity);

  // ── Names ──────────────────────────────────────────────────────
  for (const bad of ['', '   ', '\t\n ']) {
    const r = addEntry(nine, table.id, bad);
    ck(`a name of ${JSON.stringify(bad)} is refused`, r.ok === false);
  }
  const padded = addEntry(nine, table.id, '  Spaced   Out  ');
  ck('a padded name is accepted', padded.ok === true);
  eq('and tidied', get(padded.layout, table.id).entries.at(-1).name, 'Spaced Out');

  const nowhere = addEntry(nine, 'no-such-table', 'Somebody');
  ck('an unknown table is refused', nowhere.ok === false);

  // ── The new entry behaves like any other ───────────────────────
  const renamed = renameEntry(added.layout, fresh.id, 'Renamed After Adding');
  ck('the new guest can be renamed', renamed !== added.layout);
  eq('and the rename lands',
     get(renamed, table.id).entries.find((e) => e.id === fresh.id).name,
     'Renamed After Adding');

  const removedAgain = removeEntry(added.layout, fresh.id);
  ck('and removed again', removedAgain.ok === true);
  eq('freeing the seat', seatsAt(removedAgain.layout, table.id), table.capacity - 1);

  // Add, remove, add: the second id must not reuse the first.
  const again = addEntry(removedAgain.layout, table.id, 'Someone Else');
  ck('a later addition gets a different id',
     get(again.layout, table.id).entries.at(-1).id !== fresh.id);
}

console.log('\nRemoving a guest, and refusing to remove one by accident');
{
  const table = base.tables.find((t) => t.kind === 'round' && t.entries.length > 1);
  const victim = table.entries[0];
  const seatsBefore = table.entries.reduce((n, e) => n + e.seats, 0);

  const res = removeEntry(base, victim.id);
  ck('a guest can be removed', res.ok === true);
  const after = get(res.layout, table.id);
  eq('the entry is gone', after.entries.some((e) => e.id === victim.id), false);
  eq('one fewer entry', after.entries.length, table.entries.length - 1);
  eq('and the seats they held are freed',
     after.entries.reduce((n, e) => n + e.seats, 0), seatsBefore - victim.seats);
  eq('capacity is untouched', after.capacity, table.capacity);
  ck('the original layout is not mutated',
     get(base, table.id).entries.some((e) => e.id === victim.id));
  ck('nobody else at the table was disturbed',
     after.entries.map((e) => e.id).join(',')
       === table.entries.slice(1).map((e) => e.id).join(','));
  ck('and no other table changed',
     JSON.stringify(res.layout.tables.filter((t) => t.id !== table.id))
       === JSON.stringify(base.tables.filter((t) => t.id !== table.id)));

  ck('removing it counts as an unpublished change',
     hasUnpublishedChanges({ ...res.layout, status: 'draft' },
                           { ...base, status: 'published' }) === true);

  const gone = removeEntry(res.layout, victim.id);
  ck('removing the same guest twice is refused, not silent', gone.ok === false);

  // ── The accident this replaces ──────────────────────────────────
  const blank = renameEntry(base, victim.id, '');
  ck('an emptied name changes nothing at all', blank === base);
  const spaces = renameEntry(base, victim.id, '   ');
  ck('and neither does whitespace', spaces === base);
  ck('so a blank rename is not an unpublished change',
     hasUnpublishedChanges({ ...blank, status: 'draft' },
                           { ...base, status: 'published' }) === false);
  eq('the name is still there', get(blank, table.id).entries[0].name, victim.name);
  eq('and nobody was removed', get(blank, table.id).entries.length, table.entries.length);

  const same = renameEntry(base, victim.id, victim.name);
  ck('renaming to the identical name is also a no-op', same === base);
  const padded = renameEntry(base, victim.id, `  ${victim.name}  `);
  ck('...including when only the padding differs', padded === base);

  const real = renameEntry(base, victim.id, 'A Genuinely New Name');
  ck('a real rename still works', real !== base);
  eq('and lands', get(real, table.id).entries[0].name, 'A Genuinely New Name');
  eq('without touching seats',
     get(real, table.id).entries.reduce((n, e) => n + e.seats, 0), seatsBefore);
}

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
