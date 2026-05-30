import { useState, useEffect } from 'react';
import { Check, X, Edit2, RefreshCw, Zap } from 'lucide-react';
import { useAppStore } from '../utils/store';
import { db, auth } from '../utils/firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const callCloudFunction = async (url, method = 'GET') => {
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
};

export const PendingTransactions = () => {
  const { session } = useAuth();
  const [pendingList, setPendingList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [debugging, setDebugging] = useState(false);

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

  // Debug - zjistit co se děje
  const handleDebug = async () => {
    setDebugging(true);
    try {
      const data = await callCloudFunction(
        'https://europe-west1-evidence-vydaju.cloudfunctions.net/debugRecurring'
      );

      if (data.recurringCount === 0) {
        toast.error('❌ Nemáš žádné opakující se transakce! Vytvoř si jednu (⏰ tlačítko)');
      } else {
        toast.error(
          `🐛 Máš ${data.recurringCount} opakujících se transakcí\n` +
          `${data.issues.join('\n')}`
        );
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDebugging(false);
    }
  };

  // Vyčisti duplikáty a oprav data
  const handleCleanup = async () => {
    setCleaning(true);
    try {
      const data = await callCloudFunction(
        'https://europe-west1-evidence-vydaju.cloudfunctions.net/cleanupDuplicates',
        'POST'
      );

      toast.success(`🧹 ${data.message}\n✓ Smazáno ${data.deleted}, opraveno ${data.fixed}`);

      // Znovu načti pending
      const snap = await getDocs(
        collection(db, 'users', session.uid, 'pendingTransactions')
      );
      setPendingList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCleaning(false);
    }
  };

  // Vygeneruj návrhy (testování)
  const handleGenerateTest = async () => {
    setGenerating(true);
    try {
      const data = await callCloudFunction(
        'https://europe-west1-evidence-vydaju.cloudfunctions.net/testGenerateRecurring',
        'POST'
      );

      toast.success(data.message);

      // Znovu načti pending
      if (data.generated > 0) {
        const snap = await getDocs(
          collection(db, 'users', session.uid, 'pendingTransactions')
        );
        setPendingList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    } catch (err) {
      toast.error(err.message);
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

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        {pendingList.length > 0 && (
          <h3 className="text-lg font-semibold">
            {pendingList.length} čeká na schválení
          </h3>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={handleDebug}
            disabled={debugging}
            className="flex items-center gap-2 px-3 py-1 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-60"
            title="Zkontrolovat co se děje s opakujícími se transakcemi"
          >
            🐛
            {debugging ? 'Debuguji...' : 'Debug'}
          </button>
          <button
            onClick={handleCleanup}
            disabled={cleaning}
            className="flex items-center gap-2 px-3 py-1 text-sm bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors disabled:opacity-60"
            title="Vyčistit duplikáty a opravit data"
          >
            🧹
            {cleaning ? 'Čištění...' : 'Cleanup'}
          </button>
          <button
            onClick={handleGenerateTest}
            disabled={generating}
            className="flex items-center gap-2 px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-60"
            title="Vygenerovat návrhy z opakujících se transakcí"
          >
            <Zap size={16} />
            {generating ? 'Generuji...' : 'Test'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-center py-8 text-light-textMuted dark:text-dark-textMuted">
          Načítám...
        </p>
      ) : pendingList.length === 0 ? (
        <p className="text-center py-8 text-light-textMuted dark:text-dark-textMuted">
          Žádné záznamy čekající na schválení
        </p>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-light-border dark:border-dark-border text-left text-light-textMuted dark:text-dark-textMuted">
                <th className="pb-3 font-medium">Název</th>
                <th className="pb-3 font-medium text-right">Částka</th>
                <th className="pb-3 font-medium">Kategorie</th>
                <th className="pb-3 font-medium text-center">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-light-border dark:divide-dark-border">
              {pendingList.map((pending) => (
                <tr
                  key={pending.id}
                  className="hover:bg-light-bg dark:hover:bg-dark-bg transition-colors"
                >
                  {editingId === pending.id ? (
                    <>
                      <td className="py-3">
                        <input
                          type="text"
                          className="input-field text-sm"
                          value={editForm.title}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, title: e.target.value }))
                          }
                        />
                      </td>
                      <td className="py-3 text-right">
                        <input
                          type="number"
                          className="input-field text-sm w-24"
                          value={editForm.amount}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, amount: e.target.value }))
                          }
                        />
                      </td>
                      <td className="py-3">
                        <input
                          type="text"
                          className="input-field text-sm"
                          value={editForm.category}
                          disabled
                        />
                      </td>
                      <td className="py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setEditingId(null);
                              setEditForm(null);
                            }}
                            className="p-1 text-gray-600 hover:bg-gray-100 dark:hover:bg-dark-bg rounded"
                            title="Zrušit"
                          >
                            <X size={16} />
                          </button>
                          <button
                            onClick={() => handleEditSave(pending)}
                            className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20 rounded"
                            title="Uložit"
                          >
                            <Check size={16} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-3 font-medium">{pending.title}</td>
                      <td className="py-3 text-right font-medium">{pending.amount} Kč</td>
                      <td className="py-3 text-light-textMuted dark:text-dark-textMuted">
                        {pending.category}
                      </td>
                      <td className="py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
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
                            className="p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded"
                            title="Upravit"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleApprove(pending)}
                            className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20 rounded"
                            title="Schválit"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() => handleReject(pending.id)}
                            className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                            title="Odmítnout"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
