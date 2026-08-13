# Email artwork

The confirmation pack references these four files by **exact name**. Drop the
invitation-suite exports here and they ship with the next deploy, served from
the same domain as the RSVP link.

| File | Used as |
|---|---|
| `joining.png` | Hero for guests invited to the Wedding Service |
| `reception.png` | Hero for Reception guests |
| `after-party.png` | Hero for After Party guests |
| `venue.png` | Watercolour of Signature by Wells Carlton, above the map button |
| `dress-guide.png` | Full-width, in every pack |
| `backdrop.png` | **Generated** — the page backdrop. Do not hand-edit. |

The venue illustration is the one the Banani design introduced. If it is
absent the venue card still renders — heading, address and Open Map button —
just without the picture.

## `backdrop.png` is generated, not exported

```bash
npm run email:backdrop
```

`scripts/email/generate-backdrop.mjs` draws it and writes both the PNG and the
SVG it came from. **Do not edit the PNG by hand** — the next run overwrites it.
The jitter is seeded, so re-running produces a byte-identical file.

Six icons — rings, bouquet, champagne, heart, envelope, floral sprig —
repeated as flourishes down the left and right edges. Fewer icons repeated
reads as stationery; more reads as clip art.

The dials are at the top of the script:

| | |
|---|---|
| `opacityOuter` / `opacityInner` | 8.5% at the edge, fading to 3% nearest the content |
| `channel` | 700px down the middle where nothing is drawn |
| `ink` | `#556B4E` olive |
| `width` × `height` | 1400 × 1000 CSS px, rendered at 2× |

The doodles are drawn **into** the beige rather than composited at runtime, so
the file is fully opaque and the CSS fallback colour matches it exactly. 13 KB.

If it fails to load, or the client blocks images, the email is exactly what it
was before the backdrop existed.

## Why they live here and not in the email

Email clients do not render `data:` image URIs — Gmail strips them outright —
so artwork has to be fetched from a public https URL. Serving it from the
site's own domain means no separate hosting, and the images keep working for
as long as the site does.

## Optimising after a re-export

**The filenames here and `ASSET_FILES` in `scripts/email/config.mjs` must
match exactly.** An email fetches images by URL, so a name the site does not
serve renders as nothing at all — silently.

```bash
npm run email:optimize            # report only
npm run email:optimize -- --write # convert to .jpg, replacing the sources
```

The five PNGs total **8.8 MB**, and a guest invited to the whole day loads
about **5.4 MB**. This resizes to 1200px and re-encodes as JPEG — **not**
PNG. These are watercolours: continuous tone, no
flat regions, no transparency, so PNG stores every brush-texture pixel
losslessly and comes out *larger* than the source. Re-saving them as PNG made
them bigger, up to 3.5 MB each.

The first export totalled 8.8 MB and went to 1.6 MB with no visible loss at
the size they are displayed. The dress guide is encoded a step higher than the
rest because it is the only one carrying text, and JPEG artefacts show first
on hard edges.

WebP would be smaller again, but Outlook does not support it.

## Before exporting

- **Width 1200px**, which renders at 600 CSS px on a normal screen and stays
  sharp on a retina one. Wider is wasted bytes.
- **Under ~400KB each.** Gmail clips a message over 102KB of *HTML*, which
  these do not count towards, but a 4MB email is slow on Nigerian mobile data
  and some clients refuse to fetch large images at all.
- **JPEG is fine** for the three photographic invitations if PNG is heavy —
  change the filename in `scripts/email/config.mjs → ASSET_FILES` to match.
- The dress guide is text-heavy, so keep that one **PNG** and do not
  over-compress it; it has to stay legible on a phone.

Every pack also carries the same information as plain text, so a guest whose
client blocks images still gets their schedule, venue and plus-one status.

## Checking

```bash
npm run email:assets       # are all the files here, right names, right size?
npm run email:preview      # writes previews to scratch/, opens nothing
npm run email:pack         # dry run against the real guest list
```

If an image is missing the pack still renders — the section is simply absent
rather than showing a broken image. That is deliberate, but it means a missing
file is silent, so confirm all five load in a browser before the first send:

```
https://<your-site>/email/joining.png
https://<your-site>/email/reception.png
https://<your-site>/email/after-party.png
https://<your-site>/email/venue.png
https://<your-site>/email/dress-guide.png
https://<your-site>/email/backdrop.png
```

To host them elsewhere instead — a CDN, or Supabase storage — set
`INVITE_ASSET_BASE_URL` and the template follows it.
