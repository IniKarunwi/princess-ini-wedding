/**
 * Verified wedding content for the public site.
 *
 * ── Why this is not imported from scripts/email/config.mjs ─────────────────
 * That file is the source of truth for the wedding, and it would be tempting
 * to import it here. It must not be: it also exports BANK_ACCOUNTS, and
 * anything imported into a Vite entry point ends up in the JavaScript bundle
 * that every guest downloads. Account numbers do not belong on a public web
 * page that is not asking for a gift.
 *
 * So this is a curated subset, hand-copied, with nothing sensitive in it. The
 * values below are taken verbatim from the email config and the printed guest
 * guide — both already delivered to guests — so the website cannot contradict
 * what people are holding in their hands.
 *
 * NOTHING HERE IS INVENTED. Where content does not exist yet (the service
 * programme) there is no placeholder prose — the
 * page says plainly that it is coming.
 */

export const WEDDING = {
  bride: 'Princess',
  groom: 'IniOluwa',
  couple: 'Princess & IniOluwa',
  dateLong: 'Saturday, 26 September 2026',
  dateNumeric: '26 · 09 · 26',
  city: 'Abuja, Nigeria',
  venueName: 'Signature by Wells Carlton',
  venueArea: 'Asokoro, Abuja',
  theme: 'Eden in Full Bloom',
} as const;

/** The same Google Maps search the email and the printed guide use. */
export const MAP_URL =
  'https://www.google.com/maps/search/?api=1&query=' +
  encodeURIComponent(`${WEDDING.venueName}, ${WEDDING.venueArea}, Nigeria`);

/**
 * The three parts of the day.
 *
 * Times and names match scripts/email/events.mjs exactly. A guest who reads
 * "Wedding Service" in their email must not find "Ceremony" here.
 */
export const PROGRAMME = [
  { time: '12:00', meridiem: 'PM', name: 'Wedding Service', note: 'The service, where we say our vows.' },
  { time: '2:00',  meridiem: 'PM', name: 'Reception',       note: 'Lunch, speeches and celebration.' },
  { time: '6:00',  meridiem: 'PM', name: 'After Party',     note: 'Dancing, into the night.' },
] as const;

/**
 * The welcome.
 *
 * Lifted from the printed guest guide, which the couple approved and which
 * went out with the invitations. Not rewritten, and deliberately not extended
 * into a longer story — this is their voice, not a generated one.
 */
export const WELCOME = [
  'We are overjoyed to welcome you into the most significant chapter of our love story. As we stand at the threshold of forever, we want you — our cherished family and friends — by our side as we say I do.',
  'Our celebration is inspired by the beauty of Eden — a lush, flourishing garden where vibrant blooms, rich foliage and timeless elegance come together. We envision a day as alive and beautiful as the love we share.',
] as const;

/** From the printed guide. The one request the couple made of the ceremony. */
export const PHONE_FREE =
  'Kindly note that this will be a phone-free ceremony. All mobile devices will be respectfully set aside during the service, and our photographers will capture every precious moment on your behalf.';

/** Hotels, exactly as sent. Suggestions only — nothing is held or negotiated. */
export const STAY = {
  intro:
    'The wedding will be held at Signature by Wells Carlton in Asokoro, so staying in Asokoro will be the most convenient option. Garki, Maitama and the Central Area are also nearby alternatives.',
  caveat:
    'These are suggestions to help you plan — no rooms are held on your behalf, so do book directly and early.',
  bands: [
    {
      label: 'Premium',
      hotels: [
        ['The Wells Carlton', 'Asokoro'],
        ['Abuja Marriott', 'Asokoro'],
        ['Transcorp Hilton', 'Maitama'],
      ],
    },
    {
      label: 'Mid-range',
      hotels: [
        ['Fraser Suites', 'Asokoro'],
        ['Hilton Garden Inn', 'Maitama'],
        ['Westwood Hotel', 'Maitama'],
        ['The Domus Hotel', 'Central Area'],
      ],
    },
    {
      label: 'More affordable',
      hotels: [
        ['Sweetroof', 'Asokoro'],
        ['Musada Luxury Suites', 'Maitama'],
        ['Hotel Rosebud', 'Garki'],
        ['Elomaz Hotels', 'Garki Area 11'],
      ],
    },
  ],
  farther: {
    name: "D'Crown Place — Hotel & Suites",
    area: 'Idu',
    note: 'Another option if you do not mind staying farther from the venue and having a longer drive to Asokoro.',
  },
} as const;

/** A Maps search for one hotel. Never an invented booking link. */
export const hotelMapUrl = (name: string, area: string) =>
  'https://maps.google.com/?q=' +
  encodeURIComponent(`${name}, ${area}, Abuja, Nigeria`).replace(/'/g, '%27');

/**
 * Dress code, from the printed guide.
 *
 * The swatch hexes are the ones drawn in the guide's colour-palette page, so
 * the circles on screen match the circles guests were posted.
 */
export const DRESS = {
  title: 'Eden in Full Bloom',
  intro:
    'Our celebration is inspired by the beauty of a flourishing garden — where vibrant blooms, rich foliage and timeless elegance come together in perfect harmony.',
  invitation: 'We invite you to wear colours you would find in a garden.',
  swatches: [
    ['#1b4332', 'Emerald'],
    ['#2d6a4f', 'Garden Green'],
    ['#52b788', 'Leaf'],
    ['#95c9a5', 'Sage'],
    ['#c9e4d0', 'Morning Mist'],
    ['#f6f1e4', 'Ivory'],
    ['#e3cf9a', 'Champagne'],
    ['#e8b7a6', 'Garden Blush'],
    ['#7b5236', 'Terracotta'],
  ],
} as const;

/** Where the navigation can go. Seating chart is built by another workstream. */
export const ROUTES = {
  home: '/',
  programme: '/program',
  menu: '/menu',
  seating: '/seating-chart',
} as const;
