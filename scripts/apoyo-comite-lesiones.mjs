#!/usr/bin/env node
/**
 * Marca o desmarca médicos que apoyan al Comité de Lesiones Intencionales
 * (perfil.apoyaComiteLesiones). Es el mismo campo que administra el
 * superusuario desde /dashboard/usuarios; este script sirve para hacerlo por
 * lote o sin entrar a la app.
 *
 * Uso:
 *   node scripts/apoyo-comite-lesiones.mjs                          # lista los médicos marcados
 *   node scripts/apoyo-comite-lesiones.mjs --jvpm 12039,9200        # muestra esos médicos (sin cambiar nada)
 *   node scripts/apoyo-comite-lesiones.mjs --jvpm 12039,9200 --activar
 *   node scripts/apoyo-comite-lesiones.mjs --jvpm 12039 --desactivar
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const KEY_PATH = resolve(ROOT, "service-account.json");

const args = process.argv.slice(2);
const getArg = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const JVPMS = (getArg("--jvpm") || "").split(",").map((s) => s.trim()).filter(Boolean);
const ACTIVAR = args.includes("--activar");
const DESACTIVAR = args.includes("--desactivar");

const linea = (id, x) =>
  `  ${id} | ${x.nombre} | JVPM ${x.jvpm ?? "—"} | rol ${x.role} | activo=${x.activo ?? true} | apoyaComiteLesiones=${x.apoyaComiteLesiones === true}`;

async function main() {
  if (!existsSync(KEY_PATH)) {
    console.error(`\n❌ Clave de servicio no encontrada: ${KEY_PATH}\n`);
    process.exit(1);
  }
  if (ACTIVAR && DESACTIVAR) {
    console.error("\n❌ --activar y --desactivar son excluyentes\n");
    process.exit(1);
  }

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, "utf8"))) });
  const db = getFirestore();

  if (JVPMS.length === 0) {
    const snap = await db.collection("usuarios").where("apoyaComiteLesiones", "==", true).get();
    console.log(`\nMédicos que apoyan al comité: ${snap.size}`);
    snap.forEach((d) => console.log(linea(d.id, d.data())));
    console.log();
    return;
  }

  for (const jvpm of JVPMS) {
    const snap = await db.collection("usuarios").where("jvpm", "==", jvpm).get();
    if (snap.empty) { console.log(`\nJVPM ${jvpm}: sin usuario`); continue; }
    if (snap.size > 1) {
      console.log(`\nJVPM ${jvpm}: ${snap.size} usuarios — ambiguo, no se toca:`);
      snap.forEach((d) => console.log(linea(d.id, d.data())));
      continue;
    }
    const doc = snap.docs[0];
    const x = doc.data();
    console.log(`\nJVPM ${jvpm}:`);
    console.log(linea(doc.id, x));
    if (x.role !== "medico") { console.log("  ⚠ no es médico, no se toca"); continue; }
    if (ACTIVAR) {
      await doc.ref.update({ apoyaComiteLesiones: true });
      console.log("  ✔ marcado: apoya al Comité de Lesiones");
    } else if (DESACTIVAR) {
      await doc.ref.update({ apoyaComiteLesiones: FieldValue.delete() });
      console.log("  ✔ desmarcado");
    }
  }
  console.log();
}

main().catch((e) => { console.error(e); process.exit(1); });
