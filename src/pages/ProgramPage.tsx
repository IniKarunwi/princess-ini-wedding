/**
 * /program — the Order of Service.
 *
 * This URL is printed on the table cards, and until today it answered with a
 * placeholder saying the programme was still being finalised. It is the day,
 * so it answers with the programme.
 *
 * ── Shaped for a phone held in a church ────────────────────────────────────
 * Not a reproduction of the printed sheet. The printed sheet is a four-column
 * table — item, led by, duration, time — which is right on A4 and unreadable
 * on a phone, where four columns become four cramped ones or a sideways
 * scroll.
 *
 * So each item is a block: what it is, who leads it, anything printed beneath
 * it, and the time set to one side. Duration is dropped: a guest wants to
 * know when something happens, not how many minutes it lasts, and the times
 * already say both.
 *
 * ── Quiet about the clock ──────────────────────────────────────────────────
 * Nothing here highlights "what is happening now". It would need a live clock,
 * it would be wrong the moment the service runs long — which services do —
 * and a screen updating itself in someone's hand during the vows is the exact
 * opposite of what the couple asked for. The times are printed and still.
 */

import { C, F, GUTTER } from '@/lib/design';
import { Reveal } from '@/components/site/primitives';
import { BackToWedding } from './MenuPage';
import {
  ORDER_OF_SERVICE, PROGRAM_CHURCH, PROGRAM_COUPLE, PROGRAM_DATE, PROGRAM_TITLE,
} from '@/features/weddingday/program';

export default function ProgramPage() {
  return (
    <main style={{
      minHeight: '100svh', background: C.ivory, color: C.ink,
      padding: `clamp(2.5rem, 10vw, 5rem) ${GUTTER} clamp(3rem, 10vw, 5rem)`,
    }}>
      <div style={{ maxWidth: '34rem', margin: '0 auto' }}>
        <Reveal>
          <header style={{ textAlign: 'center' }}>
            <p style={{
              fontFamily: F.sans, fontSize: '0.62rem', fontWeight: 600,
              letterSpacing: '0.28em', textTransform: 'uppercase',
              color: C.gold, margin: 0,
            }}>
              The Service
            </p>
            <h1 style={{
              fontFamily: F.serif, fontWeight: 300,
              fontSize: 'clamp(2.4rem, 11vw, 3.4rem)',
              color: C.green, margin: '0.7rem 0 0', lineHeight: 1.05,
            }}>
              Order of Service
            </h1>
            <p style={{
              fontFamily: F.serif, fontStyle: 'italic', color: C.muted,
              fontSize: '1.05rem', margin: '0.8rem 0 0', lineHeight: 1.6,
            }}>
              {PROGRAM_TITLE}
            </p>
            <p style={{
              fontFamily: F.serif, fontSize: '1.05rem', color: C.ink,
              margin: '0.4rem 0 0', lineHeight: 1.6,
            }}>
              {PROGRAM_COUPLE}
            </p>
            <p style={{
              fontFamily: F.sans, fontSize: '0.64rem', letterSpacing: '0.18em',
              textTransform: 'uppercase', color: C.faint, margin: '1rem 0 0',
            }}>
              {PROGRAM_DATE} · {PROGRAM_CHURCH}
            </p>
          </header>
        </Reveal>

        <div style={{ marginTop: 'clamp(2.5rem, 10vw, 4rem)' }}>
          {ORDER_OF_SERVICE.map((section, si) => (
            <Reveal key={section.title} delay={80 + si * 60}>
              <section style={{ marginBottom: 'clamp(2.4rem, 9vw, 3.4rem)' }}>
                <header style={{
                  textAlign: 'center', margin: '0 0 1.2rem',
                  paddingBottom: '0.9rem', borderBottom: `1px solid ${C.rule}`,
                }}>
                  <h2 style={{
                    fontFamily: F.sans, fontSize: '0.64rem', fontWeight: 600,
                    letterSpacing: '0.3em', textTransform: 'uppercase',
                    color: C.greenSoft, margin: 0,
                  }}>
                    {section.title}
                  </h2>
                  <p style={{
                    fontFamily: F.serif, fontStyle: 'italic', fontSize: '0.9rem',
                    color: C.faint, margin: '0.4rem 0 0',
                  }}>
                    {section.time}
                  </p>
                </header>

                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {section.items.map((item) => (
                    <li key={item.title + (item.time ?? '')} style={{ padding: '0.7rem 0' }}>
                      {/* Title and time on one line, the time pinned right and
                          allowed to wrap under on a narrow screen rather than
                          squeezing the title. */}
                      <div style={{
                        display: 'flex', alignItems: 'baseline', gap: '0.8rem',
                        justifyContent: 'space-between', flexWrap: 'wrap',
                      }}>
                        <span style={{
                          fontFamily: F.serif, fontWeight: 300,
                          fontSize: 'clamp(1.15rem, 4.6vw, 1.3rem)',
                          color: C.ink, lineHeight: 1.35,
                        }}>
                          {item.title}
                        </span>
                        {item.time && (
                          <span style={{
                            fontFamily: F.sans, fontSize: '0.62rem', fontWeight: 600,
                            letterSpacing: '0.1em', color: C.faint,
                            whiteSpace: 'nowrap',
                          }}>
                            {item.time}
                          </span>
                        )}
                      </div>

                      {item.leader && (
                        <p style={{
                          fontFamily: F.sans, fontSize: '0.74rem',
                          color: C.muted, margin: '0.2rem 0 0', lineHeight: 1.5,
                        }}>
                          {item.leader}
                        </p>
                      )}

                      {item.note && (
                        <p style={{
                          fontFamily: F.serif, fontStyle: 'italic',
                          fontSize: '0.92rem', color: C.muted,
                          margin: '0.25rem 0 0', lineHeight: 1.5,
                        }}>
                          {item.note}
                        </p>
                      )}

                      {/* The Declarations are eight things in one item. Indented
                          under it so the order is clear without pretending each
                          is a separate entry with its own time. */}
                      {item.parts && (
                        <ul style={{
                          listStyle: 'none', margin: '0.55rem 0 0',
                          padding: '0 0 0 0.9rem',
                          borderLeft: `1px solid ${C.rule}`,
                        }}>
                          {item.parts.map((part) => (
                            <li key={part} style={{
                              fontFamily: F.serif, fontWeight: 300,
                              fontSize: '1rem', color: C.ink,
                              lineHeight: 1.75,
                            }}>
                              {part}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </Reveal>
          ))}
        </div>

        <Reveal delay={320}>
          <div style={{ textAlign: 'center', marginTop: 'clamp(1.5rem, 6vw, 2.5rem)' }}>
            <BackToWedding />
          </div>
        </Reveal>
      </div>
    </main>
  );
}
