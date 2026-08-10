/**
 * Config.gs — credentials and sheet settings.
 *
 * Nothing secret is stored in this file. The Supabase URL and key live in
 * Script Properties (Project Settings → Script Properties), so they are never
 * committed to the repository.
 *
 * Names here end in _ so Apps Script treats them as private and keeps them out
 * of the Run menu, and are prefixed to avoid colliding with Core.gs, which
 * shares this global scope.
 */

/** Script Property keys. */
var PROP_SUPABASE_URL_ = 'SUPABASE_URL';
var PROP_SUPABASE_KEY_ = 'SUPABASE_SERVICE_ROLE_KEY';

/** Tab holding the guest list. Empty string = the first tab. */
var SYNC_SHEET_NAME_ = '';

/** Tab the sync writes its run history to. Created automatically. */
var SYNC_LOG_SHEET_NAME_ = 'Sync Log';

/**
 * Reads Supabase credentials, failing loudly with instructions if unset.
 * @return {{url: string, key: string}}
 */
function getSupabaseConfig_() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty(PROP_SUPABASE_URL_);
  var key = props.getProperty(PROP_SUPABASE_KEY_);

  if (!url || !key) {
    throw new Error(
      'Supabase credentials are not set.\n\n' +
      'Extensions → Apps Script → Project Settings → Script Properties, add:\n' +
      '  ' + PROP_SUPABASE_URL_ + '  =  https://<project>.supabase.co\n' +
      '  ' + PROP_SUPABASE_KEY_ + '  =  <service_role key>\n\n' +
      'The service_role key is required: the anon key cannot update rows ' +
      'under row-level security.'
    );
  }

  return { url: url.replace(/\/+$/, ''), key: key };
}

/** The tab to read guests from. */
function getGuestSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = SYNC_SHEET_NAME_
    ? ss.getSheetByName(SYNC_SHEET_NAME_)
    : ss.getSheets()[0];

  if (!sheet) {
    throw new Error('Guest sheet "' + SYNC_SHEET_NAME_ + '" not found.');
  }
  return sheet;
}
