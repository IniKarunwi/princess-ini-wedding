/**
 * The data-source contract.
 *
 * Every source resolves to this shape, and the sync engine consumes nothing
 * else. Swapping the spreadsheet export for the live Google Sheets API is
 * therefore a source-layer change only — engine, matcher and transform never
 * learn where the rows came from.
 *
 * @typedef {Object} SourceResult
 * @property {string}   name        Human-readable origin, for the report.
 * @property {string[]} headers     Header texts, in sheet order.
 * @property {SourceRow[]} rows     Data rows, blank rows already dropped.
 *
 * @typedef {Object} SourceRow
 * @property {number} rowNumber     1-based sheet row, used in log output.
 * @property {Record<string, any>} values  header → raw cell value.
 */

export {};
