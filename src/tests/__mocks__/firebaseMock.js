import { vi } from 'vitest';

export const mockAuth = {
  currentUser: null,
  onAuthStateChanged: vi.fn((callback) => {
    callback(null);
    return vi.fn();
  }),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
};

export const mockDb = {};

export const mockAddDoc = vi.fn().mockResolvedValue({ id: 'test-id' });
export const mockGetDocs = vi.fn().mockResolvedValue({ docs: [], empty: true });
export const mockOnSnapshot = vi.fn((q, callback) => {
  callback({ docs: [], empty: true });
  return vi.fn();
});

export const mockCollectionRef = {};
export const mockQuery = {};
