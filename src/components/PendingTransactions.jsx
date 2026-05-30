import { useState, useEffect } from 'react';
import { Check, X, Edit2, RefreshCw, Zap } from 'lucide-react';
import { useAppStore } from '../utils/store';
import { db, auth } from '../utils/firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export const PendingTransactions = () => {
  const { session } = useAuth();
  const [pendingList, setPendingList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [generating, setGenerating] = useState(false);

  const addVydaj = useAppStore((s) => s.addVydaj);
  const addPrijem = useAppStore((s) => s.addPrijem);

  // Načti pending transakce
  useEffect(() => {
    const loadPending = async () => {
      if (!session?.uid) return;
      try {
        const snap = await getDocs(
          collection(db, 'users', session.uid, 'pendingTransactions')
        );
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPendingList(list);
      } catch (err) {
        console.error('Chyba při načítání pending transakcí:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPending();
  }, [session?.uid]);

  // Vygeneruj návrhy (testování)
  const handleGenerateTest = async () => {
    setGenerating(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        toast.error('Nejsi přihlášen');
        return;
      }

      const response = await fetch(
        'https://europe-west1-evidence-vydaju.cloudfunctions.net/testGenerateRecurring',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Chyba při generování');
      }

      toast.success(data.message);

      // Znovu načti pending
      if (data.generated > 0) {
        const snap = await getDocs(
          collection(db, 'users', session.uid, 'pendingTransactions')
        );
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPendingList(list);
      }
    } catch (err) {
      console.error('Chyba:', err);
      toast.error(err.message || 'Chyba při generování');
    } finally {
      setGenerating(false);
    }
  };

  // Schválí transakci
  const handleApprove = async (pending) => {
    try {
      const addFn = pending.type === 'vydaj' ? addVydaj : addPrijem;

      await addFn({
        nazev: pending.title,
        castka: pending.amount,
        datum: pending.generatedDate?.toDate?.()?.toISOString()?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        kategorie: pending.category,
      });

      // Smaž pending záznam
      await deleteDoc(doc(db, 'users', session.uid, 'pendingTransactions', pending.id));

      toast.success(`${pending.title} schválen ✓`);
      setPendingList((prev) => prev.filter((p) => p.id !== pending.id));
    } catch (err) {
      console.error('Chyba při schvalování:', err);
      toast.error('Chyba při schvalování transakce');
    }
  };

  // Smaž pending záznam
  const handleReject = async (id) => {
    try {
      await deleteDoc(doc(db, 'users', session.uid, 'pendingTransactions', id));
      toast.success('Záznam odstraněn');
      setPendingList((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error('Chyba při mazání:', err);
      toast.error('Chyba při mazání');
    }
  };

  // Uprav pending záznam
  const handleEditSave = async (pending) => {
    try {
      // Přidej upravenou verzi
      const addFn = editForm.type === 'vydaj' ? addVydaj : addPrijem;

      await addFn({
        nazev: editForm.title,
        castka: parseFloat(editForm.amount),
        datum: editForm.date,
        kategorie: editForm.category,
      });

      // Smaž pending záznam
      await deleteDoc(doc(db, 'users', session.uid, 'pendingTransactions', pending.id));

      toast.success(`${editForm.title} přidán ✓`);
      setPendingList((prev) => prev.filter((p) => p.id !== pending.id));
      setEditingId(null);
      setEditForm(null);
    } catch (err) {
      console.error('Chyba při úpravě:', err);
      toast.error('Chyba při úpravě transakce');
    }
  };

  if (loading) {
    return <div className="card text-center py-8">Načítám...</div>;
  }

  if (pendingList.length === 0) {
    return null;
  }

  return (
    <div className="card border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <RefreshCw size={20} className="text-blue-600 dark:text-blue-400" />
          <h3 className="text-lg font-semibold">
            {pendingList.length} čeká na schválení
          </h3>
        </div>
        <button
          onClick={handleGenerateTest}
          disabled={generating}
          className="flex items-center gap-2 px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-60"
          title="Testovat generování opakujících se transakcí"
        >
          <Zap size={16} />
          {generating ? 'Generuji...' : 'Test'}
        </button>
      </div>

      <div className="space-y-2">
        {pendingList.map((pending) => (
          <div
            key={pending.id}
            className="flex items-center justify-between p-3 bg-white dark:bg-dark-surface rounded-lg border border-blue-200 dark:border-blue-800"
          >
            {editingId === pending.id ? (
              <div className="flex-1 flex gap-2">
                <input
                  type="text"
                  className="input-field text-sm flex-1"
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, title: e.target.value }))
                  }
                />
                <input
                  type="number"
                  className="input-field text-sm w-24"
                  value={editForm.amount}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, amount: e.target.value }))
                  }
                />
              </div>
            ) : (
              <div className="flex-1">
                <div className="font-medium">{pending.title}</div>
                <div className="text-sm text-light-textMuted dark:text-dark-textMuted">
                  {pending.amount} Kč • {pending.category}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {editingId === pending.id ? (
                <>
                  <button
                    onClick={() => {
                      setEditingId(null);
                      setEditForm(null);
                    }}
                    className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-dark-bg rounded"
                  >
                    <X size={16} />
                  </button>
                  <button
                    onClick={() => handleEditSave(pending)}
                    className="p-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20 rounded"
                  >
                    <Check size={16} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setEditingId(pending.id);
                      setEditForm({
                        title: pending.title,
                        amount: pending.amount,
                        date: pending.generatedDate?.toDate?.()?.toISOString()?.slice(0, 10) || new Date().toISOString().slice(0, 10),
                        category: pending.category,
                        type: pending.type,
                      });
                    }}
                    className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded"
                    title="Upravit"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleApprove(pending)}
                    className="p-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20 rounded"
                    title="Schválit"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={() => handleReject(pending.id)}
                    className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                    title="Odmítnout"
                  >
                    <X size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
