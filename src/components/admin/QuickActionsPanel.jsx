import { useState } from 'react';
import { Zap, PlayCircle, Bug, CheckCircle, AlertCircle, XCircle, Loader, Wrench } from 'lucide-react';
import { auth } from '../../utils/firebase';
import { firebaseConfig } from '../../config/firebase-config';
import toast from 'react-hot-toast';

export const QuickActionsPanel = ({ onClose }) => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentAction, setCurrentAction] = useState(null);

  const executeAction = async (actionName, endpoint) => {
    setLoading(true);
    setCurrentAction(actionName);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Nemáš oprávnění');

      const projectId = firebaseConfig.projectId;
      const url = `https://europe-west1-${projectId}.cloudfunctions.net/${endpoint}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Chyba při spuštění akce');
      }

      // Přidej výsledek na začátek
      setResults((prev) => [
        {
          id: Date.now(),
          action: actionName,
          timestamp: new Date(),
          status: data.status || 'SUCCESS',
          message: data.message || 'Akce provedena',
          details: data.details || {},
        },
        ...prev,
      ]);

      toast.success(`${actionName} — hotovo!`);
    } catch (err) {
      console.error(`${actionName} error:`, err);
      setResults((prev) => [
        {
          id: Date.now(),
          action: actionName,
          timestamp: new Date(),
          status: 'FAILED',
          message: err.message,
          details: {},
        },
        ...prev,
      ]);
      toast.error(`${actionName} — chyba!`);
    } finally {
      setLoading(false);
      setCurrentAction(null);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle size={20} className="text-green-600 dark:text-green-400" />;
      case 'PARTIAL_SUCCESS':
        return <AlertCircle size={20} className="text-yellow-600 dark:text-yellow-400" />;
      case 'FAILED':
        return <XCircle size={20} className="text-red-600 dark:text-red-400" />;
      default:
        return <AlertCircle size={20} className="text-gray-600 dark:text-gray-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'SUCCESS':
        return 'bg-green-50 dark:bg-green-900/20 border-green-500';
      case 'PARTIAL_SUCCESS':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500';
      case 'FAILED':
        return 'bg-red-50 dark:bg-red-900/20 border-red-500';
      default:
        return 'bg-gray-50 dark:bg-gray-900/20 border-gray-500';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'SUCCESS':
        return '✓ Úspěšné';
      case 'PARTIAL_SUCCESS':
        return '⚠️ Částečné';
      case 'FAILED':
        return '✗ Selhalo';
      default:
        return '? Neznámé';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={24} className="text-yellow-500" />
          <h1 className="text-2xl font-bold">Quick Actions</h1>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-light-border dark:bg-dark-border hover:bg-light-card dark:hover:bg-dark-card transition"
          >
            ← Zpět
          </button>
        )}
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Test Generate */}
        <button
          onClick={() => executeAction('Test Generate', 'testGenerateRecurring')}
          disabled={loading}
          className="card p-4 border-2 border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition disabled:opacity-50 flex flex-col items-center gap-2 text-center"
        >
          {currentAction === 'Test Generate' && loading ? (
            <Loader size={24} className="text-blue-500 animate-spin" />
          ) : (
            <PlayCircle size={24} className="text-blue-500" />
          )}
          <div>
            <h3 className="font-semibold">Test Generate</h3>
            <p className="text-sm text-light-textMuted dark:text-dark-textMuted mt-1">
              Vygeneruje testovací transakce z recurring
            </p>
          </div>
        </button>

        {/* Safe Auto-Repair */}
        <button
          onClick={() => executeAction('Safe Auto-Repair', 'safeAutoRepairSystem')}
          disabled={loading}
          className="card p-4 border-2 border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition disabled:opacity-50 flex flex-col items-center gap-2 text-center"
        >
          {currentAction === 'Safe Auto-Repair' && loading ? (
            <Loader size={24} className="text-green-500 animate-spin" />
          ) : (
            <Wrench size={24} className="text-green-500" />
          )}
          <div>
            <h3 className="font-semibold">Safe Auto-Repair</h3>
            <p className="text-sm text-light-textMuted dark:text-dark-textMuted mt-1">
              Detekuj a archivuj chyby (bez smazání)
            </p>
          </div>
        </button>

        {/* Debug Recurring */}
        <button
          onClick={() => executeAction('Debug Recurring', 'debugRecurring')}
          disabled={loading}
          className="card p-4 border-2 border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition disabled:opacity-50 flex flex-col items-center gap-2 text-center"
        >
          {currentAction === 'Debug Recurring' && loading ? (
            <Loader size={24} className="text-purple-500 animate-spin" />
          ) : (
            <Bug size={24} className="text-purple-500" />
          )}
          <div>
            <h3 className="font-semibold">Debug Recurring</h3>
            <p className="text-sm text-light-textMuted dark:text-dark-textMuted mt-1">
              Diagnostika rekurentních transakcí
            </p>
          </div>
        </button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Poslední akce</h3>
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {results.map((result) => (
              <div
                key={result.id}
                className={`p-4 rounded-lg border-l-4 ${getStatusColor(result.status)}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1">{getStatusIcon(result.status)}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold">{result.action}</h4>
                      <span className="text-xs text-light-textMuted dark:text-dark-textMuted">
                        {result.timestamp.toLocaleTimeString('cs-CZ')}
                      </span>
                    </div>
                    <p className="text-sm mb-2">{result.message}</p>

                    {/* Details */}
                    {Object.keys(result.details).length > 0 && (
                      <div className="mt-2 p-2 rounded bg-white/50 dark:bg-black/20 text-sm space-y-1">
                        {Object.entries(result.details).map(([key, value]) => (
                          <div key={key} className="flex justify-between">
                            <span className="font-medium">{key}:</span>
                            <span className="text-light-textMuted dark:text-dark-textMuted">
                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Status Badge */}
                    <div className="mt-2">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          result.status === 'SUCCESS'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                            : result.status === 'PARTIAL_SUCCESS'
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                        }`}
                      >
                        {getStatusLabel(result.status)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="card bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500">
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          <Zap size={16} /> Co to dělá?
        </h4>
        <ul className="text-sm space-y-1 text-light-text dark:text-dark-text">
          <li>
            <strong>Test Generate:</strong> Zkouší vygenerovat transakce z aktivních recurring
            (pro ověření, že se generují správně)
          </li>
          <li>
            <strong>Safe Auto-Repair:</strong> Detekuje a archivuje chybné transakce (NIKDY NEMAZÁ!)
            — opravuje invalid fields, archivuje do archivedProblems
          </li>
          <li>
            <strong>Debug Recurring:</strong> Vrátí diagnostiku — kolik je aktivních, kolik čekajících,
            kolik s chybami
          </li>
        </ul>
      </div>
    </div>
  );
};
