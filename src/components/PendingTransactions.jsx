import { useState, useEffect, useCallback } from 'react';
import { Check, X, Edit2, Zap, AlertCircle, Clock, TrendingUp, TrendingDown, CheckCircle, RefreshCw } from 'lucide-react';
import { useAppStore } from '../utils/store';
import { db, auth } from '../utils/firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

// ═══════════════════════════════════════════════════════════════════════════════
// 🛠️ CLOUD FUNCTION HELPER s retry mechanismem
// ═══════════════════════════════════════════════════════════════════════════════

const callCloudFunction = async (url, method = 'GET', maxRetries = 2) => {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Nejsi přihlášen');

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Chyba v požadavku');
      return data;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  throw lastError;
};

// ═══════════════════════════════════════════════════════════════════════════════
// 📊 UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const groupByType = (list) => {
  return {
    vydaj: list.filter(p => p.type === 'vydaj'),
    prijem: list.filter(p => p.type === 'prijem'),
  };
};

const sortByDate = (list) => {
  return [...list].sort((a, b) => {
    const dateA = a.generatedDate?.toDate?.() || new Date(a.generatedDate);
    const dateB = b.generatedDate?.toDate?.() || new Date(b.generatedDate);
    return dateB - dateA;
  });
};

const formatDate = (date) => {
  const d = date?.toDate?.() || new Date(date);
  return d.toLocaleDateString('cs-CZ', { month: 'short', day: 'numeric' });
};

// ═══════════════════════════════════════════════════════════════════════════════
// 🎨 STATISTICS CARD
// ═══════════════════════════════════════════════════════════════════════════════

const StatsCard = ({ data }) => {
  const totalVydaj = data.vydaj.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalPrijem = data.prijem.reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div className="grid grid-cols-2 gap-3 mb-4">
      <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
        <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm font-medium">
          <TrendingDown size={16} />
          Výdaje ({data.vydaj.length})
        </div>
        <div className="text-lg font-bold text-red-600 dark:text-red-400 mt-1">
          {totalVydaj.toLocaleString('cs-CZ')} Kč
        </div>
      </div>

      <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-medium">
          <TrendingUp size={16} />
          Příjmy ({data.prijem.length})
        </div>
        <div className="text-lg font-bold text-green-600 dark:text-green-400 mt-1">
          {totalPrijem.toLocaleString('cs-CZ')} Kč
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 📋 TRANSACTION ROW
// ═══════════════════════════════════════════════════════════════════════════════

const TransactionRow = ({ pending, isEditing, editForm, onEdit, onSave, onCancel, onApprove, onReject }) => {
  if (isEditing) {
    return (
      <tr className="bg-blue-50 dark:bg-blue-900/20">
        <td className="py-3 px-4">
          <input
            type="text"
            className="input-field text-sm"
            value={editForm.title}
            onChange={(e) => onEdit({ ...editForm, title: e.target.value })}
          />
        </td>
        <td className="py-3 px-4 text-right">
          <input
            type="number"
            className="input-field text-sm w-24"
            value={editForm.amount}
            onChange={(e) => onEdit({ ...editForm, amount: e.target.value })}
          />
        </td>
        <td className="py-3 px-4 text-sm text-light-textMuted dark:text-dark-textMuted">
          {editForm.category}
        </td>
        <td className="py-3 px-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={onCancel}
              className="p-1 text-gray-600 hover:bg-gray-100 dark:hover:bg-dark-bg rounded"
              title="Zrušit"
            >
              <X size={16} />
            </button>
            <button
              onClick={onSave}
              className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20 rounded"
              title="Uložit"
            >
              <Check size={16} />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-light-bg dark:hover:bg-dark-bg transition-colors border-b border-light-border dark:border-dark-border last:border-b-0">
      <td className="py-3 px-4 font-medium">{pending.title}</td>
      <td className="py-3 px-4 text-right font-medium">
        {pending.amount.toLocaleString('cs-CZ')} Kč
      </td>
      <td className="py-3 px-4 text-sm text-light-textMuted dark:text-dark-textMuted">
        <span className="inline-block bg-light-border dark:bg-dark-border px-2 py-1 rounded">
          {pending.category}
        </span>
      </td>
      <td className="py-3 px-4 text-center">
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => onEdit(pending)}
            className="p-1.5 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded transition"
            title="Upravit"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={() => onApprove(pending)}
            className="p-1.5 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20 rounded transition"
            title="Schválit"
          >
            <Check size={16} />
          </button>
          <button
            onClick={() => onReject(pending.id)}
            className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition"
            title="Odmítnout"
          >
            <X size={16} />
          </button>
        </div>
      </td>
    </tr>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 📊 SECTION - VYDAJE nebo PŘÍJMY
// ═══════════════════════════════════════════════════════════════════════════════

const TransactionSection = ({ title, icon: Icon, items, isEditing, editForm, onEdit, onSave, onCancel, onApprove, onReject, color }) => {
  if (items.length === 0) return null;

  return (
    <div className="mb-6">
      <div className={`flex items-center gap-2 mb-3 pb-2 border-b-2 border-${color}-300 dark:border-${color}-700`}>
        <Icon size={20} className={`text-${color}-600 dark:text-${color}-400`} />
        <h4 className={`text-lg font-semibold text-${color}-700 dark:text-${color}-400`}>
          {title} ({items.length})
        </h4>
      </div>

      <div className="overflow-x-auto -mx-4 px-4 mb-4">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-light-border dark:border-dark-border text-left text-light-textMuted dark:text-dark-textMuted text-xs uppercase tracking-wider">
              <th className="pb-2 font-semibold">Název</th>
              <th className="pb-2 font-semibold text-right">Částka</th>
              <th className="pb-2 font-semibold">Kategorie</th>
              <th className="pb-2 font-semibold text-center">Akce</th>
            </tr>
          </thead>
          <tbody>
            {items.map((pending) => (
              <TransactionRow
                key={pending.id}
                pending={pending}
                isEditing={isEditing.id === pending.id}
                editForm={isEditing.id === pending.id ? isEditing.form : {}}
                onEdit={(form) => onEdit(pending.id, form)}
                onSave={() => onSave(pending)}
                onCancel={() => onEdit(null, null)}
                onApprove={onApprove}
                onReject={onReject}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const PendingTransactions = () => {
  const { session } = useAuth();
  const [userDoc, setUserDoc] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingList, setPendingList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [debugging, setDebugging] = useState(false);

  const addVydaj = useAppStore((s) => s.addVydaj);
  const addPrijem = useAppStore((s) => s.addPrijem);

  // Check admin role
  useEffect(() => {
    if (!session?.uid) return;
    const checkAdmin = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const doc = snap.docs.find(d => d.id === session.uid);
        if (doc) {
          setUserDoc(doc.data());
          setIsAdmin(doc.data()?.role === 'admin');
        }
      } catch (err) {
        console.error('Error checking admin:', err);
      }
    };
    checkAdmin();
  }, [session?.uid]);

  // Load pending transactions
  const loadPending = useCallback(async () => {
    if (!session?.uid) return;
    try {
      const snap = await getDocs(
        collection(db, 'users', session.uid, 'pendingTransactions')
      );
      setPendingList(sortByDate(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    } catch (err) {
      console.error('❌ Error loading pending:', err);
      toast.error('Chyba při načítání čekajících transakcí');
    } finally {
      setLoading(false);
    }
  }, [session?.uid]);

  // Auto-refresh interval
  useEffect(() => {
    loadPending();

    if (!autoRefreshEnabled) return;

    const interval = setInterval(() => {
      loadPending();
    }, 30000); // Refresh každých 30 sekund

    return () => clearInterval(interval);
  }, [loadPending, autoRefreshEnabled]);

  // Debug
  const handleDebug = async () => {
    setDebugging(true);
    try {
      const data = await callCloudFunction(
        'https://europe-west1-evidence-vydaju.cloudfunctions.net/debugRecurring'
      );

      if (data.recurringCount === 0) {
        toast.error('❌ Nemáš opakující se transakce! Vytvoř si jednu (⏰)');
      } else {
        toast.error(
          `🐛 Máš ${data.recurringCount} opakujících se transakcí\n${data.issues.join('\n')}`
        );
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDebugging(false);
    }
  };

  // Generate test
  const handleGenerateTest = async () => {
    setGenerating(true);
    try {
      const data = await callCloudFunction(
        'https://europe-west1-evidence-vydaju.cloudfunctions.net/testGenerateRecurring',
        'POST'
      );

      toast.success(data.message);
      if (data.generated > 0) {
        await loadPending();
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  // Edit handler
  const handleEditStart = (pending) => {
    setEditingId(pending.id);
    setEditForm({
      title: pending.title,
      amount: pending.amount,
      category: pending.category,
      type: pending.type,
      date: pending.generatedDate?.toDate?.()?.toISOString()?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    });
  };

  const handleEditChange = (id, form) => {
    if (id) {
      setEditingId(id);
      setEditForm(form);
    } else {
      setEditingId(null);
      setEditForm(null);
    }
  };

  // Approve handler
  const handleApprove = async (pending) => {
    try {
      const addFn = pending.type === 'vydaj' ? addVydaj : addPrijem;
      await addFn({
        nazev: pending.title,
        castka: pending.amount,
        datum: pending.generatedDate?.toDate?.()?.toISOString()?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        kategorie: pending.category,
      });

      await deleteDoc(doc(db, 'users', session.uid, 'pendingTransactions', pending.id));
      toast.success(`${pending.title} schválen ✓`);
      setPendingList((prev) => prev.filter((p) => p.id !== pending.id));
    } catch (err) {
      console.error('❌ Error approving:', err);
      toast.error(err.message || 'Chyba při schvalování');
    }
  };

  // Reject handler
  const handleReject = async (id) => {
    try {
      await deleteDoc(doc(db, 'users', session.uid, 'pendingTransactions', id));
      toast.success('Záznam odstraněn');
      setPendingList((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error('❌ Error rejecting:', err);
      toast.error('Chyba při mazání');
    }
  };

  // Save edit handler
  const handleEditSave = async (pending) => {
    try {
      const addFn = editForm.type === 'vydaj' ? addVydaj : addPrijem;
      await addFn({
        nazev: editForm.title,
        castka: parseFloat(editForm.amount),
        datum: editForm.date,
        kategorie: editForm.category,
      });

      await deleteDoc(doc(db, 'users', session.uid, 'pendingTransactions', pending.id));
      toast.success(`${editForm.title} přidán ✓`);
      setPendingList((prev) => prev.filter((p) => p.id !== pending.id));
      setEditingId(null);
      setEditForm(null);
    } catch (err) {
      console.error('❌ Error saving edit:', err);
      toast.error(err.message || 'Chyba při úpravě');
    }
  };

  const grouped = groupByType(pendingList);
  const isEmpty = pendingList.length === 0;

  return (
    <div className="card">
      {/* Header s kontrolami */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-light-border dark:border-dark-border">
        <div className="flex items-center gap-3">
          <Clock size={24} className="text-blue-600 dark:text-blue-400" />
          <div>
            <h3 className="text-lg font-semibold">⏳ Čeká na schválení</h3>
            {!isEmpty && (
              <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-1">
                Celkem {pendingList.length} transakcí čeká na tvé rozhodnutí
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Auto-refresh pro všechny */}
          <button
            onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
            className={`p-2 rounded transition ${
              autoRefreshEnabled
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'bg-gray-100 dark:bg-dark-border text-gray-600 dark:text-dark-textMuted'
            }`}
            title={autoRefreshEnabled ? 'Auto-refresh: ON' : 'Auto-refresh: OFF'}
          >
            <RefreshCw size={18} />
          </button>

          {/* Admin-only tlačítka */}
          {isAdmin && (
            <>
              <button
                onClick={handleDebug}
                disabled={debugging}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-60"
                title="🔐 ADMIN ONLY - Diagnostika"
              >
                🐛
                {debugging ? 'Debug...' : 'Debug'}
              </button>

              <button
                onClick={handleGenerateTest}
                disabled={generating}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-60"
                title="🔐 ADMIN ONLY - Vygenerovat test"
              >
                <Zap size={16} />
                {generating ? 'Test...' : 'Test'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-12 text-center text-light-textMuted dark:text-dark-textMuted">
          <div className="inline-block animate-spin">⏳</div>
          <p className="mt-2">Načítám čekající transakce...</p>
        </div>
      ) : isEmpty ? (
        <div className="py-12 text-center">
          <CheckCircle size={48} className="mx-auto text-green-500 mb-3 opacity-50" />
          <p className="text-lg font-medium">Žádné čekající transakce!</p>
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted mt-2">
            Skvělé! Všechny transakce jsou schválené. 🎉
          </p>
        </div>
      ) : (
        <>
          {/* Statistiky */}
          <StatsCard data={grouped} />

          {/* Výdaje */}
          <TransactionSection
            title="Výdaje"
            icon={TrendingDown}
            items={grouped.vydaj}
            isEditing={{ id: editingId, form: editForm }}
            onEdit={handleEditChange}
            onSave={handleEditSave}
            onCancel={() => handleEditChange(null, null)}
            onApprove={handleApprove}
            onReject={handleReject}
            color="red"
          />

          {/* Příjmy */}
          <TransactionSection
            title="Příjmy"
            icon={TrendingUp}
            items={grouped.prijem}
            isEditing={{ id: editingId, form: editForm }}
            onEdit={handleEditChange}
            onSave={handleEditSave}
            onCancel={() => handleEditChange(null, null)}
            onApprove={handleApprove}
            onReject={handleReject}
            color="green"
          />
        </>
      )}
    </div>
  );
};
