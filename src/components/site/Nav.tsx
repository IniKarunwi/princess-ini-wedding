/**
 * The navigation.
 *
 * ── Not a mobile drawer ────────────────────────────────────────────────────
 * The reference puts a single quiet circle in the corner and, when opened,
 * gives the whole screen over to a short list set in the wedding's own type.
 * That is what this does. No slide-in panel, no backdrop blur, no chevrons,
 * no icons beside the labels — the list IS the page for as long as it is open.
 *
 * ── The trigger ────────────────────────────────────────────────────────────
 * Two hairlines in a thin ring. It sits over the hero photograph, so it
 * carries a soft shadow rather than a filled background: a filled pill in the
 * corner of a full-bleed photograph is the single most website-looking thing
 * a page can do.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { C, F, GUTTER, label as labelStyle } from '@/lib/design';
import { WEDDING, ROUTES } from '@/lib/wedding';
import { usePrefersReducedMotion } from './primitives';

/**
 * `to` is omitted for an item that is listed but deliberately not reachable.
 *
 * RSVP is the one case. It stays in the menu because its absence would read
 * as an oversight — a guest who has not replied will go looking for it — and
 * it is shown closed so they stop looking rather than hunting the site for a
 * link that is no longer advertised.
 *
 * This removes NOTHING. The RSVP page, its route and its backend are
 * untouched; anyone holding the URL still reaches it exactly as before. The
 * menu simply stops offering it.
 */
const ITEMS: Array<{ to?: string; label: string; state?: string }> = [
  { to: ROUTES.home,      label: 'Home' },
  { to: ROUTES.programme, label: 'Wedding Service Programme' },
  { to: ROUTES.menu,      label: 'Food Menu' },
  { to: ROUTES.seating,   label: 'Find Your Seat' },
  { to: '/#venue',        label: 'Venue & Directions' },
  { to: '/#stay',         label: 'Where to Stay' },
  { label: 'RSVP',        state: 'Closed' },
];

export default function Nav({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const [open, setOpen] = useState(false);
  const reduced = usePrefersReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();

  // Close on route change — otherwise tapping a link leaves the overlay up
  // over the page it just navigated to.
  useEffect(() => { setOpen(false); }, [pathname]);

  // While the overlay is up the page behind must not scroll, and Escape must
  // close it. Focus returns to the trigger so keyboard users are not dumped
  // at the top of the document.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      triggerRef.current?.focus();
    };
  }, [open]);

  const barColor = tone === 'dark' ? C.onDark : C.green;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', top: 'clamp(1rem, 4vw, 2rem)', right: 'clamp(1rem, 4vw, 2rem)',
          zIndex: 60, width: 46, height: 46, borderRadius: '50%',
          // A ring, not a fill. Over a photograph the ring reads as a mark;
          // a filled circle reads as a UI control bolted on top.
          border: `1px solid ${tone === 'dark' ? 'rgba(239,230,207,0.5)' : 'rgba(26,52,16,0.28)'}`,
          background: 'transparent', cursor: 'pointer',
          display: open ? 'none' : 'grid', placeItems: 'center', gap: 0,
          backdropFilter: 'none',
        }}
      >
        <span aria-hidden style={{ display: 'grid', gap: 5 }}>
          <span style={{ display: 'block', width: 16, height: 1, background: barColor }} />
          <span style={{ display: 'block', width: 16, height: 1, background: barColor }} />
        </span>
      </button>

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        style={{
          position: 'fixed', inset: 0, zIndex: 70,
          background: C.green,
          // Opacity + a whisper of translate. A menu that flies in from the
          // side is a drawer; this should feel like a page being turned.
          opacity: open ? 1 : 0,
          transform: open ? 'none' : 'translate3d(0, -8px, 0)',
          pointerEvents: open ? 'auto' : 'none',
          transition: reduced ? 'none' : 'opacity .5s cubic-bezier(.22,.61,.36,1), transform .6s cubic-bezier(.22,.61,.36,1)',
          display: 'flex', flexDirection: 'column',
          padding: `clamp(1.5rem, 6vw, 3rem) ${GUTTER} clamp(2rem, 8vw, 4rem)`,
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ ...labelStyle(C.goldSoft), marginBottom: '0.5rem' }}>{WEDDING.dateNumeric}</p>
            <p style={{ fontFamily: F.script, fontSize: 'clamp(1.5rem, 6vw, 2rem)', color: C.onDark, margin: 0 }}>
              Princess &amp; IniOluwa
            </p>
          </div>
          <button
            type="button" aria-label="Close menu" onClick={() => setOpen(false)}
            style={{
              width: 46, height: 46, borderRadius: '50%', flex: '0 0 46px',
              border: '1px solid rgba(239,230,207,0.4)', background: 'transparent',
              cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.onDark,
              fontFamily: F.serif, fontSize: '1.4rem', lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <nav style={{ marginTop: 'clamp(2.5rem, 10vw, 5rem)', flex: 1 }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {ITEMS.map((item, i) => {
              const closed = !item.to;
              const isHash = !!item.to?.startsWith('/#');
              const inner = (
                <>
                  <span style={{
                    fontFamily: F.sans, fontSize: '0.6rem', letterSpacing: '0.24em',
                    color: C.onDarkDim, minWidth: '2.2em', paddingTop: '0.75em',
                    opacity: closed ? 0.45 : 1,
                  }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{
                    fontFamily: F.serif, fontWeight: 300,
                    fontSize: 'clamp(1.75rem, 7.5vw, 2.75rem)',
                    // Greyed out. The dim ivory at 55% is well below the live
                    // items without disappearing into the green — it has to
                    // stay readable, since the word RSVP is the thing the
                    // guest came to the menu looking for.
                    color: closed ? 'rgba(239,230,207,0.55)' : C.onDark,
                    lineHeight: 1.25,
                  }}>
                    {item.label}
                  </span>
                  {item.state && (
                    <span style={{
                      fontFamily: F.sans, fontSize: '0.58rem', letterSpacing: '0.24em',
                      textTransform: 'uppercase', color: C.onDarkDim,
                      opacity: 0.75, whiteSpace: 'nowrap',
                    }}>
                      — {item.state}
                    </span>
                  )}
                </>
              );
              const rowStyle = {
                display: 'flex', gap: 'clamp(0.75rem, 4vw, 1.5rem)',
                alignItems: 'baseline', textDecoration: 'none',
                padding: '0.45rem 0',
              } as const;
              return (
                <li key={item.label} style={{ borderBottom: '1px solid rgba(239,230,207,0.14)' }}>
                  {closed
                    // A span, not a styled-down <a> or a disabled <button>.
                    // There is no href to neutralise, nothing to preventDefault
                    // on, and nothing focusable to tab into — it cannot
                    // navigate because there is no control here to activate.
                    // aria-disabled tells a screen reader what the grey tells
                    // everyone else, and the default cursor stops it inviting
                    // a tap it will not answer.
                    ? <span
                        role="link"
                        aria-disabled="true"
                        style={{ ...rowStyle, cursor: 'default' }}
                      >
                        {inner}
                      </span>
                    : isHash
                      ? <a href={item.to} style={rowStyle} onClick={() => setOpen(false)}>{inner}</a>
                      : <Link to={item.to!} style={rowStyle}>{inner}</Link>}
                </li>
              );
            })}
          </ul>
        </nav>

        <div style={{ marginTop: 'clamp(2rem, 8vw, 3rem)' }}>
          <p style={{
            fontFamily: F.serif, fontWeight: 300, fontStyle: 'italic',
            fontSize: '1rem', color: C.onDarkDim, margin: 0,
          }}>
            {WEDDING.venueName}, {WEDDING.venueArea}
          </p>
        </div>
      </div>
    </>
  );
}
