// ────────────────────────────────────────────────────────────────────────────
// Medidor de lecturas de Firestore (solo diagnóstico — apagado por defecto).
//
// Reexporta TODO el SDK modular de Firestore y envuelve las 4 funciones que
// generan lecturas facturables — getDocs, getDoc, onSnapshot, getCountFromServer —
// para contar cuántos documentos lee CADA colección. No cambia el comportamiento:
// si el medidor está apagado, cada wrapper llama directo al SDK sin contar.
//
// ── Uso (en la consola del navegador, con la app corriendo) ──
//   localStorage.FS_METER = "1"          // enciende el medidor
//   location.reload()                    // recargá y usá la app un rato (horario real)
//   firestoreReads()                     // tabla por colección (más leídas arriba)
//   firestoreReadsReset()                // pone los contadores a cero
//   localStorage.FS_METER_VERBOSE = "1"  // (opcional) loguea cada lectura en vivo
//   delete localStorage.FS_METER         // apaga
//
// Para quitar el medidor del proyecto por completo: revertir el commit / los
// imports (cada archivo solo cambió "firebase/firestore" → "@/lib/firestoreMeter").
// ────────────────────────────────────────────────────────────────────────────

import * as fs from "firebase/firestore";

export * from "firebase/firestore";

type Stat = {
  reads: number;    // documentos leídos ≈ lecturas facturables
  getDocs: number;  // nº de llamadas getDocs
  getDoc: number;   // nº de llamadas getDoc
  attach: number;   // nº de onSnapshot enganchados (cada enganche recobra el set)
  updates: number;  // nº de callbacks de onSnapshot posteriores al inicial
  count: number;    // nº de getCountFromServer (agregación, barato)
};
type MeterState = Record<string, Stat>;

const isClient = typeof window !== "undefined";
const flag = (k: string) => isClient && window.localStorage?.getItem(k) === "1";
// Se fijan al cargar el módulo; para (des)activar hay que setear localStorage y RECARGAR.
const METER_ON = flag("FS_METER");
const VERBOSE = flag("FS_METER_VERBOSE");

const STORAGE_KEY = "FS_METER_DATA";
const blank = (): Stat => ({ reads: 0, getDocs: 0, getDoc: 0, attach: 0, updates: 0, count: 0 });

function load(): MeterState {
  if (!isClient) return {};
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}

// Se conserva entre navegaciones (módulo singleton) y entre recargas (localStorage).
const state: MeterState = METER_ON ? load() : {};

function save() {
  if (!isClient) return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* cuota llena */ }
}

function bump(coll: string, patch: Partial<Stat>) {
  const st = (state[coll] ||= blank());
  for (const k in patch) (st as Record<string, number>)[k] += (patch as Record<string, number>)[k] ?? 0;
  if (VERBOSE) console.log(`[FS] ${coll}`, patch);
}

// Nombre de la colección desde una Query / DocumentReference / CollectionReference.
function collOf(target: unknown): string {
  const t = target as { path?: string; _query?: { path?: { segments?: string[] } } };
  if (typeof t?.path === "string") return t.path.split("/")[0];        // Doc/CollectionReference
  const segs = t?._query?.path?.segments;                              // Query (interno v9/v10)
  if (Array.isArray(segs) && segs.length) return segs[0];
  return "??";
}

// ── getDocs ──
export const getDocs = ((...args: unknown[]) => {
  const p = (fs.getDocs as (...a: unknown[]) => Promise<{ size: number }>)(...args);
  if (!METER_ON) return p;
  return p.then((snap) => { bump(collOf(args[0]), { getDocs: 1, reads: snap.size }); return snap; });
}) as unknown as typeof fs.getDocs;

// ── getDoc ──
export const getDoc = ((...args: unknown[]) => {
  const p = (fs.getDoc as (...a: unknown[]) => Promise<{ exists: () => boolean }>)(...args);
  if (!METER_ON) return p;
  return p.then((snap) => { bump(collOf(args[0]), { getDoc: 1, reads: snap.exists() ? 1 : 0 }); return snap; });
}) as unknown as typeof fs.getDoc;

// ── getCountFromServer ── (agregación: ~1 lectura por cada 1000 documentos contados)
export const getCountFromServer = ((...args: unknown[]) => {
  const p = (fs.getCountFromServer as (...a: unknown[]) => Promise<{ data: () => { count: number } }>)(...args);
  if (!METER_ON) return p;
  return p.then((res) => { bump(collOf(args[0]), { count: 1, reads: Math.max(1, Math.ceil(res.data().count / 1000)) }); return res; });
}) as unknown as typeof fs.getCountFromServer;

// ── onSnapshot ── (cubre las formas usadas en el proyecto: target + callback[, errCb])
export const onSnapshot = ((target: unknown, ...rest: unknown[]) => {
  if (!METER_ON || typeof rest[0] !== "function") {
    return (fs.onSnapshot as (...a: unknown[]) => unknown)(target, ...rest);
  }
  const coll = collOf(target);
  const next = rest[0] as (snap: unknown) => void;
  let first = true;
  bump(coll, { attach: 1 });
  const wrapped = (snap: { size?: number; exists?: () => boolean; docChanges?: () => unknown[] }) => {
    if (first) {
      first = false;
      bump(coll, { reads: snap.size ?? (snap.exists?.() ? 1 : 0) });
    } else {
      bump(coll, { updates: 1, reads: snap.docChanges ? snap.docChanges().length : 1 });
    }
    next(snap);
  };
  return (fs.onSnapshot as (...a: unknown[]) => unknown)(target, wrapped, ...rest.slice(1));
}) as unknown as typeof fs.onSnapshot;

// ── Reporter accesible desde la consola del navegador ──
if (isClient) {
  const w = window as unknown as Record<string, unknown>;
  w.firestoreReads = () => {
    const rows = Object.entries(state)
      .map(([coll, st]) => ({ coll, ...st }))
      .sort((a, b) => b.reads - a.reads);
    console.table(rows);
    const total = rows.reduce((n, r) => n + r.reads, 0);
    console.log(`Total de lecturas contadas: ${total}`);
    return rows;
  };
  w.firestoreReadsReset = () => {
    for (const k in state) delete state[k];
    save();
    console.log("[FS] contadores reiniciados");
  };
  window.addEventListener("beforeunload", save);
  window.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") save(); });
}
