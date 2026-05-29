import { useAppStore } from '../utils/store';
import { MESICE, KATEGORIE_VYDAJ, KATEGORIE_PRIJEM } from '../utils/constants';

const FilterBar = ({ typ }) => {
  const isVydaj = typ === 'vydaj';
  const filtr    = useAppStore((s) => (isVydaj ? s.filtrVydaj   : s.filtryPrijem));
  const setFiltr = useAppStore((s) => (isVydaj ? s.setFiltrVydaj : s.setFiltrPrijem));
  const kategorie = isVydaj ? KATEGORIE_VYDAJ : KATEGORIE_PRIJEM;

  return (
    <div className="card flex flex-col sm:flex-row gap-4">
      <div className="flex-1">
        <label className="text-sm font-medium text-light-textMuted dark:text-dark-textMuted mb-2 block">Kategorie</label>
        <select
          className="select-field"
          value={filtr.kategorie}
          onChange={(e) => setFiltr({ kategorie: e.target.value })}
        >
          {kategorie.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
      </div>
      <div className="flex-1">
        <label className="text-sm font-medium text-light-textMuted dark:text-dark-textMuted mb-2 block">Měsíc</label>
        <select
          className="select-field"
          value={filtr.mesic}
          onChange={(e) => setFiltr({ mesic: e.target.value })}
        >
          {MESICE.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
};

export const FilterBarVydaj  = () => <FilterBar typ="vydaj"  />;
export const FilterBarPrijem = () => <FilterBar typ="prijem" />;
