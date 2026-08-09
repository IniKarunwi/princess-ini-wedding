/**
 * File source — reads an .xlsx / .csv export of the planning sheet.
 *
 * This is the source in use today. It implements the contract in types.mjs.
 */

import path from 'node:path';
import fs from 'node:fs';
import ExcelJS from 'exceljs';

/** Cell values arrive from ExcelJS in several shapes; reduce to a primitive. */
function cellValue(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map(t => t.text).join('');
    if ('text' in v) return v.text;                 // rich text / hyperlink label
    if ('result' in v) return v.result;             // formula
    if ('hyperlink' in v) return v.hyperlink;
    if ('error' in v) return null;                  // #REF!, #N/A …
    return null;                                    // unknown shape — treat as empty
  }
  return v;
}

/**
 * @param {{ filePath: string, sheetName?: string }} options
 * @returns {Promise<import('./types.mjs').SourceResult>}
 */
export async function createFileSource({ filePath, sheetName }) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Spreadsheet not found: ${abs}`);
  }

  const workbook = new ExcelJS.Workbook();
  if (abs.toLowerCase().endsWith('.csv')) {
    await workbook.csv.readFile(abs);
  } else {
    await workbook.xlsx.readFile(abs);
  }

  const worksheet = sheetName
    ? workbook.getWorksheet(sheetName)
    : workbook.worksheets[0];

  if (!worksheet) {
    const available = workbook.worksheets.map(w => w.name).join(', ');
    throw new Error(`Worksheet "${sheetName}" not found. Available: ${available}`);
  }

  // Header row — trailing empty columns are discarded.
  const headerRow = worksheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const raw = cellValue(cell);
    headers[colNumber - 1] = raw === null ? null : String(raw).trim();
  });
  while (headers.length && !headers[headers.length - 1]) headers.pop();

  if (!headers.length) {
    throw new Error(`Worksheet "${worksheet.name}" has no header row.`);
  }

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const values = {};
    let hasData = false;
    headers.forEach((header, i) => {
      if (!header) return;
      const v = cellValue(row.getCell(i + 1));
      values[header] = v;
      if (v !== null && String(v).trim() !== '') hasData = true;
    });

    if (hasData) rows.push({ rowNumber, values });
  });

  return {
    name: `${path.basename(abs)} → ${worksheet.name}`,
    headers: headers.filter(Boolean),
    rows,
  };
}
