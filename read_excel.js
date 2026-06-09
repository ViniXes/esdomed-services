const XLSX = require("xlsx");
const path = require("path");

const filePath = path.join(__dirname, "recursoshumanos", "INGRESO DE INCAPACIDADES ACTUALIZADO-1111.xlsm");
const wb = XLSX.readFile(filePath);
console.log("Hojas disponibles:", wb.SheetNames);

const nombreHoja = wb.SheetNames.find(n => /consulta/i.test(n)) ?? wb.SheetNames[0];
console.log("\nUsando hoja:", nombreHoja);

const sheet = wb.Sheets[nombreHoja];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

if (rows.length > 0) {
  const columnas = Object.keys(rows[0]);
  console.log("\nColumnas encontradas (primera fila de datos):");
  columnas.forEach((c, i) => console.log(`${i + 1}. ${c}`));
  console.log("\nEjemplo de los primeros 2 registros:");
  console.log(JSON.stringify(rows.slice(0, 2), null, 2));
} else {
  console.log("La hoja está vacía.");
}
