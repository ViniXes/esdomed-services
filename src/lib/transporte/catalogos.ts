// Catálogos del módulo de Transporte institucional.
//
// Los centros de costos provienen del catálogo PERC del MINSAL usado por el
// Departamento de Transporte (extraídos de su Excel). El área que elige el
// solicitante ES el centro de costos del viaje: así la clasificación PERC
// ocurre al solicitar y la reportería sale sin recaptura. Lista intercambiable
// cuando el jefe entregue su versión definitiva.

// ── Estados del viaje ─────────────────────────────────────────────────────────
export type EstadoViaje = "pendiente" | "asignado" | "en_ruta" | "finalizado" | "rechazado" | "cancelado";

export const ESTADO_VIAJE_LABEL: Record<EstadoViaje, string> = {
  pendiente: "Pendiente",
  asignado: "Asignado",
  en_ruta: "En ruta",
  finalizado: "Finalizado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
};

export const ESTADO_VIAJE_COLOR: Record<EstadoViaje, string> = {
  pendiente: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900",
  asignado: "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900",
  en_ruta: "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-900",
  finalizado: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900",
  rechazado: "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900",
  cancelado: "text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700",
};

// ── Vehículos ─────────────────────────────────────────────────────────────────
export type TipoVehiculo = "pickup" | "pickup_doble_cabina" | "furgon" | "camion" | "microbus" | "equipo";

export const TIPO_VEHICULO_LABEL: Record<TipoVehiculo, string> = {
  pickup: "Pickup",
  pickup_doble_cabina: "Pickup doble cabina",
  furgon: "Furgón",
  camion: "Camión",
  microbus: "Microbús",
  equipo: "Equipo (sin placa)",
};

export const TIPOS_VEHICULO: TipoVehiculo[] = ["pickup", "pickup_doble_cabina", "furgon", "camion", "microbus", "equipo"];

export type NivelCombustible = "E" | "1/4" | "1/2" | "3/4" | "F";
export const NIVELES_COMBUSTIBLE: NivelCombustible[] = ["E", "1/4", "1/2", "3/4", "F"];

// ── Checklist diario (formulario STO1/06-HNES-F) ─────────────────────────────
// Mismos ítems y orden del formato en papel que llenan los motoristas.
export const CHECKLIST_ITEMS: { id: string; label: string }[] = [
  { id: "llanta_repuesto", label: "Llanta de repuesto" },
  { id: "antena", label: "Antena" },
  { id: "tapon_combustible", label: "Tapón de combustible" },
  { id: "vias_delanteras", label: "Vías delanteras" },
  { id: "vias_traseras", label: "Vías traseras" },
  { id: "emblema", label: "Emblema del vehículo" },
  { id: "retrovisores_externos", label: "Retrovisores externos" },
  { id: "retrovisor_interno", label: "Retrovisor interno" },
  { id: "limpia_vidrios", label: "Limpia vidrios" },
  { id: "alfombra", label: "Alfombra" },
  { id: "placas", label: "Placas" },
  { id: "equipo_sonido", label: "Equipo de sonido" },
  { id: "cinturon", label: "Cinturón de seguridad" },
  { id: "cables_bateria", label: "Cables para batería" },
  { id: "manecillas", label: "Manecillas externas" },
  { id: "aire_acondicionado", label: "Funciona A/C" },
  { id: "extintor", label: "Extintor" },
  { id: "mica", label: "Mica" },
  { id: "cono", label: "Cono" },
  { id: "stop_traseros", label: "Stop traseros" },
  { id: "herramientas", label: "Herramientas" },
  { id: "loderas", label: "Loderas" },
  { id: "llantas_buen_estado", label: "Llantas en buen estado" },
  { id: "rines_buen_estado", label: "Rines en buen estado" },
  { id: "copas_buen_estado", label: "Copas en buen estado" },
  { id: "vidrio_frontal", label: "Vidrio frontal en buen estado" },
  { id: "vidrio_lateral", label: "Vidrio lateral en buen estado" },
  { id: "vidrio_trasero", label: "Vidrio trasero en buen estado" },
];

// ── Centros de costos (PERC / MINSAL) ─────────────────────────────────────────
export const CENTROS_COSTOS: string[] = [
  "66-Hospitalización Medicina Interna",
  "95-Hospitalización Cirugía General",
  "166-Unidad de Cuidados Intensivos",
  "179-Unidad de Cuidados Intermedios",
  "201-Emergencias",
  "268-Hemodiálisis",
  "398-Vacunación",
  "518-Laboratorio Clínico",
  "530-Laboratorio de Biología Molecular",
  "538-Resonancia Magnética",
  "541-Tomografía",
  "559-Ultrasonografía",
  "562-Terapia Física",
  "566-Terapia Respiratoria",
  "570-Rehabilitación Pulmonar",
  "575-Banco de Sangre",
  "579-Unidad de Hemodinamia",
  "593-Servicio Farmacéutico",
  "648-Aseo",
  "652-Servicio de Alimentación",
  "659-Lavandería",
  "662-Central de Esterilización",
  "664-Transporte General",
  "665-Mantenimiento",
  "670-Administración",
  "702-Docencia e Investigación",
  "713-Trabajo Social",
  "721-Almacén",
  "743-Clínica Empresarial",
  "745-Hospitalización Servicios por Convenios",
  "750-Alimentación Enteral",
  "760-Nutrición Parenteral",
  "761-Saneamiento Ambiental",
  "766-Servicio de Apoyo a RIISS",
  "767-Unidad de Cuidados Especiales",
  "776-Estudios Gastroclínicos",
  "791-Estudio de Radiología",
  "803-Rehabilitación Psicosocial",
  "806-Centro Quirúrgico",
];

// ── Folio ─────────────────────────────────────────────────────────────────────
// Código no adivinable que funciona como "llave de consulta" de la solicitud
// (quien lo conoce puede ver SU solicitud sin cuenta). Alfabeto sin caracteres
// confundibles (sin 0/O, 1/I/L).
const ALFABETO_FOLIO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generarFolio(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let cuerpo = "";
  for (const b of bytes) cuerpo += ALFABETO_FOLIO[b % ALFABETO_FOLIO.length];
  return `TR-${cuerpo.slice(0, 5)}-${cuerpo.slice(5)}`;
}
