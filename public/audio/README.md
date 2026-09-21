# Where to put the song

The site plays **“Unchained Melody” — The Righteous Brothers** as background
music on the homepage. **The recording is not in this repository and must not
be committed to it.**

It is a commercial recording under copyright (composition: Alex North and Hy
Zaret, 1955; this recording: The Righteous Brothers, 1965). Downloading a copy
from a streaming site, a YouTube ripper or a "free MP3" host would be an
unlicensed copy no matter where it is hosted afterwards. None was obtained.

---

## Put the file here

```
public/audio/unchained-melody.m4a
```

That exact path. It is the only thing the player looks for, and it is defined
once, in `src/lib/music.ts` → `SONG.src`. If you supply a different format,
change that one line to match the extension.

Nothing else needs editing. The player probes for the file at load: when it
is there the music feature turns itself on, and when it is not the site is
silent with no broken control and no console errors.

## Getting a licensed copy

Any of these gives you a file you are entitled to use:

1. **A copy you already own** — a purchased download (iTunes/Apple Music
   purchase, Amazon MP3, Google Play, 7digital, Bandcamp) or a CD you own,
   ripped. A personal purchase covers personal use; a wedding website that
   only invited guests can open is generally treated as personal use, though
   strictly it is a public performance and (2) is the clean answer.
2. **A licence for web use** — the sync/streaming licence is sold through the
   publisher. For this title the composition is controlled by Unchained Melody
   Publishing LLC, and the master recording rights for the Righteous Brothers
   version sit with the current rights-holder of the Philles/Verve catalogue.
   A music-licensing broker handles both sides in one transaction.
3. **A licensed cover or instrumental** — considerably cheaper, and a
   royalty-free instrumental arrangement of the melody is easy to licence
   for a few dollars from a stock-music library.

If you want my honest recommendation: for a private, unlisted, invite-only
wedding site, option 1 with a file you have actually bought is what almost
everyone does and is what I would do.

## Encoding it

Guests will be on Nigerian mobile data, so the file's size is a real cost.

- **Format:** AAC in an `.m4a` container. Plays natively everywhere that
  matters, including Safari on iOS, and is meaningfully smaller than MP3 at
  the same quality.
- **Bitrate:** 128 kbps mono or stereo. This is background music behind a
  page, not a listening session — 320 kbps buys nothing audible here and
  doubles the download.
- **Expected size:** roughly 3.5 MB for the full 3:36.

```sh
ffmpeg -i unchained-melody.wav -c:a aac -b:a 128k -movflags +faststart \
       public/audio/unchained-melody.m4a
```

`-movflags +faststart` moves the index to the front of the file so playback
can begin before the whole thing has arrived. Without it a guest on a slow
connection waits for the entire download before hearing anything.

## Keep it out of git

`public/audio/*` is gitignored, with this README excepted. Do not force-add
the audio file. Deploy it as a build/hosting asset — upload it to the host
alongside the built site, or add it in the deploy step — so the licensed
recording never enters the repository's history, where removing it later
means rewriting every commit after it.
