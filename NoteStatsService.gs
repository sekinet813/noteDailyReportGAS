var NoteStatsService = (function () {
  var instance;
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
        sheet.appendRow(["id", "記事タイトル", "記事URL", "PV数", "スキ数"]);
      }
    }
    return sheet;
  };

  NoteStatsService.prototype.fetchNoteDataIntoSheet = function (sheet, dateStr) {
    sheet.clear();
    sheet.appendRow(["id", "記事タイトル", "記事URL", "PV数", "スキ数"]);
    var page = 1, totalPv = 0, totalLike = 0;
    while (true) {
      var url = "https://note.com/api/v1/stats/pv?filter=all&page=" + page + "&sort=pv";
      var options = {
        method: 'get',
        headers: { 'Cookie': this.cookie },
        muteHttpExceptions: true
      };
      var response = UrlFetchApp.fetch(url, options);
      var json = JSON.parse(response.getContentText());
      var articles = json && json.data && json.data.note_stats ? json.data.note_stats : [];
      Logger.log("ページ" + page + ": 取得記事数=" + articles.length);

      if (!articles.length) break;

      for (var i = 0; i < articles.length; i++) {
        var a = articles[i];
        var pv = a.read_count, like = a.like_count;
        var url2 = "https://note.com/" + a.user.urlname + "/n/" + a.key;
        sheet.appendRow([a.id, a.name, url2, pv, like]);
        totalPv += pv;
        totalLike += like;
      }
      if (articles.length < 12) break;
      page++;
      Utilities.sleep(300);
    }
    sheet.appendRow([dateStr + " sum", "【合計】", "", totalPv, totalLike]);
  };

  NoteStatsService.prototype.getStatsData = function (ss, dateStr) {
    var sheet = ss.getSheetByName(dateStr);
    if (!sheet) return [];
    var values = sheet.getDataRange().getValues();
    return values.slice(1); // 1行目はヘッダ
  };

  return NoteStatsService;
})();
