function MailNotifier(config) {
  this.recipient = config.recipient;
}
MailNotifier.prototype.send = function (subject, body) {
  MailApp.sendEmail({
    to: this.recipient,
    subject: subject,
    body: body
  });
};
