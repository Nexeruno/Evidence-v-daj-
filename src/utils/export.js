import { formatDatum, formatCastka, getCategoryLabel } from './formatters';

const dnes = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

const fileDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const esc = (str) =>
  String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const exportVypisPDF = ({ username, period, vydaje, prijmy }) => {
  const totalVydaje = vydaje.reduce((s, i) => s + Number(i.castka || 0), 0);
  const totalPrijmy = prijmy.reduce((s, i) => s + Number(i.castka || 0), 0);
  const zustatek = totalPrijmy - totalVydaje;

  const transakce = [
    ...prijmy.map((i) => ({ ...i, typ: 'prijem' })),
    ...vydaje.map((i) => ({ ...i, typ: 'vydaj' })),
  ].sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));

  const radky = transakce
    .map(
      (t) => `
    <tr>
      <td>${formatDatum(t.datum) || '—'}</td>
      <td><strong>${esc(t.nazev)}</strong></td>
      <td><span class="badge">${esc(getCategoryLabel(t.kategorie))}</span></td>
      <td class="typ ${t.typ === 'prijem' ? 'in' : 'out'}">${t.typ === 'prijem' ? '↑ Příjem' : '↓ Výdaj'}</td>
      <td class="castka ${t.typ === 'prijem' ? 'in' : 'out'}">
        ${t.typ === 'prijem' ? '+' : '−'} ${esc(formatCastka(Number(t.castka)))}
      </td>
    </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <title>Výpis z účtu – ${esc(username)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;background:#fff}
    .header{background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;padding:36px 48px 32px}
    .header-top{display:flex;align-items:center;gap:16px;margin-bottom:8px}
    .header-icon{width:52px;height:52px;background:rgba(255,255,255,.2);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:26px}
    .header-title{font-size:26px;font-weight:800}
    .header-sub{font-size:14px;opacity:.8;margin-top:2px}
    .meta{background:#f8fafc;border-bottom:2px solid #e2e8f0;padding:14px 48px;display:flex;flex-wrap:wrap;gap:28px;font-size:13px;color:#64748b}
    .meta strong{color:#1e293b;font-weight:600}
    .body{padding:36px 48px}
    .section-label{font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#94a3b8;margin-bottom:16px}
    .summary{display:flex;gap:16px;margin-bottom:40px}
    .card{flex:1;border-radius:12px;padding:20px 24px;border:1.5px solid}
    .card.green{background:#f0fdf4;border-color:#86efac}
    .card.red{background:#fef2f2;border-color:#fca5a5}
    .card.blue{background:#eff6ff;border-color:#93c5fd}
    .card .clabel{font-size:12px;color:#64748b;margin-bottom:6px}
    .card .camount{font-size:24px;font-weight:800}
    .card .ccount{font-size:12px;color:#94a3b8;margin-top:4px}
    .card.green .camount{color:#16a34a}
    .card.red .camount{color:#dc2626}
    .card.blue .camount{color:#2563eb}
    table{width:100%;border-collapse:collapse;font-size:13px}
    thead tr{background:#f8fafc}
    th{padding:11px 14px;text-align:left;font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0}
    td{padding:13px 14px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
    tbody tr:nth-child(even) td{background:#fafbfc}
    .badge{display:inline-block;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;background:#e2e8f0;color:#475569}
    .castka{text-align:right;font-weight:700;font-size:14px;white-space:nowrap}
    .typ{font-size:12px;color:#64748b}
    .in{color:#16a34a}
    .out{color:#dc2626}
    .empty{text-align:center;padding:60px 0;color:#94a3b8;font-size:14px}
    .footer{margin-top:48px;padding-top:20px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:0;size:A4}}
  </style>
</head>
<body>
  <div class="header">
    <div class="header-top">
      <div class="header-icon">💰</div>
      <div><div class="header-title">Evidence Výdajů</div><div class="header-sub">Výpis z účtu</div></div>
    </div>
  </div>
  <div class="meta">
    <span><strong>Uživatel:</strong> ${esc(username)}</span>
    <span><strong>Datum výpisu:</strong> ${dnes()}</span>
    <span><strong>Období:</strong> ${esc(period)}</span>
    <span><strong>Transakcí:</strong> ${transakce.length}</span>
  </div>
  <div class="body">
    <div class="section-label">Přehled</div>
    <div class="summary">
      <div class="card green">
        <div class="clabel">Příjmy</div>
        <div class="camount">${esc(formatCastka(totalPrijmy))}</div>
        <div class="ccount">${prijmy.length} položek</div>
      </div>
      <div class="card red">
        <div class="clabel">Výdaje</div>
        <div class="camount">${esc(formatCastka(totalVydaje))}</div>
        <div class="ccount">${vydaje.length} položek</div>
      </div>
      <div class="card blue">
        <div class="clabel">Zůstatek</div>
        <div class="camount">${esc(formatCastka(zustatek))}</div>
      </div>
    </div>
    <div class="section-label">Transakce</div>
    ${
      transakce.length === 0
        ? '<div class="empty">Žádné transakce pro vybrané období</div>'
        : `<table>
            <thead><tr>
              <th>Datum</th><th>Popis</th><th>Kategorie</th><th>Typ</th>
              <th style="text-align:right">Částka</th>
            </tr></thead>
            <tbody>${radky}</tbody>
          </table>`
    }
    <div class="footer">
      <span>Evidence Výdajů — Osobní finance</span>
      <span>Vygenerováno: ${dnes()}</span>
    </div>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    alert('Povolte otevírání nových oken pro export PDF.');
    return;
  }
  win.document.write(html);
  win.document.close();
  // Okno se zavře automaticky po tisku / zavření dialogu
  win.onafterprint = () => win.close();
  setTimeout(() => win.print(), 600);
};

export const exportCSV = ({ filename, items, typ }) => {
  if (items.length === 0) return;

  const BOM = '﻿';
  const header = 'Datum,Popis,Kategorie,Typ,"Castka (Kc)"\n';
  const radky = items
    .map((i) =>
      [
        formatDatum(i.datum) || '',
        `"${String(i.nazev || '').replace(/"/g, '""')}"`,
        `"${getCategoryLabel(i.kategorie)}"`,
        typ === 'vydaj' ? 'Výdaj' : 'Příjem',
        Number(i.castka),
      ].join(',')
    )
    .join('\n');

  const blob = new Blob([BOM + header + radky], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${fileDate()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
