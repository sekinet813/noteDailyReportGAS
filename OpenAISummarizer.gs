function OpenAISummarizer(apiKey) {
  this.apiKey = apiKey;
}

OpenAISummarizer.prototype.summarize = function (promptText) {
  var payload = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "noteのアクセスレポートを要約してください。" },
      { role: "user", content: promptText }
    ],
    temperature: 0.7,
    max_tokens: 300
  };

  var options = {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + this.apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  var res = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", options);
  var json = JSON.parse(res.getContentText());
  return json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content
    ? json.choices[0].message.content.trim()
    : "要約の取得に失敗しました。";
};
