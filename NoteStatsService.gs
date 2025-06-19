var NoteStatsService = (function () {
  var instance;
  // ヘッダー行を定数化
  const HEADER_ROW = ["id", "記事タイトル", "記事URL", "PV数", "スキ数", "前日比（PV数）", "前日比（スキ数）"];

  function NoteStatsService(config) {
    this.cookie = config.cookie;
    this.folderId = config.folderId;
    this.timezone = config.timezone;
  }
  NoteStatsService.getInstance = function (config) {
    if (!instance) instance = new NoteStatsService(config);
    return instance;
  };

  NoteStatsService.prototype.getMonthlySpreadsheet = function (monthStr) {
    var folder = this.folderId
      ? DriveApp.getFolderById(this.folderId)
      : DriveApp.getRootFolder();
    var name = 'note_PV_' + monthStr;
    var files = folder.getFilesByName(name);
    if (files.hasNext()) {
      return SpreadsheetApp.open(files.next());
    } else {
      var file = SpreadsheetApp.create(name);
      DriveApp.getFileById(file.getId()).moveTo(folder);
      return file;
    }
  };

  NoteStatsService.prototype.getOrCreateSheet = function (ss, dateStr, createData) {
    var sheet = ss.getSheetByName(dateStr);
    if (!sheet) {
      sheet = ss.insertSheet(dateStr);
      if (createData) {
        this.fetchNoteDataIntoSheet(sheet, dateStr);
      } else {
        sheet.appendRow(HEADER_ROW);
      }
    }
    return sheet;
  };

  // 合計行追加の共通関数
  NoteStatsService.prototype.appendSumRow = function (sheet, totalPv, totalLike, lastRow, prevDateStr, label = "【合計】") {
    sheet.appendRow([
      "sum", label, "", totalPv, totalLike,
      `=D${lastRow}-VLOOKUP($A${lastRow},'${prevDateStr}'!$A:$E,4, false)`,
      `=E${lastRow}-VLOOKUP($A${lastRow},'${prevDateStr}'!$A:$E,5, false)`
    ]);
  };

  // APIから記事データ取得の共通関数
  NoteStatsService.prototype.fetchArticles = function (page) {
    const url = "https://note.com/api/v1/stats/pv?filter=all&page=" + page + "&sort=pv";
    const options = {
      method: 'get',
      headers: { 'Cookie': this.cookie },
      muteHttpExceptions: true
    };
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    return json && json.data && json.data.note_stats ? json.data.note_stats : [];
  };

  NoteStatsService.prototype.fetchNoteDataIntoSheet = function (sheet, dateStr) {
    const prevDateStr = new Date(new Date(dateStr).getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    sheet.clear();
    sheet.appendRow(HEADER_ROW);
    let page = 1, totalPv = 0, totalLike = 0;
    while (true) {
      const articles = this.fetchArticles(page);
      Logger.log("ページ" + page + ": 取得記事数=" + articles.length);

      if (!articles.length) break;

      for (let i = 0; i < articles.length; i++) {
        const a = articles[i];
        const pv = a.read_count, like = a.like_count;
        const url2 = "https://note.com/" + a.user.urlname + "/n/" + a.key;
        const lastRow = sheet.getLastRow() + 1;
        sheet.appendRow([
          a.id, a.name, url2, pv, like,
          `=D${lastRow}-VLOOKUP($A${lastRow},'${prevDateStr}'!$A:$E,4, false)`,
          `=E${lastRow}-VLOOKUP($A${lastRow},'${prevDateStr}'!$A:$E,5, false)`
        ]);
        totalPv += pv;
        totalLike += like;
      }
      if (articles.length < 12) break;
      page++;
      Utilities.sleep(300);
    }
    const lastRow = sheet.getLastRow() + 1;
    this.appendSumRow(sheet, totalPv, totalLike, lastRow, prevDateStr);
  };

  NoteStatsService.prototype.getStatsData = function (ss, dateStr) {
    const sheet = ss.getSheetByName(dateStr);
    if (!sheet) return [];
    const values = sheet.getDataRange().getValues();
    return values.slice(1); // 1行目はヘッダ
  };

  return NoteStatsService;
})();
