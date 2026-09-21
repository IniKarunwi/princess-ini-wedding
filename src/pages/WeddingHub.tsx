/**
 * /wedding — what the table QR opens.
 *
 * ── The one screen most guests will ever see ───────────────────────────────
 * Someone sits down, scans a card, and is holding this. It has to answer
 * "what's for dinner" in about two seconds and then get out of the way. So:
 * four actions, no hamburger, nothing to read first, food at the top.
 *
 * ── Not a link tree ────────────────────────────────────────────────────────
 * Four stacked rows in the wedding's own type, separated by hairlines, each
 * with a numeral and a quiet line of explanation. No cards, no icons in
 * circles, no shadows. The restraint is the point — this is stationery on a
 * table, not an app.
 *
 * ── No global nav here on purpose ──────────────────────────────────────────
 * The homepage's <Nav> overlay is deliberately absent. A guest who arrived by
 * QR wants four things; offering them the whole site invites a browse, and
 * this is a no-phone wedding.
 */

import { Link } from 'react-router-dom';
import { C, F, GUTTER } from '@/lib/design';
import { Reveal } from '@/components/site/primitives';
import { WEDDING } from '@/lib/wedding';
import { CAMERA_ENABLED } from '@/features/weddingday/phase';

interface Action {
  /** Omitted while a feature is not ready — the row renders inert. */
  to?: string;
  title: string;
  note: string;
  soon?: boolean;
}

const ACTIONS: Action[] = [
  // Food first: it is what a seated guest actually wants.
  { to: '/menu',   title: 'Food Menu', note: 'See what’s being served' },
  { to: '/drinks', title: 'Drinks',    note: 'Wine, cocktails & refreshments' },
  // Shown either way so the concept reads whole on the card, but inert until
  // photographs have somewhere to go. See features/weddingday/phase.ts.
  CAMERA_ENABLED
    ? { to: '/wedding/camera', title: 'The Wedding Through Your Eyes', note: 'Capture a few moments for us' }
    : { title: 'The Wedding Through Your Eyes', note: 'Capture a few moments for us', soon: true },
  { to: '/program', title: 'Wedding Programme', note: 'Follow the service' },
];

export default function WeddingHub() {
  return (
    <main style={{
      minHeight: '100svh', background: C.ivory, color: C.ink,
      padding: `clamp(3rem, 12vw, 6rem) ${GUTTER} clamp(3rem, 10vw, 5rem)`,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ maxWidth: '34rem', width: '100%', margin: '0 auto', flex: 1 }}>
        <Reveal>
          <header style={{ textAlign: 'center' }}>
            <p style={{
              fontFamily: F.script, fontSize: 'clamp(1.7rem, 8vw, 2.6rem)',
              color: C.gold, margin: 0, lineHeight: 1.1,
            }}>
              Princess &amp; IniOluwa
            </p>
            <h1 style={{
              fontFamily: F.serif, fontWeight: 300,
              fontSize: 'clamp(2.4rem, 12vw, 3.6rem)',
              color: C.green, margin: '0.6rem 0 0', lineHeight: 1.05,
            }}>
              At the Wedding
            </h1>
            <p style={{
              fontFamily: F.serif, fontStyle: 'italic', color: C.muted,
              fontSize: 'clamp(1rem, 4vw, 1.15rem)', margin: '0.9rem 0 0',
            }}>
              Everything you need for the celebration.
            </p>
          </header>
        </Reveal>

        <nav style={{ marginTop: 'clamp(2.5rem, 10vw, 4rem)' }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {ACTIONS.map((a, i) => {
              const row: React.CSSProperties = {
                display: 'flex', alignItems: 'baseline', gap: 'clamp(0.8rem, 4vw, 1.2rem)',
                textDecoration: 'none',
                // Generous: these are thumb targets on a phone held at a
                // dinner table, often one-handed.
                padding: 'clamp(1.15rem, 5vw, 1.5rem) 0',
                borderTop: i === 0 ? `1px solid ${C.rule}` : 'none',
                borderBottom: `1px solid ${C.rule}`,
              };

              const inner = (
                <>
                  <span style={{
                    fontFamily: F.sans, fontSize: '0.62rem', letterSpacing: '0.24em',
                    color: C.goldSoft, minWidth: '2em', paddingTop: '0.5em',
                    opacity: a.soon ? 0.55 : 1,
                  }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'block', fontFamily: F.serif, fontWeight: 300,
                      fontSize: 'clamp(1.5rem, 6.2vw, 2rem)',
                      // Dimmed, not greyed to illegibility: it still has to
                      // read as part of the set.
                      color: a.soon ? C.greenSoft : C.green,
                      opacity: a.soon ? 0.75 : 1,
                      lineHeight: 1.2,
                    }}>
                      {a.title}
                    </span>
                    <span style={{
                      display: 'block', fontFamily: F.serif, fontStyle: 'italic',
                      fontSize: 'clamp(0.92rem, 3.6vw, 1rem)', color: C.muted,
                      marginTop: '0.3rem', opacity: a.soon ? 0.8 : 1,
                    }}>
                      {a.note}
                    </span>
                    {a.soon && (
                      <span style={{
                        display: 'inline-block', marginTop: '0.55rem',
                        fontFamily: F.sans, fontSize: '0.56rem', fontWeight: 600,
                        letterSpacing: '0.24em', textTransform: 'uppercase',
                        color: C.gold, border: `1px solid ${C.rule}`,
                        padding: '0.3rem 0.55rem',
                      }}>
                        Coming Soon
                      </span>
                    )}
                  </span>
                  {!a.soon && (
                    <span aria-hidden style={{ color: C.gold, fontSize: '1.2rem', flex: '0 0 auto' }}>→</span>
                  )}
                </>
              );

              return (
                <Reveal as="li" key={a.title} delay={90 + i * 80}>
                  {a.to
                    ? <Link to={a.to} style={row}>{inner}</Link>
                    // A plain div: no href, nothing focusable, nothing to tap.
                    // It cannot navigate because there is no control here.
                    : <div style={{ ...row, cursor: 'default' }} aria-disabled="true">{inner}</div>}
                </Reveal>
              );
            })}
          </ul>
        </nav>

        <Reveal delay={460}>
          <p style={{
            textAlign: 'center', marginTop: 'clamp(2.5rem, 10vw, 4rem)',
            fontFamily: F.serif, fontStyle: 'italic', color: C.faint,
            fontSize: '0.95rem', lineHeight: 1.7,
          }}>
            {WEDDING.venueName} · {WEDDING.dateLong}
          </p>
        </Reveal>
      </div>
    </main>
  );
}
