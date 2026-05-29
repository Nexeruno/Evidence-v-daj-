import { Trash2 } from 'lucide-react';
import { formatDatum, formatCastka, getCategoryColor, getCategoryLabel } from '../utils/formatters';
import { useAppStore } from '../utils/store';
import toast from 'react-hot-toast';

const ItemCard = ({ item, typ }) => {
  const isVydaj   = typ === 'vydaj';
  const removeItem = useAppStore((s) => (isVydaj ? s.removeVydaj : s.removePrijem));
  const amountCls  = isVydaj
    ? 'text-red-600 dark:text-red-400'
    : 'text-green-600 dark:text-green-400';
  const label = isVydaj ? 'výdaj' : 'příjem';

  const handleDelete = async () => {
    if (!confirm(`Opravdu smazat tento ${label}?`)) return;
    try {
      await removeItem(item.id);
      toast.success(`${label.charAt(0).toUpperCase() + label.slice(1)} smazán`);
    } catch {
      // chyba zobrazena v store
    }
  };

  return (
    <div className="card flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-light-text dark:text-dark-text truncate">{item.nazev}</p>
        <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-1">{formatDatum(item.datum)}</p>
        <div className={`mt-2 w-fit px-2 py-1 rounded text-xs font-medium ${getCategoryColor(item.kategorie)}`}>
          {getCategoryLabel(item.kategorie)}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <p className={`font-bold ${amountCls} text-lg`}>{formatCastka(item.castka)}</p>
        <button
          onClick={handleDelete}
          className="p-2 hover:bg-light-bg dark:hover:bg-dark-bg rounded transition-colors"
          aria-label={`Smazat ${label}`}
        >
          <Trash2 size={18} className="text-red-500" />
        </button>
      </div>
    </div>
  );
};

export const ItemCardVydaj  = ({ item }) => <ItemCard item={item} typ="vydaj"  />;
export const ItemCardPrijem = ({ item }) => <ItemCard item={item} typ="prijem" />;
