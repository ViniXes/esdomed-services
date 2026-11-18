// Genera src/lib/consultaExterna/diccionarioNombres.json: las palabras de los
// nombres de pacientes (y personal) que services ya conoce, con cuántas
// personas distintas las llevan. Citas 2027 lo usa para avisar de un nombre
// posiblemente mal escrito ("alejndro" → Alejandro). No guarda nombres
// completos, solo palabras sueltas que aparecen en 2 o más personas.
//
// Uso: node scripts/generar-diccionario-nombres.mjs  (necesita service-account.json en la raíz)
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MINIMO = 2;

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(resolve(ROOT, "service-account.json"), "utf8"))) });
const db = admin.firestore();

const clave = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const nombres = [];
const leer = async (coleccion, campos, armar, filtro = () => true) => {
  const snap = await db.collection(coleccion).select(...campos).get();
  snap.docs.forEach((d) => { if (filtro(d.data())) nombres.push(armar(d.data())); });
  console.log(`${coleccion}: ${snap.size}`);
};
const apellidosNombres = (x) => [x.apellidos, x.nombres].filter(Boolean).join(", ");

await leer("personas", ["apellidos", "nombres"], apellidosNombres);
await leer("pacientes", ["apellidos", "nombres"], apellidosNombres);
await leer("control_ingresos", ["apellidos", "nombres"], apellidosNombres);
await leer("consulta_externa_citas", ["paciente"], (x) => x.paciente);
// Los escritos a mano en citas 2027 no entran: son justo los que se revisan.
await leer("consulta_externa_citas_programadas", ["paciente", "origenNombre"], (x) => x.paciente, (x) => x.origenNombre !== "manual");
await leer("notificaciones_fallecidos", ["pacienteNombre"], (x) => x.pacienteNombre);
await leer("incapacidades", ["pacienteNombre"], (x) => x.pacienteNombre);
await leer("usuarios", ["nombre"], (x) => x.nombre);

const personas = new Set(nombres.map(clave).filter(Boolean));
const conteo = new Map();
for (const p of personas) {
  for (const w of new Set(p.match(/[a-zñ]+/g) ?? [])) conteo.set(w, (conteo.get(w) ?? 0) + 1);
}
const dic = Object.fromEntries(
  [...conteo.entries()].filter(([w, c]) => c >= MINIMO && w.length >= 2).sort((a, b) => a[0].localeCompare(b[0])),
);
writeFileSync(resolve(ROOT, "src/lib/consultaExterna/diccionarioNombres.json"), JSON.stringify(dic) + "\n");
console.log(`${personas.size} personas, ${Object.keys(dic).length} palabras`);
process.exit(0);
