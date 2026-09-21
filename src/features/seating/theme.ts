/**
 * Visual tokens for the seating chart.
 *
 * ── Why these are duplicated ───────────────────────────────────────────────
 * The homepage visual system lives on feature/wedding-day-frontend, in
 * src/lib/design.ts, which this branch does not have and must not modify.
 * The names and values here are deliberately IDENTICAL to that file's, so
 * integrating the two later is a delete-and-re-import rather than a
 * find-and-replace through every component:
 *
 *     -import { C, F } from '../theme';
 *     +import { C, F } from '@/lib/design';
 *
 * Nothing in this feature reads a colour from anywhere else. If a value ever
 * needs to change, it changes once, here.
 */

export const C = {
  ivory:     '#f7f3e9',
  ivoryDeep: '#efe8d8',
  paper:     '#fdfbf5',

  green:     '#1a3410',
  greenMid:  '#2d5016',
  greenSoft: '#4a5e3a',

  ink:       '#2a2419',
  muted:     '#6f6551',
  faint:     '#a89880',

  gold:      '#b8860b',
  goldSoft:  '#c9a86c',

  rule:      '#d8cdb2',
  onDark:    '#efe6cf',
  onDarkDim: '#a8bda6',
} as const;

export const F = {
  serif: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  script: "'Pinyon Script', 'Cormorant Garamond', cursive",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const;

/** Colours used only by the floor plan itself. */
export const MAP = {
  floor:        '#fbf8f0',
  floorLine:    '#e7dcc4',
  tableFill:    '#fdfbf5',
  tableStroke:  '#cdbf9e',
  tableInk:     '#7a6f57',
  seatStroke:   '#cdbf9e',
  seatFill:     '#ffffff',

  /** The guest's own table, and the table an admin is dragging. */
  selectFill:   '#f4e7c3',
  selectStroke: '#b8860b',
  selectInk:    '#4a3c12',

  dance:        '#f2ead7',
  danceInk:     '#9a8a66',
  aisle:        '#f6f0e1',
  vipFill:      '#ece2cb',
  vipStroke:    '#c3ae83',

  invalid:      '#c2603f',
} as const;

/** The letterspaced uppercase label used throughout. */
export const label = (color: string = C.gold, size = '0.62rem'): React.CSSProperties => ({
  fontFamily: F.sans,
  fontSize: size,
  fontWeight: 600,
  letterSpacing: '0.24em',
  textTransform: 'uppercase',
  color,
  margin: 0,
});
