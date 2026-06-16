import xlsx from 'xlsx';
import path from 'path';

const [file, sheet] = process.argv.slice(2);
const wb = xlsx.readFile(path.join('trabajosocial', file), { sheetRows: 8 });
const sn = wb.SheetNames.find(n => n.toLowerCase().includes((sheet || '').toLowerCase())) || wb.SheetNames[0];
const rows = xlsx.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
console.log('FILE:', file, '| HOJA:', sn);
rows.slice(0, 8).forEach((r, i) => {
  const cells = r.map(c => String(c).trim()).slice(0, 30);
  console.log('[' + i + ']', cells.filter(Boolean).join(' | '));
});
