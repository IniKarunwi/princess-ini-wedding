/**
 * /menu and /drinks — one component, two datasets.
 *
 * A menu is a list of dishes under headings. Building two near-identical
 * pages so that one could diverge later is how they drift apart; this takes
 * the sections as a prop instead.
 *
 * Set as a printed menu card rather than a web page: centred, generous
 * leading, hairline rules under the section names, no boxes. It is read once,
 * at a table, on a phone — so the type is large and the page never scrolls
 * sideways.
 */

import { Link } from 'react-router-dom';
import { C, F, GUTTER } from '@/lib/design';
import { Reveal } from '@/components/site/primitives';
import type { MenuSection } from '@/features/weddingday/menu';

export default function MenuPage({
  eyebrow, title, subtitle, sections, emptyNote,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  sections: MenuSection[];
  /** Shown instead of the list when there is genuinely nothing to show. */
  emptyNote?: string;
}) {
  return (
    <main style={{
      minHeight: '100svh', background: C.ivory, color: C.ink,
      padding: `clamp(2.5rem, 10vw, 5rem) ${GUTTER} clamp(3rem, 10vw, 5rem)`,
    }}>
      <div style={{ maxWidth: '32rem', margin: '0 auto' }}>
        <Reveal>
          <header style={{ textAlign: 'center' }}>
            <p style={{
              fontFamily: F.sans, fontSize: '0.62rem', fontWeight: 600,
              letterSpacing: '0.28em', textTransform: 'uppercase',
              color: C.gold, margin: 0,
            }}>
              {eyebrow}
            </p>
            <h1 style={{
              fontFamily: F.serif, fontWeight: 300,
              fontSize: 'clamp(2.4rem, 11vw, 3.4rem)',
              color: C.green, margin: '0.7rem 0 0', lineHeight: 1.05,
            }}>
              {title}
            </h1>
            {subtitle && (
              <p style={{
                fontFamily: F.serif, fontStyle: 'italic', color: C.muted,
                fontSize: '1.05rem', margin: '0.7rem 0 0',
              }}>
                {subtitle}
              </p>
            )}
          </header>
        </Reveal>

        {sections.length === 0 ? (
          <Reveal delay={120}>
            <p style={{
              fontFamily: F.serif, fontStyle: 'italic', color: C.muted,
              fontSize: '1.05rem', lineHeight: 1.8, textAlign: 'center',
              margin: 'clamp(3rem, 12vw, 5rem) 0',
            }}>
              {emptyNote}
            </p>
          </Reveal>
        ) : (
          <div style={{ marginTop: 'clamp(2.5rem, 10vw, 4rem)' }}>
            {sections.map((section, si) => (
              <Reveal key={section.title} delay={80 + si * 70}>
                <section style={{ marginBottom: 'clamp(2.2rem, 9vw, 3.4rem)' }}>
                  <h2 style={{
                    fontFamily: F.sans, fontSize: '0.64rem', fontWeight: 600,
                    letterSpacing: '0.3em', textTransform: 'uppercase',
                    color: C.greenSoft, textAlign: 'center',
                    margin: '0 0 0.9rem', paddingBottom: '0.9rem',
                    borderBottom: `1px solid ${C.rule}`,
                  }}>
                    {section.title}
                  </h2>

                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, textAlign: 'center' }}>
                    {section.items.map((item) => (
                      <li key={item.name} style={{ padding: '0.55rem 0' }}>
                        <span style={{
                          fontFamily: F.serif, fontWeight: 300,
                          fontSize: 'clamp(1.15rem, 4.6vw, 1.35rem)',
                          color: C.ink, lineHeight: 1.4, display: 'block',
                        }}>
                          {item.name}
                        </span>
                        {item.note && (
                          <span style={{
                            fontFamily: F.serif, fontStyle: 'italic',
                            fontSize: '0.95rem', color: C.muted,
                            display: 'block', marginTop: '0.15rem',
                          }}>
                            {item.note}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              </Reveal>
            ))}
          </div>
        )}

        <Reveal delay={300}>
          <div style={{ textAlign: 'center', marginTop: 'clamp(1.5rem, 6vw, 2.5rem)' }}>
            <BackToWedding />
          </div>
        </Reveal>
      </div>
    </main>
  );
}

/**
 * The way back.
 *
 * Every page a QR guest can reach has exactly one of these, in the same
 * place, saying the same thing. Someone standing at a table should never
 * have to work out how to get back, or reach for the browser's back button.
 */
export function BackToWedding({ label = 'Back to the Wedding' }: { label?: string }) {
  return (
    <Link
      to="/wedding"
      style={{
        display: 'inline-block', textDecoration: 'none',
        fontFamily: F.sans, fontSize: '0.64rem', fontWeight: 600,
        letterSpacing: '0.24em', textTransform: 'uppercase',
        color: C.green, borderBottom: `1px solid ${C.green}`,
        paddingBottom: '0.5rem',
        // Grown to a comfortable tap target without moving the underline.
        margin: '0.6rem 0',
      }}
    >
      ← {label}
    </Link>
  );
}
