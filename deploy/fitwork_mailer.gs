// FitWork Mailer - sends FitWork's emails (verification, password reset, invites) from your Gmail.
// The FitWork server calls this over HTTPS with a secret key; anyone without the key is refused.
const SECRET = 'PUT-THE-SAME-VALUE-AS-EMAIL_WEBHOOK_SECRET-HERE';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.secret !== SECRET) return reply({ ok: false, error: 'forbidden' });
    MailApp.sendEmail({ to: data.to, subject: data.subject, body: data.text, htmlBody: data.html, name: 'FitWork' });
    return reply({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Run this once (Run button) to give the script permission to send email from your account.
function authorize() {
  Logger.log('Emails left today: ' + MailApp.getRemainingDailyQuota());
}
