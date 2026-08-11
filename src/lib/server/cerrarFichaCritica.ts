import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { SERVICIOS_UCI, SERVICIOS_UCIN } from "@/lib/cuidadosCriticos";
import { adminDb } from "@/lib/firebase-admin";

const SERVICIOS_CRITICOS = new Set<string>([...SERVICIOS_UCI, ...SERVICIOS_UCIN]);
const VALOR_NO_REGISTRADO = "No registrado";

function texto(value: unknown) {
  return String(value ?? "").trim();
}

function normalizar(value: unknown) {
  return texto(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function registrado(value: unknown) {
  const valueText = texto(value);
  return Boolean(valueText) && valueText !== VALOR_NO_REGISTRADO && valueText !== ",";
}

function fechaInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value: unknown) {
  if (!value) return null;
  const date = typeof (value as { toDate?: () => Date }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : value instanceof Date
      ? value
      : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function diasInclusivos(desde: unknown, hasta: Date) {
  const inicio = parseDate(desde);
  if (!inicio) return null;
  const a = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  const b = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  if (b < a) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

export interface CerrarFichaCriticaPorEgresoParams {
  pacienteId?: string | null;
  expediente?: string | null;
  estadoPaciente: string;
  fechaEgreso: Date;
  caller: {
    uid: string;
    nombre: string;
  };
  fuente: string;
  referenciaId?: string | null;
}

export async function cerrarFichasCriticasActivasPorEgresoPaciente({
  pacienteId,
  expediente,
  estadoPaciente,
  fechaEgreso,
  caller,
  fuente,
  referenciaId,
}: CerrarFichaCriticaPorEgresoParams) {
  const docs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();

  if (pacienteId) {
    const snap = await adminDb.collection("fichas_cuidados_criticos")
      .where("pacienteId", "==", pacienteId)
      .where("estadoEstancia", "==", "activa")
      .get();
    snap.docs.forEach(doc => docs.set(doc.id, doc));
  }

  if (expediente) {
    const snap = await adminDb.collection("fichas_cuidados_criticos")
      .where("pacienteExpediente", "==", expediente)
      .where("estadoEstancia", "==", "activa")
      .get();
    snap.docs.forEach(doc => docs.set(doc.id, doc));
  }

  const fechaEgresoServicio = fechaInput(fechaEgreso);
  const esFallecido = estadoPaciente === "alta_fallecido";
  const cerrables = [...docs.values()].filter(doc => SERVICIOS_CRITICOS.has(texto(doc.data().servicio)));

  if (cerrables.length === 0) {
    return { cerradas: 0, fichas: [] as string[] };
  }

  const batch = adminDb.batch();
  for (const doc of cerrables) {
    const ficha = doc.data();
    const datos = { ...(ficha.datos ?? {}) };

    datos.fecha_egreso_del_servicio = fechaEgresoServicio;
    if (esFallecido) {
      datos.alta = "FALLECIDO";
      if (!registrado(datos.fecha_de_muerte)) datos.fecha_de_muerte = fechaEgresoServicio;
    } else if (!registrado(datos.alta) || normalizar(datos.alta) === "NO") {
      datos.alta = "ALTA";
    }

    const dias = diasInclusivos(datos.fecha_ingreso_al_servicio, fechaEgreso);
    if (dias !== null) datos.dias_en_servicio = dias;

    batch.update(doc.ref, {
      estadoEstancia: "egresada",
      datos,
      actualizadoPorId: caller.uid,
      actualizadoPorNombre: caller.nombre,
      actualizadoEn: FieldValue.serverTimestamp(),
      cierreAutomaticoHospitalario: {
        fuente,
        referenciaId: referenciaId ?? null,
        pacienteId: pacienteId ?? texto(ficha.pacienteId),
        expediente: expediente ?? texto(ficha.pacienteExpediente),
        pacienteEstado: estadoPaciente,
        fechaEgresoHospitalario: Timestamp.fromDate(fechaEgreso),
        aplicadoEn: FieldValue.serverTimestamp(),
      },
    });
  }

  await batch.commit();
  return { cerradas: cerrables.length, fichas: cerrables.map(doc => doc.id) };
}
