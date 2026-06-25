#!/usr/bin/env node
/**
 * Crea un usuario GENÉRICO de enfermería POR CADA servicio del catálogo
 * (rol "enfermeria"). El nombre lleva el servicio, así ESDOMED sabe de qué
 * servicio vino cada notificación de alta. Login por username.
 *
 * Requisito: service-account.json en la raíz.
 *
 * Uso:
 *   node scripts/crear-usuarios-enfermeria.mjs --dry-run   # muestra la lista, no escribe
 *   node scripts/crear-usuarios-enfermeria.mjs             # crea los usuarios
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const KEY_PATH = resolve(ROOT, "service-account.json");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

// Clave compartida simple para todas las estaciones de enfermería.
const PASSWORD = "enfermeria2026";

// Palabras genéricas que no distinguen un servicio de otro (se omiten del slug
// para que el username sea corto y reconocible, p. ej. "intensivos_cardiovascular").
const STOPWORDS = new Set([
  "de", "del", "la", "las", "los", "el", "y", "e", "unidad", "cuidados",
  "servicio", "adultos",
]);

// username = "enf." + slug del servicio (sin tildes, sin genéricas, ≤30, único).
function slugServicio(nombre) {
  const tokens = nombre
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    .filter((t) => !STOPWORDS.has(t));
  return (tokens.join("_") || "servicio").slice(0, 26);
}

async function main() {
  if (!existsSync(KEY_PATH)) {
    console.error("\n❌ Falta service-account.json en la raíz.\n");
    process.exit(1);
  }

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  const { getAuth } = await import("firebase-admin/auth");

  initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, "utf8"))) });
  const db = getFirestore();
  const authAdmin = getAuth();

  // Catálogo de servicios vivo.
  const cfg = await db.collection("configuracion").doc("servicios").get();
  const lista = cfg.exists ? cfg.data()?.lista : null;
  const servicios = (Array.isArray(lista) ? lista : [])
    .map((s) => (typeof s === "string" ? s : s?.nombre))
    .filter(Boolean);

  if (servicios.length === 0) {
    console.error("\n❌ No se pudo leer el catálogo de servicios (configuracion/servicios).\n");
    process.exit(1);
  }

  // Usernames ya usados en el sistema (para no chocar / no duplicar).
  const usados = new Set();
  const snapUsuarios = await db.collection("usuarios").where("username", "!=", null).get().catch(() => null);
  if (snapUsuarios) snapUsuarios.forEach((d) => { const u = d.data().username; if (u) usados.add(u); });

  // Construir el plan (servicio → nombre, username único, email).
  const plan = [];
  const tomados = new Set(usados);
  for (const servicio of servicios) {
    let base = `enf.${slugServicio(servicio)}`.slice(0, 30);
    let username = base;
    let i = 2;
    while (tomados.has(username)) { username = `${base.slice(0, 28)}_${i}`.slice(0, 30); i++; }
    tomados.add(username);
    plan.push({
      servicio,
      nombre: `Enfermería ${servicio}`,
      username,
      email: `${username}@enfermeria.esdomed.local`,
      yaExiste: usados.has(base),
    });
  }

  // Mostrar el plan.
  console.log(`\n── Plan: ${plan.length} usuarios de enfermería (uno por servicio) ──`);
  console.log(`   Clave compartida: ${PASSWORD}\n`);
  plan.forEach((p, idx) => {
    console.log(`${String(idx + 1).padStart(2, "0")}. ${p.username.padEnd(30)}  ${p.servicio}`);
  });

  if (DRY_RUN) {
    console.log("\n(--dry-run) No se creó nada.\n");
    process.exit(0);
  }

  // Crear cada usuario (saltando los que ya existan por username).
  const creados = [];
  const saltados = [];
  for (const p of plan) {
    const dup = await db.collection("usuarios").where("username", "==", p.username).limit(1).get();
    if (!dup.empty) { saltados.push(p); continue; }
    let rec;
    try {
      rec = await authAdmin.createUser({ email: p.email, password: PASSWORD, displayName: p.nombre });
    } catch (err) {
      if (err?.code === "auth/email-already-exists") {
        rec = await authAdmin.getUserByEmail(p.email);
      } else { throw err; }
    }
    await db.collection("usuarios").doc(rec.uid).set({
      nombre: p.nombre,
      email: p.email,
      username: p.username,
      role: "enfermeria",
      servicios: [p.servicio],
      servicio: p.servicio,
      createdAt: FieldValue.serverTimestamp(),
    });
    creados.push(p);
  }

  console.log(`\n✅ Creados: ${creados.length} · Saltados (ya existían): ${saltados.length}\n`);
}

main().catch((e) => { console.error("\n❌ Error:", e?.message ?? e, "\n"); process.exit(1); });
