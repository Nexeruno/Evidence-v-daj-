import { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc, orderBy, query } from 'firebase/firestore';
import { db, auth } from '../../utils/firebase';
import { firebaseConfig } from '../../config/firebase-config';
import { useAuth } from '../../context/AuthContext';
import { formatDatum } from '../../utils/formatters';
import { Users, ShieldCheck, ShieldOff, RefreshCw, KeyRound, Pencil, Ban, Trash2, Check } from 'lucide-react';
import toast from 'react-hot-toast';

export const AdminPage = () => {
  const { session } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUid, setEditingUid] = useState(null);
  const [editValue, setEditValue] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
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
      console.error(err);
      toast.error('Chyba při načítání uživatelů');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleResetPassword = async (email) => {
    if (!confirm(`Odeslat reset hesla na ${email}?`)) return;

    const projectId = firebaseConfig.projectId;
    const url = `https://europe-west1-${projectId}.cloudfunctions.net/posliResetHesla`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error('Chyba při odesílání resetu hesla');
      }

      toast.success(`Reset hesla odeslán na ${email}`);
    } catch (err) {
      console.error('Reset hesla error:', err);
      toast.error('Chyba při odesílání resetu hesla');
    }
  };

  const toggleRole = async (uid, currentRole) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, role: newRole } : u))
      );
      toast.success(`Role změněna na: ${newRole}`);
    } catch {
      toast.error('Chyba při změně role');
    }
  };

  const handleDeleteUser = async (uid, email) => {
    if (!window.confirm(`Opravdu smazat účet ${email}? Všechna data budou trvale smazána!`)) return;

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Nemáš oprávnění');

      const projectId = firebaseConfig.projectId;
      const url = `https://europe-west1-${projectId}.cloudfunctions.net/smazUzivatele`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, idToken }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Chyba při smazání uživatele');
      }

      setUsers((prev) => prev.filter((u) => u.uid !== uid));
      toast.success(`Uživatel ${email} smazán`);
    } catch (err) {
      console.error('Delete error:', err);
      toast.error(err.message || 'Chyba při smazání uživatele');
    }
  };

  const handleBlockUser = async (uid, currentDisabled) => {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Nemáš oprávnění');

      const projectId = firebaseConfig.projectId;
      const url = `https://europe-west1-${projectId}.cloudfunctions.net/zablokujUzivatele`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, blocked: !currentDisabled, idToken }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Chyba při blokování uživatele');
      }

      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, disabled: !currentDisabled } : u))
      );
      toast.success(!currentDisabled ? 'Uživatel blokován' : 'Uživatel odblokován');
    } catch (err) {
      console.error('Block error:', err);
      toast.error(err.message || 'Chyba při blokování uživatele');
    }
  };

  const handleEditUsername = async (uid, newUsername) => {
    if (!newUsername.trim()) return;
    if (newUsername.length < 3 || newUsername.length > 20) {
      toast.error('Jméno musí mít 3–20 znaků');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
      toast.error('Jméno může obsahovat jen písmena, číslice a _');
      return;
    }

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Nemáš oprávnění');

      const projectId = firebaseConfig.projectId;
      const url = `https://europe-west1-${projectId}.cloudfunctions.net/aktualizujUzivatele`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, username: newUsername, idToken }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Chyba při editaci uživatele');
      }

      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, username: newUsername } : u))
      );
      setEditingUid(null);
      toast.success(`Jméno změněno na: ${newUsername}`);
    } catch (err) {
      console.error('Edit error:', err);
      toast.error(err.message || 'Chyba při editaci uživatele');
    }
  };

  if (!session?.isAdmin) {
    return (
      <div className="card text-center py-12 text-light-textMuted dark:text-dark-textMuted">
        Nemáš oprávnění k zobrazení admin panelu.
      </div>
    );
  }

  const adminCount = users.filter((u) => u.role === 'admin').length;
  const userCount = users.filter((u) => u.role !== 'admin').length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card border-l-4 border-blue-500">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Celkem uživatelů</p>
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">{users.length}</p>
        </div>
        <div className="card border-l-4 border-green-500">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Běžní uživatelé</p>
          <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">{userCount}</p>
        </div>
        <div className="card border-l-4 border-purple-500">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Administrátoři</p>
          <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-1">{adminCount}</p>
        </div>
        <div className="card border-l-4 border-orange-500">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Celkem záznamů</p>
          <p className="text-3xl font-bold text-orange-600 dark:text-orange-400 mt-1">
            {users.reduce((s, u) => s + (u.vydajeCount || 0) + (u.prijmyCount || 0), 0)}
          </p>
        </div>
      </div>

      {/* Users table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Users size={20} />
            Registrovaní uživatelé
          </h3>
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="p-2 rounded-lg bg-light-bg dark:bg-dark-bg hover:bg-light-border dark:hover:bg-dark-border transition-colors disabled:opacity-50"
            aria-label="Obnovit"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading ? (
          <p className="text-center text-light-textMuted dark:text-dark-textMuted py-8">Načítání...</p>
        ) : users.length === 0 ? (
          <p className="text-center text-light-textMuted dark:text-dark-textMuted py-8">Žádní uživatelé</p>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-light-border dark:border-dark-border text-left text-light-textMuted dark:text-dark-textMuted">
                  <th className="pb-3 font-medium">Jméno</th>
                  <th className="pb-3 font-medium">Email</th>
                  <th className="pb-3 font-medium">UID</th>
                  <th className="pb-3 font-medium">Registrace</th>
                  <th className="pb-3 font-medium">Poslední login</th>
                  <th className="pb-3 font-medium text-center">Loginů</th>
                  <th className="pb-3 font-medium text-center">Výdaje</th>
                  <th className="pb-3 font-medium text-center">Příjmy</th>
                  <th className="pb-3 font-medium text-center">Role</th>
                  <th className="pb-3 font-medium text-center">Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-light-border dark:divide-dark-border">
                {users.map((user) => (
                  <tr key={user.uid} className="hover:bg-light-bg dark:hover:bg-dark-bg transition-colors">
                    <td className="py-3 font-medium">
                      {editingUid === user.uid ? (
                        <input
                          autoFocus
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleEditUsername(user.uid, editValue)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleEditUsername(user.uid, editValue);
                            if (e.key === 'Escape') setEditingUid(null);
                          }}
                          className="input-field py-1 px-2"
                          maxLength={20}
                        />
                      ) : (
                        user.username || '—'
                      )}
                    </td>
                    <td className="py-3 text-light-textMuted dark:text-dark-textMuted">{user.email}</td>
                    <td className="py-3 font-mono text-xs text-light-textMuted dark:text-dark-textMuted">
                      {user.uid.slice(0, 10)}…
                    </td>
                    <td className="py-3 text-light-textMuted dark:text-dark-textMuted">
                      {user.createdAt
                        ? formatDatum(String(user.createdAt).slice(0, 10))
                        : '—'}
                    </td>
                    <td className="py-3 text-light-textMuted dark:text-dark-textMuted">
                      {user.lastLogin
                        ? formatDatum(String(user.lastLogin).slice(0, 10))
                        : '—'}
                    </td>
                    <td className="py-3 text-center text-light-textMuted dark:text-dark-textMuted">
                      {user.loginCount ?? 0}
                    </td>
                    <td className="py-3 text-center">{user.vydajeCount ?? 0}</td>
                    <td className="py-3 text-center">{user.prijmyCount ?? 0}</td>
                    <td className="py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            user.role === 'admin'
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {user.role === 'admin' ? 'admin' : 'user'}
                        </span>
                        {user.disabled && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
                            blokován
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {/* Reset hesla */}
                        <button
                          onClick={() => handleResetPassword(user.email)}
                          title="Odeslat reset hesla"
                          className="p-1.5 rounded hover:bg-light-border dark:hover:bg-dark-border transition-colors"
                        >
                          <KeyRound size={16} className="text-blue-500" />
                        </button>
                        {/* Edit username */}
                        {user.uid !== session.uid && (
                          <button
                            onClick={() => {
                              setEditingUid(user.uid);
                              setEditValue(user.username || '');
                            }}
                            title="Editovat jméno"
                            className="p-1.5 rounded hover:bg-light-border dark:hover:bg-dark-border transition-colors"
                          >
                            <Pencil size={16} className="text-gray-500" />
                          </button>
                        )}
                        {/* Block user */}
                        {user.uid !== session.uid && (
                          <button
                            onClick={() => handleBlockUser(user.uid, user.disabled)}
                            title={user.disabled ? 'Odblokovat' : 'Blokovat'}
                            className="p-1.5 rounded hover:bg-light-border dark:hover:bg-dark-border transition-colors"
                          >
                            {user.disabled ? (
                              <Check size={16} className="text-green-500" />
                            ) : (
                              <Ban size={16} className="text-red-500" />
                            )}
                          </button>
                        )}
                        {/* Delete user */}
                        {user.uid !== session.uid && (
                          <button
                            onClick={() => handleDeleteUser(user.uid, user.email)}
                            title="Smazat účet"
                            className="p-1.5 rounded hover:bg-light-border dark:hover:bg-dark-border transition-colors"
                          >
                            <Trash2 size={16} className="text-red-600" />
                          </button>
                        )}
                        {user.uid === session.uid && (
                          <span className="text-xs text-light-textMuted dark:text-dark-textMuted">ty</span>
                        )}
                        {/* Role toggle */}
                        {user.uid !== session.uid && (
                          <button
                            onClick={() => toggleRole(user.uid, user.role)}
                            title={user.role === 'admin' ? 'Odebrat admin' : 'Přidat admin'}
                            className="p-1.5 rounded hover:bg-light-border dark:hover:bg-dark-border transition-colors"
                          >
                            {user.role === 'admin' ? (
                              <ShieldOff size={16} className="text-red-500" />
                            ) : (
                              <ShieldCheck size={16} className="text-purple-500" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
