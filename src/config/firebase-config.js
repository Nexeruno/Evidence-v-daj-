// Firebase web configuration.
// Values are injected at build time from environment variables (see .env.local.example).
// The Firebase web API key is a public client identifier — security is enforced by
// Firestore security rules, not by keeping this value secret.

// Env vars (set at build time) take precedence; the fallbacks are the project's
// public Firebase web config so the deployed site works even when CI secrets are
// not configured. These are public client identifiers, not secrets.
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyA7lrVXLwJjMIYocOg4hWRSTIzBo7M3YtE',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'evidence-vydaju.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'evidence-vydaju',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'evidence-vydaju.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '153586307551',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:153586307551:web:814a28a53285f377c8b46a',
};

export const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
