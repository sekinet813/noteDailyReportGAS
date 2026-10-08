var NoteStatsService = (function () {
  var instance;
  // ヘッダー行を定数化
  const HEADER_ROW = ["id", "記事タイトル", "記事URL", "PV数", "スキ数", "前日比（PV数）", "前日比（スキ数）"];

  function NoteStatsService(config) {
    this.cookie = config.cookie;
    this.folderId = config.folderId;
    this.timezone = config.timezone;
    this.startedAt = Date.now();
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
    if (!sheet) sheet = ss.insertSheet(dateStr);
    var key = 'NOTE_DATA_COMPLETE:' + ss.getId() + ':' + dateStr;
    if (createData && PropertiesService.getScriptProperties().getProperty(key) !== '1') {
      this.fetchNoteDataIntoSheet(sheet, dateStr);
      PropertiesService.getScriptProperties().setProperty(key, '1');
    } else if (!createData && sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADER_ROW.length).setValues([HEADER_ROW]);
    }
    return sheet;
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
    if (response.getResponseCode() !== 200) {
      throw new Error('note API HTTP ' + response.getResponseCode() + ' page=' + page);
    }
    const json = JSON.parse(response.getContentText());
    if (!json || !json.data || !Array.isArray(json.data.note_stats)) {
      throw new Error('Invalid note API response page=' + page);
    }
    return json.data.note_stats;
  };

  NoteStatsService.prototype.fetchNoteDataIntoSheet = function (sheet, dateStr) {
    const prevDateStr = new Date(new Date(dateStr).getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    // Fetch the complete snapshot before touching the existing sheet.
    const rows = [HEADER_ROW.slice()], seen = {};
    let page = 1, totalPv = 0, totalLike = 0;
    while (true) {
      this.checkBudget('fetch');
      const started = Date.now();
      const articles = this.fetchArticles(page);
      Logger.log(JSON.stringify({phase: 'note_fetch', page: page, count: articles.length, ms: Date.now() - started}));
      if (!articles.length) break;
      for (let i = 0; i < articles.length; i++) {
        const a = articles[i];
        if (!a || a.id == null || typeof a.name !== 'string' || !a.user ||
            typeof a.user.urlname !== 'string' || typeof a.key !== 'string' ||
            typeof a.read_count !== 'number' || !isFinite(a.read_count) ||
            typeof a.like_count !== 'number' || !isFinite(a.like_count)) {
          throw new Error('Invalid article page=' + page);
        }
        if (seen[a.id]) throw new Error('Duplicate article across API pages: ' + a.id);
        seen[a.id] = true;
        const row = rows.length + 1;
        // Treat API titles as text, never as spreadsheet formulas.
        const title = /^[=+@-]/.test(a.name) ? "'" + a.name : a.name;
        rows.push([a.id, title, 'https://note.com/' + a.user.urlname + '/n/' + a.key,
          a.read_count, a.like_count,
          `=D${row}-VLOOKUP($A${row},'${prevDateStr}'!$A:$E,4, false)`,
          `=E${row}-VLOOKUP($A${row},'${prevDateStr}'!$A:$E,5, false)`]);
        totalPv += a.read_count;
        totalLike += a.like_count;
      }
      if (articles.length < 12) break;
      page++;
      Utilities.sleep(300); // Retain existing pacing until API rate limits are known.
    }
    const row = rows.length + 1;
    rows.push(['sum', '【合計】', '', totalPv, totalLike,
      `=D${row}-VLOOKUP($A${row},'${prevDateStr}'!$A:$E,4, false)`,
      `=E${row}-VLOOKUP($A${row},'${prevDateStr}'!$A:$E,5, false)`]);
    this.checkBudget('write');
    const started = Date.now(), oldLastRow = sheet.getLastRow();
    if (sheet.getMaxRows() < rows.length) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length - sheet.getMaxRows());
    sheet.getRange(1, 1, rows.length, HEADER_ROW.length).setValues(rows);
    if (oldLastRow > rows.length) sheet.getRange(rows.length + 1, 1, oldLastRow - rows.length, HEADER_ROW.length).clearContent();
    SpreadsheetApp.flush();
    Logger.log(JSON.stringify({phase: 'sheet_write', articles: rows.length - 2, ms: Date.now() - started}));
  };

  NoteStatsService.prototype.getStatsData = function (ss, dateStr) {
    const sheet = ss.getSheetByName(dateStr);
    if (!sheet) return [];
    const values = sheet.getDataRange().getValues();
    return values.slice(1); // 1行目はヘッダ
  };

  NoteStatsService.prototype.checkBudget = function (phase) {
    if (Date.now() - this.startedAt > 240000) throw new Error('Time budget exceeded before ' + phase);
  };

  return NoteStatsService;
})();

