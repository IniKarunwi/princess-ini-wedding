# Email artwork

The confirmation pack references these four files by **exact name**. Drop the
invitation-suite exports here and they ship with the next deploy, served from
the same domain as the RSVP link.

| File | Used as |
|---|---|
| `joining.png` | Hero for guests invited to the Joining Ceremony |
| `reception.png` | Hero for Reception guests |
| `after-party.png` | Hero for After Party guests |
| `dress-guide.png` | Full-width, in every pack |

## Why they live here and not in the email

Email clients do not render `data:` image URIs — Gmail strips them outright —
so artwork has to be fetched from a public https URL. Serving it from the
site's own domain means no separate hosting, and the images keep working for
as long as the site does.

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
npm run email:preview      # writes previews to scratch/, opens nothing
npm run email:pack         # dry run against the real guest list
```

If a hero is missing the pack still renders — the section is simply absent
rather than showing a broken image. That is deliberate, but it means a missing
file is silent, so confirm all four load in a browser before the first send:

```
https://<your-site>/email/joining.png
https://<your-site>/email/reception.png
https://<your-site>/email/after-party.png
https://<your-site>/email/dress-guide.png
```

To host them elsewhere instead — a CDN, or Supabase storage — set
`INVITE_ASSET_BASE_URL` and the template follows it.
