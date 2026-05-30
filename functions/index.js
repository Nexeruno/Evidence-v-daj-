require('dotenv').config();
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const cors = require('cors')({ origin: true });

// Admin email pro ověření oprávnění
const ADMIN_EMAIL = 'danzby@seznam.cz';

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

      // Validuj email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        console.error('❌ Neplatný email format:', email);
        return res.status(400).json({ error: 'Neplatný formát emailu' });
      }

      console.log('📧 Email je validní, generuji reset link...');
      const link = await admin.auth().generatePasswordResetLink(email);
      console.log('✓ Reset link vytvořen:', link.substring(0, 50) + '...');

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

// Smazat uživatele (delete user account + all data)
exports.smazUzivatele = functions.region('europe-west1').https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { uid, idToken } = req.body;

      if (!uid || !idToken) {
        return res.status(400).json({ error: 'uid a idToken jsou povinné' });
      }

      // Ověř, že volající je admin
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const adminDoc = await admin.firestore().doc(`users/${decodedToken.uid}`).get();
      const isAdmin = adminDoc.data()?.role === 'admin' || decodedToken.email === (ADMIN_EMAIL);

      if (!isAdmin) {
        return res.status(403).json({ error: 'Nemáš oprávnění' });
      }

      console.log('🗑️ Smazávám uživatele:', uid);

      // Batch delete: wszystkie subcollections
      const db = admin.firestore();
      const batch = db.batch();

      // Smaž výdaje
      const vydajeSnap = await db.collection(`users/${uid}/vydaje`).get();
      vydajeSnap.forEach(doc => batch.delete(doc.ref));

      // Smaž příjmy
      const prijmySnap = await db.collection(`users/${uid}/prijmy`).get();
      prijmySnap.forEach(doc => batch.delete(doc.ref));

      // Smaž user profil
      batch.delete(db.doc(`users/${uid}`));

      // Smaž username mapping
      const userDoc = await db.doc(`users/${uid}`).get();
      if (userDoc.exists) {
        const usernameLower = userDoc.data()?.usernameLower;
        if (usernameLower) {
          batch.delete(db.doc(`usernames/${usernameLower}`));
        }
      }

      // Commit batch
      await batch.commit();

      // Smaž z Firebase Auth
      await admin.auth().deleteUser(uid);

      console.log('✓ Uživatel smazán:', uid);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('smazUzivatele error:', err);
      return res.status(500).json({ error: err.message || 'Chyba při smazání uživatele' });
    }
  });
});

// Blokovat/odblokovat uživatele
exports.zablokujUzivatele = functions.region('europe-west1').https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { uid, blocked, idToken } = req.body;

      if (!uid || blocked === undefined || !idToken) {
        return res.status(400).json({ error: 'uid, blocked a idToken jsou povinné' });
      }

      // Ověř, že volající je admin
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const adminDoc = await admin.firestore().doc(`users/${decodedToken.uid}`).get();
      const isAdmin = adminDoc.data()?.role === 'admin' || decodedToken.email === (ADMIN_EMAIL);

      if (!isAdmin) {
        return res.status(403).json({ error: 'Nemáš oprávnění' });
      }

      console.log('🔒 Blokuji uživatele:', uid, 'blocked:', blocked);

      // Aktualizuj Firebase Auth
      await admin.auth().updateUser(uid, { disabled: blocked });

      // Aktualizuj Firestore
      await admin.firestore().doc(`users/${uid}`).update({ disabled: blocked });

      console.log('✓ Uživatel aktualizován:', uid);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('zablokujUzivatele error:', err);
      return res.status(500).json({ error: err.message || 'Chyba při blokování uživatele' });
    }
  });
});

// Aktualizovat uživatele (username apod)
exports.aktualizujUzivatele = functions.region('europe-west1').https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { uid, username, email, idToken } = req.body;

      if (!uid || !idToken) {
        return res.status(400).json({ error: 'uid a idToken jsou povinné' });
      }

      // Ověř, že volající je admin
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const adminDoc = await admin.firestore().doc(`users/${decodedToken.uid}`).get();
      const isAdmin = adminDoc.data()?.role === 'admin' || decodedToken.email === (ADMIN_EMAIL);

      if (!isAdmin) {
        return res.status(403).json({ error: 'Nemáš oprávnění' });
      }

      console.log('✏️ Aktualizuji uživatele:', uid);

      const db = admin.firestore();
      const updates = {};

      // Username změna
      if (username) {
        const usernameLower = username.toLowerCase();
        updates.username = username;
        updates.usernameLower = usernameLower;

        // Smaž starý username mapping a vytvoř nový
        const oldUserDoc = await db.doc(`users/${uid}`).get();
        if (oldUserDoc.exists) {
          const oldUsernameLower = oldUserDoc.data()?.usernameLower;
          if (oldUsernameLower && oldUsernameLower !== usernameLower) {
            await db.doc(`usernames/${oldUsernameLower}`).delete().catch(() => {});
          }
        }

        // Vytvoř nový username mapping
        await db.doc(`usernames/${usernameLower}`).set({ email: email || oldUserDoc.data()?.email, uid });
      }

      // Email změna
      if (email) {
        // Firebase Auth
        await admin.auth().updateUser(uid, { email });
        updates.email = email;
      }

      // Update Firestore
      if (Object.keys(updates).length > 0) {
        await db.doc(`users/${uid}`).update(updates);
      }

      console.log('✓ Uživatel aktualizován:', uid);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('aktualizujUzivatele error:', err);
      return res.status(500).json({ error: err.message || 'Chyba při aktualizaci uživatele' });
    }
  });
});

// 🔄 Generování opakujících se transakcí - běží každou noc v 2:00 UTC
exports.generateRecurringTransactions = functions
  .region('europe-west1')
  .pubsub.schedule('0 2 * * *') // Každý den v 2:00 UTC (4:00 CEST)
  .timeZone('Europe/Prague')
  .onRun(async (context) => {
    try {
      console.log('🔄 Spouštím generování opakujících se transakcí...');

      const db = admin.firestore();
      const usersSnap = await db.collection('users').get();
      let generatedCount = 0;

      for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Načti všechny opakující se transakce uživatele
        const recurringSnap = await db
          .collection('users')
          .doc(uid)
          .collection('repeatingTransactions')
          .get();

        for (const recurringDoc of recurringSnap.docs) {
          const recurring = recurringDoc.data();

          // Přeskoč pokud je vypnuté
          if (recurring.isActive === false) continue;

          // Přeskoč pokud datum skončení již prošlo
          if (recurring.recurrenceEndDate) {
            const endDate = recurring.recurrenceEndDate.toDate?.() || new Date(recurring.recurrenceEndDate);
            if (today > endDate) continue;
          }

          // Ověř zda má být dnes vygenerován nový záznam
          const lastGenerated = recurring.lastGeneratedDate?.toDate?.() || new Date(recurring.lastGeneratedDate);
          const shouldGenerate = shouldGenerateToday(today, lastGenerated, recurring);

          if (shouldGenerate) {
            // Validace před vytvořením
            if (!recurring.title?.trim()) {
              console.warn(`⚠️ Přeskakuji - chybí název`);
              continue;
            }
            if (!recurring.amount || recurring.amount <= 0) {
              console.warn(`⚠️ Přeskakuji - neplatná částka: ${recurring.amount}`);
              continue;
            }

            // Ověř že ještě není tentýž záznam pending
            const existingPending = await db
              .collection('users')
              .doc(uid)
              .collection('pendingTransactions')
              .where('recurringId', '==', recurringDoc.id)
              .where('generatedDate', '==', today)
              .get();

            if (existingPending.size > 0) {
              console.warn(`⚠️ Duplikát - ${recurring.title} už je pending na dnešek`);
              continue;
            }

            // Vytvoř návrh transakce (pending) - jen kritické pole
            const pendingTransaction = {
              title: recurring.title,
              type: recurring.type,
              amount: recurring.amount,
              category: recurring.category,
              recurringId: recurringDoc.id,
              status: 'pending',
              createdAt: new Date(),
              generatedDate: today,
            };

            // Ulož do pendingTransactions
            await db
              .collection('users')
              .doc(uid)
              .collection('pendingTransactions')
              .add(pendingTransaction);

            // Aktualizuj lastGeneratedDate v repeatingTransactions
            await db
              .collection('users')
              .doc(uid)
              .collection('repeatingTransactions')
              .doc(recurringDoc.id)
              .update({ lastGeneratedDate: today });

            generatedCount++;
            console.log(`✓ Vygenerováno pro uživatele ${uid}: ${recurring.title}`);
          }
        }
      }

      console.log(`✅ Generování hotovo. Vygenerováno ${generatedCount} záznamů.`);
      return { success: true, generated: generatedCount };
    } catch (err) {
      console.error('❌ Chyba při generování:', err);
      return { success: false, error: err.message };
    }
  });

// Pomocná funkce - ověř zda má být záznam vygenerován dnes
function shouldGenerateToday(today, lastGenerated, recurring) {
  const lastGen = new Date(lastGenerated);
  lastGen.setHours(0, 0, 0, 0);

  const type = recurring.recurrenceType;
  const freq = recurring.recurrenceFrequency || 1;

  switch (type) {
    case 'daily':
      return getDateDifference(lastGen, today) >= freq;

    case 'weekly':
      // Kontrola podle dne v týdnu (0 = neděle, 6 = sobota)
      const dayOfWeek = today.getDay();
      const recurDays = recurring.recurrenceDays || [0]; // Default neděle
      return recurDays.includes(dayOfWeek) && getDateDifference(lastGen, today) >= 7 * freq;

    case 'monthly':
      // Kontrola podle dne v měsíci
      const dayOfMonth = today.getDate();
      let recurDay = recurring.recurrenceDay || 1;

      // Pokud je 30 = poslední den měsíce
      if (recurDay === 30) {
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        recurDay = lastDayOfMonth;
      }

      return dayOfMonth === recurDay && getMonthDifference(lastGen, today) >= freq;

    case 'yearly':
      const isSameDay = today.getMonth() === lastGen.getMonth() &&
                        today.getDate() === lastGen.getDate();
      return isSameDay && getYearDifference(lastGen, today) >= freq;

    default:
      return false;
  }
}

// Pomocné funkce na výpočet rozdílu
function getDateDifference(date1, date2) {
  return Math.floor((date2 - date1) / (1000 * 60 * 60 * 24));
}

function getMonthDifference(date1, date2) {
  return (date2.getFullYear() - date1.getFullYear()) * 12 +
         (date2.getMonth() - date1.getMonth());
}

function getYearDifference(date1, date2) {
  return date2.getFullYear() - date1.getFullYear();
}

// 🧪 TEST ENDPOINT — Ruční spuštění generování (pro testování)
exports.testGenerateRecurring = functions
  .region('europe-west1')
  .https.onRequest(async (req, res) => {
    cors(req, res, async () => {
      try {
        // Ověř, že je uživatel přihlášený
        const token = req.headers.authorization?.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'Nemáš oprávnění' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const uid = decodedToken.uid;

        console.log(`🧪 TEST: Generuji pro uživatele ${uid}...`);

        const db = admin.firestore();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let generatedCount = 0;

        // Načti opakující se transakce
        const recurringSnap = await db
          .collection('users')
          .doc(uid)
          .collection('repeatingTransactions')
          .get();

        for (const recurringDoc of recurringSnap.docs) {
          const recurring = recurringDoc.data();

          if (recurring.isActive === false) continue;
          if (recurring.recurrenceEndDate) {
            const endDate = recurring.recurrenceEndDate.toDate?.() || new Date(recurring.recurrenceEndDate);
            if (today > endDate) continue;
          }

          // Pro testování - resetuj lastGeneratedDate na minulý den
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);

          const lastGenerated = yesterday; // Vždy použij včera pro test
          const shouldGenerate = shouldGenerateToday(today, lastGenerated, recurring);

          if (shouldGenerate) {
            // Validace před vytvořením
            if (!recurring.title?.trim()) {
              console.warn(`⚠️ Přeskakuji - chybí název`);
              continue;
            }
            if (!recurring.amount || recurring.amount <= 0) {
              console.warn(`⚠️ Přeskakuji - neplatná částka: ${recurring.amount}`);
              continue;
            }

            // Ověř že ještě není tentýž záznam pending
            const existingPending = await db
              .collection('users')
              .doc(uid)
              .collection('pendingTransactions')
              .where('recurringId', '==', recurringDoc.id)
              .where('generatedDate', '==', today)
              .get();

            if (existingPending.size > 0) {
              console.warn(`⚠️ Duplikát - ${recurring.title} už je pending na dnešek`);
              continue;
            }

            const pendingTransaction = {
              title: recurring.title,
              type: recurring.type,
              amount: recurring.amount,
              category: recurring.category,
              recurringId: recurringDoc.id,
              status: 'pending',
              createdAt: new Date(),
              generatedDate: today,
            };

            await db
              .collection('users')
              .doc(uid)
              .collection('pendingTransactions')
              .add(pendingTransaction);

            await db
              .collection('users')
              .doc(uid)
              .collection('repeatingTransactions')
              .doc(recurringDoc.id)
              .update({ lastGeneratedDate: today });

            generatedCount++;
            console.log(`✓ Vygenerováno: ${recurring.title}`);
          }
        }

        console.log(`✅ TEST: Hotovo. Vygenerováno ${generatedCount} záznamů.`);
        return res.status(200).json({
          success: true,
          generated: generatedCount,
          message: generatedCount > 0
            ? `Vygenerováno ${generatedCount} záznamů ke schválení! Jdi do Dashboardu.`
            : 'Žádné opakující se transakce k vygenerování (nebo už byly vygenerovány dnes).'
        });
      } catch (err) {
        console.error('❌ TEST error:', err);
        return res.status(500).json({ error: err.message });
      }
    });
  });

// 🧹 CLEANUP & HEALTH CHECK — Smazání duplikátů a debug
exports.cleanupDuplicates = functions
  .region('europe-west1')
  .https.onRequest(async (req, res) => {
    cors(req, res, async () => {
      try {
        const token = req.headers.authorization?.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'Nemáš oprávnění' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const uid = decodedToken.uid;

        console.log(`🧹 CLEANUP: Spouštím pro uživatele ${uid}...`);

        const db = admin.firestore();
        let deletedCount = 0;
        let fixedCount = 0;

        // 1️⃣ Smazání duplikátů v pendingTransactions
        const pendingSnap = await db
          .collection('users')
          .doc(uid)
          .collection('pendingTransactions')
          .get();

        const seenTransactions = new Map();
        const toDelete = [];

        pendingSnap.forEach((doc) => {
          const data = doc.data();
          const key = `${data.title}|${data.amount}|${data.category}`;

          if (seenTransactions.has(key)) {
            // Duplikát - označ k smazání
            toDelete.push(doc.ref);
          } else {
            seenTransactions.set(key, doc.id);
          }
        });

        // Smaž duplikáty
        for (const ref of toDelete) {
          await ref.delete();
          deletedCount++;
          console.log(`✓ Smazán duplikát`);
        }

        // 2️⃣ Oprava repeatingTransactions - ověření povinných polí
        const recurringSnap = await db
          .collection('users')
          .doc(uid)
          .collection('repeatingTransactions')
          .get();

        for (const doc of recurringSnap.docs) {
          const data = doc.data();
          const updates = {};

          // Ověř povinná pole
          if (!data.title) updates.title = 'Bez názvu';
          if (!data.amount || data.amount <= 0) updates.amount = 0;
          if (!data.category) updates.category = 'Ostatní';
          if (!data.type || !['vydaj', 'prijem'].includes(data.type)) updates.type = 'vydaj';
          if (!data.recurrenceType) updates.recurrenceType = 'daily';
          if (!data.recurrenceFrequency || data.recurrenceFrequency < 1) updates.recurrenceFrequency = 1;
          if (!data.isActive) updates.isActive = true;

          // Resetuj lastGeneratedDate na startDate
          if (data.recurrenceStartDate && !data.lastGeneratedDate) {
            updates.lastGeneratedDate = data.recurrenceStartDate;
          }

          if (Object.keys(updates).length > 0) {
            await doc.ref.update(updates);
            fixedCount++;
            console.log(`✓ Opravena opakující se transakce: ${data.title}`);
          }
        }

        const result = {
          success: true,
          deleted: deletedCount,
          fixed: fixedCount,
          totalPending: pendingSnap.size,
          totalRecurring: recurringSnap.size,
          message: `Smazáno ${deletedCount} duplikátů, opraveno ${fixedCount} opakujících se transakcí`
        };

        console.log(`✅ CLEANUP: ${result.message}`);
        return res.status(200).json(result);
      } catch (err) {
        console.error('❌ CLEANUP error:', err);
        return res.status(500).json({ success: false, error: err.message });
      }
    });
  });

// 🐛 DEBUG — Diagnóza opakujících se transakcí
exports.debugRecurring = functions
  .region('europe-west1')
  .https.onRequest(async (req, res) => {
    cors(req, res, async () => {
      try {
        const token = req.headers.authorization?.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'Nemáš oprávnění' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const uid = decodedToken.uid;

        console.log(`🐛 DEBUG: Kontroluji opakující se transakce uživatele ${uid}`);

        const db = admin.firestore();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Načti opakující se transakce
        const recurringSnap = await db
          .collection('users')
          .doc(uid)
          .collection('repeatingTransactions')
          .get();

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
            recurrenceFrequency: data.recurrenceFrequency,
            isActive: data.isActive,
            lastGeneratedDate: data.lastGeneratedDate?.toDate?.()?.toISOString?.() || 'CHYBÍ',
            recurrenceStartDate: data.recurrenceStartDate?.toDate?.()?.toISOString?.() || 'CHYBÍ',
            recurrenceEndDate: data.recurrenceEndDate?.toDate?.()?.toISOString?.() || 'NENÍ NASTAVENO',
          });

          // Kontrola problémů
          if (!data.title?.trim()) issues.push(`${doc.id}: Chybí název`);
          if (!data.amount || data.amount <= 0) issues.push(`${doc.id}: Neplatná částka ${data.amount}`);
          if (!data.category) issues.push(`${doc.id}: Chybí kategorie`);
          if (!data.type) issues.push(`${doc.id}: Chybí typ (vydaj/prijem)`);
          if (!data.recurrenceType) issues.push(`${doc.id}: Chybí recurrenceType`);
          if (!data.isActive) issues.push(`${doc.id}: isActive = false (vypnuté)`);

          const lastGen = data.lastGeneratedDate?.toDate?.() || new Date(data.lastGeneratedDate);
          const lastGenDate = new Date(lastGen);
          lastGenDate.setHours(0, 0, 0, 0);

          if (lastGenDate.getTime() === today.getTime()) {
            issues.push(`${doc.id} (${data.title}): Už byla vygenerována DNES`);
          }
        }

        // Počet pending
        const pendingSnap = await db
          .collection('users')
          .doc(uid)
          .collection('pendingTransactions')
          .get();

        return res.status(200).json({
          success: true,
          today: today.toISOString().split('T')[0],
          recurringCount: recurringSnap.size,
          pendingCount: pendingSnap.size,
          recurringList,
          issues: issues.length > 0 ? issues : ['Žádné problémy!'],
          message: recurringSnap.size === 0
            ? '❌ ŽÁDNÉ OPAKUJÍCÍ SE TRANSAKCE! Vytvoř si jednu.'
            : `✅ Máš ${recurringSnap.size} opakujících se transakcí`
        });
      } catch (err) {
        console.error('❌ DEBUG error:', err);
        return res.status(500).json({ success: false, error: err.message });
      }
    });
  });

// 💚 HEALTH CHECK — Ověření stavu systému
exports.healthCheck = functions
  .region('europe-west1')
  .https.onRequest(async (req, res) => {
    cors(req, res, async () => {
      try {
        const checks = {
          timestamp: new Date().toISOString(),
          services: {}
        };

        // 1️⃣ Firebase Auth
        try {
          await admin.auth().getUser('test-nonexistent-user').catch(() => {});
          checks.services.auth = { status: 'ok' };
        } catch (err) {
          checks.services.auth = { status: 'error', message: err.message };
        }

        // 2️⃣ Firestore
        try {
          const snap = await admin.firestore().collection('users').limit(1).get();
          checks.services.firestore = { status: 'ok', userCount: snap.size };
        } catch (err) {
          checks.services.firestore = { status: 'error', message: err.message };
        }

        // 3️⃣ Cloud Scheduler (generateRecurringTransactions)
        try {
          const scheduler = require('@google-cloud/scheduler');
          // Jen ověříme, že je balíček dostupný
          checks.services.scheduler = { status: 'ok' };
        } catch (err) {
          checks.services.scheduler = { status: 'warning', message: 'Scheduler balíček nedostupný' };
        }

        const allOk = Object.values(checks.services).every(s => s.status === 'ok' || s.status === 'warning');

        return res.status(allOk ? 200 : 503).json({
          healthy: allOk,
          ...checks
        });
      } catch (err) {
        console.error('❌ HEALTH CHECK error:', err);
        return res.status(503).json({
          healthy: false,
          timestamp: new Date().toISOString(),
          error: err.message
        });
      }
    });
  });
