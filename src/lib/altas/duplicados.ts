// Pre-chequeo de duplicados para las notificaciones de alta (vivo) y prealta.
// Es una verificación de UX (no atómica): bloquea el caso real de que alguien ya
// notificó al paciente. Para el simultáneo exacto haría falta un candado atómico.
import { collection, getDocs, query, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";

// Estados en los que una notificación de alta vivo sigue "abierta" (aún no cerrada
// por ESDOMED). procesada/recibida ya están cerradas y no cuentan como duplicado.
const ESTADOS_ABIERTOS_ALTA = ["pendiente", "observada", "deposito", "suspendida"];

export type DuplicadoInfo = { por?: string; cuando?: Date; estado?: string } | null;

const toDate = (v: unknown): Date | undefined => {
  if (!v) return undefined;
  const ts = v as { toDate?: () => Date };
  return ts?.toDate ? ts.toDate() : undefined;
};

// Notificación de alta vivo abierta del paciente, o null si no hay.
export async function notificacionAltaAbierta(pacienteId: string): Promise<DuplicadoInfo> {
  if (!pacienteId) return null;
  const snap = await getDocs(query(collection(db, "notificaciones_altas"), where("pacienteId", "==", pacienteId)));
  const abierta = snap.docs.find(d => ESTADOS_ABIERTOS_ALTA.includes(String(d.data().estado)));
  if (!abierta) return null;
  const data = abierta.data();
  return { por: data.notificadoPorNombre, cuando: toDate(data.creadoEn), estado: String(data.estado) };
}

// Notificaciones de alta vivo abiertas de un grupo de pacientes (p. ej. las camas
// de un servicio), indexadas por pacienteId. Consulta por lotes de 30 (límite de
// `in`), así solo se leen las notificaciones de esos pacientes.
export async function altasAbiertasDe(pacienteIds: string[]): Promise<Record<string, NonNullable<DuplicadoInfo>>> {
  const ids = [...new Set(pacienteIds.filter(Boolean))];
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += 30) lotes.push(ids.slice(i, i + 30));
  const snaps = await Promise.all(
    lotes.map(l => getDocs(query(collection(db, "notificaciones_altas"), where("pacienteId", "in", l)))),
  );
  const abiertas: Record<string, NonNullable<DuplicadoInfo>> = {};
  for (const snap of snaps) {
    for (const d of snap.docs) {
      const data = d.data();
      if (!ESTADOS_ABIERTOS_ALTA.includes(String(data.estado))) continue;
      abiertas[String(data.pacienteId)] = {
        por: data.notificadoPorPersona || data.notificadoPorNombre,
        cuando: toDate(data.creadoEn),
        estado: String(data.estado),
      };
    }
  }
  return abiertas;
}

// Prealta existente del paciente en esa fecha (excluyendo un id al editar), o null.
export async function prealtaExistente(pacienteId: string, fecha: string, excluirId?: string): Promise<DuplicadoInfo> {
  if (!pacienteId || !fecha) return null;
  const snap = await getDocs(query(collection(db, "notificaciones_prealta"), where("pacienteId", "==", pacienteId)));
  const existe = snap.docs.find(d => d.id !== excluirId && String(d.data().fecha) === fecha);
  if (!existe) return null;
  const data = existe.data();
  return { por: data.creadoPorNombre, cuando: toDate(data.creadoEn) };
}

// Formato corto para el aviso ("12 jun, 14:30").
export function fmtCuando(d?: Date): string {
  if (!d) return "";
  return d.toLocaleString("es-SV", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}
