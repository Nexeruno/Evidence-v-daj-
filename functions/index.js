require('dotenv').config();
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const cors = require('cors')({ origin: true });

const ADMIN_EMAIL = 'danzby@seznam.cz';
const REGION = 'europe-west1';

admin.initializeApp();
const db = admin.firestore();

// ═══════════════════════════════════════════════════════════════════════════════
// 🛡️ UTILITY FUNCTIONS - Bezpečnost & Validace
// ═══════════════════════════════════════════════════════════════════════════════

const verifyAuth = async (token) => {
  if (!token) throw new Error('Chybí autentifikace');
  return await admin.auth().verifyIdToken(token);
};

const verifyAdmin = async (decodedToken) => {
  if (decodedToken.email === ADMIN_EMAIL) return true;
  const adminDoc = await db.doc(`users/${decodedToken.uid}`).get();
  return adminDoc.data()?.role === 'admin';
};

const validateEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const getTodayDate = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const getYesterdayDate = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  return yesterday;
};

// ═══════════════════════════════════════════════════════════════════════════════
// 📧 EMAIL TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// 🔄 RECURRING TRANSACTIONS HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function shouldGenerateToday(today, lastGenerated, recurring) {
  if (!today || !lastGenerated || !recurring) return false;

  const lastGen = new Date(lastGenerated);
  lastGen.setHours(0, 0, 0, 0);

  const type = recurring.recurrenceType;
  const freq = Math.max(1, recurring.recurrenceFrequency || 1);

  const getDateDiff = (d1, d2) => Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
  const getMonthDiff = (d1, d2) => (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  const getYearDiff = (d1, d2) => d2.getFullYear() - d1.getFullYear();

  switch (type) {
    case 'daily':
      return getDateDiff(lastGen, today) >= freq;

    case 'weekly': {
      const dayOfWeek = today.getDay();
      const recurDays = recurring.recurrenceDays || [0];
      return recurDays.includes(dayOfWeek) && getDateDiff(lastGen, today) >= 7 * freq;
    }

    case 'monthly': {
      const dayOfMonth = today.getDate();
      let recurDay = recurring.recurrenceDay || 1;
      if (recurDay === 30) {
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        recurDay = lastDayOfMonth;
      }
      return dayOfMonth === recurDay && getMonthDiff(lastGen, today) >= freq;
    }

    case 'yearly': {
      const isSameDay = today.getMonth() === lastGen.getMonth() && today.getDate() === lastGen.getDate();
      return isSameDay && getYearDiff(lastGen, today) >= freq;
    }

    default:
      return false;
  }
}

async function generateTransactionsForUser(uid, today, forceTest = false) {
  const recurringSnap = await db.collection('users').doc(uid).collection('repeatingTransactions').get();
  const yesterday = getYesterdayDate();
  let generatedCount = 0;
  const errors = [];

  for (const recurringDoc of recurringSnap.docs) {
    const recurring = recurringDoc.data();

    // Skip checks
    if (!recurring.isActive) {
      console.log(`ℹ️  Přeskakuji vypnutou transakci: ${recurring.title}`);
      continue;
    }

    if (recurring.recurrenceEndDate) {
      const endDate = recurring.recurrenceEndDate.toDate?.() || new Date(recurring.recurrenceEndDate);
      if (today > endDate) {
        console.log(`ℹ️  Přeskakuji - skončení platnosti: ${recurring.title}`);
        continue;
      }
    }

    // Validace dat
    if (!recurring.title?.trim()) {
      errors.push(`Chybí název v ${recurringDoc.id}`);
      continue;
    }

    if (!recurring.amount || recurring.amount <= 0) {
      errors.push(`Neplatná částka v ${recurring.title}`);
      continue;
    }

    if (!['vydaj', 'prijem'].includes(recurring.type)) {
      errors.push(`Neplatný typ v ${recurring.title}`);
      continue;
    }

    // Logika generování
    const lastGenerated = forceTest ? yesterday : (recurring.lastGeneratedDate?.toDate?.() || new Date(recurring.lastGeneratedDate));
    const shouldGenerate = shouldGenerateToday(today, lastGenerated, recurring);

    if (!shouldGenerate) continue;

    // Vytvoř pending
    const pending = {
      title: recurring.title,
      type: recurring.type,
      amount: recurring.amount,
      category: recurring.category,
      recurringId: recurringDoc.id,
      status: 'pending',
      createdAt: new Date(),
      generatedDate: today,
    };

    await db.collection('users').doc(uid).collection('pendingTransactions').add(pending);
    await db.collection('users').doc(uid).collection('repeatingTransactions').doc(recurringDoc.id).update({ lastGeneratedDate: today });

    generatedCount++;
    console.log(`✓ Vygenerováno: ${recurring.title}`);
  }

  return { generatedCount, errors };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔐 ADMIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

exports.posliResetHesla = functions.region(REGION).https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const data = req.method === 'POST' ? req.body : req.query;
      const email = (data.email || '').trim().toLowerCase();

      if (!email) return res.status(400).json({ error: 'Email je povinný' });
      if (!validateEmail(email)) return res.status(400).json({ error: 'Neplatný formát emailu' });

      console.log('🔄 Reset hesla pro:', email);

      const link = await admin.auth().generatePasswordResetLink(email);
      const apiKey = process.env.BREVO_API_KEY;
      const sender = process.env.BREVO_SENDER;

      if (!apiKey || !sender) return res.status(500).json({ error: 'Brevo config chybí' });

      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Evidence Výdajů', email: sender },
          to: [{ email }],
          subject: 'Reset hesla — Evidence Výdajů',
          htmlContent: EMAIL_HTML(link),
        }),
      });

      if (!brevoRes.ok) return res.status(500).json({ error: 'Chyba odesílání emailu' });
      res.status(200).json({ ok: true });
    } catch (err) {
      if (err?.code === 'auth/user-not-found') return res.status(200).json({ ok: true });
      console.error('posliResetHesla error:', err);
      res.status(500).json({ error: err.message || 'Interní chyba' });
    }
  });
});

exports.smazUzivatele = functions.region(REGION).https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { uid, idToken } = req.body;
      if (!uid || !idToken) return res.status(400).json({ error: 'uid a idToken jsou povinné' });

      const decodedToken = await verifyAuth(idToken);
      if (!(await verifyAdmin(decodedToken))) return res.status(403).json({ error: 'Nemáš oprávnění' });

      console.log('🗑️ Smazávám uživatele:', uid);

      const batch = db.batch();
      const vydaje = await db.collection(`users/${uid}/vydaje`).get();
      const prijmy = await db.collection(`users/${uid}/prijmy`).get();
      const repeating = await db.collection(`users/${uid}/repeatingTransactions`).get();
      const pending = await db.collection(`users/${uid}/pendingTransactions`).get();

      // Smaž kolekce
      [vydaje, prijmy, repeating, pending].forEach(snap => snap.forEach(doc => batch.delete(doc.ref)));

      // Smaž user + username mapping
      const userDoc = await db.doc(`users/${uid}`).get();
      batch.delete(userDoc.ref);
      if (userDoc.data()?.usernameLower) batch.delete(db.doc(`usernames/${userDoc.data().usernameLower}`));

      await batch.commit();
      await admin.auth().deleteUser(uid);

      console.log('✓ Uživatel smazán:', uid);
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('smazUzivatele error:', err);
      res.status(500).json({ error: err.message });
    }
  });
});

exports.zablokujUzivatele = functions.region(REGION).https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { uid, blocked, idToken } = req.body;
      if (!uid || blocked === undefined || !idToken) {
        return res.status(400).json({ error: 'uid, blocked a idToken jsou povinné' });
      }

      const decodedToken = await verifyAuth(idToken);
      if (!(await verifyAdmin(decodedToken))) return res.status(403).json({ error: 'Nemáš oprávnění' });

      console.log('🔒 Blokuji uživatele:', uid, blocked);
      await admin.auth().updateUser(uid, { disabled: blocked });
      await db.doc(`users/${uid}`).update({ disabled: blocked });

      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('zablokujUzivatele error:', err);
      res.status(500).json({ error: err.message });
    }
  });
});

exports.aktualizujUzivatele = functions.region(REGION).https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { uid, username, email, idToken } = req.body;
      if (!uid || !idToken) return res.status(400).json({ error: 'uid a idToken jsou povinné' });

      const decodedToken = await verifyAuth(idToken);
      if (!(await verifyAdmin(decodedToken))) return res.status(403).json({ error: 'Nemáš oprávnění' });

      console.log('✏️ Aktualizuji uživatele:', uid);

      const updates = {};
      const oldUserDoc = await db.doc(`users/${uid}`).get();

      if (username) {
        const usernameLower = username.toLowerCase();
        updates.username = username;
        updates.usernameLower = usernameLower;
        if (oldUserDoc.data()?.usernameLower && oldUserDoc.data().usernameLower !== usernameLower) {
          await db.doc(`usernames/${oldUserDoc.data().usernameLower}`).delete().catch(() => {});
        }
        await db.doc(`usernames/${usernameLower}`).set({ email: email || oldUserDoc.data()?.email, uid });
      }

      if (email) {
        await admin.auth().updateUser(uid, { email });
        updates.email = email;
      }

      if (Object.keys(updates).length > 0) await db.doc(`users/${uid}`).update(updates);
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('aktualizujUzivatele error:', err);
      res.status(500).json({ error: err.message });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 🔄 RECURRING TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

exports.generateRecurringTransactions = functions
  .region(REGION)
  .pubsub.schedule('0 2 * * *')
  .timeZone('Europe/Prague')
  .onRun(async () => {
    try {
      console.log('🔄 Spouštím generování opakujících se transakcí...');
      const today = getTodayDate();
      const usersSnap = await db.collection('users').get();
      let totalGenerated = 0;

      for (const userDoc of usersSnap.docs) {
        const { generatedCount } = await generateTransactionsForUser(userDoc.id, today, false);
        totalGenerated += generatedCount;
      }

      console.log(`✅ Generování hotovo. Vygenerováno ${totalGenerated} záznamů.`);
      return { success: true, generated: totalGenerated };
    } catch (err) {
      console.error('❌ Chyba při generování:', err);
      return { success: false, error: err.message };
    }
  });

exports.testGenerateRecurring = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      console.log('🧪 testGenerateRecurring: quick actions endpoint');
      const token = req.headers.authorization?.split('Bearer ')[1];
      const decodedToken = await verifyAuth(token);

      console.log(`🧪 TEST: Generuji pro uživatele ${decodedToken.uid}...`);
      const today = getTodayDate();
      const { generatedCount, errors } = await generateTransactionsForUser(decodedToken.uid, today, true);

      const hasErrors = errors && errors.length > 0;
      res.status(200).json({
        status: hasErrors ? 'PARTIAL_SUCCESS' : 'SUCCESS',
        message: generatedCount > 0
          ? `Vygenerováno ${generatedCount} záznamů ke schválení`
          : 'Žádné opakující se transakce k vygenerování',
        details: {
          generated: generatedCount,
          errors: errors && errors.length > 0 ? errors : undefined,
          errorCount: errors ? errors.length : 0,
        }
      });
    } catch (err) {
      console.error('❌ TEST error:', err);
      res.status(200).json({
        status: 'FAILED',
        message: err.message,
        details: { error: err.message }
      });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DEBUG & HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

exports.debugRecurring = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const token = req.headers.authorization?.split('Bearer ')[1];
      const decodedToken = await verifyAuth(token);
      if (!(await verifyAdmin(decodedToken))) return res.status(403).json({ error: '🔐 Jen admin!' });
      const uid = decodedToken.uid;
      const today = getTodayDate();

      const recurringSnap = await db.collection('users').doc(uid).collection('repeatingTransactions').get();
      const pendingSnap = await db.collection('users').doc(uid).collection('pendingTransactions').get();

      const recurringList = [];
      const issues = [];

      for (const doc of recurringSnap.docs) {
        const data = doc.data();
        recurringList.push({
          id: doc.id,
          title: data.title,
          type: data.type,
          amount: data.amount,
          category: data.category,
          recurrenceType: data.recurrenceType,
          isActive: data.isActive,
          lastGeneratedDate: data.lastGeneratedDate?.toDate?.()?.toISOString?.() || 'CHYBÍ',
        });

        if (!data.title?.trim()) issues.push(`${doc.id}: Chybí název`);
        if (!data.amount || data.amount <= 0) issues.push(`${doc.id}: Neplatná částka`);
        if (!['vydaj', 'prijem'].includes(data.type)) issues.push(`${doc.id}: Neplatný typ`);

        const lastGen = data.lastGeneratedDate?.toDate?.() || new Date(data.lastGeneratedDate);
        const lastGenDate = new Date(lastGen);
        lastGenDate.setHours(0, 0, 0, 0);

        if (lastGenDate.getTime() === today.getTime()) {
          issues.push(`${doc.id} (${data.title}): Už byla vygenerována DNES`);
        }
      }

      const hasIssues = issues.length > 0 && issues[0] !== 'Žádné problémy!';
      res.status(200).json({
        status: hasIssues ? 'PARTIAL_SUCCESS' : 'SUCCESS',
        message: hasIssues
          ? `Nalezeno ${issues.length} problémů`
          : 'Vše je v pořádku',
        details: {
          today: today.toISOString().split('T')[0],
          recurringCount: recurringSnap.size,
          pendingCount: pendingSnap.size,
          issues: issues,
          recurringList: recurringList,
        }
      });
    } catch (err) {
      console.error('❌ DEBUG error:', err);
      res.status(200).json({
        status: 'FAILED',
        message: err.message,
        details: { error: err.message }
      });
    }
  });
});

exports.healthCheck = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const checks = { timestamp: new Date().toISOString(), services: {} };

      try {
        await admin.auth().getUser('test-nonexistent-user').catch(() => {});
        checks.services.auth = { status: 'ok' };
      } catch (err) {
        checks.services.auth = { status: 'error', message: err.message };
      }

      try {
        await db.collection('users').limit(1).get();
        checks.services.firestore = { status: 'ok' };
      } catch (err) {
        checks.services.firestore = { status: 'error', message: err.message };
      }

      const allOk = Object.values(checks.services).every(s => s.status === 'ok');
      res.status(allOk ? 200 : 503).json({ healthy: allOk, ...checks });
    } catch (err) {
      console.error('❌ HEALTH CHECK error:', err);
      res.status(503).json({ healthy: false, timestamp: new Date().toISOString(), error: err.message });
    }
  });
});

// 📊 DEVOPS MONITORING - Metriky pro AI/MLOps
exports.metrics = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      // Check admin
      const token = req.headers.authorization?.split('Bearer ')[1];
      if (token) {
        const decodedToken = await verifyAuth(token);
        if (!(await verifyAdmin(decodedToken))) return res.status(403).json({ error: '🔐 Jen admin!' });
      } else {
        return res.status(401).json({ error: 'Autentifikace vyžadována' });
      }

      const startTime = Date.now();

      // Počty
      const usersSnap = await db.collection('users').get();
      const allPending = [];
      const allRecurring = [];
      let totalTransactions = 0;

      for (const userDoc of usersSnap.docs) {
        const pendingSnap = await db.collection('users').doc(userDoc.id).collection('pendingTransactions').get();
        const recurringSnap = await db.collection('users').doc(userDoc.id).collection('repeatingTransactions').get();
        const vydajeSnap = await db.collection('users').doc(userDoc.id).collection('vydaje').get();
        const prijmySnap = await db.collection('users').doc(userDoc.id).collection('prijmy').get();

        allPending.push(...pendingSnap.docs.map(d => ({ ...d.data(), uid: userDoc.id })));
        allRecurring.push(...recurringSnap.docs.map(d => ({ ...d.data(), uid: userDoc.id })));
        totalTransactions += vydajeSnap.size + prijmySnap.size;
      }

      const metricsData = {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        metrics: {
          users: {
            total: usersSnap.size,
          },
          transactions: {
            total: totalTransactions,
            pending: allPending.length,
            recurring: allRecurring.length,
          },
          pending: {
            count: allPending.length,
            byType: {
              vydaj: allPending.filter(p => p.type === 'vydaj').length,
              prijem: allPending.filter(p => p.type === 'prijem').length,
            },
            totalAmount: {
              vydaj: allPending.filter(p => p.type === 'vydaj').reduce((s, p) => s + (p.amount || 0), 0),
              prijem: allPending.filter(p => p.type === 'prijem').reduce((s, p) => s + (p.amount || 0), 0),
            },
          },
          recurring: {
            count: allRecurring.length,
            byType: {
              daily: allRecurring.filter(r => r.recurrenceType === 'daily').length,
              weekly: allRecurring.filter(r => r.recurrenceType === 'weekly').length,
              monthly: allRecurring.filter(r => r.recurrenceType === 'monthly').length,
              yearly: allRecurring.filter(r => r.recurrenceType === 'yearly').length,
            },
            active: allRecurring.filter(r => r.isActive).length,
          },
        },
        performance: {
          responseTimeMs: Date.now() - startTime,
        },
      };

      res.status(200).json(metricsData);
    } catch (err) {
      console.error('❌ METRICS error:', err);
      res.status(500).json({ error: err.message, timestamp: new Date().toISOString() });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 📧 HELPER - sendEmail (DRY email sending)
// ═══════════════════════════════════════════════════════════════════════════════

const sendEmail = async (to, subject, htmlContent) => {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER;

  if (!apiKey || !sender) throw new Error('Brevo config chybí');

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Evidence Výdajů', email: sender },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  });

  if (!res.ok) throw new Error(`Brevo error: ${res.status}`);
  return res.json();
};

// ═══════════════════════════════════════════════════════════════════════════════
// 🚨 ALERT EMAIL TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════════

const ALERT_EMAIL_HTML = (alerts, timestamp) => {
  const severityColor = alerts.some(a => a.severity === 'error') ? '#ef4444' : '#f59e0b';
  const severityEmoji = alerts.some(a => a.severity === 'error') ? '🚨' : '⚠️';

  const alertRows = alerts.map(a => `
    <tr>
      <td style="padding:12px;border-bottom:1px solid #e5e7eb">
        <strong style="color:${severityColor}">${a.severity.toUpperCase()}</strong> — ${a.message}
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table width="500" style="max-width:500px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
        <tr>
          <td style="background:linear-gradient(135deg,${severityColor},#f97316);padding:32px;text-align:center">
            <div style="font-size:36px;margin-bottom:8px">${severityEmoji}</div>
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">Evidence Výdajů — Alert</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px">Zjištěno ${alerts.length} ${alerts.length === 1 ? 'upozornění' : 'upozornění'}</h2>
            <p style="margin:0 0 20px;color:#64748b;line-height:1.6;font-size:14px">
              ${new Date(timestamp).toLocaleString('cs-CZ')}
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
              ${alertRows}
            </table>
            <p style="margin:24px 0 0;color:#64748b;font-size:13px;text-align:center;line-height:1.6">
              👉 <strong>Zkontroluj DevOps panel v aplikaci</strong> pro více detailů a možnost označit upozornění jako vyřešené.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

// ═══════════════════════════════════════════════════════════════════════════════
// ⏰ SCHEDULED MONITORING - Každou hodinu
// ═══════════════════════════════════════════════════════════════════════════════

exports.hourlyHealthMonitor = functions
  .region(REGION)
  .pubsub.schedule('0 * * * *')
  .timeZone('Europe/Prague')
  .onRun(async () => {
    const alerts = [];

    try {
      console.log('🔍 Spouštím hourlyHealthMonitor...');

      // Check 1: Firebase Auth dostupnost
      try {
        await admin.auth().listUsers(1);
        console.log('✓ Firebase Auth OK');
      } catch (e) {
        alerts.push({
          type: 'AUTH_ERROR',
          severity: 'error',
          message: `Firebase Auth error: ${e.message}`,
        });
        console.error('❌ Firebase Auth failed:', e.message);
      }

      // Check 2: Firestore dostupnost
      try {
        await db.collection('users').limit(1).get();
        console.log('✓ Firestore OK');
      } catch (e) {
        alerts.push({
          type: 'FIRESTORE_ERROR',
          severity: 'error',
          message: `Firestore error: ${e.message}`,
        });
        console.error('❌ Firestore failed:', e.message);
      }

      // Check 3: Pending transakce zaseknuté >24h
      const cutoff24h = new Date(Date.now() - 86400000);
      const usersSnap = await db.collection('users').get();

      for (const userDoc of usersSnap.docs) {
        try {
          const pendingSnap = await db.collection('users')
            .doc(userDoc.id)
            .collection('pendingTransactions')
            .where('createdAt', '<', cutoff24h)
            .get();

          if (!pendingSnap.empty) {
            alerts.push({
              type: 'STUCK_PENDING',
              severity: 'warning',
              message: `${userDoc.data().username}: ${pendingSnap.size} zaseknutých transakcí (>24h)`,
              uid: userDoc.id,
              count: pendingSnap.size,
            });
          }
        } catch (e) {
          console.error(`Error checking pending for user ${userDoc.id}:`, e);
        }
      }

      // Check 4: Opakované transakce negenerující >48h
      const cutoff48h = new Date(Date.now() - 172800000);

      for (const userDoc of usersSnap.docs) {
        try {
          const recurSnap = await db.collection('users')
            .doc(userDoc.id)
            .collection('repeatingTransactions')
            .where('isActive', '==', true)
            .where('lastGeneratedDate', '<', cutoff48h)
            .get();

          if (!recurSnap.empty) {
            alerts.push({
              type: 'RECURRING_STALE',
              severity: 'warning',
              message: `${userDoc.data().username}: ${recurSnap.size} opakovaných transakcí negeneruje (>48h)`,
              uid: userDoc.id,
              count: recurSnap.size,
            });
          }
        } catch (e) {
          console.error(`Error checking recurring for user ${userDoc.id}:`, e);
        }
      }

      // Check 5: Blokovaný uživatel s recent login (anomálie)
      const cutoff1h = new Date(Date.now() - 3600000);

      for (const userDoc of usersSnap.docs) {
        const data = userDoc.data();
        if (data.disabled && data.lastLogin?.toDate?.() > cutoff1h) {
          alerts.push({
            type: 'AUTH_ANOMALY',
            severity: 'error',
            message: `🚨 ANOMÁLIE: Blokovaný uživatel "${data.username}" se přihlásil v poslední hodině!`,
            uid: userDoc.id,
          });
        }
      }

      // Pokud nic → SILENT (nic se nestane)
      if (alerts.length === 0) {
        console.log('✓ Všechny kontroly prošly bez problémů');
        return null;
      }

      // ALERT!
      console.log(`⚠️ Nalezeno ${alerts.length} problémů`);

      // Uložit do Firestore
      const alertDoc = {
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        severity: alerts.some(a => a.severity === 'error') ? 'error' : 'warning',
        alerts,
        resolved: false,
      };

      const docId = new Date().toISOString();
      await db.collection('systemAlerts').doc(docId).set(alertDoc);
      console.log(`✓ Alert uložen do Firestore: ${docId}`);

      // Poslat email
      const html = ALERT_EMAIL_HTML(alerts, new Date());
      await sendEmail(ADMIN_EMAIL, `🚨 Evidence Výdajů — ${alerts.length} alert(ů)`, html);
      console.log('✓ Email odeslán');

      return null;
    } catch (err) {
      console.error('❌ hourlyHealthMonitor error:', err);
      // Pošli alert o selhání samotného monitoru
      try {
        const errorAlert = [{
          type: 'MONITOR_ERROR',
          severity: 'error',
          message: `Selhání monitoru: ${err.message}`,
        }];
        const html = ALERT_EMAIL_HTML(errorAlert, new Date());
        await sendEmail(ADMIN_EMAIL, '🚨 Evidence Výdajů — MONITOR ERROR', html);
      } catch (emailErr) {
        console.error('Failed to send error email:', emailErr);
      }
      throw err;
    }
  });

