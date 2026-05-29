import { useState, useMemo } from 'react';
import { useAppStore } from '../utils/store';
import { ItemCardVydaj, ItemCardPrijem } from './ItemCard';
import { formatCastka, filterItems } from '../utils/formatters';
import { exportCSV } from '../utils/export';
import { Trash2, Download, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';

// Skeleton karta — zobrazí se při prvním načítání
const SkeletonCard = () => (
  <div className="card animate-pulse">
    <div className="flex justify-between items-center gap-4">
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-light-border dark:bg-dark-border rounded w-2/3" />
        <div className="h-3 bg-light-border dark:bg-dark-border rounded w-1/4" />
        <div className="h-5 bg-light-border dark:bg-dark-border rounded w-1/5 mt-1" />
      </div>
      <div className="h-6 bg-light-border dark:bg-dark-border rounded w-24 shrink-0" />
    </div>
  </div>
);

const Seznam = ({ typ }) => {
  const isVydaj    = typ === 'vydaj';
  const items      = useAppStore((s) => (isVydaj ? s.vydaje      : s.prijmy));
  const ready      = useAppStore((s) => (isVydaj ? s.vydajeReady : s.prijmyReady));
  const filtr      = useAppStore((s) => (isVydaj ? s.filtrVydaj  : s.filtryPrijem));
  const clearItems = useAppStore((s) => (isVydaj ? s.clearVydaje : s.clearPrijmy));

  const [search, setSearch] = useState('');

  const label        = isVydaj ? 'výdaje'     : 'příjmy';
  const labelHledat  = isVydaj ? 've výdajích' : 'v příjmech';
  const labelTitle = isVydaj ? 'Výdaje'  : 'Příjmy';
  const colorCls   = isVydaj
    ? 'text-red-600 dark:text-red-400'
    : 'text-green-600 dark:text-green-400';
  const ItemCard   = isVydaj ? ItemCardVydaj : ItemCardPrijem;

  // useMemo — filtrování jen při změně vstupu
  const filteredItems = useMemo(() => {
    const byFilter = filterItems(items, filtr.kategorie, filtr.mesic);
    const q = search.trim().toLowerCase();
    if (!q) return byFilter;
    return byFilter.filter((i) => i.nazev?.toLowerCase().includes(q));
  }, [items, filtr.kategorie, filtr.mesic, search]);

  const total = useMemo(
    () => filteredItems.reduce((s, i) => s + Number(i.castka || 0), 0),
    [filteredItems]
  );

  const handleClearAll = async () => {
    if (!confirm(`Smazat VŠECHNY ${label}? Tuto akci nelze vrátit!`)) return;
    try {
      await clearItems();
      setSearch('');
      toast.success(`Všechny ${label} smazány`);
    } catch {
      // chyba zobrazena v store
    }
  };

  return (
    <div>
      {/* Souhrnná karta */}
      <div className="card mb-4">
        <h3 className="text-sm font-medium text-light-textMuted dark:text-dark-textMuted mb-1">
          {labelTitle} celkem
        </h3>
        {ready ? (
          <>
            <p className={`text-3xl font-bold ${colorCls}`}>{formatCastka(total)}</p>
            <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-1">
              {filteredItems.length} {search ? `z ${items.length}` : ''} položek
              {search && (
                <span className="ml-1 text-blue-500">· hledáš: „{search}"</span>
              )}
            </p>
          </>
        ) : (
          <div className="animate-pulse space-y-2 mt-2">
            <div className="h-8 bg-light-border dark:bg-dark-border rounded w-32" />
            <div className="h-3 bg-light-border dark:bg-dark-border rounded w-20" />
          </div>
        )}
      </div>

      {/* Vyhledávání */}
      <div className="relative mb-4">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-light-textMuted dark:text-dark-textMuted pointer-events-none"
        />
        <input
          type="text"
          placeholder={`Hledat ${labelHledat}...`}
          className="input-field pr-9 text-sm"
          style={{ paddingLeft: '2.25rem' }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-light-textMuted dark:text-dark-textMuted hover:text-light-text dark:hover:text-dark-text transition-colors"
            aria-label="Smazat hledání"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <h2 className="text-2xl font-bold mb-4">Seznam {label}</h2>

      {/* Seznam / skeleton / prázdný stav */}
      <div className="space-y-3 mb-6">
        {!ready ? (
          // Skeleton — data se teprve načítají
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : filteredItems.length === 0 ? (
          <p className="text-center text-light-textMuted dark:text-dark-textMuted py-8">
            {search ? `Žádné výsledky pro „${search}"` : 'Nebyly nalezeny záznamy'}
          </p>
        ) : (
          filteredItems.map((item) => <ItemCard key={item.id} item={item} />)
        )}
      </div>

      {/* Akce */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => exportCSV({ filename: label, items: filteredItems, typ })}
          disabled={filteredItems.length === 0}
          className="btn-secondary flex items-center justify-center gap-2 flex-1 disabled:opacity-40"
        >
          <Download size={18} />
          Export CSV
        </button>
        {items.length > 0 && (
          <button
            onClick={handleClearAll}
            className="btn-danger flex items-center justify-center gap-2 flex-1"
          >
            <Trash2 size={18} />
            Vymazat vše
          </button>
        )}
      </div>
    </div>
  );
};

export const SeznamVydaj  = () => <Seznam typ="vydaj"  />;
export const SeznamPrijem = () => <Seznam typ="prijem" />;
