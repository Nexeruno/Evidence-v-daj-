import { useState, useMemo } from 'react';
import { useAppStore } from '../utils/store';
import { formatCastka, filterItems } from '../utils/formatters';
import { MESICE, KATEGORIE_VYDAJ, KATEGORIE_PRIJEM } from '../utils/constants';
import { ItemCardVydaj, ItemCardPrijem } from './ItemCard';
import { PendingTransactions } from './PendingTransactions';
import { exportVypisPDF } from '../utils/export';
import { useAuth } from '../context/AuthContext';
import { FileDown } from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

// Vždy viditelná karta finančního zdraví
const FinancniZdraviCard = ({ vydaje, prijmy, ready }) => {
  const totalPrijmy = useMemo(
    () => prijmy.reduce((s, i) => s + Number(i.castka || 0), 0),
    [prijmy]
  );
  const totalVydaje = useMemo(
    () => vydaje.reduce((s, i) => s + Number(i.castka || 0), 0),
    [vydaje]
  );
  const zustatek = totalPrijmy - totalVydaje;
  const pct = totalPrijmy > 0 ? Math.max(0, Math.min(100, (zustatek / totalPrijmy) * 100)) : 0;

  // Skeleton
  if (!ready) {
    return (
      <div className="rounded-2xl p-6 border bg-light-card dark:bg-dark-card border-light-border dark:border-dark-border animate-pulse">
        <div className="h-4 bg-light-border dark:bg-dark-border rounded w-1/3 mb-4" />
        <div className="h-10 bg-light-border dark:bg-dark-border rounded w-1/2 mb-5" />
        <div className="h-4 bg-light-border dark:bg-dark-border rounded-full w-full mb-3" />
        <div className="h-3 bg-light-border dark:bg-dark-border rounded w-2/3" />
      </div>
    );
  }

  // Žádné příjmy ještě
  if (totalPrijmy === 0) {
    return (
      <div className="rounded-2xl p-6 border border-dashed border-light-border dark:border-dark-border text-center">
        <p className="text-2xl mb-2">💡</p>
        <p className="font-semibold text-light-text dark:text-dark-text">Přidej první příjem</p>
        <p className="text-sm text-light-textMuted dark:text-dark-textMuted mt-1">
          Po přidání příjmů zde uvidíš přehled svého finančního zdraví.
        </p>
      </div>
    );
  }

  // Úrovně zdraví
  let emoji, nadpis, zprava, barCls, cardCls, valueCls;

  if (zustatek <= 0) {
    emoji = '🚨'; nadpis = 'Výdaje překračují příjmy!';
    zprava = `Vaše výdaje přesáhly příjmy o ${formatCastka(Math.abs(zustatek))} — okamžitě omezte výdaje!`;
    barCls = 'bg-red-500'; valueCls = 'text-red-600 dark:text-red-400';
    cardCls = 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800';
  } else if (pct <= 15) {
    emoji = '⚠️'; nadpis = 'Pozor — zbývá vám málo prostředků!';
    zprava = `Zbývá vám ${formatCastka(zustatek)} z celkových příjmů ${formatCastka(totalPrijmy)} — šetřete!`;
    barCls = 'bg-orange-500'; valueCls = 'text-orange-600 dark:text-orange-400';
    cardCls = 'bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-700';
  } else if (pct <= 30) {
    emoji = '💛'; nadpis = 'Výdaje rostou — sledujte je';
    zprava = `Zbývá vám ${formatCastka(zustatek)} z celkových příjmů ${formatCastka(totalPrijmy)}.`;
    barCls = 'bg-yellow-400'; valueCls = 'text-yellow-700 dark:text-yellow-400';
    cardCls = 'bg-yellow-50 dark:bg-yellow-950/40 border-yellow-300 dark:border-yellow-700';
  } else if (pct <= 50) {
    emoji = '📊'; nadpis = 'Financemi se blíží středu';
    zprava = `Zbývá vám ${formatCastka(zustatek)} z celkových příjmů ${formatCastka(totalPrijmy)}.`;
    barCls = 'bg-blue-400'; valueCls = 'text-blue-600 dark:text-blue-400';
    cardCls = 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700';
  } else {
    emoji = '✅'; nadpis = 'Finanční zdraví je dobré';
    zprava = `Zbývá vám ${formatCastka(zustatek)} z celkových příjmů ${formatCastka(totalPrijmy)}.`;
    barCls = 'bg-green-500'; valueCls = 'text-green-600 dark:text-green-400';
    cardCls = 'bg-green-50 dark:bg-green-950/40 border-green-300 dark:border-green-700';
  }

  return (
    <div className={`rounded-2xl p-6 border ${cardCls} transition-colors duration-300`}>
      {/* Horní řádek */}
      <div className="flex items-start justify-between mb-1">
        <p className="text-sm font-medium text-light-textMuted dark:text-dark-textMuted">Zbývá z příjmů</p>
        <span className="text-2xl leading-none">{emoji}</span>
      </div>

      {/* Hlavní číslo */}
      <p className={`text-5xl font-black tracking-tight mb-4 ${valueCls}`}>
        {formatCastka(zustatek)}
      </p>

      {/* Progress bar */}
      <div className="w-full bg-black/10 dark:bg-white/10 rounded-full h-3.5 mb-4 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barCls}`}
          style={{ width: `${Math.max(1, pct)}%` }}
        />
      </div>

      {/* Zpráva */}
      <p className="text-sm font-semibold text-light-text dark:text-dark-text">{nadpis}</p>
      <p className="text-sm text-light-textMuted dark:text-dark-textMuted mt-0.5">{zprava}</p>

      {/* Doplňkové info */}
      <div className="flex gap-4 mt-4 pt-4 border-t border-black/10 dark:border-white/10 text-xs text-light-textMuted dark:text-dark-textMuted">
        <span>📈 Příjmy: <strong>{formatCastka(totalPrijmy)}</strong></span>
        <span>📉 Výdaje: <strong>{formatCastka(totalVydaje)}</strong></span>
      </div>
    </div>
  );
};

export const Dashboard = () => {
  const vydaje      = useAppStore((s) => s.vydaje);
  const prijmy      = useAppStore((s) => s.prijmy);
  const vydajeReady = useAppStore((s) => s.vydajeReady);
  const prijmyReady = useAppStore((s) => s.prijmyReady);
  const dataReady   = vydajeReady && prijmyReady;
  const { session } = useAuth();

  const [mesic, setMesic] = useState('vse-mesic');
  const [katVydaj, setKatVydaj] = useState('vse');
  const [katPrijem, setKatPrijem] = useState('vse-prijem');

  const filteredVydaje = filterItems(vydaje, katVydaj, mesic);
  const filteredPrijmy = filterItems(prijmy, katPrijem, mesic);

  const totalVydaje = filteredVydaje.reduce((sum, item) => sum + Number(item.castka || 0), 0);
  const totalPrijmy = filteredPrijmy.reduce((sum, item) => sum + Number(item.castka || 0), 0);
  const zustatek = totalPrijmy - totalVydaje;

  const { pieData, barData } = useMemo(() => {
    const categoryData = {};
    filteredVydaje.forEach((item) => {
      categoryData[item.kategorie] = (categoryData[item.kategorie] || 0) + Number(item.castka || 0);
    });
    const pieData = Object.entries(categoryData).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value: Math.round(value),
    }));

    const monthlyData = {};
    filteredVydaje.forEach((item) => {
      if (!item.datum) return;
      const [year, month] = item.datum.split('-');
      const key = `${month}/${year}`;
      if (!monthlyData[key]) monthlyData[key] = { month: key, vydaje: 0, prijmy: 0 };
      monthlyData[key].vydaje += Number(item.castka || 0);
    });
    filteredPrijmy.forEach((item) => {
      if (!item.datum) return;
      const [year, month] = item.datum.split('-');
      const key = `${month}/${year}`;
      if (!monthlyData[key]) monthlyData[key] = { month: key, vydaje: 0, prijmy: 0 };
      monthlyData[key].prijmy += Number(item.castka || 0);
    });
    const barData = Object.values(monthlyData).sort((a, b) => {
      const [am, ay] = a.month.split('/');
      const [bm, by] = b.month.split('/');
      return ay !== by ? ay.localeCompare(by) : am.localeCompare(bm);
    });

    return { pieData, barData };
  }, [filteredVydaje, filteredPrijmy]);

  const isEmpty = vydaje.length === 0 && prijmy.length === 0;
  const periodeLabel = MESICE.find((m) => m.value === mesic)?.label || 'Všechny měsíce';

  const handleExportPDF = () => {
    exportVypisPDF({
      username: session?.username || 'Uživatel',
      period: periodeLabel,
      vydaje: filteredVydaje,
      prijmy: filteredPrijmy,
    });
  };

  return (
    <div className="space-y-6">

      {/* Finanční zdraví — vždy viditelné, vždy nahoře */}
      <FinancniZdraviCard vydaje={vydaje} prijmy={prijmy} ready={dataReady} />

      {/* Pending Transactions — schvalování automaticky vygenerovaných záznamů */}
      <PendingTransactions />

      {/* Filter bar + export */}
      <div className="card flex flex-col sm:flex-row gap-4 items-end">
        <div className="flex-1">
          <label className="text-sm font-medium text-light-textMuted dark:text-dark-textMuted mb-2 block">Měsíc</label>
          <select className="select-field" value={mesic} onChange={(e) => setMesic(e.target.value)}>
            {MESICE.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium text-light-textMuted dark:text-dark-textMuted mb-2 block">Kategorie výdajů</label>
          <select className="select-field" value={katVydaj} onChange={(e) => setKatVydaj(e.target.value)}>
            {KATEGORIE_VYDAJ.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium text-light-textMuted dark:text-dark-textMuted mb-2 block">Kategorie příjmů</label>
          <select className="select-field" value={katPrijem} onChange={(e) => setKatPrijem(e.target.value)}>
            {KATEGORIE_PRIJEM.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleExportPDF}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors whitespace-nowrap shrink-0"
          title="Exportovat výpis jako PDF"
        >
          <FileDown size={18} />
          <span className="hidden sm:inline">Výpis PDF</span>
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {!dataReady ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-3 bg-light-border dark:bg-dark-border rounded w-1/2 mb-3" />
              <div className="h-8 bg-light-border dark:bg-dark-border rounded w-3/4 mb-2" />
              <div className="h-3 bg-light-border dark:bg-dark-border rounded w-1/3" />
            </div>
          ))
        ) : (
          <>
            <div className="card border-l-4 border-green-500">
              <p className="text-sm font-medium text-light-textMuted dark:text-dark-textMuted">Příjmy</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">{formatCastka(totalPrijmy)}</p>
              <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-1">{filteredPrijmy.length} položek</p>
            </div>
            <div className="card border-l-4 border-red-500">
              <p className="text-sm font-medium text-light-textMuted dark:text-dark-textMuted">Výdaje</p>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">{formatCastka(totalVydaje)}</p>
              <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-1">{filteredVydaje.length} položek</p>
            </div>
            <div className={`card border-l-4 ${zustatek >= 0 ? 'border-blue-500' : 'border-red-500'}`}>
              <p className="text-sm font-medium text-light-textMuted dark:text-dark-textMuted">Zůstatek</p>
              <p className={`text-3xl font-bold mt-2 ${zustatek >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatCastka(zustatek)}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="card text-center py-12 text-light-textMuted dark:text-dark-textMuted">
          <p className="text-lg font-medium">Zatím žádné záznamy</p>
          <p className="text-sm mt-1">Přidej první výdaj nebo příjem přes záložky výše.</p>
        </div>
      )}

      {/* Charts */}
      {!isEmpty && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {pieData.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">Výdaje podle kategorií</h3>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value">
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${value.toLocaleString('cs-CZ')} Kč`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {barData.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">Příjmy vs Výdaje</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData} margin={{ bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" angle={-35} textAnchor="end" interval={0} tick={{ fontSize: 11 }} height={50} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => `${value.toLocaleString('cs-CZ')} Kč`} />
                  <Legend />
                  <Bar dataKey="prijmy" fill="#10B981" name="Příjmy" />
                  <Bar dataKey="vydaje" fill="#EF4444" name="Výdaje" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Seznamy */}
      {!isEmpty && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xl font-bold mb-3 text-red-600 dark:text-red-400">Výdaje</h3>
            <div className="space-y-3">
              {filteredVydaje.length === 0 ? (
                <p className="card text-center text-light-textMuted dark:text-dark-textMuted py-6 text-sm">
                  Žádné výdaje pro vybraný filtr
                </p>
              ) : (
                filteredVydaje.map((item) => <ItemCardVydaj key={item.id} item={item} />)
              )}
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold mb-3 text-green-600 dark:text-green-400">Příjmy</h3>
            <div className="space-y-3">
              {filteredPrijmy.length === 0 ? (
                <p className="card text-center text-light-textMuted dark:text-dark-textMuted py-6 text-sm">
                  Žádné příjmy pro vybraný filtr
                </p>
              ) : (
                filteredPrijmy.map((item) => <ItemCardPrijem key={item.id} item={item} />)
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
