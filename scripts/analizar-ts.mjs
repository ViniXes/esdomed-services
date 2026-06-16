import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

const dir = 'trabajosocial';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx'));

const onlyFile = process.argv[2]; // optional substring filter

for (const f of files) {
  if (onlyFile && !f.toLowerCase().includes(onlyFile.toLowerCase())) continue;
  console.log('\n========================================');
  console.log('FILE:', f);
  console.log('========================================');
  const wb = xlsx.readFile(path.join(dir, f), { sheetRows: 6 });
  console.log('SHEETS (' + wb.SheetNames.length + '):', wb.SheetNames.join(' | '));
  // For first 3 sheets + any with interesting names, print headers + first 3 rows
  const sheetsToShow = wb.SheetNames.slice(0, 4);
  for (const sn of sheetsToShow) {
    const ws = wb.Sheets[sn];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    console.log('\n  --- SHEET:', sn, '---');
    rows.slice(0, 5).forEach((r, i) => {
      const cells = r.map(c => String(c).slice(0, 22)).filter(Boolean);
      if (cells.length) console.log('   [' + i + ']', cells.join(' | '));
    });
  }
}
