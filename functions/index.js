require('dotenv').config();
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const cors = require('cors')({ origin: true });

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

exports.posliResetHesla = functions.region('europe-west1').https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const data = req.method === 'POST' ? req.body : req.query;
      const email = (data.email || '').trim().toLowerCase();

      if (!email) {
        return res.status(400).json({ error: 'Email je povinný' });
      }

      console.log('🔄 Reset hesla pro:', email);
      const link = await admin.auth().generatePasswordResetLink(email);
      console.log('✓ Reset link vytvořen');

      const apiKey = process.env.BREVO_API_KEY;
      const sender = process.env.BREVO_SENDER;

      if (!apiKey || !sender) {
        console.error('❌ Config chybí - BREVO_API_KEY:', !!apiKey, 'BREVO_SENDER:', !!sender);
        return res.status(500).json({ error: 'Brevo config chybí' });
      }

      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Evidence Výdajů', email: sender },
          to: [{ email }],
          subject: 'Reset hesla — Evidence Výdajů',
          htmlContent: EMAIL_HTML(link),
        }),
      });

      if (!brevoRes.ok) {
        const err = await brevoRes.text();
        console.error('Brevo error:', brevoRes.status, err);
        return res.status(500).json({ error: 'Chyba odesílání emailu' });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      if (err?.code === 'auth/user-not-found') {
        return res.status(200).json({ ok: true });
      }
      console.error('posliResetHesla error:', err);
      return res.status(500).json({ error: err.message || 'Interní chyba' });
    }
  });
});
