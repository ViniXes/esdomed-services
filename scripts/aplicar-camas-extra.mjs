#!/usr/bin/env node
/**
 * Lleva el catálogo vivo (configuracion/servicios) a las camas oficiales + extras
 * del reporte de ocupación (hoja "Total camas": 397 censables, 195 no censables,
 * 36 extras). Agrega las camas extra que falten, llena `camasExtra` y corrige las
 * camas 11 y 12 de UCI Cardiovascular a 11C y 12C. Es idempotente.
 *
 * Uso:
 *   node scripts/aplicar-camas-extra.mjs --dry-run   # solo reporta
 *   node scripts/aplicar-camas-extra.mjs             # aplica (guarda respaldo antes)
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");

const EXTRAS = {
  "bienestar magisterial": ["3", "4", "5", "6", "7", "8", "9", "10"],
  "cirugia hombres 1": ["11", "12"],
  "cirugia mujeres 1": ["11", "12"],
  "cirugia cardiovascular": ["CCV-09", "CCV-10"],
  "neurocirugia": ["NEU-11", "NEU-12"],
  "medicina interna hombres 1": ["MH1-46", "MH1-47"],
  "medicina interna hombres 2": ["MH2-26", "MH2-27"],
  "medicina interna hombres 3": ["MH3-21", "MH3-22"],
  "medicina interna mujeres 1": ["MM1-51", "MM1-52"],
  "medicina interna mujeres 2": ["MM2-31", "MM2-32"],
  "medicina interna mujeres 3": ["MM3-33", "MM3-34"],
  "servicio de cardiologia": ["CAR-09", "CAR-10"],
  "servicio de hematologia": ["HEM-51", "HEM-52"],
  "servicio de aislados": ["MAI-13", "MAI-14"],
  "servicio de oncologia": ["ONC-16", "ONC-17"],
};
const UCI_CV = "unidad de cuidados intensivos cardiovascular adultos";

const clave = (v) =>
  String(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();

initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(ROOT, "service-account.json"), "utf8"))) });
const db = getFirestore();
const ref = db.doc("configuracion/servicios");

await db.runTransaction(async (t) => {
  const data = (await t.get(ref)).data();
  const vistos = new Set();
  const lista = data.lista.map((s) => {
    const k = clave(s.nombre);
    if (k === UCI_CV) {
      const camas = s.camas.map((c) => (c === "11" || c === "12" ? `${c}C` : c));
      if (camas.join() !== s.camas.join()) console.log(`${s.nombre}: 11 y 12 → 11C y 12C`);
      return { ...s, camas };
    }
    const extras = EXTRAS[k];
    if (!extras) return s;
    vistos.add(k);
    const nuevas = extras.filter((c) => !s.camas.includes(c));
    console.log(`${s.nombre}: ${s.camas.length + nuevas.length - extras.length} + ${extras.length} extras` +
      (nuevas.length ? ` (agrega ${nuevas.join(", ")})` : ""));
    return { ...s, camas: [...s.camas, ...nuevas], camasExtra: extras };
  });

  const faltan = Object.keys(EXTRAS).filter((k) => !vistos.has(k));
  if (faltan.length) throw new Error(`Servicios no encontrados: ${faltan.join(", ")}`);

  const total = lista.reduce((n, s) => n + s.camas.length, 0);
  const extras = lista.reduce((n, s) => n + (s.camasExtra?.length ?? 0), 0);
  console.log(`\nTotal: ${total} camas (${total - extras} oficiales + ${extras} extras)`);
  if (DRY) { console.log("--dry-run: no se escribió nada."); return; }

  const respaldo = resolve(ROOT, `respaldo-configuracion-servicios-${Date.now()}.json`);
  writeFileSync(respaldo, JSON.stringify(data));
  console.log(`Respaldo: ${respaldo}`);
  t.update(ref, {
    lista,
    actualizadoEn: FieldValue.serverTimestamp(),
    actualizadoPorNombre: "Ajuste por script: camas extra",
  });
});
