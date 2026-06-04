import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyA7lrVXLwJjMIYocOg4hWRSTIzBo7M3YtE',
  authDomain: 'evidence-vydaju.firebaseapp.com',
  projectId: 'evidence-vydaju',
  storageBucket: 'evidence-vydaju.firebasestorage.app',
  messagingSenderId: '153586307551',
  appId: '1:153586307551:web:814a28a53285f377c8b46a',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)

// Emulator setup (dev only - optional)
const isDev = process.env.NODE_ENV === 'development'
const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost'

// Try to connect to emulator, but don't fail if not available
if (isDev && isLocalhost) {
  try {
    // First check if emulator is available
    fetch('http://localhost:9099/__/health', { method: 'HEAD' })
      .then(() => {
        // Emulator is available, connect to it
        connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
        connectFirestoreEmulator(db, 'localhost', 8080)
        console.log('✅ Connected to Firebase Emulator')
      })
      .catch(() => {
        // Emulator not available, use real Firebase
        console.log('ℹ️ Firebase Emulator not available, using real Firebase')
      })
  } catch (err) {
    // Silently fail, use real Firebase
    console.log('ℹ️ Using real Firebase (emulator unavailable)')
  }
}
