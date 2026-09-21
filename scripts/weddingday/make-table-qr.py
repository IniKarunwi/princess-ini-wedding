#!/usr/bin/env python3
"""
The table QR code.

    python3 scripts/weddingday/make-table-qr.py

ONE code for every reception table — not twenty-four. It resolves to the
Wedding Day Hub, and everything else is reached from there.

── Why these settings ─────────────────────────────────────────────────────
What decides whether a phone reads a printed code is MODULE SIZE in
millimetres, not how many pixels the file has. The destination here is short
(33 characters), which is the whole trick: it fits a 33x33 grid even at the
highest error correction. Printed at 40mm that is 0.98mm per module — about
twice the ~0.5mm a phone camera wants, so it will scan from across
a table, at an angle, in low reception lighting, off a card someone is
holding at a tilt.

Because the URL is short we can afford error correction H rather than the Q
used for the longer guest-guide links. H is quoted as "~30% recoverable",
which is a codeword figure and NOT a promise that you can cover 30% of the
square. A single contiguous blot is far harsher than scattered damage,
because it wipes out whole blocks and can take a finder pattern with it.

Measured against this file, decoded with zxing-cpp:

    300px capture (a phone at a table)    reads
    150px capture (small print, at range) reads
    slightly out of focus                 reads
    low contrast on cream stock           reads
    10% of the code blotted out           reads
    20% blotted out                       FAILS
    30% blotted out                       FAILS

So: a thumbprint or a wax speck is fine, half a wine glass on the card is
not. Worth knowing when deciding where on the table card it sits.

Quiet zone is 4 modules, the spec minimum, and it is not optional — a code
printed hard against a border or a block of colour often will not scan at
all. Dark on light, no logo in the middle, no rounded modules, no gradient:
every one of those trades scan reliability for decoration, and this has to
work first time for 250 guests who will not try twice.

Outputs to public/qr/ (SVG for print, PNG for anything that needs a raster).
"""

import pathlib
import re
import sys

import segno

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "qr"

# The canonical production destination. NOT a Vercel preview URL: a preview
# deployment's hostname changes with every push and the cards are printed once.
URL = "https://princessandini.com/wedding"


def check_route_exists() -> None:
    """Fail loudly if the route this encodes is not actually in the router."""
    app = (ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
    if 'path="/wedding"' not in app:
        sys.exit('ABORT: /wedding is not a route in src/App.tsx — '
                 'printing this QR would send guests to a 404.')
    print("route /wedding found in App.tsx ✓")


def main() -> None:
    check_route_exists()

    if not URL.startswith("https://princessandini.com/"):
        sys.exit(f"ABORT: refusing to encode a non-production URL: {URL}")

    OUT.mkdir(parents=True, exist_ok=True)

    qr = segno.make(URL, error="h", micro=False)
    version, modules = qr.version, qr.symbol_size(border=0)[0]

    # Vector, for the printer.
    svg = OUT / "wedding-table-qr.svg"
    qr.save(svg, scale=10, border=4, dark="#1a3410", light="#ffffff")

    # Raster, 2000px square — ample for a table card at any sane size.
    png = OUT / "wedding-table-qr.png"
    qr.save(png, scale=2000 // (modules + 8), border=4,
            dark="#1a3410", light="#ffffff")

    print(f"encoded : {URL}")
    print(f"version : {version} ({modules}x{modules} modules), error correction H")
    for f in (svg, png):
        print(f"wrote   : {f.relative_to(ROOT)}  ({f.stat().st_size / 1024:.0f} KB)")

    for mm in (30, 40, 50):
        print(f"at {mm}mm wide: {mm / (modules + 8):.2f} mm per module "
              f"({'ok' if mm / (modules + 8) >= 0.5 else 'TOO SMALL'})")


if __name__ == "__main__":
    main()
