import { useState, useRef, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { useAppStore } from '../utils/store';
import { KATEGORIE_VYDAJ_FORM, KATEGORIE_PRIJEM_FORM } from '../utils/constants';
import toast from 'react-hot-toast';

const todayISO = () => new Date().toISOString().slice(0, 10);

const Form = ({ typ }) => {
  const isVydaj   = typ === 'vydaj';
  const label     = isVydaj ? 'Výdaj' : 'Příjem';
  const kategorie = isVydaj ? KATEGORIE_VYDAJ_FORM : KATEGORIE_PRIJEM_FORM;
  const addItem   = useAppStore((s) => (isVydaj ? s.addVydaj : s.addPrijem));

  const nazevRef = useRef(null);

  const [form, setForm]     = useState({ nazev: '', castka: '', datum: todayISO(), kategorie: '' });
  const [saving, setSaving] = useState(false);

  const set = useCallback(
    (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
    []
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nazev.trim())                       { toast.error(`Název ${label.toLowerCase()}e je povinný`); return; }
    if (!form.castka || Number(form.castka) <= 0) { toast.error('Částka musí být větší než 0');               return; }
    if (!form.datum)                              { toast.error('Datum je povinné');                           return; }
    if (!form.kategorie)                          { toast.error('Kategorie je povinná');                       return; }

    setSaving(true);
    try {
      await addItem({ ...form, castka: Number(form.castka) });
      toast.success(`${label} přidán ✓`);
      // Smaže jen název a částku — kategorie a datum zůstanou pro rychlé zadání dalšího
      setForm((f) => ({ ...f, nazev: '', castka: '' }));
      // Vrátí fokus na název pro okamžité zadání dalšího záznamu
      nazevRef.current?.focus();
    } catch {
      // chyba zobrazena v store
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
          placeholder={`Název ${label.toLowerCase()}e`}
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
        <button
          type="submit"
          disabled={saving}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Plus size={20} />
          {saving ? 'Ukládám...' : `Přidat ${label}`}
        </button>
      </form>

      {/* Hint — kategorie a datum se pamatují */}
      <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-3 text-center">
        Po přidání zůstane kategorie a datum pro rychlé zadání dalšího záznamu
      </p>
    </div>
  );
};

export const FormVydaj  = () => <Form typ="vydaj"  />;
export const FormPrijem = () => <Form typ="prijem" />;
