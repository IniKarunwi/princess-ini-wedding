/**
 * A page whose content is not written yet.
 *
 * The brief was explicit: do not invent the service programme, the food menu
 * or the drinks list. So this does not pretend — no skeleton rows, no lorem,
 * no "Starters / Mains / Desserts" headings waiting to be filled in. A guest
 * who opens the menu QR on the day and finds invented dishes is worse served
 * than one who finds an honest line.
 *
 * It is still composed: same type, same palette, same quiet. The missing state
 * should look deliberate, because it is.
 */
import { Link } from 'react-router-dom';
import Nav from '@/components/site/Nav';
import { Reveal, Label, Script, Body, Rule } from '@/components/site/primitives';
import { C, F, GUTTER } from '@/lib/design';
import { WEDDING } from '@/lib/wedding';

export default function Coming({ eyebrow, title, note }: {
  eyebrow: string; title: string; note: string;
}) {
  return (
    <main style={{
      minHeight: '100svh', background: C.ivory, display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: `clamp(5rem,14vw,8rem) ${GUTTER}`, textAlign: 'center',
    }}>
      <Nav />
      <Reveal>
        <Label>{eyebrow}</Label>
        <h1 style={{
          fontFamily: F.serif, fontWeight: 300, fontSize: 'clamp(2.2rem, 9vw, 4rem)',
          color: C.green, margin: '1.25rem 0 0.5rem', lineHeight: 1.05,
        }}>
          {title}
        </h1>
        <Script color={C.gold} size="clamp(1.3rem,5vw,1.8rem)">being prepared</Script>

        <Rule width="3rem" style={{ margin: '2.5rem auto' }} />

        <Body color={C.muted} style={{ maxWidth: '24rem', margin: '0 auto', fontStyle: 'italic' }}>
          {note}
        </Body>

        <div style={{ marginTop: '3rem' }}>
          <Link
            to="/"
            style={{
              fontFamily: F.sans, fontSize: '0.68rem', letterSpacing: '0.24em',
              textTransform: 'uppercase', color: C.green, textDecoration: 'none',
              borderBottom: `1px solid ${C.green}`, paddingBottom: '0.5rem',
            }}
          >
            Return home
          </Link>
        </div>

        <p style={{
          fontFamily: F.sans, fontSize: '0.6rem', letterSpacing: '0.3em',
          textTransform: 'uppercase', color: C.faint, marginTop: '4rem',
        }}>
          {WEDDING.dateNumeric}
        </p>
      </Reveal>
    </main>
  );
}
