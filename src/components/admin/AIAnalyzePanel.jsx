import { useState, useEffect } from 'react';
import { firebaseConfig } from '../../config/firebase-config';
import { auth } from '../../utils/firebase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ArrowLeft, TrendingUp, Clock, Mouse, Type } from 'lucide-react';
import toast from 'react-hot-toast';

const COLORS = ['#3B82F6', '#EF4444', '#10B981'];

export const AIAnalyzePanel = () => {
  const [allInsights, setAllInsights] = useState([]);
  const [selectedUserInsights, setSelectedUserInsights] = useState(null);
  const [selectedUid, setSelectedUid] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAllInsights = async () => {
    setLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('ID Token not found');

      const url = `https://europe-west1-${firebaseConfig.projectId}.cloudfunctions.net/aiGetAllInsights`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch insights');
      const data = await response.json();
      setAllInsights(data.allInsights || []);
    } catch (err) {
      console.error('Error fetching insights:', err);
      toast.error('Chyba při načítání analýz');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserInsights = async (uid) => {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('ID Token not found');

      const url = `https://europe-west1-${firebaseConfig.projectId}.cloudfunctions.net/aiGetInsights`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uid }),
      });

      if (!response.ok) throw new Error('Failed to fetch user insights');
      const data = await response.json();
      setSelectedUserInsights(data.insights);
      setSelectedUid(uid);
    } catch (err) {
      console.error('Error fetching user insights:', err);
      toast.error('Chyba při načítání detailů uživatele');
    }
  };

  useEffect(() => {
    fetchAllInsights();
  }, []);

  const formatMinutes = (ms) => Math.round(ms / 60000);
  const formatSeconds = (ms) => Math.round(ms / 1000);
  const dayNames = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
  const monthNames = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čer', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro'];

  if (loading) {
    return <div className="text-center py-8 text-light-textMuted dark:text-dark-textMuted">Načítání...</div>;
  }

  if (selectedUserInsights) {
    const user = allInsights.find(i => i.uid === selectedUid);
    const tabData = [
      { name: 'Přehled', value: selectedUserInsights.tabs?.dashboardPercent || 0, ms: selectedUserInsights.tabs?.dashboard || 0 },
      { name: 'Výdaje', value: selectedUserInsights.tabs?.vydajePercent || 0, ms: selectedUserInsights.tabs?.vydaje || 0 },
      { name: 'Příjmy', value: selectedUserInsights.tabs?.prijmyPercent || 0, ms: selectedUserInsights.tabs?.prijmy || 0 },
    ];

    return (
      <div className="space-y-6">
        <button
          onClick={() => {
            setSelectedUserInsights(null);
            setSelectedUid(null);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-light-border dark:bg-dark-border rounded-lg text-sm hover:bg-light-bg dark:hover:bg-dark-bg transition-colors"
        >
          <ArrowLeft size={16} /> Zpět na seznam
        </button>

        {/* Header */}
        <div className="card">
          <h2 className="text-2xl font-bold text-light-text dark:text-dark-text mb-1">
            📊 {user?.username || selectedUid}
          </h2>
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">
            Poslední analýza: {selectedUserInsights?.lastAnalyzed ? new Date(selectedUserInsights.lastAnalyzed).toLocaleDateString('cs-CZ') : 'N/A'}
          </p>
        </div>

        {!selectedUserInsights ? (
          <div className="card text-center py-12 text-light-textMuted dark:text-dark-textMuted">
            Žádná data k analýze
          </div>
        ) : (
          <>
            {/* 📈 Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="card border-l-4 border-blue-500">
                <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Sezení</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{selectedUserInsights.sessions?.count || 0}</p>
              </div>
              <div className="card border-l-4 border-purple-500">
                <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Kliknutí</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{selectedUserInsights.behavioral?.totalClicks || 0}</p>
              </div>
              <div className="card border-l-4 border-green-500">
                <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Znaků</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{selectedUserInsights.behavioral?.totalCharCount || 0}</p>
              </div>
              <div className="card border-l-4 border-orange-500">
                <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Čas v app</p>
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{formatMinutes(selectedUserInsights.sessions?.totalTimeMs || 0)}m</p>
              </div>
            </div>

            {/* ⏱️ Čas v sekcích */}
            <div className="card">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Clock size={20} /> ⏱️ Čas strávený v sekcích
              </h3>

              {/* Pie chart */}
              <div className="mb-6">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={tabData} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}%`} outerRadius={80} fill="#8884d8" dataKey="value">
                      {tabData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${value}%`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Detailed breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {tabData.map((tab) => (
                  <div key={tab.name} className="p-3 bg-light-bg dark:bg-dark-bg rounded-lg">
                    <p className="text-sm font-medium mb-2">{tab.name}</p>
                    <div className="space-y-1">
                      <p className="text-2xl font-bold">{tab.value}%</p>
                      <p className="text-xs text-light-textMuted dark:text-dark-textMuted">
                        {formatMinutes(tab.ms)}m ({formatSeconds(tab.ms)}s)
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 🖱️ Chování uživatele */}
            <div className="card">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Mouse size={20} /> 🖱️ Interakce
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-light-bg dark:bg-dark-bg rounded-lg">
                  <p className="text-sm text-light-textMuted dark:text-dark-textMuted mb-1">Průměr kliků/sezení</p>
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                    {selectedUserInsights.behavioral?.avgClicksPerSession || 0}
                  </p>
                </div>
                <div className="p-4 bg-light-bg dark:bg-dark-bg rounded-lg">
                  <p className="text-sm text-light-textMuted dark:text-dark-textMuted mb-1">Průměr znaků/sezení</p>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {selectedUserInsights.behavioral?.avgCharCountPerSession || 0}
                  </p>
                </div>
                <div className="p-4 bg-light-bg dark:bg-dark-bg rounded-lg">
                  <p className="text-sm text-light-textMuted dark:text-dark-textMuted mb-1">Průměr délka sezení</p>
                  <p className="text-2xl font-bold">
                    {formatMinutes(selectedUserInsights.sessions?.avgDurationMs || 0)}m
                  </p>
                </div>
                <div className="p-4 bg-light-bg dark:bg-dark-bg rounded-lg">
                  <p className="text-sm text-light-textMuted dark:text-dark-textMuted mb-1">Všechny transakce</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {selectedUserInsights.financial?.totalTransactions || 0}
                  </p>
                </div>
              </div>
            </div>

            {/* 💰 Finanční vzorce */}
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">💰 Finanční vzorce</h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <div className="p-3 bg-light-bg dark:bg-dark-bg rounded-lg">
                  <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Oblíbený den</p>
                  <p className="text-lg font-bold">{dayNames[selectedUserInsights.financial?.preferredDayOfWeek] || '-'}</p>
                </div>
                <div className="p-3 bg-light-bg dark:bg-dark-bg rounded-lg">
                  <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Oblíbená hodina</p>
                  <p className="text-lg font-bold">
                    {selectedUserInsights.financial?.preferredHourOfDay !== -1
                      ? `${selectedUserInsights.financial.preferredHourOfDay}:00`
                      : '-'}
                  </p>
                </div>
              </div>

              {/* Kategorie */}
              {selectedUserInsights.financial?.categoryBreakdown && Object.keys(selectedUserInsights.financial.categoryBreakdown).length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-3">Nejčastější kategorie</p>
                  <div className="space-y-2">
                    {Object.entries(selectedUserInsights.financial.categoryBreakdown)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 8)
                      .map(([cat, count]) => {
                        const total = Object.values(selectedUserInsights.financial.categoryBreakdown).reduce((a, b) => a + b, 0);
                        const percent = Math.round((count / total) * 100);
                        return (
                          <div key={cat}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="capitalize font-medium">{cat}</span>
                              <span className="text-light-textMuted dark:text-dark-textMuted">{count}x ({percent}%)</span>
                            </div>
                            <div className="w-full bg-light-border dark:bg-dark-border rounded-full h-1.5">
                              <div className="bg-gradient-to-r from-blue-500 to-purple-500 h-1.5 rounded-full" style={{ width: `${percent}%` }} />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            {/* 📝 Analýza chování */}
            <div className="card bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-500">
              <h3 className="text-lg font-semibold mb-3 text-blue-900 dark:text-blue-200">🔍 Profil uživatele</h3>
              <div className="space-y-2 text-sm text-blue-800 dark:text-blue-300">
                {selectedUserInsights.sessions?.count > 20 && (
                  <p>✅ <strong>Aktivní uživatel</strong> — přístupuje aplikaci často ({selectedUserInsights.sessions.count} sezení)</p>
                )}
                {selectedUserInsights.behavioral?.avgClicksPerSession > 50 && (
                  <p>✅ <strong>Interaktivní chování</strong> — mnoho klikání, silný engagement</p>
                )}
                {selectedUserInsights.tabs?.vydajePercent > 50 && (
                  <p>💸 <strong>Fokus na výdaje</strong> — stráví více času v sekci Výdaje</p>
                )}
                {selectedUserInsights.tabs?.prijmyPercent > 50 && (
                  <p>💰 <strong>Fokus na příjmy</strong> — stráví více času v sekci Příjmy</p>
                )}
                {selectedUserInsights.financial?.totalTransactions > 50 && (
                  <p>📊 <strong>Intenzivně záznamuje</strong> — více než 50 záznamů (podrobný tracking)</p>
                )}
                {selectedUserInsights.sessions?.avgDurationMs > 600000 && (
                  <p>⏱️ <strong>Dlouhé sezení</strong> — průměrně více jak 10 minut na sezení</p>
                )}
                {selectedUserInsights.behavioral?.avgCharCountPerSession > 100 && (
                  <p>⌨️ <strong>Hodně psaní</strong> — průměrně více jak 100 znaků na sezení</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <TrendingUp size={20} /> Analýza všech uživatelů
      </h3>

      {allInsights.length === 0 ? (
        <p className="text-center py-8 text-light-textMuted dark:text-dark-textMuted">Zatím nejsou žádná data</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-light-border dark:border-dark-border">
                  <th className="text-left py-3 px-3 font-semibold">Uživatel</th>
                  <th className="text-left py-3 px-3 font-semibold">Sezení</th>
                  <th className="text-left py-3 px-3 font-semibold">Kliknutí</th>
                  <th className="text-left py-3 px-3 font-semibold">Čas v app</th>
                  <th className="text-left py-3 px-3 font-semibold">Top sekce</th>
                  <th className="text-left py-3 px-3 font-semibold">Poslední analýza</th>
                  <th className="text-left py-3 px-3 font-semibold">Akce</th>
                </tr>
              </thead>
              <tbody>
                {allInsights.map(user => (
                  <tr key={user.uid} className="border-b border-light-border dark:border-dark-border hover:bg-light-bg dark:hover:bg-dark-card">
                    <td className="py-3 px-3 font-medium">{user.username}</td>
                    <td className="py-3 px-3">{user.totalSessions}</td>
                    <td className="py-3 px-3 text-purple-600 dark:text-purple-400">{user.totalClicks || 0}</td>
                    <td className="py-3 px-3">{user.totalTimeMinutes}m</td>
                    <td className="py-3 px-3">
                      {user.mostUsedTab === 'dashboard' && '📊 Přehled'}
                      {user.mostUsedTab === 'vydaje' && '💸 Výdaje'}
                      {user.mostUsedTab === 'prijmy' && '💰 Příjmy'}
                      {user.mostUsedTab === 'unknown' && '-'}
                    </td>
                    <td className="py-3 px-3 text-xs text-light-textMuted dark:text-dark-textMuted">
                      {user.lastAnalyzed ? new Date(user.lastAnalyzed).toLocaleDateString('cs-CZ') : 'Nikdy'}
                    </td>
                    <td className="py-3 px-3">
                      <button onClick={() => fetchUserInsights(user.uid)} className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition">
                        Detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {allInsights.map(user => (
              <div key={user.uid} className="p-3 bg-light-bg dark:bg-dark-bg rounded-lg border border-light-border dark:border-dark-border">
                <h4 className="font-semibold text-light-text dark:text-dark-text mb-2">{user.username}</h4>

                <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                  <div className="p-2 bg-light-card dark:bg-dark-card rounded">
                    <p className="text-light-textMuted dark:text-dark-textMuted">Sezení</p>
                    <p className="font-bold">{user.totalSessions}</p>
                  </div>
                  <div className="p-2 bg-light-card dark:bg-dark-card rounded">
                    <p className="text-light-textMuted dark:text-dark-textMuted">Kliknutí</p>
                    <p className="font-bold text-purple-600 dark:text-purple-400">{user.totalClicks || 0}</p>
                  </div>
                  <div className="p-2 bg-light-card dark:bg-dark-card rounded">
                    <p className="text-light-textMuted dark:text-dark-textMuted">Čas</p>
                    <p className="font-bold">{user.totalTimeMinutes}m</p>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs mb-3">
                  <span className="text-light-textMuted dark:text-dark-textMuted">
                    {user.lastAnalyzed ? new Date(user.lastAnalyzed).toLocaleDateString('cs-CZ') : 'Nikdy'}
                  </span>
                  <span>
                    {user.mostUsedTab === 'dashboard' && '📊'}
                    {user.mostUsedTab === 'vydaje' && '💸'}
                    {user.mostUsedTab === 'prijmy' && '💰'}
                  </span>
                </div>

                <button
                  onClick={() => fetchUserInsights(user.uid)}
                  className="w-full px-3 py-2 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition font-medium"
                >
                  Zobrazit detail
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
