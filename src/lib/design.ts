/**
 * The wedding-day visual system.
 *
 * ── Where these values come from ───────────────────────────────────────────
 * Not invented. The palette is the one already in 136 delivered emails and the
 * printed guest guide (scripts/email/config.mjs → PALETTE), and the typefaces
 * are the two already loaded in index.html. A guest holding the printed guide
 * and looking at the phone should see one wedding, not two.
 *
 * ── Only two families, on purpose ──────────────────────────────────────────
 * Cormorant Garamond carries the display AND the body. Pinyon Script appears
 * perhaps four times on the whole site, as an accent. The small letterspaced
 * labels use the SYSTEM sans — no third webfont — because most guests will
 * open this on Nigerian mobile data and a third family is 30-40KB spent on
 * text that is 9px and uppercase, where nobody can tell a system face from a
 * licensed one.
 */

export const C = {
  /** Page grounds. */
  ivory:     '#f7f3e9',
  ivoryDeep: '#efe8d8',
  paper:     '#fdfbf5',

  /** The greens, from the wedding identity. */
  green:     '#1a3410',
  greenMid:  '#2d5016',
  greenSoft: '#4a5e3a',

  /** Ink and its quieter registers. */
  ink:       '#2a2419',
  muted:     '#6f6551',
  faint:     '#a89880',

  /** Restrained metal. Used for eyebrows and hairlines, never for fills. */
  gold:      '#b8860b',
  goldSoft:  '#c9a86c',

  rule:      '#d8cdb2',
  onDark:    '#efe6cf',
  onDarkDim: '#a8bda6',
} as const;

export const F = {
  /** Display and body both. High contrast, and beautiful at 15vw. */
  serif: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  /** The calligraphic accent. Sparingly — it loses its power when repeated. */
  script: "'Pinyon Script', 'Cormorant Garamond', cursive",
  /** Tiny uppercase labels only. Deliberately not a webfont. */
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const;

/**
 * Fluid type.
 *
 * clamp() rather than breakpoints, so the display sizes are continuous from a
 * 360px phone to a wide desktop and never snap. The middle term is in vw, so
 * the type scales WITH the page rather than in steps — which is what makes a
 * long editorial scroll feel composed rather than responsive.
 */
export const T = {
  /** PRINCESS / INIOLUWA. Enormous on purpose. */
  display:  'clamp(3.25rem, 17vw, 11rem)',
  /** Section headings. */
  heading:  'clamp(2rem, 7.5vw, 4.5rem)',
  /** Programme times. */
  numeral:  'clamp(2.75rem, 12vw, 6rem)',
  /** Body copy — larger than a normal website, because this is being read. */
  body:     'clamp(1.0625rem, 3.6vw, 1.25rem)',
  /** Letterspaced labels. */
  label:    'clamp(0.6rem, 2.2vw, 0.7rem)',
} as const;

/** The one horizontal gutter. Everything aligns to it. */
export const GUTTER = 'clamp(1.5rem, 7vw, 6rem)';

/** Vertical rhythm between movements. Generous — negative space is the design. */
export const SECTION = 'clamp(5rem, 16vw, 11rem)';

/**
 * The letterspaced uppercase label used throughout.
 *
 * `color` is a plain string, not `typeof C.gold` — `as const` on the palette
 * narrows the default to that one literal, which would reject every other
 * colour in the palette it came from.
 */
export const label = (color: string = C.gold): React.CSSProperties => ({
  fontFamily: F.sans,
  fontSize: T.label,
  fontWeight: 500,
  letterSpacing: '0.34em',
  textTransform: 'uppercase',
  color,
  margin: 0,
});
