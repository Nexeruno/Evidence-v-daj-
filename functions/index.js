require('dotenv').config();
const functions = require('firebase-functions/v1');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const cors = require('cors')({
  origin: ['https://nexeruno.github.io', 'http://localhost:5173', 'http://localhost:5176', 'http://localhost:5177', 'http://localhost:5178', 'http://localhost:5179'],
  credentials: true,
});

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
    };

    await db.collection(`users/${uid}/mlPredictions`).add(predictionData);
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
          const prediction = generateBaselinePrediction(transactions, income);
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
            const prediction = generateBaselinePrediction(transactions, income);
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

        const trainingData = {
          type,
          input,
          expectedOutput,
          category: category || '',
          tags: Array.isArray(tags) ? tags : [],
          note,
          approved: false,
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
        let query = db.collection('trainingData').orderBy('createdAt', 'desc');

        const { type, category, approved, limit = 50, offset = 0 } = req.query;

        if (type && type !== 'all') {
          query = query.where('type', '==', type);
        }

        if (category && category !== 'all') {
          query = query.where('category', '==', category);
        }

        if (approved !== undefined && approved !== 'all') {
          const approvedBool = approved === 'true';
          query = query.where('approved', '==', approvedBool);
        }

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

        // 4. Update approval status
        const updates = {
          approved: Boolean(approved),
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          approvedBy: decodedToken.uid,
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

    const targetUserId = req.query.uid;
    if (!targetUserId) {
      return res.status(400).json({ error: 'uid query parameter required' });
    }

    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const predictions = await db
      .collection('users')
      .doc(targetUserId)
      .collection('mlPredictions')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    const data = predictions.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json({ ok: true, data });
  } catch (err) {
    logger.error('adminGetMlPredictions error:', err);
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
    const errors = [];

    // Get all users
    await updatePipelineStage(runId, 'loading_users');
    const usersRef = db.collection('users');
    const usersSnapshot = await usersRef.get();
    const userIds = usersSnapshot.docs.map(doc => doc.id);

    logger.info(`[L2_SHADOW] Starting shadow pipeline for ${userIds.length} users`);

    // Process each user
    for (const uid of userIds) {
      try {
        // Get user's latest Level 1 prediction
        const level1PredQuery = await db.collection('users').doc(uid)
          .collection('mlPredictions')
          .where('pipelineLevel', '==', 1)
          .where('active', '==', true)
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();

        const level1Pred = level1PredQuery.empty ? null : level1PredQuery.docs[0].data();

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

        // Load approved L2 training feedback (manual + auto) for this user
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

        const manualRecords = manualTrainingQuery.docs.map(doc => doc.data());
        const autoRecords = autoTrainingQuery.docs.map(doc => doc.data());

        // Calculate weighted correction factors
        // manual feedback: weight = 2, auto feedback: weight = 1
        let manualCorrectionFactor = 1.0;
        let autoCorrectionFactor = 1.0;
        let finalCorrectionFactor = 1.0;
        let trainingDataUsed = false;

        if (manualRecords.length > 0) {
          const manualRatios = manualRecords
            .filter(td => td.predictedTotal && td.predictedTotal > 0)
            .map(td => td.actualTotal / td.predictedTotal);

          if (manualRatios.length > 0) {
            manualCorrectionFactor = manualRatios.reduce((a, b) => a + b, 0) / manualRatios.length;
            manualCorrectionFactor = Math.max(0.7, Math.min(1.3, manualCorrectionFactor));
            trainingDataUsed = true;
          }
        }

        if (autoRecords.length > 0) {
          const autoRatios = autoRecords
            .filter(td => td.predictedTotal && td.predictedTotal > 0)
            .map(td => td.actualTotal / td.predictedTotal);

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
        let shadowPrediction = null;

        if (transactions.length >= 10 && level1Pred) {
          // SIMPLIFIED: Create shadow prediction close to Level 1 (with small variation for testing)
          let variation = 0.95 + Math.random() * 0.1; // 95-105% of Level 1
          // Apply weighted correction factor if available
          if (trainingDataUsed) {
            variation *= finalCorrectionFactor;
          }
          shadowPrediction = {
            // Core prediction data
            month: new Date().toISOString().split('T')[0].substring(0, 7),
            totalPredictedExpense: Math.round((level1Pred.totalPredictedExpense || 0) * variation),
            categories: level1Pred.categories || {},
            confidence: 'medium',
            confidenceScore: 70,
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
          shadowPrediction = {
            // Core prediction data
            month: new Date().toISOString().split('T')[0].substring(0, 7),
            totalPredictedExpense: level1Pred?.totalPredictedExpense || 0,
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
            // Metrics
            fallbackUsed: true,
            fallbackReason: transactions.length < 10 ? 'insufficient_data' : 'no_level1_prediction',
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

        predictionsCreated++;
        usersProcessed++;

      } catch (userError) {
        logger.error(`[L2_SHADOW] Error processing user ${uid}:`, userError);
        errors.push({ uid, error: userError.message });
        usersProcessed++;
      }
    }

    // Save ML run record
    const finishTime = admin.firestore.Timestamp.now();
    const durationMs = (finishTime.toMillis() - startTime.toMillis());

    const runRecord = {
      status: errors.length === 0 ? 'success' : 'success_with_errors',
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
      notes: 'Simplified shadow baseline for validating L2 shadow flow. Uses Level 1 predictions + small variation. Applies weighted calibration from manual (weight=2) and auto (weight=1) L2 training feedback if available. NOT Python ML pipeline. NOT actual RandomForest model. For production ML: integrate ml-pipeline/ and trainingData collections.',
      // Timestamps & stats
      startedAt: startTime,
      finishedAt: finishTime,
      durationMs: durationMs,
      usersProcessed: usersProcessed,
      predictionsCreated: predictionsCreated,
      fallbackUsed: fallbackUsed > 0,
      fallbackCount: fallbackUsed,
      errorCount: errors.length,
      errors: errors.slice(0, 10), // Keep first 10 errors only
      triggeredBy: decodedToken.uid,
      triggeredAt: new Date().toISOString(),
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

    if (!userId || !month || !predictedTotal || !actualTotal) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: userId, month, predictedTotal, actualTotal',
      });
    }

    const errorAmount = actualTotal - predictedTotal;
    const errorPercent = predictedTotal !== 0 ? ((actualTotal - predictedTotal) / predictedTotal) * 100 : 0;

    // Create training data record
    const trainingRecord = {
      // L2 feedback specific
      type: 'l2_manual_feedback',
      userId,
      predictionId: predictionId || null,
      month,
      predictedTotal: Math.round(predictedTotal),
      actualTotal: Math.round(actualTotal),
      errorAmount: Math.round(errorAmount),
      errorPercent: Math.round(errorPercent * 10) / 10,
      correctedCategories: correctedCategories || {},
      note: note || '',
      // Metadata
      source: 'manual_admin_feedback',
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
  try {
    const auth = req.header('authorization')?.replace('Bearer ', '');
    if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const decodedToken = await admin.auth().verifyIdToken(auth);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userRole = userDoc.data()?.role;

    if (!['admin', 'ml_admin'].includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'Forbidden: only admin/ml_admin' });
    }

    // Get prediction settings
    const settingsDoc = await db.collection('appConfig').doc('predictionSettings').get();
    const settings = settingsDoc.data();

    // Get pipeline status
    const pipelineStatusDoc = await db.collection('mlPipelineStatus').doc('l2Shadow').get();
    const pipelineStatus = pipelineStatusDoc.exists ? pipelineStatusDoc.data() : null;

    // Get recent ML runs
    const mlRunsSnap = await db.collectionGroup('mlRuns')
      .orderBy('startedAt', 'desc')
      .limit(5)
      .get();
    const recentRuns = mlRunsSnap.docs.map(doc => ({
      id: doc.id,
      userId: doc.ref.parent.parent!.id,
      ...doc.data(),
    }));

    // Get recent errors from mlDebugLogs
    const recentErrorsSnap = await db.collection('mlDebugLogs')
      .where('level', '==', 'error')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    const recentErrors = recentErrorsSnap.docs.map(doc => doc.data());

    // Count total feedback
    const manualFeedbackSnap = await db.collection('trainingData')
      .where('type', '==', 'l2_manual_feedback')
      .where('status', '==', 'approved')
      .get();
    const totalManualFeedback = manualFeedbackSnap.size;

    const autoFeedbackSnap = await db.collection('trainingData')
      .where('type', '==', 'l2_auto_feedback')
      .where('status', '==', 'approved')
      .get();
    const totalAutoFeedback = autoFeedbackSnap.size;

    // Get latest manual feedback
    let latestManualFeedback = null;
    if (manualFeedbackSnap.size > 0) {
      const sorted = manualFeedbackSnap.docs.sort((a, b) => {
        const aTime = a.data().createdAt?.toMillis() || 0;
        const bTime = b.data().createdAt?.toMillis() || 0;
        return bTime - aTime;
      });
      latestManualFeedback = {
        ...sorted[0].data(),
        id: sorted[0].id,
      };
    }

    res.status(200).json({
      ok: true,
      health: {
        firebaseProjectId: 'evidence-vydaju',
        predictionSettingsExists: settings != null,
        l2ShadowEnabled: settings?.level2ShadowMode === true,
        l2Enabled: settings?.level2Enabled === true,
        activePredictionLevel: settings?.activePredictionLevel,
      },
      pipelineStatus,
      recentRuns,
      recentErrors,
      feedbackStats: {
        totalManualFeedback,
        totalAutoFeedback,
        latestManualFeedback,
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.error('adminGetMlSystemHealth error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

