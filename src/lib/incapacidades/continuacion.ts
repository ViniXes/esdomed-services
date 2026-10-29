import { collection, getDocs, query, Timestamp, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import type { ContinuacionIncapacidad, SolicitudIncapacidad } from "@/types";
import { aMedianocheLocal, mapIncapacidadData } from "@/lib/incapacidades/helpers";

/**
 * Continuación de una incapacidad vigente (ver ContinuacionIncapacidad en
 * types y calcularPeriodoIncapacidad en helpers): detecta si el paciente ya
 * estaba incapacitado por otra constancia cuando empieza la nueva, para que
 * el período nuevo arranque al día siguiente y el patrono no la rechace por
 * traslape.
 */

// Sin `id` (ni médico/días) cuando la anterior no está en el sistema y ESDOMED
// solo registró hasta cuándo iba.
export interface IncapacidadVigente {
  id?: string;
  desde?: Date;
  hasta: Date;
  dias?: number;
  medicoNombre?: string;
  servicio?: string;
}

function aVigente(s: SolicitudIncapacidad): IncapacidadVigente {
  return {
    id: s.id,
    desde: s.fechaDesde,
    hasta: s.fechaHasta,
    dias: s.diasIncapacidad,
    medicoNombre: s.medicoNombre,
    servicio: s.servicioPaciente,
  };
}

/** Todas las incapacidades del expediente (pocas por paciente; sin índice compuesto). */
export async function cargarIncapacidadesDelExpediente(expediente: string): Promise<SolicitudIncapacidad[]> {
  const exp = expediente.trim();
  if (!exp) return [];
  const snap = await getDocs(query(collection(db, "incapacidades"), where("pacienteExpediente", "==", exp)));
  return snap.docs.map((d) => mapIncapacidadData(d.id, d.data()));
}

/**
 * La incapacidad que seguía vigente el día `inicio` (ingreso en
 * hospitalización, fecha de inicio en emergencia): empezó ese día o antes y
 * termina ese día o después. Si hay varias, la que termina más tarde.
 * Se ignoran la propia (`excluir.id`) y las del MISMO ingreso o atención de
 * emergencia: esas son duplicados, no una incapacidad anterior.
 */
export function incapacidadVigenteEn(
  lista: SolicitudIncapacidad[],
  inicio: Date,
  excluir: { id?: string; pacienteId?: string; atencionEmergenciaId?: string } = {},
): IncapacidadVigente | null {
  const dia = aMedianocheLocal(inicio).getTime();
  const candidatas = lista
    .filter((s) => s.id !== excluir.id)
    .filter((s) => !(excluir.pacienteId && s.pacienteId === excluir.pacienteId))
    .filter((s) => !(excluir.atencionEmergenciaId && s.atencionEmergenciaId === excluir.atencionEmergenciaId))
    .filter((s) => aMedianocheLocal(s.fechaDesde).getTime() <= dia && aMedianocheLocal(s.fechaHasta).getTime() >= dia)
    .sort((a, b) => b.fechaHasta.getTime() - a.fechaHasta.getTime());
  return candidatas[0] ? aVigente(candidatas[0]) : null;
}

/**
 * La anterior de una continuación ya guardada: la del sistema si sigue
 * existiendo (datos al día, p. ej. si le corrigieron días) o lo que se guardó.
 */
export function vigenteDeContinuacion(c: ContinuacionIncapacidad, lista: SolicitudIncapacidad[]): IncapacidadVigente {
  const s = c.incapacidadAnteriorId ? lista.find((x) => x.id === c.incapacidadAnteriorId) : undefined;
  return s ? aVigente(s) : { id: c.incapacidadAnteriorId, desde: c.desdeAnterior, hasta: c.hastaAnterior };
}

/** Bloque `continuaDe` listo para Firestore. */
export function continuacionParaFirestore(
  vigente: Pick<IncapacidadVigente, "hasta"> & Partial<Pick<IncapacidadVigente, "id" | "desde">>,
  aplicadaPor: string,
  aclaracion?: string,
): Record<string, unknown> {
  return {
    hastaAnterior: Timestamp.fromDate(aMedianocheLocal(vigente.hasta)),
    ...(vigente.desde ? { desdeAnterior: Timestamp.fromDate(aMedianocheLocal(vigente.desde)) } : {}),
    ...(vigente.id ? { incapacidadAnteriorId: vigente.id } : {}),
    aplicadaPor,
    aplicadaEn: Timestamp.now(),
    ...(aclaracion?.trim() ? { aclaracion: aclaracion.trim() } : {}),
  };
}
