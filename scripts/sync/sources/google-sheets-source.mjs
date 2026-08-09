/**
 * Google Sheets source — live read from the planning sheet.
 *
 * NOT YET ENABLED. It is written against the same contract as the file source
 * (types.mjs), so switching over is a flag change, not a rewrite: the engine,
 * matcher and transform layers never learn where rows came from.
 *
 * To enable:
 *   1. npm install --save-dev googleapis
 *   2. Create a Google Cloud service account, download its JSON key.
 *   3. Share the sheet with the service-account email (Viewer is enough).
 *   4. Set in .env:
 *        GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./secrets/service-account.json
 *        GOOGLE_SHEET_ID=<id from the sheet URL>
 *        GOOGLE_SHEET_RANGE=rsvps!A:Z          (optional)
 *   5. Uncomment the implementation below and run with --sheet.
 *
 * Everything downstream already works — only this reader is stubbed.
 */

export async function createGoogleSheetsSource() {
  throw new Error(
    'Google Sheets source is not enabled yet.\n' +
    'See scripts/sync/sources/google-sheets-source.mjs for the four steps to turn it on.\n' +
    'Until then, export the sheet and run with --file <path>.'
  );
}

/* ---------------------------------------------------------------------------
 * Reference implementation — uncomment once googleapis is installed.
 * ---------------------------------------------------------------------------
 *
 * import { google } from 'googleapis';
 *
 * export async function createGoogleSheetsSource({ sheetId, range, keyFile }) {
 *   const auth = new google.auth.GoogleAuth({
 *     keyFile,
 *     scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
 *   });
 *   const sheets = google.sheets({ version: 'v4', auth });
 *
 *   const { data } = await sheets.spreadsheets.values.get({
 *     spreadsheetId: sheetId,
 *     range: range || 'A:Z',
 *     valueRenderOption: 'UNFORMATTED_VALUE',
 *   });
 *
 *   const [headerRow = [], ...dataRows] = data.values || [];
 *   const headers = headerRow.map(h => String(h ?? '').trim());
 *
 *   const rows = [];
 *   dataRows.forEach((cells, i) => {
 *     const values = {};
 *     let hasData = false;
 *     headers.forEach((header, c) => {
 *       if (!header) return;
 *       const v = cells[c] ?? null;
 *       values[header] = v;
 *       if (v !== null && String(v).trim() !== '') hasData = true;
 *     });
 *     // +2: one for the header row, one for 1-based sheet numbering
 *     if (hasData) rows.push({ rowNumber: i + 2, values });
 *   });
 *
 *   return { name: `Google Sheet ${sheetId}`, headers: headers.filter(Boolean), rows };
 * }
 */
