/**
 * SheetSource.gs — reads the live Google Sheet.
 *
 * This is the Apps Script counterpart to scripts/sync/sources/file-source.mjs.
 * It returns the SAME shape the Node file reader returns:
 *
 *   { name: string, headers: string[], rows: [{ rowNumber, values }] }
 *
 * Because the contract is identical, Core.gs — planSync, transformRow, the
 * matcher, every normaliser — consumes it unchanged. Swapping the .xlsx export
 * for the live sheet is a source-layer change and nothing more.
 */

/**
 * Reads the guest tab into the source contract.
 * @return {{name: string, headers: Array.<string>, rows: Array.<Object>}}
 */
function readSheetSource_() {
  var sheet = getGuestSheet_();
  var range = sheet.getDataRange();
  var values = range.getValues();

  if (values.length < 2) {
    throw new Error('Sheet "' + sheet.getName() + '" has no data rows.');
  }

  // Header row, trailing blanks discarded.
  var headers = values[0].map(function (h) {
    return h === null || h === undefined ? '' : String(h).trim();
  });
  while (headers.length && !headers[headers.length - 1]) headers.pop();

  if (!headers.length) {
    throw new Error('Sheet "' + sheet.getName() + '" has no header row.');
  }

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var rowValues = {};
    var hasData = false;

    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var cell = values[r][c];

      // Dates arrive as Date objects; Core expects primitives.
      if (cell instanceof Date) cell = cell.toISOString();
      if (cell === '') cell = null;

      rowValues[headers[c]] = cell;
      if (cell !== null && cell !== undefined && String(cell).trim() !== '') {
        hasData = true;
      }
    }

    // +1 because sheet rows are 1-based and row 1 is the header.
    if (hasData) rows.push({ rowNumber: r + 1, values: rowValues });
  }

  return {
    name: SpreadsheetApp.getActiveSpreadsheet().getName() + ' → ' + sheet.getName(),
    headers: headers.filter(function (h) { return !!h; }),
    rows: rows
  };
}
