import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

const dir = 'trabajosocial';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx'));
const filtro = process.argv[2];

// Encuentra la fila de encabezado (la de más celdas llenas en las primeras 8 filas).
function headerRow(rows) {
  let best = [], bestN = 0, bestIdx = -1;
  rows.slice(0, 8).forEach((r, i) => {
    const filled = r.filter(c => String(c).trim()).length;
    if (filled > bestN) { bestN = filled; best = r; bestIdx = i; }
  });
  return { header: best, idx: bestIdx };
}

for (const f of files) {
  if (filtro && !f.toLowerCase().includes(filtro.toLowerCase())) continue;
  console.log('\n================ ' + f + ' ================');
  const wb = xlsx.readFile(path.join(dir, f), { sheetRows: 10 });
  console.log('HOJAS (' + wb.SheetNames.length + '):', wb.SheetNames.slice(0, 12).join(' | ') + (wb.SheetNames.length > 12 ? ' …' : ''));
  // Mostrar el esquema de las hojas "maestras" (no las diarias 1..31 ni PRODUCCION).
  const maestras = wb.SheetNames.filter(n => !/^\d+$/.test(n.trim()) && !/PRODUCCION/i.test(n));
  for (const sn of maestras.slice(0, 6)) {
    const ws = wb.Sheets[sn];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const { header } = headerRow(rows);
    const cols = header.map(c => String(c).trim()).filter(Boolean);
    if (cols.length) console.log('\n  HOJA «' + sn + '» columnas:\n   ', cols.join(' | '));
  }
}
