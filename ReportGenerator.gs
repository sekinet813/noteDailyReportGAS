function ReportGenerator(note, config, readOnly) {
  this.todayStr = Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd');
  this.yesterdayStr = NoteStatsService.previousDate(this.todayStr);
  var ss = note.getMonthlySpreadsheet(this.todayStr.slice(0, 7).replace('-', '_'), readOnly ? false : undefined);
  this.todaySheet = readOnly ? (ss ? ss.getSheetByName(this.todayStr) : null) : note.getOrCreateSheet(ss, this.todayStr, true);
  var current = note.readSnapshot(this.todaySheet);
  if (!current.complete) throw new Error('当日集計が未完了のためメール生成を中止しました');
  var previous = note.getSnapshot(this.yesterdayStr);
  this.comparable = previous.complete;
  this.articleCount = current.articleCount;
  this.totalPv = current.sum[3];
  this.totalLike = current.sum[4];
  this.totalPvDiff = this.comparable ? current.sum[3] - previous.sum[3] : null;
  this.totalLikeDiff = this.comparable ? current.sum[4] - previous.sum[4] : null;
  this.diffList = [];
  this.unmatchedCount = 0;
  this.removedCount = 0;
  var self = this;
  current.map.forEach(function (row, id) {
    var before = previous.complete ? previous.map.get(id) : null;
    if (!before) { self.unmatchedCount++; return; }
    var pvDiff = row[3] - before[3], likeDiff = row[4] - before[4];
    if (pvDiff > 0 || likeDiff > 0) self.diffList.push({ title: row[1], url: row[2], pvDiff: pvDiff, likeDiff: likeDiff });
  });
  if (previous.complete) previous.map.forEach(function (row, id) { if (!current.map.has(id)) self.removedCount++; });
  this.diffList.sort(function (a, b) { return b.pvDiff - a.pvDiff; });
}
ReportGenerator.signed = function (value) { return (value >= 0 ? '+' : '') + value; };
ReportGenerator.prototype.getSubject = function () {
  return '【noteレポート】' + this.todayStr + (this.comparable ?
    '｜PV ' + ReportGenerator.signed(this.totalPvDiff) + '、スキ ' + ReportGenerator.signed(this.totalLikeDiff) :
    '｜前日比は比較不可（前日データ欠損）');
};
ReportGenerator.prototype.getBody = function () {
  var lines = ['本日のnote記事分析レポートです。', '',
    '当日集計: ' + this.articleCount + '記事／累積PV ' + this.totalPv + '／累積スキ ' + this.totalLike];
  if (!this.comparable) {
    lines.push('前日比: 比較不可（' + this.yesterdayStr + 'の集計が欠損または未完了）',
      '欠損値を0で補っていません。当日累積値は取得済みですが、正確な日次増分は算出できません。');
  } else {
    lines.push('全記事の累積PV合計の差: ' + ReportGenerator.signed(this.totalPvDiff),
      '全記事の累積スキ合計の差: ' + ReportGenerator.signed(this.totalLikeDiff),
      '※合計の差には記事の追加・削除や集計値の訂正も含まれます。', '',
      '特に伸びた記事（両日で記事IDを照合できた記事のみ）:');
    lines.push(this.diffList.slice(0, 3).map(function (d) {
      return '- 「' + d.title + '」: ' + ReportGenerator.signed(d.pvDiff) + 'PV（スキ ' + ReportGenerator.signed(d.likeDiff) + '）';
    }).join('\n') || '該当なし');
    if (this.unmatchedCount || this.removedCount) lines.push('個別比較不可: 前日にない記事 ' + this.unmatchedCount + '件、当日にない記事 ' + this.removedCount + '件');
  }
  lines.push('', '自動配信：note分析Bot');
  return lines.join('\n');
};
