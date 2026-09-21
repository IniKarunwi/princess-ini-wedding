/**
 * Where the song lives.
 *
 * ── The recording is NOT in this repository ────────────────────────────────
 * "Unchained Melody" (Zaret / North, 1955) as recorded by The Righteous
 * Brothers is a commercial recording under copyright. It is not committed
 * here and must not be. The player below is written to find nothing, say
 * nothing, and render nothing until a licensed file is dropped in at the
 * path named by SONG.src — see public/audio/README.md.
 *
 * Nothing about this design depends on WHICH file appears there. Supply a
 * licensed copy and the feature turns itself on; supply nothing and the site
 * is silent with no broken control and no console noise.
 */

export const SONG = {
  /** Public path the player fetches. Nothing is shipped at this path today. */
  src: '/audio/unchained-melody.m4a',

  /** Shown to guests. Displayed only once a real file is present. */
  title: 'Unchained Melody',
  artist: 'The Righteous Brothers',

  /** The invitation, when the browser refuses to start on its own. */
  invitation: 'Play our song',

  /**
   * Opening volume, and the level it settles at.
   *
   * Music that arrives at full volume on a phone in a quiet room is
   * startling, and the guest's first act is to close the tab. It comes up
   * from silence over FADE_MS instead, and never goes above VOLUME — this is
   * a background, not a performance.
   */
  volume: 0.42,
  fadeMs: 2600,
} as const;

/**
 * Remembers that a guest turned the music off.
 *
 * Someone who pauses the song has told us something, and starting it again
 * on the next page load would be rude. Storage can throw outright in a
 * private window, so every access is guarded and a failure simply means the
 * preference is not remembered — never that the player breaks.
 */
const KEY = 'pi.music.muted';

export function readMuted(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function writeMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(KEY, muted ? '1' : '0');
  } catch {
    /* Private mode, or storage disabled. The session still works. */
  }
}

/**
 * Is there actually a licensed audio file at `src`?
 *
 * This is deliberately stricter than "did the request succeed". The site is
 * a single-page app: an unknown path falls through to index.html, so a
 * missing audio file answers 200 with a body of HTML. Checking the status
 * alone would report the song as present and hand the guest a control that
 * plays nothing.
 *
 * So the content type has to look like audio, and a server that declines
 * HEAD (405) is retried with a ranged GET that asks for a single byte.
 */
export async function probeSong(src: string, signal?: AbortSignal): Promise<boolean> {
  const looksLikeAudio = (res: Response) =>
    res.ok && (res.headers.get('content-type') ?? '').toLowerCase().startsWith('audio/');

  try {
    const head = await fetch(src, { method: 'HEAD', signal });
    if (head.status !== 405) return looksLikeAudio(head);

    const ranged = await fetch(src, { method: 'GET', headers: { Range: 'bytes=0-0' }, signal });
    return looksLikeAudio(ranged);
  } catch {
    // Offline, aborted, or blocked. Treat as absent: silence is the safe
    // failure for a feature nobody asked to be surprised by.
    return false;
  }
}
