import { useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';

export const RecurringModal = ({ isOpen, onClose, onSave, typ }) => {
  const [recurring, setRecurring] = useState({
    recurrenceType: 'monthly',
    recurrenceFrequency: 1,
    recurrenceDay: 1,
    recurrenceDays: [1],
    recurrenceEndDate: null,
    isFavorite: false,
  });

  const handleSave = async () => {
    if (recurring.recurrenceEndDate) {
      const endDate = new Date(recurring.recurrenceEndDate);
      if (endDate < new Date()) {
        toast.error('Datum konce musí být v budoucnosti');
        return;
      }
    }

    await onSave(recurring);
    setRecurring({
      recurrenceType: 'monthly',
      recurrenceFrequency: 1,
      recurrenceDay: 1,
      recurrenceDays: [1],
      recurrenceEndDate: null,
      isFavorite: false,
    });
    onClose();
  };

  if (!isOpen) return null;

  const daysOfWeek = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-light-bg dark:bg-dark-bg rounded-lg max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border sticky top-0 bg-light-bg dark:bg-dark-bg">
          <h2 className="text-lg font-semibold">Opakující se transakce</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-light-border dark:hover:bg-dark-border rounded"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Typ opakování */}
          <div>
            <label className="block text-sm font-medium mb-2">Typ opakování</label>
            <select
              className="select-field"
              value={recurring.recurrenceType}
              onChange={(e) =>
                setRecurring((r) => ({ ...r, recurrenceType: e.target.value }))
              }
            >
              <option value="daily">Denně</option>
              <option value="weekly">Týdně</option>
              <option value="monthly">Měsíčně</option>
              <option value="yearly">Ročně</option>
            </select>
          </div>

          {/* Frekvence */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Každých N {
                recurring.recurrenceType === 'daily'
                  ? 'dnů'
                  : recurring.recurrenceType === 'weekly'
                  ? 'týdnů'
                  : recurring.recurrenceType === 'monthly'
                  ? 'měsíců'
                  : 'roků'
              }
            </label>
            <input
              type="number"
              className="input-field"
              min="1"
              value={recurring.recurrenceFrequency}
              onChange={(e) =>
                setRecurring((r) => ({
                  ...r,
                  recurrenceFrequency: parseInt(e.target.value) || 1,
                }))
              }
            />
          </div>

          {/* Den pro týdenní opakování */}
          {recurring.recurrenceType === 'weekly' && (
            <div>
              <label className="block text-sm font-medium mb-2">Dny v týdnu</label>
              <div className="grid grid-cols-7 gap-2">
                {daysOfWeek.map((day, idx) => (
                  <button
                    key={idx}
                    onClick={() =>
                      setRecurring((r) => ({
                        ...r,
                        recurrenceDays: r.recurrenceDays.includes(idx)
                          ? r.recurrenceDays.filter((d) => d !== idx)
                          : [...r.recurrenceDays, idx],
                      }))
                    }
                    className={`py-2 text-sm font-medium rounded transition-colors ${
                      recurring.recurrenceDays.includes(idx)
                        ? 'bg-blue-500 text-white'
                        : 'bg-light-border dark:bg-dark-border'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Den pro měsíční opakování */}
          {recurring.recurrenceType === 'monthly' && (
            <div>
              <label className="block text-sm font-medium mb-2">Den v měsíci</label>
              <select
                className="select-field"
                value={recurring.recurrenceDay}
                onChange={(e) =>
                  setRecurring((r) => ({
                    ...r,
                    recurrenceDay: parseInt(e.target.value),
                  }))
                }
              >
                {[...Array(29)].map((_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}.
                  </option>
                ))}
                <option value={30}>Poslední den měsíce</option>
              </select>
            </div>
          )}

          {/* Datum konce */}
          <div>
            <label className="block text-sm font-medium mb-2">Konec opakování (volitelné)</label>
            <input
              type="date"
              className="input-field"
              value={recurring.recurrenceEndDate || ''}
              onChange={(e) =>
                setRecurring((r) => ({
                  ...r,
                  recurrenceEndDate: e.target.value || null,
                }))
              }
            />
            <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-1">
              Pokud necháš prázdné, bude se opakovat donekonečna
            </p>
          </div>

          {/* Uložit jako oblíbenou */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={recurring.isFavorite}
              onChange={(e) =>
                setRecurring((r) => ({ ...r, isFavorite: e.target.checked }))
              }
              className="rounded"
            />
            <span className="text-sm font-medium">Uložit jako oblíbenou</span>
          </label>

          {/* Tlačítka */}
          <div className="flex gap-2 pt-4">
            <button
              onClick={onClose}
              className="flex-1 btn-secondary"
            >
              Zrušit
            </button>
            <button
              onClick={handleSave}
              className="flex-1 btn-primary"
            >
              Uložit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
