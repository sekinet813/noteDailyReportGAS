function sendNoteDailySummary() {
  var started = Date.now();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) { Logger.log('Skipped: another execution is running'); return; }
  try {
  var config = Config.getInstance();
  var props = PropertiesService.getScriptProperties();
  var day = Utilities.formatDate(new Date(started), config.timezone, 'yyyy-MM-dd');
  var mailKey = 'NOTE_MAIL:' + day;
  var state = props.getProperty(mailKey);
  if (state === 'SENT' || state === 'SENDING') {
    Logger.log('Skipped: mail state=' + state + ' date=' + day);
    return;
  }
  var note = NoteStatsService.getInstance(config);
  var reportStarted = Date.now();
  var report = new ReportGenerator(note, config);
  Logger.log(JSON.stringify({phase: 'report_build', ms: Date.now() - reportStarted}));
  var notifier = new MailNotifier(config);

  var subject = report.getSubject();
  var body = report.getBody();

  // --- ChatGPT要約を使う場合 ---
  // var summarizer = new OpenAISummarizer(config.openaiKey);
  // var prompt = "noteの記事PVおよびスキ数の前日比の変化は以下の通りです。\n\n" + body + "\n\nこの変化について簡潔に要約してください。";
  // var summary = summarizer.summarize(prompt);
  // body += "\n\n📝 ChatGPT要約：\n" + summary;

  note.checkBudget('mail');
  // Persist BEFORE sending: an uncertain send must not be automatically retried.
  props.setProperty(mailKey, 'SENDING');
  notifier.send(subject, body);
  props.setProperty(mailKey, 'SENT');

  Logger.log(JSON.stringify({phase: 'complete', date: day, ms: Date.now() - started}));
  } finally {
    lock.releaseLock();
  }
}

