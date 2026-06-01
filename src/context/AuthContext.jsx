import { createContext, useContext, useEffect, useState } from 'react';
import { useAppStore } from '../utils/store';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  doc, setDoc, getDoc, getDocs, updateDoc,
  collection, query, where, serverTimestamp, deleteDoc, increment,
} from 'firebase/firestore';
import { auth, db } from '../utils/firebase';
import { firebaseConfig, adminEmail as ADMIN_EMAIL } from '../config/firebase-config';
import { clearSessionCache } from '../hooks/useFirestoreSync';
import { aiTracker } from '../utils/aiTracker';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(undefined); // undefined = loading

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setSession(null);
        return;
      }
      try {
        const profileSnap = await getDoc(doc(db, 'users', user.uid));
        const profile = profileSnap.data() || {};

        // Migrace: doplní usernameLower a vytvoří usernames dokument pro starší účty
        if (profile.username) {
          const uLower = profile.username.toLowerCase();
          if (!profile.usernameLower) {
            updateDoc(doc(db, 'users', user.uid), { usernameLower: uLower }).catch(() => {});
          }
          // Vytvoří veřejný username→email mapping pokud chybí
          getDoc(doc(db, 'usernames', uLower)).then((snap) => {
            if (!snap.exists()) {
              setDoc(doc(db, 'usernames', uLower), { email: user.email, uid: user.uid }).catch(() => {});
            }
          }).catch(() => {});
        }

        const newSession = {
          uid: user.uid,
          email: user.email,
          username: profile.username || user.email,
          role: profile.role || 'user',
          isAdmin: user.email === ADMIN_EMAIL || profile.role === 'admin',
        };
        setSession(newSession);
        aiTracker.init(user.uid);
      } catch {
        // Offline nebo chyba Firestore — základní session
        const offlineSession = {
          uid: user.uid,
          email: user.email,
          username: user.email,
          role: 'user',
          isAdmin: user.email === ADMIN_EMAIL,
        };
        setSession(offlineSession);
        aiTracker.init(user.uid);
      }
    });
    return unsub;
  }, []);

  const login = async (emailOrUsername, password) => {
    const input = emailOrUsername.trim().toLowerCase();
    let email = input;

    // Pokud vstup neobsahuje @, jde o uživatelské jméno
    // Lookup přes veřejnou kolekci usernames (funguje i bez přihlášení)
    if (!input.includes('@')) {
      const usernameDoc = await getDoc(doc(db, 'usernames', input));
      if (!usernameDoc.exists()) throw new Error('Uživatel s tímto jménem neexistuje');
      email = usernameDoc.data().email;
    }

    const cred = await signInWithEmailAndPassword(auth, email, password);

    // Track login: lastLogin + loginCount
    updateDoc(doc(db, 'users', cred.user.uid), {
      lastLogin: serverTimestamp(),
      loginCount: increment(1),
    }).catch(() => {});
  };

  const register = async (username, email, password, passwordConfirm) => {
    const trimmedUser = username.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const usernameLower = trimmedUser.toLowerCase();

    if (trimmedUser.length < 3) throw new Error('Uživatelské jméno musí mít alespoň 3 znaky');
    if (trimmedUser.length > 20) throw new Error('Uživatelské jméno může mít max. 20 znaků');
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUser))
      throw new Error('Jméno může obsahovat jen písmena, číslice a _');
    if (password.length < 6) throw new Error('Heslo musí mít alespoň 6 znaků');
    if (password !== passwordConfirm) throw new Error('Hesla se neshodují');

    // Kontrola unikátnosti jména — getDoc místo query (O(1), funguje bez auth)
    const usernameDoc = await getDoc(doc(db, 'usernames', usernameLower));
    if (usernameDoc.exists()) throw new Error('Toto uživatelské jméno je již obsazeno');

    // Vytvoř Firebase Auth účet
    const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);

    // Vytvoř Firestore profil + veřejný username mapping
    // Pokud selže, rollback: smaž Auth účet
    try {
      await setDoc(doc(db, 'users', cred.user.uid), {
        username: trimmedUser,
        usernameLower,
        email: trimmedEmail,
        role: trimmedEmail === ADMIN_EMAIL ? 'admin' : 'user',
        vydajeCount: 0,
        prijmyCount: 0,
        createdAt: serverTimestamp(),
      });
      // Veřejný mapping username → email (pro login bez auth)
      await setDoc(doc(db, 'usernames', usernameLower), {
        email: trimmedEmail,
        uid: cred.user.uid,
      });
    } catch {
      await cred.user.delete().catch(() => {});
      await deleteDoc(doc(db, 'usernames', usernameLower)).catch(() => {});
      throw new Error('Chyba při vytváření profilu. Zkuste to prosím znovu.');
    }
  };

  const resetPassword = async (email) => {
    const trimmedEmail = email.trim().toLowerCase();
    const url = `https://europe-west1-${firebaseConfig.projectId}.cloudfunctions.net/posliResetHesla`;

    try {
      console.log('Volám posliResetHesla Cloud Function...');
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      const data = await response.json();

      // Pokud se email poslal (ok: true), považuj to za úspěch i když je HTTP error
      if (data.ok === true || response.status === 200) {
        console.log('✓ Reset hesla úspěšně odeslán');
        return;
      }

      // Jinak vrať error
      throw new Error(data.error || 'Chyba při odesílání resetů hesla');
    } catch (err) {
      console.error('resetPassword error:', err);
      throw err;
    }
  };

  const logout = async () => {
    const uid = auth.currentUser?.uid;
    if (uid) {
      clearSessionCache(uid);
      await aiTracker.flush();
    }
    useAppStore.getState().resetStore();
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ session, login, register, logout, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
