// ─────────────────────────────────────────────────────────────────────────────
// Catálogos y helpers de los Censos de Emergencia (demanda espontánea/referidos)
//
// Todos los catálogos salen de los valores REALES de los libros de Excel 2026
// (hojas de junio), normalizados: donde el libro tenía 26 variantes de texto
// libre aquí hay una lista cerrada. Si emergencia pide un valor nuevo, se
// agrega aquí (una línea) y queda disponible para todos.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ClasificacionSisReferido,
  DestinoEmergencia,
  TipoEvaluadorEmergencia,
  TriageEmergencia,
  TurnoEmergencia,
} from "@/types";

// ── Turnos (columna HORARIO) ─────────────────────────────────────────────────

export const TURNOS: { value: TurnoEmergencia; label: string }[] = [
  { value: "t00_07", label: "00:00 – 07:00" },
  { value: "t07_15", label: "07:00 – 15:00" },
  { value: "t15_19", label: "15:00 – 19:00" },
  { value: "t19_24", label: "19:00 – 24:00" },
];

export const TURNO_LABEL: Record<TurnoEmergencia, string> = Object.fromEntries(
  TURNOS.map((t) => [t.value, t.label]),
) as Record<TurnoEmergencia, string>;

// Sugerencia de turno según la hora (el médico siempre puede cambiarlo).
export function turnoSegunHora(d: Date): TurnoEmergencia {
  const h = d.getHours();
  if (h < 7) return "t00_07";
  if (h < 15) return "t07_15";
  if (h < 19) return "t15_19";
  return "t19_24";
}

// ── Triage ───────────────────────────────────────────────────────────────────

export const TRIAGES: { value: TriageEmergencia; label: string; chip: string }[] = [
  { value: "rojo",     label: "Rojo",     chip: "bg-red-600 text-white border-red-600" },
  { value: "amarillo", label: "Amarillo", chip: "bg-amber-400 text-amber-950 border-amber-400" },
  { value: "verde",    label: "Verde",    chip: "bg-emerald-600 text-white border-emerald-600" },
];

export const TRIAGE_LABEL: Record<TriageEmergencia, string> = {
  rojo: "Rojo", amarillo: "Amarillo", verde: "Verde",
};

// ── Destinos (demanda espontánea) ────────────────────────────────────────────

export const DESTINOS: { value: DestinoEmergencia; label: string }[] = [
  { value: "alta",            label: "Alta" },
  { value: "ingreso",         label: "Ingreso" },
  { value: "referencia",      label: "Referencia a otro centro" },
  { value: "alta_voluntaria", label: "Alta voluntaria / exigida" },
  { value: "fuga",            label: "Fuga" },
];

export const DESTINO_LABEL: Record<DestinoEmergencia, string> = Object.fromEntries(
  DESTINOS.map((d) => [d.value, d.label]),
) as Record<DestinoEmergencia, string>;

// ── Especialidades que evalúan en emergencia ─────────────────────────────────

export const ESPECIALIDADES_EMERGENCIA = [
  "Medicina Interna",
  "Cirugía",
  "Medicina General",
  "Oncología",
  "Ginecología",
  "Cardiología",
  "Otra",
] as const;

// ── Servicios a los que se ingresa desde emergencia (nivel macro del censo) ──

export const SERVICIOS_INGRESO = [
  "Medicina Interna",
  "Cirugía",
  "Diálisis Peritoneal",
  "Hematología",
  "Cuidados Intermedios",
  "UCI",
  "UCIN Agudos",
  "UCIN Crónicos",
  "Neurocirugía",
  "Cirugía Cardiovascular",
  "UCPPC",
  "Cardiología",
  "Oncología",
  "Paliativos",
  "BM",
  "BM Cuidados Intermedios",
  "UCI BM",
  "Otro",
] as const;

// ── Hospitales / establecimientos que refieren ──────────────────────────────
// Nombres cortos como los usa el censo (el catálogo largo de establecimientos
// de lib/establecimientos.ts es para referencias formales de salida).

export const HOSPITALES_REFERENCIA = [
  "HN San Rafael",
  "HN Zacamil",
  "DoctorSV",
  "HN Rosales",
  "HN Cojutepeque",
  "HN Saldaña",
  "HN Sonsonate",
  "HN Chalatenango",
  "HN San Miguel",
  "HN San Vicente",
  "HN Santa Ana",
  "HN Molina (Soyapango)",
  "HN Ahuachapán",
  "HN San Bartolo",
  "HN Zacatecoluca",
  "HN Chalchuapa",
  "HN Suchitoto",
  "HN Nueva Concepción",
  "HN Santa Rosa de Lima",
  "HN Sensuntepeque",
  "HN Ilobasco",
  "HN Jiquilisco",
  "HN Usulután",
  "HNN Benjamín Bloom",
  "HN de la Mujer",
  // Red hospitalaria del ISSS (nombres cortos; el catálogo formal está en
  // lib/establecimientos.ts).
  "ISSS General",
  "ISSS Médico Quirúrgico y Oncológico",
  "ISSS 1° de Mayo (Materno Infantil)",
  "ISSS Amatepec",
  "ISSS Policlínico Arce",
  "ISSS Policlínico Zacamil",
  "ISSS Policlínico Roma",
  "ISSS Policlínico Planes de Renderos",
  "ISSS Regional San Miguel",
  "ISSS Regional Santa Ana",
  "ISSS Regional Sonsonate",
  "Hospital Central",
  "Hospital Militar",
  "Hospital privado",
  "Otro",
] as const;

// Deriva la columna-fórmula "REFERENCIA EN SIS (no modificar)".
export function clasificacionSis(hospital: string, referenciaSis: boolean): ClasificacionSisReferido {
  if (hospital === "DoctorSV") return "DR SV";
  if (hospital === "HN San Rafael") return referenciaSis ? "HNSR CON REF SIS" : "HNSR SIN REF SIS";
  return referenciaSis ? "OTROS HOSP CON REF SIS" : "OTROS HOSP SIN REF SIS";
}

// ── Dispositivos de oxígeno al ingreso (referidos) ───────────────────────────

export const DISPOSITIVOS_O2 = [
  "No",
  "Bigotera",
  "Mascarilla",
  "Ventury",
  "Reservorio",
  "CAF",
  "VM",
] as const;

// ── Tiempos de permanencia y razones de demora (referidos) ───────────────────

export const TIEMPOS_PERMANENCIA = [
  "< 1 hora",
  "> 1 hora",
  "> 2 horas",
  "> 6 horas",
  "No aplica",
] as const;

export const RAZONES_DEMORA = [
  "Alta afluencia de pacientes",
  "Disponibilidad de cama",
  "Cama asignada en limpieza / de traslado",
  "Espera de estudios (imagen / laboratorio)",
  "Procedimiento en emergencia",
  "Estabilización del paciente",
  "Múltiples traslados simultáneos",
  "Interconsulta con especialidad",
  "Otra",
] as const;

// En referidos la columna "Servicio de Ingreso" también registra desenlaces
// sin ingreso; se combinan con los servicios canónicos (SERVICIOS_HOSPITALARIOS)
// en un mismo select agrupado.
export const DESENLACES_SIN_INGRESO = [
  "Alta (no ingresa)",
  "Fallece en emergencia",
  "No aplica",
  "Otro",
] as const;

// ── Dependencias (empleado HES, demanda espontánea) ──────────────────────────

export const DEPENDENCIAS_HES = [
  "Enfermería",
  "División Médica",
  "Médico / Residente",
  "Servicios Generales",
  "Limpieza",
  "Seguridad / Vigilancia",
  "Transporte",
  "Mantenimiento",
  "Trabajo Social",
  "ESDOMED",
  "Administración",
  "Jurídico",
  "UDP",
  "Familiar de empleado",
  "Otra",
] as const;

// ── Procedimientos (chips multiselección; lista vacía = "NO") ────────────────

export const PROCEDIMIENTOS = [
  "Exámenes",
  "Rayos X",
  "HGT",
  "GSA",
  "EKG",
  "TAC",
  "USG",
  "RMN",
  "Curación",
  "Sutura de herida",
  "Nebulizaciones",
  "Oxígeno",
  "CVC",
  "Catéter Mahurkar",
  "Sonda nasogástrica",
  "Sonda transuretral",
  "Toma de cultivo",
  "Hemodiálisis",
  "Diálisis",
  "VMI",
  "Férula",
  "Serie abdominal",
  "Doppler",
  "Paracentesis",
  "IC Nefrología",
] as const;

// ── Médicos de emergencia (listas oficiales, julio 2026) ────────────────────
// Dos listas separadas: staff y médicos generales. "¿Quién evalúa?" se elige
// de un solo select con ambos grupos y el tipo se DERIVA por pertenencia
// (tipoEvaluador) — así se separan las atenciones del staff de las de los
// médicos generales sin digitar nada extra.

export const STAFF_EMERGENCIA = [
  "JOSE DAVID GRANILLO VILLALTA",
  "KATHYA LIZZETH RIVERA LOPEZ",
  "MARIA JOSE CASTANEDA HERNANDEZ",
  "SILVIA STEPHANY ALVARADO GONZALEZ",
  "JOSUE ISAAC PARADA RAMIREZ",
  "ELIZABETH PAULINA CHANCHAN MELÉNDEZ",
  "MARIA JOSE CASTANEDA RUANO",
  "MARIA ARGELIA MAYEN RAFAEL",
  "ERNESTO ANTONIO GUILLEN LEIVA",
  "FERNANDO SALVADOR MEJIA MIRA",
  "MAURICIO ALEXANDER JUAREZ ALVARADO",
  "NORA MARISOL CORNEJO RAYMUNDO",
  "CLAUDIA BEATRIZ ERROA MENENDEZ",
  "CAROLINA BEATRIZ ASENCIO",
  "GUILLERMO JOSE DIAZ AREVALO",
  "LUIS ENRIQUE CASTILLO PALACIOS",
  "IRENE EDITH GORDILLO MARTINEZ",
  "EMILIO JOSE SANTILLANA",
  "DENIS ANTONIO MAGAÑA NOYOLA",
  "JOSE ANGEL QUINTEROS FLORES",
  "WILLIAM JOSE SALAS SAYES",
  "DIANA MARIA COLOCHO ABARCA",
  "JEAMILETH JASMIN CASTILLO",
  "MARIANA JUDITH GONZALEZ LINARES",
  "MANUEL EDUARDO RODRIGUEZ CORNEJO",
  "VLADIMIR GOMEZ",
  "CAMILO JAVIER RIVERA RIVAS",
  "ALBA GABRIELA IBAÑEZ",
] as const;

export const MEDICOS_GENERALES_EMERGENCIA = [
  "JENIFFER STEFANIE LINARES CANIZALES",
  "KATY MARIBEL ESCALANTE GARCIA",
  "WILFREDO HERNANDEZ MEJIA",
  "IRIS IVETTE MARQUEZ AVELAR",
  "AMILCAR ADONAY FUENTES ROSALES",
  "ELOIZA BEATRIZ MENDOZA LOPEZ",
  "JUNIOR ALEXANDER VILLATORO RIVAS",
  "JOSELINE IVANNIA ESCOBAR GARCIA",
  "STEPHANY MARGARITA HERNANDEZ MENDOZA",
  "ICELA YASMIN HERNANDEZ REYEZ",
  "SILVIA MARLENE ALONZO DIAZ",
  "MERCEDES YOLANDA LOPEZ SANCHEZ",
  "ADRIANA LETICIA ORELLANA MENENDEZ",
  "JHEMMY CONCEPCIÓN SANTACRUZ JIMENEZ",
  "EDUARDO JOSE HERNANDEZ PAZ",
  "MARIA ELENA MARQUEZ LIZAMA",
  "GUSTAVO ALEJANDRO GOMEZ CORNEJO",
] as const;

// Deriva quién evalúa según a qué lista pertenece el nombre; null para
// nombres fuera de catálogo (registros antiguos digitados como texto libre).
export function tipoEvaluador(nombre: string): TipoEvaluadorEmergencia | null {
  if ((STAFF_EMERGENCIA as readonly string[]).includes(nombre)) return "staff";
  if ((MEDICOS_GENERALES_EMERGENCIA as readonly string[]).includes(nombre)) return "medico_general";
  return null;
}

export const TIPO_EVALUADOR_LABEL: Record<TipoEvaluadorEmergencia, string> = {
  staff: "Staff",
  medico_general: "Médico general",
};
