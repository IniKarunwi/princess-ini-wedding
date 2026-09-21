"""
Turn the extracted seating PDF text into a structured TypeScript source file.

Generated rather than hand-typed: 219 entries copied by hand is 219 chances to
misspell a guest's name, and nobody would ever catch it.

Seat accounting is the subtle part. An entry is NOT a person — the document is
full of combined rows like "Pastor Wale Adeniyi + Mrs Remi Adeniyi - 2 seats".
The brief says to preserve those as supplied, so one entry carries a `seats`
count and capacity is measured in seats, never in rows.
"""
import re, json, sys

lines = [l.rstrip() for l in open('extract.txt', encoding='utf-8')]

SIDE_RE   = re.compile(r'^(Princess|Ini)\s*-\s*(Bride|Groom)\s*tables')
VIP_RE    = re.compile(r'^VIP table\s*\(\s*(\d+)\s*/\s*(\d+)\s*\)')
TABLE_RE  = re.compile(r'^Table\s*0?(\d+)\b(.*)$')
BULLET_RE = re.compile(r'^●\s*(.*)$')
CAP_RE    = re.compile(r'\(\s*(\d+)\s*/\s*(\d+)\s*\)')

# "- 2 seats", "(2 seats)", "- 4  seats"
SEATS_RE  = re.compile(r'[-(–]\s*(\d+)\s+seats?\s*\)?\s*$', re.I)

def seats_for(name: str):
    """
    How many seats does this entry occupy, and what is the clean display name?

    Returns (seats, displayName, explicit) where `explicit` records whether the
    document stated the number outright. Anything not explicit is reported as
    an inference, never silently applied.
    """
    m = SEATS_RE.search(name)
    if m:
        return int(m.group(1)), SEATS_RE.sub('', name).strip(' -–(').strip(), True
    # No stated count. A row joining people with "+" or "and" is more than one
    # person, but we do NOT guess here — the caller reconciles against the
    # table's declared capacity and anything still unresolved is flagged.
    return 1, name.strip(), False

def joins(name: str) -> int:
    """People implied by the connectors in a row, for reconciliation only."""
    n = re.sub(r'\+\s*\d+\s*$', '', name)          # "OCC Worship + 3" handled separately
    parts = re.split(r'\s+\+\s+|\s+and\s+', n)
    return len([p for p in parts if p.strip()])

sides, cur_side, cur_table = [], None, None
notes = []

for raw in lines:
    line = raw.strip()
    if not line or line.startswith('==='):
        continue

    m = SIDE_RE.match(line)
    if m:
        cur_side = {'key': 'bride' if m.group(2) == 'Bride' else 'groom',
                    'label': m.group(0).strip(), 'header': line, 'tables': []}
        sides.append(cur_side); cur_table = None
        continue

    if cur_side is None:
        continue

    m = VIP_RE.match(line)
    if m:
        cur_table = {'kind': 'vip', 'number': 0, 'title': 'VIP Table',
                     'capacity': int(m.group(2)), 'group': '', 'entries': []}
        cur_side['tables'].append(cur_table); continue

    m = TABLE_RE.match(line)
    if m:
        rest = m.group(2)
        cap = CAP_RE.search(rest)
        title = re.sub(r'[-–]\s*$', '', CAP_RE.sub('', rest).strip(' -–')).strip()
        cur_table = {'kind': 'round', 'number': int(m.group(1)),
                     'title': title, 'capacity': int(cap.group(2)) if cap else 10,
                     'group': '', 'entries': []}
        cur_side['tables'].append(cur_table); continue

    m = BULLET_RE.match(line)
    if m and cur_table is not None:
        name = m.group(1).strip()
        if not name:
            notes.append(f"{cur_side['key']} table {cur_table['number']}: blank bullet row in source, dropped")
            continue
        seats, disp, explicit = seats_for(name)
        cur_table['entries'].append({'name': disp, 'seats': seats,
                                     'explicit': explicit, 'raw': name})
        continue

    # A group caption sits between the table heading and its first bullet.
    if cur_table is not None and not cur_table['entries'] and not cur_table['group']:
        if not line.startswith(('Ini and Princess', 'Working chart')) and not line.isdigit():
            cur_table['group'] = line

# ── Reconcile each table against its declared capacity ──────────────────────
flags = []
for side in sides:
    for t in side['tables']:
        stated = t['capacity']
        total  = sum(e['seats'] for e in t['entries'])
        label  = f"{side['key']} {'VIP' if t['kind']=='vip' else 'Table %02d' % t['number']}"

        if total < stated:
            # Look for unmarked multi-person rows that would close the gap.
            cands = [e for e in t['entries'] if not e['explicit'] and joins(e['name']) > 1]
            gap = stated - total
            implied = sum(joins(e['name']) - 1 for e in cands)
            if cands and implied == gap:
                for e in cands:
                    e['seats'] = joins(e['name'])
                    e['inferred'] = True
                flags.append(f"{label}: inferred {gap} extra seat(s) from unmarked "
                             f"multi-person row(s) {[e['name'] for e in cands]} — "
                             f"arithmetic closes exactly to {stated}")
            else:
                flags.append(f"{label}: seats total {total} but heading declares "
                             f"{stated} — left as-is, NOT redistributed")
        elif total > stated:
            flags.append(f"{label}: seats total {total} EXCEEDS declared {stated} "
                         f"— left as-is, NOT redistributed")

# A row can name two people, occupy one seat, and still leave its table
# balanced — so the reconciliation above never sees it. Those are the entries
# most likely to be wrong, and the ones a human has to rule on.
for side in sides:
    for t in side['tables']:
        label = f"{side['key']} {'VIP' if t['kind']=='vip' else 'Table %02d' % t['number']}"
        for e in t['entries']:
            if e['seats'] == 1 and joins(e['name']) > 1 and not e.get('inferred'):
                e['ambiguous'] = True
                flags.append(f"{label}: \"{e['name']}\" names {joins(e['name'])} people "
                             f"but the table already balances at 1 seat — NOT split, "
                             f"needs a human ruling")

json.dump({'sides': sides, 'flags': flags, 'notes': notes},
          open('seating.json', 'w'), indent=1, ensure_ascii=False)

for side in sides:
    tot = sum(sum(e['seats'] for e in t['entries']) for t in side['tables'])
    ent = sum(len(t['entries']) for t in side['tables'])
    print(f"{side['key']:6} tables={len(side['tables']):2} entries={ent:3} seats={tot:3}")
print()
for n in notes: print('NOTE  ', n)
for f in flags: print('FLAG  ', f)
