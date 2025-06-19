function ReportGenerator(note, config) {
  var today = new Date();
  var yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  this.todayStr = Utilities.formatDate(today, config.timezone, 'yyyy-MM-dd');
  this.yesterdayStr = Utilities.formatDate(yesterday, config.timezone, 'yyyy-MM-dd');
  this.monthStr = Utilities.formatDate(today, config.timezone, 'yyyy_MM');
  this.note = note;
  this.config = config;

  var ss = note.getMonthlySpreadsheet(this.monthStr);

  this.todaySheet = note.getOrCreateSheet(ss, this.todayStr, true);
  this.yesterdaySheet = note.getOrCreateSheet(ss, this.yesterdayStr, false);

  this.todayData = note.getStatsData(ss, this.todayStr);
  this.yesterdayData = note.getStatsData(ss, this.yesterdayStr);
  this.todayMap = {};
  for (var i = 0; i < this.todayData.length; i++) {
    var row = this.todayData[i];
    this.todayMap[row[1]] = { pv: row[3], like: row[4] };
  }

  this.diffList = [];
  this.totalPvDiff = 0;
  this.totalLikeDiff = 0;
  for (var i = 0; i < this.yesterdayData.length; i++) {
    var r = this.yesterdayData[i];
    if (r[1] === "【合計】") continue;
    var t = this.todayMap[r[1]];
    if (!t) continue;
    var pvDiff = t.pv - r[3], likeDiff = t.like - r[4];
    if (pvDiff > 0 || likeDiff > 0) {
      this.diffList.push({ title: r[1], url: r[2], pvDiff: pvDiff, likeDiff: likeDiff });
      this.totalPvDiff += pvDiff;
      this.totalLikeDiff += likeDiff;
    }
  }
  this.diffList.sort(function (a, b) { return b.pvDiff - a.pvDiff; });
}
ReportGenerator.prototype.getSubject = function () {
  return "【noteレポート】" + this.todayStr + "｜PV +" + this.totalPvDiff + "、スキ +" + this.totalLikeDiff;
};
ReportGenerator.prototype.getBody = function () {
  var summary = this.diffList.slice(0, 3)
    .map(function (d) { return "- 「" + d.title + "」: +" + d.pvDiff + "PV（スキ +" + d.likeDiff + "）"; })
    .join('\n');
  return [
    "こんにちは。本日のnote記事分析レポートです。\n",
    "🟩 PV数の変化（前日比）: +" + this.totalPvDiff,
    "🟩 スキ数の変化: +" + this.totalLikeDiff,
    "",
    "📌 特に伸びた記事（PVの増加が大きかった順）:",
    summary,
    "",
    "—",
    "https://drive.google.com/drive/u/0/folders/1RVSsfvEwFCNcAdLL0blTIBHD1AvJhwJI",
    "自動配信：note分析Bot（GAS + GPT-4o-mini）"
  ].join('\n');
};
