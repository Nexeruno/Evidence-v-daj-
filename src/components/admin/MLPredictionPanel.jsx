import { useState, useEffect } from 'react';
import { auth, db } from '../../utils/firebase';
import { collection, query, orderBy, limit, getDocs, doc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';

export const MLPredictionPanel = () => {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mlRuns, setMlRuns] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const checkAdmin = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const userDoc = await getDocs(
        query(collection(db, 'users'), limit(1))
      );
      const userData = userDoc.docs.find(d => d.id === uid)?.data();
      setIsAdmin(userData?.role === 'admin');
    } catch (err) {
      console.error('Admin check error:', err);
    }
  };

  const toggleHidden = async (predictionId, uid, currentHidden) => {
    try {
      const predRef = doc(db, `users/${uid}/mlPredictions/${predictionId}`);
      await updateDoc(predRef, { hidden: !currentHidden });

      setPredictions(prev =>
        prev.map(p =>
          p.id === predictionId && p.uid === uid
            ? { ...p, hidden: !currentHidden }
            : p
        )
      );

      toast.success(currentHidden ? '✅ Predikce obnovena' : '👁️ Predikce skryta');
    } catch (err) {
      console.error('Error toggling hidden:', err);
      toast.error('Chyba při skrývání');
    }
  };

  const loadPredictions = async () => {
    try {
      setLoading(true);
      const uid = auth.currentUser?.uid;
      if (!uid) {
        toast.error('Není přihlášen uživatel');
        return;
      }

      let allPredictions = [];

      if (isAdmin) {
        // Admin vidí všechny predikce všech uživatelů
        const usersSnap = await getDocs(collection(db, 'users'));
        for (const userDoc of usersSnap.docs) {
          const preds = await getDocs(
            query(
              collection(db, `users/${userDoc.id}/mlPredictions`),
              orderBy('createdAt', 'desc'),
              limit(20)
            )
          );
          allPredictions.push(
            ...preds.docs.map(doc => ({
              id: doc.id,
              uid: userDoc.id,
              username: userDoc.data().username || userDoc.id,
              ...doc.data(),
              createdAt: doc.data().createdAt?.toDate?.(),
            }))
          );
        }
        allPredictions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      } else {
        // Běžný uživatel vidí jen svoje
        const preds = await getDocs(
          query(
            collection(db, `users/${uid}/mlPredictions`),
            orderBy('createdAt', 'desc'),
            limit(12)
          )
        );
        allPredictions = preds.docs.map(doc => ({
          id: doc.id,
          uid,
          username: auth.currentUser?.displayName || 'Já',
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.(),
        }));
      }

      setPredictions(allPredictions);

      // Load ML runs (if admin)
      if (isAdmin) {
        const runs = await getDocs(
          query(
            collection(db, 'mlRuns'),
            orderBy('startedAt', 'desc'),
            limit(5)
          )
        );
        setMlRuns(runs.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          startedAt: doc.data().startedAt?.toDate?.(),
          finishedAt: doc.data().finishedAt?.toDate?.(),
        })));
      }
    } catch (err) {
      console.error('Load predictions error:', err);
      toast.error('Chyba při načítání predikací');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    loadPredictions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="card">
          <p className="text-center text-light-textMuted dark:text-dark-textMuted">
            ⏳ Načítám predikace...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* User Predictions */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">🤖 Předpovědi výdajů</h3>
          {isAdmin && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showHidden}
                onChange={(e) => setShowHidden(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-light-textMuted dark:text-dark-textMuted">
                Zobrazit skryté
              </span>
            </label>
          )}
        </div>

        {predictions.length === 0 ? (
          <div className="p-4 bg-light-bg dark:bg-dark-card rounded-lg text-center">
            <p className="text-light-textMuted dark:text-dark-textMuted">
              Zatím žádné předpovědi. Pipeline se spouští každé 3 dny.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {predictions
              .filter(pred => showHidden || !pred.hidden)
              .map(pred => (
              <div
                key={`${pred.uid}-${pred.id}`}
                className={`p-4 rounded-lg border-l-4 border-purple-500 ${
                  pred.hidden
                    ? 'bg-gray-100 dark:bg-gray-800 opacity-60'
                    : 'bg-light-bg dark:bg-dark-card'
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-semibold text-sm">
                      {isAdmin && pred.username && (
                        <span className="text-xs text-light-textMuted dark:text-dark-textMuted mr-2">
                          ({pred.username})
                        </span>
                      )}
                      {new Date(pred.month + '-01').toLocaleDateString('cs-CZ', {
                        month: 'long',
                        year: 'numeric',
                      })}
                      {pred.hidden && <span className="ml-2 text-xs bg-gray-500 text-white px-2 py-1 rounded">SKRYTO</span>}
                    </p>
                    <p className="text-xs text-light-textMuted dark:text-dark-textMuted">
                      Vytvořeno: {pred.createdAt?.toLocaleString('cs-CZ')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleHidden(pred.id, pred.uid, pred.hidden)}
                      className="px-2 py-1 hover:opacity-80 transition-opacity text-lg"
                      title={pred.hidden ? 'Obnovit' : 'Skrýt'}
                    >
                      {pred.hidden ? '👁️' : '🗑️'}
                    </button>
                    <div className={`px-3 py-2 rounded text-xs ${
                      pred.confidence === 'high'
                        ? 'bg-green-100 dark:bg-green-900'
                        : pred.confidence === 'medium'
                        ? 'bg-yellow-100 dark:bg-yellow-900'
                        : 'bg-red-100 dark:bg-red-900'
                    }`}>
                    <div className={`font-semibold ${
                      pred.confidence === 'high'
                        ? 'text-green-800 dark:text-green-200'
                        : pred.confidence === 'medium'
                        ? 'text-yellow-800 dark:text-yellow-200'
                        : 'text-red-800 dark:text-red-200'
                    }`}>
                      {pred.confidence === 'high' ? '✅ Vysoká' :
                       pred.confidence === 'medium' ? '⚠️ Střední' :
                       '❌ Nízká'} jistota ({pred.confidenceScore || '?'}%)
                    </div>
                    {pred.confidenceReason && (
                      <div className={`text-xs mt-1 ${
                        pred.confidence === 'high'
                          ? 'text-green-700 dark:text-green-300'
                          : pred.confidence === 'medium'
                          ? 'text-yellow-700 dark:text-yellow-300'
                          : 'text-red-700 dark:text-red-300'
                      }`}>
                        {pred.confidenceReason}
                      </div>
                    )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <p className="text-xs text-light-textMuted dark:text-dark-textMuted">
                      Předpověď celkem
                    </p>
                    <p className="text-2xl font-bold text-red-600">
                      {pred.totalPredictedExpense.toLocaleString('cs-CZ')}
                    </p>
                  </div>
                  {pred.features && (
                    <div>
                      <p className="text-xs text-light-textMuted dark:text-dark-textMuted">
                        Průměr 3 měsíců
                      </p>
                      <p className="text-2xl font-bold text-blue-600">
                        {pred.features.avg3m?.toLocaleString('cs-CZ')}
                      </p>
                    </div>
                  )}
                </div>

                {/* Categories breakdown */}
                {Object.keys(pred.categories || {}).length > 0 && (
                  <div className="p-3 bg-light-border dark:bg-dark-border rounded-lg">
                    <p className="text-xs font-semibold mb-2 text-light-textMuted dark:text-dark-textMuted">
                      Po kategoriích:
                    </p>
                    <div className="space-y-1 text-sm">
                      {Object.entries(pred.categories)
                        .sort(([, a], [, b]) => b - a)
                        .map(([cat, amount]) => (
                          <div key={cat} className="flex justify-between">
                            <span className="capitalize">{cat}:</span>
                            <span className="font-semibold">
                              {amount.toLocaleString('cs-CZ')}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Income section */}
                {pred.incomeStats && Object.keys(pred.incomeStats).length > 0 && (
                  <div className="mt-4 p-3 bg-green-50 dark:bg-green-950 rounded-lg border-l-4 border-green-500">
                    <p className="font-semibold mb-3 text-green-900 dark:text-green-200">
                      💰 Příjmy - Měsíční přehled
                    </p>

                    {/* Monthly breakdown */}
                    {pred.monthlyIncome && Object.keys(pred.monthlyIncome).length > 0 && (
                      <div className="space-y-2 mb-3">
                        {Object.entries(pred.monthlyIncome)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([month, amount]) => {
                            const percentage = pred.incomeStats.avg6m > 0
                              ? (amount / pred.incomeStats.avg6m) * 100
                              : 0;
                            return (
                              <div key={month} className="flex items-center gap-2">
                                <span className="text-xs font-mono text-green-800 dark:text-green-300 w-12">
                                  {month}
                                </span>
                                <div className="flex-1 bg-green-200 dark:bg-green-800 rounded h-5 relative overflow-hidden">
                                  <div
                                    className="bg-green-500 dark:bg-green-400 h-full transition-all"
                                    style={{ width: `${Math.min(percentage, 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs font-semibold text-green-900 dark:text-green-200 w-20 text-right">
                                  {amount.toLocaleString('cs-CZ')}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    )}

                    {/* Income averages */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-green-700 dark:text-green-300">Průměr 3 měsíce</p>
                        <p className="font-bold text-green-900 dark:text-green-100">
                          {pred.incomeStats.avg3m?.toLocaleString('cs-CZ')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-green-700 dark:text-green-300">Průměr 6 měsíců</p>
                        <p className="font-bold text-green-900 dark:text-green-100">
                          {pred.incomeStats.avg6m?.toLocaleString('cs-CZ')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-2">
                  Model: {pred.modelType || 'unknown'} ({pred.modelVersion})
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ML Runs (Admin Only) */}
      {isAdmin && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">🔧 Pipeline běhy</h3>

          {mlRuns.length === 0 ? (
            <div className="p-4 bg-light-bg dark:bg-dark-card rounded-lg text-center">
              <p className="text-light-textMuted dark:text-dark-textMuted">
                Zatím žádné běhy
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {mlRuns.map(run => (
                <div
                  key={run.id}
                  className={`p-3 bg-light-bg dark:bg-dark-card rounded-lg border-l-4 ${
                    run.status === 'success'
                      ? 'border-green-500'
                      : 'border-red-500'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold text-sm">
                        {run.status === 'success' ? '✅' : '❌'} {run.status}
                      </p>
                      <p className="text-xs text-light-textMuted dark:text-dark-textMuted">
                        {run.startedAt?.toLocaleString('cs-CZ')}
                      </p>
                    </div>
                    <span className="text-xs font-mono bg-light-border dark:bg-dark-border px-2 py-1 rounded">
                      {run.durationMs}ms
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                    <div>
                      <p className="text-light-textMuted dark:text-dark-textMuted">
                        Uživatelů zpracováno
                      </p>
                      <p className="font-semibold">{run.usersProcessed}</p>
                    </div>
                    <div>
                      <p className="text-light-textMuted dark:text-dark-textMuted">
                        Predikací vytvořeno
                      </p>
                      <p className="font-semibold">{run.predictionsCreated}</p>
                    </div>
                  </div>

                  {run.errorMessage && (
                    <div className="p-2 bg-red-100 dark:bg-red-900 rounded text-xs text-red-800 dark:text-red-200">
                      <p className="font-semibold">Chyba:</p>
                      <p className="font-mono">{run.errorMessage}</p>
                      {run.errorCode && (
                        <p className="text-xs">({run.errorCode})</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Info Section */}
      <div className="card border-l-4 border-purple-500 bg-purple-50 dark:bg-purple-950">
        <h4 className="font-semibold text-purple-900 dark:text-purple-200 mb-2">
          🤖 O ML Pipeline (Level 1)
        </h4>
        <ul className="text-sm text-purple-800 dark:text-purple-300 space-y-1">
          <li>• Běží každé 3 dny automaticky</li>
          <li>• Používá 3-měsíční a 6-měsíční průměry</li>
          <li>• Predikuje výdaje na příští měsíc</li>
          <li>• Jistota závisí na konzistenci vašich výdajů</li>
          <li>• Model: baseline average (bez ML algoritmů)</li>
        </ul>
      </div>
    </div>
  );
};
