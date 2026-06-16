import xlsx from 'xlsx';

const wb = xlsx.readFile('trabajosocial/INTERVENCIONES PRESENCIALES - UTS (Respuestas2026).xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });
console.log('TOTAL RESPUESTAS:', rows.length);

function tally(field) {
  const m = new Map();
  for (const r of rows) {
    const v = String(r[field] ?? '').trim();
    m.set(v, (m.get(v) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

const tipoKey = Object.keys(rows[0]).find(k => k.toLowerCase().includes('tipo'));
const persKey = Object.keys(rows[0]).find(k => k.toLowerCase().includes('persona'));
const estKey  = Object.keys(rows[0]).find(k => k.toLowerCase().includes('estado'));
const servKey = Object.keys(rows[0]).find(k => k.toLowerCase().includes('servicio'));

console.log('\nCOLUMNAS:', Object.keys(rows[0]).join(' || '));

const tipos = tally(tipoKey);
console.log('\n=== TIPOS DE GESTION distintos:', tipos.length, '===');
console.log('--- TOP 40 por frecuencia ---');
tipos.slice(0, 40).forEach(([v, n]) => console.log(String(n).padStart(5), v.slice(0, 60)));

const pers = tally(persKey);
console.log('\n=== PERSONAS distintas:', pers.length, '===');
pers.forEach(([v, n]) => console.log(String(n).padStart(5), v));

console.log('\n=== ESTADO PACIENTE distintos ===');
tally(estKey).forEach(([v, n]) => console.log(String(n).padStart(5), v));

console.log('\n=== SERVICIOS distintos:', tally(servKey).length, '===');
tally(servKey).slice(0, 30).forEach(([v, n]) => console.log(String(n).padStart(5), v));
