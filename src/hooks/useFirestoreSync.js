import { useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../utils/firebase';
import { useAppStore } from '../utils/store';
import { useAuth } from '../context/AuthContext';

// Firestore Timestamp není JSON-serializovatelný — převede ho na ISO string
const toSerializable = (data) => ({
  ...data,
  createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt ?? null,
});

const cacheKey = (uid, typ) => `evd-${typ}-${uid}`;

const loadCache = (uid, typ) => {
  try {
    const raw = sessionStorage.getItem(cacheKey(uid, typ));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const saveCache = (uid, typ, items) => {
  try {
    sessionStorage.setItem(cacheKey(uid, typ), JSON.stringify(items));
  } catch {
    // sessionStorage může být plný nebo zakázaný
  }
};

export const clearSessionCache = (uid) => {
  try {
    sessionStorage.removeItem(cacheKey(uid, 'vydaje'));
    sessionStorage.removeItem(cacheKey(uid, 'prijmy'));
  } catch {}
};

export const useFirestoreSync = () => {
  const { session } = useAuth();

  useEffect(() => {
    if (!session?.uid) return;
    const { setVydaje, setPrijmy } = useAppStore.getState();
    const uid = session.uid;

    // Okamžitě načti z cache — UI se zobrazí bez čekání na Firestore
    const cachedVydaje = loadCache(uid, 'vydaje');
    const cachedPrijmy = loadCache(uid, 'prijmy');
    if (cachedVydaje) setVydaje(cachedVydaje);
    if (cachedPrijmy) setPrijmy(cachedPrijmy);

    const handleError = (err, label) => {
      console.error(`${label} listener error:`, err);
      if (err.code === 'permission-denied') {
        toast.error('Přístup odepřen. Zkuste se znovu přihlásit.');
      }
    };

    const unsubVydaje = onSnapshot(
      query(collection(db, 'users', uid, 'vydaje'), orderBy('createdAt', 'desc')),
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...toSerializable(d.data()) }));
        setVydaje(items);
        saveCache(uid, 'vydaje', items);
      },
      (err) => handleError(err, 'Vydaje')
    );

    const unsubPrijmy = onSnapshot(
      query(collection(db, 'users', uid, 'prijmy'), orderBy('createdAt', 'desc')),
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...toSerializable(d.data()) }));
        setPrijmy(items);
        saveCache(uid, 'prijmy', items);
      },
      (err) => handleError(err, 'Prijmy')
    );

    return () => {
      unsubVydaje();
      unsubPrijmy();
    };
  }, [session?.uid]);
};
