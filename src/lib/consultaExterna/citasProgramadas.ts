// Programación de citas 2027 de Consulta Externa (lógica pura).
//
// ESDOMED va registrando aquí las citas del próximo año mientras el SIS no abre
// las agendas; cuando se abran, se pasan al SIS desde esta lista y se marcan
// como "registrada en SIS". El catálogo (médicos, consultorios y franjas
// semanales con su cupo) sale del libro "agendas redistribuidas" y se edita en
// la pestaña de catálogo cuando cambia un consultorio o un horario.
//
// Sin imports a propósito: lo prueba scripts/test-citas-programadas.mjs.

export const ANIO_PROGRAMACION = 2027;

export const DIAS_SEMANA = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];

export const NOMBRE_DIA: Record<DiaSemana, string> = {
  domingo: "Domingo",
  lunes: "Lunes",
  martes: "Martes",
  miercoles: "Miércoles",
  jueves: "Jueves",
  viernes: "Viernes",
  sabado: "Sábado",
};

export interface MedicoCatalogo {
  /** Slug del nombre; no cambia aunque se corrija el nombre. */
  id: string;
  nombre: string;
  especialidad: string;
  consultorioFijo: string;
  activo: boolean;
}

export interface ConsultorioCatalogo {
  nombre: string;
  especialidad: string;
  activo: boolean;
}

/** Una hora de atención semanal de un médico. */
export interface FranjaCatalogo {
  id: string;
  medicoId: string;
  dia: DiaSemana;
  /** "HH:MM" en 24 h. */
  inicio: string;
  fin: string;
  cupo: number;
  consultorio: string;
}

export interface CatalogoCitas {
  medicos: MedicoCatalogo[];
  consultorios: ConsultorioCatalogo[];
  franjas: FranjaCatalogo[];
  fuente?: string;
}

export type TipoCitaProgramada = "Primera Vez" | "Subsecuente";
export type EstadoCitaProgramada = "pendiente" | "registrada_sis" | "anulada";

export const NOMBRE_ESTADO: Record<EstadoCitaProgramada, string> = {
  pendiente: "Pendiente de pasar al SIS",
  registrada_sis: "Registrada en SIS",
  anulada: "Anulada",
};

/** Lo que se escribe en el formulario; el resto lo pone la capa de datos. */
export interface DatosCitaProgramada {
  fecha: string;
  especialidad: string;
  medicoId: string;
  medico: string;
  consultorio: string;
  franjaInicio: string;
  franjaFin: string;
  expediente: string;
  paciente: string;
  tipo: TipoCitaProgramada;
  observaciones: string;
}

// ── Fechas y horas ──────────────────────────────────────────────────────────

/** "2027-03-15" → "lunes". Mediodía local para no cruzar de día por la zona horaria. */
export function diaSemanaDeISO(iso: string): DiaSemana {
  return DIAS_SEMANA[new Date(`${iso}T12:00:00`).getDay()];
}

export function esFechaDelAnio(iso: string, anio = ANIO_PROGRAMACION): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00`);
  return !isNaN(d.getTime()) && d.getFullYear() === anio && d.toISOString().slice(0, 10) === iso;
}

/** "13:00" → "01:00 PM", como lo escribe el SIS. */
export function hora12(h24: string): string {
  const [h, m] = h24.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ap}`;
}

export function textoFranja(inicio: string, fin: string): string {
  if (!inicio || !fin) return "Sin horario";
  return `${hora12(inicio)} - ${hora12(fin)}`;
}

export function esHora(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

// ── Textos ──────────────────────────────────────────────────────────────────

/** Sin tildes, minúsculas y espacios simples. */
export function clave(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function slugMedico(nombre: string): string {
  return clave(nombre).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function limpiarTexto(s: string): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

/** "  12345 - 26 " → "12345-26". El nombre del paciente se guarda como se escribe. */
export function normalizarExpediente(s: string): string {
  return String(s ?? "").replace(/\s+/g, "").replace(/[‐-―]/g, "-").toUpperCase();
}

/** Forma usual del SIS: número, guion y dos dígitos del año ("7886-21"). Solo avisa. */
export function expedienteConFormaUsual(exp: string): boolean {
  return /^\d{1,6}-\d{2}$/.test(exp);
}

export function idFranja(medicoId: string, dia: DiaSemana, inicio: string): string {
  return `${medicoId}_${dia}_${inicio.replace(":", "")}`;
}

// ── Catálogo ────────────────────────────────────────────────────────────────

export function especialidadesDelCatalogo(cat: CatalogoCitas): string[] {
  const set = new Set<string>();
  for (const m of cat.medicos) if (m.activo) set.add(m.especialidad);
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}

export function medicosDeEspecialidad(cat: CatalogoCitas, especialidad: string, incluirInactivos = false): MedicoCatalogo[] {
  return cat.medicos
    .filter((m) => m.especialidad === especialidad && (incluirInactivos || m.activo))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function consultoriosDeEspecialidad(cat: CatalogoCitas, especialidad: string): ConsultorioCatalogo[] {
  return cat.consultorios
    .filter((c) => c.especialidad === especialidad && c.activo)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
}

function ordenFranja(a: FranjaCatalogo, b: FranjaCatalogo): number {
  const da = DIAS_SEMANA.indexOf(a.dia === "domingo" ? "sabado" : a.dia) + (a.dia === "domingo" ? 1 : 0);
  const db = DIAS_SEMANA.indexOf(b.dia === "domingo" ? "sabado" : b.dia) + (b.dia === "domingo" ? 1 : 0);
  return da - db || a.inicio.localeCompare(b.inicio);
}

/** Franjas del médico, de lunes a domingo y por hora. */
export function franjasDelMedico(cat: CatalogoCitas, medicoId: string): FranjaCatalogo[] {
  return cat.franjas.filter((f) => f.medicoId === medicoId).sort(ordenFranja);
}

/** Franjas que el médico atiende el día de la semana de esa fecha. */
export function franjasDelDia(cat: CatalogoCitas, medicoId: string, fechaISO: string): FranjaCatalogo[] {
  const dia = diaSemanaDeISO(fechaISO);
  return franjasDelMedico(cat, medicoId).filter((f) => f.dia === dia);
}

/** Días de la semana que atiende el médico ("Lunes, Martes…"), para orientar la fecha. */
export function diasQueAtiende(cat: CatalogoCitas, medicoId: string): DiaSemana[] {
  const dias = new Set(franjasDelMedico(cat, medicoId).map((f) => f.dia));
  return DIAS_SEMANA.filter((d) => dias.has(d)).sort(
    (a, b) => ((DIAS_SEMANA.indexOf(a) + 6) % 7) - ((DIAS_SEMANA.indexOf(b) + 6) % 7),
  );
}

/** Problemas del catálogo que impiden guardarlo. */
export function validarCatalogo(cat: CatalogoCitas): string[] {
  const errores: string[] = [];
  const ids = new Set<string>();
  for (const m of cat.medicos) {
    if (!limpiarTexto(m.nombre)) errores.push("Hay un médico sin nombre.");
    if (!m.especialidad) errores.push(`${m.nombre}: falta la especialidad.`);
    if (ids.has(m.id)) errores.push(`${m.nombre}: está repetido.`);
    ids.add(m.id);
  }
  const consultorios = new Set<string>();
  for (const c of cat.consultorios) {
    const k = clave(c.nombre);
    if (!k) errores.push("Hay un consultorio sin nombre.");
    if (consultorios.has(k)) errores.push(`El consultorio ${c.nombre} está repetido.`);
    consultorios.add(k);
  }
  const franjas = new Set<string>();
  for (const f of cat.franjas) {
    const medico = cat.medicos.find((m) => m.id === f.medicoId);
    const quien = medico?.nombre ?? f.medicoId;
    if (!medico) errores.push(`Una franja es de un médico que ya no está en el catálogo (${f.medicoId}).`);
    if (!esHora(f.inicio) || !esHora(f.fin) || f.fin <= f.inicio) {
      errores.push(`${quien}, ${NOMBRE_DIA[f.dia]}: el horario ${f.inicio} - ${f.fin} no es válido.`);
    }
    if (!Number.isInteger(f.cupo) || f.cupo < 1) errores.push(`${quien}, ${NOMBRE_DIA[f.dia]} ${f.inicio}: el cupo debe ser 1 o más.`);
    const k = `${f.medicoId}|${f.dia}|${f.inicio}`;
    if (franjas.has(k)) errores.push(`${quien}, ${NOMBRE_DIA[f.dia]} ${f.inicio}: la franja está repetida.`);
    franjas.add(k);
  }
  return [...new Set(errores)];
}

/** Médicos distintos con franjas que se cruzan en el mismo consultorio y día. Solo avisa. */
export function choquesDeConsultorio(cat: CatalogoCitas): string[] {
  const avisos: string[] = [];
  const nombre = (id: string) => cat.medicos.find((m) => m.id === id)?.nombre ?? id;
  const activas = cat.franjas.filter((f) => f.consultorio && cat.medicos.find((m) => m.id === f.medicoId)?.activo);
  for (let i = 0; i < activas.length; i++) {
    for (let j = i + 1; j < activas.length; j++) {
      const a = activas[i];
      const b = activas[j];
      if (a.medicoId === b.medicoId || a.dia !== b.dia || clave(a.consultorio) !== clave(b.consultorio)) continue;
      if (a.inicio < b.fin && b.inicio < a.fin) {
        avisos.push(`${a.consultorio}, ${NOMBRE_DIA[a.dia]}: ${nombre(a.medicoId)} (${a.inicio}) y ${nombre(b.medicoId)} (${b.inicio}).`);
      }
    }
  }
  return avisos;
}

// ── Citas ───────────────────────────────────────────────────────────────────

export interface CitaContable {
  franjaInicio: string;
  estado: EstadoCitaProgramada;
}

/** Citas que ocupan cupo (todas menos las anuladas), por hora de inicio de la franja. */
export function ocupacionPorFranja(citas: CitaContable[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of citas) {
    if (c.estado === "anulada") continue;
    m.set(c.franjaInicio, (m.get(c.franjaInicio) ?? 0) + 1);
  }
  return m;
}

/** Errores que impiden guardar la cita. */
export function validarCita(d: DatosCitaProgramada): string[] {
  const e: string[] = [];
  if (!esFechaDelAnio(d.fecha)) e.push(`La fecha debe ser de ${ANIO_PROGRAMACION}.`);
  if (!d.especialidad) e.push("Elija la especialidad.");
  if (!d.medicoId || !d.medico) e.push("Elija el médico.");
  // El horario es opcional: las agendas de 2027 todavía no tienen horas.
  if (d.franjaInicio || d.franjaFin) {
    if (!esHora(d.franjaInicio) || !esHora(d.franjaFin)) e.push("El horario no es válido.");
  }
  if (!d.expediente) e.push("Escriba el expediente.");
  if (!limpiarTexto(d.paciente)) e.push("Escriba el nombre del paciente.");
  if (d.tipo !== "Primera Vez" && d.tipo !== "Subsecuente") e.push("Elija si es primera vez o subsecuente.");
  return e;
}

export interface CitaOrdenable {
  fecha: string;
  especialidad: string;
  medico: string;
  franjaInicio: string;
  paciente: string;
}

/** Orden para la lista y el Excel: como se pasarán al SIS, agenda por agenda. */
export function compararCitas(a: CitaOrdenable, b: CitaOrdenable): number {
  return (
    a.fecha.localeCompare(b.fecha) ||
    a.especialidad.localeCompare(b.especialidad, "es") ||
    a.medico.localeCompare(b.medico, "es") ||
    a.franjaInicio.localeCompare(b.franjaInicio) ||
    a.paciente.localeCompare(b.paciente, "es")
  );
}

/** Primer y último día del mes ("2027-02" → ["2027-02-01", "2027-02-28"]). */
export function rangoDelMes(mes: string): [string, string] {
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return [`${mes}-01`, `${mes}-${String(ultimo).padStart(2, "0")}`];
}

// ── Descargas ───────────────────────────────────────────────────────────────

/** Orden de las pestañas del Excel y de las hojas del PDF. Las que no estén aquí van al final. */
export const ORDEN_ESPECIALIDADES = [
  "Hematología",
  "Oncología",
  "Cardiología",
  "Infectología",
  "Cirugía Cardiovascular",
  "Cirugía de Tórax",
];

/** Agrupa por especialidad respetando el orden en que vienen las citas dentro de cada grupo. */
export function agruparPorEspecialidad<T extends { especialidad: string }>(citas: T[]): { especialidad: string; citas: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const c of citas) {
    const lista = grupos.get(c.especialidad) ?? [];
    lista.push(c);
    grupos.set(c.especialidad, lista);
  }
  const pos = (e: string) => {
    const i = ORDEN_ESPECIALIDADES.findIndex((x) => clave(x) === clave(e));
    return i === -1 ? ORDEN_ESPECIALIDADES.length : i;
  };
  return [...grupos.entries()]
    .sort(([a], [b]) => pos(a) - pos(b) || a.localeCompare(b, "es"))
    .map(([especialidad, lista]) => ({ especialidad, citas: lista }));
}

/** Nombre válido de pestaña de Excel: sin : \ / ? * [ ] y máximo 31 caracteres. */
export function nombrePestana(s: string): string {
  return s.replace(/[:\\/?*[\]]/g, " ").slice(0, 31).trim() || "Citas";
}

// ── Listas con búsqueda ─────────────────────────────────────────────────────

/**
 * Opciones que calzan con lo escrito, la más parecida primero: todas las
 * palabras escritas deben aparecer (sin tildes ni mayúsculas); primero las que
 * empiezan por lo escrito, luego las que tienen una palabra que empieza así, y
 * al final las que solo lo contienen. Sin texto, devuelve todas en su orden.
 */
export function filtrarOpciones<T extends { etiqueta: string }>(opciones: T[], consulta: string): T[] {
  const q = clave(consulta);
  if (!q) return opciones;
  const palabras = q.split(" ");
  const puntaje = (etiqueta: string): number => {
    const k = clave(etiqueta);
    if (!palabras.every((p) => k.includes(p))) return -1;
    if (k.startsWith(q)) return 0;
    const inicios = k.split(" ");
    if (palabras.every((p) => inicios.some((w) => w.startsWith(p)))) return 1;
    return 2;
  };
  return opciones
    .map((o, i) => ({ o, i, p: puntaje(o.etiqueta) }))
    .filter((x) => x.p >= 0)
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.o);
}
