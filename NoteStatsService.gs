var NoteStatsService = (function () {
  var instance;
  const HEADER_ROW = ['id', '記事タイトル', '記事URL', 'PV数', 'スキ数', '前日比（PV数）', '前日比（スキ数）'];
  const STATUS_KEY = 'NOTE_SNAPSHOT_V2';
  const UNKNOWN = '比較不可（前日データ欠損）';

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
  NoteStatsService.previousDate = function (dateStr) {
    return new Date(new Date(dateStr + 'T12:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
  };
  function validCount(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  }
  function literal(value) {
    // setValues interprets leading '=' as a formula, even in article titles.
    var text = String(value);
    return text.charAt(0) === '=' ? "'" + text : text;
  }
  NoteStatsService.inspectRows = function (rows) {
    var map = new Map(), sum = null, totalPv = 0, totalLike = 0, valid = rows.length > 0;
    rows.forEach(function (r, index) {
      var id = String(r[0]);
      if (id === 'sum') {
        if (sum || index !== rows.length - 1) valid = false;
        sum = r;
      } else {
        if (!id || map.has(id) || !validCount(r[3]) || !validCount(r[4])) valid = false;
        map.set(id, r);
        totalPv += r[3];
        totalLike += r[4];
      }
    });
    valid = valid && map.size > 0 && !!sum && validCount(sum[3]) && validCount(sum[4]) &&
      sum[3] === totalPv && sum[4] === totalLike;
    return { complete: !!valid, rows: rows, map: map, sum: sum, articleCount: map.size };
  };
  NoteStatsService.prototype.getMonthlySpreadsheet = function (monthStr, createIfMissing) {
    var folder = this.folderId ? DriveApp.getFolderById(this.folderId) : DriveApp.getRootFolder();
    var files = folder.getFilesByName('note_PV_' + monthStr);
    if (files.hasNext()) return SpreadsheetApp.open(files.next());
    if (createIfMissing === false) return null;
    var ss = SpreadsheetApp.create('note_PV_' + monthStr);
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    return ss;
  };
  NoteStatsService.prototype.readSnapshot = function (sheet) {
    if (!sheet) return NoteStatsService.inspectRows([]);
    var values = sheet.getDataRange().getValues();
    var snapshot = NoteStatsService.inspectRows(values.slice(1));
    if (HEADER_ROW.some(function (h, i) { return values[0][i] !== h; })) snapshot.complete = false;
    var markers = sheet.getDeveloperMetadata().filter(function (m) { return m.getKey() === STATUS_KEY; });
    if (markers.length) {
      // An interrupted new writer must never be accepted as a legacy complete snapshot.
      snapshot.complete = snapshot.complete && markers.length === 1 &&
        markers[0].getValue() === 'COMPLETE:' + snapshot.articleCount;
    }
    return snapshot;
  };
  NoteStatsService.prototype.getSnapshot = function (dateStr) {
    var ss = this.getMonthlySpreadsheet(dateStr.slice(0, 7).replace('-', '_'), false);
    return this.readSnapshot(ss ? ss.getSheetByName(dateStr) : null);
  };
  NoteStatsService.prototype.setStatus = function (sheet, value) {
    sheet.getDeveloperMetadata().filter(function (m) { return m.getKey() === STATUS_KEY; })
      .forEach(function (m) { m.remove(); });
    sheet.addDeveloperMetadata(STATUS_KEY, value);
  };
  NoteStatsService.prototype.getOrCreateSheet = function (ss, dateStr, createData) {
    var sheet = ss.getSheetByName(dateStr);
    if (!createData) return sheet; // Never fabricate a historical sheet.
    if (sheet && this.readSnapshot(sheet).complete) return sheet;
    var today = Utilities.formatDate(new Date(), this.timezone, 'yyyy-MM-dd');
    if (dateStr !== today) throw new Error('過去日の累積値は現在のAPIから復元できません: ' + dateStr);
    // Fetch everything first. API errors leave the existing snapshot untouched.
    var started = Date.now();
    var previous = this.getSnapshot(NoteStatsService.previousDate(dateStr));
    var rows = this.buildRows(this.fetchAllArticles(), previous);
    if (Date.now() - started > 240000) throw new Error('書込開始前に取得時間上限を超えました');
    if (Utilities.formatDate(new Date(), this.timezone, 'yyyy-MM-dd') !== dateStr) {
      throw new Error('取得中に日付が変わったため保存を中止しました');
    }
    if (sheet) {
      // Preserve all partial values/formulas before replacing today's interrupted capture.
      var backup = sheet.copyTo(ss);
      backup.setName(dateStr + '_partial_' + Utilities.getUuid().slice(0, 8));
      Logger.log('部分データ保全: sheetId=' + backup.getSheetId());
    } else {
      sheet = ss.insertSheet(dateStr);
    }
    if (sheet.getMaxRows() < rows.length + 1) {
      sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 1 - sheet.getMaxRows());
    }
    this.checkBudget('write');
    this.setStatus(sheet, 'WRITING');
    sheet.clearContents();
    sheet.getRange(1, 1, rows.length + 1, HEADER_ROW.length).setValues([HEADER_ROW].concat(rows));
    SpreadsheetApp.flush();
    var persisted = sheet.getDataRange().getValues();
    var saved = persisted.slice(1);
    var inspected = NoteStatsService.inspectRows(saved);
    // Read back every persisted cell; a total alone cannot prove a successful write.
    if (HEADER_ROW.some(function (h, i) { return persisted[0][i] !== h; }) ||
      !inspected.complete || saved.length !== rows.length || rows.some(function (r, i) {
      return r.some(function (v, j) { return String(saved[i][j]) !== String(v).replace(/^'(?==)/, ''); });
    })) throw new Error('日次データの書込検証に失敗しました');
    this.setStatus(sheet, 'COMPLETE:' + inspected.articleCount);
    if (!this.readSnapshot(sheet).complete) throw new Error('完了状態の読戻しに失敗しました');
    PropertiesService.getScriptProperties().setProperty('NOTE_DATA_COMPLETE:' + ss.getId() + ':' + dateStr, '1');
    Logger.log(JSON.stringify({phase: 'sheet_write', articles: inspected.articleCount, ms: Date.now() - started}));
    return sheet;
  };
  NoteStatsService.prototype.fetchArticles = function (page) {
    var response = UrlFetchApp.fetch('https://note.com/api/v1/stats/pv?filter=all&page=' + page + '&sort=pv', {
      method: 'get', headers: { Cookie: this.cookie }, muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) throw new Error('note API HTTP ' + response.getResponseCode() + ' page=' + page);
    var json;
    try { json = JSON.parse(response.getContentText()); }
    catch (error) { throw new Error('note API JSON不正 page=' + page); }
    if (!json || !json.data || !Array.isArray(json.data.note_stats)) {
      throw new Error('note API 応答形式不正 page=' + page);
    }
    return json.data.note_stats;
  };
  NoteStatsService.prototype.fetchAllArticles = function () {
    var articles = [], ids = new Set(), start = Date.now();
    for (var page = 1; page <= 500; page++) {
      if (Date.now() - start > 240000) throw new Error('取得時間上限に近づいたため保存前に停止しました');
      this.checkBudget('fetch');
      var pageStarted = Date.now();
      var chunk = this.fetchArticles(page);
      Logger.log(JSON.stringify({phase: 'note_fetch', page: page, count: chunk.length, ms: Date.now() - pageStarted}));
      if (!chunk.length) {
        if (!articles.length) throw new Error('記事が0件のため誤った空集計の保存を中止しました');
        return articles;
      }
      chunk.forEach(function (a) {
        if (!a || a.id == null || !String(a.id) || ids.has(String(a.id)) ||
          !validCount(a.read_count) || !validCount(a.like_count) || typeof a.name !== 'string' ||
          !a.user || typeof a.user.urlname !== 'string' || typeof a.key !== 'string') {
          throw new Error('note API 記事の重複または不正な値 page=' + page);
        }
        ids.add(String(a.id)); articles.push(a);
      });
      // Confirm exhaustion with an empty page; do not assume an undocumented page size.
      Utilities.sleep(300);
    }
    throw new Error('取得ページ上限に達したため保存を中止しました');
  };
  NoteStatsService.prototype.buildRows = function (articles, previous) {
    var totalPv = 0, totalLike = 0;
    var rows = articles.map(function (a) {
      var before = previous.complete ? previous.map.get(String(a.id)) : null;
      totalPv += a.read_count; totalLike += a.like_count;
      return [a.id, literal(a.name), 'https://note.com/' + encodeURIComponent(a.user.urlname) + '/n/' + encodeURIComponent(a.key),
        a.read_count, a.like_count, before ? a.read_count - before[3] : UNKNOWN, before ? a.like_count - before[4] : UNKNOWN];
    });
    rows.push(['sum', '【合計】', '', totalPv, totalLike,
      previous.complete ? totalPv - previous.sum[3] : UNKNOWN,
      previous.complete ? totalLike - previous.sum[4] : UNKNOWN]);
    return rows;
  };
  NoteStatsService.prototype.getStatsData = function (ss, dateStr) {
    var sheet = ss.getSheetByName(dateStr);
    return sheet ? sheet.getDataRange().getValues().slice(1) : [];
  };
  NoteStatsService.prototype.checkBudget = function (phase) {
    if (Date.now() - this.startedAt > 240000) throw new Error('Time budget exceeded before ' + phase);
  };
  return NoteStatsService;
})();
