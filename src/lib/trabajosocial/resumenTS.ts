// Documentos resumen de Trabajo Social — colección `ts_resumen`.
//
// Optimización de lecturas: los tableros de Rastreo / Seguimiento ya
// NO escuchan colecciones completas (cuyo costo crece con la historia); cada
// tablero escucha UN documento resumen: leerlo entero = 1 lectura, y cada
// cambio de cualquier trabajadora = 1 lectura para las demás.
//
//   ts_resumen/rastreo            → mapa expediente → estado/contacto del rastreo
//                                   (equivale al "DIRECTORIO - CONTROL MENSUAL"
//                                   que la UTS mantenía en cada libro de Excel)
//   ts_resumen/seguimiento-YYYY-MM → mapa expediente → conteo mensual por acción
//                                   (los "TOTAL MENSUAL DE …" de sus hojas)
//   ts_resumen/dia-YYYY-MM-DD      → conteo del día por expediente y por
//                                   trabajadora (la hoja diaria 1..31 del Excel)
//   ts_resumen/asignaciones-YYYY-MM-DD → reparto del día: expediente → colaboradora
//   ts_resumen/equipo              → quién es supervisora de la UTS
//
// Consistencia: el detalle (`rastreos_ts`, `gestiones_ts`) y su entrada del
// resumen se escriben SIEMPRE en el mismo writeBatch (atómico) — un solo punto
// de escritura por flujo, no puede desincronizarse. Como red de seguridad,
// `reconstruirResumenRastreo()` / `reconstruirResumenDia()` rehacen el doc desde
// la colección de detalle.

import {
  collection, deleteField, doc, FieldPath, getDocs, increment, query, setDoc,
  Timestamp, updateDoc, where, type WriteBatch,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import type { GestionTS, RastreoTS } from "@/types";
import { keyAccionSeguimiento, type EstadoRastreo } from "./catalogos";

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

// dia-YYYY-MM-DD: el trabajo de ESE día en un solo documento.
//   porExp          → expediente → { "tipo|modalidad": conteo }  (¿este paciente
//                     ya tuvo seguimiento hoy? = base del reparto de la supervisora)
//   porTrabajadora  → uid → { "tipo|modalidad": conteo }         (contadores del día)
//   total           → gestiones registradas en el día
// A diferencia del resumen mensual (que solo cuenta las 5 acciones de los chips),
// aquí entra TODA gestión —incluidas las "Otras"—, porque la pregunta que responde
// es "¿este expediente recibió algo hoy?".
export interface ResumenDia {
  porExp?: MapaResumenSeguimiento;
  porTrabajadora?: MapaResumenSeguimiento;
  total?: number;
}

// asignaciones-YYYY-MM-DD: el reparto del día que hace la supervisora.
// La entrada lleva un SNAPSHOT del paciente para que la colaboradora vea su lista
// con UNA sola lectura, sin bajar el censo ni el padrón.
export interface EntradaAsignacion {
  u: string;            // uid de la colaboradora
  n: string;            // nombre de la colaboradora
  p: string;            // nombre del paciente
  s?: string | null;    // servicio
  c?: string | null;    // cama
  i?: string | null;    // ingresoId (la estancia)
  por?: string;         // quién repartió
  en?: Timestamp;
}

export type MapaAsignaciones = Record<string, EntradaAsignacion>;

// ts_resumen/equipo: uid → nombre de las supervisoras de la UTS (quienes pueden
// repartir). Lo administra el superusuario desde la vista de Asignaciones.
export interface EquipoTS {
  supervisoras?: Record<string, string>;
}

export const refResumenRastreo = () => doc(db, "ts_resumen", "rastreo");
export const refResumenSeguimiento = (mes: string) => doc(db, "ts_resumen", `seguimiento-${mes}`);
export const refResumenDia = (fecha: string) => doc(db, "ts_resumen", `dia-${fecha}`);
export const refAsignaciones = (fecha: string) => doc(db, "ts_resumen", `asignaciones-${fecha}`);
export const refEquipoTS = () => doc(db, "ts_resumen", "equipo");

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
// OJO: el mes sale de la FECHA DE LA GESTIÓN, no del mes en curso — se puede
// registrar con fecha pasada.
export function resumenSeguimientoInc(batch: WriteBatch, mes: string, exp: string, accionKey: string, delta: number) {
  batch.set(refResumenSeguimiento(mes), { porExp: { [exp]: { [accionKey]: increment(delta) } }, actualizadoEn: Timestamp.now() }, { merge: true });
}

// Suma/resta una gestión en el resumen del día (paciente + trabajadora + total).
export function resumenDiaInc(
  batch: WriteBatch,
  fecha: string,
  exp: string,
  accionKey: string,
  trabajadoraId: string,
  delta: number,
) {
  batch.set(refResumenDia(fecha), {
    porExp: { [exp]: { [accionKey]: increment(delta) } },
    porTrabajadora: { [trabajadoraId]: { [accionKey]: increment(delta) } },
    total: increment(delta),
    actualizadoEn: Timestamp.now(),
  }, { merge: true });
}

// Reparte (o reasigna) expedientes. UNA sola escritura con merge por expediente:
// dos supervisoras trabajando a la vez no se pisan el reparto entero.
export async function asignarExpedientes(fecha: string, entradas: MapaAsignaciones) {
  await setDoc(refAsignaciones(fecha), {
    porExp: entradas,
    actualizadoEn: Timestamp.now(),
  }, { merge: true });
}

// Quita expedientes del reparto del día. `update` con FieldPath explícito: el
// expediente lleva guion y no puede ir como ruta de puntos.
export async function quitarAsignaciones(fecha: string, exps: string[]) {
  if (!exps.length) return;
  const [primero, ...resto] = exps;
  await updateDoc(
    refAsignaciones(fecha),
    new FieldPath("porExp", primero),
    deleteField(),
    ...resto.flatMap((e) => [new FieldPath("porExp", e), deleteField()]),
  );
}

// Red de seguridad: rehace ts_resumen/dia-<fecha> leyendo las gestiones de ESE
// día (1 consulta acotada por `fecha`). Escritura SIN merge: purga los contadores
// que hayan quedado desfasados por escrituras viejas o borrados fuera de la app.
export async function reconstruirResumenDia(fecha: string): Promise<number> {
  const snap = await getDocs(query(collection(db, "gestiones_ts"), where("fecha", "==", fecha)));
  const porExp: MapaResumenSeguimiento = {};
  const porTrabajadora: MapaResumenSeguimiento = {};
  snap.docs.forEach((d) => {
    const g = d.data() as GestionTS;
    const k = keyAccionSeguimiento(g);
    porExp[g.expediente] = { ...porExp[g.expediente], [k]: (porExp[g.expediente]?.[k] ?? 0) + 1 };
    porTrabajadora[g.trabajadoraId] = {
      ...porTrabajadora[g.trabajadoraId],
      [k]: (porTrabajadora[g.trabajadoraId]?.[k] ?? 0) + 1,
    };
  });
  await setDoc(refResumenDia(fecha), {
    porExp, porTrabajadora, total: snap.size, actualizadoEn: Timestamp.now(),
  });
  return snap.size;
}

// ¿El expediente tuvo alguna gestión ese día? (contadores en 0 o negativos por
// borrados cuentan como "nada").
export function tuvoGestionesEse(dia: MapaResumenSeguimiento | undefined, exp: string): boolean {
  const e = dia?.[exp];
  if (!e) return false;
  return Object.values(e).some((n) => (n ?? 0) > 0);
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
