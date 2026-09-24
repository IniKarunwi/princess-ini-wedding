/**
 * /wedding/camera — "The Wedding Through Your Eyes".
 *
 * ── A disposable camera, not an upload portal ──────────────────────────────
 * This is a no-phone wedding, so the whole screen is designed to be finished
 * with. There is no gallery, no feed, no other guest's photographs, nothing
 * to like, nothing to share, and the completion screen offers one more photo
 * or the way back to the party — nothing else.
 *
 * ── The capture is the phone's own camera ──────────────────────────────────
 * A hidden <input type="file" accept="image/*" capture="environment"> behind
 * our own button. Tapping the shutter opens the OS camera; the guest never
 * sees file-picker chrome, and every screen around it is ours.
 *
 * This replaces a getUserMedia viewfinder that was built, worked, and was the
 * wrong choice for this wedding. getUserMedia is unavailable or blocked
 * inside the in-app browsers guests arrive in from WhatsApp, and a refused
 * camera permission is unrecoverable from a table. The trade is real and
 * worth naming: on some devices the OS sheet also offers the photo library,
 * so a guest could send an older picture. A guest sending a photograph from
 * July is a small problem. A guest who cannot send anything is the failure
 * that matters.
 *
 * ── Shoot first, send once ─────────────────────────────────────────────────
 * Capture never touches the network. Photographs collect in a roll of up to
 * ten and Send is one deliberate act on the whole batch, because the moment
 * after the one you just took is often the better one and a two-second
 * upload should not be standing in front of it.
 *
 * Under the batch, each photograph is still signed, uploaded, retried and
 * committed entirely on its own — so a dropped connection costs that one
 * photograph and nothing else. Four of five arriving is four of five
 * arriving, and the fifth stays on the phone, retryable.
 */

import { useRef } from 'react';
import { C, F, GUTTER } from '@/lib/design';
import { Reveal } from '@/components/site/primitives';
import { BackToWedding } from './MenuPage';
import { useCameraRoll, MAX_ROLL, type RollPhoto } from '@/features/camera/useCameraRoll';
import { diagnosticLine } from '@/features/camera/photoService';

/**
 * Timings are shown on Preview and locally, never on the wedding day site.
 * Checked at render rather than at build, so an existing Preview deployment
 * shows them without being rebuilt.
 */
const SHOW_TIMINGS = typeof location !== 'undefined'
  && !/^(www\.)?princessandini\.com$/.test(location.hostname);

export default function ThroughYourEyes() {
  const cam = useCameraRoll();
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Clearing the value before opening matters: without it, choosing the same
   * file twice fires no change event, so a guest who retakes and happens to
   * produce an identical file would tap into silence.
   */
  const openCamera = () => {
    const el = inputRef.current;
    if (!el) return;
    el.value = '';
    el.click();
  };

  const dark = cam.stage === 'roll' || cam.stage === 'sending';

  return (
    <main style={{
      minHeight: '100svh',
      background: dark ? '#0d0d0d' : C.ivory,
      color: dark ? C.onDark : C.ink,
      display: 'flex', flexDirection: 'column',
      transition: 'background .4s ease',
    }}>
      {/* The camera itself. Never seen; opened by our own buttons. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void cam.accept(e.target.files?.[0])}
        style={{
          position: 'absolute', width: 1, height: 1,
          opacity: 0, pointerEvents: 'none',
        }}
        tabIndex={-1}
        aria-hidden
        data-testid="camera-input"
      />

      {cam.stage === 'intro' && <Intro cam={cam} onTake={openCamera} />}
      {(cam.stage === 'roll' || cam.stage === 'sending') && (
        <Roll cam={cam} onTake={openCamera} />
      )}
      {cam.stage === 'done' && <Result cam={cam} onTake={openCamera} />}
    </main>
  );
}

type Cam = ReturnType<typeof useCameraRoll>;

const pad = `clamp(2.5rem, 10vw, 5rem) ${GUTTER}`;

/* ── Before anything has been taken ───────────────────────────────────────── */

function Intro({ cam, onTake }: { cam: Cam; onTake: () => void }) {
  // Nothing blocks the shutter any more: preparation happens behind the roll.
  const busy = false;

  return (
    <div style={{ padding: pad, maxWidth: '32rem', margin: '0 auto', width: '100%' }}>
      <Reveal>
        <p style={{
          fontFamily: F.sans, fontSize: '0.62rem', fontWeight: 600,
          letterSpacing: '0.28em', textTransform: 'uppercase', color: C.gold, margin: 0,
          textAlign: 'center',
        }}>
          A little wedding surprise
        </p>
        <h1 style={{
          fontFamily: F.serif, fontWeight: 300, textAlign: 'center',
          fontSize: 'clamp(2.2rem, 10vw, 3.2rem)', color: C.green,
          margin: '0.8rem 0 0', lineHeight: 1.1,
        }}>
          The Wedding Through Your Eyes
        </h1>
        <p style={{
          fontFamily: F.serif, fontSize: 'clamp(1.05rem, 4.2vw, 1.2rem)',
          lineHeight: 1.8, color: C.muted, textAlign: 'center',
          margin: '1.6rem 0 0',
        }}>
          We’d love to see a few moments from where you’re sitting.
        </p>
        <p style={{
          fontFamily: F.serif, fontSize: 'clamp(1.05rem, 4.2vw, 1.2rem)',
          lineHeight: 1.8, color: C.muted, textAlign: 'center', margin: '0.9rem 0 0',
        }}>
          Take a few for Princess &amp; IniOluwa, send them together, then put
          your phone away and enjoy the celebration with us.
        </p>

        <p style={{
          fontFamily: F.sans, fontSize: '0.68rem', letterSpacing: '0.14em',
          textTransform: 'uppercase', color: C.faint, textAlign: 'center',
          margin: '1.8rem 0 0',
        }}>
          Just for the two of us
        </p>
      </Reveal>

      {cam.error && <Problem title={cam.error} detail={cam.detail} />}

      <Reveal delay={160}>
        <div style={{ textAlign: 'center', marginTop: 'clamp(2.5rem, 9vw, 3.5rem)' }}>
          {/* The shutter, kept from the viewfinder version — a ring, like a
              camera, rather than a labelled rectangle. */}
          <button
            type="button"
            onClick={onTake}
            disabled={busy}
            aria-label="Take a photo"
            data-testid="take-photo"
            style={{
              width: 84, height: 84, borderRadius: '50%',
              border: `2px solid ${C.green}`, background: 'transparent',
              cursor: busy ? 'default' : 'pointer',
              // inline-grid, not grid. `display: grid` makes the button a
              // BLOCK-level box, and text-align on the parent does not centre
              // a block-level box — so the shutter sat hard against the left
              // gutter at every width while its label stayed centred.
              // inline-grid keeps placeItems centring the inner disc and lets
              // the parent's text-align centre the button itself.
              display: 'inline-grid', placeItems: 'center', padding: 0,
              opacity: busy ? 0.45 : 1, transition: 'opacity .25s ease',
            }}
          >
            <span style={{
              width: 66, height: 66, borderRadius: '50%',
              background: C.green, display: 'block',
            }} />
          </button>

          <p style={{
            fontFamily: F.sans, fontSize: '0.7rem', fontWeight: 600,
            letterSpacing: '0.24em', textTransform: 'uppercase',
            color: C.green, margin: '1.4rem 0 0',
          }}>
            {busy ? 'One moment…' : 'Take a photo'}
          </p>
          <p style={{
            fontFamily: F.serif, fontStyle: 'italic', fontSize: '0.9rem',
            color: C.faint, margin: '0.9rem 0 0',
          }}>
            Your phone’s camera will open.
          </p>
        </div>
      </Reveal>

      <div style={{ textAlign: 'center', marginTop: 'clamp(2.5rem, 9vw, 3.5rem)' }}>
        <BackToWedding />
      </div>
    </div>
  );
}
/* ── The roll: everything taken, not yet sent ─────────────────────────────── */

function Roll({ cam, onTake }: { cam: Cam; onTake: () => void }) {
  const sending = cam.stage === 'sending';
  // Count the whole roll, not just what is ready: a photograph mid-preparation
  // is one the guest has taken, and a button reading "Send 0 photos" for the
  // 140ms it takes to downscale is a lie about their own roll.
  const count = cam.photos.length;
  // …but it cannot be SENT until it has been prepared.
  const waiting = cam.photos.some((p) => p.status === 'preparing');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0d0d0d' }}>
      <div style={{ padding: `1.4rem ${GUTTER} 0`, textAlign: 'center' }}>
        <p style={{
          fontFamily: F.sans, fontSize: '0.64rem', fontWeight: 600,
          letterSpacing: '0.24em', textTransform: 'uppercase',
          color: 'rgba(239,230,207,0.62)', margin: 0,
        }} data-testid="roll-count">
          {sending && cam.progress
            ? `${cam.progress.done} of ${cam.progress.total} sent`
            : `${cam.photos.length} ${cam.photos.length === 1 ? 'photo' : 'photos'} · up to ${MAX_ROLL}`}
        </p>
      </div>

      {/* The grid. Three across on a phone, which fits ten in view without
          scrolling on anything modern. */}
      <div
        data-testid="roll-grid"
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem',
          padding: `1rem ${GUTTER}`,
        }}
      >
        {cam.photos.map((p) => (
          <Thumb key={p.id} photo={p} onRemove={() => cam.remove(p.id)} locked={sending} />
        ))}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ padding: `0 ${GUTTER} clamp(1.5rem, 6vw, 2.5rem)` }}>
        {cam.error && (
          <p data-testid="send-error" style={{
            fontFamily: F.sans, fontSize: '0.72rem', color: '#e4b9a6',
            textAlign: 'center', margin: '0 0 0.4rem',
          }}>
            {cam.error}
          </p>
        )}
        {cam.error && cam.detail && (
          <p style={{
            fontFamily: F.sans, fontSize: '0.68rem', color: 'rgba(228,185,166,0.75)',
            textAlign: 'center', margin: '0 0 1rem', lineHeight: 1.6,
          }}>
            {cam.detail}
          </p>
        )}
        {!cam.persistent && (
          <p style={{
            fontFamily: F.sans, fontSize: '0.64rem', color: 'rgba(239,230,207,0.4)',
            textAlign: 'center', margin: '0 0 1rem', lineHeight: 1.6,
          }}>
            Your phone won’t let us keep these safely — send them before you
            leave this page.
          </p>
        )}

        <Timings lines={cam.timings} />

        <div style={{
          display: 'flex', gap: '0.8rem', justifyContent: 'center',
          alignItems: 'center', flexWrap: 'wrap',
        }}>
          {/* The shutter stays right here, and stays live: the whole point is
              that the next photograph costs one tap and no waiting. */}
          <button
            type="button"
            onClick={onTake}
            disabled={sending || cam.full}
            aria-label="Take another photo"
            data-testid="take-photo"
            style={{
              width: 64, height: 64, borderRadius: '50%',
              border: '2px solid rgba(239,230,207,0.7)', background: 'transparent',
              display: 'inline-grid', placeItems: 'center', padding: 0,
              cursor: sending || cam.full ? 'default' : 'pointer',
              opacity: sending || cam.full ? 0.35 : 1, transition: 'opacity .25s ease',
            }}
          >
            <span style={{
              width: 50, height: 50, borderRadius: '50%',
              background: C.onDark, display: 'block',
            }} />
          </button>

          <button
            type="button"
            onClick={() => void cam.send()}
            disabled={sending || waiting || !count}
            data-testid="send-photos"
            style={{ ...goldBtn, opacity: sending || waiting || !count ? 0.5 : 1 }}
          >
            {sending
              ? 'Sending…'
              : `Send ${count} ${count === 1 ? 'photo' : 'photos'}`}
          </button>
        </div>

        <p style={{
          fontFamily: F.serif, fontStyle: 'italic', fontSize: '0.84rem',
          color: 'rgba(239,230,207,0.45)', textAlign: 'center', margin: '1.1rem 0 0',
        }}>
          {cam.full
            ? 'That’s ten — send these and you can take more.'
            : sending
              ? 'Keeping your photos until each one is safely away.'
              : 'Take as many as you like, then send them together.'}
        </p>
      </div>
    </div>
  );
}

/** One photograph in the grid, with its state legible at a glance. */
function Thumb({ photo, onRemove, locked }: {
  photo: RollPhoto; onRemove: () => void; locked: boolean;
}) {
  const dim = photo.status === 'preparing' ? 0.45
            : photo.status === 'sending' ? 0.6 : 1;

  return (
    <div
      data-testid={`thumb-${photo.status}`}
      style={{
        position: 'relative', aspectRatio: '1 / 1', overflow: 'hidden',
        background: '#1a1a1a',
        outline: photo.status === 'failed' ? '2px solid #c4664a' : 'none',
        outlineOffset: -2,
      }}
    >
      <img
        src={photo.previewUrl}
        alt=""
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          opacity: dim, transition: 'opacity .3s ease',
        }}
      />

      {photo.status === 'sending' && (
        <span style={badge}>Sending…</span>
      )}
      {photo.status === 'failed' && (
        <span style={{ ...badge, background: 'rgba(196,102,74,0.92)' }}>Didn’t send</span>
      )}

      {/* Removal is the guest's own decision, and the only thing besides a
          confirmed upload that forgets a photograph. Closed while sending. */}
      {!locked && photo.status !== 'sent' && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove this photo"
          data-testid="remove-photo"
          style={{
            position: 'absolute', top: 4, right: 4, width: 26, height: 26,
            borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'rgba(13,13,13,0.66)', color: C.onDark,
            fontSize: '0.8rem', lineHeight: 1, display: 'grid', placeItems: 'center',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

const badge: React.CSSProperties = {
  position: 'absolute', left: 0, right: 0, bottom: 0,
  fontFamily: F.sans, fontSize: '0.56rem', fontWeight: 600,
  letterSpacing: '0.12em', textTransform: 'uppercase',
  color: C.onDark, background: 'rgba(13,13,13,0.72)',
  padding: '0.3rem', textAlign: 'center',
};

/* ── After a batch ────────────────────────────────────────────────────────── */

function Result({ cam, onTake }: { cam: Cam; onTake: () => void }) {
  const left = cam.photos.length;
  const failed = cam.photos.filter((p) => p.status === 'failed');
  const all = cam.sentCount > 0 && left === 0;

  return (
    <div style={{ ...centred, padding: pad }}>
      <Reveal>
        <p style={{ fontSize: '2rem', margin: 0 }} aria-hidden>{all ? '🤍' : '📷'}</p>
        <h1
          data-testid="success"
          style={{
            fontFamily: F.serif, fontWeight: 300,
            fontSize: 'clamp(2.2rem, 10vw, 3rem)', color: C.green,
            margin: '1rem 0 0', lineHeight: 1.1,
          }}
        >
          {all ? 'Thank you' : 'Almost'}
        </h1>

        <p style={{
          fontFamily: F.serif, fontSize: 'clamp(1.05rem, 4.2vw, 1.2rem)',
          lineHeight: 1.8, color: C.muted, margin: '1.2rem 0 0', maxWidth: '24rem',
        }}>
          {all
            ? 'Thank you for capturing a piece of our day.'
            : `${cam.sentCount} of ${cam.sentCount + failed.length} went through. The rest are still here — nothing has been lost.`}
        </p>

        <p
          data-testid="sent-count"
          style={{
            fontFamily: F.sans, fontSize: '0.64rem', letterSpacing: '0.2em',
            textTransform: 'uppercase', color: C.faint, margin: '1.6rem 0 0',
          }}
        >
          {cam.sentCount} {cam.sentCount === 1 ? 'photo' : 'photos'} sent · just for the two of us
        </p>

        {failed.length > 0 && failed[0].error && (
          <p data-testid="send-error" style={{
            fontFamily: F.sans, fontSize: '0.74rem', color: '#8c3d22',
            margin: '1rem 0 0', lineHeight: 1.6, maxWidth: '24rem',
          }}>
            {failed[0].error}
          </p>
        )}
        {failed.length > 0 && failed[0].diagnostic && (
          <p style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '0.62rem', color: 'rgba(0,0,0,0.3)', margin: '0.8rem 0 0',
          }} data-testid="send-diagnostic">
            {diagnosticLine(failed[0].diagnostic)}
          </p>
        )}

        <Timings lines={cam.timings} dark={false} />

        <div style={{
          display: 'grid', gap: '1.4rem', justifyItems: 'center',
          marginTop: 'clamp(2.5rem, 9vw, 3.5rem)',
        }}>
          {failed.length > 0 && (
            <button
              type="button"
              onClick={() => void cam.send()}
              data-testid="retry-failed"
              style={primaryBtn}
            >
              Retry {failed.length} {failed.length === 1 ? 'photo' : 'photos'}
            </button>
          )}
          <button
            type="button"
            onClick={() => { cam.takeMore(); onTake(); }}
            data-testid="take-another"
            style={failed.length ? goldOnLight : primaryBtn}
          >
            Take More
          </button>
          <BackToWedding />
        </div>
      </Reveal>
    </div>
  );
}

/** prepare/sign/upload timings. Preview and local only — never in production. */
function Timings({ lines, dark = true }: { lines: string[]; dark?: boolean }) {
  if (!SHOW_TIMINGS || !lines.length) return null;
  return (
    <div data-testid="timings" style={{ margin: '1rem 0 0', textAlign: 'center' }}>
      {lines.slice(-4).map((l, i) => (
        <p key={i} style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '0.6rem', margin: 0, lineHeight: 1.7,
          color: dark ? 'rgba(239,230,207,0.35)' : 'rgba(0,0,0,0.3)',
        }}>
          {l}
        </p>
      ))}
    </div>
  );
}

function Problem({ title, detail }: { title: string; detail: string | null }) {
  return (
    <div
      data-testid="prepare-error"
      style={{
        background: '#f8e8e1', border: '1px solid #e6c5b6',
        padding: '0.9rem 1rem', margin: '1.8rem 0 0',
      }}
    >
      <p style={{ fontFamily: F.sans, fontSize: '0.76rem', color: '#8c3d22', margin: 0, fontWeight: 600 }}>
        {title}
      </p>
      {detail && (
        <p style={{ fontFamily: F.sans, fontSize: '0.7rem', color: '#8c3d22', margin: '0.4rem 0 0', lineHeight: 1.6 }}>
          {detail}
        </p>
      )}
    </div>
  );
}

/* ── Shared control styles ────────────────────────────────────────────────── */

const centred: React.CSSProperties = {
  flex: 1, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', textAlign: 'center',
};

const primaryBtn: React.CSSProperties = {
  fontFamily: F.sans, fontSize: '0.7rem', fontWeight: 600,
  letterSpacing: '0.24em', textTransform: 'uppercase',
  color: C.onDark, background: C.green, border: `1px solid ${C.green}`,
  padding: '1.1rem 2rem', cursor: 'pointer',
};

const goldBtn: React.CSSProperties = {
  fontFamily: F.sans, fontSize: '0.7rem', fontWeight: 600,
  letterSpacing: '0.2em', textTransform: 'uppercase',
  color: C.green, background: C.goldSoft, border: `1px solid ${C.goldSoft}`,
  padding: '1rem 1.6rem', cursor: 'pointer',
};

const goldOnLight: React.CSSProperties = {
  fontFamily: F.sans, fontSize: '0.7rem', fontWeight: 600,
  letterSpacing: '0.2em', textTransform: 'uppercase',
  color: C.green, background: C.goldSoft, border: `1px solid ${C.goldSoft}`,
  padding: '1.1rem 2rem', cursor: 'pointer',
};

const darkGhostBtn: React.CSSProperties = {
  fontFamily: F.sans, fontSize: '0.7rem', fontWeight: 600,
  letterSpacing: '0.2em', textTransform: 'uppercase',
  color: C.onDark, background: 'transparent',
  border: '1px solid rgba(239,230,207,0.5)',
  padding: '1rem 1.6rem', cursor: 'pointer',
};
