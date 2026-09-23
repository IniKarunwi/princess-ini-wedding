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
 * ── One at a time ──────────────────────────────────────────────────────────
 * Each photograph is sent and committed on its own, so a dropped connection
 * costs one photograph rather than a whole sitting.
 */

import { useRef } from 'react';
import { C, F, GUTTER } from '@/lib/design';
import { Reveal } from '@/components/site/primitives';
import { BackToWedding } from './MenuPage';
import { useCameraSession } from '@/features/camera/useCameraSession';

export default function ThroughYourEyes() {
  const cam = useCameraSession();
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

  const dark = cam.stage === 'preview' || cam.stage === 'sending';

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

      {(cam.stage === 'intro' || cam.stage === 'working') && (
        <Intro cam={cam} onTake={openCamera} />
      )}
      {(cam.stage === 'preview' || cam.stage === 'sending') && (
        <Preview cam={cam} onRetake={() => { cam.retake(); openCamera(); }} />
      )}
      {cam.stage === 'done' && (
        <Done sent={cam.sent} onAnother={() => { cam.again(); openCamera(); }} />
      )}
    </main>
  );
}

type Cam = ReturnType<typeof useCameraSession>;

const pad = `clamp(2.5rem, 10vw, 5rem) ${GUTTER}`;

/* ── Before anything has been taken ───────────────────────────────────────── */

function Intro({ cam, onTake }: { cam: Cam; onTake: () => void }) {
  const busy = cam.stage === 'working';

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
          Take a photo for Princess &amp; IniOluwa, then put your phone away
          and enjoy the celebration with us.
        </p>

        <p style={{
          fontFamily: F.sans, fontSize: '0.68rem', letterSpacing: '0.14em',
          textTransform: 'uppercase', color: C.faint, textAlign: 'center',
          margin: '1.8rem 0 0',
        }}>
          {cam.sent > 0
            ? `${cam.sent} sent so far · just for the two of us`
            : 'Just for the two of us'}
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
              display: 'grid', placeItems: 'center', padding: 0,
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

/* ── The photograph, held for retake or send ──────────────────────────────── */

function Preview({ cam, onRetake }: { cam: Cam; onRetake: () => void }) {
  const sending = cam.stage === 'sending';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{
        padding: '0.9rem 1rem', textAlign: 'center',
        fontFamily: F.sans, fontSize: '0.66rem', letterSpacing: '0.24em',
        textTransform: 'uppercase', color: C.goldSoft,
      }}>
        {sending ? 'Sending…' : 'How does this look?'}
      </div>

      <div style={{
        flex: 1, position: 'relative', minHeight: 0,
        display: 'grid', placeItems: 'center', overflow: 'hidden',
      }}>
        {cam.photo && (
          <img
            src={cam.photo.previewUrl}
            alt="The photo you just took"
            data-testid="preview-image"
            style={{
              width: '100%', height: '100%', objectFit: 'contain',
              opacity: sending ? 0.45 : 1, transition: 'opacity .3s ease',
            }}
          />
        )}
        {sending && (
          <div style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            pointerEvents: 'none',
          }}>
            <p style={{
              fontFamily: F.serif, fontStyle: 'italic',
              fontSize: 'clamp(1.1rem, 5vw, 1.4rem)', color: C.onDark, margin: 0,
            }}>
              Sending your photo…
            </p>
          </div>
        )}
      </div>

      <div style={{ padding: '1.2rem 1rem clamp(1.5rem, 6vw, 2.5rem)', background: '#0d0d0d' }}>
        {cam.error && (
          <p
            data-testid="send-error"
            style={{
              fontFamily: F.sans, fontSize: '0.72rem', color: '#e4b9a6',
              textAlign: 'center', margin: '0 0 0.4rem',
            }}
          >
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

        <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={onRetake}
            disabled={sending}
            data-testid="retake"
            style={{ ...darkGhostBtn, opacity: sending ? 0.4 : 1 }}
          >
            Retake
          </button>
          <button
            type="button"
            onClick={() => void cam.send()}
            disabled={sending}
            data-testid="send-photo"
            style={{ ...goldBtn, opacity: sending ? 0.55 : 1 }}
          >
            {sending ? 'Sending…' : cam.failed ? 'Try Again' : 'Send Photo'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Sent ─────────────────────────────────────────────────────────────────── */

function Done({ sent, onAnother }: { sent: number; onAnother: () => void }) {
  return (
    <div style={{ ...centred, padding: pad }}>
      <Reveal>
        <p style={{ fontSize: '2rem', margin: 0 }} aria-hidden>🤍</p>
        <h1
          data-testid="success"
          style={{
            fontFamily: F.serif, fontWeight: 300,
            fontSize: 'clamp(2.2rem, 10vw, 3rem)', color: C.green,
            margin: '1rem 0 0', lineHeight: 1.1,
          }}
        >
          Thank you
        </h1>
        <p style={{
          fontFamily: F.serif, fontSize: 'clamp(1.05rem, 4.2vw, 1.2rem)',
          lineHeight: 1.8, color: C.muted, margin: '1.2rem 0 0', maxWidth: '24rem',
        }}>
          Thank you for capturing a piece of our day.
        </p>
        <p style={{
          fontFamily: F.sans, fontSize: '0.64rem', letterSpacing: '0.2em',
          textTransform: 'uppercase', color: C.faint, margin: '1.6rem 0 0',
        }}>
          {sent} {sent === 1 ? 'photo' : 'photos'} sent · just for the two of us
        </p>

        <div style={{
          display: 'grid', gap: '1.4rem', justifyItems: 'center',
          marginTop: 'clamp(2.5rem, 9vw, 3.5rem)',
        }}>
          <button type="button" onClick={onAnother} data-testid="take-another" style={primaryBtn}>
            Take Another
          </button>
          <BackToWedding />
        </div>
      </Reveal>
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

const darkGhostBtn: React.CSSProperties = {
  fontFamily: F.sans, fontSize: '0.7rem', fontWeight: 600,
  letterSpacing: '0.2em', textTransform: 'uppercase',
  color: C.onDark, background: 'transparent',
  border: '1px solid rgba(239,230,207,0.5)',
  padding: '1rem 1.6rem', cursor: 'pointer',
};
