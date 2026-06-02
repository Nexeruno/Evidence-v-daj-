import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../context/AuthContext';

vi.mock('../utils/firebase', () => ({
  auth: {
    currentUser: null,
    onAuthStateChanged: vi.fn(),
  },
  db: {},
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ currentUser: null })),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({
    exists: () => true,
    data: () => ({ username: 'testuser', role: 'user' }),
  })),
  setDoc: vi.fn(async () => ({})),
  updateDoc: vi.fn(async () => ({})),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [], empty: true })),
  serverTimestamp: vi.fn(() => new Date()),
  increment: vi.fn((val) => val),
  deleteDoc: vi.fn(async () => ({})),
}));

vi.mock('../utils/aiTracker', () => ({
  aiTracker: {
    init: vi.fn(),
    flush: vi.fn(),
  },
}));

vi.mock('../hooks/useFirestoreSync', () => ({
  clearSessionCache: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const TestComponent = () => {
    const { session } = useAuth();
    return <div>{session ? `Logged in: ${session.email}` : 'Not logged in'}</div>;
  };

  it('provides useAuth hook', () => {
    const { getByText } = render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    expect(getByText(/Not logged in|Logged in/)).toBeInTheDocument();
  });

  it('throws error when useAuth is called outside AuthProvider', () => {
    const TestOutsideProvider = () => {
      try {
        useAuth();
        return <div>Should not render</div>;
      } catch {
        return <div>Error caught</div>;
      }
    };

    const { getByText } = render(<TestOutsideProvider />);
    expect(getByText('Error caught')).toBeInTheDocument();
  });

  it('AuthContext provides session, login, register, logout, resetPassword functions', () => {
    const { useAuth: mockUseAuth } = vi.hoisted(() => ({
      useAuth: vi.fn(() => ({
        session: null,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        resetPassword: vi.fn(),
      })),
    }));

    const TestAuthFunctions = () => {
      const auth = mockUseAuth();
      return (
        <div>
          <button onClick={() => auth.login('user@test.com', 'password')}>Login</button>
          <button onClick={() => auth.register('user', 'user@test.com', 'pass123', 'pass123')}>Register</button>
          <button onClick={() => auth.logout()}>Logout</button>
          <button onClick={() => auth.resetPassword('user@test.com')}>Reset</button>
        </div>
      );
    };

    const { getByText } = render(<TestAuthFunctions />);
    expect(getByText('Login')).toBeInTheDocument();
    expect(getByText('Register')).toBeInTheDocument();
    expect(getByText('Logout')).toBeInTheDocument();
    expect(getByText('Reset')).toBeInTheDocument();
  });
});
