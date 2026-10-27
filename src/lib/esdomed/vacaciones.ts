import { doc, getDoc, setDoc, updateDoc } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import type {
  FilaPlanTrabajo,
  PlanTrabajo,
  ProgramacionVacaciones,
  VacacionAplicadaPlan,
  VacacionProgramada,
} from "@/types";
import { domingoPascua } from "@/lib/esdomed/calendario-plan";
import { normalizarCodigoMarcacion } from "@/lib/esdomed/catalogo-plan";
import { formatPeriodo, NOMBRES_MES, PERIODO_ACTUAL } from "@/lib/esdomed/plan";

// Programación anual de vacaciones del personal operativo de ESDOMED.
//
// Reglas (definidas por la jefatura, 2026-10-27):
//   - Cada periodo son 15 días exactos DENTRO del mes: 1ra quincena = del 1 al
//     15, 2da = del 16 al 30 (el 31 se trabaja). Nunca cruza de mes.
//   - Máximo 2 personas por quincena; solo personal operativo.
//   - Bloqueadas: 2da de febrero (no completa 15 días), Semana Santa (toda
//     quincena que toque del Lunes Santo al Domingo de Pascua), 1ra de agosto
//     (vacaciones de agosto) y 2da de diciembre (fin de año).
//
// El editor del plan la aplica como marcas VAC con el mismo patrón que los
// permisos aprobados (lib/esdomed/permisos-plan): idempotente, con registro de
// lo que había en `fila.vacaciones` para devolverlo si la vacación se mueve, y
// sin volver a pintar una celda que el asistente cambió a mano.

export type Quincena = 1 | 2;

export const COLECCION_VACACIONES = "vacaciones_programadas";
export const CUPOS_POR_QUINCENA = 2;

const MESES_MINUSCULA = NOMBRES_MES.map((m) => m.toLowerCase());

/** Días de la quincena de vacaciones: siempre 15, dentro del mes. */
export function diasQuincena(quincena: Quincena): { desde: number; hasta: number } {
  return quincena === 1 ? { desde: 1, hasta: 15 } : { desde: 16, hasta: 30 };
}

export interface QuincenaAnio {
  mes: number;
  quincena: Quincena;
}

/** Las 24 quincenas del año, en orden. */
export const QUINCENAS_DEL_ANIO: QuincenaAnio[] = Array.from({ length: 24 }, (_, i) => ({
  mes: Math.floor(i / 2) + 1,
  quincena: ((i % 2) + 1) as Quincena,
}));

export const claveQuincena = (mes: number, quincena: Quincena): string => `${mes}-${quincena}`;

/** Por qué en esa quincena no se programan vacaciones, o null si está disponible. */
export function bloqueoQuincena(anio: number, mes: number, quincena: Quincena): string | null {
  if (mes === 2 && quincena === 2) return "Febrero no completa 15 días";
  if (mes === 8 && quincena === 1) return "Vacaciones de agosto";
  if (mes === 12 && quincena === 2) return "Vacaciones de fin de año";
  const pascua = domingoPascua(anio);
  const lunesSanto = new Date(pascua);
  lunesSanto.setDate(pascua.getDate() - 6);
  const { desde, hasta } = diasQuincena(quincena);
  if (new Date(anio, mes - 1, desde) <= pascua && new Date(anio, mes - 1, hasta) >= lunesSanto) {
    return "Semana Santa";
  }
  return null;
}

/** "del 1 al 15 de enero" */
export function rangoQuincena(mes: number, quincena: Quincena): string {
  const { desde, hasta } = diasQuincena(quincena);
  return `del ${desde} al ${hasta} de ${MESES_MINUSCULA[mes - 1]}`;
}

/** "Ene · 1ra" */
export function etiquetaCortaQuincena(mes: number, quincena: Quincena): string {
  return `${NOMBRES_MES[mes - 1].slice(0, 3)} · ${quincena === 1 ? "1ra" : "2da"}`;
}

export function esVacacionDe(
  v: Pick<VacacionProgramada, "uid" | "codigoMarcacion">,
  persona: Pick<FilaPlanTrabajo, "uid" | "codigoMarcacion">,
): boolean {
  if (persona.uid && v.uid === persona.uid) return true;
  const codigo = normalizarCodigoMarcacion(persona.codigoMarcacion);
  return codigo !== "" && normalizarCodigoMarcacion(v.codigoMarcacion) === codigo;
}

/**
 * Solo se sincronizan los meses que no han terminado: los pasados son
 * historial y una vacación movida no los reescribe.
 */
export function mesSincronizable(anio: number, mes: number): boolean {
  return formatPeriodo(anio, mes) >= PERIODO_ACTUAL;
}

export interface ResultadoVacacionesPlan {
  filas: FilaPlanTrabajo[];
  aplicadas: string[]; // personas a las que se les pintaron días VAC
  retiradas: string[]; // personas a las que se les devolvió el turno (la vacación se movió)
}

/**
 * Deja las filas de UN mes como dice la programación: pinta VAC en los días
 * programados que aún no estén registrados y devuelve lo que había en los
 * registrados que ya no lo están. Un día registrado cuya celda el asistente
 * cambió a mano no se vuelve a pintar ni se pisa al retirarlo.
 */
export function sincronizarVacacionesEnFilas(
  filas: FilaPlanTrabajo[],
  programadas: VacacionProgramada[],
  mes: number,
): ResultadoVacacionesPlan {
  const aplicadas = new Set<string>();
  const retiradas = new Set<string>();

  const nuevas = filas.map((fila) => {
    const esperados = new Set<number>();
    for (const v of programadas) {
      if (v.mes !== mes || !esVacacionDe(v, fila)) continue;
      const { desde, hasta } = diasQuincena(v.quincena);
      for (let dia = desde; dia <= hasta && dia <= fila.asignaciones.length; dia++) esperados.add(dia);
    }
    const registros = fila.vacaciones ?? [];
    if (esperados.size === 0 && registros.length === 0) return fila;

    const celdas = [...fila.asignaciones];
    const conservados: VacacionAplicadaPlan[] = [];
    let retiro = false;
    let pinto = false;

    for (const r of registros) {
      if (esperados.has(r.dia)) {
        conservados.push(r);
        continue;
      }
      if ((celdas[r.dia - 1] ?? "").trim().toUpperCase() === "VAC") celdas[r.dia - 1] = r.codigoTurno;
      retiro = true;
    }

    const registrados = new Set(conservados.map((r) => r.dia));
    for (const dia of esperados) {
      if (registrados.has(dia)) continue;
      const actual = celdas[dia - 1] ?? "";
      // Un VAC puesto a mano antes de la programación no es un turno que devolver.
      conservados.push({ dia, codigoTurno: actual.trim().toUpperCase() === "VAC" ? "" : actual });
      celdas[dia - 1] = "VAC";
      pinto = true;
    }

    if (!retiro && !pinto) return fila;
    if (pinto) aplicadas.add(fila.nombre);
    else retiradas.add(fila.nombre);

    const resultado: FilaPlanTrabajo = { ...fila, asignaciones: celdas };
    if (conservados.length > 0) resultado.vacaciones = conservados.sort((a, b) => a.dia - b.dia);
    else delete resultado.vacaciones;
    return resultado;
  });

  return { filas: nuevas, aplicadas: [...aplicadas], retiradas: [...retiradas] };
}

/** Texto para el aviso del editor cuando la programación cambió el mes. */
export function describirCambiosVacaciones(r: Pick<ResultadoVacacionesPlan, "aplicadas" | "retiradas">): string | null {
  const partes: string[] = [];
  if (r.aplicadas.length > 0) partes.push(`Se marcaron las vacaciones programadas de: ${r.aplicadas.join(", ")}.`);
  if (r.retiradas.length > 0) {
    partes.push(`Se devolvieron los turnos de: ${r.retiradas.join(", ")} (su vacación ya no está programada en este mes).`);
  }
  return partes.length > 0 ? partes.join("\n") : null;
}

export async function cargarProgramacionVacaciones(anio: number): Promise<ProgramacionVacaciones | null> {
  const snap = await getDoc(doc(db, COLECCION_VACACIONES, String(anio)));
  return snap.exists() ? (snap.data() as ProgramacionVacaciones) : null;
}

export async function guardarProgramacionVacaciones(
  anio: number,
  asignaciones: VacacionProgramada[],
  quien: { uid: string; nombre: string },
): Promise<Date> {
  const ahora = new Date();
  const payload: ProgramacionVacaciones = {
    anio,
    asignaciones,
    actualizadoEn: ahora,
    actualizadoPorId: quien.uid,
    actualizadoPorNombre: quien.nombre,
  };
  await setDoc(doc(db, COLECCION_VACACIONES, String(anio)), payload);
  return ahora;
}

/**
 * Lleva la programación a los planes YA guardados de los meses que no han
 * terminado, para que "Mi horario" la muestre sin esperar a que el asistente
 * abra cada mes. Los meses sin plan la toman al crearse en el editor.
 * Devuelve los periodos que cambiaron.
 */
export async function propagarVacacionesAPlanes(
  anio: number,
  asignaciones: VacacionProgramada[],
  quien: { uid: string; nombre: string },
): Promise<string[]> {
  const meses = Array.from({ length: 12 }, (_, i) => i + 1).filter((mes) => mesSincronizable(anio, mes));
  const resultados = await Promise.all(
    meses.map(async (mes) => {
      const periodo = formatPeriodo(anio, mes);
      const ref = doc(db, "planes_trabajo", periodo);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const plan = snap.data() as PlanTrabajo;
      const r = sincronizarVacacionesEnFilas(plan.filas ?? [], asignaciones, mes);
      if (r.aplicadas.length === 0 && r.retiradas.length === 0) return null;
      await updateDoc(ref, {
        filas: r.filas,
        actualizadoEn: new Date(),
        actualizadoPorId: quien.uid,
        actualizadoPorNombre: quien.nombre,
      });
      return periodo;
    }),
  );
  return resultados.filter((p): p is string => p !== null);
}
