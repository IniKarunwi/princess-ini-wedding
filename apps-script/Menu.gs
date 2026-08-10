/**
 * Menu.gs — the "RSVP Sync" menu.
 *
 * onOpen runs automatically whenever the spreadsheet is opened.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('RSVP Sync')
    .addItem('Sync Now', 'runSync')
    .addItem('Preview (dry run)', 'previewSync')
    .addSeparator()
    .addItem('Test connection', 'testConnection')
    .addToUi();
}
