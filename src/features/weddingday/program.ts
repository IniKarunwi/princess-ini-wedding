/**
 * The Order of Service, transcribed from the printed programme.
 *
 * ── Source ─────────────────────────────────────────────────────────────────
 * "Order of Service — The Celebration of Marriage — Inioluwa Karunwi &
 * Princess Iman Sado", One City Church Abuja, Saturday 26 September 2026.
 * Every title, name, reading and time below is taken from that document. The
 * only thing computed here is each section's overall time range, which is its
 * first item's start to its last item's end — arithmetic on stated times, not
 * an addition to them.
 *
 * ── Why this is data and not a page ────────────────────────────────────────
 * Same reason as the menu: a printed card sends guests to /program, and the
 * thing most likely to change on the morning is a name or a time, not the
 * layout. Those live here, in one list, where a correction is one line.
 *
 * Nothing about the ceremony belongs in the reception pages, and nothing here
 * reads RSVP or seating data — this is the same programme for everyone in the
 * room.
 */

export interface ProgramItem {
  /** What happens. */
  title: string;
  /** Who leads it. Absent where the programme names nobody. */
  leader?: string;
  /** A reading, a hymn, or a line printed under the item. */
  note?: string;
  /** As printed, e.g. "12:09 – 12:19 pm". Absent where none is given. */
  time?: string;
  /** The parts within one item — the Declarations have eight. */
  parts?: string[];
}

export interface ProgramSection {
  title: string;
  /** First item's start to last item's end. */
  time: string;
  items: ProgramItem[];
}

export const PROGRAM_CHURCH = 'One City Church, Abuja';
export const PROGRAM_TITLE = 'The Celebration of Marriage';
export const PROGRAM_COUPLE = 'Inioluwa Karunwi & Princess Iman Sado';
export const PROGRAM_DATE = 'Saturday, 26 September 2026';

export const ORDER_OF_SERVICE: ProgramSection[] = [
  {
    title: 'Call to Worship',
    time: '11:50 am – 12:00 pm',
    items: [
      { title: 'Song', leader: 'One City Worship', time: '11:50 – 11:55 am' },
      {
        title: 'Call to Prayer',
        leader: 'Pastor Michael Coker',
        note: 'Revelation 19:1–9',
        time: '11:55 am – 12:00 pm',
      },
    ],
  },
  {
    title: 'Opening',
    time: '12:00 – 12:22 pm',
    items: [
      { title: 'Statement of Purpose', leader: 'Pastor Michael Coker', time: '12:00 – 12:05 pm' },
      { title: 'Bridal Party and Bridal Entrance', leader: 'Service Minister' },
      { title: 'Introduction and Charge', leader: 'Pastor Jesse Dan-Yusuf', time: '12:05 – 12:07 pm' },
      { title: 'Opening Prayer', leader: 'Pastor Jesse Dan-Yusuf', time: '12:07 – 12:09 pm' },
      { title: 'Worship', leader: 'One City Worship', time: '12:09 – 12:19 pm' },
      {
        title: 'Bible Reading',
        leader: 'Inioluwa Karunwi',
        note: 'Ecclesiastes 4:9–12',
        time: '12:19 – 12:22 pm',
      },
    ],
  },
  {
    title: 'The Joining',
    time: '12:22 – 12:52 pm',
    items: [
      {
        title: 'Declarations',
        leader: 'Pastor Jesse Dan-Yusuf',
        time: '12:22 – 12:42 pm',
        parts: [
          'Giving of the Bride',
          'The Wills',
          'Families’ Blessing',
          'Congregational Affirmation',
          'Unveiling the Bride',
          'The Vows',
          'Rings',
          'Pronouncement',
        ],
      },
      {
        title: 'Prayer for the Couple',
        leader: 'Pastor Joseph Zimughan, Rev. Chingtok Ishaku',
        time: '12:42 – 12:52 pm',
      },
    ],
  },
  {
    title: 'The Word',
    time: '12:52 – 1:25 pm',
    items: [
      {
        title: 'Special Song',
        leader: 'One City Worship',
        note: '“What a Friend We Have in Jesus” (Hymn)',
        time: '12:52 – 12:57 pm',
      },
      {
        title: 'Bible Reading',
        leader: 'Princess Iman Sado',
        note: 'John 15:12–17',
        time: '12:57 – 1:00 pm',
      },
      { title: 'Sermon', leader: 'Pastor Jesse Dan-Yusuf', time: '1:00 – 1:20 pm' },
      { title: 'Communion', leader: 'One City Church Pastors', time: '1:20 – 1:25 pm' },
    ],
  },
  {
    title: 'The Sending and the Blessing',
    time: '1:25 – 2:01 pm',
    items: [
      {
        title: 'Signing of the Register',
        leader: 'Pastors Jesse and Eva Dan-Yusuf',
        time: '1:25 – 1:35 pm',
      },
      { title: 'Presentation of the Couple', leader: 'Pastor Jesse Dan-Yusuf', time: '1:35 – 1:37 pm' },
      {
        title: 'Responsive Blessing',
        leader: 'Pastor Jesse Dan-Yusuf; Congregation',
        time: '1:37 – 1:38 pm',
      },
      {
        title: 'Thanksgiving and Offering',
        leader: 'Pastor Michael Coker',
        note: 'Psalm 126:3 · Presentation of Gift: Pastor Eva Dan-Yusuf',
        time: '1:38 – 1:48 pm',
      },
      { title: 'Announcements', leader: 'Pastor Eva Dan-Yusuf', time: '1:48 – 1:53 pm' },
      {
        title: 'Closing Prayer and Benediction',
        leader: 'Pastor Jesse Dan-Yusuf',
        time: '1:53 – 1:56 pm',
      },
      {
        title: 'Recessional',
        leader: 'One City Worship',
        note: '“The Blessing”',
        time: '1:56 – 2:01 pm',
      },
    ],
  },
];
