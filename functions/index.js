const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();

const EMAIL_HTML = (link) => `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table width="500" style="max-width:500px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
        <tr>
          <td style="background:linear-gradient(135deg,#3b82f6,#8b5cf6);padding:32px;text-align:center">
            <div style="font-size:36px;margin-bottom:8px">💰</div>
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">Evidence Výdajů</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <h2 style="margin:0 0 12px;color:#1e293b;font-size:18px">Reset hesla</h2>
            <p style="margin:0 0 24px;color:#64748b;line-height:1.6;font-size:15px">
              Obdrželi jsme žádost o reset hesla pro váš účet.<br>
              Klikněte na tlačítko níže a vytvořte si nové heslo.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center">
                <a href="${link}"
                   style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600">
                  Resetovat heslo
                </a>
              </td></tr>
            </table>
            <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;text-align:center;line-height:1.6">
              Odkaz je platný 1 hodinu.<br>
              Pokud jste o reset nepožádali, ignorujte tento email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

exports.posliResetHesla = functions.region('europe-west1').https.onCall(async (data, context) => {
  const email = (data.email || '').trim().toLowerCase();
  if (!email) {
    throw new functions.https.HttpsError('invalid-argument', 'Email je povinný');
  }

  try {
    const link = await admin.auth().generatePasswordResetLink(email);

    const cfg = functions.config().brevo;
    if (!cfg || !cfg.api_key || !cfg.sender) {
      throw new functions.https.HttpsError('internal', 'Brevo config chybí');
    }

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': cfg.api_key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Evidence Výdajů', email: cfg.sender },
        to: [{ email }],
        subject: 'Reset hesla — Evidence Výdajů',
        htmlContent: EMAIL_HTML(link),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Brevo error:', res.status, err);
      throw new functions.https.HttpsError('internal', 'Chyba odesílání emailu');
    }

    return { ok: true };
  } catch (err) {
    if (err?.errorInfo?.code === 'auth/user-not-found') return { ok: true };
    if (err instanceof functions.https.HttpsError) throw err;
    console.error('posliResetHesla error:', err);
    throw new functions.https.HttpsError('internal', 'Interní chyba');
  }
});
