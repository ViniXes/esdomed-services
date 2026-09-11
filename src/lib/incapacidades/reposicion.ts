import { collection, getDocs, query, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import type { DocumentoExtraido } from "@/lib/simmow/types";
import { extraerFieh } from "@/lib/simmow/fiehExtractor";
import { buscar, soloNumeros } from "@/lib/simmow/texto";
import { normalizarGenero, parseFechaEs } from "@/lib/pacientes/helpers";
import type {
  CondicionEgresoIncapacidad, EstadoIncapacidad, Genero, UserProfile,
} from "@/types";

/**
 * Reposición de incapacidad — constancias de egresos ANTERIORES al arranque de
 * ESDOMED Services. Esos pacientes no existen en /pacientes, así que ESDOMED
 * carga los datos desde el FIEH (Formulario de Ingreso y Egreso Hospitalario)
 * del SIS, asigna un médico y este completa los datos clínicos.
 */

/** Día en que arrancó ESDOMED Services. Egresos anteriores no existen en la app. */
export const FECHA_APERTURA_APP = new Date(2026, 5, 23);

export const ESTADO_INCAPACIDAD_LABEL: Record<EstadoIncapacidad, string> = {
  pendiente_medico: "Por completar",
  pendiente: "Pendiente de emitir",
  emitida: "Emitida",
};

/** ¿El egreso cae en o después de la apertura de la app? (solo para avisar) */
export function egresoPosteriorApertura(d: Date): boolean {
  const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return dia.getTime() >= FECHA_APERTURA_APP.getTime();
}

/** "########-#" a partir de los 9 dígitos que trae el FIEH; otra cosa se deja igual. */
export function formatearDui(valor: string): string {
  const d = soloNumeros(valor);
  if (d.length === 9) return `${d.slice(0, 8)}-${d.slice(8)}`;
  return valor.trim();
}

// ── Prellenado desde el FIEH ─────────────────────────────────────────────────

export interface PrefillReposicion {
  expediente: string;
  apellidos: string;
  nombres: string;
  genero: Genero | "";
  dui: string;
  pasaporte: string;
  numeroAfiliacion: string;
  direccion: string;
  departamento: string;
  municipio: string;
  fechaIngreso: Date | null;
  fechaEgreso: Date | null;
  /** Servicio tal como lo escribe el SIS (resolver contra el catálogo vivo antes de guardar). */
  servicioCrudo: string;
  diagnostico: string;
  recomendaciones: string;
  condicion: CondicionEgresoIncapacidad | "";
  /** "Nombre del médico responsable del alta" según el FIEH. */
  medicoAlta: string;
  /** JVPM del médico del alta, solo dígitos (para sugerir el usuario). */
  jvpm: string;
  advertencias: string[];
}

/**
 * Lee el FIEH con el extractor de SIMMOW y lo traduce a lo que necesita la
 * constancia. Las advertencias son propias de este uso (no las de SIMMOW, que
 * hablan de mapeos y días UCI que aquí no importan).
 */
export function prefillDesdeFieh(doc: DocumentoExtraido): PrefillReposicion {
  const { datos } = extraerFieh(doc);
  const plano = doc.textoCompleto
    .replace(/\r/g, "\n").replace(/\t/g, " ").replace(/\s+/g, " ").trim();

  // El extractor deja la dirección "limpia para SIMMOW" (sin tildes ni
  // puntuación). Para la constancia se prefiere tal como viene.
  const direccion =
    buscar(plano, /Direcci[oó]n\s+(?:residencia:?\s*)?(.*?)\s*Departamento:/i) || datos.DIRECCION;

  const advertencias: string[] = [];

  const fechaIngreso = parseFechaEs(datos.FECHA_INGRESO);
  const fechaEgreso = parseFechaEs(datos.FECHA_EGRESO);
  if (!datos.NEC) advertencias.push("No se detectó el número de expediente (NEC). Escríbalo a mano.");
  if (!datos.APELLIDOS && !datos.NOMBRES) advertencias.push("No se detectó el nombre del paciente.");
  if (!fechaIngreso) advertencias.push("No se detectó la fecha de ingreso. Revise el FIEH.");
  if (!fechaEgreso) advertencias.push("No se detectó la fecha de egreso. Indíquela a mano.");
  if (!datos.SERVICIO_HOSPITALARIO_ORIGEN) advertencias.push("No se detectó el servicio hospitalario.");
  if (!datos.DIAG_PRINCIPAL_TEXTO) advertencias.push("No se detectó el diagnóstico principal; el médico lo escribirá.");

  // Tipo de documento: 1 = DUI del paciente, 2 = pasaporte, 3 = DUI del responsable.
  let dui = "";
  let pasaporte = "";
  if (datos.NUM_DOCUMENTO) {
    if (datos.TIPO_DOCUMENTO_VALOR === "1") dui = formatearDui(datos.NUM_DOCUMENTO);
    else if (datos.TIPO_DOCUMENTO_VALOR === "2") pasaporte = datos.NUM_DOCUMENTO;
    else if (datos.TIPO_DOCUMENTO_VALOR === "3") {
      advertencias.push("El documento del FIEH es el DUI del responsable, no del paciente; se dejó vacío.");
    } else {
      dui = formatearDui(datos.NUM_DOCUMENTO);
    }
  }

  let condicion: CondicionEgresoIncapacidad | "" = "";
  if (datos.CONDICION_EGRESO === "VIVO") condicion = "vivo";
  else if (datos.CONDICION_EGRESO === "MUERTO") condicion = "muerto";
  else advertencias.push("No se pudo leer la condición de egreso; confirme Vivo o Muerto.");

  return {
    expediente: datos.NEC,
    apellidos: datos.APELLIDOS,
    nombres: datos.NOMBRES,
    genero: datos.SEXO ? normalizarGenero(datos.SEXO) : "",
    dui,
    pasaporte,
    numeroAfiliacion: datos.NUM_AFILIACION,
    direccion,
    departamento: datos.DEPARTAMENTO,
    municipio: datos.DISTRITO,
    fechaIngreso,
    fechaEgreso,
    servicioCrudo: datos.SERVICIO_HOSPITALARIO_ORIGEN,
    diagnostico: datos.DIAG_PRINCIPAL_TEXTO,
    recomendaciones: datos.RECOMENDACIONES,
    condicion,
    medicoAlta: datos.MEDICO_RESPONSABLE_ALTA,
    jvpm: datos.JVPM_MEDICO_NUMERO,
    advertencias,
  };
}

// ── Médicos asignables ───────────────────────────────────────────────────────

export interface MedicoAsignable {
  uid: string;
  nombre: string;
  jvpm?: string;
  servicio?: string;
}

/** Usuarios médicos VIGENTES (excluye dados de baja), ordenados por nombre. */
export async function cargarMedicosAsignables(): Promise<MedicoAsignable[]> {
  const snap = await getDocs(query(collection(db, "usuarios"), where("role", "==", "medico")));
  return snap.docs
    .map((d) => ({ uid: d.id, ...(d.data() as Partial<UserProfile>) }))
    .filter((u) => u.activo !== false && !u.generico && !!u.nombre)
    .map((u) => ({
      uid: u.uid,
      nombre: u.nombre as string,
      jvpm: u.jvpm,
      servicio: u.servicio ?? u.servicios?.[0],
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Sugiere el usuario cuyo JVPM coincide (por dígitos) con el del FIEH. */
export function sugerirMedicoPorJvpm(medicos: MedicoAsignable[], jvpm: string): MedicoAsignable | null {
  const objetivo = soloNumeros(jvpm);
  if (!objetivo) return null;
  return medicos.find((m) => m.jvpm && soloNumeros(m.jvpm) === objetivo) ?? null;
}
