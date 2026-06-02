import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock firebase utils globally
vi.mock('../utils/firebase', () => ({
  auth: {
    currentUser: null,
    onAuthStateChanged: vi.fn((callback) => {
      callback(null);
      return vi.fn();
    }),
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
  },
  db: {},
}));

// Mock firebase auth module
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({
    currentUser: null,
    onAuthStateChanged: vi.fn(),
  })),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

// Mock firebase firestore module
vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn(() => ({})),
  persistentLocalCache: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  onSnapshot: vi.fn((q, callback) => {
    callback({ docs: [], empty: true });
    return vi.fn();
  }),
  addDoc: vi.fn(async () => ({ id: 'test-id' })),
  getDocs: vi.fn(async () => ({ docs: [], empty: true })),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  setDoc: vi.fn(async () => ({})),
  updateDoc: vi.fn(async () => ({})),
  deleteDoc: vi.fn(async () => ({})),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(async () => ({})),
  })),
  increment: vi.fn((val) => val),
}));

// Mock firebase app
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}));
