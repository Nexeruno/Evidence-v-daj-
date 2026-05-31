import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../../utils/firebase';
import { firebaseConfig } from '../../config/firebase-config';
import { useAuth } from '../../context/AuthContext';
import { formatDatum } from '../../utils/formatters';
import { Server, AlertTriangle, CheckCircle, XCircle, RefreshCw, Zap, Users, Activity } from 'lucide-react';
import toast from 'react-hot-toast';

export const DevOpsPanel = () => {
  const { session } = useAuth();
  const [health, setHealth] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState({ health: true, metrics: false, users: true });
  const [actionResults, setActionResults] = useState({});

  // Načti health (auto 30s)
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch(
          `https://europe-west1-${firebaseConfig.projectId}.cloudfunctions.net/healthCheck`
        );
        const data = await res.json();
        setHealth(data);
      } catch (err) {
        console.error('Health check error:', err);
        setHealth({ healthy: false, error: err.message });
      } finally {
        setLoading((prev) => ({ ...prev, health: false }));
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Načti uživatele (jednou)
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
        setUsers(
          snap.docs.map((d) => ({
            uid: d.id,
            ...d.data(),
            createdAt: d.data().createdAt?.toDate?.()?.toISOString?.() || null,
            lastLogin: d.data().lastLogin?.toDate?.()?.toISOString?.() || null,
          }))
        );
      } catch (err) {
        console.error('Users fetch error:', err);
      } finally {
        setLoading((prev) => ({ ...prev, users: false }));
      }
    };

    fetchUsers();
  }, []);

  const fetchMetrics = async () => {
    setLoading((prev) => ({ ...prev, metrics: true }));
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Nemáš token');

      const res = await fetch(
        `https://europe-west1-${firebaseConfig.projectId}.cloudfunctions.net/metrics`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMetrics(data);
      toast.success('Metriky načteny');
    } catch (err) {
      console.error('Metrics error:', err);
      toast.error('Chyba při načítání metrik');
    } finally {
      setLoading((prev) => ({ ...prev, metrics: false }));
    }
  };

  const callCloudFunction = async (functionName) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Nemáš token');

      setActionResults((prev) => ({ ...prev, [functionName]: { loading: true } }));

      const res = await fetch(
        `https://europe-west1-${firebaseConfig.projectId}.cloudfunctions.net/${functionName}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({}),
        }
      );

      const data = await res.json();
      setActionResults((prev) => ({ ...prev, [functionName]: data }));

      if (res.ok) {
        toast.success(`${functionName} vykonán`);
      } else {
        toast.error(`Chyba: ${data.error || 'neznámá chyba'}`);
      }
    } catch (err) {
      console.error(`${functionName} error:`, err);
      setActionResults((prev) => ({ ...prev, [functionName]: { error: err.message } }));
      toast.error(`Chyba: ${err.message}`);
    }
  };

  // Vypočty pro aktivitu uwhitney
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const activeUsersCount = users.filter(
    (u) => u.lastLogin && new Date(u.lastLogin) >= sevenDaysAgo
  ).length;

  const newUsersCount = users.filter(
    (u) => u.createdAt && new Date(u.createdAt) >= sevenDaysAgo
  ).length;

  const blockedCount = users.filter((u) => u.disabled).length;
  const topUser = users.reduce(
    (max, u) => (u.loginCount > (max?.loginCount || 0) ? u : max),
    null
  );
  const avgLogins = users.length ? (users.reduce((s, u) => s + (u.loginCount || 0), 0) / users.length).toFixed(1) : 0;

  const renderStatusBadge = (status) => {
    const isOk = status?.status === 'ok';
    return (
      <div className="flex items-center gap-2">
        {isOk ? (
          <CheckCircle size={16} className="text-green-600" />
        ) : (
          <XCircle size={16} className="text-red-600" />
        )}
        <span className={isOk ? 'text-green-600' : 'text-red-600'}>
          {isOk ? 'OK' : 'ERROR'}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* SEKCE A: Health Check */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Server size={20} /> System Health
          </h3>
          <button
            onClick={() => setLoading((prev) => ({ ...prev, health: true }))}
            className="p-2 hover:bg-light-border dark:hover:bg-dark-border rounded transition"
            title="Zkontrolovat znovu"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        {loading.health ? (
          <div className="text-light-textMuted dark:text-dark-textMuted">Načítám...</div>
        ) : health ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-light-border dark:bg-dark-border rounded">
              <div className="text-sm text-light-textMuted dark:text-dark-textMuted mb-2">
                Firebase Auth
              </div>
              {renderStatusBadge(health.services?.auth)}
            </div>
            <div className="p-3 bg-light-border dark:bg-dark-border rounded">
              <div className="text-sm text-light-textMuted dark:text-dark-textMuted mb-2">
                Firestore
              </div>
              {renderStatusBadge(health.services?.firestore)}
            </div>
          </div>
        ) : null}

        <div className="text-xs text-light-textMuted dark:text-dark-textMuted mt-3">
          {health?.timestamp && `Poslední kontrola: ${new Date(health.timestamp).toLocaleTimeString('cs-CZ')}`}
        </div>
      </div>

      {/* SEKCE B: Live Metriky */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Activity size={20} /> Live Metriky
          </h3>
          <button
            onClick={fetchMetrics}
            disabled={loading.metrics}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-60 transition"
          >
            {loading.metrics ? 'Načítám...' : 'Načíst metriky'}
          </button>
        </div>

        {metrics ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="p-3 bg-light-border dark:bg-dark-border rounded">
              <div className="text-sm text-light-textMuted dark:text-dark-textMuted">Uživatelé</div>
              <div className="text-2xl font-bold">{metrics.metrics?.users?.total || 0}</div>
            </div>
            <div className="p-3 bg-light-border dark:bg-dark-border rounded">
              <div className="text-sm text-light-textMuted dark:text-dark-textMuted">Transakce</div>
              <div className="text-2xl font-bold">{metrics.metrics?.transactions?.total || 0}</div>
            </div>
            <div className="p-3 bg-light-border dark:bg-dark-border rounded">
              <div className="text-sm text-light-textMuted dark:text-dark-textMuted">Čekající</div>
              <div className="text-2xl font-bold">{metrics.metrics?.transactions?.pending || 0}</div>
              <div className="text-xs text-light-textMuted dark:text-dark-textMuted mt-1">
                Vydaj: {metrics.metrics?.pending?.byType?.vydaj || 0} | Příjem:{' '}
                {metrics.metrics?.pending?.byType?.prijem || 0}
              </div>
            </div>
            <div className="p-3 bg-light-border dark:bg-dark-border rounded">
              <div className="text-sm text-light-textMuted dark:text-dark-textMuted">Opakované</div>
              <div className="text-2xl font-bold">{metrics.metrics?.transactions?.recurring || 0}</div>
              <div className="text-xs text-light-textMuted dark:text-dark-textMuted mt-1">
                Aktivní: {metrics.metrics?.recurring?.active || 0}
              </div>
            </div>
            <div className="p-3 bg-light-border dark:bg-dark-border rounded">
              <div className="text-sm text-light-textMuted dark:text-dark-textMuted">Response Time</div>
              <div className="text-2xl font-bold">{metrics.performance?.responseTimeMs || 0} ms</div>
            </div>
          </div>
        ) : (
          <div className="text-light-textMuted dark:text-dark-textMuted">Klikni "Načíst metriky"</div>
        )}
      </div>

      {/* SEKCE C: Aktivita Uživatelů */}
      <div className="card">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Users size={20} /> Aktivita Uživatelů
        </h3>

        {loading.users ? (
          <div className="text-light-textMuted dark:text-dark-textMuted">Načítám...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
              <div className="p-3 bg-light-border dark:bg-dark-border rounded">
                <div className="text-sm text-light-textMuted dark:text-dark-textMuted">Celkem</div>
                <div className="text-2xl font-bold">{users.length}</div>
              </div>
              <div className="p-3 bg-light-border dark:bg-dark-border rounded">
                <div className="text-sm text-light-textMuted dark:text-dark-textMuted">Aktivní (7d)</div>
                <div className="text-2xl font-bold">{activeUsersCount}</div>
              </div>
              <div className="p-3 bg-light-border dark:bg-dark-border rounded">
                <div className="text-sm text-light-textMuted dark:text-dark-textMuted">Nový (7d)</div>
                <div className="text-2xl font-bold">{newUsersCount}</div>
              </div>
              <div className="p-3 bg-light-border dark:bg-dark-border rounded">
                <div className="text-sm text-light-textMuted dark:text-dark-textMuted">Zablokovaní</div>
                <div className="text-2xl font-bold text-red-600">{blockedCount}</div>
              </div>
              <div className="p-3 bg-light-border dark:bg-dark-border rounded">
                <div className="text-sm text-light-textMuted dark:text-dark-textMuted">Průměr loginů</div>
                <div className="text-2xl font-bold">{avgLogins}</div>
              </div>
            </div>

            {topUser && (
              <div className="p-3 bg-light-border dark:bg-dark-border rounded mb-6">
                <div className="text-sm text-light-textMuted dark:text-dark-textMuted">Nejaktivnější</div>
                <div className="font-medium">{topUser.username}</div>
                <div className="text-xs text-light-textMuted dark:text-dark-textMuted">
                  {topUser.loginCount} přihlášení
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-light-border dark:border-dark-border">
                    <th className="text-left pb-2 text-light-textMuted dark:text-dark-textMuted">
                      Jméno
                    </th>
                    <th className="text-right pb-2 text-light-textMuted dark:text-dark-textMuted">
                      Loginy
                    </th>
                    <th className="text-right pb-2 text-light-textMuted dark:text-dark-textMuted">
                      Poslední login
                    </th>
                    <th className="text-right pb-2 text-light-textMuted dark:text-dark-textMuted">
                      Transakcí
                    </th>
                    <th className="text-center pb-2 text-light-textMuted dark:text-dark-textMuted">
                      Stav
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.slice(0, 10).map((u) => (
                    <tr
                      key={u.uid}
                      className="border-b border-light-border dark:border-dark-border hover:bg-light-border dark:hover:bg-dark-border"
                    >
                      <td className="py-2">{u.username || u.email}</td>
                      <td className="text-right">{u.loginCount || 0}</td>
                      <td className="text-right text-xs text-light-textMuted dark:text-dark-textMuted">
                        {u.lastLogin ? formatDatum(u.lastLogin.split('T')[0]) : '—'}
                      </td>
                      <td className="text-right">
                        {(u.vydajeCount || 0) + (u.prijmyCount || 0)}
                      </td>
                      <td className="text-center">
                        {u.disabled ? (
                          <span className="text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 px-2 py-1 rounded">
                            blokován
                          </span>
                        ) : (
                          <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded">
                            aktivní
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* SEKCE D: Quick Actions */}
      <div className="card">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Zap size={20} /> Quick Actions
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {['debugRecurring', 'cleanupDuplicates', 'testGenerateRecurring'].map((fn) => (
            <div key={fn} className="space-y-2">
              <button
                onClick={() => callCloudFunction(fn)}
                className="w-full px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition text-sm font-medium"
              >
                {fn === 'debugRecurring' && '🔍 Debug Recurring'}
                {fn === 'cleanupDuplicates' && '🧹 Cleanup Duplicates'}
                {fn === 'testGenerateRecurring' && '🧪 Test Generate'}
              </button>

              {actionResults[fn] && (
                <details className="text-xs bg-light-border dark:bg-dark-border rounded p-2">
                  <summary className="cursor-pointer font-medium mb-1">
                    {actionResults[fn].loading ? 'Běží...' : 'Výsledek'}
                  </summary>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                    {JSON.stringify(actionResults[fn], null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* SEKCE E: Projekt Info */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">📋 Projekt Info</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-light-textMuted dark:text-dark-textMuted mb-1">
              Firebase Project ID
            </div>
            <div className="font-mono text-sm break-all">{firebaseConfig.projectId}</div>
          </div>
          <div>
            <div className="text-sm text-light-textMuted dark:text-dark-textMuted mb-1">Region</div>
            <div className="font-mono text-sm">europe-west1</div>
          </div>
          <div>
            <div className="text-sm text-light-textMuted dark:text-dark-textMuted mb-1">Verze</div>
            <div className="font-mono text-sm">1.0.0</div>
          </div>
          <div>
            <div className="text-sm text-light-textMuted dark:text-dark-textMuted mb-1">
              Refresh
            </div>
            <div className="font-mono text-sm text-green-600">
              {health?.timestamp ? new Date(health.timestamp).toLocaleString('cs-CZ') : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
