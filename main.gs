function sendNoteDailySummary() {
  var config = Config.getInstance();
  var note = NoteStatsService.getInstance(config);
  var report = new ReportGenerator(note, config);
  var notifier = new MailNotifier(config);

  var subject = report.getSubject();
  var body = report.getBody();

  // --- ChatGPT要約を使う場合 ---
  // var summarizer = new OpenAISummarizer(config.openaiKey);
  // var prompt = "noteの記事PVおよびスキ数の前日比の変化は以下の通りです。\n\n" + body + "\n\nこの変化について簡潔に要約してください。";
  // var summary = summarizer.summarize(prompt);
  // body += "\n\n📝 ChatGPT要約：\n" + summary;

  notifier.send(subject, body);

  Logger.log("メール送信完了：" + config.recipient);
}
