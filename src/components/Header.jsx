import { Moon, Sun, LogOut, User, ShieldCheck, Home } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

export const Header = ({ onAdminClick, showingAdmin }) => {
  const { isDark, setIsDark } = useTheme();
  const { session, logout } = useAuth();

  const handleLogout = () => {
    if (confirm('Opravdu se chceš odhlásit?')) logout();
  };

  return (
    <header className="bg-light-card dark:bg-dark-card border-b border-light-border dark:border-dark-border sticky top-0 z-50 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        {/* Logo + name */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 shrink-0 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
            <span className="text-sm">💰</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-light-text dark:text-dark-text leading-tight truncate">
              Evidence Výdajů
            </h1>
            <p className="text-xs text-light-textMuted dark:text-dark-textMuted hidden sm:block">Spravuj své finance</p>
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 shrink-0">

          {/* Domů — jen pro admina v admin panelu */}
          {session?.isAdmin && showingAdmin && (
            <button
              onClick={onAdminClick}
              className="p-2 rounded-lg bg-light-bg dark:bg-dark-bg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors group"
              aria-label="Zpět na hlavní stránku"
              title="Domů"
            >
              <Home size={18} className="text-light-textMuted dark:text-dark-textMuted group-hover:text-blue-500 transition-colors" />
            </button>
          )}

          {/* Admin badge */}
          {session?.isAdmin && (
            <button
              onClick={onAdminClick}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                showingAdmin
                  ? 'bg-purple-500 text-white'
                  : 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50'
              }`}
            >
              <ShieldCheck size={14} />
              Admin
            </button>
          )}

          {/* User chip */}
          {session && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border">
              <User size={14} className="text-light-textMuted dark:text-dark-textMuted" />
              <span className="text-sm font-medium text-light-text dark:text-dark-text max-w-[80px] truncate">
                {session.username}
              </span>
            </div>
          )}

          {/* Dark mode */}
          <button
            onClick={() => setIsDark(!isDark)}
            className="p-2 rounded-lg bg-light-bg dark:bg-dark-bg hover:bg-light-border dark:hover:bg-dark-border transition-colors"
            aria-label="Přepnout tmavý režim"
          >
            {isDark ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-slate-700 dark:text-slate-300" />}
          </button>

          {/* Logout */}
          {session && (
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg bg-light-bg dark:bg-dark-bg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors group"
              aria-label="Odhlásit se"
            >
              <LogOut size={18} className="text-light-textMuted dark:text-dark-textMuted group-hover:text-red-500 transition-colors" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
