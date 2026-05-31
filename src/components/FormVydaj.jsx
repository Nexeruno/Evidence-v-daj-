import { useState, useRef, useCallback } from 'react';
import { Plus, Repeat2, Heart } from 'lucide-react';
import { useAppStore } from '../utils/store';
import { KATEGORIE_VYDAJ_FORM, KATEGORIE_PRIJEM_FORM } from '../utils/constants';
import { RecurringModal } from './RecurringModal';
import { FavoritesModal } from './FavoritesModal';
import { useAuth } from '../context/AuthContext';
import { db } from '../utils/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

const todayISO = () => new Date().toISOString().slice(0, 10);

const validateForm = (form, label, isVydaj) => {
  const locusCases = { 'Výdaj': 'výdaje', 'Příjem': 'příjmu' };
  if (!form.nazev?.trim()) return `Název ${locusCases[label]} je povinný`;
  if (!form.castka || Number(form.castka) <= 0) return 'Částka musí být větší než 0';
  if (!form.datum) return 'Datum je povinné';
  if (!form.kategorie) return 'Kategorie je povinná';
  return null;
};

const Form = ({ typ }) => {
  const { session } = useAuth();
  const isVydaj   = typ === 'vydaj';
  const label     = isVydaj ? 'Výdaj' : 'Příjem';
  const kategorie = isVydaj ? KATEGORIE_VYDAJ_FORM : KATEGORIE_PRIJEM_FORM;
  const addItem   = useAppStore((s) => (isVydaj ? s.addVydaj : s.addPrijem));

  const nazevRef = useRef(null);

  const [form, setForm]     = useState({ nazev: '', castka: '', datum: todayISO(), kategorie: '' });
  const [saving, setSaving] = useState(false);
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  const [favoritesModalOpen, setFavoritesModalOpen] = useState(false);

  const set = useCallback(
    (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
    []
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    const error = validateForm(form, label, isVydaj);
    if (error) {
      toast.error(error);
      return;
    }

    setSaving(true);
    try {
      await addItem({ ...form, castka: Number(form.castka) });
      toast.success(`${label} přidán ✓`);
      setForm((f) => ({ ...f, nazev: '', castka: '' }));
      nazevRef.current?.focus();
    } catch (err) {
      console.error('Error adding item:', err);
      toast.error(err.message || `Chyba při přidání ${label.toLowerCase()}u`);
    } finally {
      setSaving(false);
    }
  };

  const handleSelectFavorite = (favorite) => {
    setForm({
      nazev: favorite.title,
      castka: favorite.amount.toString(),
      datum: form.datum,
      kategorie: favorite.category,
    });
    toast.success(`Nahrána oblíbená "${favorite.title}"`);
    nazevRef.current?.focus();
  };

  const handleQuickAdd = async (favorite) => {
    setSaving(true);
    try {
      await addItem({
        nazev: favorite.title,
        castka: favorite.amount,
        datum: todayISO(),
        kategorie: favorite.category,
      });
      toast.success(`${favorite.title} přidán ✓`);
    } catch (err) {
      console.error('Chyba při přidání:', err);
      toast.error('Chyba při přidání');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRecurring = async (recurring) => {
    const error = validateForm(form, label);
    if (error) {
      toast.error(error);
      return;
    }

    if (!session?.uid) {
      toast.error('Nejsi přihlášen');
      return;
    }

    setSaving(true);
    try {
      const recurringData = {
        title: form.nazev,
        type: typ,
        amount: Number(form.castka),
        category: form.kategorie,
        ...recurring,
        recurrenceStartDate: new Date(form.datum),
        recurrenceEndDate: recurring.recurrenceEndDate ? new Date(recurring.recurrenceEndDate) : null,
        lastGeneratedDate: new Date(form.datum),
        isActive: true,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'users', session.uid, 'repeatingTransactions'), recurringData);

      toast.success(`${label} nastaven/a na opakování${recurring.isFavorite ? ' a uložen/a jako oblíbený/á' : ''} ✓`);
      setForm((f) => ({ ...f, nazev: '', castka: '' }));
      setRecurringModalOpen(false);
      nazevRef.current?.focus();
    } catch (err) {
      console.error('Error saving recurring:', err);
      toast.error(err.message || 'Chyba při ukládání opakující se transakce');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h2 className="text-xl font-semibold mb-4">Přidat {label}</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          ref={nazevRef}
          type="text"
          placeholder={isVydaj ? 'Název výdaje' : 'Název příjmu'}
          className="input-field"
          value={form.nazev}
          onChange={set('nazev')}
          maxLength={100}
          autoFocus
        />
        <input
          type="number"
          placeholder="Částka (Kč)"
          className="input-field"
          value={form.castka}
          min="0.01"
          step="any"
          onChange={set('castka')}
        />
        <input
          type="date"
          className="input-field"
          value={form.datum}
          onChange={set('datum')}
        />
        <select
          className="select-field"
          value={form.kategorie}
          onChange={set('kategorie')}
        >
          <option value="" disabled>Vyberte kategorii</option>
          {kategorie.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Plus size={20} />
            {saving ? 'Ukládám...' : `Přidat ${label}`}
          </button>
          <button
            type="button"
            onClick={() => setFavoritesModalOpen(true)}
            disabled={saving}
            className="btn-secondary flex items-center justify-center gap-2 px-4 disabled:opacity-60"
            title="Načíst z oblíbených"
          >
            <Heart size={20} />
          </button>
          <button
            type="button"
            onClick={() => setRecurringModalOpen(true)}
            disabled={saving}
            className="btn-secondary flex items-center justify-center gap-2 px-4 disabled:opacity-60"
            title="Nastavit jako opakující se"
          >
            <Repeat2 size={20} />
          </button>
        </div>
      </form>

      {/* Poznámka — kategorie a datum se pamatují */}
      <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-3 text-center">
        Po přidání si aplikace zapamatuje kategorii a datum pro rychlejší zadání dalšího záznamu
      </p>

      {/* RecurringModal */}
      <RecurringModal
        isOpen={recurringModalOpen}
        onClose={() => setRecurringModalOpen(false)}
        onSave={handleSaveRecurring}
        typ={typ}
      />

      {/* FavoritesModal */}
      <FavoritesModal
        isOpen={favoritesModalOpen}
        onClose={() => setFavoritesModalOpen(false)}
        onSelect={handleSelectFavorite}
        onQuickAdd={handleQuickAdd}
        typ={typ}
      />
    </div>
  );
};

export const FormVydaj  = () => <Form typ="vydaj"  />;
export const FormPrijem = () => <Form typ="prijem" />;
