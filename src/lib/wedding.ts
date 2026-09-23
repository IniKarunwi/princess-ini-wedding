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
 * ── Corrected against public/email/dress-guide.jpg ─────────────────────────
 * This previously held nine greens and neutrals — Garden Green, Morning Mist,
 * Champagne, Terracotta — which were not the wedding's palette at all. The
 * real guide, the one guests were posted and the one already deployed at
 * /email/dress-guide.jpg, is a garden palette in the literal sense: magenta,
 * coral, burnt orange, yellow, sky blue, lavender, and three greens.
 *
 * The hexes below were sampled from that file rather than eyeballed — the
 * median of the centre of each printed circle, so an antialiased rim cannot
 * shift them.
 */
export const DRESS = {
  title: 'Eden in Full Bloom',
  intro:
    'Our celebration is inspired by the beauty of a flourishing garden — where vibrant blooms, rich foliage and timeless elegance come together in perfect harmony.',
  invitation: 'We invite you to wear colours you’d find in a garden.',
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
   * The two halves of the printed guide, transcribed. Not summarised — a
   * guest deciding what to wear on Friday night needs the actual list, and
   * "smart garden formal" is not an instruction anyone can act on.
   */
  gentlemen: {
    heading: 'For the Gentlemen',
    label: 'English Formal',
    notes: [
      'Black tie or formal tuxedos are preferred.',
      'Tailored dark or neutral suits are also welcome.',
      'Crisp dress shirts, polished shoes and elegant accessories are encouraged.',
      'Kindly refrain from wearing traditional/native attire.',
    ],
    close: 'Timeless sophistication is the desired look.',
  },
  ladies: {
    heading: 'For the Ladies',
    label: 'Royal Garden Elegance',
    notes: [
      'Floor-length gowns or elegant cocktail and midi dresses are welcome.',
      'Luxurious fabrics such as silk, satin, chiffon, organza, lace or crepe are encouraged.',
      'Fascinators, statement hats or refined headpieces are warmly welcomed.',
      'Finish your look with elegant heels, delicate jewellery and classic accessories.',
    ],
    close: 'Think polished, feminine and effortlessly elegant.',
  },
} as const;

/** Where the navigation can go. Seating chart is built by another workstream. */
export const ROUTES = {
  home: '/',
  programme: '/program',
  menu: '/menu',
  seating: '/seating-chart',
} as const;
