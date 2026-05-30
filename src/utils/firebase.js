import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, connectFirestoreEmulator } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// persistentLocalCache nahrazuje deprecated enableIndexedDbPersistence
// Data fungují offline a synchronizují se po obnovení připojení
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache(),
});

// Emulator support pro vývoj (vyžaduje: firebase emulators:start)
// Odkomentuj následující řádky pokud chceš používat lokální emulátor
/*
if (import.meta.env.DEV) {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  } catch (err) {
    // Already connected
  }

  try {
    connectFirestoreEmulator(db, 'localhost', 8080);
  } catch (err) {
    // Already connected
  }

  try {
    const functions = getFunctions(app);
    connectFunctionsEmulator(functions, 'localhost', 5001);
  } catch (err) {
    // Already connected
  }
}
*/
