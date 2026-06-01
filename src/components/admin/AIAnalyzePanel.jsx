import { useState, useEffect } from 'react';
import { firebaseConfig } from '../../config/firebase-config';
import { auth } from '../../utils/firebase';
import toast from 'react-hot-toast';

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
  const dayNames = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
  const monthNames = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Červ', 'Červ', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro'];

  if (loading) {
    return <div className="text-center py-8 text-light-textMuted dark:text-dark-textMuted">Načítání...</div>;
  }

  if (selectedUserInsights) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => {
            setSelectedUserInsights(null);
            setSelectedUid(null);
          }}
          className="px-4 py-2 bg-light-border dark:bg-dark-border rounded-lg text-sm hover:bg-light-bg dark:hover:bg-dark-bg"
        >
          ← Zpět na seznam
        </button>

        <div className="card">
          <h3 className="text-lg font-semibold mb-4">
            {allInsights.find(i => i.uid === selectedUid)?.username || selectedUid}
          </h3>

          {!selectedUserInsights ? (
            <p className="text-light-textMuted dark:text-dark-textMuted">Žádná data k analýze</p>
          ) : (
            <div className="space-y-6">
              {/* Sessions */}
              <div>
                <h4 className="font-semibold mb-3">📊 Sezení</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-light-bg dark:bg-dark-card p-3 rounded-lg">
                    <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Počet sezení</p>
                    <p className="text-xl font-bold">{selectedUserInsights.sessions?.count || 0}</p>
                  </div>
                  <div className="bg-light-bg dark:bg-dark-card p-3 rounded-lg">
                    <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Průměrná délka</p>
                    <p className="text-xl font-bold">{formatMinutes(selectedUserInsights.sessions?.avgDurationMs || 0)}m</p>
                  </div>
                  <div className="col-span-2 bg-light-bg dark:bg-dark-card p-3 rounded-lg">
                    <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Celkový čas v aplikaci</p>
                    <p className="text-xl font-bold">{formatMinutes(selectedUserInsights.sessions?.totalTimeMs || 0)}m</p>
                  </div>
                </div>
              </div>

              {/* Tab breakdown */}
              <div>
                <h4 className="font-semibold mb-3">📍 Distribuce času v sekcích</h4>
                <div className="space-y-2">
                  {['dashboard', 'vydaje', 'prijmy'].map(tab => {
                    const percent = selectedUserInsights.tabs?.[`${tab}Percent`] || 0;
                    const tabLabel = tab === 'dashboard' ? 'Přehled' : tab === 'vydaje' ? 'Výdaje' : 'Příjmy';
                    return (
                      <div key={tab}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{tabLabel}</span>
                          <span className="font-semibold">{percent}%</span>
                        </div>
                        <div className="w-full bg-light-border dark:bg-dark-border rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Financial patterns */}
              <div>
                <h4 className="font-semibold mb-3">💰 Finanční vzorce</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-light-bg dark:bg-dark-card p-3 rounded-lg">
                    <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Celkem transakcí</p>
                    <p className="text-xl font-bold">{selectedUserInsights.financial?.totalTransactions || 0}</p>
                  </div>
                  <div className="bg-light-bg dark:bg-dark-card p-3 rounded-lg">
                    <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Preferovaný den</p>
                    <p className="text-lg font-bold">
                      {dayNames[selectedUserInsights.financial?.preferredDayOfWeek] || '-'}
                    </p>
                  </div>
                  <div className="bg-light-bg dark:bg-dark-card p-3 rounded-lg">
                    <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Preferovaná hodina</p>
                    <p className="text-lg font-bold">
                      {selectedUserInsights.financial?.preferredHourOfDay !== -1
                        ? `${selectedUserInsights.financial.preferredHourOfDay}:00`
                        : '-'}
                    </p>
                  </div>
                </div>

                {/* Categories */}
                {selectedUserInsights.financial?.categoryBreakdown &&
                  Object.keys(selectedUserInsights.financial.categoryBreakdown).length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium mb-2">Oblíbené kategorie</p>
                      <div className="space-y-2">
                        {Object.entries(selectedUserInsights.financial.categoryBreakdown)
                          .sort((a, b) => b[1] - a[1])
                          .map(([cat, count]) => (
                            <div key={cat} className="flex justify-between items-center text-sm">
                              <span className="text-light-text dark:text-dark-text">{cat}</span>
                              <span className="text-light-textMuted dark:text-dark-textMuted">{count}x</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Analýza všech uživatelů</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-light-border dark:border-dark-border">
              <th className="text-left py-2 px-3">Uživatel</th>
              <th className="text-left py-2 px-3">Poslední analýza</th>
              <th className="text-left py-2 px-3">Sezení</th>
              <th className="text-left py-2 px-3">Nejvíce času</th>
              <th className="text-left py-2 px-3">Celkem (min)</th>
              <th className="text-left py-2 px-3">Akce</th>
            </tr>
          </thead>
          <tbody>
            {allInsights.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center py-6 text-light-textMuted dark:text-dark-textMuted">
                  Zatím nejsou žádná data
                </td>
              </tr>
            ) : (
              allInsights.map(user => (
                <tr key={user.uid} className="border-b border-light-border dark:border-dark-border hover:bg-light-bg dark:hover:bg-dark-card">
                  <td className="py-3 px-3 font-medium">{user.username}</td>
                  <td className="py-3 px-3 text-xs text-light-textMuted dark:text-dark-textMuted">
                    {user.lastAnalyzed ? new Date(user.lastAnalyzed).toLocaleDateString('cs-CZ') : 'Nikdy'}
                  </td>
                  <td className="py-3 px-3">{user.totalSessions}</td>
                  <td className="py-3 px-3">
                    {user.mostUsedTab === 'dashboard' && '📊'}
                    {user.mostUsedTab === 'vydaje' && '💸'}
                    {user.mostUsedTab === 'prijmy' && '💰'}
                    {user.mostUsedTab === 'unknown' && '-'}
                  </td>
                  <td className="py-3 px-3">{user.totalTimeMinutes}</td>
                  <td className="py-3 px-3">
                    <button
                      onClick={() => fetchUserInsights(user.uid)}
                      className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                    >
                      Detail
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
