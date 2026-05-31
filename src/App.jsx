import { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { AuthPage } from './components/auth/AuthPage';
import { AdminPage } from './components/admin/AdminPage';
import { DevOpsPanel } from './components/admin/DevOpsPanel';
import { FormVydaj } from './components/FormVydaj';
import { FormPrijem } from './components/FormPrijem';
import { FilterBarVydaj, FilterBarPrijem } from './components/FilterBar';
import { SeznamVydaj } from './components/SeznamVydaj';
import { SeznamPrijem } from './components/SeznamPrijem';
import { Dashboard } from './components/Dashboard';
import { useFirestoreSync } from './hooks/useFirestoreSync';

const TABS = [
  { id: 'dashboard', label: '📊 Přehled' },
  { id: 'vydaje', label: '💸 Výdaje' },
  { id: 'prijmy', label: '💰 Příjmy' },
];

function AppContent() {
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState('users');

  // Napojení Firestore real-time listenerů
  useFirestoreSync();

  const handleAdminClick = () => {
    setShowAdmin((v) => !v);
    setActiveTab('dashboard');
  };

  if (showAdmin && session?.isAdmin) {
    return (
      <>
        <Header onAdminClick={handleAdminClick} showingAdmin={true} />
        <main className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setAdminTab('users')}
              className={`px-5 py-2 rounded-lg font-medium transition-all text-sm ${
                adminTab === 'users'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text hover:bg-light-border dark:hover:bg-dark-border'
              }`}
            >
              👥 Uživatelé
            </button>
            <button
              onClick={() => setAdminTab('devops')}
              className={`px-5 py-2 rounded-lg font-medium transition-all text-sm ${
                adminTab === 'devops'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text hover:bg-light-border dark:hover:bg-dark-border'
              }`}
            >
              🛠️ DevOps
            </button>
          </div>
          {adminTab === 'users' ? <AdminPage /> : <DevOpsPanel />}
        </main>
      </>
    );
  }

  return (
    <>
      <Header onAdminClick={handleAdminClick} showingAdmin={false} />
      <main className="max-w-6xl mx-auto px-4 py-6">
        <nav className="flex gap-2 mb-6 flex-wrap" aria-label="Navigace">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              className={`px-5 py-2 rounded-lg font-medium transition-all text-sm sm:text-base ${
                activeTab === tab.id
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text hover:bg-light-border dark:hover:bg-dark-border'
              }`}
            >
              {tab.label}
            </button>
          ))}
          {/* Mobile admin button */}
          {session?.isAdmin && (
            <button
              onClick={handleAdminClick}
              className="sm:hidden px-5 py-2 rounded-lg font-medium transition-all text-sm bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
            >
              ⚙️ Admin
            </button>
          )}
        </nav>

        {activeTab === 'dashboard' && (
          <div>
            <h2 className="text-2xl font-bold mb-5">Přehled financí</h2>
            <Dashboard />
          </div>
        )}

        {activeTab === 'vydaje' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1"><FormVydaj /></div>
            <div className="lg:col-span-2 space-y-6">
              <FilterBarVydaj />
              <SeznamVydaj />
            </div>
          </div>
        )}

        {activeTab === 'prijmy' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1"><FormPrijem /></div>
            <div className="lg:col-span-2 space-y-6">
              <FilterBarPrijem />
              <SeznamPrijem />
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function AppRouter() {
  const { session } = useAuth();

  // Čekáme na ověření Firebase Auth (session === undefined = loading)
  if (session === undefined) {
    return (
      <div className="min-h-screen bg-light-bg dark:bg-dark-bg flex items-center justify-center">
        <div className="text-light-textMuted dark:text-dark-textMuted">Načítání...</div>
      </div>
    );
  }

  if (!session) return <AuthPage />;
  return <AppContent />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRouter />
        <Toaster position="bottom-center" />
      </AuthProvider>
    </ThemeProvider>
  );
}
