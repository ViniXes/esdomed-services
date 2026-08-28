import { collection, getDocs, query, where, Timestamp } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import type { FilaPlanTrabajo, PermisoTramitePlan, TramitePersonal } from "@/types";
import { getHorario } from "@/lib/esdomed/horarios";
import { toDate } from "@/lib/pacientes/helpers";

// Puente entre los trámites de personal (A1/A2, permisos con/sin goce) y el
// plan de trabajo de ESDOMED. Un permiso APROBADO se refleja como marca "PER"
// en los días de turno que cubre; una fracción de turno conserva el código y
// se anota en `fila.permisos`.
//
// La aplicación tiene DOS vías (ambas usan `aplicarPermisoEnFilas`):
//   1. Al aprobar el trámite, si el plan del mes ya existe (transacción).
//   2. Al abrir el editor del plan, como respaldo: cubre permisos aprobados
//      antes de que exista el plan del mes.
// Es idempotente: un (tramiteId, dia) registrado en `fila.permisos` no se
// vuelve a aplicar, así el asistente puede corregir celdas sin pelear con la
// automatización.

export const esPermisoPersonal = (t: Pick<TramitePersonal, "categoria">): boolean =>
  t.categoria === "A1_permiso_con_goce" || t.categoria === "A2_permiso_sin_goce";

/** Fecha local "YYYY-MM-DD" de un Timestamp/Date de Firestore. */
export const fechaLocalISO = (valor: unknown): string | null => {
  const fecha = toDate(valor);
  if (!fecha || Number.isNaN(fecha.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
};

/** Días calendario ("YYYY-MM-DD") que cubre el permiso, de inicio a fin. */
export const fechasDelPermiso = (tramite: Pick<TramitePersonal, "fechaInicio" | "fechaFin">): string[] => {
  const inicio = fechaLocalISO(tramite.fechaInicio);
  const fin = fechaLocalISO(tramite.fechaFin) ?? inicio;
  if (!inicio || !fin || fin < inicio) return [];

  const fechas: string[] = [];
  const cursor = new Date(`${inicio}T12:00:00`);
  const ultimo = new Date(`${fin}T12:00:00`);
  while (cursor <= ultimo) {
    const pad = (n: number) => String(n).padStart(2, "0");
    fechas.push(`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return fechas;
};

export const periodoDeFecha = (fecha: string): string => fecha.slice(0, 7);

/** Periodos "YYYY-MM" que toca el permiso (normalmente uno). */
export const periodosDelPermiso = (tramite: Pick<TramitePersonal, "fechaInicio" | "fechaFin">): string[] =>
  [...new Set(fechasDelPermiso(tramite).map(periodoDeFecha))];

export interface ResultadoAplicarPermiso {
  filas: FilaPlanTrabajo[];
  cambio: boolean;      // hubo algo nuevo que aplicar
  completos: number;    // días marcados PER
  parciales: number;    // días anotados como fracción de turno
  sinTurno: number;     // días del permiso sin turno asignado (descanso/marca) — no se tocan
  sinFila: boolean;     // el empleado no tiene fila en este plan
}

/**
 * Aplica un permiso aprobado sobre las filas de UN mes. Regla completo/fracción:
 * un permiso de un solo día con `horas` menores a las del turno asignado es
 * fracción (la celda conserva el turno); todo lo demás marca "PER" el día.
 */
export function aplicarPermisoEnFilas(
  filas: FilaPlanTrabajo[],
  tramite: TramitePersonal,
  anio: number,
  mes: number,
): ResultadoAplicarPermiso {
  const sinCambios: ResultadoAplicarPermiso = { filas, cambio: false, completos: 0, parciales: 0, sinTurno: 0, sinFila: false };
  if (!tramite.id || !esPermisoPersonal(tramite)) return sinCambios;

  const fechas = fechasDelPermiso(tramite);
  const prefijo = `${anio}-${String(mes).padStart(2, "0")}-`;
  const diasDelMesPermiso = fechas.filter((f) => f.startsWith(prefijo)).map((f) => Number(f.slice(8)));
  if (diasDelMesPermiso.length === 0) return sinCambios;

  const filaIdx = filas.findIndex((f) => f.uid && f.uid === tramite.empleadoId);
  if (filaIdx === -1) return { ...sinCambios, sinFila: true };

  const fila = filas[filaIdx];
  const esUnSoloDia = fechas.length === 1;
  const yaAplicado = new Set((fila.permisos ?? []).map((p) => `${p.tramiteId}|${p.dia}`));

  const asignaciones = [...fila.asignaciones];
  const nuevos: PermisoTramitePlan[] = [];
  let completos = 0;
  let parciales = 0;
  let sinTurno = 0;

  for (const dia of diasDelMesPermiso) {
    if (dia < 1 || dia > asignaciones.length) continue;
    if (yaAplicado.has(`${tramite.id}|${dia}`)) continue;
    const celda = (asignaciones[dia - 1] ?? "").trim().toUpperCase();
    const horario = getHorario(celda);
    if (!horario) {
      // Día sin turno (descanso o marca especial): no hay jornada que cubrir.
      sinTurno++;
      continue;
    }
    const horas = typeof tramite.horas === "number" && tramite.horas > 0 ? tramite.horas : horario.horas;
    if (esUnSoloDia && horas < horario.horas) {
      nuevos.push({ dia, tramiteId: tramite.id, horas, parcial: true, codigoTurno: celda });
      parciales++;
    } else {
      asignaciones[dia - 1] = "PER";
      nuevos.push({ dia, tramiteId: tramite.id, horas: horario.horas, parcial: false, codigoTurno: celda });
      completos++;
    }
  }

  if (nuevos.length === 0) return { ...sinCambios, sinTurno };

  const filasNuevas = filas.map((f, i) =>
    i === filaIdx
      ? { ...f, asignaciones, permisos: [...(f.permisos ?? []), ...nuevos].sort((a, b) => a.dia - b.dia) }
      : f,
  );
  return { filas: filasNuevas, cambio: true, completos, parciales, sinTurno, sinFila: false };
}

/** Aplica una lista de permisos aprobados sobre las filas de un mes (para el editor). */
export function aplicarPermisosAprobados(
  filas: FilaPlanTrabajo[],
  tramites: TramitePersonal[],
  anio: number,
  mes: number,
): { filas: FilaPlanTrabajo[]; completos: number; parciales: number; empleados: string[] } {
  let actuales = filas;
  let completos = 0;
  let parciales = 0;
  const empleados = new Set<string>();
  for (const tramite of tramites) {
    const r = aplicarPermisoEnFilas(actuales, tramite, anio, mes);
    if (r.cambio) {
      actuales = r.filas;
      completos += r.completos;
      parciales += r.parciales;
      empleados.add(tramite.empleadoNombre);
    }
  }
  return { filas: actuales, completos, parciales, empleados: [...empleados] };
}

/**
 * Permisos personales APROBADOS cuya fecha de inicio cae alrededor del periodo.
 * Rango simple sobre `fechaInicio` (sin índice compuesto); el margen de 15 días
 * hacia atrás cubre permisos que arrancan el mes anterior y cruzan al actual.
 * Estado y categoría se filtran en el cliente.
 */
export async function cargarPermisosAprobadosDelPeriodo(anio: number, mes: number): Promise<TramitePersonal[]> {
  const desde = new Date(anio, mes - 1, 1);
  desde.setDate(desde.getDate() - 15);
  const hasta = new Date(anio, mes, 0, 23, 59, 59);
  const snap = await getDocs(
    query(
      collection(db, "tramites_personal"),
      where("fechaInicio", ">=", Timestamp.fromDate(desde)),
      where("fechaInicio", "<=", Timestamp.fromDate(hasta)),
    ),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as TramitePersonal))
    .filter((t) => t.estado === "aprobado" && esPermisoPersonal(t));
}

/** Registro de permiso aplicado en un día de la fila (para tooltips/indicadores). */
export function permisoDelDia(fila: Pick<FilaPlanTrabajo, "permisos">, dia: number): PermisoTramitePlan | undefined {
  return fila.permisos?.find((p) => p.dia === dia);
}

/** Minutos desde medianoche de una etiqueta de hora del catálogo ("7:00 am"). */
export function minutosDeEtiqueta(etiqueta: string): number | null {
  const match = etiqueta.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!match) return null;
  let hora = Number(match[1]) % 12;
  if (match[3].toLowerCase() === "pm") hora += 12;
  return hora * 60 + Number(match[2]);
}
