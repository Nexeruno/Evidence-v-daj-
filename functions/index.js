require('dotenv').config();
const functions = require('firebase-functions/v1');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const cors = require('cors')({
  origin: ['https://nexeruno.github.io', 'http://localhost:5173', 'http://localhost:5176', 'http://localhost:5177', 'http://localhost:5178', 'http://localhost:5179'],
  credentials: true,
});

// FÁZE 5.0A: Import ML Runtime client for external Python server
const mlRuntimeClient = require('./mlRuntimeClient');

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

const checkRateLimit = async (key, maxRequests = 3, windowMinutes = 10) => {
  const docRef = db.collection('_rateLimits').doc(key);
  const doc = await docRef.get();
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;

  if (!doc.exists) {
    await docRef.set({ count: 1, firstRequest: now, expiresAt: new Date(now + windowMs) });
    return true;
  }

  const data = doc.data();
  if (now > data.firstRequest + windowMs) {
    // Window prošel, reset
    await docRef.set({ count: 1, firstRequest: now, expiresAt: new Date(now + windowMs) });
    return true;
  }

  if (data.count >= maxRequests) {
    return false; // Překročen limit
  }

  // Zvýš počet
  await docRef.update({ count: admin.firestore.FieldValue.increment(1) });
  return true;
};

// ═══════════════════════════════════════════════════════════════════════════════
// 🔒 SECURITY - Audit Logging + Rate Limits for AI
// ═══════════════════════════════════════════════════════════════════════════════

const logAdminAction = async (uid, action, details = {}) => {
  try {
    await db.collection('_auditLog').add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      adminUid: uid,
      action,
      details,
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
};

const checkAIRateLimit = async (uid, action, maxPerHour = 100) => {
  const key = `ai-${action}-${uid}-${Math.floor(Date.now() / 3600000)}`;
  return await checkRateLimit(key, maxPerHour, 60);
};

// ═══════════════════════════════════════════════════════════════════════════════
// 📊 ML PIPELINE STAGE TRACKING & LOGGING
// ═══════════════════════════════════════════════════════════════════════════════

const updatePipelineStage = async (runId, stage, progress = null, error = null) => {
  try {
    const update = {
      stage,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (progress) update.progress = progress;
    if (error) update.lastError = error;

    await db.collection('mlPipelineStatus').doc('l2Shadow').update(update);
  } catch (err) {
    logger.warn('[ML_STAGE_TRACK] Failed to update stage:', err.message);
  }
};

const logMlDebug = async (logEntry) => {
  try {
    const { runId, level = 'info', source, stage, message, userId, details } = logEntry;

    const doc = {
      runId,
      level,
      source,
      stage,
      message,
      userId: userId || null,
      details: details || {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('mlDebugLogs').add(doc);
  } catch (err) {
    logger.warn('[ML_DEBUG_LOG] Failed to write log:', err.message);
  }
};

const initPipelineRun = async (triggeredBy) => {
  try {
    const runId = `l2-${Date.now()}`;
    const statusDoc = {
      runId,
      status: 'running',
      stage: 'initializing',
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      finishedAt: null,
      triggeredBy,
      progress: {
        usersTotal: 0,
        usersProcessed: 0,
        predictionsCreated: 0,
        errors: 0,
      },
      lastError: null,
    };

    await db.collection('mlPipelineStatus').doc('l2Shadow').set(statusDoc);
    return runId;
  } catch (err) {
    logger.error('[ML_INIT_RUN] Failed to init pipeline:', err.message);
    throw err;
  }
};

const finalizePipelineRun = async (status, duration, summary = {}) => {
  try {
    const update = {
      status,
      stage: 'completed',
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      durationMs: duration,
      ...summary,
    };

    await db.collection('mlPipelineStatus').doc('l2Shadow').update(update);
  } catch (err) {
    logger.warn('[ML_FINALIZE_RUN] Failed to finalize:', err.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 🔐 IP WHITELISTING - Optional admin security layer
// ═══════════════════════════════════════════════════════════════════════════════

const logAdminIP = async (uid, ipHash) => {
  try {
    const now = new Date();
    const isoDate = now.toISOString().split('T')[0];
    await db.collection('_adminIPLog').doc(`${uid}-${isoDate}`).set({
      uid,
      ipHash,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      count: admin.firestore.FieldValue.increment(1),
    }, { merge: true });
  } catch (err) {
    console.error('IP logging error:', err);
  }
};

const extractClientIP = (req) => {
  // Get IP from headers (works with CloudFlare, nginx, etc)
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-client-ip'] ||
         req.socket?.remoteAddress ||
         'unknown';
};

const hashIP = (ip) => {
  // Simple hash for privacy (don't store full IP)
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
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
    const startTime = Date.now();
    const functionName = 'posliResetHesla';

    try {
      const data = req.method === 'POST' ? req.body : req.query;
      const email = (data.email || '').trim().toLowerCase();
      const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

      logger.info({
        event: 'posliResetHesla_requested',
        status: 'initiated',
        functionName,
        email,
      });

      // Rate limit: max 3× za 10 minut per IP
      const allowed = await checkRateLimit(`reset:${ip}`, 3, 10);
      if (!allowed) return res.status(429).json({ error: 'Příliš mnoho pokusů. Zkuste za 10 minut.' });

      if (!email) return res.status(400).json({ error: 'Email je povinný' });
      if (!validateEmail(email)) return res.status(400).json({ error: 'Neplatný formát emailu' });

      const link = await admin.auth().generatePasswordResetLink(email);
      await sendEmail(email, 'Reset hesla — Evidence Výdajů', EMAIL_HTML(link));

      const durationMs = Date.now() - startTime;
      logger.info({
        event: 'posliResetHesla_success',
        status: 'completed',
        functionName,
        email,
        durationMs,
      });

      res.status(200).json({ ok: true });
    } catch (err) {
      const durationMs = Date.now() - startTime;

      if (err?.code === 'auth/user-not-found') {
        logger.info({
          event: 'posliResetHesla_success',
          status: 'completed',
          functionName,
          durationMs,
          note: 'user not found (treated as success)',
        });
        return res.status(200).json({ ok: true });
      }

      logger.error({
        event: 'posliResetHesla_failed',
        status: 'failed',
        functionName,
        errorMessage: err.message || 'Interní chyba',
        errorCode: err.code || 'UNKNOWN',
        durationMs,
      });

      res.status(500).json({ error: err.message || 'Interní chyba' });
    }
  });
});

exports.smazUzivatele = functions.region(REGION).https.onRequest((req, res) => {
  cors(req, res, async () => {
    const startTime = Date.now();
    const functionName = 'smazUzivatele';

    try {
      const { uid, idToken } = req.body;
      if (!uid || !idToken) return res.status(400).json({ error: 'uid a idToken jsou povinné' });

      const decodedToken = await verifyAuth(idToken);
      const adminUid = decodedToken?.uid;

      if (!(await verifyAdmin(decodedToken))) return res.status(403).json({ error: 'Nemáš oprávnění' });

      logger.info({
        event: 'smazUzivatele_requested',
        status: 'initiated',
        functionName,
        uid,
        adminUid,
      });

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

      const durationMs = Date.now() - startTime;
      logger.info({
        event: 'smazUzivatele_success',
        status: 'completed',
        functionName,
        uid,
        adminUid,
        durationMs,
      });

      res.status(200).json({ ok: true });
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const adminUid = req.body?.idToken ? (await verifyAuth(req.body.idToken))?.uid : 'unknown';

      logger.error({
        event: 'smazUzivatele_failed',
        status: 'failed',
        functionName,
        uid: req.body?.uid,
        adminUid,
        errorMessage: err.message,
        errorCode: err.code || 'UNKNOWN',
        durationMs,
      });

      res.status(500).json({ error: err.message });
    }
  });
});

exports.zablokujUzivatele = functions.region(REGION).https.onRequest((req, res) => {
  cors(req, res, async () => {
    const startTime = Date.now();
    const functionName = 'zablokujUzivatele';

    try {
      const { uid, blocked, idToken } = req.body;
      if (!uid || blocked === undefined || !idToken) {
        return res.status(400).json({ error: 'uid, blocked a idToken jsou povinné' });
      }

      const decodedToken = await verifyAuth(idToken);
      const adminUid = decodedToken?.uid;

      if (!(await verifyAdmin(decodedToken))) return res.status(403).json({ error: 'Nemáš oprávnění' });

      logger.info({
        event: 'zablokujUzivatele_requested',
        status: 'initiated',
        functionName,
        uid,
        adminUid,
        blocked,
      });

      await admin.auth().updateUser(uid, { disabled: blocked });
      await db.doc(`users/${uid}`).update({ disabled: blocked });

      const durationMs = Date.now() - startTime;
      logger.info({
        event: 'zablokujUzivatele_success',
        status: 'completed',
        functionName,
        uid,
        adminUid,
        blocked,
        durationMs,
      });

      res.status(200).json({ ok: true });
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const adminUid = req.body?.idToken ? (await verifyAuth(req.body.idToken))?.uid : 'unknown';

      logger.error({
        event: 'zablokujUzivatele_failed',
        status: 'failed',
        functionName,
        uid: req.body?.uid,
        adminUid,
        blocked: req.body?.blocked,
        errorMessage: err.message,
        errorCode: err.code || 'UNKNOWN',
        durationMs,
      });

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

// ═══════════════════════════════════════════════════════════════════════════════
// 📊 LEARNING REPORTS - Generate "Co se naučila" snapshots with time windows
// ═══════════════════════════════════════════════════════════════════════════════

const generateLearningReport = async (triggeredBy) => {
  const now = new Date();
  const timeWindows = {
    '5min': 5 * 60 * 1000,
    '30min': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '2h': 2 * 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '8h': 8 * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
  };

  const windowData = {};

  try {
    // Get all users
    const usersSnap = await db.collection('users').get();

    for (const [label, offsetMs] of Object.entries(timeWindows)) {
      const startTime = new Date(now.getTime() - offsetMs);
      let totalUsers = 0;
      let totalSessions = 0;
      let totalVydaje = 0;
      let totalPrijmy = 0;

      // Iterate through all users and collect their data
      for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;

        try {
          const sessionsSnap = await db.collection('aiTelemetry')
            .doc(uid)
            .collection('sessions')
            .where('startTime', '>=', startTime)
            .limit(100)
            .get();

          if (!sessionsSnap.empty) {
            totalUsers++;
            totalSessions += sessionsSnap.size;

            // Count transactions from aiInsights if available
            const insightsDoc = await db.collection('aiInsights').doc(uid).get();
            if (insightsDoc.exists) {
              const insights = insightsDoc.data();
              totalVydaje += (insights.financial?.totalTransactions || 0) * 0.6; // estimate
              totalPrijmy += (insights.financial?.totalTransactions || 0) * 0.4; // estimate
            }
          }
        } catch (err) {
          console.warn(`Error processing user ${uid}:`, err);
        }
      }

      windowData[label] = {
        usersActive: totalUsers,
        sessions: totalSessions,
        vydaje: Math.round(totalVydaje),
        prijmy: Math.round(totalPrijmy),
        topCategories: [],
      };
    }

    const reportDoc = {
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      triggeredBy,
      timeWindows: windowData,
      summary: {
        totalVydaje: Object.values(windowData).reduce((s, w) => s + w.vydaje, 0),
        totalPrijmy: Object.values(windowData).reduce((s, w) => s + w.prijmy, 0),
        usersAnalyzed: windowData['24h']?.usersActive || 0,
      },
    };

    const reportRef = await db.collection('aiLearningReports').add(reportDoc);
    console.log(`✓ Learning report created: ${reportRef.id}`);
    return reportRef.id;
  } catch (err) {
    console.error('❌ Learning report error:', err);
    throw err;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 🤖 AI DATA ANALYSIS - Analyze user behavior every 10 hours
// ═══════════════════════════════════════════════════════════════════════════════

exports.aiAnalyzeUsers = functions
  .region(REGION)
  .pubsub.schedule('0 */10 * * *')
  .timeZone('Europe/Prague')
  .onRun(async () => {
    try {
      console.log('🤖 Spouštím AI analýzu uživatelů...');
      const usersSnap = await db.collection('users').get();
      let analyzedCount = 0;

      for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;
        const userData = userDoc.data();

        // Check if user has any telemetry data (sessions OR transactions)
        const sessionsSnap = await db.collection('aiTelemetry').doc(uid).collection('sessions').limit(1).get();
        const transactionsCheckSnap = await db.collection('aiTelemetry').doc(uid).collection('transactions').limit(1).get();
        if (sessionsSnap.empty && transactionsCheckSnap.empty) continue;

        try {
          // Fetch all sessions (last 90 days)
          const allSessionsSnap = await db.collection('aiTelemetry')
            .doc(uid)
            .collection('sessions')
            .orderBy('startTime', 'desc')
            .limit(100)
            .get();

          // Fetch all transactions
          const transactionsSnap = await db.collection('aiTelemetry')
            .doc(uid)
            .collection('transactions')
            .get();

          // Aggregate data
          const sessions = allSessionsSnap.docs.map(d => d.data());
          const transactions = transactionsSnap.docs.map(d => d.data());

          const stats = {
            sessions: {
              count: sessions.length,
              avgDurationMs: sessions.length > 0
                ? Math.round(sessions.reduce((s, session) => s + (session.durationMs || 0), 0) / sessions.length)
                : 0,
              totalTimeMs: sessions.reduce((s, session) => s + (session.durationMs || 0), 0),
            },
            tabs: {
              dashboard: 0,
              vydaje: 0,
              prijmy: 0,
            },
            forms: {
              avgFillTimeVydaj: 0,
              avgFillTimePrijem: 0,
              submitCountVydaj: 0,
              submitCountPrijem: 0,
            },
            financial: {
              totalTransactions: transactions.length,
              categoryBreakdown: {},
              preferredDayOfWeek: -1,
              preferredHourOfDay: -1,
            },
            behavioral: {
              avgClicksPerSession: 0,
              totalClicks: 0,
              avgCharCountPerSession: 0,
              totalCharCount: 0,
            },
            lastAnalyzed: new Date(),
          };

          // Tab breakdown + clicks & character count
          let totalClicks = 0;
          let totalCharCount = 0;
          sessions.forEach(session => {
            if (session.tabDurations) {
              stats.tabs.dashboard += session.tabDurations.dashboard || 0;
              stats.tabs.vydaje += session.tabDurations.vydaje || 0;
              stats.tabs.prijmy += session.tabDurations.prijmy || 0;
            }
            totalClicks += session.clickCount || 0;
            totalCharCount += session.charCount || 0;
          });

          stats.behavioral.totalClicks = totalClicks;
          stats.behavioral.avgClicksPerSession = sessions.length > 0 ? Math.round(totalClicks / sessions.length) : 0;
          stats.behavioral.totalCharCount = totalCharCount;
          stats.behavioral.avgCharCountPerSession = sessions.length > 0 ? Math.round(totalCharCount / sessions.length) : 0;

          // Compute percentages
          const totalTabTime = stats.tabs.dashboard + stats.tabs.vydaje + stats.tabs.prijmy;
          if (totalTabTime > 0) {
            stats.tabs.dashboardPercent = Math.round((stats.tabs.dashboard / totalTabTime) * 100);
            stats.tabs.vydajePercent = Math.round((stats.tabs.vydaje / totalTabTime) * 100);
            stats.tabs.prijmyPercent = Math.round((stats.tabs.prijmy / totalTabTime) * 100);
          }

          // Financial patterns
          const dayOfWeekCounts = new Array(7).fill(0);
          const hourOfDayCounts = new Array(24).fill(0);
          const categoryCount = {};

          transactions.forEach(t => {
            if (t.category) {
              categoryCount[t.category] = (categoryCount[t.category] || 0) + 1;
            }
            if (t.dayOfWeek !== undefined) {
              dayOfWeekCounts[t.dayOfWeek]++;
            }
            if (t.hourOfDay !== undefined) {
              hourOfDayCounts[t.hourOfDay]++;
            }
          });

          stats.financial.categoryBreakdown = categoryCount;
          stats.financial.preferredDayOfWeek = dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts));
          stats.financial.preferredHourOfDay = hourOfDayCounts.indexOf(Math.max(...hourOfDayCounts));

          // Write aiInsights
          await db.collection('aiInsights').doc(uid).set(stats, { merge: true });
          analyzedCount++;
          console.log(`✓ Analyzován uživatel: ${userData.username}`);
        } catch (err) {
          console.error(`Error analyzing user ${uid}:`, err);
        }
      }

      console.log(`✅ AI analýza hotova. Analyzováno ${analyzedCount} uživatelů.`);

      try {
        await generateLearningReport('scheduled');
      } catch (err) {
        console.error('Learning report error:', err);
      }

      return { success: true, analyzed: analyzedCount };
    } catch (err) {
      console.error('❌ aiAnalyzeUsers error:', err);
      return { success: false, error: err.message };
    }
  });

exports.aiGetInsights = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const token = req.headers.authorization?.split('Bearer ')[1];
      const { uid } = req.body;

      if (!token || !uid) {
        return res.status(400).json({ error: 'Token a uid jsou povinné' });
      }

      if (typeof uid !== 'string' || uid.length > 128) {
        return res.status(400).json({ error: 'Invalid uid format' });
      }

      const decodedToken = await verifyAuth(token);
      if (!(await verifyAdmin(decodedToken))) {
        return res.status(403).json({ error: '🔐 Jen admin!' });
      }

      // Rate limiting: max 50 requests per hour per user
      const rateLimited = await checkAIRateLimit(decodedToken.uid, 'getInsights', 50);
      if (!rateLimited) {
        await logAdminAction(decodedToken.uid, 'aiGetInsights_BLOCKED', { reason: 'rate_limit' });
        return res.status(429).json({ error: 'Příliš mnoho požadavků. Zkuste později.' });
      }

      // Audit log
      await logAdminAction(decodedToken.uid, 'aiGetInsights', { targetUid: uid });

      // Fetch insights for user
      const insightsDoc = await db.collection('aiInsights').doc(uid).get();
      const insights = insightsDoc.exists ? insightsDoc.data() : null;

      // Fetch last 10 sessions
      const sessionsSnap = await db.collection('aiTelemetry')
        .doc(uid)
        .collection('sessions')
        .orderBy('startTime', 'desc')
        .limit(10)
        .get();

      const sessions = sessionsSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));

      res.status(200).json({
        uid,
        insights,
        recentSessions: sessions,
      });
    } catch (err) {
      console.error('aiGetInsights error:', err);
      res.status(500).json({ error: err.message });
    }
  });
});

exports.aiGetAllInsights = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const token = req.headers.authorization?.split('Bearer ')[1];
      const clientIP = extractClientIP(req);
      const ipHash = hashIP(clientIP);

      if (!token) {
        await logSecurityEvent('AUTH_FAILED', 'medium', { reason: 'no_token', ipHash });
        return res.status(400).json({ error: 'Token je povinný' });
      }

      const decodedToken = await verifyAuth(token);
      if (!(await verifyAdmin(decodedToken))) {
        await logSecurityEvent('PRIVILEGE_DENIED', 'high', {
          uid: decodedToken?.uid,
          action: 'aiGetAllInsights',
          ipHash
        });
        return res.status(403).json({ error: '🔐 Jen admin!' });
      }

      // Rate limiting: max 100 requests per hour per admin
      const rateLimited = await checkAIRateLimit(decodedToken.uid, 'getAllInsights', 100);
      if (!rateLimited) {
        await logAdminAction(decodedToken.uid, 'aiGetAllInsights_BLOCKED', { reason: 'rate_limit', ipHash });
        await logSecurityEvent('RATE_LIMIT_EXCEEDED', 'medium', {
          uid: decodedToken.uid,
          action: 'aiGetAllInsights',
          ipHash
        });
        return res.status(429).json({ error: 'Příliš mnoho požadavků. Zkuste později.' });
      }

      // Log admin IP
      await logAdminIP(decodedToken.uid, ipHash);

      // Audit log
      await logAdminAction(decodedToken.uid, 'aiGetAllInsights', { ipHash });
      await logSecurityEvent('ADMIN_ACCESS', 'low', {
        uid: decodedToken.uid,
        action: 'aiGetAllInsights',
        ipHash
      });

      // Fetch all insights
      const insightsSnap = await db.collection('aiInsights').get();
      const userDocsSnap = await db.collection('users').get();

      const userMap = {};
      userDocsSnap.docs.forEach(doc => {
        userMap[doc.id] = doc.data();
      });

      const allInsights = insightsSnap.docs.map(doc => {
        const data = doc.data();
        const user = userMap[doc.id] || {};
        return {
          uid: doc.id,
          username: user.username || 'Unknown',
          email: user.email || 'Unknown',
          lastAnalyzed: data.lastAnalyzed ? data.lastAnalyzed.toDate().toISOString() : null,
          totalSessions: data.sessions?.count || 0,
          mostUsedTab: getMostUsedTab(data.tabs),
          totalTimeMinutes: Math.round((data.sessions?.totalTimeMs || 0) / 60000),
        };
      });

      res.status(200).json({
        allInsights,
        totalUsers: allInsights.length,
      });
    } catch (err) {
      console.error('aiGetAllInsights error:', err);
      res.status(500).json({ error: err.message });
    }
  });
});

exports.aiUpdateConfig = functions.region(REGION).https.onRequest(async (req, res) => {
  let decodedToken = null;
  cors(req, res, async () => {
    try {
      const token = req.headers.authorization?.split('Bearer ')[1];
      const { isEnabled } = req.body;

      if (!token) {
        return res.status(400).json({ error: 'Token je povinný' });
      }

      decodedToken = await verifyAuth(token);
      if (!(await verifyAdmin(decodedToken))) {
        await logAdminAction(decodedToken?.uid, 'aiUpdateConfig_DENIED', { reason: 'not_admin' });
        return res.status(403).json({ error: '🔐 Jen admin!' });
      }

      // Input validation
      if (isEnabled !== undefined && typeof isEnabled !== 'boolean') {
        return res.status(400).json({ error: 'isEnabled musí být boolean' });
      }

      // Rate limiting: max 10 per hour
      const rateLimited = await checkAIRateLimit(decodedToken.uid, 'updateConfig', 10);
      if (!rateLimited) {
        return res.status(429).json({ error: 'Příliš mnoho požadavků.' });
      }

      const updates = {};
      if (isEnabled !== undefined) updates.isEnabled = isEnabled;
      if (Object.keys(updates).length > 0) {
        updates.lastUpdated = new Date();
        await db.collection('aiConfig').doc('global').set(updates, { merge: true });
        await logAdminAction(decodedToken.uid, 'aiUpdateConfig', { updates });
      }

      res.status(200).json({ ok: true, config: updates });
    } catch (err) {
      console.error('aiUpdateConfig error:', err);
      await logAdminAction(decodedToken?.uid, 'aiUpdateConfig_ERROR', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });
});

exports.aiDeleteLearningReport = functions.region(REGION).https.onRequest((req, res) => {
  return cors(req, res, async () => {
    let decodedToken = null;
    try {
      const token = req.headers.authorization?.split('Bearer ')[1];
      const { reportId } = req.body;

      if (!token || !reportId) {
        return res.status(400).json({ error: 'Token a reportId povinné' });
      }

      decodedToken = await verifyAuth(token);
      if (!(await verifyAdmin(decodedToken))) {
        return res.status(403).json({ error: 'Admin only' });
      }

      const rateLimited = await checkAIRateLimit(decodedToken.uid, 'deleteReport', 100);
      if (!rateLimited) {
        return res.status(429).json({ error: 'Rate limited' });
      }

      await db.collection('aiLearningReports').doc(reportId).delete();
      await logAdminAction(decodedToken.uid, 'aiDeleteLearningReport', { reportId });

      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('aiDeleteLearningReport error:', err);
      await logAdminAction(decodedToken?.uid, 'aiDeleteLearningReport_ERROR', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });
});

exports.aiCleanupLearningReports = functions
  .region(REGION)
  .pubsub.schedule('0 */6 * * *')
  .timeZone('Europe/Prague')
  .onRun(async () => {
    try {
      console.log('🧹 Cleaning learning reports...');
      const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);

      const oldReports = await db.collection('aiLearningReports')
        .where('createdAt', '<', seventyTwoHoursAgo)
        .limit(500)
        .get();

      if (oldReports.empty) {
        return { success: true, deleted: 0 };
      }

      const batch = db.batch();
      let deleteCount = 0;

      oldReports.docs.forEach(doc => {
        batch.delete(doc.ref);
        deleteCount++;
      });

      await batch.commit();
      console.log(`✓ Deleted ${deleteCount} old learning reports`);
      return { success: true, deleted: deleteCount };
    } catch (err) {
      console.error('❌ aiCleanupLearningReports error:', err);
      return { success: false, error: err.message };
    }
  });

exports.aiTriggerAnalysis = functions.region(REGION).https.onRequest((req, res) => {
  return cors(req, res, async () => {
    let decodedToken = null;
    try {
      const token = req.headers.authorization?.split('Bearer ')[1];

      if (!token) {
        res.status(400).json({ error: 'Token je povinný' });
        return;
      }

      decodedToken = await verifyAuth(token);
      if (!(await verifyAdmin(decodedToken))) {
        res.status(403).json({ error: '🔐 Jen admin!' });
        return;
      }

      // Rate limiting: max 50 triggers per hour per admin
      const rateLimited = await checkAIRateLimit(decodedToken.uid, 'triggerAnalysis', 50);
      if (!rateLimited) {
        await logAdminAction(decodedToken.uid, 'aiTriggerAnalysis_BLOCKED', { reason: 'rate_limit' });
        res.status(429).json({ error: 'Příliš mnoho analýz. Max 5 za hodinu.' });
        return;
      }

      // Audit log
      await logAdminAction(decodedToken.uid, 'aiTriggerAnalysis_START', {});

      console.log('🤖 Admin manuálně spustil AI analýzu');
      const usersSnap = await db.collection('users').get();
      let analyzedCount = 0;
      const summary = {
        totalVydaje: 0,
        totalPrijmy: 0,
        categoryBreakdown: {},
        usersAnalyzed: [],
      };

      for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;
        const userData = userDoc.data();

        // Check if user has any telemetry data (sessions OR transactions)
        const sessionsSnap = await db.collection('aiTelemetry').doc(uid).collection('sessions').limit(1).get();
        const transactionsCheckSnap = await db.collection('aiTelemetry').doc(uid).collection('transactions').limit(1).get();
        if (sessionsSnap.empty && transactionsCheckSnap.empty) continue;

        try {
          const allSessionsSnap = await db.collection('aiTelemetry')
            .doc(uid)
            .collection('sessions')
            .orderBy('startTime', 'desc')
            .limit(100)
            .get();

          const transactionsSnap = await db.collection('aiTelemetry')
            .doc(uid)
            .collection('transactions')
            .get();

          const sessions = allSessionsSnap.docs.map(d => d.data());
          const transactions = transactionsSnap.docs.map(d => d.data());

          const stats = {
            sessions: {
              count: sessions.length,
              avgDurationMs: sessions.length > 0
                ? Math.round(sessions.reduce((s, session) => s + (session.durationMs || 0), 0) / sessions.length)
                : 0,
              totalTimeMs: sessions.reduce((s, session) => s + (session.durationMs || 0), 0),
            },
            tabs: {
              dashboard: 0,
              vydaje: 0,
              prijmy: 0,
            },
            financial: {
              totalTransactions: transactions.length,
              categoryBreakdown: {},
              preferredDayOfWeek: -1,
              preferredHourOfDay: -1,
            },
            lastAnalyzed: new Date(),
          };

          sessions.forEach(session => {
            if (session.tabDurations) {
              stats.tabs.dashboard += session.tabDurations.dashboard || 0;
              stats.tabs.vydaje += session.tabDurations.vydaje || 0;
              stats.tabs.prijmy += session.tabDurations.prijmy || 0;
            }
          });

          const totalTabTime = stats.tabs.dashboard + stats.tabs.vydaje + stats.tabs.prijmy;
          if (totalTabTime > 0) {
            stats.tabs.dashboardPercent = Math.round((stats.tabs.dashboard / totalTabTime) * 100);
            stats.tabs.vydajePercent = Math.round((stats.tabs.vydaje / totalTabTime) * 100);
            stats.tabs.prijmyPercent = Math.round((stats.tabs.prijmy / totalTabTime) * 100);
          }

          const dayOfWeekCounts = new Array(7).fill(0);
          const hourOfDayCounts = new Array(24).fill(0);
          const categoryCount = {};
          let vydajeCount = 0;
          let prijmyCount = 0;

          transactions.forEach(t => {
            if (t.type === 'vydaj') vydajeCount++;
            if (t.type === 'prijem') prijmyCount++;
            if (t.category) {
              categoryCount[t.category] = (categoryCount[t.category] || 0) + 1;
            }
            if (t.dayOfWeek !== undefined) {
              dayOfWeekCounts[t.dayOfWeek]++;
            }
            if (t.hourOfDay !== undefined) {
              hourOfDayCounts[t.hourOfDay]++;
            }
          });

          stats.financial.categoryBreakdown = categoryCount;
          stats.financial.preferredDayOfWeek = dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts));
          stats.financial.preferredHourOfDay = hourOfDayCounts.indexOf(Math.max(...hourOfDayCounts));

          // Aggregate for summary
          summary.totalVydaje += vydajeCount;
          summary.totalPrijmy += prijmyCount;
          Object.entries(categoryCount).forEach(([cat, count]) => {
            summary.categoryBreakdown[cat] = (summary.categoryBreakdown[cat] || 0) + count;
          });
          summary.usersAnalyzed.push({
            username: userData.username || 'Unknown',
            vydaje: vydajeCount,
            prijmy: prijmyCount,
          });

          await db.collection('aiInsights').doc(uid).set(stats, { merge: true });
          analyzedCount++;
        } catch (err) {
          console.error(`Error analyzing user ${uid}:`, err);
        }
      }

      let reportId = null;
      try {
        reportId = await generateLearningReport('manual');
      } catch (err) {
        console.error('Learning report error:', err);
      }

      await logAdminAction(decodedToken.uid, 'aiTriggerAnalysis_COMPLETE', { analyzed: analyzedCount, summary, reportId });
      res.status(200).json({
        ok: true,
        analyzed: analyzedCount,
        reportId,
        summary: {
          totalVydaje: summary.totalVydaje,
          totalPrijmy: summary.totalPrijmy,
          categoryBreakdown: summary.categoryBreakdown,
          usersAnalyzed: summary.usersAnalyzed,
        }
      });
    } catch (err) {
      console.error('aiTriggerAnalysis error:', err);
      await logAdminAction(decodedToken?.uid, 'aiTriggerAnalysis_ERROR', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 🗑️ DATA RETENTION - Automatic cleanup based on config
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY EVENTS - Log to Firestore for dashboard
// ═══════════════════════════════════════════════════════════════════════════════

const logSecurityEvent = async (eventType, severity, details) => {
  try {
    await db.collection('_securityEvents').add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      eventType,
      severity,
      details,
    });
  } catch (err) {
    console.error('Security event logging error:', err);
  }
};

// Helper: getMostUsedTab
function getMostUsedTab(tabs) {
  if (!tabs) return 'unknown';
  const { dashboard = 0, vydaje = 0, prijmy = 0 } = tabs;
  const max = Math.max(dashboard, vydaje, prijmy);
  if (max === dashboard) return 'dashboard';
  if (max === vydaje) return 'vydaje';
  if (max === prijmy) return 'prijmy';
  return 'unknown';
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🤖 ML PIPELINE LEVEL 1 - Simple expense prediction based on history
// ═══════════════════════════════════════════════════════════════════════════════

const ML_VERSION = 'expense-predictor-baseline-v1';
const ML_PIPELINE_LEVEL = 1;

// Helper: Load all transactions for a user
const loadUserTransactions = async (uid) => {
  try {
    const vydajeSnap = await db.collection(`users/${uid}/vydaje`).get();
    return vydajeSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      type: 'vydaj',
      castka: Number(doc.data().castka || 0),
      datum: doc.data().datum || new Date().toISOString().slice(0, 10),
      kategorie: doc.data().kategorie || 'other',
      createdAt: doc.data().createdAt,
    })).filter(t => t.castka > 0);
  } catch (err) {
    logger.warn(`Failed to load transactions for ${uid}: ${err.message}`);
    return [];
  }
};

// Helper: Load all income for a user
const loadUserIncome = async (uid) => {
  try {
    const prijmySnap = await db.collection(`users/${uid}/prijmy`).get();
    return prijmySnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      type: 'prijem',
      castka: Number(doc.data().castka || 0),
      datum: doc.data().datum || new Date().toISOString().slice(0, 10),
      kategorie: doc.data().kategorie || 'other',
      createdAt: doc.data().createdAt,
    })).filter(t => t.castka > 0);
  } catch (err) {
    logger.warn(`Failed to load income for ${uid}: ${err.message}`);
    return [];
  }
};

// Helper: Calculate monthly expense features
const calculateExpenseFeatures = (transactions) => {
  const monthlyExpenses = {};
  const categoryExpenses = {};

  transactions.forEach(t => {
    const [year, month] = t.datum.split('-').slice(0, 2);
    const monthKey = `${year}-${month}`;
    const category = t.kategorie || 'other';

    monthlyExpenses[monthKey] = (monthlyExpenses[monthKey] || 0) + t.castka;
    categoryExpenses[category] = (categoryExpenses[category] || 0) + t.castka;
  });

  return { monthlyExpenses, categoryExpenses };
};

// Helper: Calculate monthly income features
const calculateIncomeFeatures = (income) => {
  const monthlyIncome = {};

  income.forEach(t => {
    const [year, month] = t.datum.split('-').slice(0, 2);
    const monthKey = `${year}-${month}`;
    monthlyIncome[monthKey] = (monthlyIncome[monthKey] || 0) + t.castka;
  });

  return { monthlyIncome };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 🤖 ADVANCED CONFIDENCE SCORING - Complex Model
// ═══════════════════════════════════════════════════════════════════════════════

// Helper: Remove outliers using IQR method (Interquartile Range)
const removeOutliers = (values) => {
  if (values.length < 4) return values;

  const sorted = [...values].sort((a, b) => a - b);
  const q1Idx = Math.floor(sorted.length * 0.25);
  const q3Idx = Math.floor(sorted.length * 0.75);
  const q1 = sorted[q1Idx];
  const q3 = sorted[q3Idx];
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  return values.filter(v => v >= lowerBound && v <= upperBound);
};

// Helper: Calculate standard deviation
const calculateStandardDeviation = (values) => {
  if (values.length < 2) return 0;

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(variance);
};

// Helper: Detect trend (linear regression slope)
const detectTrend = (monthlyData) => {
  const entries = Object.entries(monthlyData).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length < 2) return { slope: 0, strength: 0 };

  const values = entries.map(([, v]) => v);
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += Math.pow(i - xMean, 2);
  }

  const slope = denominator !== 0 ? numerator / denominator : 0;
  const avgValue = yMean;
  const trendStrength = Math.abs(slope) / (avgValue || 1);

  return { slope, strength: Math.min(trendStrength, 1) };
};

// Helper: Apply exponential smoothing weights (recent months weighted more)
const exponentialSmoothing = (monthlyData) => {
  const entries = Object.entries(monthlyData).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return {};

  const smoothed = {};
  const weights = [];
  const n = entries.length;

  // Generate exponential weights: recent = higher weight
  for (let i = 0; i < n; i++) {
    weights.push(Math.exp(i / n));
  }

  const weightSum = weights.reduce((s, w) => s + w, 0);

  entries.forEach(([month, value], idx) => {
    smoothed[month] = value * (weights[idx] / weightSum);
  });

  return smoothed;
};

// Helper: Calculate advanced confidence score
const calculateConfidenceScore = (monthlyData) => {
  const entries = Object.entries(monthlyData).sort(([a], [b]) => a.localeCompare(b));

  if (entries.length < 2) {
    return { confidence: 'low', score: 0.2, reason: 'Málo dat (< 2 měsíce)' };
  }

  const values = entries.map(([, v]) => v);

  // 1. Remove outliers
  const cleanedValues = removeOutliers(values);
  const outlierRatio = 1 - (cleanedValues.length / values.length);

  // 2. Calculate volatility
  const stdDev = calculateStandardDeviation(cleanedValues);
  const mean = cleanedValues.reduce((s, v) => s + v, 0) / cleanedValues.length;
  const volatility = mean > 0 ? stdDev / mean : 1;

  // 3. Detect trend
  const { strength: trendStrength } = detectTrend(monthlyData);

  // 4. Calculate confidence score (0-1)
  // Formula: (1 - volatility) * (1 + trendStrength/2) * (1 - outlierRatio)
  let score = (1 - Math.min(volatility, 1)) * (1 + trendStrength / 2) * (1 - outlierRatio);
  score = Math.max(0, Math.min(1, score)); // Clamp 0-1

  // Determine confidence level
  let confidence = 'low';
  let reason = '';

  if (score >= 0.7) {
    confidence = 'high';
    reason = 'Stabilní, konzistentní výdaje';
  } else if (score >= 0.5) {
    confidence = 'medium';
    if (volatility > 0.3) reason = 'Mírně kolísavé výdaje';
    else if (outlierRatio > 0.2) reason = 'Některé anomálie v datech';
    else reason = 'Slabý trend v datech';
  } else {
    confidence = 'low';
    if (volatility > 0.5) reason = 'Velmi kolísavé výdaje (volatilita > 50%)';
    else if (outlierRatio > 0.3) reason = 'Příliš mnoho anomálií v datech';
    else reason = 'Nedostatek stabilních dat';
  }

  return { confidence, score: Math.round(score * 100), reason };
};

// Helper: Generate baseline prediction
const generateBaselinePrediction = (transactions, income) => {
  // Expense prediction
  if (transactions.length === 0) {
    return { totalPredictedExpense: 0, categories: {}, confidence: 'low', monthlyIncome: {}, incomeStats: {} };
  }

  const { monthlyExpenses, categoryExpenses: allCategories } = calculateExpenseFeatures(transactions);
  const months = Object.keys(monthlyExpenses).sort();

  // Calculate 3-month and 6-month averages for expenses
  const last3Months = months.slice(-3);
  const last6Months = months.slice(-6);

  const avg3m = last3Months.length > 0
    ? last3Months.reduce((s, m) => s + monthlyExpenses[m], 0) / last3Months.length
    : 0;

  const avg6m = last6Months.length > 0
    ? last6Months.reduce((s, m) => s + monthlyExpenses[m], 0) / last6Months.length
    : 0;

  // Simple prediction: average of 3m and 6m, with slight bias toward recent
  const totalPredicted = avg3m > 0 ? Math.round(avg3m * 0.6 + avg6m * 0.4) : avg6m;

  // Predict by category proportionally
  const totalAll = Object.values(allCategories).reduce((s, c) => s + c, 0);
  const categories = {};
  Object.entries(allCategories).forEach(([cat, amount]) => {
    categories[cat] = totalAll > 0 ? Math.round((amount / totalAll) * totalPredicted) : 0;
  });

  // Advanced confidence scoring
  const { confidence, score: confidenceScore, reason: confidenceReason } = calculateConfidenceScore(monthlyExpenses);

  // Income analysis
  let incomeStats = {};
  let monthlyIncome = {};

  if (income && income.length > 0) {
    const { monthlyIncome: monthlyIncomeData } = calculateIncomeFeatures(income);
    monthlyIncome = monthlyIncomeData;
    const incomeMonths = Object.keys(monthlyIncome).sort();

    const incLast3 = incomeMonths.slice(-3);
    const incLast6 = incomeMonths.slice(-6);

    const incAvg3m = incLast3.length > 0
      ? incLast3.reduce((s, m) => s + monthlyIncome[m], 0) / incLast3.length
      : 0;

    const incAvg6m = incLast6.length > 0
      ? incLast6.reduce((s, m) => s + monthlyIncome[m], 0) / incLast6.length
      : 0;

    incomeStats = {
      avg3m: Math.round(incAvg3m),
      avg6m: Math.round(incAvg6m),
      dataPoints: income.length,
    };
  }

  return {
    totalPredictedExpense: totalPredicted,
    categories,
    confidence,
    confidenceScore,
    confidenceReason,
    features: { avg3m: Math.round(avg3m), avg6m: Math.round(avg6m), dataPoints: transactions.length },
    incomeStats,
    monthlyIncome,
  };
};

// Helper: Save prediction results
const savePredictionResults = async (uid, prediction) => {
  try {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;

    const predictionData = {
      month: nextMonthStr,
      totalPredictedExpense: prediction.totalPredictedExpense,
      categories: prediction.categories,
      confidence: prediction.confidence,
      confidenceScore: prediction.confidenceScore,
      confidenceReason: prediction.confidenceReason,
      modelType: 'average-baseline-v2',
      modelVersion: ML_VERSION,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      incomeStats: prediction.incomeStats || {},
      monthlyIncome: prediction.monthlyIncome || {},
      pipelineLevel: 1,
      active: true,
      // FÁZE 5.1D: Python runtime metadata for explainability
      sourceMethod: prediction.sourceMethod || 'Node.js baseline',
      pythonMetadata: prediction.pythonMetadata || null
    };

    await db.collection(`users/${uid}/mlPredictions`).add(predictionData);

    // FÁZE 5.1E: Log persistence of deterministic result
    logger.info({
      event: 'mlPipeline_predictionPersisted',
      uid: uid,
      totalExpense: predictionData.totalPredictedExpense,
      source: predictionData.sourceMethod,
      hasDebugMetadata: !!predictionData.pythonMetadata
    });

    return true;
  } catch (err) {
    logger.error(`Failed to save prediction for ${uid}: ${err.message}`);
    return false;
  }
};

// Scheduled function: Run ML pipeline every 3 days
exports.runMlPipeline = functions
  .region(REGION)
  .pubsub.schedule('0 0 */3 * *').onRun(async () => {
    const startTime = Date.now();

    logger.info({
      event: 'mlPipeline_started',
      pipelineLevel: ML_PIPELINE_LEVEL,
      modelVersion: ML_VERSION,
    });

    let usersProcessed = 0;
    let predictionsCreated = 0;
    let errorMessage = null;
    let errorCode = null;

    try {
      // Load all users
      const usersSnap = await db.collection('users').get();
      const users = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));

      logger.info({ event: 'mlPipeline_usersLoaded', count: users.length });

      // Process each user
      for (const user of users) {
        try {
          const transactions = await loadUserTransactions(user.uid);

          if (transactions.length === 0) {
            logger.info({ event: 'mlPipeline_noTransactions', uid: user.uid });
            continue;
          }

          const income = await loadUserIncome(user.uid);

          // FÁZE 5.2A: Python runtime connected to real dataset-based input
          logger.info({
            event: 'mlPipeline_pythonRuntime_realDatasetInput',
            uid: user.uid,
            dataSource: 'Firestore (real user transactions)',
            transactionCount: transactions.length,
            incomeRecords: income.length,
            totalExpense: transactions.reduce((sum, t) => sum + t.castka, 0),
            totalIncome: income.reduce((sum, i) => sum + i.castka, 0)
          });

          // FÁZE 5.0A: Call external Python runtime instead of Node.js baseline
          const runtimeRequest = {
            uid: user.uid,
            pipelineLevel: 'L1',
            modelVersion: ML_VERSION,
            transactions: transactions.map(t => ({
              category: t.kategorie,
              amount: t.castka,
              date: t.datum,
            })),
            income: income.reduce((s, i) => s + i.castka, 0),
            debugMode: false,
          };

          let prediction;
          try {
            // FÁZE 5.0E: Structured logging for Python runtime call
            logger.info({
              event: 'mlPipeline_pythonRuntime_callStart',
              uid: user.uid,
              transactionCount: transactions.length,
              incomeRecords: income.length,
            });

            // Call Python runtime
            const runtimeResponse = await mlRuntimeClient.callMlRuntime(runtimeRequest);

            // Transform Python response into Node.js prediction format
            // FÁZE 5.1D: Include Python debug metadata (inputs, confidence explanation)
            prediction = {
              totalPredictedExpense: runtimeResponse.predictions[0]?.totalPredictedExpense || 0,
              categories: runtimeResponse.predictions[0]?.categories || {},
              confidence: 'unknown',
              confidenceScore: Math.round((runtimeResponse.predictions[0]?.confidence || 0) * 100),
              confidenceReason: `Python ML Runtime (L1) - confidence: ${runtimeResponse.predictions[0]?.confidence || 0}`,
              features: { dataPoints: transactions.length },
              incomeStats: { dataPoints: income.length },
              monthlyIncome: {},
              // FÁZE 5.1D: Python debug metadata for explainability
              sourceMethod: 'Python ML Runtime',
              pythonMetadata: {
                inputs: runtimeResponse.debugMetadata?.inputs || {},
                confidenceExplained: runtimeResponse.debugMetadata?.confidenceExplained || {},
                calculationMethod: runtimeResponse.debugMetadata?.calculationMethod || '',
                processingTimeMs: runtimeResponse.debugMetadata?.processingTimeMs || 0
              }
            };

            // FÁZE 5.1E: Observability logging for deterministic Python result
            logger.info({
              event: 'mlPipeline_determinisicResult_generated',
              uid: user.uid,
              predictedExpense: prediction.totalPredictedExpense,
              method: 'Python Deterministic'
            });

            logger.info({
              event: 'mlPipeline_confidenceAssigned',
              uid: user.uid,
              confidence: prediction.confidenceScore,
              confidenceLevel: prediction.confidenceScore >= 80 ? 'high' : prediction.confidenceScore >= 50 ? 'medium' : 'low',
              method: 'Python 4-Factor (data frequency, transaction count, expense ratio, income constraint)'
            });

            if (prediction.pythonMetadata) {
              logger.info({
                event: 'mlPipeline_debugMetadataAttached',
                uid: user.uid,
                hasInputs: !!prediction.pythonMetadata.inputs,
                hasConfidenceExplained: !!prediction.pythonMetadata.confidenceExplained,
                hasCalculationMethod: !!prediction.pythonMetadata.calculationMethod,
                pythonProcessingMs: prediction.pythonMetadata.processingTimeMs
              });
            }

            logger.info({
              event: 'mlPipeline_pythonRuntime_success',
              uid: user.uid,
              pythonProcessingMs: runtimeResponse.debugMetadata?.processingTimeMs || 0,
              totalExpense: prediction.totalPredictedExpense,
              confidence: prediction.confidenceScore,
            });

          } catch (runtimeErr) {
            // FÁZE 5.0F: Structured error handling for Python runtime failures
            const errorType = runtimeErr.errorType || 'UNKNOWN';
            const originalError = runtimeErr.originalError || runtimeErr.message;

            // Log with error type for debugging
            logger.warn({
              event: 'mlPipeline_pythonRuntime_failed',
              uid: user.uid,
              errorType: errorType,
              errorMessage: runtimeErr.message,
              originalError: originalError,
              elapsed: runtimeErr.elapsed,
              fallback: 'Using Node.js baseline prediction',
            });

            // Log specific error types
            switch (errorType) {
              case 'TIMEOUT':
                logger.warn({
                  event: 'mlPipeline_pythonRuntime_timeout',
                  uid: user.uid,
                  message: 'Python runtime did not respond in time',
                });
                break;
              case 'UNAVAILABLE':
                logger.error({
                  event: 'mlPipeline_pythonRuntime_unavailable',
                  uid: user.uid,
                  message: 'Python runtime is not running',
                  url: 'http://127.0.0.1:5000',
                });
                break;
              case 'INVALID_RESPONSE':
                logger.error({
                  event: 'mlPipeline_pythonRuntime_invalidResponse',
                  uid: user.uid,
                  message: 'Python returned invalid response format',
                  detail: originalError,
                });
                break;
              case 'PARSE_ERROR':
                logger.error({
                  event: 'mlPipeline_pythonRuntime_parseError',
                  uid: user.uid,
                  message: 'Failed to parse Python response JSON',
                  detail: originalError,
                });
                break;
              case 'HTTP_ERROR':
                logger.error({
                  event: 'mlPipeline_pythonRuntime_httpError',
                  uid: user.uid,
                  message: 'Python returned HTTP error',
                  detail: originalError,
                });
                break;
              case 'PREDICTION_ERROR':
                logger.warn({
                  event: 'mlPipeline_pythonRuntime_predictionError',
                  uid: user.uid,
                  message: 'Python prediction calculation failed',
                  detail: originalError,
                });
                break;
            }

            // Use Node.js baseline as fallback
            prediction = generateBaselinePrediction(transactions, income);
            // FÁZE 5.1D: Mark as fallback source
            prediction.sourceMethod = 'Node.js (fallback)';
            prediction.pythonMetadata = null;
          }

          const saved = await savePredictionResults(user.uid, prediction);

          if (saved) {
            predictionsCreated++;
            logger.info({
              event: 'mlPipeline_predictionSaved',
              uid: user.uid,
              totalPredicted: prediction.totalPredictedExpense,
              confidence: prediction.confidence,
            });
          }

          usersProcessed++;
        } catch (userErr) {
          logger.warn({
            event: 'mlPipeline_userError',
            uid: user.uid,
            error: userErr.message,
          });
        }
      }

      const durationMs = Date.now() - startTime;

      // Save successful run
      await db.collection('mlRuns').add({
        status: 'success',
        pipelineLevel: ML_PIPELINE_LEVEL,
        modelVersion: ML_VERSION,
        startedAt: new Date(startTime),
        finishedAt: new Date(),
        usersProcessed,
        predictionsCreated,
        durationMs,
        errorMessage: null,
        errorCode: null,
      });

      logger.info({
        event: 'mlPipeline_completed',
        pipelineLevel: ML_PIPELINE_LEVEL,
        usersProcessed,
        predictionsCreated,
        durationMs,
      });

      return { status: 'success', usersProcessed, predictionsCreated };
    } catch (err) {
      errorMessage = err.message;
      errorCode = err.code || 'UNKNOWN';
      const durationMs = Date.now() - startTime;

      logger.error({
        event: 'mlPipeline_failed',
        pipelineLevel: ML_PIPELINE_LEVEL,
        errorMessage,
        errorCode,
        durationMs,
      });

      // Save failed run
      try {
        await db.collection('mlRuns').add({
          status: 'failed',
          pipelineLevel: ML_PIPELINE_LEVEL,
          modelVersion: ML_VERSION,
          startedAt: new Date(startTime),
          finishedAt: new Date(),
          usersProcessed,
          predictionsCreated,
          durationMs,
          errorMessage,
          errorCode,
        });
      } catch (logErr) {
        logger.error({ event: 'mlPipeline_logError', error: logErr.message });
      }

      throw err;
    }
  });

// Admin-only manual trigger for ML Pipeline (for testing)
exports.testMlPipeline = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const token = req.headers.authorization?.split('Bearer ')[1];
      if (!token) {
        return res.status(400).json({ error: 'Token je povinný' });
      }

      const decodedToken = await verifyAuth(token);
      if (!(await verifyAdmin(decodedToken))) {
        return res.status(403).json({ error: '🔐 Jen admin!' });
      }

      logger.info({
        event: 'mlPipeline_manualTest_triggered',
        uid: decodedToken.uid,
      });

      const startTime = Date.now();
      let usersProcessed = 0;
      let predictionsCreated = 0;
      let errorMessage = null;
      let errorCode = null;

      try {
        const usersSnap = await db.collection('users').get();
        const users = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));

        logger.info({ event: 'mlPipeline_usersLoaded', count: users.length });

        for (const user of users) {
          try {
            const transactions = await loadUserTransactions(user.uid);

            if (transactions.length === 0) {
              logger.info({ event: 'mlPipeline_noTransactions', uid: user.uid });
              continue;
            }

            const income = await loadUserIncome(user.uid);

            // FÁZE 5.2A: Python runtime connected to real dataset-based input
            logger.info({
              event: 'mlPipeline_pythonRuntime_realDatasetInput',
              uid: user.uid,
              dataSource: 'Firestore (real user transactions)',
              transactionCount: transactions.length,
              incomeRecords: income.length,
              totalExpense: transactions.reduce((sum, t) => sum + t.castka, 0),
              totalIncome: income.reduce((sum, i) => sum + i.castka, 0)
            });

            // FÁZE 5.0A: Call external Python runtime instead of Node.js baseline
            const runtimeRequest = {
              uid: user.uid,
              pipelineLevel: 'L1',
              modelVersion: ML_VERSION,
              transactions: transactions.map(t => ({
                category: t.kategorie,
                amount: t.castka,
                date: t.datum,
              })),
              income: income.reduce((s, i) => s + i.castka, 0),
              debugMode: false,
            };

            let prediction;
            try {
              // Call Python runtime
              const runtimeResponse = await mlRuntimeClient.callMlRuntime(runtimeRequest);

              // Transform Python response into Node.js prediction format
              // FÁZE 5.1D: Include Python debug metadata
              prediction = {
                totalPredictedExpense: runtimeResponse.predictions[0]?.totalPredictedExpense || 0,
                categories: runtimeResponse.predictions[0]?.categories || {},
                confidence: 'unknown',
                confidenceScore: Math.round((runtimeResponse.predictions[0]?.confidence || 0) * 100),
                confidenceReason: `Python ML Runtime (L1) - confidence: ${runtimeResponse.predictions[0]?.confidence || 0}`,
                features: { dataPoints: transactions.length },
                incomeStats: { dataPoints: income.length },
                monthlyIncome: {},
                // FÁZE 5.1D: Python debug metadata for explainability
                sourceMethod: 'Python ML Runtime',
                pythonMetadata: {
                  inputs: runtimeResponse.debugMetadata?.inputs || {},
                  confidenceExplained: runtimeResponse.debugMetadata?.confidenceExplained || {},
                  calculationMethod: runtimeResponse.debugMetadata?.calculationMethod || '',
                  processingTimeMs: runtimeResponse.debugMetadata?.processingTimeMs || 0
                }
              };

              // FÁZE 5.1E: Observability logging for deterministic Python result
              logger.info({
                event: 'mlPipeline_deterministicResult_generated',
                uid: user.uid,
                predictedExpense: prediction.totalPredictedExpense,
                method: 'Python Deterministic'
              });

              logger.info({
                event: 'mlPipeline_confidenceAssigned',
                uid: user.uid,
                confidence: prediction.confidenceScore,
                confidenceLevel: prediction.confidenceScore >= 80 ? 'high' : prediction.confidenceScore >= 50 ? 'medium' : 'low',
                method: 'Python 4-Factor (data frequency, transaction count, expense ratio, income constraint)'
              });

              if (prediction.pythonMetadata) {
                logger.info({
                  event: 'mlPipeline_debugMetadataAttached',
                  uid: user.uid,
                  hasInputs: !!prediction.pythonMetadata.inputs,
                  hasConfidenceExplained: !!prediction.pythonMetadata.confidenceExplained,
                  hasCalculationMethod: !!prediction.pythonMetadata.calculationMethod,
                  pythonProcessingMs: prediction.pythonMetadata.processingTimeMs
                });
              }

              logger.info({
                event: 'mlPipeline_pythonRuntimeCalled',
                uid: user.uid,
                processingTimeMs: runtimeResponse.debugMetadata?.processingTimeMs || 0,
              });
            } catch (runtimeErr) {
              // Fallback to Node.js baseline if Python runtime fails
              logger.warn({
                event: 'mlPipeline_pythonRuntimeFailed',
                uid: user.uid,
                error: runtimeErr.message,
                message: 'Falling back to Node.js baseline',
              });
              prediction = generateBaselinePrediction(transactions, income);
              // FÁZE 5.1D: Mark as fallback source
              prediction.sourceMethod = 'Node.js (fallback)';
              prediction.pythonMetadata = null;
            }

            const saved = await savePredictionResults(user.uid, prediction);

            if (saved) {
              predictionsCreated++;
              logger.info({
                event: 'mlPipeline_predictionSaved',
                uid: user.uid,
                totalPredicted: prediction.totalPredictedExpense,
                confidence: prediction.confidence,
              });
            }

            usersProcessed++;
          } catch (userErr) {
            logger.warn({
              event: 'mlPipeline_userError',
              uid: user.uid,
              error: userErr.message,
            });
          }
        }

        const durationMs = Date.now() - startTime;

        // Save test run
        await db.collection('mlRuns').add({
          status: 'success',
          pipelineLevel: ML_PIPELINE_LEVEL,
          modelVersion: ML_VERSION,
          startedAt: new Date(startTime),
          finishedAt: new Date(),
          usersProcessed,
          predictionsCreated,
          durationMs,
          errorMessage: null,
          errorCode: null,
          isManualTest: true,
          triggeredBy: decodedToken.uid,
        });

        logger.info({
          event: 'mlPipeline_manualTest_completed',
          usersProcessed,
          predictionsCreated,
          durationMs,
        });

        res.status(200).json({
          ok: true,
          status: 'success',
          usersProcessed,
          predictionsCreated,
          durationMs,
        });
      } catch (err) {
        errorMessage = err.message;
        errorCode = err.code || 'UNKNOWN';
        const durationMs = Date.now() - startTime;

        logger.error({
          event: 'mlPipeline_manualTest_failed',
          errorMessage,
          errorCode,
          durationMs,
        });

        await db.collection('mlRuns').add({
          status: 'failed',
          pipelineLevel: ML_PIPELINE_LEVEL,
          modelVersion: ML_VERSION,
          startedAt: new Date(startTime),
          finishedAt: new Date(),
          usersProcessed,
          predictionsCreated,
          durationMs,
          errorMessage,
          errorCode,
          isManualTest: true,
          triggeredBy: decodedToken.uid,
        });

        res.status(500).json({
          ok: false,
          status: 'failed',
          error: errorMessage,
          errorCode,
        });
      }
    } catch (err) {
      logger.error('testMlPipeline error:', err);
      res.status(500).json({ error: err.message });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 📚 TRAINING DATA MANAGEMENT - Admin functions for ML training
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * adminCreateTrainingData - Create new training data record
 *
 * POST /adminCreateTrainingData
 * Authorization: Bearer <idToken>
 *
 * Body: {
 *   type: "income_name" | "expense_name" | "category_rule" | "qa_example",
 *   input: string,
 *   expectedOutput: string,
 *   category: string,
 *   tags: string[],
 *   note: string
 * }
 */
exports.adminCreateTrainingData = functions
  .region(REGION)
  .https.onRequest(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      cors(req, res, () => res.sendStatus(200));
      return;
    }

    cors(req, res, async () => {
      try {
        // 1. Verify auth token from Authorization header
        const authHeader = req.get('Authorization') || '';
        const token = authHeader.replace('Bearer ', '');

        if (!token) {
          return res.status(401).json({ error: 'Missing authorization token' });
        }

        const decodedToken = await verifyAuth(token);
        // IMPORTANT: Never log token
        logger.info(`adminCreateTrainingData called by ${decodedToken.email}`);

        // 2. Check admin role (admin or ml_admin)
        const userDoc = await db.collection('users').doc(decodedToken.uid).get();
        const userRole = userDoc.data()?.role || decodedToken.customClaims?.role;

        if (!['admin', 'ml_admin'].includes(userRole)) {
          logger.warn(`Unauthorized adminCreateTrainingData attempt by ${decodedToken.email} (role: ${userRole})`);
          return res.status(403).json({ error: 'Insufficient permissions' });
        }

        // 3. Validate input
        const { type, input, expectedOutput, category, tags = [], note = '' } = req.body;

        if (!type || !input || !expectedOutput) {
          return res.status(400).json({ error: 'Missing required fields: type, input, expectedOutput' });
        }

        const validTypes = ['income_name', 'expense_name', 'category_rule', 'qa_example'];
        if (!validTypes.includes(type)) {
          return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
        }

        // 4. Create document in trainingData collection
        const trainingDocRef = db.collection('trainingData').doc();

        // admin/ml_admin records are auto-approved on creation
        const trainingData = {
          type,
          input,
          expectedOutput,
          category: category || '',
          tags: Array.isArray(tags) ? tags : [],
          note,
          approved: true,
          status: 'approved',
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          approvedBy: decodedToken.uid,
          createdBy: decodedToken.uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await trainingDocRef.set(trainingData);

        // 5. Log to audit trail
        await logAdminAction(decodedToken.uid, 'TRAINING_DATA_CREATED', {
          trainingDataId: trainingDocRef.id,
          type,
          category,
          inputLength: String(input).length,
        });

        logger.info(`Training data created: ${trainingDocRef.id} by ${decodedToken.email}`);

        // 6. Return safe response
        res.status(201).json({
          ok: true,
          id: trainingDocRef.id,
          message: `Training data created successfully`,
        });

      } catch (err) {
        logger.error('adminCreateTrainingData error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
      }
    });
  });

/**
 * adminGetTrainingData - Retrieve training data with filters and pagination
 *
 * GET /adminGetTrainingData?type=&category=&approved=&limit=&offset=
 * Authorization: Bearer <idToken>
 */
exports.adminGetTrainingData = functions
  .region(REGION)
  .https.onRequest(async (req, res) => {
    if (req.method === 'OPTIONS') {
      cors(req, res, () => res.sendStatus(200));
      return;
    }

    cors(req, res, async () => {
      try {
        // 1. Verify auth token
        const authHeader = req.get('Authorization') || '';
        const token = authHeader.replace('Bearer ', '');

        if (!token) {
          return res.status(401).json({ error: 'Missing authorization token' });
        }

        const decodedToken = await verifyAuth(token);

        // 2. Check admin role
        const userDoc = await db.collection('users').doc(decodedToken.uid).get();
        const userRole = userDoc.data()?.role || decodedToken.customClaims?.role;

        if (!['admin', 'ml_admin'].includes(userRole)) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }

        // 3. Build query with filters
        // Read params from body (POST via IPC) OR query string (GET)
        const params = Object.keys(req.body || {}).length > 0 ? req.body : req.query;
        const type = params.type;
        const category = params.category;
        const approved = params.approved;
        const limit = params.limit || 50;
        const offset = params.offset || 0;

        let query = db.collection('trainingData');

        // Apply type filter first (without orderBy to avoid composite index requirement)
        if (type && type !== 'all') {
          query = query.where('type', '==', type);
        }

        if (category && category !== 'all') {
          query = query.where('category', '==', category);
        }

        if (approved !== undefined && approved !== 'all') {
          // Filter by status field (works for both manual training data and L2 feedback)
          // 'true' means status='approved', 'false' means status='rejected' or pending
          const isApproved = approved === 'true' || approved === true;
          if (isApproved) {
            query = query.where('status', '==', 'approved');
          } else {
            query = query.where('status', '!=', 'approved');
          }
        }

        // Only add orderBy when no compound where (avoids index requirement)
        query = query.orderBy('createdAt', 'desc');

        // 4. Get total count and paginated data
        const snapshot = await query.get();
        const totalCount = snapshot.size;

        const limitNum = Math.min(parseInt(limit) || 50, 100);
        const offsetNum = parseInt(offset) || 0;

        const items = snapshot.docs
          .slice(offsetNum, offsetNum + limitNum)
          .map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.() || null,
            updatedAt: doc.data().updatedAt?.toDate?.() || null,
          }));

        res.json({
          ok: true,
          items,
          totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + limitNum < totalCount,
        });

      } catch (err) {
        logger.error('adminGetTrainingData error:', err);
        res.status(500).json({ error: err.message });
      }
    });
  });

/**
 * adminUpdateTrainingData - Update training data record
 *
 * POST /adminUpdateTrainingData
 * Authorization: Bearer <idToken>
 *
 * Body: {
 *   id: string,
 *   input?: string,
 *   expectedOutput?: string,
 *   category?: string,
 *   tags?: string[],
 *   note?: string
 * }
 */
exports.adminUpdateTrainingData = functions
  .region(REGION)
  .https.onRequest(async (req, res) => {
    if (req.method === 'OPTIONS') {
      cors(req, res, () => res.sendStatus(200));
      return;
    }

    cors(req, res, async () => {
      try {
        // 1. Verify auth token
        const authHeader = req.get('Authorization') || '';
        const token = authHeader.replace('Bearer ', '');

        if (!token) {
          return res.status(401).json({ error: 'Missing authorization token' });
        }

        const decodedToken = await verifyAuth(token);

        // 2. Check admin role
        const userDoc = await db.collection('users').doc(decodedToken.uid).get();
        const userRole = userDoc.data()?.role || decodedToken.customClaims?.role;

        if (!['admin', 'ml_admin'].includes(userRole)) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }

        // 3. Validate input
        const { id, input, expectedOutput, category, tags, note } = req.body;

        if (!id) {
          return res.status(400).json({ error: 'Missing required field: id' });
        }

        // 4. Update document
        const updates = {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (input !== undefined) updates.input = input;
        if (expectedOutput !== undefined) updates.expectedOutput = expectedOutput;
        if (category !== undefined) updates.category = category;
        if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags : [];
        if (note !== undefined) updates.note = note;

        await db.collection('trainingData').doc(id).update(updates);

        // 5. Log to audit trail
        await logAdminAction(decodedToken.uid, 'TRAINING_DATA_UPDATED', {
          trainingDataId: id,
          fieldsUpdated: Object.keys(updates),
        });

        logger.info(`Training data updated: ${id} by ${decodedToken.email}`);

        res.json({
          ok: true,
          message: 'Training data updated successfully',
        });

      } catch (err) {
        logger.error('adminUpdateTrainingData error:', err);
        res.status(500).json({ error: err.message });
      }
    });
  });

/**
 * adminApproveTrainingData - Approve or reject training data
 *
 * POST /adminApproveTrainingData
 * Authorization: Bearer <idToken>
 *
 * Body: {
 *   id: string,
 *   approved: boolean,
 *   reason?: string (for rejection)
 * }
 */
exports.adminApproveTrainingData = functions
  .region(REGION)
  .https.onRequest(async (req, res) => {
    if (req.method === 'OPTIONS') {
      cors(req, res, () => res.sendStatus(200));
      return;
    }

    cors(req, res, async () => {
      try {
        // 1. Verify auth token
        const authHeader = req.get('Authorization') || '';
        const token = authHeader.replace('Bearer ', '');

        if (!token) {
          return res.status(401).json({ error: 'Missing authorization token' });
        }

        const decodedToken = await verifyAuth(token);

        // 2. Check admin role
        const userDoc = await db.collection('users').doc(decodedToken.uid).get();
        const userRole = userDoc.data()?.role || decodedToken.customClaims?.role;

        if (!['admin', 'ml_admin'].includes(userRole)) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }

        // 3. Validate input
        const { id, approved, reason = '' } = req.body;

        if (!id || approved === undefined) {
          return res.status(400).json({ error: 'Missing required fields: id, approved' });
        }

        // 4. Update approval status (both fields for consistency)
        const updates = {
          approved: Boolean(approved),
          status: Boolean(approved) ? 'approved' : 'rejected',
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          approvedBy: decodedToken.uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (reason) {
          updates.approvalReason = reason;
        }

        await db.collection('trainingData').doc(id).update(updates);

        // 5. Log to audit trail
        await logAdminAction(decodedToken.uid, 'TRAINING_DATA_APPROVED', {
          trainingDataId: id,
          approved: Boolean(approved),
          reason,
        });

        logger.info(`Training data ${approved ? 'approved' : 'rejected'}: ${id} by ${decodedToken.email}`);

        res.json({
          ok: true,
          message: `Training data ${approved ? 'approved' : 'rejected'} successfully`,
        });

      } catch (err) {
        logger.error('adminApproveTrainingData error:', err);
        res.status(500).json({ error: err.message });
      }
    });
  });

// ═══════════════════════════════════════════════════════════════════════════════
// 👥 USER MANAGEMENT - Admin functions for user creation and management
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * adminCreateUser - Create new user via Firebase Authentication and Firestore
 *
 * POST /adminCreateUser
 * Authorization: Bearer <idToken>
 *
 * Body: {
 *   email: string,
 *   displayName: string,
 *   role: "user" | "admin" | "ml_admin" | "developer",
 *   temporaryPassword?: string,
 *   sendInviteLater?: boolean
 * }
 */
exports.adminCreateUser = functions
  .region(REGION)
  .https.onRequest(async (req, res) => {
    if (req.method === 'OPTIONS') {
      cors(req, res, () => res.sendStatus(200));
      return;
    }

    cors(req, res, async () => {
      try {
        // 1. Verify auth token from Authorization header
        const authHeader = req.get('Authorization') || '';
        const token = authHeader.replace('Bearer ', '');

        if (!token) {
          return res.status(401).json({ error: 'Missing authorization token' });
        }

        const decodedToken = await verifyAuth(token);
        logger.info(`adminCreateUser called by ${decodedToken.email}`);

        // 2. Check admin role
        const callerDoc = await db.collection('users').doc(decodedToken.uid).get();
        const callerRole = callerDoc.data()?.role || decodedToken.customClaims?.role;

        if (!['admin'].includes(callerRole)) {
          logger.warn(`Unauthorized adminCreateUser attempt by ${decodedToken.email} (role: ${callerRole})`);
          return res.status(403).json({ error: 'Only admin can create users' });
        }

        // 3. Validate input
        const { email, displayName, role, temporaryPassword, sendInviteLater } = req.body;

        if (!email || !displayName || !role) {
          return res.status(400).json({
            error: 'Missing required fields: email, displayName, role',
          });
        }

        if (!validateEmail(email)) {
          return res.status(400).json({ error: 'Invalid email format' });
        }

        const validRoles = ['user', 'admin', 'ml_admin', 'developer'];
        if (!validRoles.includes(role)) {
          return res.status(400).json({
            error: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
          });
        }

        // 4. Check if user already exists
        try {
          await admin.auth().getUserByEmail(email);
          return res.status(409).json({ error: 'User with this email already exists' });
        } catch (err) {
          if (err.code !== 'auth/user-not-found') {
            throw err;
          }
          // User doesn't exist, continue
        }

        // 5. Create user in Firebase Authentication
        const password = temporaryPassword || Math.random().toString(36).slice(-12);

        const userRecord = await admin.auth().createUser({
          email,
          displayName,
          password,
          emailVerified: false,
        });

        logger.info(`User created in Auth: ${userRecord.uid} (${email})`);

        // 6. Set custom claims (role)
        await admin.auth().setCustomUserClaims(userRecord.uid, { role });
        logger.info(`Custom claims set for ${userRecord.uid}: role=${role}`);

        // 7. Create document in users collection
        await db.collection('users').doc(userRecord.uid).set({
          uid: userRecord.uid,
          email,
          displayName,
          role,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          isActive: true,
          lastActivity: null,
        });

        logger.info(`User document created in Firestore: ${userRecord.uid}`);

        // 8. Log to audit trail
        await logAdminAction(decodedToken.uid, 'USER_CREATED', {
          userId: userRecord.uid,
          email,
          role,
          sendInviteLater: Boolean(sendInviteLater),
        });

        // 9. Return safe response (NEVER include password or token)
        res.status(201).json({
          ok: true,
          userId: userRecord.uid,
          email,
          displayName,
          role,
          message: `User created successfully. ${
            sendInviteLater
              ? 'Send invite link manually.'
              : `Temporary password: ${password}. User should change password on first login.`
          }`,
        });

      } catch (err) {
        logger.error('adminCreateUser error:', err);

        // Handle specific Firebase Auth errors
        if (err.code === 'auth/email-already-exists') {
          return res.status(409).json({ error: 'User with this email already exists' });
        }
        if (err.code === 'auth/invalid-email') {
          return res.status(400).json({ error: 'Invalid email format' });
        }

        res.status(500).json({ error: err.message || 'Internal server error' });
      }
    });
  });

/**
 * adminGetAuditTrail - Retrieve audit logs with optional filters and pagination
 *
 * GET /adminGetAuditTrail?limit=&offset=&adminUid=&action=
 */
exports.adminGetAuditTrail = functions
  .region(REGION)
  .https.onRequest(async (req, res) => {
    if (req.method === 'OPTIONS') {
      cors(req, res, () => res.sendStatus(200));
      return;
    }

    cors(req, res, async () => {
      try {
        // 1. Verify auth token
        const authHeader = req.get('Authorization') || '';
        const token = authHeader.replace('Bearer ', '');

        if (!token) {
          return res.status(401).json({ error: 'Missing authorization token' });
        }

        const decodedToken = await verifyAuth(token);

        // 2. Check admin role
        const userDoc = await db.collection('users').doc(decodedToken.uid).get();
        const userRole = userDoc.data()?.role || decodedToken.customClaims?.role;

        if (!['admin', 'ml_admin'].includes(userRole)) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }

        // 3. Build query with filters
        let query = db.collection('_auditLog').orderBy('timestamp', 'desc');

        const { limit = 100, offset = 0, adminUid, action } = req.query;

        if (adminUid && adminUid !== 'all') {
          query = query.where('adminUid', '==', adminUid);
        }

        if (action && action !== 'all') {
          query = query.where('action', '==', action);
        }

        // 4. Get total count and paginated data
        const snapshot = await query.get();
        const totalCount = snapshot.size;

        const limitNum = Math.min(parseInt(limit) || 100, 500);
        const offsetNum = parseInt(offset) || 0;

        const items = snapshot.docs
          .slice(offsetNum, offsetNum + limitNum)
          .map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp?.toDate?.() || null,
          }));

        res.json({
          ok: true,
          items,
          totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + limitNum < totalCount,
        });

      } catch (err) {
        logger.error('adminGetAuditTrail error:', err);
        res.status(500).json({ error: err.message });
      }
    });
  });

/**
 * adminActivateLevel2Model - Activate Level 2 (ML prediction model)
 * Moves Level 2 from shadow mode to production
 */
exports.adminActivateLevel2Model = functions
  .region(REGION)
  .https.onRequest(async (req, res) => {
    if (req.method === 'OPTIONS') {
      cors(req, res, () => res.sendStatus(200));
      return;
    }

    cors(req, res, async () => {
      try {
        // 1. Verify auth token
        const authHeader = req.get('Authorization') || '';
        const token = authHeader.replace('Bearer ', '');

        if (!token) {
          return res.status(401).json({ error: 'Missing authorization token' });
        }

        const decodedToken = await verifyAuth(token);

        // 2. Check admin role
        const userDoc = await db.collection('users').doc(decodedToken.uid).get();
        const userRole = userDoc.data()?.role || decodedToken.customClaims?.role;

        if (!['admin', 'ml_admin'].includes(userRole)) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }

        // 3. Update ML metrics to activate Level 2
        const metricsRef = db.collection('mlMetrics').doc('default');
        const metricsDoc = await metricsRef.get();
        const currentMetrics = metricsDoc.data() || {};

        await metricsRef.set({
          ...currentMetrics,
          level2Status: 'active',
          lastActivatedAt: admin.firestore.FieldValue.serverTimestamp(),
          activatedBy: decodedToken.uid,
        }, { merge: true });

        // 4. Log to audit trail
        await logAdminAction(decodedToken.uid, 'LEVEL2_ACTIVATED', {
          previousStatus: currentMetrics.level2Status || 'unknown',
          newStatus: 'active',
          timestamp: Date.now(),
        });

        logger.info(`Level 2 activated by ${decodedToken.email}`);

        // 5. Return response
        res.status(200).json({
          ok: true,
          message: 'Level 2 model activated successfully',
        });

      } catch (err) {
        logger.error('adminActivateLevel2Model error:', err);
        res.status(500).json({ error: err.message });
      }
    });
  });

/**
 * adminRollbackToLevel1 - Rollback to Level 1 (baseline model)
 * Reverts Level 2 from active back to shadow or disabled state
 */
exports.adminRollbackToLevel1 = functions
  .region(REGION)
  .https.onRequest(async (req, res) => {
    if (req.method === 'OPTIONS') {
      cors(req, res, () => res.sendStatus(200));
      return;
    }

    cors(req, res, async () => {
      try {
        // 1. Verify auth token
        const authHeader = req.get('Authorization') || '';
        const token = authHeader.replace('Bearer ', '');

        if (!token) {
          return res.status(401).json({ error: 'Missing authorization token' });
        }

        const decodedToken = await verifyAuth(token);

        // 2. Check admin role
        const userDoc = await db.collection('users').doc(decodedToken.uid).get();
        const userRole = userDoc.data()?.role || decodedToken.customClaims?.role;

        if (!['admin', 'ml_admin'].includes(userRole)) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }

        // 3. Update ML metrics to rollback Level 2
        const metricsRef = db.collection('mlMetrics').doc('default');
        const metricsDoc = await metricsRef.get();
        const currentMetrics = metricsDoc.data() || {};
        const reason = req.body?.reason || 'manual_rollback';

        await metricsRef.set({
          ...currentMetrics,
          level2Status: 'shadow',
          lastRolledbackAt: admin.firestore.FieldValue.serverTimestamp(),
          rolledbackBy: decodedToken.uid,
          rollbackReason: reason,
        }, { merge: true });

        // 4. Log to audit trail
        await logAdminAction(decodedToken.uid, 'LEVEL2_ROLLED_BACK', {
          previousStatus: currentMetrics.level2Status || 'unknown',
          newStatus: 'shadow',
          reason,
          timestamp: Date.now(),
        });

        logger.info(`Level 2 rolled back to shadow by ${decodedToken.email} (reason: ${reason})`);

        // 5. Return response
        res.status(200).json({
          ok: true,
          message: 'Rolled back to Level 1 successfully',
        });

      } catch (err) {
        logger.error('adminRollbackToLevel1 error:', err);
        res.status(500).json({ error: err.message });
      }
    });
  });

// ═══════════════════════════════════════════════════════════════════════════════
// PREDICTION SETTINGS - Source of truth for ML model state (Level 1 vs Level 2)
// ═══════════════════════════════════════════════════════════════════════════════

exports.adminGetPredictionSettings = functions.region(REGION).https.onRequest(async (req, res) => {
  try {
    const auth = req.header('authorization')?.replace('Bearer ', '');
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const decodedToken = await admin.auth().verifyIdToken(auth);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userRole = userDoc.data()?.role;

    if (!['admin', 'ml_admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }

    // Get or create default prediction settings
    let settingsDoc = await db.collection('appConfig').doc('predictionSettings').get();

    if (!settingsDoc.exists) {
      // Create default settings
      const defaults = {
        activePredictionLevel: 1,
        level2Enabled: false,
        level2ShadowMode: false,
        fallbackEnabled: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: decodedToken.uid,
      };
      await db.collection('appConfig').doc('predictionSettings').set(defaults);
      settingsDoc = await db.collection('appConfig').doc('predictionSettings').get();
    }

    res.status(200).json({ ok: true, data: settingsDoc.data() });
  } catch (err) {
    logger.error('adminGetPredictionSettings error:', err);
    res.status(500).json({ error: err.message });
  }
});

exports.adminUpdatePredictionSettings = functions.region(REGION).https.onRequest(async (req, res) => {
  try {
    const auth = req.header('authorization')?.replace('Bearer ', '');
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const decodedToken = await admin.auth().verifyIdToken(auth);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userRole = userDoc.data()?.role;

    if (!['admin', 'ml_admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }

    const { activePredictionLevel, level2Enabled, level2ShadowMode, fallbackEnabled } = req.body;

    // Validate
    if (activePredictionLevel !== 1 && activePredictionLevel !== 2) {
      return res.status(400).json({ error: 'Invalid activePredictionLevel' });
    }

    // Update settings — set+merge so it works even if doc doesn't exist yet
    const settingsData = {
      activePredictionLevel,
      level2Enabled: level2Enabled ?? false,
      level2ShadowMode: level2ShadowMode ?? false,
      fallbackEnabled: fallbackEnabled ?? true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: decodedToken.uid,
    };

    await db.collection('appConfig').doc('predictionSettings').set(settingsData, { merge: true });

    // Log to audit trail
    await db.collection('_auditLog').add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      action: 'UPDATE_PREDICTION_SETTINGS',
      uid: decodedToken.uid,
      role: userRole,
      details: { activePredictionLevel, level2Enabled, level2ShadowMode, fallbackEnabled },
      ip: req.ip,
    });

    // Return updated settings
    const updatedDoc = await db.collection('appConfig').doc('predictionSettings').get();
    res.status(200).json({ ok: true, data: updatedDoc.data() });
  } catch (err) {
    logger.error('adminUpdatePredictionSettings error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ML RUNS - Get all ML pipeline runs for admin dashboard
// ═══════════════════════════════════════════════════════════════════════════════

exports.adminGetMlRuns = functions.region(REGION).https.onRequest(async (req, res) => {
  try {
    const auth = req.header('authorization')?.replace('Bearer ', '');
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const decodedToken = await admin.auth().verifyIdToken(auth);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userRole = userDoc.data()?.role;

    if (!['admin', 'ml_admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }

    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    const runs = await db
      .collection('mlRuns')
      .orderBy('startedAt', 'desc')
      .limit(limit)
      .get();

    const data = runs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json({ ok: true, data });
  } catch (err) {
    logger.error('adminGetMlRuns error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ML PREDICTIONS - Get predictions for all users or specific user
// ═══════════════════════════════════════════════════════════════════════════════

exports.adminGetMlPredictions = functions.region(REGION).https.onRequest(async (req, res) => {
  try {
    const auth = req.header('authorization')?.replace('Bearer ', '');
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const decodedToken = await admin.auth().verifyIdToken(auth);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userRole = userDoc.data()?.role;

    if (!['admin', 'ml_admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }

    // Support uid from body (POST) or query (GET)
    const targetUserId = req.body?.uid || req.query.uid;
    const pipelineLevel = req.body?.pipelineLevel != null ? parseInt(req.body.pipelineLevel) : null;
    const perUserLimit = req.body?.limit ? parseInt(req.body.limit) : 5;

    if (targetUserId) {
      // Single user mode — fetch then filter client-side to avoid composite index requirement
      const snap = await db
        .collection('users')
        .doc(targetUserId)
        .collection('mlPredictions')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();
      let docs = snap.docs.map(doc => ({ id: doc.id, userId: targetUserId, ...doc.data() }));
      if (pipelineLevel != null) {
        docs = docs.filter(d => d.pipelineLevel === pipelineLevel);
      }
      return res.status(200).json({ ok: true, data: docs.slice(0, perUserLimit) });
    }

    // All users mode: fetch per-user (no pipelineLevel in query to avoid index requirement)
    const usersSnap = await db.collection('users').get();
    const allPredictions = [];
    for (const uDoc of usersSnap.docs) {
      try {
        const snap = await db
          .collection('users').doc(uDoc.id).collection('mlPredictions')
          .orderBy('createdAt', 'desc')
          .limit(50)
          .get();
        snap.docs.forEach(doc => {
          const d = { id: doc.id, userId: uDoc.id, ...doc.data() };
          if (pipelineLevel == null || d.pipelineLevel === pipelineLevel) {
            allPredictions.push(d);
          }
        });
      } catch (e) {
        // skip user on error
      }
    }
    allPredictions.sort((a, b) => {
      const aMs = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bMs = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bMs - aMs;
    });

    res.status(200).json({ ok: true, data: allPredictions.slice(0, perUserLimit * 10) });
  } catch (err) {
    logger.error('adminGetMlPredictions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Aggregate metrics across all users
exports.adminGetAggregateMetrics = functions.region(REGION).https.onRequest(async (req, res) => {
  try {
    const auth = req.header('authorization')?.replace('Bearer ', '');
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const decodedToken = await admin.auth().verifyIdToken(auth);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userRole = userDoc.data()?.role;

    if (!['admin', 'ml_admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }

    const pipelineLevel = req.body?.pipelineLevel != null ? parseInt(req.body.pipelineLevel) : null;

    // Fetch all users
    const usersSnap = await db.collection('users').get();
    const metrics = {
      totalUsers: usersSnap.size,
      totalPredictions: 0,
      usersWithPredictions: new Set(),
      totalPredictedExpense: 0,
      averageConfidence: 0,
      totalFallback: 0,
      totalStaleProfiles: 0,
      totalMissingProfiles: 0,
      totalPersonalized: 0,
      trainingDataUsedCount: 0,
      allPredictions: [],
    };

    // Iterate through all users and collect predictions
    for (const uDoc of usersSnap.docs) {
      try {
        const predictionsSnap = await db
          .collection('users').doc(uDoc.id).collection('mlPredictions')
          .get();

        predictionsSnap.docs.forEach(doc => {
          const pred = { userId: uDoc.id, ...doc.data() };

          // Filter by pipelineLevel if specified
          if (pipelineLevel != null && pred.pipelineLevel !== pipelineLevel) {
            return;
          }

          metrics.totalPredictions++;
          metrics.usersWithPredictions.add(uDoc.id);
          metrics.totalPredictedExpense += pred.totalPredictedExpense ?? 0;
          metrics.allPredictions.push(pred);

          if (pred.fallbackUsed) metrics.totalFallback++;
          if (pred.aiProfileStale) metrics.totalStaleProfiles++;
          if (pred.aiProfileStatus === 'missing') metrics.totalMissingProfiles++;
          if (pred.aiProfileUsed && !pred.fallbackUsed) metrics.totalPersonalized++;
          if (pred.trainingDataUsed) metrics.trainingDataUsedCount++;
        });
      } catch (e) {
        // Skip user on error
      }
    }

    // Calculate average confidence
    const withConf = metrics.allPredictions.filter(p => (p.confidenceScore ?? 0) > 0);
    if (withConf.length > 0) {
      metrics.averageConfidence = withConf.reduce((s, p) => s + p.confidenceScore, 0) / withConf.length;
      metrics.averageConfidence = Math.round(metrics.averageConfidence * 10) / 10; // Round to 1 decimal
    }

    // Convert Set to number
    const usersWithPredictionsCount = metrics.usersWithPredictions.size;

    // Remove allPredictions from response (too large)
    const response = {
      ok: true,
      data: {
        totalUsers: metrics.totalUsers,
        usersWithPredictions: usersWithPredictionsCount,
        totalPredictions: metrics.totalPredictions,
        totalPredictedExpense: metrics.totalPredictedExpense,
        averageConfidence: metrics.averageConfidence,
        fallbackPredictions: metrics.totalFallback,
        staleProfiles: metrics.totalStaleProfiles,
        missingProfiles: metrics.totalMissingProfiles,
        personalizedPredictions: metrics.totalPersonalized,
        trainingDataUsed: metrics.trainingDataUsedCount,
        pipelineLevel: pipelineLevel,
      }
    };

    res.status(200).json(response);
  } catch (err) {
    logger.error('adminGetAggregateMetrics error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get latest L2 shadow run evaluation metrics
exports.adminGetLatestL2RunSummary = functions.region(REGION).https.onRequest(async (req, res) => {
  try {
    const auth = req.header('authorization')?.replace('Bearer ', '');
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const decodedToken = await admin.auth().verifyIdToken(auth);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userRole = userDoc.data()?.role;

    if (!['admin', 'ml_admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }

    // Fetch ALL mlRuns without orderBy, sort client-side.
    const snap = await db.collection('mlRuns').limit(200).get();
    const allDocs = snap.docs.map(doc => {
      const d = doc.data();
      return { id: doc.id, ...d };
    });

    // Debug: log what fields we actually see in the collection
    const debugSample = allDocs.slice(0, 3).map(d => ({
      id: d.id, pipelineLevel: d.pipelineLevel, level: d.level,
      mode: d.mode, shadowMode: d.shadowMode, status: d.status,
      hasStartedAt: !!d.startedAt, hasTimestamp: !!d.timestamp,
    }));
    logger.info('[L2_SUMMARY] mlRuns sample:', JSON.stringify(debugSample));
    logger.info('[L2_SUMMARY] total docs in mlRuns:', allDocs.length);

    // Broad filter: pipelineLevel 2 OR level 2 (ignore mode - older docs may not have it)
    const l2Docs = allDocs
      .filter(d => d.pipelineLevel === 2 || d.level === 2)
      .sort((a, b) => {
        const aMs = a.startedAt?.toMillis?.() || (a.startedAt?.seconds || 0) * 1000 || (a.timestamp ? new Date(a.timestamp).getTime() : 0);
        const bMs = b.startedAt?.toMillis?.() || (b.startedAt?.seconds || 0) * 1000 || (b.timestamp ? new Date(b.timestamp).getTime() : 0);
        return bMs - aMs;
      });

    logger.info('[L2_SUMMARY] l2 docs after filter:', l2Docs.length);

    if (l2Docs.length === 0) {
      return res.status(200).json({ ok: true, data: null, message: `No L2 shadow runs found (total mlRuns: ${allDocs.length})` });
    }

    const latestRun = l2Docs[0];
    const summary = {
      runId: latestRun.runId,
      status: latestRun.status,
      startedAt: latestRun.startedAt,
      finishedAt: latestRun.finishedAt,
      durationMs: latestRun.durationMs,
      // Evaluation metrics
      averageConfidence: latestRun.averageConfidence || 0,
      averageFinalCorrectionFactor: latestRun.averageFinalCorrectionFactor || 1.0,
      staleProfileCount: latestRun.staleProfileCount || 0,
      missingProfileCount: latestRun.missingProfileCount || 0,
      personalizedPredictionCount: latestRun.personalizedPredictionCount || 0,
      fallbackPredictionCount: latestRun.fallbackPredictionCount || 0,
      // Stats
      predictionsCreated: latestRun.predictionsCreated,
      usersProcessed: latestRun.usersProcessed,
      usersTotal: latestRun.usersTotal,
    };

    res.status(200).json({ ok: true, data: summary });
  } catch (err) {
    logger.error('adminGetLatestL2RunSummary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get recent L2 shadow runs for historical comparison
exports.adminGetRecentL2Runs = functions.region(REGION).https.onRequest(async (req, res) => {
  try {
    const auth = req.header('authorization')?.replace('Bearer ', '');
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const decodedToken = await admin.auth().verifyIdToken(auth);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userRole = userDoc.data()?.role;

    if (!['admin', 'ml_admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }

    // Same broad filter as adminGetLatestL2RunSummary — pipelineLevel 2 OR level 2.
    const snap2 = await db.collection('mlRuns').limit(200).get();
    const allDocs2 = snap2.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const l2RunDocs = allDocs2
      .filter(d => d.pipelineLevel === 2 || d.level === 2)
      .sort((a, b) => {
        const aMs = a.startedAt?.toMillis?.() || (a.startedAt?.seconds || 0) * 1000 || (a.timestamp ? new Date(a.timestamp).getTime() : 0);
        const bMs = b.startedAt?.toMillis?.() || (b.startedAt?.seconds || 0) * 1000 || (b.timestamp ? new Date(b.timestamp).getTime() : 0);
        return bMs - aMs;
      })
      .slice(0, 5);

    if (l2RunDocs.length === 0) {
      return res.status(200).json({ ok: true, data: [], message: 'No L2 shadow runs found' });
    }

    const runsData = l2RunDocs.map(data => ({
      id: data.id,
      runId: data.runId,
      status: data.status,
      startedAt: data.startedAt,
      durationMs: data.durationMs,
      // Core stats
      predictionsCreated: data.predictionsCreated || 0,
      usersProcessed: data.usersProcessed || 0,
      usersTotal: data.usersTotal || 0,
      // Evaluation metrics
      averageConfidence: data.averageConfidence || 0,
      personalizedPredictionCount: data.personalizedPredictionCount || 0,
      staleProfileCount: data.staleProfileCount || 0,
      missingProfileCount: data.missingProfileCount || 0,
      fallbackPredictionCount: data.fallbackPredictionCount || 0,
    }));

    res.status(200).json({ ok: true, data: runsData });
  } catch (err) {
    logger.error('adminGetRecentL2Runs error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT - Admin Functions (AURIX Core)
// ═══════════════════════════════════════════════════════════════════════════════

const VALID_ROLES = ['viewer', 'analyst', 'admin', 'ml_admin', 'developer'];

const verifyAdminRole = async (authHeader) => {
  const token = (authHeader || '').replace('Bearer ', '');
  if (!token) throw Object.assign(new Error('Missing authorization token'), { status: 401 });
  const decoded = await admin.auth().verifyIdToken(token);
  const userDoc = await db.collection('users').doc(decoded.uid).get();
  const role = userDoc.data()?.role;
  if (role !== 'admin') throw Object.assign(new Error('Forbidden: admin role required'), { status: 403 });
  return { decoded, role };
};

const getAdminCount = async () => {
  const snap = await db.collection('users').where('role', '==', 'admin').get();
  return snap.size;
};

// ── adminUpdateUserRole ──────────────────────────────────────────────────────
exports.adminUpdateUserRole = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const { decoded } = await verifyAdminRole(req.get('Authorization'));
      const userId = req.body.userId || req.body.targetUid;
      const { newRole } = req.body;

      if (!userId || !newRole) return res.status(400).json({ error: 'userId and newRole are required' });
      if (!VALID_ROLES.includes(newRole)) return res.status(400).json({ error: 'Invalid role. Allowed: ' + VALID_ROLES.join(', ') });
      if (userId === decoded.uid) return res.status(400).json({ error: 'Cannot change your own role' });

      const targetDoc = await db.collection('users').doc(userId).get();
      if (!targetDoc.exists) return res.status(404).json({ error: 'User not found' });

      const previousRole = targetDoc.data()?.role;
      if (previousRole === 'admin' && newRole !== 'admin') {
        const count = await getAdminCount();
        if (count <= 1) return res.status(400).json({ error: 'Cannot remove the last admin' });
      }

      await db.collection('users').doc(userId).update({
        role: newRole,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await admin.auth().setCustomUserClaims(userId, { role: newRole });
      await logAdminAction(decoded.uid, 'USER_ROLE_UPDATED', { userId, previousRole, newRole });

      res.status(200).json({ ok: true, userId, previousRole, newRole });
    } catch (err) {
      logger.error('adminUpdateUserRole error:', err);
      res.status(err.status || 500).json({ error: err.message });
    }
  });
});

// ── adminBlockUser ───────────────────────────────────────────────────────────
exports.adminBlockUser = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const { decoded } = await verifyAdminRole(req.get('Authorization'));
      const userId = req.body.userId || req.body.targetUid;

      if (!userId) return res.status(400).json({ error: 'userId is required' });
      if (userId === decoded.uid) return res.status(400).json({ error: 'Cannot block yourself' });

      const targetDoc = await db.collection('users').doc(userId).get();
      if (!targetDoc.exists) return res.status(404).json({ error: 'User not found' });
      if (targetDoc.data()?.role === 'admin') {
        const count = await getAdminCount();
        if (count <= 1) return res.status(400).json({ error: 'Cannot block the last admin' });
      }

      await admin.auth().updateUser(userId, { disabled: true });
      await db.collection('users').doc(userId).update({
        isActive: false,
        blocked: true,
        disabled: true,
        status: 'blocked',
        blockedAt: admin.firestore.FieldValue.serverTimestamp(),
        blockedBy: decoded.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await logAdminAction(decoded.uid, 'USER_BLOCKED', { userId });

      res.status(200).json({ ok: true, userId, updatedFields: { isActive: false, blocked: true, disabled: true, status: 'blocked' } });
    } catch (err) {
      logger.error('adminBlockUser error:', err);
      res.status(err.status || 500).json({ error: err.message });
    }
  });
});

// ── adminUnblockUser ─────────────────────────────────────────────────────────
exports.adminUnblockUser = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const { decoded } = await verifyAdminRole(req.get('Authorization'));
      const userId = req.body.userId || req.body.targetUid;

      if (!userId) return res.status(400).json({ error: 'userId is required' });

      const targetDoc = await db.collection('users').doc(userId).get();
      if (!targetDoc.exists) return res.status(404).json({ error: 'User not found' });

      await admin.auth().updateUser(userId, { disabled: false });
      await db.collection('users').doc(userId).update({
        isActive: true,
        blocked: false,
        disabled: false,
        status: 'active',
        unblockedAt: admin.firestore.FieldValue.serverTimestamp(),
        unblockedBy: decoded.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await logAdminAction(decoded.uid, 'USER_UNBLOCKED', { userId });

      res.status(200).json({ ok: true, userId, updatedFields: { isActive: true, blocked: false, disabled: false, status: 'active' } });
    } catch (err) {
      logger.error('adminUnblockUser error:', err);
      res.status(err.status || 500).json({ error: err.message });
    }
  });
});

// ── adminDeleteUser ──────────────────────────────────────────────────────────
exports.adminDeleteUser = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const { decoded } = await verifyAdminRole(req.get('Authorization'));
      const userId = req.body.userId || req.body.targetUid;

      if (!userId) return res.status(400).json({ error: 'userId is required' });
      if (userId === decoded.uid) return res.status(400).json({ error: 'Cannot delete yourself' });

      const targetDoc = await db.collection('users').doc(userId).get();
      if (!targetDoc.exists) return res.status(404).json({ error: 'User not found' });
      if (targetDoc.data()?.role === 'admin') {
        const count = await getAdminCount();
        if (count <= 1) return res.status(400).json({ error: 'Cannot delete the last admin' });
      }

      // Soft delete: mark deleted, disable Auth account
      await db.collection('users').doc(userId).update({
        deleted: true,
        isActive: false,
        blocked: true,
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        deletedBy: decoded.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await admin.auth().updateUser(userId, { disabled: true });
      await logAdminAction(decoded.uid, 'USER_DELETED', { userId, email: targetDoc.data()?.email });

      res.status(200).json({ ok: true, userId });
    } catch (err) {
      logger.error('adminDeleteUser error:', err);
      res.status(err.status || 500).json({ error: err.message });
    }
  });
});

// ── adminResetUserPassword ───────────────────────────────────────────────────
exports.adminResetUserPassword = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const { decoded } = await verifyAdminRole(req.get('Authorization'));
      const userId = req.body.userId || req.body.targetUid;

      if (!userId) return res.status(400).json({ error: 'userId is required' });

      const targetDoc = await db.collection('users').doc(userId).get();
      if (!targetDoc.exists) return res.status(404).json({ error: 'User not found' });

      const email = targetDoc.data()?.email;
      if (!email) return res.status(400).json({ error: 'User has no email address' });

      // Check provider
      const authUser = await admin.auth().getUser(userId);
      const isPasswordProvider = authUser.providerData.some(function(p) { return p.providerId === 'password'; });
      if (!isPasswordProvider) {
        return res.status(200).json({
          ok: false,
          notApplicable: true,
          message: 'This user signs in with Google. Password is managed by Google account.',
        });
      }

      const resetLink = await admin.auth().generatePasswordResetLink(email);
      await sendEmail(email, 'Reset hesla — Evidence Výdajů', EMAIL_HTML(resetLink));
      await logAdminAction(decoded.uid, 'USER_PASSWORD_RESET', { userId, email });

      res.status(200).json({ ok: true, message: 'Password reset email sent to ' + email });
    } catch (err) {
      logger.error('adminResetUserPassword error:', err);
      res.status(err.status || 500).json({ error: err.message });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LEVEL 2 SHADOW PIPELINE - Run shadow mode predictions
// ═══════════════════════════════════════════════════════════════════════════════

exports.runLevel2ShadowPipeline = functions.region(REGION).https.onRequest(async (req, res) => {
  let runId = null;
  const startTime = Date.now();

  try {
    const auth = req.header('authorization')?.replace('Bearer ', '');
    if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const decodedToken = await admin.auth().verifyIdToken(auth);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userRole = userDoc.data()?.role;

    if (!['admin', 'ml_admin'].includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'Forbidden: only ml_admin can run pipeline' });
    }

    // Init pipeline run
    runId = await initPipelineRun(decodedToken.uid);
    logger.info(`[L2_SHADOW] Pipeline started with runId: ${runId}`);

    // Verify shadow mode is enabled
    await updatePipelineStage(runId, 'checking_settings');
    const settingsDoc = await db.collection('appConfig').doc('predictionSettings').get();
    const settings = settingsDoc.data();

    if (!settings?.level2ShadowMode || !settings?.level2Enabled) {
      await logMlDebug({
        runId,
        level: 'error',
        source: 'l2_shadow_pipeline',
        stage: 'checking_settings',
        message: 'L2 Shadow Mode or Level 2 not enabled',
        details: { settings },
      });
      await finalizePipelineRun('failed', Date.now() - startTime);
      return res.status(400).json({ ok: false, error: 'Level 2 Shadow Mode is not enabled' });
    }

    const startTimeTs = admin.firestore.Timestamp.now();
    let usersProcessed = 0;
    let usersSkipped = 0;
    let predictionsCreated = 0;
    let fallbackUsed = 0;
    let trainingDataUsedCount = 0;
    let manualFeedbackUsedCount = 0;
    let autoFeedbackUsedCount = 0;
    let usersWithTrainingData = 0;
    let sumFinalCorrectionFactors = 0;
    // Evaluation metrics
    let sumConfidenceScores = 0;
    let staleProfileCount = 0;
    let missingProfileCount = 0;
    let personalizedPredictionCount = 0;
    let fallbackPredictionCount = 0;
    const errors = [];

    // Get all users
    await updatePipelineStage(runId, 'loading_users');
    const usersRef = db.collection('users');
    const usersSnapshot = await usersRef.get();
    const userIds = usersSnapshot.docs.map(doc => doc.id);

    // Update status with total user count
    await updatePipelineStage(runId, 'loading_users', {
      usersTotal: userIds.length,
      usersProcessed: 0,
      usersSkipped: 0,
      predictionsCreated: 0,
      feedbackRecordsUsed: 0,
      manualFeedbackRecordsUsed: 0,
      autoFeedbackRecordsUsed: 0,
      errorCount: 0,
    });
    logger.info(`[L2_SHADOW] Starting shadow pipeline for ${userIds.length} users`);
    await logMlDebug({ runId, level: 'info', source: 'l2_shadow_pipeline', stage: 'loading_users', message: `Starting pipeline for ${userIds.length} users` });

    // Process each user
    for (const uid of userIds) {
      try {
        // Update progress stage
        await updatePipelineStage(runId, 'processing_user', {
          usersTotal: userIds.length,
          usersProcessed,
          usersSkipped,
          predictionsCreated,
          feedbackRecordsUsed: trainingDataUsedCount,
          manualFeedbackRecordsUsed: manualFeedbackUsedCount,
          autoFeedbackRecordsUsed: autoFeedbackUsedCount,
          errorCount: errors.length,
        });

        // Get user's latest Level 1 prediction
        // Note: no orderBy to avoid composite index requirement — sort client-side instead
        const level1PredQuery = await db.collection('users').doc(uid)
          .collection('mlPredictions')
          .where('pipelineLevel', '==', 1)
          .where('active', '==', true)
          .get();

        let level1Pred = null;
        if (!level1PredQuery.empty) {
          const sorted = level1PredQuery.docs.sort((a, b) => {
            const aMs = a.data().createdAt?.toMillis?.() ?? 0;
            const bMs = b.data().createdAt?.toMillis?.() ?? 0;
            return bMs - aMs;
          });
          level1Pred = sorted[0].data();
        }

        // Get user's recent transactions (last 12 months)
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
        const dateStr = twelveMonthsAgo.toISOString().split('T')[0];

        const vydajeSnap = await db.collection('users').doc(uid)
          .collection('vydaje')
          .where('datum', '>=', dateStr)
          .get();

        const prijmySnap = await db.collection('users').doc(uid)
          .collection('prijmy')
          .where('datum', '>=', dateStr)
          .get();

        const transactions = [
          ...vydajeSnap.docs.map(doc => ({ ...doc.data(), type: 'vydaj' })),
          ...prijmySnap.docs.map(doc => ({ ...doc.data(), type: 'prijem' })),
        ];

        // Load approved L2 training feedback (manual + auto) for this user (excluding marked records)
        const manualTrainingQuery = await db.collection('trainingData')
          .where('userId', '==', uid)
          .where('type', '==', 'l2_manual_feedback')
          .where('status', '==', 'approved')
          .get();

        const autoTrainingQuery = await db.collection('trainingData')
          .where('userId', '==', uid)
          .where('type', '==', 'l2_auto_feedback')
          .where('status', '==', 'approved')
          .get();

        // Helper: validate learning record has required schema
        const isValidLearningRecord = (record) => {
          // Must not be excluded
          if (record.excludedFromLearning === true) return false;
          // Must have core fields for calculation
          if (!record.predictedTotal || typeof record.predictedTotal !== 'number') return false;
          if (record.actualTotal === undefined || typeof record.actualTotal !== 'number') return false;
          // predictedTotal must be positive for ratio calculation
          if (record.predictedTotal <= 0) return false;
          return true;
        };

        const manualRecords = manualTrainingQuery.docs
          .map(doc => doc.data())
          .filter(isValidLearningRecord);
        const autoRecords = autoTrainingQuery.docs
          .map(doc => doc.data())
          .filter(isValidLearningRecord);

        // Calculate weighted correction factors
        // manual feedback: weight = 2, auto feedback: weight = 1
        let manualCorrectionFactor = 1.0;
        let autoCorrectionFactor = 1.0;
        let finalCorrectionFactor = 1.0;
        let trainingDataUsed = false;

        if (manualRecords.length > 0) {
          // All records already validated by isValidLearningRecord filter
          const manualRatios = manualRecords.map(td => td.actualTotal / td.predictedTotal);

          if (manualRatios.length > 0) {
            manualCorrectionFactor = manualRatios.reduce((a, b) => a + b, 0) / manualRatios.length;
            manualCorrectionFactor = Math.max(0.7, Math.min(1.3, manualCorrectionFactor));
            trainingDataUsed = true;
          }
        }

        if (autoRecords.length > 0) {
          // All records already validated by isValidLearningRecord filter
          const autoRatios = autoRecords.map(td => td.actualTotal / td.predictedTotal);

          if (autoRatios.length > 0) {
            autoCorrectionFactor = autoRatios.reduce((a, b) => a + b, 0) / autoRatios.length;
            autoCorrectionFactor = Math.max(0.7, Math.min(1.3, autoCorrectionFactor));
            trainingDataUsed = true;
          }
        }

        // Weighted average: manual weight = 2, auto weight = 1
        if (trainingDataUsed) {
          const totalWeight = (manualRecords.length > 0 ? 2 : 0) + (autoRecords.length > 0 ? 1 : 0);
          finalCorrectionFactor =
            ((manualRecords.length > 0 ? manualCorrectionFactor * 2 : 0) +
             (autoRecords.length > 0 ? autoCorrectionFactor * 1 : 0)) / totalWeight;
          finalCorrectionFactor = Math.max(0.7, Math.min(1.3, finalCorrectionFactor));
        }

        // ⚠️ IMPORTANT: SIMPLIFIED SHADOW BASELINE - NOT ACTUAL ML MODEL
        // This implementation:
        // - Uses Level 1 prediction + small variation (95-105%) + weighted correction from feedback
        // - Does NOT use Python ml-pipeline/ (no true ML training)
        // - DOES use manual L2 training feedback (type: "l2_manual_feedback") if available
        // - DOES use auto L2 training feedback (type: "l2_auto_feedback") if available
        // - Manual feedback has higher weight (2) than auto feedback (1)
        // - Does use last 12 months of vydaje + prijmy
        // For real L2 ML model, would need:
        //   - Call ml-pipeline/src/main.py with RandomForest training
        //   - Integrate trainingData collections for labeled examples
        //   - Implement actual feature engineering and model evaluation

        // Load AI profile for personalized adjustments
        let aiProfile = null;
        let aiProfileStatus = 'missing';  // missing | fresh | stale
        let aiProfileStale = false;
        let aiProfileGeneratedAt = null;
        let aiProfileLastTransactionAt = null;
        let aiProfileLastFeedbackAt = null;
        let personalizedAdjustmentFactor = 1.0;
        let personalizedConfidenceAdjustment = 0;
        let appliedProfileAdjustments = [];
        let profileExplanation = '';
        let predictionWarnings = [];
        let confidenceBreakdown = [];
        let volatilityConfidenceImpact = 0;
        let incomeRegularityConfidenceImpact = 0;
        let staleProfileConfidenceImpact = 0;

        try {
          const profileDoc = await db.collection('users').doc(uid).collection('aiProfile').doc('summary').get();
          if (profileDoc.exists) {
            aiProfile = profileDoc.data();
            aiProfileGeneratedAt = aiProfile.generatedAt ?? null;
            aiProfileLastTransactionAt = aiProfile.lastTransactionAt ?? null;
            aiProfileLastFeedbackAt = aiProfile.lastFeedbackAt ?? null;

            // Check freshness
            const generatedAt = aiProfile.generatedAt?.toDate ? aiProfile.generatedAt.toDate() : aiProfile.generatedAt;
            const staleness = await checkAiProfileStaleness(uid, generatedAt);
            aiProfileStale = staleness.profileStale;
            aiProfileStatus = staleness.profileStale ? 'stale' : 'fresh';

            // If newly detected as stale, mark it and persist staleSince
            if (staleness.profileStale && !aiProfile.profileStale) {
              // Transition from fresh to stale: mark staleSince
              await db.collection('users').doc(uid).collection('aiProfile').doc('summary').update({
                profileStale: true,
                staleSince: admin.firestore.FieldValue.serverTimestamp(),
              }).catch(() => {});  // Non-critical
            } else if (!staleness.profileStale && aiProfile.profileStale) {
              // Transition from stale to fresh (via auto-regen or manual): clear staleSince
              await db.collection('users').doc(uid).collection('aiProfile').doc('summary').update({
                profileStale: false,
                staleSince: null,
              }).catch(() => {});  // Non-critical
            }

            // If stale, reduce confidence slightly
            if (staleness.profileStale) {
              personalizedConfidenceAdjustment -= 5;
              staleProfileConfidenceImpact = -5;
              predictionWarnings.push('ai_profile_stale');
            }

            // Apply personalized adjustments based on profile
            // 1. Expense volatility → adjust confidence
            if (aiProfile.expenseVolatility > 0.5) {
              personalizedConfidenceAdjustment -= 10;
              volatilityConfidenceImpact = -10;
              appliedProfileAdjustments.push('reduced_confidence_high_volatility');
            } else if (aiProfile.expenseVolatility < 0.2) {
              personalizedConfidenceAdjustment += 5;
              volatilityConfidenceImpact = 5;
              appliedProfileAdjustments.push('boosted_confidence_low_volatility');
            }

            // 2. Trend → adjust variation
            if (Math.abs(aiProfile.features?.monthOverMonthExpenseTrend || 0) > 0.15) {
              personalizedAdjustmentFactor += (aiProfile.features?.monthOverMonthExpenseTrend || 0) * 0.5;
              appliedProfileAdjustments.push('adjusted_for_spending_trend');
            }

            // 3. Income regularity → adjust confidence
            if (aiProfile.incomeRegularity > 0.8) {
              personalizedConfidenceAdjustment += 5;
              incomeRegularityConfidenceImpact = 5;
              appliedProfileAdjustments.push('boosted_confidence_stable_income');
            }

            // 4. Feedback adjusted bias → direct adjustment
            if (Math.abs(aiProfile.feedbackAdjustedBias) > 0.05) {
              personalizedAdjustmentFactor *= (1 + aiProfile.feedbackAdjustedBias);
              appliedProfileAdjustments.push('applied_feedback_bias');
            }

            // Build explanation
            const parts = [];
            if (aiProfile.expenseVolatility > 0.5) parts.push('high expense variability');
            else if (aiProfile.expenseVolatility < 0.2) parts.push('predictable spending');
            if (aiProfile.incomeRegularity > 0.8) parts.push('stable income');
            if (Math.abs(aiProfile.features?.monthOverMonthExpenseTrend || 0) > 0.15) {
              const trend = (aiProfile.features?.monthOverMonthExpenseTrend || 0) > 0 ? 'increasing' : 'decreasing';
              parts.push(`${trend} spending trend`);
            }
            if (aiProfile.feedbackAdjustedBias !== 0) parts.push('feedback-adjusted');
            profileExplanation = parts.length > 0 ? `User profile: ${parts.join(', ')}` : '';

            // Build confidence breakdown
            confidenceBreakdown.push('Base confidence: 70%');
            if (volatilityConfidenceImpact !== 0) {
              confidenceBreakdown.push(`Expense volatility impact: ${volatilityConfidenceImpact > 0 ? '+' : ''}${volatilityConfidenceImpact}%`);
            }
            if (incomeRegularityConfidenceImpact !== 0) {
              confidenceBreakdown.push(`Income regularity impact: ${incomeRegularityConfidenceImpact > 0 ? '+' : ''}${incomeRegularityConfidenceImpact}%`);
            }
            if (staleProfileConfidenceImpact !== 0) {
              confidenceBreakdown.push(`Stale AI profile impact: ${staleProfileConfidenceImpact > 0 ? '+' : ''}${staleProfileConfidenceImpact}%`);
            }
          }
        } catch (err) {
          logger.warn(`[L2_SHADOW] Failed to load AI profile for ${uid}:`, err.message);
          confidenceBreakdown.push('Base confidence: 70%');
        }

        let shadowPrediction = null;

        if (transactions.length >= 10 && level1Pred) {
          // SIMPLIFIED: Create shadow prediction close to Level 1 (with small variation for testing)
          const basePredictionAmount = level1Pred.totalPredictedExpense || 0;
          let variation = 0.95 + Math.random() * 0.1; // 95-105% of Level 1

          // Apply weighted correction factor if available
          const trainingDataCorrectionFactor = trainingDataUsed ? finalCorrectionFactor : 1.0;
          if (trainingDataUsed) {
            variation *= finalCorrectionFactor;
          }

          // Apply personalized AI profile adjustment
          const aiProfileAdjustmentFactor = aiProfile ? personalizedAdjustmentFactor : 1.0;
          if (aiProfile) {
            variation *= personalizedAdjustmentFactor;
            // Clamp to reasonable range [0.8, 1.2] to avoid extreme predictions
            variation = Math.max(0.8, Math.min(1.2, variation));
          }

          const finalPredictedAmount = Math.round(basePredictionAmount * variation);

          // Build explanation breakdown
          const explanationBreakdown = [
            `L1 baseline: ${basePredictionAmount.toLocaleString()} Kč`,
          ];
          if (trainingDataUsed) {
            explanationBreakdown.push(`Feedback correction: ${(trainingDataCorrectionFactor).toFixed(2)}x (${manualRecords.length} manual + ${autoRecords.length} auto)`);
          }
          if (aiProfile) {
            explanationBreakdown.push(`AI Profile adjustment: ${(aiProfileAdjustmentFactor).toFixed(2)}x (${appliedProfileAdjustments.join(', ') || 'base profile applied'})`);
            if (aiProfileStale) {
              explanationBreakdown.push('⚠️ AI profile was stale at prediction time.');
            }

            // Category-level insights
            if (aiProfile.topStableCategories?.length > 0) {
              explanationBreakdown.push(`Stable categories: ${aiProfile.topStableCategories.join(', ')} (low volatility, predictable)`);
            }
            if (aiProfile.topVolatileCategories?.length > 0) {
              explanationBreakdown.push(`Volatile categories: ${aiProfile.topVolatileCategories.join(', ')} (high variability, affects confidence)`);
            }
          } else {
            explanationBreakdown.push('No AI profile was available, so no personalized profile adjustment was applied.');
          }
          explanationBreakdown.push(`Final prediction: ${finalPredictedAmount.toLocaleString()} Kč (${((variation - 1) * 100).toFixed(1)}% change)`);

          // Calculate final confidence score (base 70 + adjustments)
          const baseConfidenceScore = 70;
          const finalConfidenceScore = Math.max(30, Math.min(100, baseConfidenceScore + personalizedConfidenceAdjustment));
          confidenceBreakdown.push(`Final confidence: ${finalConfidenceScore}%`);

          shadowPrediction = {
            // Core prediction data
            month: new Date().toISOString().split('T')[0].substring(0, 7),
            totalPredictedExpense: finalPredictedAmount,
            categories: level1Pred.categories || {},
            confidence: finalConfidenceScore > 75 ? 'high' : finalConfidenceScore > 55 ? 'medium' : 'low',
            confidenceScore: finalConfidenceScore,
            // Pipeline level & mode
            pipelineLevel: 2,
            shadowMode: true,
            active: false,
            // Model metadata - EXPLICITLY SIMPLIFIED + AUTO-CALIBRATED + MANUAL-CALIBRATED
            modelType: 'shadow-baseline',
            modelVersion: 'l2-shadow-baseline-v1',
            isRealMlModel: false,
            dataSourcesUsed: trainingDataUsed
              ? ['users/{uid}/vydaje', 'users/{uid}/prijmy', 'level1Prediction', 'trainingData']
              : ['users/{uid}/vydaje', 'users/{uid}/prijmy', 'level1Prediction'],
            trainingDataUsed: trainingDataUsed,
            trainingDataCount: manualRecords.length + autoRecords.length,
            manualFeedbackCount: manualRecords.length,
            autoFeedbackCount: autoRecords.length,
            manualCorrectionFactor: manualRecords.length > 0 ? Math.round(manualCorrectionFactor * 100) / 100 : 1.0,
            autoCorrectionFactor: autoRecords.length > 0 ? Math.round(autoCorrectionFactor * 100) / 100 : 1.0,
            finalCorrectionFactor: trainingDataUsed ? Math.round(finalCorrectionFactor * 100) / 100 : 1.0,
            incomeDataUsed: true,
            // AI Profile personalization (rule-based, NOT full ML)
            aiProfileUsed: aiProfile ? true : false,
            aiProfileVersion: aiProfile?.profileVersion ?? null,
            aiProfileStatus: aiProfileStatus,  // 'fresh' | 'stale' | 'missing'
            aiProfileStale: aiProfileStale,
            aiProfileGeneratedAt: aiProfileGeneratedAt ?? null,
            aiProfileLastTransactionAt: aiProfileLastTransactionAt ?? null,
            aiProfileLastFeedbackAt: aiProfileLastFeedbackAt ?? null,
            personalizedAdjustmentFactor: Math.round(personalizedAdjustmentFactor * 100) / 100,
            personalizedConfidenceAdjustment: personalizedConfidenceAdjustment ?? 0,
            appliedProfileAdjustments: appliedProfileAdjustments ?? [],
            personalizedExplanation: profileExplanation ?? '',
            // Warnings (stale profile, etc.)
            predictionWarnings: predictionWarnings ?? [],
            // Confidence breakdown
            confidenceBreakdown: confidenceBreakdown ?? [],
            // Explainability: breakdown of how we arrived at this prediction
            basePredictionAmount: basePredictionAmount,
            trainingDataCorrectionFactor: Math.round(trainingDataCorrectionFactor * 100) / 100,
            aiProfileAdjustmentFactor: Math.round(aiProfileAdjustmentFactor * 100) / 100,
            finalPredictedAmount: finalPredictedAmount,
            explanationBreakdown: explanationBreakdown ?? [],
            // Category-level personalization signals
            categoryAdjustmentSignals: aiProfile ? {
              volatility: aiProfile.expenseCategoryVolatility || {},
              trend: aiProfile.expenseCategoryTrend || {},
              stableCategories: aiProfile.topStableCategories || [],
              volatileCategories: aiProfile.topVolatileCategories || [],
            } : null,
            topCategoriesAffectingPrediction: aiProfile?.topVolatileCategories ?? [],
            // Metrics
            fallbackUsed: false,
            metrics: {
              mae: 0,
              mape: 0,
              training_rows: transactions.length,
              test_rows: 0,
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          };
        } else {
          // Fallback: use Level 1 as-is when insufficient data
          const basePredictionAmount = level1Pred?.totalPredictedExpense || 0;
          const finalPredictedAmount = basePredictionAmount;
          const fallbackReason = transactions.length < 10 ? 'insufficient_data' : 'no_level1_prediction';

          shadowPrediction = {
            // Core prediction data
            month: new Date().toISOString().split('T')[0].substring(0, 7),
            totalPredictedExpense: finalPredictedAmount,
            categories: level1Pred?.categories || {},
            confidence: 'low',
            confidenceScore: 50,
            // Pipeline level & mode
            pipelineLevel: 2,
            shadowMode: true,
            active: false,
            // Model metadata - EXPLICITLY SIMPLIFIED + FALLBACK
            modelType: 'shadow-baseline-fallback',
            modelVersion: 'l2-shadow-baseline-fallback-v1',
            isRealMlModel: false,
            dataSourcesUsed: ['level1Prediction'],
            trainingDataUsed: false,
            trainingDataCount: 0,
            incomeDataUsed: false,
            // AI Profile personalization (rule-based, NOT full ML)
            aiProfileUsed: false,
            aiProfileVersion: null,
            aiProfileStatus: aiProfileStatus,
            aiProfileStale: aiProfileStale,
            aiProfileGeneratedAt: aiProfileGeneratedAt ?? null,
            aiProfileLastTransactionAt: aiProfileLastTransactionAt ?? null,
            aiProfileLastFeedbackAt: aiProfileLastFeedbackAt ?? null,
            personalizedAdjustmentFactor: 1.0,
            personalizedConfidenceAdjustment: 0,
            appliedProfileAdjustments: [],
            personalizedExplanation: 'Fallback: insufficient data for personalization',
            predictionWarnings: predictionWarnings ?? [],
            confidenceBreakdown: [
              'Base confidence: 70%',
              'Fallback mode penalty: -20% (insufficient data)',
              'Final confidence: 50%',
            ],
            // Explainability: breakdown of how we arrived at this prediction
            basePredictionAmount: basePredictionAmount,
            trainingDataCorrectionFactor: 1.0,
            aiProfileAdjustmentFactor: 1.0,
            finalPredictedAmount: finalPredictedAmount,
            explanationBreakdown: [
              `Fallback mode (${fallbackReason})`,
              `L1 baseline: ${basePredictionAmount.toLocaleString()} Kč`,
              `No adjustments available - insufficient historical data`,
              `Final prediction: ${finalPredictedAmount.toLocaleString()} Kč (no change)`,
            ],
            // Metrics
            fallbackUsed: true,
            fallbackReason: fallbackReason,
            metrics: {
              mae: 0,
              mape: 0,
              training_rows: transactions.length,
              test_rows: 0,
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          fallbackUsed++;
        }

        // Save shadow prediction
        await db.collection('users').doc(uid)
          .collection('mlPredictions')
          .add(shadowPrediction);

        // Track training data usage
        if (trainingDataUsed) {
          trainingDataUsedCount += manualRecords.length + autoRecords.length;
          manualFeedbackUsedCount += manualRecords.length;
          autoFeedbackUsedCount += autoRecords.length;
          usersWithTrainingData++;
          sumFinalCorrectionFactors += finalCorrectionFactor;
        }

        // Track evaluation metrics
        sumConfidenceScores += (shadowPrediction.confidenceScore || 0);
        if (shadowPrediction.aiProfileStale) staleProfileCount++;
        if (shadowPrediction.aiProfileStatus === 'missing') missingProfileCount++;
        if (shadowPrediction.aiProfileUsed && !shadowPrediction.fallbackUsed) personalizedPredictionCount++;
        if (shadowPrediction.fallbackUsed) fallbackPredictionCount++;

        predictionsCreated++;
        usersProcessed++;

      } catch (userError) {
        logger.error(`[L2_SHADOW] Error processing user ${uid}:`, userError);
        const errPreview = { userId: uid, stage: 'processing_user', message: userError.message };
        errors.push(errPreview);
        usersSkipped++;
        // Log per-user error without stopping pipeline
        await logMlDebug({
          runId,
          level: 'error',
          source: 'l2_shadow_pipeline',
          stage: 'processing_user',
          message: `Error processing user: ${userError.message}`,
          userId: uid,
          details: { errorType: userError.name },
        });
      }
    }

    // Finalize
    const finishTime = admin.firestore.Timestamp.now();
    const durationMs = Date.now() - startTime;

    // Determine final status
    let finalStatus;
    if (errors.length === 0) {
      finalStatus = 'success';
    } else if (predictionsCreated > 0) {
      finalStatus = 'partial_success';
    } else {
      finalStatus = 'failed';
    }

    // Update pipeline status document
    await finalizePipelineRun(finalStatus, durationMs, {
      stage: finalStatus === 'failed' ? 'failed' : 'completed',
      progress: {
        usersTotal: userIds.length,
        usersProcessed,
        usersSkipped,
        predictionsCreated,
        feedbackRecordsUsed: trainingDataUsedCount,
        manualFeedbackRecordsUsed: manualFeedbackUsedCount,
        autoFeedbackRecordsUsed: autoFeedbackUsedCount,
        errorCount: errors.length,
      },
    });

    await logMlDebug({
      runId,
      level: errors.length > 0 ? 'warning' : 'info',
      source: 'l2_shadow_pipeline',
      stage: 'completed',
      message: `Pipeline finished: ${finalStatus}. Users: ${usersProcessed}, Predictions: ${predictionsCreated}, Errors: ${errors.length}`,
      details: { durationMs, finalStatus },
    });

    // Save ML run record
    const runRecord = {
      status: finalStatus,
      pipelineLevel: 2,
      mode: 'shadow',
      // ⚠️ EXPLICIT METADATA: SIMPLIFIED SHADOW BASELINE - NOT ACTUAL ML MODEL
      modelType: 'shadow-baseline',
      modelVersion: 'l2-shadow-baseline-v1',
      isRealMlModel: false,
      implementation: 'simplified-baseline-with-manual-calibration',
      dataSourcesUsed: ['users/{uid}/vydaje', 'users/{uid}/prijmy', 'level1Prediction', 'trainingData'],
      trainingDataUsed: usersWithTrainingData > 0,
      incomeDataUsed: true,
      // Training data stats (manual + auto with weights: manual=2, auto=1)
      trainingDataRecordsUsed: trainingDataUsedCount,
      manualFeedbackRecordsUsed: manualFeedbackUsedCount,
      autoFeedbackRecordsUsed: autoFeedbackUsedCount,
      usersWithTrainingData: usersWithTrainingData,
      averageFinalCorrectionFactor: usersWithTrainingData > 0
        ? Math.round((sumFinalCorrectionFactors / usersWithTrainingData) * 100) / 100
        : 1.0,
      // Evaluation metrics for monitoring
      averageConfidence: predictionsCreated > 0
        ? Math.round((sumConfidenceScores / predictionsCreated) * 100) / 100
        : 0,
      staleProfileCount: staleProfileCount,
      missingProfileCount: missingProfileCount,
      personalizedPredictionCount: personalizedPredictionCount,
      fallbackPredictionCount: fallbackPredictionCount,
      notes: 'Simplified shadow baseline for validating L2 shadow flow. Uses Level 1 predictions + small variation. Applies weighted calibration from manual (weight=2) and auto (weight=1) L2 training feedback if available. NOT Python ML pipeline. NOT actual RandomForest model. For production ML: integrate ml-pipeline/ and trainingData collections.',
      // Timestamps & stats
      startedAt: admin.firestore.Timestamp.fromMillis(startTime),
      finishedAt: finishTime,
      durationMs: durationMs,
      usersTotal: userIds.length,
      usersProcessed: usersProcessed,
      usersSkipped,
      predictionsCreated: predictionsCreated,
      fallbackUsed: fallbackUsed > 0,
      fallbackCount: fallbackUsed,
      errorCount: errors.length,
      errorsPreview: errors.slice(0, 10),
      triggeredBy: decodedToken.uid,
      triggeredAt: new Date().toISOString(),
      runId,
    };

    await db.collection('mlRuns').add(runRecord);

    logger.info(`[L2_SHADOW] Pipeline completed: ${predictionsCreated}/${usersProcessed} predictions (simplified baseline)`);

    res.status(200).json({
      ok: true,
      message: 'Shadow pipeline completed',
      note: 'SIMPLIFIED BASELINE - Not actual ML model. Uses Level 1 variation for testing.',
      summary: {
        usersProcessed,
        predictionsCreated,
        fallbackUsed,
        errorCount: errors.length,
        durationMs,
        // Explicit metadata about what was used
        modelType: 'shadow-baseline',
        isRealMlModel: false,
        usedDataSources: {
          vydaje: true,
          prijmy: true,
          trainingData: false,
          mlTrainingData: false,
          level1Prediction: true,
          pythonPipeline: false,
        },
        months: 12,
        documentation: 'For real L2 ML: integrate ml-pipeline/ with trainingData/RandomForest training',
      },
    });

  } catch (err) {
    logger.error('runLevel2ShadowPipeline error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// L2 TRAINING FEEDBACK - Create manual feedback for L2 shadow predictions
// ═══════════════════════════════════════════════════════════════════════════════

exports.adminCreateL2TrainingFeedback = functions.region(REGION).https.onRequest(async (req, res) => {
  try {
    const auth = req.header('authorization')?.replace('Bearer ', '');
    if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const decodedToken = await admin.auth().verifyIdToken(auth);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userRole = userDoc.data()?.role;

    if (!['admin', 'ml_admin'].includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'Forbidden: only admin/ml_admin can create L2 training feedback' });
    }

    // Extract and validate input
    const { userId, predictionId, month, predictedTotal, actualTotal, correctedCategories, note } = req.body;

    // Validate required fields for learning record schema
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      return res.status(400).json({ ok: false, error: 'Invalid userId: must be non-empty string' });
    }
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ ok: false, error: 'Invalid month: must be YYYY-MM format' });
    }
    if (predictedTotal === undefined || predictedTotal === null || typeof Number(predictedTotal) !== 'number') {
      return res.status(400).json({ ok: false, error: 'Invalid predictedTotal: must be a number' });
    }
    if (actualTotal === undefined || actualTotal === null || typeof Number(actualTotal) !== 'number') {
      return res.status(400).json({ ok: false, error: 'Invalid actualTotal: must be a number' });
    }

    // Validate numeric constraints for learning
    const ptNum = Number(predictedTotal);
    const atNum = Number(actualTotal);
    if (ptNum < 0 || atNum < 0) {
      return res.status(400).json({ ok: false, error: 'predictedTotal and actualTotal must be >= 0' });
    }

    const errorAmount = atNum - ptNum;
    const errorPercent = ptNum !== 0 ? ((atNum - ptNum) / ptNum) * 100 : 0;

    // Create training data record with validated learning schema
    const trainingRecord = {
      // L2 feedback specific
      type: 'l2_manual_feedback',
      userId,
      predictionId: predictionId || null,
      month,
      // Learning-critical fields (validated)
      predictedTotal: Math.round(ptNum),
      actualTotal: Math.round(atNum),
      errorAmount: Math.round(errorAmount),
      errorPercent: Math.round(errorPercent * 10) / 10,
      correctedCategories: correctedCategories || {},
      note: note || '',
      // Metadata & Approval
      source: 'manual_admin_feedback',
      approved: true, // For consistency with training data records
      status: 'approved', // Auto-approved by admin
      createdBy: decodedToken.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      usedForTraining: false,
    };

    // Save to trainingData collection
    const docRef = await db.collection('trainingData').add(trainingRecord);

    // Log audit trail
    await logAdminAction(decodedToken.uid, 'L2_TRAINING_FEEDBACK_CREATED', {
      trainingDataId: docRef.id,
      userId,
      month,
      errorPercent,
    });

    logger.info(`[L2_FEEDBACK] Created training feedback ${docRef.id} for user ${userId}`);

    res.status(201).json({
      ok: true,
      id: docRef.id,
      message: 'L2 training feedback created successfully',
      data: { errorAmount, errorPercent },
    });

  } catch (err) {
    logger.error('adminCreateL2TrainingFeedback error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete a single mlPrediction record (admin only)
exports.adminDeleteMlPrediction = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const auth = req.header('authorization')?.replace('Bearer ', '');
      if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });

      const decodedToken = await admin.auth().verifyIdToken(auth);
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const userRole = userDoc.data()?.role;

      if (!['admin', 'ml_admin'].includes(userRole)) {
        return res.status(403).json({ ok: false, error: 'Forbidden: only admin/ml_admin can delete records' });
      }

      const { userId, predictionId } = req.body;
      if (!userId || !predictionId) {
        return res.status(400).json({ ok: false, error: 'userId and predictionId required' });
      }

      // Get the prediction before deleting
      const predDoc = await db.collection('users').doc(userId).collection('mlPredictions').doc(predictionId).get();
      if (!predDoc.exists) {
        return res.status(404).json({ ok: false, error: 'Prediction not found' });
      }

      const predData = predDoc.data();

      // Delete the prediction
      await db.collection('users').doc(userId).collection('mlPredictions').doc(predictionId).delete();

      logger.info(`[DELETE_PREDICTION] Deleted L${predData?.pipelineLevel} prediction ${predictionId} for user ${userId}`);

      res.status(200).json({
        ok: true,
        predictionId,
        userId,
        month: predData?.month,
        pipelineLevel: predData?.pipelineLevel,
        message: `Prediction deleted`
      });
    } catch (err) {
      logger.error('adminDeleteMlPrediction error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });
});

// Delete a single trainingData feedback record (admin only)
exports.adminDeleteTrainingDataRecord = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const auth = req.header('authorization')?.replace('Bearer ', '');
      if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });

      const decodedToken = await admin.auth().verifyIdToken(auth);
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const userRole = userDoc.data()?.role;

      if (!['admin', 'ml_admin'].includes(userRole)) {
        return res.status(403).json({ ok: false, error: 'Forbidden: only admin/ml_admin can delete records' });
      }

      const recordId = req.body?.recordId;
      if (!recordId) return res.status(400).json({ ok: false, error: 'recordId required' });

      // Get the record before deleting (for response info)
      const recordDoc = await db.collection('trainingData').doc(recordId).get();
      if (!recordDoc.exists) {
        return res.status(404).json({ ok: false, error: 'Record not found' });
      }

      const recordData = recordDoc.data();

      // Only allow deletion of feedback records
      if (!['l2_manual_feedback', 'l2_auto_feedback'].includes(recordData?.type)) {
        return res.status(400).json({ ok: false, error: 'Can only delete l2_manual_feedback or l2_auto_feedback records' });
      }

      // Delete the record
      await db.collection('trainingData').doc(recordId).delete();

      logger.info(`[DELETE_FEEDBACK] Deleted ${recordData?.type} record ${recordId} for user ${recordData?.userId}`);

      res.status(200).json({
        ok: true,
        recordId,
        type: recordData?.type,
        userId: recordData?.userId,
        month: recordData?.month,
        message: `Feedback record deleted`
      });
    } catch (err) {
      logger.error('adminDeleteTrainingDataRecord error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });
});

// Exclude a training record from learning without deleting it (admin only)
exports.adminExcludeTrainingRecordFromLearning = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const auth = req.header('authorization')?.replace('Bearer ', '');
      if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });

      const decodedToken = await admin.auth().verifyIdToken(auth);
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const userRole = userDoc.data()?.role;

      if (!['admin', 'ml_admin'].includes(userRole)) {
        return res.status(403).json({ ok: false, error: 'Forbidden: only admin/ml_admin can exclude records' });
      }

      const { recordId, reason } = req.body;
      if (!recordId) return res.status(400).json({ ok: false, error: 'recordId required' });

      const recordDoc = await db.collection('trainingData').doc(recordId).get();
      if (!recordDoc.exists) {
        return res.status(404).json({ ok: false, error: 'Record not found' });
      }

      const recordData = recordDoc.data();

      await db.collection('trainingData').doc(recordId).update({
        excludedFromLearning: true,
        excludedAt: admin.firestore.FieldValue.serverTimestamp(),
        excludedBy: decodedToken.uid,
        exclusionReason: reason || null,
      });

      logger.info(`[EXCLUDE_TRAINING] Excluded ${recordData?.type} record ${recordId} for user ${recordData?.userId} (reason: ${reason || 'none'})`);

      res.status(200).json({
        ok: true,
        recordId,
        type: recordData?.type,
        userId: recordData?.userId,
        month: recordData?.month,
        message: 'Record excluded from learning'
      });
    } catch (err) {
      logger.error('adminExcludeTrainingRecordFromLearning error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });
});

// Restore a training record to learning (admin only)
exports.adminRestoreTrainingRecordToLearning = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const auth = req.header('authorization')?.replace('Bearer ', '');
      if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });

      const decodedToken = await admin.auth().verifyIdToken(auth);
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const userRole = userDoc.data()?.role;

      if (!['admin', 'ml_admin'].includes(userRole)) {
        return res.status(403).json({ ok: false, error: 'Forbidden: only admin/ml_admin can restore records' });
      }

      const { recordId } = req.body;
      if (!recordId) return res.status(400).json({ ok: false, error: 'recordId required' });

      const recordDoc = await db.collection('trainingData').doc(recordId).get();
      if (!recordDoc.exists) {
        return res.status(404).json({ ok: false, error: 'Record not found' });
      }

      const recordData = recordDoc.data();

      await db.collection('trainingData').doc(recordId).update({
        excludedFromLearning: false,
        excludedAt: admin.firestore.FieldValue.delete(),
        excludedBy: admin.firestore.FieldValue.delete(),
        exclusionReason: admin.firestore.FieldValue.delete(),
      });

      logger.info(`[RESTORE_TRAINING] Restored ${recordData?.type} record ${recordId} for user ${recordData?.userId} to learning`);

      res.status(200).json({
        ok: true,
        recordId,
        type: recordData?.type,
        userId: recordData?.userId,
        month: recordData?.month,
        message: 'Record restored to learning'
      });
    } catch (err) {
      logger.error('adminRestoreTrainingRecordToLearning error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });
});

// Exclude an ML prediction from learning without deleting it (admin only)
exports.adminExcludeMlPredictionFromLearning = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const auth = req.header('authorization')?.replace('Bearer ', '');
      if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });

      const decodedToken = await admin.auth().verifyIdToken(auth);
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const userRole = userDoc.data()?.role;

      if (!['admin', 'ml_admin'].includes(userRole)) {
        return res.status(403).json({ ok: false, error: 'Forbidden: only admin/ml_admin can exclude records' });
      }

      const { userId, predictionId, reason } = req.body;
      if (!userId || !predictionId) {
        return res.status(400).json({ ok: false, error: 'userId and predictionId required' });
      }

      const predDoc = await db.collection('users').doc(userId).collection('mlPredictions').doc(predictionId).get();
      if (!predDoc.exists) {
        return res.status(404).json({ ok: false, error: 'Prediction not found' });
      }

      const predData = predDoc.data();

      await db.collection('users').doc(userId).collection('mlPredictions').doc(predictionId).update({
        excludedFromLearning: true,
        excludedAt: admin.firestore.FieldValue.serverTimestamp(),
        excludedBy: decodedToken.uid,
        exclusionReason: reason || null,
      });

      logger.info(`[EXCLUDE_PREDICTION] Excluded L${predData?.pipelineLevel} prediction ${predictionId} for user ${userId} (reason: ${reason || 'none'})`);

      res.status(200).json({
        ok: true,
        predictionId,
        userId,
        month: predData?.month,
        pipelineLevel: predData?.pipelineLevel,
        message: 'Prediction excluded from learning'
      });
    } catch (err) {
      logger.error('adminExcludeMlPredictionFromLearning error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO LEARNING - Generate auto feedback from actual monthly expenses
// ═══════════════════════════════════════════════════════════════════════════════

exports.adminGenerateL2AutoFeedback = functions.region(REGION).https.onRequest(async (req, res) => {
  try {
    const auth = req.header('authorization')?.replace('Bearer ', '');
    if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const decodedToken = await admin.auth().verifyIdToken(auth);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userRole = userDoc.data()?.role;

    if (!['admin', 'ml_admin'].includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'Forbidden: only admin/ml_admin can generate auto feedback' });
    }

    // Extract month from request (YYYY-MM format)
    const { month } = req.body;
    if (!month || !month.match(/^\d{4}-\d{2}$/)) {
      return res.status(400).json({ ok: false, error: 'Missing or invalid month (use YYYY-MM format)' });
    }

    logger.info(`[L2_AUTO_FEEDBACK] Generating auto feedback for month ${month}`);

    let feedbackCreated = 0;
    let feedbackSkipped = 0;
    const errors = [];

    // Get all L2 shadow predictions for this month
    const l2PredictionsSnap = await db.collectionGroup('mlPredictions')
      .where('pipelineLevel', '==', 2)
      .where('shadowMode', '==', true)
      .where('month', '==', month)
      .get();

    logger.info(`[L2_AUTO_FEEDBACK] Found ${l2PredictionsSnap.size} L2 shadow predictions for ${month}`);

    // Process each L2 prediction
    for (const predDoc of l2PredictionsSnap.docs) {
      try {
        const prediction = predDoc.data();
        const userId = predDoc.ref.parent.parent.id; // users/{uid}/mlPredictions
        const predictionId = predDoc.id;

        // Check if auto feedback already exists for this prediction
        const existingAutoFeedback = await db.collection('trainingData')
          .where('predictionId', '==', predictionId)
          .where('type', '==', 'l2_auto_feedback')
          .limit(1)
          .get();

        if (!existingAutoFeedback.empty) {
          logger.info(`[L2_AUTO_FEEDBACK] Auto feedback already exists for prediction ${predictionId}, skipping`);
          feedbackSkipped++;
          continue;
        }

        // Get actual expenses for this user in this month
        const [year, monthStr] = month.split('-');
        const monthStart = `${year}-${monthStr}-01`;
        const monthEnd = new Date(Number(year), Number(monthStr), 0).toISOString().split('T')[0];

        const actualExpensesSnap = await db.collection('users').doc(userId)
          .collection('vydaje')
          .where('datum', '>=', monthStart)
          .where('datum', '<=', monthEnd)
          .get();

        const actualTotal = actualExpensesSnap.docs.reduce((sum, doc) => {
          return sum + (Number(doc.data().castka) || 0);
        }, 0);

        // Calculate error
        const predictedTotal = prediction.totalPredictedExpense || 0;
        const errorAmount = actualTotal - predictedTotal;
        const errorPercent = predictedTotal !== 0 ? ((actualTotal - predictedTotal) / predictedTotal) * 100 : 0;

        // Create auto feedback record
        const autoFeedbackRecord = {
          type: 'l2_auto_feedback',
          userId,
          predictionId,
          month,
          predictedTotal: Math.round(predictedTotal),
          actualTotal: Math.round(actualTotal),
          errorAmount: Math.round(errorAmount),
          errorPercent: Math.round(errorPercent * 10) / 10,
          source: 'auto_monthly_actuals',
          approved: true, // For consistency with training data records
          status: 'approved',
          createdBy: 'system',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          usedForTraining: false,
        };

        await db.collection('trainingData').add(autoFeedbackRecord);
        feedbackCreated++;

        logger.info(`[L2_AUTO_FEEDBACK] Created auto feedback for ${userId}/${month}: error ${errorPercent.toFixed(1)}%`);

      } catch (predError) {
        logger.error(`[L2_AUTO_FEEDBACK] Error processing prediction ${predDoc.id}:`, predError);
        errors.push({
          predictionId: predDoc.id,
          error: predError instanceof Error ? predError.message : String(predError),
        });
      }
    }

    // Log audit trail
    await logAdminAction(decodedToken.uid, 'L2_AUTO_FEEDBACK_GENERATED', {
      month,
      feedbackCreated,
      feedbackSkipped,
      errorCount: errors.length,
    });

    logger.info(`[L2_AUTO_FEEDBACK] Generation complete: created=${feedbackCreated}, skipped=${feedbackSkipped}`);

    res.status(200).json({
      ok: true,
      message: `Auto feedback generated for ${month}`,
      summary: {
        month,
        feedbackCreated,
        feedbackSkipped,
        errorCount: errors.length,
        errors: errors.slice(0, 10),
      },
    });

  } catch (err) {
    logger.error('adminGenerateL2AutoFeedback error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 📊 ML SYSTEM HEALTH & STATUS
// ═══════════════════════════════════════════════════════════════════════════════

exports.adminGetMlSystemHealth = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
  try {
    const auth = req.header('authorization')?.replace('Bearer ', '');
    if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const decodedToken = await admin.auth().verifyIdToken(auth);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userRole = userDoc.data()?.role;

    if (!['admin', 'ml_admin'].includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'Forbidden: only admin/ml_admin' });
    }

    // Test Firestore read/write
    let firestoreReadable = false;
    let firestoreWritable = false;
    try {
      await db.collection('appConfig').doc('predictionSettings').get();
      firestoreReadable = true;
      const testRef = db.collection('_healthCheck').doc('test');
      await testRef.set({ ts: admin.firestore.FieldValue.serverTimestamp() });
      await testRef.delete();
      firestoreWritable = true;
    } catch (fsErr) {
      logger.warn('[HEALTH] Firestore test failed:', fsErr.message);
    }

    // Get prediction settings (graceful)
    let settings = null;
    let predictionSettingsExists = false;
    try {
      const settingsDoc = await db.collection('appConfig').doc('predictionSettings').get();
      if (settingsDoc.exists) {
        settings = settingsDoc.data();
        predictionSettingsExists = true;
      }
    } catch (e) { logger.warn('[HEALTH] settings read failed:', e.message); }

    // Get pipeline status (graceful)
    let pipelineStatus = null;
    try {
      const pipelineDoc = await db.collection('mlPipelineStatus').doc('l2Shadow').get();
      if (pipelineDoc.exists) {
        pipelineStatus = pipelineDoc.data();
      }
    } catch (e) { logger.warn('[HEALTH] pipelineStatus read failed:', e.message); }

    // Get recent ML runs from top-level collection (graceful)
    let recentRuns = [];
    let lastL2Run = null;
    try {
      const mlRunsSnap = await db.collection('mlRuns')
        .orderBy('startedAt', 'desc')
        .limit(10)
        .get();
      recentRuns = mlRunsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      lastL2Run = recentRuns.length > 0 ? recentRuns[0] : null;
    } catch (e) { logger.warn('[HEALTH] mlRuns read failed:', e.message); }

    // Get recent debug logs (graceful)
    let recentErrors = [];
    let recentDebugLogs = [];
    let recentErrorCount = 0;
    try {
      const logsSnap = await db.collection('mlDebugLogs')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();
      recentDebugLogs = logsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      recentErrors = recentDebugLogs.filter(l => l.level === 'error');
      recentErrorCount = recentErrors.length;
    } catch (e) { logger.warn('[HEALTH] mlDebugLogs read failed:', e.message); }

    // Feedback counts (graceful)
    let manualFeedbackCount = 0;
    let autoFeedbackCount = 0;
    let latestManualFeedbackAt = null;
    let latestAutoFeedbackAt = null;
    try {
      const manualSnap = await db.collection('trainingData')
        .where('type', '==', 'l2_manual_feedback')
        .where('status', '==', 'approved')
        .where('excludedFromLearning', '!=', true)
        .get();
      manualFeedbackCount = manualSnap.size;
      if (manualSnap.size > 0) {
        const latest = manualSnap.docs.sort((a, b) => {
          return (b.data().createdAt?.toMillis() || 0) - (a.data().createdAt?.toMillis() || 0);
        })[0];
        latestManualFeedbackAt = latest.data().createdAt;
      }

      const autoSnap = await db.collection('trainingData')
        .where('type', '==', 'l2_auto_feedback')
        .where('status', '==', 'approved')
        .where('excludedFromLearning', '!=', true)
        .get();
      autoFeedbackCount = autoSnap.size;
      if (autoSnap.size > 0) {
        const latest = autoSnap.docs.sort((a, b) => {
          return (b.data().createdAt?.toMillis() || 0) - (a.data().createdAt?.toMillis() || 0);
        })[0];
        latestAutoFeedbackAt = latest.data().createdAt;
      }
    } catch (e) { logger.warn('[HEALTH] feedback count failed:', e.message); }

    res.status(200).json({
      ok: true,
      success: true,
      cloudFunctionsReachable: true,
      firestoreReadable,
      firestoreWritable,
      firebaseProjectId: 'evidence-vydaju',
      predictionSettingsExists,
      predictionSettings: settings ? {
        activePredictionLevel: settings.activePredictionLevel,
        level2Enabled: settings.level2Enabled,
        level2ShadowMode: settings.level2ShadowMode,
        fallbackEnabled: settings.fallbackEnabled,
        updatedAt: settings.updatedAt,
      } : null,
      l2ShadowEnabled: settings?.level2ShadowMode === true,
      pipelineStatus,
      lastL2Run,
      recentRuns,
      feedbackSummary: {
        manualFeedbackCount,
        autoFeedbackCount,
        latestManualFeedbackAt,
        latestAutoFeedbackAt,
      },
      recentErrorCount,
      recentErrors: recentErrors.slice(0, 5),
      recentDebugLogs: recentDebugLogs.slice(0, 50),
    });
  } catch (err) {
    logger.error('adminGetMlSystemHealth error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 🧠 PER-USER AI PROFILE FEATURE LAYER
// ═══════════════════════════════════════════════════════════════════════════════

const extractUserFeatures = async (uid) => {
  try {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const dateStr12m = twelveMonthsAgo.toISOString().split('T')[0];

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const dateStr6m = sixMonthsAgo.toISOString().split('T')[0];

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const dateStr3m = threeMonthsAgo.toISOString().split('T')[0];

    // Get expenses
    const vydaje12m = await db.collection('users').doc(uid).collection('vydaje').where('datum', '>=', dateStr12m).get();
    const vydaje6m = await db.collection('users').doc(uid).collection('vydaje').where('datum', '>=', dateStr6m).get();
    const vydaje3m = await db.collection('users').doc(uid).collection('vydaje').where('datum', '>=', dateStr3m).get();

    // Get income
    const prijmy12m = await db.collection('users').doc(uid).collection('prijmy').where('datum', '>=', dateStr12m).get();
    const prijmy6m = await db.collection('users').doc(uid).collection('prijmy').where('datum', '>=', dateStr6m).get();
    const prijmy3m = await db.collection('users').doc(uid).collection('prijmy').where('datum', '>=', dateStr3m).get();

    const calcTotal = (docs) => docs.docs.reduce((sum, d) => sum + (d.data().castka || 0), 0);
    const calcAvg = (docs, months) => months > 0 ? calcTotal(docs) / months : 0;
    const calcMedian = (docs) => {
      const vals = docs.docs.map(d => d.data().castka || 0).sort((a, b) => a - b);
      return vals.length === 0 ? 0 : vals[Math.floor(vals.length / 2)];
    };

    // Get category totals (12m)
    const categoryTotals12m = {};
    vydaje12m.docs.forEach(d => {
      const cat = d.data().kategorie || 'Other';
      categoryTotals12m[cat] = (categoryTotals12m[cat] || 0) + (d.data().castka || 0);
    });

    const sortedExpCats = Object.entries(categoryTotals12m).sort((a, b) => b[1] - a[1]);
    const topExpenseCategories = sortedExpCats.slice(0, 3).map(e => e[0]);

    // Feedback data (excluding marked for exclusion)
    const manualFeedback = await db.collection('trainingData')
      .where('userId', '==', uid)
      .where('type', '==', 'l2_manual_feedback')
      .where('status', '==', 'approved')
      .where('excludedFromLearning', '!=', true)
      .get();

    const autoFeedback = await db.collection('trainingData')
      .where('userId', '==', uid)
      .where('type', '==', 'l2_auto_feedback')
      .where('status', '==', 'approved')
      .where('excludedFromLearning', '!=', true)
      .get();

    // Note: finalCorrectionFactor is NOT stored in L2 feedback records
    // These use predictedTotal/actualTotal for ratio calculation instead
    // Use 1.0 as neutral factor if field is missing
    const avgManualFactor = manualFeedback.size > 0
      ? manualFeedback.docs.reduce((sum, d) => sum + (d.data().finalCorrectionFactor ?? 1), 0) / manualFeedback.size
      : 1.0;

    const avgAutoFactor = autoFeedback.size > 0
      ? autoFeedback.docs.reduce((sum, d) => sum + (d.data().finalCorrectionFactor ?? 1), 0) / autoFeedback.size
      : 1.0;

    // Category-level analysis
    const expenseCategoryVolatility = {};
    const expenseCategoryTrend = {};
    const topStableCategories = [];
    const topVolatileCategories = [];

    // For each category, calculate volatility and trend
    Object.keys(categoryTotals12m).forEach(cat => {
      const catVydaje12m = vydaje12m.docs.filter(d => (d.data().kategorie || 'Other') === cat);
      const catVydaje6m = vydaje6m.docs.filter(d => (d.data().kategorie || 'Other') === cat);
      const catVydaje3m = vydaje3m.docs.filter(d => (d.data().kategorie || 'Other') === cat);

      // Category volatility: variance in spending
      const catTotal12m = calcTotal({ docs: catVydaje12m });
      const catTotal6m = calcTotal({ docs: catVydaje6m });
      const catTotal3m = calcTotal({ docs: catVydaje3m });
      const catMedian = calcMedian({ docs: catVydaje12m });

      const catVolatility = catMedian > 0 ? Math.abs(catTotal12m - catTotal6m) / catMedian : 0;
      expenseCategoryVolatility[cat] = Math.round(catVolatility * 100) / 100;

      // Category trend: 3m vs 12m
      const catTrend = catTotal12m > 0 ? (catTotal3m - catTotal12m) / catTotal12m : 0;
      expenseCategoryTrend[cat] = Math.round(catTrend * 100) / 100;
    });

    // Identify stable and volatile categories
    const volatilityEntries = Object.entries(expenseCategoryVolatility).sort((a, b) => a[1] - b[1]);
    topStableCategories.push(...volatilityEntries.slice(0, 2).map(e => e[0]));
    topVolatileCategories.push(...volatilityEntries.slice(-2).map(e => e[0]).reverse());

    return {
      avgExpense3m: calcAvg(vydaje3m, 3),
      avgExpense6m: calcAvg(vydaje6m, 6),
      avgExpense12m: calcAvg(vydaje12m, 12),
      avgIncome3m: calcAvg(prijmy3m, 3),
      avgIncome6m: calcAvg(prijmy6m, 6),
      avgIncome12m: calcAvg(prijmy12m, 12),
      categoryTotals12m,
      categoryAverages12m: Object.fromEntries(
        Object.entries(categoryTotals12m).map(([cat, total]) => [cat, total / 12])
      ),
      expenseCategoryVolatility,
      expenseCategoryTrend,
      topStableCategories,
      topVolatileCategories,
      monthOverMonthExpenseTrend: vydaje12m.size > 0 ? (calcTotal(vydaje3m) - calcTotal(vydaje12m)) / calcTotal(vydaje12m) : 0,
      monthOverMonthIncomeTrend: prijmy12m.size > 0 ? (calcTotal(prijmy3m) - calcTotal(prijmy12m)) / calcTotal(prijmy12m) : 0,
      largestExpenseCategory: topExpenseCategories[0] || null,
      largestIncomeCategory: 'Salary',
      volatilityScore: calcMedian(vydaje12m) > 0 ? Math.abs(calcTotal(vydaje12m) - calcTotal(vydaje6m)) / calcMedian(vydaje12m) : 0,
      regularityScore: prijmy12m.size > 0 ? 1 - (Math.abs(calcAvg(prijmy6m, 6) - calcAvg(prijmy12m, 12)) / (calcAvg(prijmy12m, 12) || 1)) : 0,
      feedbackCount: manualFeedback.size + autoFeedback.size,
      avgManualCorrectionFactor: Math.round(avgManualFactor * 100) / 100,
      avgAutoCorrectionFactor: Math.round(avgAutoFactor * 100) / 100,
      avgFinalCorrectionFactor: Math.round(((avgManualFactor * manualFeedback.size + avgAutoFactor * autoFeedback.size) / Math.max(1, manualFeedback.size + autoFeedback.size)) * 100) / 100,
    };
  } catch (err) {
    logger.error('[AI_PROFILE] Feature extraction failed:', err.message);
    throw err;
  }
};

const buildTrainingDataset = async () => {
  try {
    const dataset = [];

    // Get all users
    const allUsers = await db.collection('users').get();

    for (const userDoc of allUsers.docs) {
      const uid = userDoc.id;

      // Get approved, non-excluded training records for this user (only L2 feedback types)
      const trainingRecords = await db.collection('trainingData')
        .where('userId', '==', uid)
        .where('type', 'in', ['l2_manual_feedback', 'l2_auto_feedback'])
        .where('status', '==', 'approved')
        .where('excludedFromLearning', '!=', true)
        .get();

      if (trainingRecords.empty) continue;

      // Extract features once for this user (valid period context)
      const userFeatures = await extractUserFeatures(uid);

      // Create a dataset row for each training record
      for (const recordDoc of trainingRecords.docs) {
        const record = recordDoc.data();

        // Validate target values
        const actualTotal = Number(record.actualTotal);
        const predictedTotal = Number(record.predictedTotal);
        // actualTotal >= 0 is valid (zero is legitimate), predictedTotal > 0 required for ratio
        const targetValid = Number.isFinite(actualTotal) && actualTotal >= 0 && Number.isFinite(predictedTotal) && predictedTotal > 0;

        const row = {
          userId: uid,
          month: record.month,
          // Feature values (from user's overall profile)
          avgExpense3m: userFeatures.avgExpense3m,
          avgExpense6m: userFeatures.avgExpense6m,
          avgExpense12m: userFeatures.avgExpense12m,
          avgIncome3m: userFeatures.avgIncome3m,
          avgIncome6m: userFeatures.avgIncome6m,
          avgIncome12m: userFeatures.avgIncome12m,
          volatilityScore: userFeatures.volatilityScore,
          regularityScore: userFeatures.regularityScore,
          feedbackCount: userFeatures.feedbackCount,
          avgManualCorrectionFactor: userFeatures.avgManualCorrectionFactor,
          avgAutoCorrectionFactor: userFeatures.avgAutoCorrectionFactor,
          avgFinalCorrectionFactor: userFeatures.avgFinalCorrectionFactor,
          // Target (learning objective)
          target: targetValid ? actualTotal : null,
          targetDefinition: 'actualTotal (ground truth from user feedback)',
          // Source values (for reference/debugging)
          actualTotal,
          predictedTotal,
          // Status flags
          targetAvailable: targetValid,
          trainReady: targetValid,
          // Metadata
          feedbackType: record.type,
          recordId: recordDoc.id,
        };

        dataset.push(row);
      }
    }

    return dataset;
  } catch (err) {
    logger.error('[DATASET_BUILDER] Multi-user dataset extraction failed:', err.message);
    throw err;
  }
};

const exportTrainReadyDataset = async () => {
  try {
    const fullDataset = await buildTrainingDataset();

    // Filter only train-ready rows
    const trainReadyRows = fullDataset.filter(row => row.trainReady === true);

    // Create export-optimized rows (remove redundant fields, structure clearly)
    const exportRows = trainReadyRows.map(row => ({
      userId: row.userId,
      month: row.month,
      // Features (13 values)
      features: {
        avgExpense3m: row.avgExpense3m,
        avgExpense6m: row.avgExpense6m,
        avgExpense12m: row.avgExpense12m,
        avgIncome3m: row.avgIncome3m,
        avgIncome6m: row.avgIncome6m,
        avgIncome12m: row.avgIncome12m,
        volatilityScore: row.volatilityScore,
        regularityScore: row.regularityScore,
        feedbackCount: row.feedbackCount,
        avgManualCorrectionFactor: row.avgManualCorrectionFactor,
        avgAutoCorrectionFactor: row.avgAutoCorrectionFactor,
        avgFinalCorrectionFactor: row.avgFinalCorrectionFactor,
      },
      // Target (ground truth)
      target: row.target,
      // Metadata for traceability
      metadata: {
        feedbackType: row.feedbackType,
        recordId: row.recordId,
        predictedTotal: row.predictedTotal,
        actualTotal: row.actualTotal,
      }
    }));

    return {
      success: true,
      metadata: {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        format: 'json_array',
        totalRecords: fullDataset.length,
        trainReadyRecords: trainReadyRows.length,
        excludedRecords: fullDataset.length - trainReadyRows.length,
      },
      rows: exportRows,
    };
  } catch (err) {
    logger.error('[DATASET_EXPORT] Export failed:', err.message);
    throw err;
  }
};

const generateHumanReadableExplanation = (profile) => {
  const parts = [];

  if (profile.incomeRegularity > 0.8) parts.push('stable monthly income');
  else if (profile.incomeRegularity > 0.5) parts.push('moderate income variability');
  else parts.push('irregular income');

  if (profile.expenseVolatility > 0.5) parts.push('high spending variability');
  else if (profile.expenseVolatility > 0.2) parts.push('moderate spending variability');
  else parts.push('predictable spending');

  if (profile.topExpenseCategories.length > 0) {
    parts.push(`${profile.topExpenseCategories[0]} is dominant expense`);
  }

  if (profile.savingsTrend > 0.1) parts.push('strong upward savings trend');
  else if (profile.savingsTrend < -0.1) parts.push('declining savings trend');

  if (profile.feedbackAdjustedBias > 0.05) parts.push('recent feedback suggests baseline slightly overpredicts');
  else if (profile.feedbackAdjustedBias < -0.05) parts.push('recent feedback suggests baseline underpredicts');

  return parts.join('. ') + '.';
};

// Check if a user's AI Profile is stale based on recent data changes
const checkAiProfileStaleness = async (uid, profileGeneratedAt) => {
  try {
    const staleReason = [];
    const now = new Date();
    const profileGenTime = profileGeneratedAt?.toDate ? profileGeneratedAt.toDate() : profileGeneratedAt;

    // Find last transaction (vydaje or prijmy)
    const vydaje = await db.collection('users').doc(uid).collection('vydaje')
      .orderBy('datum', 'desc')
      .limit(1)
      .get();
    const lastVydaj = vydaje.docs[0]?.data();

    const prijmy = await db.collection('users').doc(uid).collection('prijmy')
      .orderBy('datum', 'desc')
      .limit(1)
      .get();
    const lastPrijmy = prijmy.docs[0]?.data();

    // Determine last transaction timestamp
    const vydajDate = lastVydaj?.datum ? new Date(lastVydaj.datum) : null;
    const prijmyDate = lastPrijmy?.datum ? new Date(lastPrijmy.datum) : null;
    const lastTransactionAt = [vydajDate, prijmyDate]
      .filter(d => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0] || null;

    // Check if transactions are newer than profile
    if (lastTransactionAt && profileGenTime && lastTransactionAt > profileGenTime) {
      staleReason.push('new_transactions_since_profile_generation');
    }

    // Find last feedback record (excluding marked for exclusion)
    const feedback = await db.collection('trainingData')
      .where('userId', '==', uid)
      .where('status', '==', 'approved')
      .where('excludedFromLearning', '!=', true)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    const lastFeedbackRecord = feedback.docs[0]?.data();
    const lastFeedbackAt = lastFeedbackRecord?.createdAt || null;

    // Check if feedback is newer than profile
    if (lastFeedbackAt && profileGenTime) {
      const feedbackDate = lastFeedbackAt.toDate ? lastFeedbackAt.toDate() : lastFeedbackAt;
      if (feedbackDate > profileGenTime) {
        staleReason.push('new_feedback_since_profile_generation');
      }
    }

    return {
      profileStale: staleReason.length > 0,
      staleReason: staleReason,
      lastTransactionAt: lastTransactionAt,
      lastFeedbackAt: lastFeedbackAt,
    };
  } catch (err) {
    logger.warn(`[AI_PROFILE_STALE] Check failed for ${uid}:`, err.message);
    return {
      profileStale: false,
      staleReason: [],
      lastTransactionAt: null,
      lastFeedbackAt: null,
    };
  }
};

exports.adminGenerateAiProfile = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const auth = req.header('authorization')?.replace('Bearer ', '');
      if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });

      const decodedToken = await admin.auth().verifyIdToken(auth);
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const userRole = userDoc.data()?.role;

      if (!['admin', 'ml_admin'].includes(userRole)) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }

      const targetUid = req.body?.userId;
      if (!targetUid) return res.status(400).json({ ok: false, error: 'userId required' });

      const features = await extractUserFeatures(targetUid);

      // Load last transaction and feedback timestamps for staleness tracking
      const vydaje = await db.collection('users').doc(targetUid).collection('vydaje')
        .orderBy('datum', 'desc')
        .limit(1)
        .get();
      const lastVydaj = vydaje.docs[0]?.data();

      const prijmy = await db.collection('users').doc(targetUid).collection('prijmy')
        .orderBy('datum', 'desc')
        .limit(1)
        .get();
      const lastPrijmy = prijmy.docs[0]?.data();

      const vydajDate = lastVydaj?.datum ? new Date(lastVydaj.datum) : null;
      const prijmyDate = lastPrijmy?.datum ? new Date(lastPrijmy.datum) : null;
      const lastTransactionAt = [vydajDate, prijmyDate]
        .filter(d => d !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0] || null;

      const feedback = await db.collection('trainingData')
        .where('userId', '==', targetUid)
        .where('status', '==', 'approved')
        .where('excludedFromLearning', '!=', true)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      const lastFeedbackAt = feedback.docs[0]?.data()?.createdAt || null;

      const expenseData = Object.values(features.categoryTotals12m);
      const medianExpense = expenseData.length > 0
        ? expenseData.sort((a, b) => a - b)[Math.floor(expenseData.length / 2)]
        : 0;

      const profile = {
        userId: targetUid,
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        sourceDataUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        profileStale: false,
        staleSince: null,
        lastAutoRegeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
        staleReason: [],
        lastTransactionAt: lastTransactionAt ? admin.firestore.Timestamp.fromDate(lastTransactionAt) : null,
        lastFeedbackAt: lastFeedbackAt || null,
        dataCoverageMonths: 12,
        transactionCount: Object.values(features.categoryTotals12m).length,
        expenseCount: Object.values(features.categoryTotals12m).reduce((a, b) => a + b, 0) > 0 ? 12 : 0,
        incomeCount: features.avgIncome12m > 0 ? 12 : 0,
        avgMonthlyExpense: Math.round(features.avgExpense12m),
        avgMonthlyIncome: Math.round(features.avgIncome12m),
        medianMonthlyExpense: Math.round(medianExpense),
        medianMonthlyIncome: Math.round(features.avgIncome12m * 0.95),
        topExpenseCategories: features.topExpenseCategories || [],
        topIncomeCategories: ['Salary'],
        // Category-level signals for personalization
        expenseCategoryVolatility: features.expenseCategoryVolatility || {},
        expenseCategoryTrend: features.expenseCategoryTrend || {},
        topStableCategories: features.topStableCategories || [],
        topVolatileCategories: features.topVolatileCategories || [],
        expenseVolatility: Math.round(features.volatilityScore * 100) / 100,
        incomeRegularity: Math.round(features.regularityScore * 100) / 100,
        savingsTrend: Math.round(features.monthOverMonthIncomeTrend * 100) / 100,
        dominantSpendingPattern: features.largestExpenseCategory || 'Mixed',
        seasonalitySignals: 'Low seasonality detected',
        feedbackAdjustedBias: features.avgFinalCorrectionFactor - 1.0,
        confidenceScore: Math.min(100, Math.round(Math.max(0, (features.feedbackCount * 10 + 60)))),
        profileVersion: '1.0',
        humanReadableExplanation: '',
        features,
      };

      profile.humanReadableExplanation = generateHumanReadableExplanation(profile);

      await db.collection('users').doc(targetUid).collection('aiProfile').doc('summary').set(profile);

      res.status(200).json({ ok: true, profile });
    } catch (err) {
      logger.error('adminGenerateAiProfile error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });
});

exports.adminGenerateAllAiProfiles = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const auth = req.header('authorization')?.replace('Bearer ', '');
      if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });

      const decodedToken = await admin.auth().verifyIdToken(auth);
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const userRole = userDoc.data()?.role;

      if (!['admin', 'ml_admin'].includes(userRole)) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }

      const usersSnap = await db.collection('users').get();
      let generated = 0;
      let failed = 0;
      const errors = [];

      for (const userDoc of usersSnap.docs) {
        try {
          const features = await extractUserFeatures(userDoc.id);

          // Load last transaction and feedback timestamps for staleness tracking
          const vydaje = await db.collection('users').doc(userDoc.id).collection('vydaje')
            .orderBy('datum', 'desc')
            .limit(1)
            .get();
          const lastVydaj = vydaje.docs[0]?.data();

          const prijmy = await db.collection('users').doc(userDoc.id).collection('prijmy')
            .orderBy('datum', 'desc')
            .limit(1)
            .get();
          const lastPrijmy = prijmy.docs[0]?.data();

          const vydajDate = lastVydaj?.datum ? new Date(lastVydaj.datum) : null;
          const prijmyDate = lastPrijmy?.datum ? new Date(lastPrijmy.datum) : null;
          const lastTransactionAt = [vydajDate, prijmyDate]
            .filter(d => d !== null)
            .sort((a, b) => b.getTime() - a.getTime())[0] || null;

          const feedback = await db.collection('trainingData')
            .where('userId', '==', userDoc.id)
            .where('status', '==', 'approved')
            .where('excludedFromLearning', '!=', true)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
          const lastFeedbackAt = feedback.docs[0]?.data()?.createdAt || null;

          const expenseData = Object.values(features.categoryTotals12m);
          const medianExpense = expenseData.length > 0
            ? expenseData.sort((a, b) => a - b)[Math.floor(expenseData.length / 2)]
            : 0;

          const profile = {
            userId: userDoc.id,
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            sourceDataUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            profileStale: false,
            staleReason: [],
            lastTransactionAt: lastTransactionAt ? admin.firestore.Timestamp.fromDate(lastTransactionAt) : null,
            lastFeedbackAt: lastFeedbackAt || null,
            dataCoverageMonths: 12,
            transactionCount: Object.values(features.categoryTotals12m).length,
            expenseCount: 12,
            incomeCount: features.avgIncome12m > 0 ? 12 : 0,
            avgMonthlyExpense: Math.round(features.avgExpense12m),
            avgMonthlyIncome: Math.round(features.avgIncome12m),
            medianMonthlyExpense: Math.round(medianExpense),
            medianMonthlyIncome: Math.round(features.avgIncome12m * 0.95),
            topExpenseCategories: features.topExpenseCategories || [],
            topIncomeCategories: ['Salary'],
            expenseVolatility: Math.round(features.volatilityScore * 100) / 100,
            incomeRegularity: Math.round(features.regularityScore * 100) / 100,
            savingsTrend: Math.round(features.monthOverMonthIncomeTrend * 100) / 100,
            dominantSpendingPattern: features.largestExpenseCategory || 'Mixed',
            seasonalitySignals: 'Low seasonality detected',
            feedbackAdjustedBias: features.avgFinalCorrectionFactor - 1.0,
            confidenceScore: Math.min(100, Math.round(Math.max(0, (features.feedbackCount * 10 + 60)))),
            profileVersion: '1.0',
            humanReadableExplanation: '',
            features,
          };

          profile.humanReadableExplanation = generateHumanReadableExplanation(profile);

          await db.collection('users').doc(userDoc.id).collection('aiProfile').doc('summary').set(profile);
          generated++;
        } catch (err) {
          logger.error(`[PROFILES] Failed for user ${userDoc.id}:`, err.message);
          failed++;
          errors.push({ userId: userDoc.id, error: err.message });
        }
      }

      res.status(200).json({ ok: true, generated, failed, errors: errors.slice(0, 5) });
    } catch (err) {
      logger.error('adminGenerateAllAiProfiles error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });
});

// Returns list of all users (uid, email, displayName, role) for admin UI
exports.adminGetAllUsers = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const auth = req.header('authorization')?.replace('Bearer ', '');
      if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });
      const decodedToken = await admin.auth().verifyIdToken(auth);
      const callerDoc = await db.collection('users').doc(decodedToken.uid).get();
      if (!['admin', 'ml_admin'].includes(callerDoc.data()?.role)) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
      const usersSnap = await db.collection('users').get();
      const users = usersSnap.docs.map(doc => ({
        uid: doc.id,
        email: doc.data().email || null,
        displayName: doc.data().displayName || null,
        role: doc.data().role || null,
      }));
      res.status(200).json({ ok: true, users });
    } catch (err) {
      logger.error('adminGetAllUsers error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });
});

// Returns saved AI profile for one user (with staleness check)
exports.adminGetAiProfile = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const auth = req.header('authorization')?.replace('Bearer ', '');
      if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });
      const decodedToken = await admin.auth().verifyIdToken(auth);
      const callerDoc = await db.collection('users').doc(decodedToken.uid).get();
      if (!['admin', 'ml_admin'].includes(callerDoc.data()?.role)) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
      const targetUid = req.body?.userId;
      if (!targetUid) return res.status(400).json({ ok: false, error: 'userId required' });
      const profileDoc = await db.collection('users').doc(targetUid).collection('aiProfile').doc('summary').get();
      if (!profileDoc.exists) {
        return res.status(200).json({ ok: true, profile: null });
      }

      let profile = profileDoc.data();

      // Ensure old profiles (before staleness tracking) have the fields
      if (profile.profileStale === undefined) {
        profile.profileStale = false;
      }
      if (profile.staleReason === undefined) {
        profile.staleReason = [];
      }
      if (profile.staleSince === undefined) {
        profile.staleSince = null;
      }
      if (profile.lastAutoRegeneratedAt === undefined) {
        profile.lastAutoRegeneratedAt = null;
      }

      // Check staleness to get current state
      const generatedAt = profile.generatedAt?.toDate ? profile.generatedAt.toDate() : profile.generatedAt;
      const staleness = await checkAiProfileStaleness(targetUid, generatedAt);

      // Merge staleness info with profile (overwrite with current state)
      const enrichedProfile = {
        ...profile,
        profileStale: staleness.profileStale,
        staleReason: staleness.staleReason,
        lastTransactionAt: staleness.lastTransactionAt,
        lastFeedbackAt: staleness.lastFeedbackAt,
        staleSince: profile.staleSince || null,
        lastAutoRegeneratedAt: profile.lastAutoRegeneratedAt || null,
      };

      res.status(200).json({ ok: true, profile: enrichedProfile });
    } catch (err) {
      logger.error('adminGetAiProfile error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });
});

// Regenerate all stale AI profiles (admin bulk action)
exports.adminRegenerateStaleProfiles = functions.region(REGION).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const auth = req.header('authorization')?.replace('Bearer ', '');
      if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });

      const decodedToken = await admin.auth().verifyIdToken(auth);
      const callerDoc = await db.collection('users').doc(decodedToken.uid).get();
      if (!['admin', 'ml_admin'].includes(callerDoc.data()?.role)) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }

      // Get all users
      const usersSnap = await db.collection('users').get();
      const staleUserIds = [];
      const results = {
        regenerated: 0,
        skippedFresh: 0,
        skippedMissing: 0,
        failed: 0,
        errors: [],
      };

      // Check each user's profile for staleness
      for (const userDoc of usersSnap.docs) {
        try {
          const profileDoc = await db.collection('users').doc(userDoc.id).collection('aiProfile').doc('summary').get();

          if (!profileDoc.exists) {
            results.skippedMissing++;
            continue;
          }

          const profile = profileDoc.data();

          // Check if stale
          const generatedAt = profile.generatedAt?.toDate ? profile.generatedAt.toDate() : profile.generatedAt;
          const staleness = await checkAiProfileStaleness(userDoc.id, generatedAt);

          if (staleness.profileStale) {
            staleUserIds.push(userDoc.id);
          } else {
            results.skippedFresh++;
          }
        } catch (err) {
          logger.warn(`[STALE_CHECK] Failed for user ${userDoc.id}:`, err.message);
          results.skippedMissing++;
        }
      }

      // Regenerate all stale profiles
      for (const uid of staleUserIds) {
        try {
          const features = await extractUserFeatures(uid);

          // Load last transaction and feedback timestamps
          const vydaje = await db.collection('users').doc(uid).collection('vydaje')
            .orderBy('datum', 'desc')
            .limit(1)
            .get();
          const lastVydaj = vydaje.docs[0]?.data();

          const prijmy = await db.collection('users').doc(uid).collection('prijmy')
            .orderBy('datum', 'desc')
            .limit(1)
            .get();
          const lastPrijmy = prijmy.docs[0]?.data();

          const vydajDate = lastVydaj?.datum ? new Date(lastVydaj.datum) : null;
          const prijmyDate = lastPrijmy?.datum ? new Date(lastPrijmy.datum) : null;
          const lastTransactionAt = [vydajDate, prijmyDate]
            .filter(d => d !== null)
            .sort((a, b) => b.getTime() - a.getTime())[0] || null;

          const feedback = await db.collection('trainingData')
            .where('userId', '==', uid)
            .where('status', '==', 'approved')
            .where('excludedFromLearning', '!=', true)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
          const lastFeedbackAt = feedback.docs[0]?.data()?.createdAt || null;

          const expenseData = Object.values(features.categoryTotals12m);
          const medianExpense = expenseData.length > 0
            ? expenseData.sort((a, b) => a - b)[Math.floor(expenseData.length / 2)]
            : 0;

          const profile = {
            userId: uid,
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            sourceDataUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            profileStale: false,
            staleReason: [],
            lastTransactionAt: lastTransactionAt ? admin.firestore.Timestamp.fromDate(lastTransactionAt) : null,
            lastFeedbackAt: lastFeedbackAt || null,
            dataCoverageMonths: 12,
            transactionCount: Object.values(features.categoryTotals12m).length,
            expenseCount: Object.values(features.categoryTotals12m).reduce((a, b) => a + b, 0) > 0 ? 12 : 0,
            incomeCount: features.avgIncome12m > 0 ? 12 : 0,
            avgMonthlyExpense: Math.round(features.avgExpense12m),
            avgMonthlyIncome: Math.round(features.avgIncome12m),
            medianMonthlyExpense: Math.round(medianExpense),
            medianMonthlyIncome: Math.round(features.avgIncome12m * 0.95),
            topExpenseCategories: features.topExpenseCategories || [],
            topIncomeCategories: ['Salary'],
            expenseVolatility: Math.round(features.volatilityScore * 100) / 100,
            incomeRegularity: Math.round(features.regularityScore * 100) / 100,
            savingsTrend: Math.round(features.monthOverMonthIncomeTrend * 100) / 100,
            dominantSpendingPattern: features.largestExpenseCategory || 'Mixed',
            seasonalitySignals: 'Low seasonality detected',
            feedbackAdjustedBias: features.avgFinalCorrectionFactor - 1.0,
            confidenceScore: Math.min(100, Math.round(Math.max(0, (features.feedbackCount * 10 + 60)))),
            profileVersion: '1.0',
            humanReadableExplanation: '',
            features,
          };

          profile.humanReadableExplanation = generateHumanReadableExplanation(profile);

          await db.collection('users').doc(uid).collection('aiProfile').doc('summary').set(profile);
          results.regenerated++;
        } catch (err) {
          logger.error(`[REGENERATE_STALE] Failed for user ${uid}:`, err.message);
          results.failed++;
          results.errors.push({ userId: uid, error: err.message });
        }
      }

      res.status(200).json({ ok: true, ...results });
    } catch (err) {
      logger.error('adminRegenerateStaleProfiles error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });
});

// Scheduled: Auto-regenerate AI profiles that are stale for >24 hours
exports.autoRegenerateStaleAiProfiles = functions
  .region(REGION)
  .pubsub.schedule('0 3 * * *')
  .timeZone('Europe/Prague')
  .onRun(async (context) => {
    try {
      const now = new Date();
      const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const usersSnap = await db.collection('users').get();

      let processed = 0;
      let regenerated = 0;
      let errors = [];

      // Check each user's profile for staleness >24h
      for (const userDoc of usersSnap.docs) {
        try {
          processed++;
          const profileDoc = await db.collection('users').doc(userDoc.id).collection('aiProfile').doc('summary').get();

          if (!profileDoc.exists) {
            continue;
          }

          const profile = profileDoc.data();

          // Skip if profile is fresh
          if (!profile.profileStale) {
            continue;
          }

          // Skip if staleSince not set (shouldn't happen, but safety check)
          if (!profile.staleSince) {
            continue;
          }

          const staleSinceDate = profile.staleSince?.toDate ? profile.staleSince.toDate() : profile.staleSince;

          // Only regenerate if stale for >24 hours
          if (staleSinceDate > cutoff24h) {
            continue;  // Not yet 24 hours
          }

          // Regenerate this profile
          const features = await extractUserFeatures(userDoc.id);

          // Load last transaction and feedback timestamps
          const vydaje = await db.collection('users').doc(userDoc.id).collection('vydaje')
            .orderBy('datum', 'desc')
            .limit(1)
            .get();
          const lastVydaj = vydaje.docs[0]?.data();

          const prijmy = await db.collection('users').doc(userDoc.id).collection('prijmy')
            .orderBy('datum', 'desc')
            .limit(1)
            .get();
          const lastPrijmy = prijmy.docs[0]?.data();

          const vydajDate = lastVydaj?.datum ? new Date(lastVydaj.datum) : null;
          const prijmyDate = lastPrijmy?.datum ? new Date(lastPrijmy.datum) : null;
          const lastTransactionAt = [vydajDate, prijmyDate]
            .filter(d => d !== null)
            .sort((a, b) => b.getTime() - a.getTime())[0] || null;

          const feedback = await db.collection('trainingData')
            .where('userId', '==', userDoc.id)
            .where('status', '==', 'approved')
            .where('excludedFromLearning', '!=', true)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
          const lastFeedbackAt = feedback.docs[0]?.data()?.createdAt || null;

          const expenseData = Object.values(features.categoryTotals12m);
          const medianExpense = expenseData.length > 0
            ? expenseData.sort((a, b) => a - b)[Math.floor(expenseData.length / 2)]
            : 0;

          const newProfile = {
            userId: userDoc.id,
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            sourceDataUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            profileStale: false,
            staleSince: null,
            lastAutoRegeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
            staleReason: [],
            lastTransactionAt: lastTransactionAt ? admin.firestore.Timestamp.fromDate(lastTransactionAt) : null,
            lastFeedbackAt: lastFeedbackAt || null,
            dataCoverageMonths: 12,
            transactionCount: Object.values(features.categoryTotals12m).length,
            expenseCount: Object.values(features.categoryTotals12m).reduce((a, b) => a + b, 0) > 0 ? 12 : 0,
            incomeCount: features.avgIncome12m > 0 ? 12 : 0,
            avgMonthlyExpense: Math.round(features.avgExpense12m),
            avgMonthlyIncome: Math.round(features.avgIncome12m),
            medianMonthlyExpense: Math.round(medianExpense),
            medianMonthlyIncome: Math.round(features.avgIncome12m * 0.95),
            topExpenseCategories: features.topExpenseCategories || [],
            topIncomeCategories: ['Salary'],
            expenseCategoryVolatility: features.expenseCategoryVolatility || {},
            expenseCategoryTrend: features.expenseCategoryTrend || {},
            topStableCategories: features.topStableCategories || [],
            topVolatileCategories: features.topVolatileCategories || [],
            expenseVolatility: Math.round(features.volatilityScore * 100) / 100,
            incomeRegularity: Math.round(features.regularityScore * 100) / 100,
            savingsTrend: Math.round(features.monthOverMonthIncomeTrend * 100) / 100,
            dominantSpendingPattern: features.largestExpenseCategory || 'Mixed',
            seasonalitySignals: 'Low seasonality detected',
            feedbackAdjustedBias: features.avgFinalCorrectionFactor - 1.0,
            confidenceScore: Math.min(100, Math.round(Math.max(0, (features.feedbackCount * 10 + 60)))),
            profileVersion: '1.0',
            humanReadableExplanation: '',
            features,
          };

          newProfile.humanReadableExplanation = generateHumanReadableExplanation(newProfile);

          await db.collection('users').doc(userDoc.id).collection('aiProfile').doc('summary').set(newProfile);
          regenerated++;
        } catch (err) {
          logger.error(`[AUTO_REGEN] Failed for user ${userDoc.id}:`, err.message);
          errors.push({ userId: userDoc.id, error: err.message });
        }
      }

      logger.log(`[AUTO_REGEN] Complete: processed=${processed}, regenerated=${regenerated}, errors=${errors.length}`);
      if (errors.length > 0) {
        logger.warn('[AUTO_REGEN] Errors:', JSON.stringify(errors));
      }
    } catch (err) {
      logger.error('[AUTO_REGEN] Scheduled function error:', err.message);
    }
  });

exports.buildTrainingDataset = functions.region(REGION).https.onRequest(async (req, res) => {
  try {
    const dataset = await buildTrainingDataset();

    // Calculate summary statistics
    const trainReadyCount = dataset.filter(row => row.trainReady).length;
    const missingTargetCount = dataset.filter(row => !row.trainReady).length;

    res.json({
      success: true,
      summary: {
        totalRows: dataset.length,
        trainReadyRows: trainReadyCount,
        missingTargetRows: missingTargetCount,
        trainReadyPercent: dataset.length > 0 ? Math.round((trainReadyCount / dataset.length) * 100) : 0,
      },
      dataset,
      schema: {
        // Core identifiers
        userId: 'string',
        month: 'string (YYYY-MM)',
        recordId: 'string (Firestore document ID)',
        // Features (13 fields)
        avgExpense3m: 'number',
        avgExpense6m: 'number',
        avgExpense12m: 'number',
        avgIncome3m: 'number',
        avgIncome6m: 'number',
        avgIncome12m: 'number',
        volatilityScore: 'number (0-1)',
        regularityScore: 'number (0-1)',
        feedbackCount: 'number',
        avgManualCorrectionFactor: 'number',
        avgAutoCorrectionFactor: 'number',
        avgFinalCorrectionFactor: 'number',
        // Target (learning objective)
        target: 'number | null (actualTotal from feedback, null if invalid)',
        targetDefinition: 'string (describes what target represents)',
        targetAvailable: 'boolean (true if target is valid and usable)',
        trainReady: 'boolean (true if row can be used for training)',
        // Source values (for reference)
        actualTotal: 'number (ground truth from user)',
        predictedTotal: 'number (model prediction)',
        // Metadata
        feedbackType: 'string (l2_manual_feedback | l2_auto_feedback)',
      },
      targetDefinition: {
        target: 'actualTotal',
        description: 'Ground truth expense amount provided by user feedback',
        validityCondition: 'actualTotal >= 0 AND predictedTotal > 0 AND both are finite numbers (zero expenses are valid, zero prediction is not)',
        whenTargetMissing: 'target=null, targetAvailable=false, trainReady=false',
        usage: 'For supervised learning: model predicts actualTotal given features',
      }
    });
  } catch (err) {
    logger.error('[DATASET_BUILDER] HTTP endpoint error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

exports.exportTrainReadyDataset = functions.region(REGION).https.onRequest(async (req, res) => {
  try {
    const exportData = await exportTrainReadyDataset();

    res.json(exportData);
  } catch (err) {
    logger.error('[DATASET_EXPORT] HTTP endpoint error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

