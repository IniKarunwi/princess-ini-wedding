#!/usr/bin/env python3
"""
Generates the QR codes printed in the guest guide.

    python3 scripts/pdf/make-qr.py

Two of them: the venue on Google Maps, and the gift registry. A printed guide
cannot be clicked, and a Google Maps search URL is ~90 characters of query
string that nobody will retype — so it is a QR or it is nothing.

Written in Python only because `qrcode` was already the shortest path to a
correct encoder; the output is a PNG that build.mjs inlines like any other
asset. Re-run it if MAP_URL or REGISTRY_URL in scripts/email/config.mjs change.

Error correction is Q (~25% recoverable) rather than H, and the maps link is
the short `maps.google.com/?q=` form rather than the long `/maps/search/?api=1`
one the email uses. Both choices are about MODULE SIZE, which is what actually
decides whether a phone can read a printed code: the long URL at H needs a
57x57 grid, which at the size it prints is 0.36mm per module — below the ~0.5mm
a phone camera wants. The short URL at Q is 41x41, or 0.62mm at 72pt. Same
destination, comfortably scannable.
"""

import re
import pathlib
import qrcode
from qrcode.constants import ERROR_CORRECT_Q

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONFIG = ROOT / "scripts" / "email" / "config.mjs"
OUT = ROOT / "scripts" / "pdf" / "assets"

# Read the URLs from config.mjs rather than restating them, so the printed
# code and the emailed link cannot drift apart.
src = CONFIG.read_text(encoding="utf-8")


def registry_url() -> str:
    m = re.search(r"REGISTRY_URL\s*=\s*'([^']+)'", src)
    if not m:
        raise SystemExit("REGISTRY_URL not found in config.mjs")
    return m.group(1)


def map_url() -> str:
    """MAP_URL is built by concatenation in config.mjs, so rebuild it here."""
    venue = re.search(r"venueName:\s*'([^']+)'", src)
    area = re.search(r"venueArea:\s*'([^']+)'", src)
    if not (venue and area):
        raise SystemExit("venueName/venueArea not found in config.mjs")
    from urllib.parse import quote

    query = quote(f"{venue.group(1)}, {area.group(1)}", safe="")
    return f"https://maps.google.com/?q={query}"


def write(name: str, data: str) -> None:
    q = qrcode.QRCode(error_correction=ERROR_CORRECT_Q, box_size=10, border=1)
    q.add_data(data)
    q.make(fit=True)
    img = q.make_image(fill_color="#1b4332", back_color="white")
    path = OUT / f"{name}.png"
    img.save(path)
    mm = (72 / 72 * 25.4) / q.modules_count   # printed at 72pt in the guide
    flag = "ok" if mm >= 0.5 else "MARGINAL — phones may not read this"
    print(f"  {name}.png  v{q.version} {q.modules_count}x{q.modules_count}  "
          f"{mm:.2f}mm/module {flag}")
    print(f"      {data}")


OUT.mkdir(parents=True, exist_ok=True)
print("\nQR codes")
write("qr-map", map_url())
write("qr-registry", registry_url())
print()
