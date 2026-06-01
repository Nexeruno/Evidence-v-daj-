import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { AuthPage } from './components/auth/AuthPage';
import { AdminPage } from './components/admin/AdminPage';
import { DevOpsPanel } from './components/admin/DevOpsPanel';
import { QuickActionsPanel } from './components/admin/QuickActionsPanel';
import { AIPanel } from './components/admin/AIPanel';
import { AuditAnalyticsPanel } from './components/admin/AuditAnalyticsPanel';
import { FormVydaj } from './components/FormVydaj';
import { FormPrijem } from './components/FormPrijem';
import { FilterBarVydaj, FilterBarPrijem } from './components/FilterBar';
import { SeznamVydaj } from './components/SeznamVydaj';
import { SeznamPrijem } from './components/SeznamPrijem';
import { Dashboard } from './components/Dashboard';
import { useFirestoreSync } from './hooks/useFirestoreSync';
import { aiTracker } from './utils/aiTracker';

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
  const [devopsTab, setDevopsTab] = useState('overview');

  // Napojení Firestore real-time listenerů
  useFirestoreSync();

  // Initialize AI tracker on app load (works even without login)
  useEffect(() => {
    aiTracker.init(session?.uid);
    return () => {
      aiTracker.destroy();
    };
  }, [session?.uid]);

  // Track beforeunload to flush AI data
  useEffect(() => {
    const handleBeforeUnload = () => {
      aiTracker.flushSync();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const handleAdminClick = () => {
    setShowAdmin((v) => !v);
    setActiveTab('dashboard');
  };

  const handleTabChange = (newTab) => {
    aiTracker.trackTabChange(newTab, activeTab);
    setActiveTab(newTab);
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
            <button
              onClick={() => setAdminTab('ai')}
              className={`px-5 py-2 rounded-lg font-medium transition-all text-sm ${
                adminTab === 'ai'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text hover:bg-light-border dark:hover:bg-dark-border'
              }`}
            >
              🤖 AI
            </button>
          </div>

          {adminTab === 'users' ? (
            <AdminPage />
          ) : adminTab === 'devops' ? (
            <div>
              {/* DevOps Sub-tabs */}
              <div className="flex gap-2 mb-4 flex-wrap">
                <button
                  onClick={() => setDevopsTab('overview')}
                  className={`px-4 py-2 rounded-lg font-medium transition-all text-sm ${
                    devopsTab === 'overview'
                      ? 'bg-green-500 text-white shadow-md'
                      : 'bg-light-border dark:bg-dark-border text-light-text dark:text-dark-text hover:bg-light-card dark:hover:bg-dark-card'
                  }`}
                >
                  📊 Přehled
                </button>
                <button
                  onClick={() => setDevopsTab('quickActions')}
                  className={`px-4 py-2 rounded-lg font-medium transition-all text-sm ${
                    devopsTab === 'quickActions'
                      ? 'bg-green-500 text-white shadow-md'
                      : 'bg-light-border dark:bg-dark-border text-light-text dark:text-dark-text hover:bg-light-card dark:hover:bg-dark-card'
                  }`}
                >
                  ⚡ Quick Actions
                </button>
                <button
                  onClick={() => setDevopsTab('auditLog')}
                  className={`px-4 py-2 rounded-lg font-medium transition-all text-sm ${
                    devopsTab === 'auditLog'
                      ? 'bg-green-500 text-white shadow-md'
                      : 'bg-light-border dark:bg-dark-border text-light-text dark:text-dark-text hover:bg-light-card dark:hover:bg-dark-card'
                  }`}
                >
                  📋 Audit Log
                </button>
              </div>

              {/* DevOps Content */}
              {devopsTab === 'overview' && (
                <DevOpsPanel />
              )}
              {devopsTab === 'quickActions' && (
                <QuickActionsPanel
                  onClose={() => setDevopsTab('overview')}
                />
              )}
              {devopsTab === 'auditLog' && (
                <AuditAnalyticsPanel />
              )}
            </div>
          ) : (
            <AIPanel />
          )}
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
              onClick={() => handleTabChange(tab.id)}
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
