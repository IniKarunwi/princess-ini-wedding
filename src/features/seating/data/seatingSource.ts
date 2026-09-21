/**
 * The seating plan, exactly as supplied.
 *
 * ── Generated, not typed ───────────────────────────────────────────────────
 * Produced from the seating document by scripts/seating/extract.py. 219 rows
 * copied by hand would be 219 chances to misspell a guest's name and no way to
 * catch it. Regenerate rather than edit by hand when a new document arrives.
 *
 * ── An entry is not a person ───────────────────────────────────────────────
 * The document is full of combined rows — "Pastor Wale Adeniyi + Mrs Remi
 * Adeniyi - 2 seats", "OCC Worship + 3 - 4 seats", "1 unnamed guest(s) of
 * Shammah Karunwi". The brief is explicit that these are preserved as given
 * and not split or reinterpreted, so an entry carries a `seats` count and
 * every capacity figure in this feature is measured in SEATS, never in rows.
 *
 * ── Provenance of `seats` ──────────────────────────────────────────────────
 *   'stated'   the document said "- N seats" outright
 *   'single'   an ordinary one-person row
 *   'inferred' the row named several people with no count, AND the table's
 *              arithmetic closed exactly when they were counted — recorded
 *              here so the inference is visible rather than silent
 *
 * Rows flagged `ambiguous` name more than one person but sit in a table that
 * already balances at one seat. They are NOT split. See SOURCE_FLAGS.
 */

export type SeatProvenance = 'stated' | 'single' | 'inferred';

export interface SourceEntry {
  /** Stable id: side-table-index. Survives renames and reseating. */
  id: string;
  /** The name as printed, minus any "- N seats" suffix. Editable by admins. */
  name: string;
  /** Seats consumed. Not necessarily 1. */
  seats: number;
  provenance: SeatProvenance;
  /** Names several people but was left at one seat — needs a human ruling. */
  ambiguous?: boolean;
  /** The untouched source row, kept so nothing is ever lost. */
  raw: string;
}

export interface SourceTable {
  id: string;
  side: 'bride' | 'groom';
  kind: 'round' | 'vip';
  /** 0 for the VIP tables, which the document numbers separately. */
  number: number;
  /** e.g. "Bridesmaid", "OCC table". May be empty. */
  title: string;
  /** The caption under the heading, e.g. "Family (3) · Friend (7)". */
  group: string;
  capacity: number;
  entries: SourceEntry[];
}

/** A note printed on the document itself. Shown to admins, not to guests. */
export const SOURCE_NOTE =
  'Working chart — Pastor Femi + guest, Stephanie Itimi and Engr Titus Illori excluded; no-event entries held; both sides provisional.';

export const SOURCE_TABLES: SourceTable[] = [
  {
    id: 'bride-vip', side: 'bride', kind: 'vip',
    number: 0, title: 'VIP Table', group: 'VIP (15)',
    capacity: 15,
    entries: [
      { id: 'bride-vip-00', name: 'Suzanne Sado (Mother)', seats: 1, provenance: 'single', raw: 'Suzanne Sado (Mother)' },
      { id: 'bride-vip-01', name: 'Olori Atuwatse III', seats: 1, provenance: 'single', raw: 'Olori Atuwatse III' },
      { id: 'bride-vip-02', name: 'Omowumi Etiko', seats: 1, provenance: 'single', raw: 'Omowumi Etiko' },
      { id: 'bride-vip-03', name: 'Olatunde Etiko', seats: 1, provenance: 'single', raw: 'Olatunde Etiko' },
      { id: 'bride-vip-04', name: 'Esther Akinduro', seats: 1, provenance: 'single', raw: 'Esther Akinduro' },
      { id: 'bride-vip-05', name: 'Pastor Chingtok Ishaku', seats: 1, provenance: 'single', raw: 'Pastor Chingtok Ishaku' },
      { id: 'bride-vip-06', name: 'Pastor Sarah Ishaku', seats: 1, provenance: 'single', raw: 'Pastor Sarah Ishaku' },
      { id: 'bride-vip-07', name: 'Sherri Lewis', seats: 1, provenance: 'single', raw: 'Sherri Lewis' },
      { id: 'bride-vip-08', name: 'Kemi Fred Adetiba', seats: 1, provenance: 'single', raw: 'Kemi Fred Adetiba' },
      { id: 'bride-vip-09', name: 'Jon Ode', seats: 1, provenance: 'single', raw: 'Jon Ode' },
      { id: 'bride-vip-10', name: 'Bessie Nchenge', seats: 1, provenance: 'single', raw: 'Bessie Nchenge' },
      { id: 'bride-vip-11', name: 'Dr Gideon Adogbo', seats: 1, provenance: 'single', raw: 'Dr Gideon Adogbo' },
      { id: 'bride-vip-12', name: 'Mrs Helen Garpiya', seats: 1, provenance: 'single', raw: 'Mrs Helen Garpiya' },
      { id: 'bride-vip-13', name: 'Bunmi George', seats: 1, provenance: 'single', raw: 'Bunmi George' },
      { id: 'bride-vip-14', name: 'Ofonime Umoh', seats: 1, provenance: 'single', raw: 'Ofonime Umoh' },
    ],
  },
  {
    id: 'bride-01', side: 'bride', kind: 'round',
    number: 1, title: 'Bridesmaid', group: 'Bridesmaid (10)',
    capacity: 10,
    entries: [
      { id: 'bride-01-00', name: 'Itohan Anna Eworo', seats: 1, provenance: 'single', raw: 'Itohan Anna Eworo' },
      { id: 'bride-01-01', name: 'Zoe Chingtok', seats: 1, provenance: 'single', raw: 'Zoe Chingtok' },
      { id: 'bride-01-02', name: 'Favour Etukudo', seats: 1, provenance: 'single', raw: 'Favour Etukudo' },
      { id: 'bride-01-03', name: 'Adesuwa Eworo', seats: 1, provenance: 'single', raw: 'Adesuwa Eworo' },
      { id: 'bride-01-04', name: 'Gbemileke (BRIDESMAID)', seats: 1, provenance: 'single', raw: 'Gbemileke (BRIDESMAID)' },
      { id: 'bride-01-05', name: 'Mimi Okigbo (BRIDESMAID)', seats: 1, provenance: 'single', raw: 'Mimi Okigbo (BRIDESMAID)' },
      { id: 'bride-01-06', name: 'Ellie Scotte (BRIDESMAID)', seats: 1, provenance: 'single', raw: 'Ellie Scotte (BRIDESMAID)' },
      { id: 'bride-01-07', name: 'Ayanfe Emmanuel (BRIDESMAID)', seats: 1, provenance: 'single', raw: 'Ayanfe Emmanuel (BRIDESMAID)' },
      { id: 'bride-01-08', name: 'Chiazotam (BRIDESMAID)', seats: 1, provenance: 'single', raw: 'Chiazotam (BRIDESMAID)' },
      { id: 'bride-01-09', name: 'Inimfon Umoh (BRIDESMAID)', seats: 1, provenance: 'single', raw: 'Inimfon Umoh (BRIDESMAID)' },
    ],
  },
  {
    id: 'bride-02', side: 'bride', kind: 'round',
    number: 2, title: 'Immediate family', group: 'Family (10)',
    capacity: 10,
    entries: [
      { id: 'bride-02-00', name: 'Patrick Sado', seats: 1, provenance: 'single', raw: 'Patrick Sado' },
      { id: 'bride-02-01', name: 'Gail Sado', seats: 1, provenance: 'single', raw: 'Gail Sado' },
      { id: 'bride-02-02', name: 'Jaiyz Sado', seats: 1, provenance: 'single', raw: 'Jaiyz Sado' },
      { id: 'bride-02-03', name: 'Aunty Julie', seats: 1, provenance: 'single', raw: 'Aunty Julie' },
      { id: 'bride-02-04', name: 'Aunty Tamara', seats: 1, provenance: 'single', raw: 'Aunty Tamara' },
      { id: 'bride-02-05', name: 'Uncle Chinedu', seats: 1, provenance: 'single', raw: 'Uncle Chinedu' },
      { id: 'bride-02-06', name: 'Uncle Frank', seats: 1, provenance: 'single', raw: 'Uncle Frank' },
      { id: 'bride-02-07', name: 'Aunty IK', seats: 1, provenance: 'single', raw: 'Aunty IK' },
      { id: 'bride-02-08', name: 'Mrs Rose Kay', seats: 1, provenance: 'single', raw: 'Mrs Rose Kay' },
      { id: 'bride-02-09', name: 'Ojonugwa Zakari', seats: 1, provenance: 'single', raw: 'Ojonugwa Zakari' },
    ],
  },
  {
    id: 'bride-03', side: 'bride', kind: 'round',
    number: 3, title: '', group: 'Kids Table',
    capacity: 10,
    entries: [
      { id: 'bride-03-00', name: 'Tsemaiye Emiko (kids)', seats: 1, provenance: 'single', raw: 'Tsemaiye Emiko (kids)' },
      { id: 'bride-03-01', name: 'Temisan Emiko (kids)', seats: 1, provenance: 'single', raw: 'Temisan Emiko (kids)' },
      { id: 'bride-03-02', name: 'Timeyin Emiko (kids)', seats: 1, provenance: 'single', raw: 'Timeyin Emiko (kids)' },
      { id: 'bride-03-03', name: 'Juvi (nanny)', seats: 1, provenance: 'single', raw: 'Juvi (nanny)' },
      { id: 'bride-03-04', name: 'Nene (nanny)', seats: 1, provenance: 'single', raw: 'Nene (nanny)' },
      { id: 'bride-03-05', name: 'Mayet (nanny)', seats: 1, provenance: 'single', raw: 'Mayet (nanny)' },
      { id: 'bride-03-06', name: 'Philo (nanny)', seats: 1, provenance: 'single', raw: 'Philo (nanny)' },
      { id: 'bride-03-07', name: 'Ore Etiko (kids)', seats: 1, provenance: 'single', raw: 'Ore Etiko (kids)' },
      { id: 'bride-03-08', name: 'Tore Etiko (kids)', seats: 1, provenance: 'single', raw: 'Tore Etiko (kids)' },
      { id: 'bride-03-09', name: 'Seun (nanny)', seats: 1, provenance: 'single', raw: 'Seun (nanny)' },
    ],
  },
  {
    id: 'bride-04', side: 'bride', kind: 'round',
    number: 4, title: '', group: 'Minstrel (6) · Pastor (4)',
    capacity: 10,
    entries: [
      { id: 'bride-04-00', name: 'Dr. Jennifer Sarki', seats: 1, provenance: 'single', raw: 'Dr. Jennifer Sarki' },
      { id: 'bride-04-01', name: 'Pastor Daniel Sarki', seats: 1, provenance: 'single', raw: 'Pastor Daniel Sarki' },
      { id: 'bride-04-02', name: 'Evan Olajide', seats: 1, provenance: 'single', raw: 'Evan Olajide' },
      { id: 'bride-04-03', name: 'Grace Omosebi', seats: 1, provenance: 'single', raw: 'Grace Omosebi' },
      { id: 'bride-04-04', name: 'Minister David Nkennor', seats: 1, provenance: 'single', raw: 'Minister David Nkennor' },
      { id: 'bride-04-05', name: 'The Peter Jacobs', seats: 1, provenance: 'single', raw: 'The Peter Jacobs' },
      { id: 'bride-04-06', name: 'David Okao', seats: 1, provenance: 'single', raw: 'David Okao' },
      { id: 'bride-04-07', name: 'Minister Tee', seats: 1, provenance: 'single', raw: 'Minister Tee' },
      { id: 'bride-04-08', name: 'Pastor Toyosi', seats: 1, provenance: 'single', raw: 'Pastor Toyosi' },
      { id: 'bride-04-09', name: 'Ajibola Ojedokun', seats: 1, provenance: 'single', raw: 'Ajibola Ojedokun' },
    ],
  },
  {
    id: 'bride-05', side: 'bride', kind: 'round',
    number: 5, title: '', group: 'Elevate Africa (8) · Pastor (1)',
    capacity: 10,
    entries: [
      { id: 'bride-05-00', name: 'Caleb Faleti', seats: 1, provenance: 'single', raw: 'Caleb Faleti' },
      { id: 'bride-05-01', name: 'Bidemi Alao', seats: 1, provenance: 'single', raw: 'Bidemi Alao' },
      { id: 'bride-05-02', name: 'Joshua Esan', seats: 1, provenance: 'single', raw: 'Joshua Esan' },
      { id: 'bride-05-03', name: 'Blessing Collins Igrubia', seats: 1, provenance: 'single', raw: 'Blessing Collins Igrubia' },
      { id: 'bride-05-04', name: 'Joy Godwin', seats: 1, provenance: 'single', raw: 'Joy Godwin' },
      { id: 'bride-05-05', name: 'Aaliyah Ephraim', seats: 1, provenance: 'single', raw: 'Aaliyah Ephraim' },
      { id: 'bride-05-06', name: 'Freida Egbuna', seats: 1, provenance: 'single', raw: 'Freida Egbuna' },
      { id: 'bride-05-07', name: 'Chinomso Momoh', seats: 1, provenance: 'single', raw: 'Chinomso Momoh' },
      { id: 'bride-05-08', name: 'Ejura Okpanachi', seats: 1, provenance: 'single', raw: 'Ejura Okpanachi' },
      { id: 'bride-05-09', name: 'Enoch', seats: 1, provenance: 'single', raw: 'Enoch' },
    ],
  },
  {
    id: 'bride-06', side: 'bride', kind: 'round',
    number: 6, title: '', group: 'Family (8) · Bride\'s sister\'s (1)',
    capacity: 10,
    entries: [
      { id: 'bride-06-00', name: 'Ebuka', seats: 1, provenance: 'single', raw: 'Ebuka' },
      { id: 'bride-06-01', name: 'Onyekachi', seats: 1, provenance: 'single', raw: 'Onyekachi' },
      { id: 'bride-06-02', name: 'Chibueze', seats: 1, provenance: 'single', raw: 'Chibueze' },
      { id: 'bride-06-03', name: 'Sam Ode', seats: 1, provenance: 'single', raw: 'Sam Ode' },
      { id: 'bride-06-04', name: 'Oche Sam Ode', seats: 1, provenance: 'single', raw: 'Oche Sam Ode' },
      { id: 'bride-06-05', name: 'Halley Edward', seats: 1, provenance: 'single', raw: 'Halley Edward' },
      { id: 'bride-06-06', name: 'Aondona Adem', seats: 1, provenance: 'single', raw: 'Aondona Adem' },
      { id: 'bride-06-07', name: 'Uyiosa Ebuehi', seats: 1, provenance: 'single', raw: 'Uyiosa Ebuehi' },
      { id: 'bride-06-08', name: 'Victoria Ebuehi', seats: 1, provenance: 'single', raw: 'Victoria Ebuehi' },
      { id: 'bride-06-09', name: 'Michelle Ode', seats: 1, provenance: 'single', raw: 'Michelle Ode' },
    ],
  },
  {
    id: 'bride-07', side: 'bride', kind: 'round',
    number: 7, title: '', group: 'Bride\'s Friends (7) · Family (2)',
    capacity: 10,
    entries: [
      { id: 'bride-07-00', name: 'Etieno Umoh', seats: 1, provenance: 'single', raw: 'Etieno Umoh' },
      { id: 'bride-07-01', name: 'Ekomobong Umoh', seats: 1, provenance: 'single', raw: 'Ekomobong Umoh' },
      { id: 'bride-07-02', name: 'Ukeme Umoh', seats: 1, provenance: 'single', raw: 'Ukeme Umoh' },
      { id: 'bride-07-03', name: 'Taiwo Adeyemi', seats: 1, provenance: 'single', raw: 'Taiwo Adeyemi' },
      { id: 'bride-07-04', name: 'Dada Temitope', seats: 1, provenance: 'single', raw: 'Dada Temitope' },
      { id: 'bride-07-05', name: 'Excel Joab', seats: 1, provenance: 'single', raw: 'Excel Joab' },
      { id: 'bride-07-06', name: 'Abadi Emmanuel', seats: 1, provenance: 'single', raw: 'Abadi Emmanuel' },
      { id: 'bride-07-07', name: 'Ibquake', seats: 1, provenance: 'single', raw: 'Ibquake' },
      { id: 'bride-07-08', name: 'Kelechi Ayinkude', seats: 1, provenance: 'single', raw: 'Kelechi Ayinkude' },
      { id: 'bride-07-09', name: 'Dr Foy', seats: 1, provenance: 'single', raw: 'Dr Foy' },
    ],
  },
  {
    id: 'bride-08', side: 'bride', kind: 'round',
    number: 8, title: '', group: 'Elevate Africa (10)',
    capacity: 10,
    entries: [
      { id: 'bride-08-00', name: 'Paul Oladipupo', seats: 1, provenance: 'single', raw: 'Paul Oladipupo' },
      { id: 'bride-08-01', name: 'Chinaza', seats: 1, provenance: 'single', raw: 'Chinaza' },
      { id: 'bride-08-02', name: 'Deborah Courage-Ode', seats: 1, provenance: 'single', raw: 'Deborah Courage-Ode' },
      { id: 'bride-08-03', name: 'Ronald Mmeka', seats: 1, provenance: 'single', raw: 'Ronald Mmeka' },
      { id: 'bride-08-04', name: 'Gold Mmeka', seats: 1, provenance: 'single', raw: 'Gold Mmeka' },
      { id: 'bride-08-05', name: 'Joshua Eze', seats: 1, provenance: 'single', raw: 'Joshua Eze' },
      { id: 'bride-08-06', name: 'Omasan Omatseye', seats: 1, provenance: 'single', raw: 'Omasan Omatseye' },
      { id: 'bride-08-07', name: 'Seun Taiwo', seats: 1, provenance: 'single', raw: 'Seun Taiwo' },
      { id: 'bride-08-08', name: 'Oge Ezeobiorah', seats: 1, provenance: 'single', raw: 'Oge Ezeobiorah' },
      { id: 'bride-08-09', name: 'Jessica Lot', seats: 1, provenance: 'single', raw: 'Jessica Lot' },
    ],
  },
  {
    id: 'bride-09', side: 'bride', kind: 'round',
    number: 9, title: '', group: 'Petra (8) · Friend (2)',
    capacity: 10,
    entries: [
      { id: 'bride-09-00', name: 'David-Joshua Oshafi', seats: 1, provenance: 'single', raw: 'David-Joshua Oshafi' },
      { id: 'bride-09-01', name: 'Jessica Francis', seats: 1, provenance: 'single', raw: 'Jessica Francis' },
      { id: 'bride-09-02', name: 'Kukorimam Markus', seats: 1, provenance: 'single', raw: 'Kukorimam Markus' },
      { id: 'bride-09-03', name: 'Kingsley Inyang', seats: 1, provenance: 'single', raw: 'Kingsley Inyang' },
      { id: 'bride-09-04', name: 'Sarah Akinwale', seats: 1, provenance: 'single', raw: 'Sarah Akinwale' },
      { id: 'bride-09-05', name: 'Hosanna Markus', seats: 1, provenance: 'single', raw: 'Hosanna Markus' },
      { id: 'bride-09-06', name: 'Ella OKOH', seats: 1, provenance: 'single', raw: 'Ella OKOH' },
      { id: 'bride-09-07', name: 'Emediong Uko', seats: 1, provenance: 'single', raw: 'Emediong Uko' },
      { id: 'bride-09-08', name: 'Amaka Ossy', seats: 1, provenance: 'single', raw: 'Amaka Ossy' },
      { id: 'bride-09-09', name: 'Favour Charles', seats: 1, provenance: 'single', raw: 'Favour Charles' },
    ],
  },
  {
    id: 'bride-10', side: 'bride', kind: 'round',
    number: 10, title: '', group: 'Friend (10)',
    capacity: 10,
    entries: [
      { id: 'bride-10-00', name: 'Kelechi Chukwueke Aber', seats: 1, provenance: 'single', raw: 'Kelechi Chukwueke Aber' },
      { id: 'bride-10-01', name: 'Demesugh Aber', seats: 1, provenance: 'single', raw: 'Demesugh Aber' },
      { id: 'bride-10-02', name: 'Maimuna Bala Shehu', seats: 1, provenance: 'single', raw: 'Maimuna Bala Shehu' },
      { id: 'bride-10-03', name: 'Oluwatoni Akinola', seats: 1, provenance: 'single', raw: 'Oluwatoni Akinola' },
      { id: 'bride-10-04', name: 'Roseline Obasun', seats: 1, provenance: 'single', raw: 'Roseline Obasun' },
      { id: 'bride-10-05', name: 'Pelumi Obanure', seats: 1, provenance: 'single', raw: 'Pelumi Obanure' },
      { id: 'bride-10-06', name: 'Toluwanimi Adesiya', seats: 1, provenance: 'single', raw: 'Toluwanimi Adesiya' },
      { id: 'bride-10-07', name: 'Ijeoma Nweke', seats: 1, provenance: 'single', raw: 'Ijeoma Nweke' },
      { id: 'bride-10-08', name: 'Nweke Chinelo', seats: 1, provenance: 'single', raw: 'Nweke Chinelo' },
      { id: 'bride-10-09', name: 'Shammah Oluwole', seats: 1, provenance: 'single', raw: 'Shammah Oluwole' },
    ],
  },
  {
    id: 'bride-11', side: 'bride', kind: 'round',
    number: 11, title: '', group: 'Brides Sisters (10)',
    capacity: 10,
    entries: [
      { id: 'bride-11-00', name: 'Vanessa Sado', seats: 1, provenance: 'single', raw: 'Vanessa Sado' },
      { id: 'bride-11-01', name: 'Jennifer Sado', seats: 1, provenance: 'single', raw: 'Jennifer Sado' },
      { id: 'bride-11-02', name: 'Awele', seats: 1, provenance: 'single', raw: 'Awele' },
      { id: 'bride-11-03', name: 'Anita Amicable', seats: 1, provenance: 'single', raw: 'Anita Amicable' },
      { id: 'bride-11-04', name: 'Ayang Sylvia', seats: 1, provenance: 'single', raw: 'Ayang Sylvia' },
      { id: 'bride-11-05', name: 'Ayang Philippa + Hope Johnson', seats: 1, provenance: 'single', ambiguous: true, raw: 'Ayang Philippa + Hope Johnson' },
      { id: 'bride-11-06', name: 'Ayang Julius', seats: 1, provenance: 'single', raw: 'Ayang Julius' },
      { id: 'bride-11-07', name: 'Ishaya Bassi', seats: 1, provenance: 'single', raw: 'Ishaya Bassi' },
      { id: 'bride-11-08', name: 'Rashida T. Baba', seats: 1, provenance: 'single', raw: 'Rashida T. Baba' },
      { id: 'bride-11-09', name: 'Sarah Cosmas', seats: 1, provenance: 'single', raw: 'Sarah Cosmas' },
    ],
  },
  {
    id: 'groom-vip', side: 'groom', kind: 'vip',
    number: 0, title: 'VIP Table', group: 'VIP (15)',
    capacity: 15,
    entries: [
      { id: 'groom-vip-00', name: 'Olakunle Karunwi (Father)', seats: 1, provenance: 'single', raw: 'Olakunle Karunwi (Father)' },
      { id: 'groom-vip-01', name: 'Oluwatoyin Karunwi (Mother)', seats: 1, provenance: 'single', raw: 'Oluwatoyin Karunwi (Mother)' },
      { id: 'groom-vip-02', name: 'Mrs Titilayo Ajoke Karunwi', seats: 1, provenance: 'single', raw: 'Mrs Titilayo Ajoke Karunwi' },
      { id: 'groom-vip-03', name: 'Pastor Wale Adeniyi + Mrs Remi Adeniyi', seats: 2, provenance: 'stated', raw: 'Pastor Wale Adeniyi + Mrs Remi Adeniyi - 2 seats' },
      { id: 'groom-vip-04', name: 'Pastor Bayo Akinduko', seats: 1, provenance: 'single', raw: 'Pastor Bayo Akinduko' },
      { id: 'groom-vip-05', name: 'Professor J.J ATUNGWU', seats: 1, provenance: 'single', raw: 'Professor J.J ATUNGWU' },
      { id: 'groom-vip-06', name: 'Prince Olukayode Akande and Mr Randle', seats: 2, provenance: 'stated', raw: 'Prince Olukayode Akande and Mr Randle - 2 seats' },
      { id: 'groom-vip-07', name: 'Pastor Jesse Dan-Yusuf + Eva Dan-Yusuf', seats: 2, provenance: 'stated', raw: 'Pastor Jesse Dan-Yusuf + Eva Dan-Yusuf - 2 seats' },
      { id: 'groom-vip-08', name: 'BigH', seats: 1, provenance: 'single', raw: 'BigH' },
      { id: 'groom-vip-09', name: 'Temitope Oluleye', seats: 1, provenance: 'single', raw: 'Temitope Oluleye' },
      { id: 'groom-vip-10', name: 'Pastor Kachi Zimughan and Pastor Joseph Zimughan', seats: 2, provenance: 'stated', raw: 'Pastor Kachi Zimughan and Pastor Joseph Zimughan - 2 seats' },
    ],
  },
  {
    id: 'groom-01', side: 'groom', kind: 'round',
    number: 1, title: 'Groomsmen', group: 'Groomsmen (10)',
    capacity: 10,
    entries: [
      { id: 'groom-01-00', name: 'Michael Coker + Nicole Coker', seats: 2, provenance: 'stated', raw: 'Michael Coker + Nicole Coker - 2 seats' },
      { id: 'groom-01-01', name: 'Jacob James Namah + Victory-Usoro Namah', seats: 2, provenance: 'stated', raw: 'Jacob James Namah + Victory-Usoro Namah - 2 seats' },
      { id: 'groom-01-02', name: 'Adekola Emmanuel', seats: 1, provenance: 'single', raw: 'Adekola Emmanuel' },
      { id: 'groom-01-03', name: 'Tajudeen O Musa', seats: 1, provenance: 'single', raw: 'Tajudeen O Musa' },
      { id: 'groom-01-04', name: 'Kelvin Ekoro', seats: 1, provenance: 'single', raw: 'Kelvin Ekoro' },
      { id: 'groom-01-05', name: 'Ayo Joshua Alfonso', seats: 1, provenance: 'single', raw: 'Ayo Joshua Alfonso' },
      { id: 'groom-01-06', name: 'Davies Emmanuel + Osatohamwen', seats: 2, provenance: 'stated', raw: 'Davies Emmanuel + Osatohamwen - 2 seats' },
    ],
  },
  {
    id: 'groom-02', side: 'groom', kind: 'round',
    number: 2, title: 'Family & guests', group: 'Family (3) · Friend (7)',
    capacity: 10,
    entries: [
      { id: 'groom-02-00', name: 'Shammah Karunwi (Brother)', seats: 1, provenance: 'single', raw: 'Shammah Karunwi (Brother)' },
      { id: 'groom-02-01', name: 'Shalom Karunwi (Brother)', seats: 1, provenance: 'single', raw: 'Shalom Karunwi (Brother)' },
      { id: 'groom-02-02', name: 'Fifunmi Karunwi (Sister)', seats: 1, provenance: 'single', raw: 'Fifunmi Karunwi (Sister)' },
      { id: 'groom-02-03', name: 'Aseweje Busayo', seats: 1, provenance: 'single', raw: 'Aseweje Busayo' },
      { id: 'groom-02-04', name: 'Adeshina Omodolapo', seats: 1, provenance: 'single', raw: 'Adeshina Omodolapo' },
      { id: 'groom-02-05', name: 'Oladejo Omotayo', seats: 1, provenance: 'single', raw: 'Oladejo Omotayo' },
      { id: 'groom-02-06', name: 'Oladejo Omobola', seats: 1, provenance: 'single', raw: 'Oladejo Omobola' },
      { id: 'groom-02-07', name: 'Oluwaseyitan Victor OKE', seats: 1, provenance: 'single', raw: 'Oluwaseyitan Victor OKE' },
      { id: 'groom-02-08', name: '1 unnamed guest(s) of Shammah Karunwi', seats: 1, provenance: 'single', raw: '1 unnamed guest(s) of Shammah Karunwi' },
      { id: 'groom-02-09', name: '1 unnamed guest(s) of Oluwatoyin Karunwi', seats: 1, provenance: 'single', raw: '1 unnamed guest(s) of Oluwatoyin Karunwi' },
    ],
  },
  {
    id: 'groom-03', side: 'groom', kind: 'round',
    number: 3, title: 'Oladejo guests', group: 'Uncle Niyi (9)',
    capacity: 10,
    entries: [
      { id: 'groom-03-00', name: 'Adijat oladejo', seats: 1, provenance: 'single', raw: 'Adijat oladejo' },
      { id: 'groom-03-01', name: 'Ayodeji Iwakun', seats: 1, provenance: 'single', raw: 'Ayodeji Iwakun' },
      { id: 'groom-03-02', name: 'Baba Adeyefa', seats: 1, provenance: 'single', raw: 'Baba Adeyefa' },
      { id: 'groom-03-03', name: 'Adeshina Adedeji', seats: 1, provenance: 'single', raw: 'Adeshina Adedeji' },
      { id: 'groom-03-04', name: 'Olakunle Popoola', seats: 1, provenance: 'single', raw: 'Olakunle Popoola' },
      { id: 'groom-03-05', name: 'Tunde Adeleke', seats: 1, provenance: 'single', raw: 'Tunde Adeleke' },
      { id: 'groom-03-06', name: 'Yomi Ayegbusi', seats: 1, provenance: 'single', raw: 'Yomi Ayegbusi' },
      { id: 'groom-03-07', name: 'Oladejo Olaniyi (Uncle)', seats: 1, provenance: 'single', raw: 'Oladejo Olaniyi (Uncle)' },
      { id: 'groom-03-08', name: 'Oladejo Esther', seats: 1, provenance: 'single', raw: 'Oladejo Esther' },
      { id: 'groom-03-09', name: 'Popoola Oluwadare', seats: 1, provenance: 'single', raw: 'Popoola Oluwadare' },
    ],
  },
  {
    id: 'groom-04', side: 'groom', kind: 'round',
    number: 4, title: 'Family guests + IAR&T', group: 'Family (5) · IAR&T (2)',
    capacity: 10,
    entries: [
      { id: 'groom-04-00', name: 'Titilayo Ilesanmi', seats: 1, provenance: 'single', raw: 'Titilayo Ilesanmi' },
      { id: 'groom-04-01', name: 'Yewande Salawu', seats: 1, provenance: 'single', raw: 'Yewande Salawu' },
      { id: 'groom-04-02', name: 'Yemisi Oyekanmi', seats: 1, provenance: 'single', raw: 'Yemisi Oyekanmi' },
      { id: 'groom-04-03', name: 'Mrs Victoria Oluwatuyi', seats: 1, provenance: 'single', raw: 'Mrs Victoria Oluwatuyi' },
      { id: 'groom-04-04', name: 'Mrs Olufunsho Sola Olakitan', seats: 1, provenance: 'single', raw: 'Mrs Olufunsho Sola Olakitan' },
      { id: 'groom-04-05', name: 'Mr and Mrs Igbinosa', seats: 2, provenance: 'stated', raw: 'Mr and Mrs Igbinosa - 2 seats' },
      { id: 'groom-04-06', name: 'Ebun Akinrogunde', seats: 1, provenance: 'single', raw: 'Ebun Akinrogunde' },
      { id: 'groom-04-07', name: 'John Osho', seats: 1, provenance: 'single', raw: 'John Osho' },
    ],
  },
  {
    id: 'groom-05', side: 'groom', kind: 'round',
    number: 5, title: '', group: 'Friend (5) ` OCC (5)',
    capacity: 10,
    entries: [
      { id: 'groom-05-00', name: 'Francisca Ophemegbe', seats: 1, provenance: 'single', raw: 'Francisca Ophemegbe' },
      { id: 'groom-05-01', name: 'Kunle Fashola', seats: 1, provenance: 'single', raw: 'Kunle Fashola' },
      { id: 'groom-05-02', name: 'Fabian', seats: 1, provenance: 'single', raw: 'Fabian' },
      { id: 'groom-05-03', name: 'Yinka Seth', seats: 1, provenance: 'single', raw: 'Yinka Seth' },
      { id: 'groom-05-04', name: 'Abraham Atawodi', seats: 1, provenance: 'single', raw: 'Abraham Atawodi' },
      { id: 'groom-05-05', name: 'Halima Haruna Osimhi', seats: 1, provenance: 'single', raw: 'Halima Haruna Osimhi' },
      { id: 'groom-05-06', name: 'Lecoles +1', seats: 2, provenance: 'stated', raw: 'Lecoles +1 - 2 seats' },
      { id: 'groom-05-07', name: 'Imoh Ibok', seats: 1, provenance: 'single', raw: 'Imoh Ibok' },
      { id: 'groom-05-08', name: 'Inioluwa Valentine Musa', seats: 1, provenance: 'single', raw: 'Inioluwa Valentine Musa' },
    ],
  },
  {
    id: 'groom-06', side: 'groom', kind: 'round',
    number: 6, title: 'OCC table', group: 'OCC (10)',
    capacity: 10,
    entries: [
      { id: 'groom-06-00', name: 'Mrs Esther AJALA', seats: 1, provenance: 'single', raw: 'Mrs Esther AJALA' },
      { id: 'groom-06-01', name: 'Cynthia Ugorji', seats: 1, provenance: 'single', raw: 'Cynthia Ugorji' },
      { id: 'groom-06-02', name: 'Mathias Nwokoedia + Maade Victoria Nwokoedia', seats: 2, provenance: 'stated', raw: 'Mathias Nwokoedia + Maade Victoria Nwokoedia - 2 seats' },
      { id: 'groom-06-03', name: 'Kelechi Ejikeme + Emeka Onyemauwa', seats: 2, provenance: 'stated', raw: 'Kelechi Ejikeme + Emeka Onyemauwa - 2 seats' },
      { id: 'groom-06-04', name: 'Jemima Essien + Daniel Essien', seats: 2, provenance: 'stated', raw: 'Jemima Essien + Daniel Essien - 2 seats' },
      { id: 'groom-06-05', name: 'Theo Vakporaye + Jess Vakporaye', seats: 2, provenance: 'stated', raw: 'Theo Vakporaye + Jess Vakporaye - 2 seats' },
    ],
  },
  {
    id: 'groom-07', side: 'groom', kind: 'round',
    number: 7, title: '10 guests )', group: 'Friend (8) · Unspecified (1',
    capacity: 10,
    entries: [
      { id: 'groom-07-00', name: 'David Oyetunde', seats: 1, provenance: 'single', raw: 'David Oyetunde' },
      { id: 'groom-07-01', name: 'Gracemary Stephen + Claire Benson idoko + Benson idoko', seats: 3, provenance: 'stated', raw: 'Gracemary Stephen + Claire Benson idoko + Benson idoko - 3 seats' },
      { id: 'groom-07-02', name: 'Afa Ikparen', seats: 1, provenance: 'single', raw: 'Afa Ikparen' },
      { id: 'groom-07-03', name: 'Victor Inyang + Vanessa Inyang', seats: 2, provenance: 'stated', raw: 'Victor Inyang + Vanessa Inyang - 2 seats' },
      { id: 'groom-07-04', name: 'David Ogedegbe', seats: 1, provenance: 'single', raw: 'David Ogedegbe' },
      { id: 'groom-07-05', name: 'Deborah Ogedegbe', seats: 1, provenance: 'single', raw: 'Deborah Ogedegbe' },
      { id: 'groom-07-06', name: 'Chiemezie Ucheaga', seats: 1, provenance: 'single', raw: 'Chiemezie Ucheaga' },
    ],
  },
  {
    id: 'groom-08', side: 'groom', kind: 'round',
    number: 8, title: 'OCC table', group: 'OCC (10)',
    capacity: 10,
    entries: [
      { id: 'groom-08-00', name: 'Olisebuka John Kanma + Grace Kanma', seats: 2, provenance: 'stated', raw: 'Olisebuka John Kanma + Grace Kanma - 2 seats' },
      { id: 'groom-08-01', name: 'Olakunle oke + Lisa Oyintarela', seats: 2, provenance: 'stated', raw: 'Olakunle oke + Lisa Oyintarela - 2 seats' },
      { id: 'groom-08-02', name: 'Ruth Unde + Timmy Davies', seats: 2, provenance: 'stated', raw: 'Ruth Unde + Timmy Davies - 2 seats' },
      { id: 'groom-08-03', name: 'Alex patience + Alex Adeiza', seats: 2, provenance: 'stated', raw: 'Alex patience + Alex Adeiza - 2 seats' },
      { id: 'groom-08-04', name: 'Asuefai Opiah + Emmanuel Opiah', seats: 2, provenance: 'stated', raw: 'Asuefai Opiah + Emmanuel Opiah - 2 seats' },
    ],
  },
  {
    id: 'groom-09', side: 'groom', kind: 'round',
    number: 9, title: 'OCC table', group: 'OCC (8) · Friend (2)',
    capacity: 10,
    entries: [
      { id: 'groom-09-00', name: 'Andikan Umoh', seats: 1, provenance: 'single', raw: 'Andikan Umoh' },
      { id: 'groom-09-01', name: 'Chibuzor Nzei', seats: 1, provenance: 'single', raw: 'Chibuzor Nzei' },
      { id: 'groom-09-02', name: 'Nissi Rajan', seats: 1, provenance: 'single', raw: 'Nissi Rajan' },
      { id: 'groom-09-03', name: 'Iheoma Nzekwe', seats: 1, provenance: 'single', raw: 'Iheoma Nzekwe' },
      { id: 'groom-09-04', name: 'Choolwe Jane Nsanzya', seats: 1, provenance: 'single', raw: 'Choolwe Jane Nsanzya' },
      { id: 'groom-09-05', name: 'Wandoo Atsaka', seats: 1, provenance: 'single', raw: 'Wandoo Atsaka' },
      { id: 'groom-09-06', name: 'Nwamaka Ezeanya', seats: 1, provenance: 'single', raw: 'Nwamaka Ezeanya' },
      { id: 'groom-09-07', name: 'Tony Nwagba and Chioma Nwagba', seats: 2, provenance: 'inferred', raw: 'Tony Nwagba and Chioma Nwagba' },
      { id: 'groom-09-08', name: 'Seyilnen Dan Yusuf', seats: 1, provenance: 'single', raw: 'Seyilnen Dan Yusuf' },
    ],
  },
  {
    id: 'groom-10', side: 'groom', kind: 'round',
    number: 10, title: 'OCC 10 / 10)', group: 'OCC (9) · Work (1)',
    capacity: 10,
    entries: [
      { id: 'groom-10-00', name: 'Solomon Daniel Wonders + Justina Eddiewhite', seats: 2, provenance: 'stated', raw: 'Solomon Daniel Wonders + Justina Eddiewhite (2 seats)' },
      { id: 'groom-10-01', name: 'Iyinoluwa "Iyindara" Toluhi + Boyesoko Barnabas Jiya', seats: 2, provenance: 'stated', raw: 'Iyinoluwa "Iyindara" Toluhi + Boyesoko Barnabas Jiya - 2 seats' },
      { id: 'groom-10-02', name: 'Richard Monday + Precious James', seats: 2, provenance: 'stated', raw: 'Richard Monday + Precious James - 2 seats' },
      { id: 'groom-10-03', name: 'Chichebem Memuduaghan + Ayeoritse Memuduaghan', seats: 2, provenance: 'inferred', raw: 'Chichebem Memuduaghan + Ayeoritse Memuduaghan' },
      { id: 'groom-10-04', name: 'Henry Orakwue', seats: 1, provenance: 'single', raw: 'Henry Orakwue' },
      { id: 'groom-10-05', name: 'Zino Clinton Mena', seats: 1, provenance: 'single', raw: 'Zino Clinton Mena' },
    ],
  },
  {
    id: 'groom-11', side: 'groom', kind: 'round',
    number: 11, title: '', group: 'OCC (10)',
    capacity: 10,
    entries: [
      { id: 'groom-11-00', name: 'Michael Osai + Amy Gukas', seats: 2, provenance: 'stated', raw: 'Michael Osai + Amy Gukas - 2 seats' },
      { id: 'groom-11-01', name: 'OCC Worship + 3', seats: 4, provenance: 'stated', raw: 'OCC Worship + 3 - 4  seats' },
      { id: 'groom-11-02', name: 'Derrick', seats: 1, provenance: 'single', raw: 'Derrick' },
      { id: 'groom-11-03', name: 'Joy Abonyi', seats: 1, provenance: 'single', raw: 'Joy Abonyi' },
      { id: 'groom-11-04', name: 'Nime Udoh', seats: 1, provenance: 'single', raw: 'Nime Udoh' },
      { id: 'groom-11-05', name: 'Chinedum Orji', seats: 1, provenance: 'single', raw: 'Chinedum Orji' },
    ],
  },
];

/**
 * Everything the source left unclear. Surfaced in the admin panel rather
 * than resolved, because guessing a guest's seat is worse than saying so.
 */
export const SOURCE_FLAGS: string[] = [
  'groom Table 04: seats total 9 but heading declares 10 — left as-is, NOT redistributed',
  'groom Table 09: inferred 1 extra seat(s) from unmarked multi-person row(s) [\'groom-09-07\'] — arithmetic closes exactly to 10',
  'groom Table 10: inferred 1 extra seat(s) from unmarked multi-person row(s) [\'groom-10-03\'] — arithmetic closes exactly to 10',
  'bride Table 11: row bride-11-05 names 2 people but the table already balances at 1 seat — NOT split, needs a human ruling',
  'bride table 9: blank bullet row in source, dropped',
];

/** Totals, computed at generation time and asserted by the test suite. */
export const SOURCE_TOTALS = {
  tables: 24,
  entries: 219,
  seatsAssigned: 249,
  seatsAvailable: 250,
} as const;
