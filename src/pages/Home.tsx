/**
 * The wedding-day homepage.
 *
 * ── Why this is one file ───────────────────────────────────────────────────
 * Every section here is a one-off composition. Breaking them into "reusable"
 * components would imply they share a shape, and the whole point is that they
 * do not — the page should never settle into a rhythm a guest can predict.
 * Keeping them adjacent is what makes the rhythm editable as a whole.
 *
 * ── The rhythm ─────────────────────────────────────────────────────────────
 * dark photograph → ivory type → green panel → ivory + portrait →
 * photograph-led → quiet ivory → full-bleed photograph → ivory →
 * disclosure → green close
 *
 * No section repeats the one before it. That alternation is doing the work
 * that cards and containers would otherwise be asked to do.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Nav from '@/components/site/Nav';
import DressInspiration from '@/components/site/DressInspiration';
import { Reveal, Label, Script, Body, Rule, Engraved, Photo } from '@/components/site/primitives';
import { C, F, T, GUTTER, SECTION } from '@/lib/design';
import { WEDDING, PROGRAMME, WELCOME, PHONE_FREE, STAY, DRESS, MAP_URL, ROUTES, hotelMapUrl } from '@/lib/wedding';

/** Desktop gets a different composition, not a wider one. */
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 860px)');
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/**
 * The evening.
 *
 * Near-black, but not neutral: it carries a green undertone so the reception
 * section belongs to a wedding whose colour is green rather than looking like
 * a different website. Sampled against the photograph it sits beside, whose
 * right-hand side measures #0a0a0a — close enough that the two read as one
 * continuous field.
 */
const NIGHT = '#0b0e0a';

const Section = ({ id, bg, children, pad = true }: {
  id?: string; bg?: string; children: React.ReactNode; pad?: boolean;
}) => (
  <section
    id={id}
    style={{
      background: bg, position: 'relative',
      padding: pad ? `${SECTION} ${GUTTER}` : 0,
      scrollMarginTop: '2rem',
    }}
  >
    {children}
  </section>
);

export default function Home() {
  const wide = useWide();

  return (
    <main style={{ background: C.ivory, overflowX: 'hidden' }}>
      <Nav tone="dark" />

      {/* ── HERO ──────────────────────────────────────────────────────────
          The photograph is the page. Type sits IN it, not on a band above
          it. The couple occupy the lower-right of the frame, so the crop is
          pushed that way and the names take the space their heads leave. */}
      <section style={{ position: 'relative', height: '100svh', minHeight: 560, background: '#0d0d0d' }}>
        <Photo
          name="hero"
          alt="Princess and IniOluwa embracing, lit by a heart projected on the wall behind them"
          ratio="auto"
          priority
          focal={wide ? '60% 45%' : '62% 38%'}
          style={{ position: 'absolute', inset: 0, height: '100%', aspectRatio: 'auto' }}
        />
        {/* A vertical gradient, heaviest top and bottom where the type sits.
            Not a flat overlay — a flat scrim greys the whole photograph and
            is why so many hero images look cheap. The lower stop is the
            stronger one, because the names and the script sit down there. */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(8,8,8,.55) 0%, rgba(8,8,8,.10) 30%, rgba(8,8,8,.22) 48%, rgba(8,8,8,.72) 78%, rgba(8,8,8,.88) 100%)',
        }} />

        {/* The date is pinned top-left; everything else is grouped in the
            lower third. Distributing all three with space-between put the
            names straight across the couple's faces — the crop has their
            heads at ~35% and dark suit below, so the type belongs down
            there where it has something to sit on. */}
        <div style={{
          position: 'absolute', inset: 0,
          padding: `clamp(4.5rem, 14vw, 7rem) ${GUTTER} clamp(2.5rem, 9vw, 4.5rem)`,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        }}>
          <Reveal delay={120} style={{ position: 'absolute', top: 'clamp(4.5rem, 14vw, 7rem)', left: GUTTER }}>
            <Label color="rgba(239,230,207,0.72)">{WEDDING.dateNumeric}</Label>
          </Reveal>

          <Reveal delay={260} y={26}>
            <h1 style={{
              fontFamily: F.serif, fontWeight: 300, color: C.onDark,
              fontSize: T.display, lineHeight: 0.88, letterSpacing: '-0.015em',
              margin: 0, textTransform: 'uppercase',
            }}>
              <span style={{ display: 'block' }}>{WEDDING.bride}</span>
              <span style={{
                display: 'block', fontFamily: F.script, textTransform: 'none',
                fontSize: '0.42em', color: C.goldSoft, lineHeight: 1,
                margin: '0.06em 0 0.02em 0.06em',
              }}>
                and
              </span>
              <span style={{ display: 'block' }}>{WEDDING.groom}</span>
            </h1>
          </Reveal>

          <Reveal delay={420}>
            <div style={{ marginTop: 'clamp(1.25rem, 5vw, 2rem)' }}>
              <Script size="clamp(1.5rem, 6.5vw, 2.4rem)" color="rgba(239,230,207,0.92)">
                Our Wedding Day
              </Script>
              <p style={{
                fontFamily: F.sans, fontSize: 'clamp(0.6rem,2.2vw,0.7rem)', letterSpacing: '0.3em',
                textTransform: 'uppercase', color: 'rgba(239,230,207,0.6)', marginTop: '1rem',
              }}>
                {WEDDING.city}
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── WELCOME ───────────────────────────────────────────────────────
          Their words, from the printed guide, set against the portrait.

          ── Why the photograph has no frame ─────────────────────────────
          It was shot high-key on white. Put inside a card it reads as a
          picture ON the page; left unframed and multiplied into the ivory,
          the white simply becomes the page and the couple appear to be
          standing in it. That is the whole composition — the right column
          is not an image slot, it is the other half of the spread.

          The multiply needs cream BEHIND it to resolve against, and Reveal
          animates opacity, which opens a stacking context the blend cannot
          see past. Hence the explicit ivory on the wrapper: without it the
          couple would sit on a white rectangle on a cream page. */}
      <Section>
        <div style={{
          display: wide ? 'grid' : 'block',
          // 47/53 — the photograph takes the larger share, which is what
          // stops this reading as two equal boxes.
          gridTemplateColumns: wide ? 'minmax(0, 47fr) minmax(0, 53fr)' : undefined,
          columnGap: wide ? 'clamp(2rem, 5.5vw, 5rem)' : undefined,
          alignItems: 'center',
        }}>
          {/* ── The letter ─────────────────────────────────────────────── */}
          <div style={{ maxWidth: wide ? '36rem' : '42rem' }}>
            <Reveal>
              <Label>Dear Friends &amp; Family</Label>
              {/* Italic Cormorant, already self-hosted — no new webfont for
                  one heading. The second line is indented rather than
                  centred: the stagger is what gives it the editorial
                  cadence, and it keeps the ragged left edge deliberate
                  instead of accidental. */}
              <h2 style={{
                fontFamily: F.serif, fontWeight: 300, fontStyle: 'italic',
                fontSize: 'clamp(2.15rem, 6.2vw, 4rem)', lineHeight: 0.98,
                color: C.green, margin: '1.4rem 0 2.25rem', letterSpacing: '-0.02em',
              }}>
                <span style={{ display: 'block' }}>You&rsquo;re invited to</span>
                <span style={{ display: 'block', marginLeft: '0.7em' }}>
                  celebrate with us
                </span>
              </h2>
            </Reveal>
            {/* A shorter measure than the heading. Body copy set to the full
                column ran to 80-odd characters and read like documentation. */}
            <div style={{ maxWidth: '31rem' }}>
              {WELCOME.map((para, i) => (
                <Reveal key={i} delay={100 + i * 90}>
                  <Body style={{ marginBottom: '1.5rem', color: C.ink }}>{para}</Body>
                </Reveal>
              ))}
            </div>
          </div>

          {/* ── The portrait ───────────────────────────────────────────── */}
          <Reveal delay={220}>
            <div style={{
              background: C.ivory,
              // Runs out towards the gutter on desktop, so the right edge is
              // a photograph meeting the page rather than a column stopping
              // politely short of it.
              marginRight: wide ? 'calc(-1 * clamp(0.5rem, 3vw, 3rem))' : 0,
              marginTop: wide ? 0 : 'clamp(2.75rem, 10vw, 4rem)',
              // The headline stops growing at 4rem, so beyond about 1600px an
              // uncapped photograph starts to dwarf it and the spread tips out
              // of balance. Past that width the composition gains margin
              // instead of scale, which is what a printed spread does.
              maxWidth: wide ? '46rem' : undefined,
              marginLeft: wide ? 'auto' : undefined,
            }}>
              <img
                src="/photos/invitation.jpg"
                srcSet="/photos/invitation-sm.jpg 760w, /photos/invitation.jpg 1200w"
                sizes={wide ? '53vw' : '92vw'}
                alt="Princess and IniOluwa in black tie, photographed against a white studio backdrop"
                loading="lazy"
                decoding="async"
                width={1200}
                height={1438}
                style={{
                  width: '100%', height: 'auto', display: 'block',
                  // Whites become the ivory behind; the blacks stay black.
                  mixBlendMode: 'multiply',
                }}
              />
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ── PROGRAMME ─────────────────────────────────────────────────────
          Deep green, and the times set as display numerals rather than as a
          list of rows. This is the section most at risk of becoming a
          software timeline, so it is given the most typographic weight. */}
      <Section bg={C.green}>
        <Reveal>
          <div style={{ textAlign: wide ? 'left' : 'center', marginBottom: 'clamp(2.5rem, 9vw, 4.5rem)' }}>
            <Label color={C.goldSoft}>The Day</Label>
            <h2 style={{
              fontFamily: F.serif, fontWeight: 300, fontSize: T.heading, color: C.onDark,
              margin: '1rem 0 0', lineHeight: 1,
            }}>
              Programme
            </h2>
            {/* "Programme" is set at line-height 1, so its descender hangs
                below its own box. At 0.25rem the script underneath collided
                with the 'g' on desktop. */}
            <Script color={C.goldSoft} size="clamp(1.3rem,5vw,1.9rem)" style={{ marginTop: '0.9rem' }}>
              of the day
            </Script>
          </div>
        </Reveal>

        {/* The list runs the full measure on desktop rather than stopping at
            54rem. Capped, the hairlines ended a third of the way short of the
            gutter and left an unresolved void down the right-hand side; run
            out to the margin they read as a ledger, and the staircase indent
            still does the work of walking the eye down. */}
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {PROGRAMME.map((item, i) => (
            <Reveal as="li" key={item.name} delay={i * 110}>
              <div style={{
                display: 'flex',
                flexDirection: wide ? 'row' : 'column',
                alignItems: wide ? 'baseline' : 'flex-start',
                gap: wide ? 'clamp(2rem, 6vw, 5rem)' : '0.35rem',
                // Each movement is indented a little further than the last,
                // so the eye walks down the page rather than scanning a table.
                marginLeft: wide ? `${i * 7}%` : 0,
                padding: 'clamp(1.6rem, 5vw, 2.4rem) 0',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                  <span style={{
                    fontFamily: F.serif, fontWeight: 300, fontSize: T.numeral,
                    color: C.onDark, lineHeight: 0.9, letterSpacing: '-0.02em',
                  }}>
                    {item.time}
                  </span>
                  <span style={{
                    fontFamily: F.sans, fontSize: '0.65rem', letterSpacing: '0.2em',
                    color: C.goldSoft, textTransform: 'uppercase',
                  }}>
                    {item.meridiem}
                  </span>
                </div>
                <div>
                  <p style={{
                    fontFamily: F.serif, fontSize: 'clamp(1.15rem, 4.4vw, 1.6rem)',
                    color: C.onDark, margin: 0, fontWeight: 400,
                  }}>
                    {item.name}
                  </p>
                  <p style={{
                    fontFamily: F.serif, fontStyle: 'italic', fontWeight: 300,
                    fontSize: '0.95rem', color: C.onDarkDim, margin: '0.3rem 0 0',
                  }}>
                    {item.note}
                  </p>
                </div>
              </div>
              {i < PROGRAMME.length - 1 && <Rule color="rgba(239,230,207,0.16)" />}
            </Reveal>
          ))}
        </ol>

        <Reveal>
          <div style={{ marginTop: 'clamp(2.5rem, 8vw, 4rem)', textAlign: wide ? 'left' : 'center' }}>
            <Link to={ROUTES.programme} style={{ textDecoration: 'none' }}>
              <Engraved color={C.goldSoft}>View Service Programme</Engraved>
            </Link>
          </div>
        </Reveal>
      </Section>

      {/* ── WEDDING SERVICE ───────────────────────────────────────────────
          The ceremony gets its own quiet moment: a tall portrait and very
          little else. Restraint here is what makes the reception section
          below feel like an arrival. */}
      <Section>
        <div style={{
          display: 'grid',
          gridTemplateColumns: wide ? '1fr 1fr' : '1fr',
          gap: 'clamp(2rem, 6vw, 5rem)', alignItems: 'center',
        }}>
          <Reveal>
            <Photo
              name="portrait"
              alt="Princess and IniOluwa, studio portrait"
              ratio="4 / 5"
              focal="50% 30%"
            />
          </Reveal>
          <Reveal delay={120}>
            <div style={{ maxWidth: '26rem' }}>
              <Label>The Service</Label>
              <h2 style={{
                fontFamily: F.serif, fontWeight: 300, fontSize: 'clamp(1.9rem, 6.5vw, 3.2rem)',
                color: C.green, lineHeight: 1.05, margin: '1rem 0 1.5rem',
              }}>
                Saturday,<br />26 September 2026
              </h2>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <span style={{ fontFamily: F.serif, fontSize: 'clamp(2.4rem,9vw,3.4rem)', color: C.greenMid, fontWeight: 300, lineHeight: 1 }}>
                  12:00
                </span>
                <span style={{ fontFamily: F.sans, fontSize: '0.65rem', letterSpacing: '0.2em', color: C.gold }}>PM</span>
              </div>
              <Body color={C.muted} style={{ fontStyle: 'italic', fontSize: '1rem' }}>
                {PHONE_FREE}
              </Body>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ── RECEPTION ─────────────────────────────────────────────────────
          Where the day turns into the evening.

          ── The photograph is not cropped ───────────────────────────────
          Its subject is not only the couple: it is the spotlight, the dark
          it is cut out of, and the shadow thrown across the floor. Covering
          a landscape container with a 4:5 frame would take the first thing
          off the top and the last off the bottom, so the frame is left at
          its own ratio and the LAYOUT bends around it instead.

          ── The dark continues past the edge ────────────────────────────
          The photograph's right-hand side measures #0a0a0a; the panel is a
          near-black carrying a green undertone, so the two read as one
          unbroken field and the type appears to sit in the picture's own
          negative space rather than in a box beside it. A gradient over the
          last fifth of the frame removes the seam entirely.

          Ivory on that dark measures 15.3:1 — the contrast is not a
          judgement call, it was sampled off the file. */}
      <section style={{ position: 'relative', background: NIGHT }}>
        <div style={{
          display: 'grid',
          // The picture takes the larger share; the words sit in the dark.
          gridTemplateColumns: wide ? '1.35fr 1fr' : '1fr',
          alignItems: 'stretch',
        }}>
          <div style={{ position: 'relative', background: NIGHT }}>
            <img
              src="/photos/reception.jpg"
              srcSet="/photos/reception-sm.jpg 820w, /photos/reception.jpg 1400w"
              sizes={wide ? '58vw' : '100vw'}
              alt="Princess and IniOluwa under a single spotlight, his head bowed to her shoulder, their shadow thrown long across the floor"
              loading="lazy"
              decoding="async"
              width={1400}
              height={1750}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
            {/* Dissolves the right edge into the panel. Desktop only — on a
                phone the panel is below, not beside, and a horizontal fade
                there would dim the spotlight for nothing. */}
            {wide && (
              <div aria-hidden style={{
                position: 'absolute', inset: '0 0 0 auto', width: '22%',
                background: `linear-gradient(to right, rgba(11,14,10,0) 0%, ${NIGHT} 92%)`,
                pointerEvents: 'none',
              }} />
            )}
          </div>

          <div style={{
            padding: `${SECTION} ${GUTTER}`,
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            // A breath of green at the foot, so the evening still belongs to
            // a wedding whose colour is green rather than to a black website.
            // Kept to a whisper: at full strength it read as a glow in the
            // corner and started competing with the spotlight, which is the
            // one thing in this section allowed to be bright.
            background: `linear-gradient(180deg, ${NIGHT} 64%, #0d150b 100%)`,
          }}>
            <Reveal>
              <Label color={C.goldSoft}>Afterwards</Label>
              <h2 style={{
                fontFamily: F.serif, fontWeight: 300, fontSize: T.heading,
                color: C.onDark, margin: '1rem 0 0.5rem', lineHeight: 1,
                textTransform: 'uppercase', letterSpacing: '0.01em',
              }}>
                Reception
              </h2>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', margin: '1.25rem 0 2rem' }}>
                <span style={{ fontFamily: F.serif, fontSize: 'clamp(2.4rem,9vw,3.4rem)', color: C.onDark, fontWeight: 300, lineHeight: 1 }}>
                  2:00
                </span>
                <span style={{ fontFamily: F.sans, fontSize: '0.65rem', letterSpacing: '0.2em', color: C.goldSoft }}>PM</span>
              </div>
              <Rule color="rgba(239,230,207,0.2)" width="3rem" style={{ marginBottom: '1.5rem' }} />
              <p style={{ fontFamily: F.serif, fontSize: 'clamp(1.2rem,4.5vw,1.6rem)', color: C.onDark, margin: 0, fontWeight: 400 }}>
                {WEDDING.venueName}
              </p>
              <p style={{ fontFamily: F.sans, fontSize: '0.68rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: C.onDarkDim, marginTop: '0.6rem' }}>
                {WEDDING.venueArea}
              </p>
              <p style={{ fontFamily: F.serif, fontStyle: 'italic', color: C.onDarkDim, marginTop: '1.5rem', fontSize: '1rem' }}>
                The After Party follows at 6:00 PM.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── THE TABLE ─────────────────────────────────────────────────────
          The reception's reading matter, set the way a restaurant sets a
          card rather than as a feature block. The list is kept — not
          flattened into a single link — because it is the row that carries
          the label and the note, and because anything else served at the
          table belongs in it. */}
      <Section>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 'clamp(2.5rem, 8vw, 4rem)' }}>
            <Label>At the Reception</Label>
            <Script color={C.green} size="clamp(2rem, 8vw, 3.2rem)" style={{ marginTop: '0.75rem' }}>
              The Table
            </Script>
          </div>
        </Reveal>

        <div style={{ maxWidth: '34rem', margin: '0 auto' }}>
          {[
            { to: ROUTES.menu, label: 'Food Menu', note: 'What we will be eating together' },
          ].map((row, i) => (
            <Reveal key={row.label} delay={i * 100}>
              <Link to={row.to} style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  gap: '1rem', padding: '1.5rem 0',
                }}>
                  <div>
                    <p style={{ fontFamily: F.serif, fontSize: 'clamp(1.35rem,5vw,1.9rem)', color: C.green, margin: 0, fontWeight: 300 }}>
                      {row.label}
                    </p>
                    <p style={{ fontFamily: F.serif, fontStyle: 'italic', fontSize: '0.95rem', color: C.muted, margin: '0.25rem 0 0' }}>
                      {row.note}
                    </p>
                  </div>
                  <span aria-hidden style={{ fontFamily: F.serif, fontSize: '1.4rem', color: C.gold, flex: '0 0 auto' }}>→</span>
                </div>
              </Link>
              <Rule />
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ── FIND YOUR SEAT ────────────────────────────────────────────────
          The one thing a guest will be hunting for while standing in a room
          full of people. It gets a full-bleed photograph and the largest
          call on the page — findable at a glance, without becoming a button
          the size of a phone. */}
      <section style={{ position: 'relative', minHeight: '70svh', display: 'grid' }}>
        <Photo
          name="reach"
          alt="Princess and IniOluwa reaching for one another's hands"
          ratio="auto"
          focal="50% 55%"
          style={{ gridArea: '1 / 1', height: '100%', aspectRatio: 'auto' }}
        />
        {/* Two scrims, not one.
            The photograph here is bright sunlit grass — the only light
            background on the page — and white type over it failed: the body
            line sat across the fingers and was genuinely hard to read. A
            single gradient could not fix it without greying the photo to
            mud, because the problem is local to the middle band where the
            type is, which is also where the gradient was weakest.
            So: a light even wash to knock the overall luminance down, and
            a soft radial pool behind the type itself. */}
        {/* `position: relative` on the scrims and the content is load-bearing,
            not decoration. All four children share grid cell 1/1, but <Photo>
            renders a POSITIONED wrapper, and within one stacking context a
            positioned element paints above every static sibling regardless of
            source order. Statically positioned, these scrims were painted and
            then covered by the photograph — the gradients were live in the
            computed styles and had no visible effect at all. */}
        <div aria-hidden style={{
          position: 'relative', zIndex: 1,
          gridArea: '1 / 1',
          background: 'linear-gradient(180deg, rgba(10,20,8,.62) 0%, rgba(10,20,8,.42) 50%, rgba(10,20,8,.66) 100%)',
        }} />
        <div aria-hidden style={{
          position: 'relative', zIndex: 2,
          gridArea: '1 / 1',
          background: 'radial-gradient(ellipse 78% 46% at 50% 48%, rgba(8,16,6,.62) 0%, rgba(8,16,6,.30) 55%, rgba(8,16,6,0) 100%)',
        }} />
        <div style={{
          position: 'relative', zIndex: 3,
          gridArea: '1 / 1', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          padding: `${SECTION} ${GUTTER}`,
        }}>
          <Reveal>
            <Label color="rgba(239,230,207,0.8)">When you arrive</Label>
            <h2 style={{
              fontFamily: F.serif, fontWeight: 300, color: '#fff',
              fontSize: 'clamp(2.4rem, 11vw, 5rem)', lineHeight: 1,
              margin: '1.25rem 0 1.75rem', textTransform: 'uppercase', letterSpacing: '-0.01em',
            }}>
              Find Your Seat
            </h2>
            <Body color="rgba(255,255,255,0.86)" style={{ maxWidth: '24rem', margin: '0 auto 1.5rem' }}>
              Look yourself up and we&rsquo;ll show you exactly where you&rsquo;re sitting.
            </Body>
            <Link to={ROUTES.seating} style={{ textDecoration: 'none' }}>
              <Engraved color="#fff">Find My Table</Engraved>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ── VENUE ─────────────────────────────────────────────────────────
          The watercolour that went out in the confirmation packs.

          Guests have already had this picture in their inbox, so putting it
          here is not decoration — it is the same building they were shown,
          which is worth more for recognising the place than a photograph of
          a facade would be.

          It is the SITE's own copy under /photos. The file in /email is
          hard-coded into 136 delivered confirmations and is not touched.

          Multiplied into the ivory for the same reason as the portrait
          above: the illustration's paper is #fcf3e5 against a #f7f3e9 page,
          which is near enough to look like a mistake and far enough to show
          as a pale rectangle. Multiply makes the paper the page — which is
          also just how watercolour behaves on paper. Reveal animates
          opacity, so the wrapper carries its own ivory for the blend to
          resolve against. */}
      <Section id="venue">
        <div style={{
          display: wide ? 'grid' : 'block',
          gridTemplateColumns: wide ? 'minmax(0, 46fr) minmax(0, 54fr)' : undefined,
          columnGap: wide ? 'clamp(2rem, 5vw, 4.5rem)' : undefined,
          alignItems: 'center',
        }}>
        <div style={{ maxWidth: '40rem', marginLeft: wide ? '6%' : 0 }}>
          <Reveal>
            <Label>Where everything happens</Label>
            <h2 style={{
              fontFamily: F.serif, fontWeight: 300, fontSize: 'clamp(2rem, 7vw, 3.4rem)',
              color: C.green, lineHeight: 1.05, margin: '1rem 0 0.75rem',
            }}>
              {WEDDING.venueName}
            </h2>
            <p style={{ fontFamily: F.sans, fontSize: '0.7rem', letterSpacing: '0.24em', textTransform: 'uppercase', color: C.muted }}>
              {WEDDING.venueArea}
            </p>
            <Body color={C.muted} style={{ marginTop: '1.75rem', fontStyle: 'italic' }}>
              Both the service and the reception are held here. We encourage
              early arrival — ushers will guide you to your seat.
            </Body>
            <div style={{ marginTop: '0.5rem' }}>
              <Engraved href={MAP_URL}>Open in Google Maps</Engraved>
            </div>
          </Reveal>
        </div>

          <Reveal delay={180}>
            <div style={{
              background: C.ivory,
              marginTop: wide ? 0 : 'clamp(2.5rem, 9vw, 3.5rem)',
            }}>
              <img
                src="/photos/venue-watercolour.jpg"
                srcSet="/photos/venue-watercolour-sm.jpg 700w, /photos/venue-watercolour.jpg 1100w"
                // Measured, not guessed: it renders at 635 of 1440 on desktop
                // and 335 of 390 on a phone. Declaring 100vw made a phone
                // fetch the 1100w file for a 335px slot.
                sizes={wide ? '46vw' : '88vw'}
                alt={`${WEDDING.venueName} — watercolour illustration`}
                loading="lazy"
                decoding="async"
                width={1100}
                height={846}
                style={{
                  width: '100%', height: 'auto', display: 'block',
                  mixBlendMode: 'multiply',
                }}
              />
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ── DRESS CODE ────────────────────────────────────────────────────
          The palette as one continuous band of colour, edge to edge.

          This was nine circles in a wrapping row, which was wrong twice
          over. Nine into four columns leaves a single orphan circle
          centred on its own line — and more fundamentally, a grid of
          equal rounded swatches with a caption under each is precisely
          the component-library look the whole page is trying not to have.

          A fabric card does not draw nine circles. It lays the colours
          against one another with no gap and no edge, so the guest reads
          the RANGE rather than nine separate items, and sets the names
          below as one quiet line. */}
      <Section bg={C.ivoryDeep}>
        <Reveal>
          <div style={{ textAlign: 'center', maxWidth: '36rem', margin: '0 auto clamp(2.5rem,8vw,3.5rem)' }}>
            <Label>Dress Code</Label>
            <h2 style={{
              fontFamily: F.serif, fontWeight: 300, fontSize: 'clamp(1.9rem, 7vw, 3rem)',
              color: C.green, margin: '1rem 0 0.25rem',
            }}>
              {DRESS.title}
            </h2>
            <Body color={C.muted} style={{ marginTop: '1.25rem', fontSize: '1rem' }}>
              {DRESS.invitation}
            </Body>
          </div>
        </Reveal>
        <Reveal delay={120}>
          {/* Full-bleed: the band breaks the gutter deliberately, which is
              what makes it read as material rather than as a widget sitting
              inside a column. `aria-hidden` because the colours carry no
              information the names below do not already give. */}
          <div
            aria-hidden
            style={{
              display: 'flex',
              width: `calc(100% + 2 * ${GUTTER})`,
              marginLeft: `calc(-1 * ${GUTTER})`,
              height: 'clamp(5.5rem, 24vw, 10rem)',
            }}
          >
            {DRESS.swatches.map(([hex, name]) => (
              <div key={name} style={{ flex: 1, background: hex }} />
            ))}
          </div>
        </Reveal>

        <Reveal delay={200}>
          {/* The names as one line of type, not nine captions. They wrap as
              a sentence wraps, which is why they are separated by a middot
              rather than positioned under their own swatch. */}
          <p style={{
            fontFamily: F.sans, fontSize: 'clamp(0.55rem, 2.1vw, 0.65rem)',
            letterSpacing: '0.22em', textTransform: 'uppercase',
            color: C.muted, textAlign: 'center', lineHeight: 2.2,
            margin: 'clamp(1.25rem, 5vw, 2rem) auto 0', maxWidth: '34rem',
          }}>
            {/* Non-breaking spaces inside the names: left alone, the line
                wraps as "MORNING / MIST · IVORY", which reads as ten
                colours rather than nine. Only the separators may break. */}
            {DRESS.swatches.map(([, name]) => name.replace(/ /g, ' ')).join('  ·  ')}
          </p>
        </Reveal>
        {/* Directly under the palette, because it answers the question the
            palette raises. Nine circles say which colours; these say how
            formal, which is the half a guest cannot infer. */}
        <Reveal delay={280}>
          <DressInspiration />
        </Reveal>
      </Section>

      {/* ── WHERE TO STAY ─────────────────────────────────────────────────
          Twelve hotels is a directory, and a directory on a homepage is a
          wall. Folded away behind one line, open to anyone who needs it. */}
      <Section id="stay">
        <div style={{ maxWidth: '40rem', margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center' }}>
              <Label>For guests travelling in</Label>
              <h2 style={{
                fontFamily: F.serif, fontWeight: 300, fontSize: 'clamp(1.9rem, 7vw, 3rem)',
                color: C.green, margin: '1rem 0 1.25rem',
              }}>
                Where to Stay
              </h2>
              <Body color={C.muted} style={{ fontSize: '1rem' }}>{STAY.intro}</Body>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <details style={{ marginTop: '2.5rem' }}>
              <summary style={{
                listStyle: 'none', cursor: 'pointer', textAlign: 'center',
                fontFamily: F.sans, fontSize: '0.7rem', letterSpacing: '0.24em',
                textTransform: 'uppercase', color: C.green, padding: '0.85rem 0',
                borderTop: `1px solid ${C.rule}`, borderBottom: `1px solid ${C.rule}`,
              }}>
                See suggested hotels
              </summary>

              <div style={{ paddingTop: '2rem' }}>
                {STAY.bands.map((band) => (
                  <div key={band.label} style={{ marginBottom: '2rem' }}>
                    <Label style={{ marginBottom: '0.75rem' }}>{band.label}</Label>
                    {band.hotels.map(([name, area]) => (
                      <a
                        key={name}
                        href={hotelMapUrl(name, area)}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                          gap: '1rem', padding: '0.7rem 0', textDecoration: 'none',
                          borderBottom: `1px solid ${C.rule}`,
                        }}
                      >
                        <span style={{ fontFamily: F.serif, fontSize: '1.05rem', color: C.green, fontWeight: 400 }}>{name}</span>
                        <span style={{ fontFamily: F.sans, fontSize: '0.58rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: C.muted, whiteSpace: 'nowrap' }}>{area}</span>
                      </a>
                    ))}
                  </div>
                ))}

                <div style={{ marginTop: '2rem' }}>
                  <Label style={{ marginBottom: '0.6rem' }}>If you don&rsquo;t mind a longer drive</Label>
                  <a href={hotelMapUrl(STAY.farther.name, STAY.farther.area)} style={{ textDecoration: 'none' }}>
                    <p style={{ fontFamily: F.serif, fontSize: '1.05rem', color: C.green, margin: 0 }}>
                      {STAY.farther.name} · <span style={{ fontFamily: F.sans, fontSize: '0.58rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: C.muted }}>{STAY.farther.area}</span>
                    </p>
                  </a>
                  <Body color={C.muted} style={{ fontSize: '0.92rem', marginTop: '0.5rem', fontStyle: 'italic' }}>
                    {STAY.farther.note}
                  </Body>
                </div>

                <Body color={C.faint} style={{ fontSize: '0.85rem', marginTop: '2rem', fontStyle: 'italic', textAlign: 'center' }}>
                  {STAY.caveat}
                </Body>
              </div>
            </details>
          </Reveal>
        </div>
      </Section>

      {/* ── CLOSING ───────────────────────────────────────────────────────
          The back of the stationery. No footer navigation — the page should
          end the way a letter ends. The single exception is the registry,
          which belongs with the signature for the same reason it would be on
          a card tucked into the envelope rather than printed on the
          invitation itself. */}
      <section style={{ background: C.green, padding: `${SECTION} ${GUTTER}`, textAlign: 'center' }}>
        <Reveal>
          <Script color={C.goldSoft} size="clamp(1.6rem, 6.5vw, 2.4rem)">With love,</Script>
          <h2 style={{
            fontFamily: F.serif, fontWeight: 300, color: C.onDark,
            fontSize: 'clamp(2.1rem, 9vw, 4rem)', lineHeight: 1.05,
            margin: '1rem 0 2rem', textTransform: 'uppercase', letterSpacing: '0.01em',
          }}>
            Princess &amp; IniOluwa
          </h2>
          <Rule color="rgba(239,230,207,0.22)" width="4rem" style={{ margin: '0 auto 2rem' }} />
          <p style={{
            fontFamily: F.sans, fontSize: '0.68rem', letterSpacing: '0.34em',
            textTransform: 'uppercase', color: C.onDarkDim, margin: 0,
          }}>
            {WEDDING.dateNumeric}
          </p>
          <p style={{
            fontFamily: F.serif, fontStyle: 'italic', fontWeight: 300,
            fontSize: '0.95rem', color: 'rgba(168,189,166,0.75)', marginTop: '1.5rem',
          }}>
            {WEDDING.venueName} &middot; {WEDDING.venueArea}
          </p>

          {/* Quiet on purpose. Your presence is the gift; this is only here
              for the guests who ask, and they should not have to. */}
          <div style={{ marginTop: '2.75rem' }}>
            <p style={{
              fontFamily: F.serif, fontStyle: 'italic', fontWeight: 300,
              fontSize: '0.95rem', color: 'rgba(168,189,166,0.75)',
              margin: '0 0 0.25rem',
            }}>
              Your presence is the gift. If you would like to give something more —
            </p>
            {/* Styled as <Engraved> rather than wrapping one: a router <Link>
                is already an anchor, and nesting a button inside it would be
                two controls where the guest sees one. */}
            <span style={{ display: 'inline-block', padding: '0.6rem 0', lineHeight: 1 }}>
              <Link
                to="/registry"
                style={{
                  display: 'inline-block',
                  fontFamily: F.sans, fontSize: 'clamp(0.66rem, 2.4vw, 0.76rem)',
                  fontWeight: 500, letterSpacing: '0.24em', textTransform: 'uppercase',
                  color: C.goldSoft, textDecoration: 'none',
                  borderBottom: `1px solid ${C.goldSoft}`, paddingBottom: '0.5rem',
                }}
              >
                Our Registry
              </Link>
            </span>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
