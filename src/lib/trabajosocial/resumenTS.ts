// Documentos resumen de Trabajo Social — colección `ts_resumen`.
//
// Optimización de lecturas: los tableros de Rastreo / Seguimiento / Panorama ya
// NO escuchan colecciones completas (cuyo costo crece con la historia); cada
// tablero escucha UN documento resumen: leerlo entero = 1 lectura, y cada
// cambio de cualquier trabajadora = 1 lectura para las demás.
//
//   ts_resumen/rastreo            → mapa expediente → estado/contacto del rastreo
//                                   (equivale al "DIRECTORIO - CONTROL MENSUAL"
//                                   que la UTS mantenía en cada libro de Excel)
//   ts_resumen/seguimiento-YYYY-MM → mapa expediente → conteo mensual por acción
//                                   (los "TOTAL MENSUAL DE …" de sus hojas)
//
// Consistencia: el detalle (`rastreos_ts`, `gestiones_ts`) y su entrada del
// resumen se escriben SIEMPRE en el mismo writeBatch (atómico) — un solo punto
// de escritura por flujo, no puede desincronizarse. Como red de seguridad,
// `reconstruirResumenRastreo()` rehace el doc desde la colección de detalle.

import {
  collection, doc, getDocs, increment, setDoc, Timestamp, type WriteBatch,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import type { RastreoTS } from "@/types";
import type { EstadoRastreo } from "./catalogos";

// Entrada por expediente del tablero de rastreo. Claves cortas a propósito:
// el doc viaja completo en cada snapshot (1 lectura, pero ancho de banda).
export interface EntradaResumenRastreo {
  e: EstadoRastreo;          // estado del rastreo
  i?: number;                // nº de intentos de contacto (bitácora)
  u?: string;                // última actualización "YYYY-MM-DD"
  f?: string | null;         // familiar / responsable
  p?: string | null;         // parentesco
  t?: string | null;         // teléfono del familiar
  d?: string | null;         // dirección actual
  dui?: "menor" | "no_dui" | null; // motivo si el paciente no tiene DUI
}

export type MapaResumenRastreo = Record<string, EntradaResumenRastreo>;

// seguimiento-YYYY-MM: expediente → { "tipo|modalidad": conteo del mes }
export type MapaResumenSeguimiento = Record<string, Record<string, number>>;

export const refResumenRastreo = () => doc(db, "ts_resumen", "rastreo");
export const refResumenSeguimiento = (mes: string) => doc(db, "ts_resumen", `seguimiento-${mes}`);

// Actualiza (merge profundo) la entrada de un expediente en el tablero de
// rastreo, dentro del batch de la escritura de detalle. Acepta sentinelas de
// Firestore (p. ej. `i: increment(1)`), por eso el tipo es laxo.
export function resumenRastreoSet(
  batch: WriteBatch,
  exp: string,
  entrada: Partial<EntradaResumenRastreo> | Record<string, unknown>,
) {
  batch.set(refResumenRastreo(), { porExp: { [exp]: entrada }, actualizadoEn: Timestamp.now() }, { merge: true });
}

// Suma/resta intentos de contacto de un expediente (bitácora del rastreo).
export function resumenRastreoIncIntentos(batch: WriteBatch, exp: string, delta: number) {
  resumenRastreoSet(batch, exp, { i: increment(delta) });
}

// Suma/resta una marca del mes (llave "tipo|modalidad" de ACCIONES_SEGUIMIENTO).
export function resumenSeguimientoInc(batch: WriteBatch, mes: string, exp: string, accionKey: string, delta: number) {
  batch.set(refResumenSeguimiento(mes), { porExp: { [exp]: { [accionKey]: increment(delta) } }, actualizadoEn: Timestamp.now() }, { merge: true });
}

// Convierte un doc de detalle de rastreo a su entrada de resumen.
export function entradaDesdeRastreo(r: Partial<RastreoTS>, hoy?: string): EntradaResumenRastreo {
  return {
    e: (r.estado ?? "en_gestion") as EstadoRastreo,
    i: r.intentosContacto?.length ?? 0,
    u: hoy ?? undefined,
    f: r.familiarNombre ?? null,
    p: r.parentesco ?? null,
    t: r.telefono ?? null,
    d: r.direccionActual ?? null,
    dui: r.duiPaciente ?? null,
  };
}

// Red de seguridad (admin): rehace ts_resumen/rastreo leyendo TODA la colección
// de detalle una vez. Escritura SIN merge: purga entradas de egresados.
export async function reconstruirResumenRastreo(): Promise<number> {
  const snap = await getDocs(collection(db, "rastreos_ts"));
  const porExp: MapaResumenRastreo = {};
  snap.docs.forEach((d) => {
    porExp[d.id] = entradaDesdeRastreo(d.data() as Partial<RastreoTS>);
  });
  await setDoc(refResumenRastreo(), { porExp, actualizadoEn: Timestamp.now() });
  return snap.size;
}
