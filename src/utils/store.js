import { create } from 'zustand';
import {
  collection, deleteDoc, doc, getDocs,
  serverTimestamp, updateDoc, increment, writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import toast from 'react-hot-toast';
import { aiTracker } from './aiTracker';

const getUid = () => auth.currentUser?.uid;

const firestoreWrite = async (fn) => {
  try {
    await fn();
  } catch (err) {
    console.error('Firestore write error:', err);
    toast.error('Chyba při ukládání dat');
    throw err;
  }
};

export const useAppStore = create((set) => ({
  prijmy: [],
  vydaje: [],
  filtryPrijem: { kategorie: 'vse-prijem', mesic: 'vse-mesic' },
  filtrVydaj:   { kategorie: 'vse',        mesic: 'vse-mesic' },

  vydajeReady: false,
  prijmyReady: false,

  setVydaje:  (items) => set({ vydaje: items, vydajeReady: true }),
  setPrijmy:  (items) => set({ prijmy: items, prijmyReady: true }),
  resetStore: ()      => set({ prijmy: [], vydaje: [], vydajeReady: false, prijmyReady: false }),

  // Batch write — add + counter update + AI telemetry jsou atomické
  addVydaj: (data) =>
    firestoreWrite(async () => {
      const uid = getUid();
      if (!uid) return;
      const batch = writeBatch(db);
      const newRef = doc(collection(db, 'users', uid, 'vydaje'));
      batch.set(newRef, { ...data, createdAt: serverTimestamp() });
      batch.update(doc(db, 'users', uid), { vydajeCount: increment(1) });
      // AI Telemetry (bez castka, nazev)
      const transactionRef = doc(collection(db, 'aiTelemetry', uid, 'transactions'));
      batch.set(transactionRef, {
        type: 'vydaj',
        category: data.kategorie,
        datum: data.datum,
        dayOfWeek: new Date(data.datum).getDay(),
        hourOfDay: new Date().getHours(),
        createdAt: serverTimestamp(),
      });
      await batch.commit();
    }),

  removeVydaj: (id) =>
    firestoreWrite(async () => {
      const uid = getUid();
      if (!uid) return;
      const batch = writeBatch(db);
      batch.delete(doc(db, 'users', uid, 'vydaje', id));
      batch.update(doc(db, 'users', uid), { vydajeCount: increment(-1) });
      await batch.commit();
    }),

  addPrijem: (data) =>
    firestoreWrite(async () => {
      const uid = getUid();
      if (!uid) return;
      const batch = writeBatch(db);
      const newRef = doc(collection(db, 'users', uid, 'prijmy'));
      batch.set(newRef, { ...data, createdAt: serverTimestamp() });
      batch.update(doc(db, 'users', uid), { prijmyCount: increment(1) });
      // AI Telemetry (bez castka, nazev)
      const transactionRef = doc(collection(db, 'aiTelemetry', uid, 'transactions'));
      batch.set(transactionRef, {
        type: 'prijem',
        category: data.kategorie,
        datum: data.datum,
        dayOfWeek: new Date(data.datum).getDay(),
        hourOfDay: new Date().getHours(),
        createdAt: serverTimestamp(),
      });
      await batch.commit();
    }),

  removePrijem: (id) =>
    firestoreWrite(async () => {
      const uid = getUid();
      if (!uid) return;
      const batch = writeBatch(db);
      batch.delete(doc(db, 'users', uid, 'prijmy', id));
      batch.update(doc(db, 'users', uid), { prijmyCount: increment(-1) });
      await batch.commit();
    }),

  clearVydaje: () =>
    firestoreWrite(async () => {
      const uid = getUid();
      if (!uid) return;
      const snap = await getDocs(collection(db, 'users', uid, 'vydaje'));
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      batch.update(doc(db, 'users', uid), { vydajeCount: 0 });
      await batch.commit();
    }),

  clearPrijmy: () =>
    firestoreWrite(async () => {
      const uid = getUid();
      if (!uid) return;
      const snap = await getDocs(collection(db, 'users', uid, 'prijmy'));
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      batch.update(doc(db, 'users', uid), { prijmyCount: 0 });
      await batch.commit();
    }),

  setFiltrPrijem: (filtry) =>
    set((state) => ({ filtryPrijem: { ...state.filtryPrijem, ...filtry } })),

  setFiltrVydaj: (filtry) =>
    set((state) => ({ filtrVydaj: { ...state.filtrVydaj, ...filtry } })),
}));
