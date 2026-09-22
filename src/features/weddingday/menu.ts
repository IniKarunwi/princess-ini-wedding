/**
 * The food menu.
 *
 * ── Transcribed from the caterer's document ────────────────────────────────
 * Source: "26th Sept. Option Menu.pdf" — a one-page Word export, headed
 * "26th September 2026 MENU". Nothing here is invented and nothing is
 * silently reworded.
 *
 * ── Two line-wrap artefacts in the source, resolved ────────────────────────
 * The PDF wraps two dish names onto the end of the PREVIOUS line, so read
 * literally it says:
 *
 *     Mixed Jambalaya rice topped with shrimps Party
 *     Jollof rice with peas
 *
 *     Goat meat Afang soup Beef
 *     Ogbono soup
 *
 * Those are not dishes called "…shrimps Party" and "…Afang soup Beef". The
 * intended reading — confirmed against the rendered page, where the stray
 * word visibly hangs off the line above — is "Party Jollof rice with peas"
 * and "Beef Ogbono soup". This is the ambiguity the brief asked to have
 * flagged rather than guessed, and it is recorded in MENU_NOTES.
 *
 * ── Wording preserved, including what looks like a typo ────────────────────
 * "Pasta marina" is what the document says. It is very likely meant to be
 * "marinara", but correcting a caterer's menu is not this file's job. Left
 * exactly as supplied and flagged.
 *
 * ── Grouping ───────────────────────────────────────────────────────────────
 * The source puts several salad items on shared comma-separated lines
 * ("Mexican salad, coleslaw salad"). They are split into separate items here
 * because a phone menu reads far better as a list — the words are unchanged,
 * only the line breaks differ.
 */

export interface MenuItem {
  name: string;
  /** Shown smaller beneath the name. Only where the source supplies one. */
  note?: string;
}

export interface MenuSection {
  title: string;
  items: MenuItem[];
}

export const MENU_TITLE = '26th September 2026';

export const FOOD_MENU: MenuSection[] = [
  {
    title: 'Starters',
    items: [
      { name: 'Goat meat pepper soup' },
      { name: 'Assorted pepper soup' },
    ],
  },
  {
    title: 'Cold & Salad',
    items: [
      { name: 'Caesar salad' },
      { name: 'Mexican salad' },
      { name: 'Coleslaw salad' },
      { name: 'Potato salad' },
      { name: 'Bread basket' },
      { name: 'Croutons' },
      { name: 'Assorted salad dressings and butter' },
    ],
  },
  {
    title: 'Mains',
    items: [
      { name: 'Roast chicken', note: 'Yaji and peanut sauce' },
      { name: 'Grilled fish peri peri' },
    ],
  },
  {
    title: 'Sides',
    items: [
      { name: 'Mixed jambalaya rice', note: 'Topped with shrimps' },
      { name: 'Party jollof rice with peas' },
      { name: 'Pasta marina', note: 'With meatballs and herbs' },
      { name: 'Steamed seasonal vegetable' },
      { name: 'Smoky coconut rice', note: 'With plantain crisps' },
    ],
  },
  {
    title: 'Native',
    items: [
      { name: 'Goat meat Afang soup' },
      { name: 'Beef Ogbono soup' },
      { name: 'Poundo & wheat' },
    ],
  },
  {
    title: 'Desserts',
    items: [
      { name: 'Assorted mini pastries & fruit platter' },
    ],
  },
];

/** Surfaced to admins, not to guests. */
export const MENU_NOTES: string[] = [
  'Source PDF wraps "Party" onto the jambalaya line; read as "Party jollof rice with peas".',
  'Source PDF wraps "Beef" onto the Afang line; read as "Beef Ogbono soup".',
  '"Pasta marina" is the source spelling — likely "marinara", left uncorrected.',
  'Salad items sharing one comma-separated line in the source are listed separately here; wording unchanged.',
];

