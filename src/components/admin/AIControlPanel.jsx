import { useState } from 'react';
import { firebaseConfig } from '../../config/firebase-config';
import { auth } from '../../utils/firebase';
import toast from 'react-hot-toast';

export const AIControlPanel = () => {
  const [isEnabled, setIsEnabled] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [lastRun, setLastRun] = useState(null);
  const [lastSummary, setLastSummary] = useState(null);

  const triggerAnalysis = async () => {
    setTriggering(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('ID Token not found');

      const url = `https://europe-west1-${firebaseConfig.projectId}.cloudfunctions.net/aiTriggerAnalysis`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error('Failed to trigger analysis');

      const data = await response.json();
      toast.success(`✅ Analýza spuštěna. Analyzováno ${data.analyzed} uživatelů.`);
      setLastRun(new Date().toLocaleString('cs-CZ'));
      setLastSummary(data.summary);
    } catch (err) {
      console.error('Error triggering analysis:', err);
      toast.error('Chyba při spuštění analýzy');
    } finally {
      setTriggering(false);
    }
  };

  const updateConfig = async () => {
    try {
      if (typeof isEnabled !== 'boolean') {
        toast.error('Neplatná hodnota pro tracking');
        return;
      }

      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('ID Token not found');

      const url = `https://europe-west1-${firebaseConfig.projectId}.cloudfunctions.net/aiUpdateConfig`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isEnabled }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update config');
      }

      toast.success('Konfigurace aktualizována');
    } catch (err) {
      console.error('Error updating config:', err);
      toast.error(err.message || 'Chyba při aktualizaci konfigurace');
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Section */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">📊 Status</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-light-bg dark:bg-dark-card rounded-lg">
            <div>
              <p className="font-medium">Tracking zapnutý</p>
              <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Sbírání dat od uživatelů</p>
            </div>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
                className="w-5 h-5"
              />
            </label>
          </div>

          <div className="p-3 bg-light-bg dark:bg-dark-card rounded-lg">
            <p className="font-medium">Poslední běh</p>
            <p className="text-sm text-light-textMuted dark:text-dark-textMuted">
              {lastRun || 'Zatím neběžel'}
            </p>
          </div>

          <button
            onClick={updateConfig}
            className="btn-primary w-full"
          >
            Uložit konfiguraci
          </button>
        </div>
      </div>

      {/* Manual Trigger Section */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">🚀 Ruční spuštění</h3>
        <div className="space-y-3">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">
            Normálně se analýza spouští automaticky každých 10 hodin. Kliknutím níže ji spustíte hned.
          </p>
          <button
            onClick={triggerAnalysis}
            disabled={triggering}
            className="btn-secondary w-full disabled:opacity-60"
          >
            {triggering ? 'Analýza běží...' : 'Spustit analýzu'}
          </button>
        </div>
      </div>

      {/* Analysis Results Section */}
      {lastSummary && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">📊 Výsledky Poslední Analýzy</h3>
          <div className="space-y-4">
            {/* Financial Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-light-bg dark:bg-dark-card rounded-lg">
                <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Celkem Výdajů</p>
                <p className="text-2xl font-bold text-red-600">{lastSummary.totalVydaje}</p>
              </div>
              <div className="p-3 bg-light-bg dark:bg-dark-card rounded-lg">
                <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Celkem Příjmů</p>
                <p className="text-2xl font-bold text-green-600">{lastSummary.totalPrijmy}</p>
              </div>
            </div>

            {/* Category Breakdown */}
            {Object.keys(lastSummary.categoryBreakdown || {}).length > 0 && (
              <div className="p-3 bg-light-bg dark:bg-dark-card rounded-lg">
                <p className="font-medium mb-2">Kategorie</p>
                <div className="space-y-1 text-sm">
                  {Object.entries(lastSummary.categoryBreakdown).map(([cat, count]) => (
                    <div key={cat} className="flex justify-between">
                      <span className="capitalize">{cat}:</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Users Analyzed */}
            {lastSummary.usersAnalyzed && lastSummary.usersAnalyzed.length > 0 && (
              <div className="p-3 bg-light-bg dark:bg-dark-card rounded-lg">
                <p className="font-medium mb-2">Uživatelé</p>
                <div className="space-y-2 text-sm">
                  {lastSummary.usersAnalyzed.map((user, idx) => (
                    <div key={idx} className="flex justify-between items-center border-b border-light-border dark:border-dark-border pb-2 last:border-0">
                      <span>{user.username}</span>
                      <span className="text-xs">
                        <span className="text-red-600">📉 {user.vydaje}</span>
                        <span className="mx-1">•</span>
                        <span className="text-green-600">📈 {user.prijmy}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-light-textMuted dark:text-dark-textMuted">
              Poslední běh: {lastRun}
            </p>
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="card border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950">
        <h4 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">ℹ️ O AI trackingu</h4>
        <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
          <li>• Uživatelé o sběru dat neví</li>
          <li>• Sbírají se pouze chování a časy, nikoli finanční data</li>
          <li>• Data jsou šifrována a dostupná jen adminu</li>
          <li>• Analýza se spouští každých 10 hodin automaticky</li>
        </ul>
      </div>
    </div>
  );
};
