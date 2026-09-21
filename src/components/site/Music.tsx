/**
 * The song.
 *
 * ── What this is not ───────────────────────────────────────────────────────
 * Not an <audio controls> element. No rounded bar, no scrubber, no timecode,
 * no volume slider, no play triangle in a filled circle. A browser's default
 * player is a piece of operating-system furniture and it would be the single
 * most out-of-place object on the page.
 *
 * What a guest gets instead is one mark in the corner, in the wedding's own
 * type: an engraved invitation to start it, and — once it is playing — three
 * hairlines that breathe, drawn in the same 1px gold rule used everywhere
 * else on the site. Tapping them stops the music.
 *
 * ── Autoplay ───────────────────────────────────────────────────────────────
 * Browsers block audible autoplay unless the guest has earned the origin
 * enough engagement. That is not an error case to work around, it is the
 * correct default, and this treats it as one of two normal outcomes: we ask
 * politely, and if we are refused we put the invitation on screen and wait.
 *
 * There is deliberately NO hidden gesture hook — no "start on first scroll",
 * no muted-then-unmute trick. Both of those exist to defeat the block, and
 * sound that starts because a guest scrolled is worse than no sound at all.
 *
 * ── Silence when there is no song ──────────────────────────────────────────
 * The recording is licensed and is not in this repository. Until a file
 * exists at SONG.src this component renders nothing whatsoever.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { C, F } from '@/lib/design';
import { SONG, probeSong, readMuted, writeMuted } from '@/lib/music';
import { usePrefersReducedMotion } from './primitives';

type State =
  /** Looking for the file. Renders nothing — no flash of a dead control. */
  | 'probing'
  /** No licensed audio present. Renders nothing, forever. */
  | 'absent'
  /** We have a song and it is not playing. Show the invitation. */
  | 'idle'
  /** Playing. Show the breathing rules. */
  | 'playing';

export default function Music() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<number | null>(null);
  const [state, setState] = useState<State>('probing');
  const reduced = usePrefersReducedMotion();

  /* ── Is there a song at all? ──────────────────────────────────────────── */

  useEffect(() => {
    const ac = new AbortController();
    let live = true;
    probeSong(SONG.src, ac.signal).then((present) => {
      if (live) setState(present ? 'idle' : 'absent');
    });
    return () => { live = false; ac.abort(); };
  }, []);

  /* ── Volume ───────────────────────────────────────────────────────────── */

  const clearFade = () => {
    if (fadeRef.current !== null) {
      window.clearInterval(fadeRef.current);
      fadeRef.current = null;
    }
  };

  /** Brings the track up from silence, so it arrives rather than starts. */
  const fadeIn = useCallback((el: HTMLAudioElement) => {
    clearFade();
    el.volume = 0;
    const step = 40;
    const ticks = Math.max(1, Math.round(SONG.fadeMs / step));
    let n = 0;
    fadeRef.current = window.setInterval(() => {
      n += 1;
      // Ease out: most of the rise happens early, then it settles.
      const p = Math.min(1, n / ticks);
      el.volume = Math.min(SONG.volume, SONG.volume * (1 - Math.pow(1 - p, 2)));
      if (p >= 1) clearFade();
    }, step);
  }, []);

  useEffect(() => clearFade, []);

  /* ── Starting and stopping ────────────────────────────────────────────── */

  const start = useCallback(async (): Promise<boolean> => {
    const el = audioRef.current;
    if (!el) return false;
    try {
      fadeIn(el);
      await el.play();
      setState('playing');
      writeMuted(false);
      return true;
    } catch {
      // NotAllowedError (no autoplay permission) or NotSupportedError (the
      // browser cannot decode this file). Either way the honest response is
      // the same: leave it to the guest.
      clearFade();
      setState('idle');
      return false;
    }
  }, [fadeIn]);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    clearFade();
    el.pause();
    setState('idle');
    writeMuted(true);
  }, []);

  /* ── The one autoplay attempt ─────────────────────────────────────────── */

  const tried = useRef(false);
  useEffect(() => {
    if (state !== 'idle' || tried.current) return;
    tried.current = true;
    // A guest who turned it off last time is not asked again.
    if (readMuted()) return;
    void start();
  }, [state, start]);

  if (state === 'probing' || state === 'absent') return null;

  const playing = state === 'playing';

  return (
    <>
      <audio
        ref={audioRef}
        src={SONG.src}
        loop
        // "none" on purpose. If autoplay is refused, a guest who never taps
        // play should not pay for several megabytes on mobile data. Calling
        // play() loads it at that point regardless.
        preload="none"
        // No `controls`: this element is never seen or heard from directly.
        onEnded={() => setState('idle')}
        onError={() => setState('absent')}
      />

      <button
        type="button"
        onClick={playing ? stop : () => void start()}
        aria-label={
          playing
            ? `Pause ${SONG.title} by ${SONG.artist}`
            : `${SONG.invitation} — ${SONG.title} by ${SONG.artist}`
        }
        title={`${SONG.title} · ${SONG.artist}`}
        style={{
          position: 'fixed',
          // Bottom-RIGHT, not bottom-left.
          //
          // Left sat it directly beneath the hero's own bottom-left stack —
          // "Our Wedding Day" and "ABUJA, NIGERIA" — and at 390px the two
          // touched, with no air between them. The right-hand corner is the
          // part of the hero deliberately left empty, and the menu ring is
          // diagonally opposite at the top, so the page's two controls never
          // crowd one another.
          right: 'clamp(1rem, 4vw, 2rem)',
          bottom: 'clamp(1rem, 4vw, 2rem)',
          zIndex: 55,
          // No fill, no border, no radius — the type and the rules ARE the
          // control. A pill here would undo the whole page.
          background: 'none', border: 0, padding: '0.7rem 0.4rem',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          // A tight shadow, not a soft one. This control floats over three
          // very different grounds — dark photography, deep green and pale
          // ivory — and a wide 6px blur that separated it nicely from a
          // photograph smeared into a grey halo on the ivory sections.
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
          transition: reduced ? 'none' : 'opacity .4s ease',
        }}
      >
        <Bars playing={playing} reduced={reduced} />
        {/* Something is always written next to the rules.
            Playing, three 14px hairlines on their own were too quiet to
            find — a guest who wants the music off should not have to hunt
            the corners of the page for a mark they can barely see. The
            title solves that and credits the song at the same time, which
            is worth having. Stopped, it is the invitation. */}
        <span style={{
          fontFamily: F.sans, fontSize: 'clamp(0.55rem, 2.1vw, 0.64rem)',
          fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase',
          // The deep gold, at full opacity — NOT goldSoft at 75%.
          //
          // goldSoft is beautiful on the dark sections and effectively
          // invisible on the ivory ones: measured over #f7f3e9 it came out
          // near 1.7:1, which is not a subtle control, it is a missing one.
          // This gold holds around 3:1 on ivory and better than 4:1 on the
          // green and the photographs, which is the compromise a single
          // colour floating over three grounds has to make.
          color: C.gold, whiteSpace: 'nowrap', lineHeight: 1,
        }}>
          {playing ? SONG.title : <>{SONG.invitation}{' '}
            <span style={{ fontFamily: F.serif, letterSpacing: 0, fontSize: '1.15em' }}>♪</span></>}
        </span>
      </button>

      {/* The animation is injected rather than written inline because
          keyframes cannot be expressed in a style object. Scoped to this
          one class name. */}
      <style>{KEYFRAMES}</style>
    </>
  );
}

/**
 * Three hairlines, the same 1px gold rule as everywhere else on the site.
 *
 * Playing, they breathe. Paused, they stand still at unequal heights — which
 * still reads as sound, and still reads as stopped.
 *
 * Reduced motion holds them still even while playing: someone who has asked
 * for no movement should not get a loop running forever in the corner of
 * their screen.
 */
function Bars({ playing, reduced }: { playing: boolean; reduced: boolean }) {
  const animate = playing && !reduced;
  return (
    <span aria-hidden style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 14 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={animate ? 'pi-bar' : undefined}
          style={{
            display: 'block', width: 1,
            background: C.gold,
            height: [9, 14, 6][i],
            opacity: playing ? 0.95 : 0.6,
            transformOrigin: 'bottom',
            animationDelay: `${[0, 0.28, 0.14][i]}s`,
          }}
        />
      ))}
    </span>
  );
}

const KEYFRAMES = `
@keyframes pi-bar-breathe {
  0%, 100% { transform: scaleY(0.35); }
  50%      { transform: scaleY(1); }
}
.pi-bar { animation: pi-bar-breathe 1.5s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .pi-bar { animation: none; }
}
`;
