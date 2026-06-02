import { create } from 'zustand';
import {
  collection, doc, increment, writeBatch, serverTimestamp, getDocs,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import toast from 'react-hot-toast';

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
      // AI Telemetry - pro učení
      const transactionRef = doc(collection(db, 'aiTelemetry', uid, 'transactions'));
      batch.set(transactionRef, {
        type: 'vydaj',
        castka: Number(data.castka || 0),
        nazev: (data.nazev || '').substring(0, 100),
        kategorie: data.kategorie,
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
      // AI Telemetry - pro učení
      const transactionRef = doc(collection(db, 'aiTelemetry', uid, 'transactions'));
      batch.set(transactionRef, {
        type: 'prijem',
        castka: Number(data.castka || 0),
        nazev: (data.nazev || '').substring(0, 100),
        kategorie: data.kategorie,
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

// Activity tracker - comprehensive user activity tracking with idle detection
let activityTimeout;
let tabVisibleTimeout;
let idleCheckInterval;
let lastSessionStart;
let lastTabVisibility = document.hidden;
let lastActivityTime = Date.now(); // Track actual user interaction time

export const initActivityTracker = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  // Idle thresholds
  const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes = device likely locked/user gone
  const ACTIVITY_UPDATE_INTERVAL = 5000; // Update every 5s

  // Update activity timestamp in Firestore
  const updateActivity = async () => {
    try {
      if (!auth.currentUser?.uid) return;
      const { updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        lastActivity: serverTimestamp(),
      });
    } catch (err) {
      // Fail silently
    }
  };

  // Check if user is idle (no activity for X minutes)
  const checkIdleStatus = async () => {
    try {
      const currentUid = auth.currentUser?.uid;
      if (!currentUid) return;

      const timeSinceLastActivity = Date.now() - lastActivityTime;
      const isTabHidden = document.hidden;

      if (timeSinceLastActivity > IDLE_TIMEOUT_MS) {
        // User hasn't interacted for 15+ minutes
        // Device likely locked or user went away
        const { updateDoc, serverTimestamp } = await import('firebase/firestore');
        await updateDoc(doc(db, 'users', currentUid), {
          deviceStatus: 'idle', // Device locked or screen off
          lastTabHidden: serverTimestamp(),
          isOnline: false,
        });
      } else if (!isTabHidden && timeSinceLastActivity < IDLE_TIMEOUT_MS) {
        // Tab is visible and recent activity exists → mark as online
        const { updateDoc, serverTimestamp } = await import('firebase/firestore');
        await updateDoc(doc(db, 'users', currentUid), {
          deviceStatus: 'active',
          isOnline: true,
        });
      }
    } catch (err) {
      // Fail silently
    }
  };

  // Record user interaction (click, keypress, scroll)
  const onUserInteraction = () => {
    lastActivityTime = Date.now(); // Update interaction timestamp

    clearTimeout(activityTimeout);
    activityTimeout = setTimeout(updateActivity, ACTIVITY_UPDATE_INTERVAL);

    // If was idle, mark as active again
    (async () => {
      try {
        const currentUid = auth.currentUser?.uid;
        if (!currentUid) return;
        const { updateDoc, serverTimestamp } = await import('firebase/firestore');
        await updateDoc(doc(db, 'users', currentUid), {
          deviceStatus: 'active',
          isOnline: true,
          lastActivity: serverTimestamp(),
        });
      } catch (err) {
        // Fail silently
      }
    })();
  };

  // Handle tab visibility changes (tab switch or display off)
  const onVisibilityChange = async () => {
    try {
      const currentUid = auth.currentUser?.uid;
      if (!currentUid) return;

      const isNowVisible = !document.hidden;
      const { updateDoc, serverTimestamp } = await import('firebase/firestore');

      if (isNowVisible && !lastTabVisibility) {
        // Tab became visible - user returned
        lastActivityTime = Date.now();
        lastSessionStart = new Date();
        await updateDoc(doc(db, 'users', currentUid), {
          lastActivity: serverTimestamp(),
          lastSessionStart: serverTimestamp(),
          isOnline: true,
          deviceStatus: 'active',
        });
      } else if (!isNowVisible && lastTabVisibility) {
        // Tab became hidden - could be phone locked, display off, or switched app
        await updateDoc(doc(db, 'users', currentUid), {
          lastTabHidden: serverTimestamp(),
          isOnline: false,
          deviceStatus: 'tab-hidden',
        });
      }

      lastTabVisibility = isNowVisible;
    } catch (err) {
      // Fail silently
    }
  };

  // Handle page/app being paused (mobile)
  const onPageVisibilityPause = async () => {
    try {
      const currentUid = auth.currentUser?.uid;
      if (!currentUid) return;

      const { updateDoc, serverTimestamp } = await import('firebase/firestore');
      await updateDoc(doc(db, 'users', currentUid), {
        lastPageHidden: serverTimestamp(),
        isOnline: false,
        deviceStatus: 'paused',
      });
    } catch (err) {
      // Fail silently
    }
  };

  // Track: user interactions (reset idle timer)
  document.addEventListener('click', onUserInteraction, { passive: true });
  document.addEventListener('keydown', onUserInteraction, { passive: true });
  document.addEventListener('scroll', onUserInteraction, { passive: true });
  document.addEventListener('touchstart', onUserInteraction, { passive: true });
  document.addEventListener('touchmove', onUserInteraction, { passive: true });

  // Track: tab visibility & screen on/off
  document.addEventListener('visibilitychange', onVisibilityChange, { passive: true });

  // Track: page being paused (mobile apps)
  document.addEventListener('pause', onPageVisibilityPause, { passive: true });

  // Periodic idle check (every 1 minute)
  idleCheckInterval = setInterval(checkIdleStatus, 60 * 1000);

  // Set initial session start
  (async () => {
    try {
      const currentUid = auth.currentUser?.uid;
      if (!currentUid) return;
      const { updateDoc, serverTimestamp } = await import('firebase/firestore');
      lastSessionStart = new Date();
      lastActivityTime = Date.now();
      await updateDoc(doc(db, 'users', currentUid), {
        lastActivity: serverTimestamp(),
        lastSessionStart: serverTimestamp(),
        isOnline: true,
        deviceStatus: 'active',
      });
    } catch (err) {
      // Fail silently
    }
  })();

  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    document.removeEventListener('click', onUserInteraction);
    document.removeEventListener('keydown', onUserInteraction);
    document.removeEventListener('scroll', onUserInteraction);
    document.removeEventListener('touchstart', onUserInteraction);
    document.removeEventListener('touchmove', onUserInteraction);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    document.removeEventListener('pause', onPageVisibilityPause);
    clearInterval(idleCheckInterval);
  });
};
