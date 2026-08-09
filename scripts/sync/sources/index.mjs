/**
 * Source factory — the only place that decides where rows come from.
 *
 * The engine calls loadSource() and receives a SourceResult. Adding a new
 * origin means adding a branch here plus one reader module; no other file in
 * the pipeline changes.
 */

import { createFileSource } from './file-source.mjs';
import { createGoogleSheetsSource } from './google-sheets-source.mjs';

/**
 * @param {{ file?: string, sheet?: string, worksheet?: string, range?: string, keyFile?: string }} options
 * @returns {Promise<import('./types.mjs').SourceResult>}
 */
export async function loadSource(options) {
  if (options.file) {
    return createFileSource({ filePath: options.file, sheetName: options.worksheet });
  }

  if (options.sheet) {
    return createGoogleSheetsSource({
      sheetId: options.sheet,
      range:   options.range,
      keyFile: options.keyFile || process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
    });
  }

  throw new Error('No source specified. Pass --file <path.xlsx> or --sheet <googleSheetId>.');
}
