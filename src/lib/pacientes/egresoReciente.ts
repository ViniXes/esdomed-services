import { collection, getDocs, query, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { toDate } from "@/lib/pacientes/helpers";

// Retención de expedientes ya egresados al sincronizar el reporte de activos del SIS.
//
// Problema real: ESDOMED procesa un alta efectiva (o confirma una defunción) y el
// ingreso sale de los activos. Si después alguien importa un reporte del SIS que
// TODAVÍA lo trae (descargado antes del alta, o el alta aún no se digitó en el
// SIS), la importación no lo encontraba entre los activos, lo tomaba por "nuevo"
// y creaba un segundo ingreso activo: el paciente volvía a la lista como si
// nunca se hubiera ido.
//
// Regla (sobre el ÚLTIMO egreso conocido del expediente):
//  - Defunción → nunca se importa, sin confirmación posible: una persona
//    fallecida no reingresa.
//  - Mismo ingreso → el reporte trae una fecha de ingreso que no es posterior al
//    día en que empezó la estancia que ya egresó. El SIS no refleja el alta. Se
//    retiene aunque hayan pasado más de 24 h.
//  - Alta registrada hace menos de 24 h → se retiene.
// Las dos últimas solo entran si ESDOMED confirma que es un reingreso real (salió
// y volvió a ingresar); la confirmación queda auditada en el ingreso nuevo.

export const VENTANA_REINGRESO_HORAS = 24;

export interface EgresoPrevio {
  fuente: "ingreso" | "defuncion";
  pacienteId?: string;    // ingreso en /pacientes (para enlazar la ficha)
  fallecidoId?: string;   // notificaciones_fallecidos (defunción sin ingreso enlazado)
  fallecido: boolean;
  estado: string;         // EstadoPaciente ("alta_fallecido" para defunciones)
  fechaIngreso?: Date;    // inicio de la estancia que egresó
  fechaEgreso: Date;      // momento clínico del egreso
  registradoEn: Date;     // cuándo quedó registrado en la app
}

export interface HistorialExpediente {
  /** Ya hay un ingreso activo (p. ej. otra importación lo creó mientras se revisaba). */
  hayActivo: boolean;
  ultimoEgreso?: EgresoPrevio;
}

export type MotivoRetencion = "defuncion" | "mismo_ingreso" | "alta_reciente";

export interface Retencion {
  motivo: MotivoRetencion;
  /** false → no se importa nunca (defunción). */
  confirmable: boolean;
  horasDesdeEgreso: number;
  egreso: EgresoPrevio;
}

/** El más reciente por fecha de egreso; si empatan, gana la defunción. */
function masReciente(a: EgresoPrevio | undefined, b: EgresoPrevio): EgresoPrevio {
  if (!a) return b;
  const ta = a.fechaEgreso.getTime();
  const tb = b.fechaEgreso.getTime();
  if (tb !== ta) return tb > ta ? b : a;
  return b.fallecido && !a.fallecido ? b : a;
}

/** El reporte trae una estancia que empezó a más tardar el día en que empezó la que
 *  ya egresó, y antes del egreso: es la misma (o una anterior aún abierta en el SIS). */
function esMismoIngreso(fechaIngresoReporte: Date | null, egreso: EgresoPrevio): boolean {
  if (!fechaIngresoReporte || !egreso.fechaIngreso) return false;
  const i = egreso.fechaIngreso;
  const finDiaIngreso = new Date(i.getFullYear(), i.getMonth(), i.getDate(), 23, 59, 59, 999).getTime();
  const f = fechaIngresoReporte.getTime();
  return f <= finDiaIngreso && f < egreso.fechaEgreso.getTime();
}

export function evaluarRetencion(
  fechaIngresoReporte: Date | null,
  egreso: EgresoPrevio | undefined,
  ahora: Date = new Date(),
): Retencion | null {
  if (!egreso) return null;
  // Se mide desde lo último entre el egreso clínico y su registro en la app: un
  // egreso digitado tarde también deja al SIS desfasado durante ese día.
  const referencia = Math.max(egreso.fechaEgreso.getTime(), egreso.registradoEn.getTime());
  const horasDesdeEgreso = (ahora.getTime() - referencia) / 3_600_000;
  const base = { horasDesdeEgreso, egreso };

  if (egreso.fallecido) return { ...base, motivo: "defuncion", confirmable: false };
  if (esMismoIngreso(fechaIngresoReporte, egreso)) return { ...base, motivo: "mismo_ingreso", confirmable: true };
  if (horasDesdeEgreso < VENTANA_REINGRESO_HORAS) return { ...base, motivo: "alta_reciente", confirmable: true };
  return null;
}

/** Misma retención contra el mismo egreso (para validar una confirmación previa). */
export function mismoEgreso(a: EgresoPrevio, b: EgresoPrevio): boolean {
  return (
    a.fuente === b.fuente &&
    (a.pacienteId ?? a.fallecidoId) === (b.pacienteId ?? b.fallecidoId) &&
    a.fechaEgreso.getTime() === b.fechaEgreso.getTime()
  );
}

const LOTE_IN = 30; // límite de valores de Firestore para el operador "in"

/**
 * Historial de egresos de los expedientes dados: todos sus ingresos en /pacientes
 * (cualquier estado) y las defunciones confirmadas, aunque no tengan ingreso
 * enlazado (p. ej. fallecidos en emergencia). Solo se consulta por los expedientes
 * candidatos a "nuevo", así que el costo es de unas pocas lecturas por fila.
 */
export async function cargarHistorialEgresos(expedientes: string[]): Promise<Map<string, HistorialExpediente>> {
  const unicos = [...new Set(expedientes.map((e) => e.trim()).filter(Boolean))];
  const mapa = new Map<string, HistorialExpediente>();
  const de = (exp: string) => {
    let h = mapa.get(exp);
    if (!h) { h = { hayActivo: false }; mapa.set(exp, h); }
    return h;
  };

  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += LOTE_IN) lotes.push(unicos.slice(i, i + LOTE_IN));

  await Promise.all(lotes.flatMap((lote) => [
    getDocs(query(collection(db, "pacientes"), where("expediente", "in", lote))).then((snap) => {
      snap.forEach((d) => {
        const data = d.data();
        const h = de(String(data.expediente ?? "").trim());
        if (data.estado === "activo") { h.hayActivo = true; return; }
        const fechaEgreso = toDate(data.fechaEgreso) ?? toDate(data.egresadoAutoEn) ?? toDate(data.actualizadoEn);
        if (!fechaEgreso) return;
        h.ultimoEgreso = masReciente(h.ultimoEgreso, {
          fuente: "ingreso",
          pacienteId: d.id,
          fallecido: data.estado === "alta_fallecido",
          estado: String(data.estado ?? ""),
          fechaIngreso: toDate(data.fechaIngreso),
          fechaEgreso,
          registradoEn: toDate(data.egresadoAutoEn) ?? fechaEgreso,
        });
      });
    }),
    getDocs(query(collection(db, "notificaciones_fallecidos"), where("pacienteExpediente", "in", lote))).then((snap) => {
      snap.forEach((d) => {
        const data = d.data();
        if (data.estado !== "confirmado") return;
        const fecha = toDate(data.fechaDefuncion) ?? toDate(data.confirmadoEn);
        if (!fecha) return;
        const h = de(String(data.pacienteExpediente ?? "").trim());
        h.ultimoEgreso = masReciente(h.ultimoEgreso, {
          fuente: "defuncion",
          fallecidoId: d.id,
          pacienteId: data.pacienteId ? String(data.pacienteId) : undefined,
          fallecido: true,
          estado: "alta_fallecido",
          fechaEgreso: fecha,
          registradoEn: toDate(data.confirmadoEn) ?? fecha,
        });
      });
    }),
  ]));

  return mapa;
}
