import { CATEGORY_LABELS, MESICE } from './constants';

export const formatDatum = (dateString) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${day}.${month}.${year}`;
};

export const formatCastka = (amount) => {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    minimumFractionDigits: 0,
  }).format(amount);
};

export const getMesicZDatumu = (dateString) => {
  if (!dateString) return '';
  return dateString.split('-')[1] || '';
};

// Používá MESICE z constants — jediný zdroj pravdy
export const getMesicNazev = (mesic) =>
  MESICE.find((m) => m.value === mesic)?.label || '';

export const getCategoryLabel = (value) =>
  CATEGORY_LABELS[value] || value;

export const calculateTotal = (items) =>
  items.reduce((sum, item) => sum + Number(item.castka || 0), 0);

export const filterItems = (items, kategorie, mesic) =>
  items.filter((item) => {
    const kategorieMatch =
      kategorie === 'vse' || kategorie === 'vse-prijem' || item.kategorie === kategorie;
    const mesicMatch =
      mesic === 'vse-mesic' || getMesicZDatumu(item.datum) === mesic;
    return kategorieMatch && mesicMatch;
  });

export const getCategoryColor = (category) => {
  const colors = {
    doprava:   'bg-blue-100   text-blue-800   dark:bg-blue-900   dark:text-blue-200',
    jidlo:     'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    bydleni:   'bg-green-100  text-green-800  dark:bg-green-900  dark:text-green-200',
    sporeni:   'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    zabava:    'bg-pink-100   text-pink-800   dark:bg-pink-900   dark:text-pink-200',
    ostatni:   'bg-slate-100  text-slate-700  dark:bg-slate-700  dark:text-slate-200',
    prace:     'bg-green-100  text-green-800  dark:bg-green-900  dark:text-green-200',
    brigada:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    prodej:    'bg-blue-100   text-blue-800   dark:bg-blue-900   dark:text-blue-200',
    prispevky: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  };
  return colors[category] || 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200';
};
