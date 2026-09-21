#!/usr/bin/env python3
"""
Prepares the moodboard pages for print — npm run pdf:retouch

Always reads from assets/source/ and writes assets/, so it is idempotent:
running it twice gives the same result rather than compounding, and the
untouched originals stay available.

Two jobs.

── 1. Cut lettering ────────────────────────────────────────────────────────
Both moodboards were cropped out of a larger layout, and the crop clipped
through a line of type. The gentlemen page carries the tail of "40", a script
initial and "DETAILING, UNFORGETTABLE STYLE" across its top; the ladies page
carries a monogram and "DRESS CODE: REGAL ELEGANCE" across its bottom. Half a
letterform reads as damage, so those bands are painted out in the page cream
sampled from the image itself.

── 2. Skin coverage ────────────────────────────────────────────────────────
Some of the gowns show more skin than the couple want in a guest guide. Each
region is covered by cloning fabric that is already in the same photograph —
the requested "repeat the same pattern" — rather than by blurring or by a flat
patch, both of which read as censorship.

The method per region: take a source rectangle of real fabric, tile it, then
composite it through a feathered mask so the edges dissolve into the
surrounding garment. No brightness matching — see cover_region for why that
was tried and removed.

These print about 70pt wide, so the eye never resolves the detail; the aim is
that the silhouette reads as covered, not that it survives a crop to full
screen.

What this technique can and cannot do is the important part. It works when a
small area is ringed by matching texture: the olive gown's keyhole slit and
the purple mannequin's bare shoulder both close cleanly. It cannot invent a
garment. The black gown is off-shoulder over a sheer bodice with the model's
head directly above, and every attempt read as a smudge over her rather than
as fabric — so it is left alone and flagged rather than shipped damaged.
"""

import pathlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / "assets" / "source"
OUT = HERE / "assets"

# ── Cut lettering ───────────────────────────────────────────────────────────
# (file, band to clear, point to sample the page colour from)
#
# The sample is a POINT in the page margin rather than a row near the band.
# A row is fragile: on the ladies page every row close to the type is either
# inside a photo tile — which paints the band brown — or inside the type
# itself. (5, 500) is the left margin of both pages and is flat page cream.
LETTERING = [
    # Top of the gentlemen page. The body of the type ends at y=25, but the
    # descenders of the script initial reach to y=32, and stopping at 27 left
    # them behind as two dark ticks. The photo grid does not start until y=39.
    ("moodboard-gentlemen.png", (0, 0, 760, 34), (5, 500)),
    # Bottom of the ladies page: monogram and "DRESS CODE: REGAL ELEGANCE".
    # The photo tiles end at y=935 and the tallest ascenders of the type reach
    # up to y=945, so the band starts at 943: high enough to take the ascender
    # tips, which otherwise survive as a row of faint ticks, and low enough not
    # to clip the bottom off the gowns. The sample row must likewise sit in the
    # clean gap at 936..942 — sampling inside a tile picks up the photograph
    # and paints the band brown.
    ("moodboard-ladies.png", (0, 943, 760, 978), (5, 500)),
]


def clear_band(im, box, sample_at):
    """Paint a band with the page colour, sampled from a clean margin point."""
    a = np.asarray(im).astype(int)
    sx, sy = sample_at
    # Median of a small square, so one stray pixel cannot set the colour.
    patch = a[sy - 3:sy + 4, sx - 3:sx + 4].reshape(-1, 3)
    colour = tuple(int(v) for v in np.median(patch, axis=0))
    ImageDraw.Draw(im).rectangle(box, fill=colour)
    return colour


# ── Skin coverage ───────────────────────────────────────────────────────────
#
# region  : polygon over the skin, in source pixels
# source  : rectangle of fabric to clone from
# feather : blur radius on the mask edge, in pixels
#
# Coordinates were read off a gridded overlay of each tile, not estimated.
COVER = {
    "moodboard-ladies.png": [
        dict(
            name="olive keyhole",
            # A narrow diagonal slit through the beaded bodice.
            region=[(363, 497), (375, 497), (383, 547), (373, 554), (361, 522)],
            source=(384, 496, 406, 556),   # beading immediately right of the slit
            feather=1.6,
        ),
        dict(
            name="purple bare shoulder",
            # The mannequin's uncovered side. The right edge is held just
            # inside the mannequin's silhouette — running past it puts fabric
            # on the shop background and destroys the shape.
            region=[(151, 507), (168, 508), (174, 518), (175, 542),
                    (170, 562), (156, 569), (149, 546), (149, 522)],
            source=(96, 588, 142, 660),    # plain purple skirt below the belt
            feather=2.0,
        ),
        # ── The black gown is deliberately NOT retouched ────────────────
        #
        # It was attempted three times and abandoned. The gown is off-shoulder
        # over a sheer illusion bodice, so there is no fabric anywhere in the
        # photograph that can plausibly cover the shoulders, and the model's
        # head sits directly above the bare neck — every patch reads as a
        # smudge over her rather than as a garment. The thigh slit has the same
        # problem from the other end.
        #
        # Cloning works when a small area is ringed by matching texture, as
        # with the olive keyhole. It cannot invent a neckline. Covering this
        # one means a different photograph, which is the couple's call and not
        # something to do silently.
    ]
}


def assert_source_is_fabric(specs, spec, size):
    """
    Refuse to clone from anywhere that is itself skin.

    The first attempt sampled the black gown's bodice, which is sheer and shows
    skin through it. The tiling then reproduced that skin across the neckline —
    covering the gown in exactly what it was meant to remove.

    The test is exact rather than a colour heuristic. A colour test cannot do
    this job here: these gowns are beaded in gold and bronze, which is warm and
    mid-toned and indistinguishable from skin by RGB alone. An earlier version
    tried and rejected the olive gown's own sequins as 53% skin.

    But we already know precisely where the skin is — it is the set of regions
    being covered. So a source rectangle is valid exactly when it overlaps none
    of them.
    """
    W, H = size
    skin = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(skin)
    for other in specs:
        d.polygon(other["region"], fill=255)

    sx0, sy0, sx1, sy1 = spec["source"]
    overlap = np.asarray(skin)[sy0:sy1, sx0:sx1] > 0
    if overlap.any():
        raise SystemExit(
            f"{spec['name']}: source rectangle {spec['source']} overlaps a "
            f"region that is itself being covered ({overlap.mean():.0%} of it). "
            "Cloning it would spread skin rather than cover it. Move the "
            "source onto actual fabric.")


def mirror_tile(patch, w, h):
    """
    Tile `patch` to w x h, mirroring each repeat so joins do not show.

    Mirroring is a last resort: it makes a butterfly symmetry that the eye
    picks up. Source rectangles are chosen large enough that most regions need
    no repeat at all, and this then just crops.
    """
    ph, pw = patch.shape[:2]
    cols = -(-w // pw) + 1
    rows = -(-h // ph) + 1
    strips = []
    for r in range(rows):
        row = []
        for cidx in range(cols):
            p = patch
            if cidx % 2:
                p = p[:, ::-1]
            if r % 2:
                p = p[::-1, :]
            row.append(p)
        strips.append(np.concatenate(row, axis=1))
    return np.concatenate(strips, axis=0)[:h, :w]


def cover_region(im, spec, specs):
    """Clone fabric over one region, through a feathered mask."""
    a = np.asarray(im).astype(np.float64)
    H, W = a.shape[:2]

    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon(spec["region"], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(spec["feather"]))
    m = (np.asarray(mask).astype(np.float64) / 255.0)[:, :, None]

    assert_source_is_fabric(specs, spec, (W, H))

    sx0, sy0, sx1, sy1 = spec["source"]
    patch = a[sy0:sy1, sx0:sx1]
    if patch.size == 0:
        raise SystemExit(f"empty source rectangle for {spec['name']}")

    fill = mirror_tile(patch, W, H)

    # Deliberately NO brightness matching.
    #
    # An earlier version scaled the patch towards the mean of the pixels it was
    # replacing. That is backwards: the pixels being replaced are the skin, so
    # matching them brightened the black appliqué to skin tone and turned the
    # whole bodice into a brown smear. The source is drawn from the same
    # photograph under the same light, so it already belongs there.

    return Image.fromarray(np.clip(a * (1 - m) + fill * m, 0, 255).astype(np.uint8))


def main():
    if not SRC.exists():
        raise SystemExit(f"No pristine originals at {SRC}")

    print("\nMoodboard retouch")
    for f in ("moodboard-ladies.png", "moodboard-gentlemen.png"):
        im = Image.open(SRC / f).convert("RGB")
        print(f"\n  {f}  {im.width}x{im.height}")

        for name, box, at in LETTERING:
            if name != f:
                continue
            colour = clear_band(im, box, at)
            print(f"    cleared cut lettering  y={box[1]}..{box[3]}  fill=rgb{colour}")

        specs = COVER.get(f, [])
        for spec in specs:
            im = cover_region(im, spec, specs)
            print(f"    covered  {spec['name']}")

        im.save(OUT / f)
    print(f"\n  Written to {OUT}\n  Rebuild the guides: npm run pdf:guides\n")


main()
