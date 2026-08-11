/**
 * SupabaseClient.gs — Supabase REST (PostgREST) over UrlFetchApp.
 *
 * The Apps Script counterpart to scripts/sync/supabase-io.mjs. Same two jobs:
 * read every existing row, and apply a plan. Updates go out through
 * UrlFetchApp.fetchAll() so ~150 PATCHes run in parallel batches rather than
 * serially — comfortably inside the Apps Script execution limit.
 */

/** Rows requested per page when reading the table. */
var SB_PAGE_SIZE_ = 1000;

/** Parallel requests per fetchAll batch. */
var SB_BATCH_SIZE_ = 50;

function sbHeaders_(cfg) {
  return {
    'apikey': cfg.key,
    'Authorization': 'Bearer ' + cfg.key,
    'Content-Type': 'application/json'
  };
}

/**
 * Reads every row of `rsvps`, paging past PostgREST's response cap.
 * @return {Array.<Object>}
 */
function sbFetchExisting_() {
  var cfg = getSupabaseConfig_();
  var rows = [];

  for (var from = 0; ; from += SB_PAGE_SIZE_) {
    var to = from + SB_PAGE_SIZE_ - 1;
    var response = UrlFetchApp.fetch(
      cfg.url + '/rest/v1/' + TABLE + '?select=*',
      {
        method: 'get',
        headers: Object.assign(sbHeaders_(cfg), { 'Range': from + '-' + to }),
        muteHttpExceptions: true
      }
    );

    var code = response.getResponseCode();
    if (code >= 400) {
      throw new Error('Failed to read ' + TABLE + ' (HTTP ' + code + '): ' +
                      response.getContentText());
    }

    var page = JSON.parse(response.getContentText());
    if (!page.length) break;
    rows = rows.concat(page);
    if (page.length < SB_PAGE_SIZE_) break;
  }

  return rows;
}

/**
 * Inserts new guests. Sent as a single POST with an array body — one request
 * regardless of how many rows are new.
 * @return {{inserted: number, errors: Array.<Object>}}
 */
function sbInsertRows_(inserts) {
  if (!inserts.length) return { inserted: 0, errors: [] };

  var cfg = getSupabaseConfig_();
  var records = inserts.map(function (i) { return i.record; });

  // PostgREST refuses a bulk insert whose objects do not all carry the same
  // keys — PGRST102, "All object keys must match". Records legitimately differ:
  // transformRow drops blank fields, so a guest with no phone has no `phone`
  // key at all while a guest with one does.
  //
  // Normalise to the union of every key seen, padding absences with null, and
  // emit them in a fixed order so all objects share one shape. Explicit null is
  // safe for these columns: none carries a database DEFAULT that omission would
  // otherwise trigger — the columns that do (id, created_at, guest_count) are
  // in IMMUTABLE_COLUMNS and never appear in a record.
  var keySet = {};
  records.forEach(function (r) {
    Object.keys(r).forEach(function (k) { keySet[k] = true; });
  });
  var keys = Object.keys(keySet).sort();

  var payload = records.map(function (r) {
    var padded = {};
    keys.forEach(function (k) {
      padded[k] = Object.prototype.hasOwnProperty.call(r, k) ? r[k] : null;
    });
    return padded;
  });

  var response = UrlFetchApp.fetch(
    cfg.url + '/rest/v1/' + TABLE,
    {
      method: 'post',
      headers: Object.assign(sbHeaders_(cfg), { 'Prefer': 'return=representation' }),
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );

  var code = response.getResponseCode();
  if (code >= 400) {
    // The batch is atomic: on failure nothing was written.
    return {
      inserted: 0,
      errors: [{
        op: 'insert',
        rowNumber: inserts[0].rowNumber,
        label: inserts.length + ' new guests (batch)',
        message: 'HTTP ' + code + ': ' + response.getContentText()
      }]
    };
  }

  var created = JSON.parse(response.getContentText());
  for (var i = 0; i < inserts.length && i < created.length; i++) {
    inserts[i].id = created[i].id;
  }
  return { inserted: created.length, errors: [] };
}

/**
 * Applies updates. Each row has its own change set, so these cannot be merged
 * into one request — but fetchAll issues them concurrently.
 * @return {{updated: number, errors: Array.<Object>}}
 */
function sbUpdateRows_(updates) {
  if (!updates.length) return { updated: 0, errors: [] };

  var cfg = getSupabaseConfig_();
  var headers = sbHeaders_(cfg);
  var updated = 0;
  var errors = [];

  for (var start = 0; start < updates.length; start += SB_BATCH_SIZE_) {
    var batch = updates.slice(start, start + SB_BATCH_SIZE_);

    var requests = batch.map(function (item) {
      return {
        url: cfg.url + '/rest/v1/' + TABLE + '?id=eq.' + encodeURIComponent(item.id),
        method: 'patch',
        headers: headers,
        payload: JSON.stringify(item.changes),
        muteHttpExceptions: true
      };
    });

    var responses = UrlFetchApp.fetchAll(requests);

    for (var i = 0; i < responses.length; i++) {
      var code = responses[i].getResponseCode();
      if (code >= 400) {
        errors.push({
          op: 'update',
          rowNumber: batch[i].rowNumber,
          label: batch[i].label,
          message: 'HTTP ' + code + ': ' + responses[i].getContentText()
        });
      } else {
        updated++;
      }
    }
  }

  return { updated: updated, errors: errors };
}

/**
 * Executes a plan. Mirrors applyPlan() in supabase-io.mjs.
 * @return {{inserted: number, updated: number, errors: Array.<Object>}}
 */
function sbApplyPlan_(plan) {
  var ins = sbInsertRows_(plan.inserts);
  var upd = sbUpdateRows_(plan.updates);

  return {
    inserted: ins.inserted,
    updated: upd.updated,
    errors: ins.errors.concat(upd.errors)
  };
}

/** Connectivity and credential check. Reads a single row. */
function sbTestConnection_() {
  var cfg = getSupabaseConfig_();
  var response = UrlFetchApp.fetch(
    cfg.url + '/rest/v1/' + TABLE + '?select=id&limit=1',
    { method: 'get', headers: sbHeaders_(cfg), muteHttpExceptions: true }
  );

  var code = response.getResponseCode();
  if (code >= 400) {
    throw new Error('HTTP ' + code + ': ' + response.getContentText());
  }
  return true;
}
