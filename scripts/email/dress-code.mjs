/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE DRESS CODE — THE ONE FILE TO EDIT
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Everything the final-details email says about what to wear is in this file
 * and nowhere else. Change it here, run the two commands below, look at the
 * preview, send. No template, no HTML, no logic.
 *
 *     npm run email:final-details:check      validate, and re-render previews
 *     open scratch/final-details-preview/joining.html
 *
 * ── What you may change ────────────────────────────────────────────────────
 *   title        the palette's name, shown as the section heading
 *   invitation   one line of guidance under it
 *   swatches     [hex, name] pairs, rendered as colour chips
 *
 * Any number of swatches works. They are laid out in two centred rows, split
 * as evenly as possible, so five-and-four, four-and-four or three-and-three
 * all sit correctly without touching the template.
 *
 * ── MATCHING THE WEBSITE ───────────────────────────────────────────────────
 * These values are duplicated from `DRESS` in src/lib/wedding.ts, because the
 * email scripts are .mjs and the site's data is .ts, and nothing imports
 * across that line. `matchesSite` below decides what happens when they differ:
 *
 *   true   the selftest FAILS if this file and the site disagree. This is the
 *          right setting when the site is the source of truth and you want to
 *          be stopped from sending a palette the site contradicts.
 *
 *   false  the selftest reports the difference and passes. Use this ONLY when
 *          you are deliberately sending a palette the site does not show yet
 *          — and change the site too, or guests will click through from the
 *          email to something different.
 *
 * ── IF YOU CHANGE THE WEBSITE PALETTE TOO ──────────────────────────────────
 * Edit `DRESS` in src/lib/wedding.ts to match this file exactly — same title,
 * same invitation, same hexes and names in the same order — then leave
 * `matchesSite: true` and the selftest will confirm they agree. That site
 * change is a separate deploy from this email, and the email links to the
 * site, so deploy it before you send.
 */

export const DRESS = {
  /** Fail the selftest when this file and src/lib/wedding.ts disagree. */
  matchesSite: true,

  title: 'Eden in Full Bloom',

  invitation: 'We invite you to wear colours you’d find in a garden.',

  /**
   * Sampled from public/email/dress-guide.jpg — the printed sheet — rather
   * than eyeballed: the median of the centre of each circle, so an
   * antialiased rim cannot shift the value.
   */
  swatches: [
    ['#9f1c48', 'Magenta'],
    ['#ec8475', 'Coral Pink'],
    ['#dc7331', 'Burnt Orange'],
    ['#826927', 'Golden Cypress'],
    ['#8ca389', 'Sage'],
    ['#ebc769', 'Butter Yellow'],
    ['#8ab7de', 'Sky Blue'],
    ['#9681ba', 'Lavender'],
    ['#1d5c3f', 'Emerald'],
  ],

  /**
   * The formality, in the guide's own words. The colours alone do not say
   * black tie, and "kindly refrain from traditional/native attire" is the one
   * line a guest would be embarrassed to discover on the day.
   *
   * Two short lists rather than the full sheet: the email points at the
   * website for the rest.
   */
  gentlemen: {
    label: 'English Formal',
    notes: [
      'Black tie or formal tuxedos are preferred.',
      'Tailored dark or neutral suits are also welcome.',
      'Kindly refrain from wearing traditional/native attire.',
    ],
  },
  ladies: {
    label: 'Royal Garden Elegance',
    notes: [
      'Floor-length gowns or elegant cocktail and midi dresses.',
      'Fascinators, statement hats or refined headpieces are warmly welcomed.',
    ],
  },
};

/**
 * Checks the shape of the above, so a typo becomes a clear message rather
 * than a malformed email. Called by the selftest and by the sender before it
 * will deliver anything.
 */
export function validateDress(d = DRESS) {
  const problems = [];
  const str = (v) => typeof v === 'string' && v.trim() !== '';

  if (!str(d.title)) problems.push('title is empty');
  if (!str(d.invitation)) problems.push('invitation is empty');
  if (!Array.isArray(d.swatches) || d.swatches.length === 0) {
    problems.push('swatches is empty — the section would render a heading and nothing else');
  } else {
    d.swatches.forEach((sw, i) => {
      if (!Array.isArray(sw) || sw.length !== 2) {
        problems.push(`swatch ${i + 1} is not a [hex, name] pair`);
        return;
      }
      const [hex, name] = sw;
      // Six-digit hex only. Three-digit and named CSS colours are inconsistently
      // supported across mail clients, and a colour that silently falls back to
      // black in Outlook is worse than a build error.
      if (!/^#[0-9a-f]{6}$/i.test(String(hex))) {
        problems.push(`swatch ${i + 1} ("${name}") has an invalid hex: ${hex} — use #rrggbb`);
      }
      if (!str(name)) problems.push(`swatch ${i + 1} has no name`);
    });
    const names = d.swatches.map(([, n]) => String(n).trim().toLowerCase());
    const dupe = names.find((n, i) => names.indexOf(n) !== i);
    if (dupe) problems.push(`two swatches are both named "${dupe}"`);
  }
  return problems;
}
