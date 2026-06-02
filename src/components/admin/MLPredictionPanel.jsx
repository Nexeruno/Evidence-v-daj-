import { useState, useEffect } from 'react';
import { auth, db } from '../../utils/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';

export const MLPredictionPanel = () => {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mlRuns, setMlRuns] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);

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

  const loadPredictions = async () => {
    try {
      setLoading(true);
      const uid = auth.currentUser?.uid;
      if (!uid) {
        toast.error('Není přihlášen uživatel');
        return;
      }

      // Load user's predictions
      const preds = await getDocs(
        query(
          collection(db, `users/${uid}/mlPredictions`),
          orderBy('createdAt', 'desc'),
          limit(12)
        )
      );

      const predictionsData = preds.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.(),
      }));

      setPredictions(predictionsData);

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
    loadPredictions();
    checkAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <h3 className="text-lg font-semibold mb-4">🤖 Předpovědi výdajů</h3>

        {predictions.length === 0 ? (
          <div className="p-4 bg-light-bg dark:bg-dark-card rounded-lg text-center">
            <p className="text-light-textMuted dark:text-dark-textMuted">
              Zatím žádné předpovědi. Pipeline se spouští každé 3 dny.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {predictions.map(pred => (
              <div
                key={pred.id}
                className="p-4 bg-light-bg dark:bg-dark-card rounded-lg border-l-4 border-purple-500"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-semibold text-sm">
                      {new Date(pred.month + '-01').toLocaleDateString('cs-CZ', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                    <p className="text-xs text-light-textMuted dark:text-dark-textMuted">
                      Vytvořeno: {pred.createdAt?.toLocaleString('cs-CZ')}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    pred.confidence === 'high'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : pred.confidence === 'medium'
                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }`}>
                    {pred.confidence === 'high' ? '✅ Vysoká' :
                     pred.confidence === 'medium' ? '⚠️ Střední' :
                     '❓ Nízká'} jistota
                  </span>
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
