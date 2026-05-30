import { useState } from 'react';
import { Eye, EyeOff, Moon, Sun, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

export const AuthPage = () => {
  const { login, register, resetPassword } = useAuth();
  const { isDark, setIsDark } = useTheme();

  // mode: 'login' | 'register' | 'forgot'
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const switchMode = (m) => {
    setMode(m);
    setError('');
    setSuccess('');
    setPassword('');
    setPasswordConfirm('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else if (mode === 'register') {
        await register(username, email, password, passwordConfirm);
      } else if (mode === 'forgot') {
        await resetPassword(email);
        setSuccess('Odkaz pro reset hesla byl odeslán na ' + email.trim() + '. Zkontroluj svůj email.');
        setEmail('');
      }
    } catch (err) {
      // Pro reset hesla - pokud byl error, ale error handling v AuthContext
      // vrátil error, pokud se email skutečně neposlal
      if (mode === 'forgot') {
        // Ukaž error jen pokud to není "invalid-argument" (to je jen interní)
        if (err.code !== 'invalid-argument') {
          const msg = {
            'auth/invalid-email': 'Neplatný formát emailu',
            'auth/user-not-found': 'Účet neexistuje',
            'auth/network-request-failed': 'Chyba připojení k internetu',
          }[err.code] || err.message;
          setError(msg);
        }
        // Pro reset hesla - pokud se error vyskytne ale email se poslal, neukazi error
        // Prostě tiše skončíme
      } else {
        const msg = {
          'auth/invalid-email': 'Neplatný formát emailu',
          'auth/user-not-found': 'Účet neexistuje',
          'auth/wrong-password': 'Špatné heslo',
          'auth/invalid-credential': 'Nesprávné přihlašovací údaje',
          'auth/email-already-in-use': 'Tento email je již registrován',
          'auth/too-many-requests': 'Příliš mnoho pokusů. Zkuste to za chvíli',
          'auth/network-request-failed': 'Chyba připojení k internetu',
        }[err.code] || err.message;
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg flex flex-col items-center justify-center px-4 py-8">
      {/* Dark mode toggle */}
      <div className="absolute top-4 right-4">
        <button
          onClick={() => setIsDark(!isDark)}
          className="p-2 rounded-lg bg-light-card dark:bg-dark-card border border-light-border dark:border-dark-border hover:bg-light-border dark:hover:bg-dark-border transition-colors"
          aria-label="Přepnout tmavý režim"
        >
          {isDark ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-slate-700" />}
        </button>
      </div>

      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg mb-4">
          <span className="text-3xl">💰</span>
        </div>
        <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">Evidence Výdajů</h1>
        <p className="text-sm text-light-textMuted dark:text-dark-textMuted mt-1">Spravuj své finance</p>
      </div>

      <div className="w-full max-w-sm">
        <div className="card">
          {/* Tab switcher — jen pro login/register */}
          {mode !== 'forgot' && (
            <div className="flex mb-6 bg-light-bg dark:bg-dark-bg rounded-lg p-1">
              {['login', 'register'].map((m) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                    mode === m
                      ? 'bg-white dark:bg-dark-card text-light-text dark:text-dark-text shadow-sm'
                      : 'text-light-textMuted dark:text-dark-textMuted hover:text-light-text dark:hover:text-dark-text'
                  }`}
                >
                  {m === 'login' ? 'Přihlásit se' : 'Registrovat se'}
                </button>
              ))}
            </div>
          )}

          {/* Forgot password header */}
          {mode === 'forgot' && (
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => switchMode('login')}
                className="p-1.5 rounded-lg hover:bg-light-bg dark:hover:bg-dark-bg transition-colors"
                aria-label="Zpět"
              >
                <ArrowLeft size={18} className="text-light-textMuted dark:text-dark-textMuted" />
              </button>
              <h2 className="font-semibold text-light-text dark:text-dark-text">Zapomenuté heslo</h2>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username — jen při registraci */}
            {mode === 'register' && (
              <div>
                <label className="text-sm font-medium text-light-textMuted dark:text-dark-textMuted mb-1 block">
                  Uživatelské jméno
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="3–20 znaků, a–z, 0–9, _"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={20}
                  autoComplete="username"
                />
              </div>
            )}

            {/* Email nebo username */}
            <div>
              <label className="text-sm font-medium text-light-textMuted dark:text-dark-textMuted mb-1 block">
                {mode === 'login' ? 'Email nebo uživatelské jméno' : 'Email'}
              </label>
              <input
                type={mode === 'login' ? 'text' : 'email'}
                className="input-field"
                placeholder={mode === 'login' ? 'vas@email.cz nebo username' : 'vas@email.cz'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete={mode === 'login' ? 'username' : 'email'}
              />
              {mode === 'forgot' && (
                <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-1">
                  Zašleme ti odkaz pro vytvoření nového hesla.
                </p>
              )}
            </div>

            {/* Heslo — skryto u forgot */}
            {mode !== 'forgot' && (
              <div>
                <label className="text-sm font-medium text-light-textMuted dark:text-dark-textMuted mb-1 block">
                  Heslo
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="input-field pr-10"
                    placeholder={mode === 'register' ? 'Min. 6 znaků' : 'Vaše heslo'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-light-textMuted dark:text-dark-textMuted hover:text-light-text dark:hover:text-dark-text transition-colors"
                    aria-label="Zobrazit/skrýt heslo"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            {/* Potvrdit heslo — jen registrace */}
            {mode === 'register' && (
              <div>
                <label className="text-sm font-medium text-light-textMuted dark:text-dark-textMuted mb-1 block">
                  Potvrdit heslo
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input-field"
                  placeholder="Zopakujte heslo"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 text-sm text-green-700 dark:text-green-400">
                {success}
              </div>
            )}

            {/* Submit */}
            {!success && (
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading
                  ? 'Odesílám...'
                  : mode === 'login'
                  ? 'Přihlásit se'
                  : mode === 'register'
                  ? 'Vytvořit účet'
                  : 'Odeslat odkaz'}
              </button>
            )}

            {success && (
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="btn-secondary w-full"
              >
                Zpět na přihlášení
              </button>
            )}
          </form>

          {/* Footer links */}
          {mode === 'login' && (
            <div className="mt-4 space-y-2 text-center text-sm">
              <p className="text-light-textMuted dark:text-dark-textMuted">
                Nemáš účet?{' '}
                <button onClick={() => switchMode('register')} className="text-blue-500 hover:underline font-medium">
                  Registruj se
                </button>
              </p>
              <p>
                <button
                  onClick={() => switchMode('forgot')}
                  className="text-light-textMuted dark:text-dark-textMuted hover:text-blue-500 dark:hover:text-blue-400 transition-colors text-xs"
                >
                  Zapomenuté heslo?
                </button>
              </p>
            </div>
          )}

          {mode === 'register' && (
            <p className="text-center text-sm text-light-textMuted dark:text-dark-textMuted mt-4">
              Už máš účet?{' '}
              <button onClick={() => switchMode('login')} className="text-blue-500 hover:underline font-medium">
                Přihlaš se
              </button>
            </p>
          )}
        </div>

        {mode === 'register' && (
          <p className="text-xs text-center text-light-textMuted dark:text-dark-textMuted mt-4 px-2">
            Data jsou uložena v cloudu (Firebase). Heslo je šifrované.
          </p>
        )}
      </div>
    </div>
  );
};
