/**
 * Sync.gs — orchestration.
 *
 * Mirrors scripts/sync/run.mjs: read source, plan, optionally apply, report.
 * The planning step is Core.gs — the same code the Node runner executes — so
 * behaviour cannot drift between the two.
 */

/**
 * Reads the sheet, reads Supabase, and builds the change plan. No writes.
 * @return {{source: Object, plan: Object, existingCount: number}}
 */
function buildPlan_() {
  var source = readSheetSource_();
  var existing = sbFetchExisting_();
  var plan = planSync(source, existing);
  return { source: source, plan: plan, existingCount: existing.length };
}

/** Human-readable one-line-per-section summary. */
function formatSummary_(source, plan, results, applied, existingCount) {
  var missing = plan.skipped.filter(function (s) { return s.reason === 'missing-identifier'; });
  var dupes   = plan.skipped.filter(function (s) { return s.reason === 'duplicate-in-sheet'; });

  var out = [];
  out.push(applied ? 'SYNC APPLIED' : 'DRY RUN — nothing was written');
  out.push('');
  out.push('Source:      ' + source.name);
  out.push('Sheet rows:  ' + source.rows.length);
  out.push('DB rows:     ' + existingCount);
  out.push('');
  out.push('Inserted:            ' + plan.inserts.length + (applied ? '' : '  (would insert)'));
  out.push('Updated:             ' + plan.updates.length + (applied ? '' : '  (would update)'));
  out.push('Unchanged:           ' + plan.unchanged.length);
  out.push('Skipped (duplicate): ' + dupes.length);
  out.push('Missing identifier:  ' + missing.length);
  out.push('Normalised:          ' + plan.normalizations.length);
  out.push('Errors:              ' + (results ? results.errors.length : 0));

  // Every insert, numbered and never truncated: this is the list to check
  // against the guest list before approving a sync, so an elision would
  // defeat the point. Each line carries the identity the row will be matched
  // on, which is what makes a re-run recognise the guest instead of
  // inserting them twice.
  if (plan.inserts.length) {
    out.push('');
    out.push((applied ? 'INSERTED GUESTS (' : 'NEW GUESTS TO INSERT (') +
             plan.inserts.length + ')');
    plan.inserts.forEach(function (i, n) {
      var ident = i.identifiers.email ? '<' + i.identifiers.email + '>'
                : i.identifiers.phone ? i.identifiers.phone
                : 'name-key: ' + i.identifiers.sheetKey;
      out.push('  ' + String(n + 1).padStart(3) + '. row ' +
               String(i.rowNumber).padStart(4) + '  ' +
               String(i.label).padEnd(30) + ' ' + ident);
    });
  }

  // Listed before anything else: these rows are the ones a human may need to
  // act on, and a bare count does not say which guest is affected.
  if (dupes.length) {
    out.push('');
    out.push('DUPLICATE ROWS SKIPPED — first occurrence kept, later ones ignored');
    dupes.slice(0, 20).forEach(function (s) {
      out.push('  row ' + s.rowNumber + '  ' + s.label + (s.detail ? '\n        ' + s.detail : ''));
    });
    if (dupes.length > 20) out.push('  … and ' + (dupes.length - 20) + ' more');
  }

  if (missing.length) {
    out.push('');
    out.push('MISSING IDENTIFIERS — no email, no phone and no name; NOT synced');
    missing.slice(0, 20).forEach(function (s) {
      out.push('  row ' + s.rowNumber + '  ' + s.label);
    });
    if (missing.length > 20) out.push('  … and ' + (missing.length - 20) + ' more');
  }

  if (plan.normalizations.length) {
    out.push('');
    out.push('NORMALISED (applied automatically, no action needed)');
    plan.normalizations.slice(0, 10).forEach(function (n) {
      out.push('  row ' + n.rowNumber + '  ' + n.label + ' — ' + n.message);
    });
    if (plan.normalizations.length > 10) {
      out.push('  … and ' + (plan.normalizations.length - 10) + ' more');
    }
  }

  if (plan.warnings.length) {
    out.push('');
    out.push('WARNINGS');
    plan.warnings.slice(0, 10).forEach(function (w) {
      out.push('  row ' + w.rowNumber + '  ' + w.label + ' — ' + w.message);
    });
    if (plan.warnings.length > 10) {
      out.push('  … and ' + (plan.warnings.length - 10) + ' more');
    }
  }

  if (results && results.errors.length) {
    out.push('');
    out.push('ERRORS');
    results.errors.slice(0, 15).forEach(function (e) {
      out.push('  row ' + e.rowNumber + '  ' + e.label + ' — ' + e.op + ': ' + e.message);
    });
  }

  return out.join('\n');
}

/** Appends a row to the Sync Log tab, creating it on first use. */
function writeLogRow_(source, plan, results, applied) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SYNC_LOG_SHEET_NAME_);

  if (!sheet) {
    sheet = ss.insertSheet(SYNC_LOG_SHEET_NAME_);
    sheet.appendRow([
      'Timestamp', 'Mode', 'Sheet rows', 'DB rows', 'Inserted', 'Updated',
      'Unchanged', 'Duplicates', 'Missing ID', 'Normalised', 'Errors', 'Detail'
    ]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 12).setFontWeight('bold');
  }

  var missing = plan.skipped.filter(function (s) { return s.reason === 'missing-identifier'; }).length;
  var dupes   = plan.skipped.filter(function (s) { return s.reason === 'duplicate-in-sheet'; }).length;

  var detail = '';
  if (results && results.errors.length) {
    detail = results.errors.slice(0, 5).map(function (e) {
      return e.label + ': ' + e.message;
    }).join(' | ');
  } else if (plan.normalizations.length) {
    detail = plan.normalizations.length + ' status promotions';
  }

  sheet.appendRow([
    new Date(),
    applied ? 'APPLIED' : 'DRY RUN',
    source.rows.length,
    plan.inserts.length + plan.updates.length + plan.unchanged.length,
    applied ? results.inserted : plan.inserts.length,
    applied ? results.updated : plan.updates.length,
    plan.unchanged.length,
    dupes,
    missing,
    plan.normalizations.length,
    results ? results.errors.length : 0,
    detail
  ]);
}

/** Shows a scrollable result dialog. */
function showResult_(title, body) {
  var html = HtmlService
    .createHtmlOutput(
      '<pre style="font:12px/1.5 Menlo,Consolas,monospace;white-space:pre-wrap;' +
      'margin:0;padding:12px">' +
      body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
      '</pre>'
    )
    .setWidth(660)
    .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, title);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Menu entry points (no trailing underscore — these are user-callable)
// ─────────────────────────────────────────────────────────────────────────────

/** Preview: builds the plan and reports it. Writes nothing. */
function previewSync() {
  try {
    var built = buildPlan_();
    var summary = formatSummary_(built.source, built.plan, null, false, built.existingCount);
    writeLogRow_(built.source, built.plan, null, false);
    showResult_('RSVP Sync — Preview', summary);
  } catch (err) {
    showResult_('RSVP Sync — Failed', String(err.message || err));
  }
}

/** Sync Now: plans, confirms, then writes. */
function runSync() {
  var ui = SpreadsheetApp.getUi();

  try {
    var built = buildPlan_();
    var plan = built.plan;

    if (!plan.inserts.length && !plan.updates.length) {
      showResult_('RSVP Sync — Nothing to do',
        formatSummary_(built.source, plan, { inserted: 0, updated: 0, errors: [] },
                       false, built.existingCount));
      return;
    }

    var confirmed = ui.alert(
      'Sync to Supabase?',
      plan.inserts.length + ' new guest(s) will be inserted.\n' +
      plan.updates.length + ' existing guest(s) will be updated.\n\n' +
      'Continue?',
      ui.ButtonSet.YES_NO
    );
    if (confirmed !== ui.Button.YES) return;

    var results = sbApplyPlan_(plan);
    var summary = formatSummary_(built.source, plan, results, true, built.existingCount);
    writeLogRow_(built.source, plan, results, true);
    showResult_(results.errors.length ? 'RSVP Sync — Completed with errors'
                                      : 'RSVP Sync — Complete', summary);
  } catch (err) {
    showResult_('RSVP Sync — Failed', String(err.message || err));
  }
}

/** Verifies credentials and connectivity. */
function testConnection() {
  try {
    sbTestConnection_();
    var cfg = getSupabaseConfig_();
    SpreadsheetApp.getUi().alert('Connected',
      'Reached ' + cfg.url + ' and read the ' + TABLE + ' table successfully.',
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (err) {
    showResult_('Connection failed', String(err.message || err));
  }
}
