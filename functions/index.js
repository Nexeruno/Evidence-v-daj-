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
// 🔄 RECURRING TRANSACTIONS HELPERS - Bez duplikátů!
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

    // Duplikát check
    const existingPending = await db
      .collection('users').doc(uid).collection('pendingTransactions')
      .where('recurringId', '==', recurringDoc.id)
      .where('generatedDate', '==', today)
      .get();

    if (existingPending.size > 0) {
      console.log(`⚠️  Duplikát - ${recurring.title} je již pending na dnešek`);
      continue;
    }

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
// 🔄 RECURRING TRANSACTIONS - Bez duplikátů!
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
      const token = req.headers.authorization?.split('Bearer ')[1];
      const decodedToken = await verifyAuth(token);

      console.log(`🧪 TEST: Generuji pro uživatele ${decodedToken.uid}...`);
      const today = getTodayDate();
      const { generatedCount, errors } = await generateTransactionsForUser(decodedToken.uid, today, true);

      res.status(200).json({
        success: true,
        generated: generatedCount,
        errors: errors.length > 0 ? errors : undefined,
        message: generatedCount > 0
          ? `Vygenerováno ${generatedCount} záznamů ke schválení! Jdi do Dashboardu.`
          : 'Žádné opakující se transakce k vygenerování.'
      });
    } catch (err) {
      console.error('❌ TEST error:', err);
      res.status(401).json({ error: err.message });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 🧹 CLEANUP & DEBUG & HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

exports.cleanupDuplicates = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const token = req.headers.authorization?.split('Bearer ')[1];
      const decodedToken = await verifyAuth(token);
      if (!(await verifyAdmin(decodedToken))) return res.status(403).json({ error: '🔐 Jen admin!' });
      const uid = decodedToken.uid;

      console.log(`🧹 CLEANUP: Spouštím pro uživatele ${uid}...`);

      let deletedCount = 0;
      let fixedCount = 0;
      const today = getTodayDate();
      const yesterday = getYesterdayDate();

      // Smaž duplikáty v pending
      const pendingSnap = await db.collection('users').doc(uid).collection('pendingTransactions').get();
      const seenTransactions = new Map();
      const toDelete = [];

      pendingSnap.forEach((doc) => {
        const data = doc.data();
        const key = `${data.title}|${data.amount}|${data.category}`;
        if (seenTransactions.has(key)) {
          toDelete.push(doc.ref);
        } else {
          seenTransactions.set(key, doc.id);
        }
      });

      for (const ref of toDelete) {
        await ref.delete();
        deletedCount++;
      }

      // Oprav repeating
      const recurringSnap = await db.collection('users').doc(uid).collection('repeatingTransactions').get();
      for (const doc of recurringSnap.docs) {
        const data = doc.data();
        const updates = {};

        if (!data.title) updates.title = 'Bez názvu';
        if (!data.amount || data.amount <= 0) updates.amount = 0;
        if (!data.category) updates.category = 'Ostatní';
        if (!['vydaj', 'prijem'].includes(data.type)) updates.type = 'vydaj';
        if (!data.recurrenceType) updates.recurrenceType = 'daily';
        if (data.recurrenceFrequency < 1) updates.recurrenceFrequency = 1;
        if (!data.isActive) updates.isActive = true;

        const lastGen = data.lastGeneratedDate?.toDate?.() || new Date(data.lastGeneratedDate);
        const lastGenDate = new Date(lastGen);
        lastGenDate.setHours(0, 0, 0, 0);

        if (lastGenDate.getTime() === today.getTime()) {
          updates.lastGeneratedDate = yesterday;
        }

        if (Object.keys(updates).length > 0) {
          await doc.ref.update(updates);
          fixedCount++;
        }
      }

      res.status(200).json({
        success: true,
        deleted: deletedCount,
        fixed: fixedCount,
        totalPending: pendingSnap.size,
        totalRecurring: recurringSnap.size,
        message: `Smazáno ${deletedCount} duplikátů, opraveno ${fixedCount} opakujících se transakcí`
      });
    } catch (err) {
      console.error('❌ CLEANUP error:', err);
      res.status(401).json({ error: err.message });
    }
  });
});

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

      res.status(200).json({
        success: true,
        today: today.toISOString().split('T')[0],
        recurringCount: recurringSnap.size,
        pendingCount: pendingSnap.size,
        recurringList,
        issues: issues.length > 0 ? issues : ['Žádné problémy!'],
      });
    } catch (err) {
      console.error('❌ DEBUG error:', err);
      res.status(401).json({ error: err.message });
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
