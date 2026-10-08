/**
 * Recalculate only F:G from already-saved counters. Never fetch current API values
 * for a historical date. The default is a read-only preview; apply needs an
 * explicit true argument and creates a full sheet backup before any change.
 */
function repairSavedNoteComparison(dateStr, apply) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ||
      new Date(dateStr + 'T12:00:00Z').toISOString().slice(0, 10) !== dateStr) {
    throw new Error('日付は実在するYYYY-MM-DDで指定してください');
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('別の集計処理が実行中です');
  try {
    var note = NoteStatsService.getInstance(Config.getInstance());
    var ss = note.getMonthlySpreadsheet(dateStr.slice(0, 7).replace('-', '_'), false);
    var sheet = ss ? ss.getSheetByName(dateStr) : null;
    if (!sheet) throw new Error('保存済みシートがありません: ' + dateStr);
    var current = note.readSnapshot(sheet);
    var previous = note.getSnapshot(NoteStatsService.previousDate(dateStr));
    var comparable = current.complete && previous.complete;
    var diffs = current.rows.map(function (r) {
      var before = comparable ? (String(r[0]) === 'sum' ? previous.sum : previous.map.get(String(r[0]))) : null;
      return before ? [r[3] - before[3], r[4] - before[4]] : ['比較不可（保存データ欠損）', '比較不可（保存データ欠損）'];
    });
    var result = { date: dateStr, complete: current.complete, previousComplete: previous.complete,
      rows: diffs.length, incomparableRows: diffs.filter(function (r) { return typeof r[0] !== 'number'; }).length, applied: false };
    if (apply === true) {
      if (!diffs.length) throw new Error('変更するデータ行がありません');
      var backup = sheet.copyTo(ss);
      backup.setName(dateStr + '_before_repair_' + Utilities.getUuid().slice(0, 8));
      sheet.getRange(2, 6, diffs.length, 2).setValues(diffs);
      SpreadsheetApp.flush();
      var saved = sheet.getRange(2, 6, diffs.length, 2).getValues();
      if (JSON.stringify(saved) !== JSON.stringify(diffs)) throw new Error('比較列の読戻し不一致。保全シートID=' + backup.getSheetId());
      sheet.getRange(1, 6, 1, 2).setNote('保存済みデータのみで再計算。欠損は0補完せず比較不可。元シート保全ID=' + backup.getSheetId());
      result.applied = true;
      result.backupSheetId = backup.getSheetId();
    }
    Logger.log(JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}
