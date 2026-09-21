/**
 * /wedding/camera — "The Wedding Through Your Eyes".
 *
 * ── A disposable camera, not an upload portal ──────────────────────────────
 * This is a no-phone wedding, so the whole screen is designed to be finished
 * with. There is no gallery, no feed, no other guest's photographs, nothing
 * to like, nothing to share, and the completion screen sends the guest back
 * to the party rather than offering one more thing to tap.
 *
 * ── Camera capture, not the photo library ──────────────────────────────────
 * getUserMedia with a live <video> and a canvas grab, so what arrives is what
 * they are looking at right now — not something from July. There is
 * deliberately NO <input type="file"> fallback: on iOS that opens the photo
 * library alongside the camera, which quietly turns this into the general
 * upload form the brief rules out. When the camera genuinely cannot open,
 * the guest is told plainly and let go.
 *
 * ── What is not finished ───────────────────────────────────────────────────
 * Submission needs supabase/migrations/0008_guest_photos.sql, which is NOT
 * applied. Until it is, sending fails with a visible message and nothing is
 * stored. See photoService.ts.
 */

import { Link } from 'react-router-dom';
import { C, F, GUTTER } from '@/lib/design';
import { Reveal } from '@/components/site/primitives';
import { BackToWedding } from './MenuPage';
import { useCameraSession, MAX_PHOTOS } from '@/features/camera/useCameraSession';

export default function ThroughYourEyes() {
  const cam = useCameraSession();

  return (
    <main style={{
      minHeight: '100svh',
      background: cam.stage === 'live' || cam.stage === 'review' ? '#0d0d0d' : C.ivory,
      color: cam.stage === 'live' || cam.stage === 'review' ? C.onDark : C.ink,
      display: 'flex', flexDirection: 'column',
      transition: 'background .4s ease',
    }}>
      {cam.stage === 'intro' && <Intro cam={cam} />}
      {(cam.stage === 'live' || cam.stage === 'review') && <Shooting cam={cam} />}
      {cam.stage === 'sending' && <Sending cam={cam} />}
      {cam.stage === 'done' && <Done sent={cam.sent} />}
      {(cam.stage === 'denied' || cam.stage === 'unavailable') && <Blocked cam={cam} />}
    </main>
  );
}

type Cam = ReturnType<typeof useCameraSession>;

const pad = `clamp(2.5rem, 10vw, 5rem) ${GUTTER}`;

/* ── Before anything is asked for ─────────────────────────────────────────── */

function Intro({ cam }: { cam: Cam }) {
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
          Take a handful of photos for Princess &amp; IniOluwa, then put your
          phone away and enjoy the celebration with us.
        </p>

        <p style={{
          fontFamily: F.sans, fontSize: '0.68rem', letterSpacing: '0.14em',
          textTransform: 'uppercase', color: C.faint, textAlign: 'center',
          margin: '1.8rem 0 0',
        }}>
          Up to {MAX_PHOTOS} photos · just for the two of us
        </p>
      </Reveal>

      {cam.error && <Problem title={cam.error} detail={cam.detail} />}

      <Reveal delay={160}>
        <div style={{ textAlign: 'center', marginTop: 'clamp(2.5rem, 9vw, 3.5rem)' }}>
          <button type="button" onClick={() => void cam.open()} style={primaryBtn}>
            Open Camera
          </button>
          <p style={{
            fontFamily: F.serif, fontStyle: 'italic', fontSize: '0.9rem',
            color: C.faint, margin: '1.1rem 0 0',
          }}>
            Your phone will ask for permission first.
          </p>
        </div>
      </Reveal>

      <div style={{ textAlign: 'center', marginTop: 'clamp(2.5rem, 9vw, 3.5rem)' }}>
        <BackToWedding />
      </div>
    </div>
  );
}

/* ── Live view and the keep/retake decision ───────────────────────────────── */

function Shooting({ cam }: { cam: Cam }) {
  const reviewing = cam.stage === 'review';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Counter. Quiet, but always there — the limit should never be a
          surprise when it arrives. */}
      <div style={{
        padding: '0.9rem 1rem', textAlign: 'center',
        fontFamily: F.sans, fontSize: '0.66rem', letterSpacing: '0.24em',
        textTransform: 'uppercase', color: C.goldSoft,
      }}>
        {cam.photos.length} of {MAX_PHOTOS} moments captured
      </div>

      <div style={{
        flex: 1, position: 'relative', minHeight: 0,
        display: 'grid', placeItems: 'center', overflow: 'hidden',
      }}>
        <video
          ref={cam.videoRef}
          playsInline
          muted
          autoPlay
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            display: reviewing ? 'none' : 'block',
          }}
        />
        {reviewing && cam.pending && (
          <img
            src={cam.pending.previewUrl}
            alt="The photo you just took"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        )}
      </div>

      <div style={{ padding: '1.2rem 1rem clamp(1.5rem, 6vw, 2.5rem)', background: '#0d0d0d' }}>
        {cam.error && (
          <p style={{
            fontFamily: F.sans, fontSize: '0.72rem', color: '#e4b9a6',
            textAlign: 'center', margin: '0 0 1rem',
          }}>
            {cam.error}
          </p>
        )}

        {reviewing ? (
          <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center' }}>
            <button type="button" onClick={cam.retake} style={darkGhostBtn}>Retake</button>
            <button type="button" onClick={cam.keep} style={goldBtn}>Keep Photo</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem', justifyItems: 'center' }}>
            {!cam.atLimit ? (
              // The shutter. A ring, like a camera, not a labelled button.
              <button
                type="button"
                onClick={() => void cam.capture()}
                aria-label="Take a photo"
                style={{
                  width: 76, height: 76, borderRadius: '50%',
                  border: `2px solid ${C.onDark}`, background: 'transparent',
                  cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0,
                }}
              >
                <span style={{
                  width: 60, height: 60, borderRadius: '50%', background: C.onDark, display: 'block',
                }} />
              </button>
            ) : (
              <p style={{
                fontFamily: F.serif, fontStyle: 'italic', color: C.onDarkDim,
                textAlign: 'center', margin: 0, fontSize: '1rem',
              }}>
                That’s all {MAX_PHOTOS} — send them over and enjoy the party.
              </p>
            )}

            {cam.photos.length > 0 && (
              <button type="button" onClick={() => void cam.submit()} style={goldBtn}>
                Send to Princess &amp; IniOluwa
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Uploading ────────────────────────────────────────────────────────────── */

function Sending({ cam }: { cam: Cam }) {
  const p = cam.progress;
  return (
    <div style={{ ...centred, padding: pad }}>
      <p style={{
        fontFamily: F.serif, fontSize: 'clamp(1.4rem, 6vw, 1.9rem)',
        color: C.green, margin: 0,
      }}>
        Sending your photos…
      </p>
      {p && (
        <>
          <div style={{ width: 'min(16rem, 70vw)', height: 2, background: C.ivoryDeep, marginTop: '1.6rem' }}>
            <div style={{
              width: `${(p.done / Math.max(1, p.total)) * 100}%`, height: '100%',
              background: C.gold, transition: 'width .3s ease',
            }} />
          </div>
          <p style={{
            fontFamily: F.sans, fontSize: '0.66rem', letterSpacing: '0.2em',
            textTransform: 'uppercase', color: C.muted, marginTop: '0.9rem',
          }}>
            {p.done} of {p.total}
          </p>
        </>
      )}
    </div>
  );
}

/* ── Finished. Deliberately a dead end. ───────────────────────────────────── */

function Done({ sent }: { sent: number }) {
  return (
    <div style={{ ...centred, padding: pad }}>
      <Reveal>
        <p style={{ fontSize: '2rem', margin: 0 }} aria-hidden>🤍</p>
        <h1 style={{
          fontFamily: F.serif, fontWeight: 300,
          fontSize: 'clamp(2.2rem, 10vw, 3rem)', color: C.green,
          margin: '1rem 0 0', lineHeight: 1.1,
        }}>
          Thank you
        </h1>
        <p style={{
          fontFamily: F.serif, fontSize: 'clamp(1.05rem, 4.2vw, 1.2rem)',
          lineHeight: 1.8, color: C.muted, margin: '1.2rem 0 0', maxWidth: '24rem',
        }}>
          Now put your phone away and enjoy the party.
        </p>
        <p style={{
          fontFamily: F.sans, fontSize: '0.64rem', letterSpacing: '0.2em',
          textTransform: 'uppercase', color: C.faint, margin: '1.6rem 0 0',
        }}>
          {sent} {sent === 1 ? 'photo' : 'photos'} sent · just for the two of us
        </p>

        <div style={{ marginTop: 'clamp(2.5rem, 9vw, 3.5rem)' }}>
          <BackToWedding />
        </div>
      </Reveal>
    </div>
  );
}

/* ── Permission denied, or no camera ──────────────────────────────────────── */

function Blocked({ cam }: { cam: Cam }) {
  return (
    <div style={{ padding: pad, maxWidth: '30rem', margin: '0 auto', width: '100%', textAlign: 'center' }}>
      <h1 style={{
        fontFamily: F.serif, fontWeight: 300,
        fontSize: 'clamp(1.9rem, 8vw, 2.6rem)', color: C.green,
        margin: 0, lineHeight: 1.15,
      }}>
        {cam.error ?? 'The camera could not be opened.'}
      </h1>
      {cam.detail && (
        <p style={{
          fontFamily: F.serif, fontSize: '1.02rem', lineHeight: 1.8,
          color: C.muted, margin: '1.2rem 0 0',
        }}>
          {cam.detail}
        </p>
      )}

      {/* Never a dead end: try again, or simply leave. */}
      <div style={{ display: 'grid', gap: '1rem', justifyItems: 'center', marginTop: '2.2rem' }}>
        <button type="button" onClick={() => void cam.open()} style={primaryBtn}>Try Again</button>
        <p style={{
          fontFamily: F.serif, fontStyle: 'italic', color: C.faint,
          fontSize: '0.95rem', margin: 0, lineHeight: 1.7,
        }}>
          Or don’t worry about it — the photographers have the day covered.
        </p>
        <Link to="/wedding" style={{
          fontFamily: F.sans, fontSize: '0.64rem', fontWeight: 600,
          letterSpacing: '0.24em', textTransform: 'uppercase',
          color: C.green, textDecoration: 'none',
          borderBottom: `1px solid ${C.green}`, paddingBottom: '0.4rem', marginTop: '0.5rem',
        }}>
          ← Back to the Wedding
        </Link>
      </div>
    </div>
  );
}

function Problem({ title, detail }: { title: string; detail: string | null }) {
  return (
    <div style={{
      background: '#f8e8e1', border: '1px solid #e6c5b6',
      padding: '0.9rem 1rem', margin: '1.8rem 0 0',
    }}>
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
