// Circuito de una cita en la estación de Consulta Externa: qué acción lleva a
// qué estado, el orden de las colas y el texto del destino en la pantalla.
// Puro (sin Firestore) para poder probarlo: scripts/test-consulta-externa.mjs.
//
//   citado ──Llegó──▶ espera ──Llamar──▶ llamado ──Pasó a consulta──▶ atendido
//                       ▲  ▲                │
//                       │  └─Devolver───────┤
//                       │                   │ No respondió
//                       └──Regresó── no_respondio
//
// La enfermera llama al paciente a su estación por expediente y nombre; de
// ahí lo pasa al consultorio de su médico (desde el 2026-11-17 la pantalla ya
// no anuncia el consultorio, decisión del usuario). La preconsulta (signos
// vitales) se coordina de palabra con enfermería y no pasa por el sistema
// (2026-11-13). "Volver a llamar" repite el llamado (y el anuncio) sin cambiar
// de estado. La cola solo sugiere el orden: la enfermera elige a quién llamar.

import { especialidadPorId, estacionPorId, resolverEspecialidad, type EstacionCEId } from "./especialidades";

export type EstadoCitaCE = "citado" | "espera" | "llamado" | "atendido" | "no_respondio";

export type AccionCE =
  | "llego"
  | "quitar_llegada"
  | "llamar"
  | "volver_a_llamar"
  | "paso_a_consulta"
  | "no_respondio"
  | "regreso"
  | "devolver_a_espera";

export const ETIQUETA_ACCION: Record<AccionCE, string> = {
  llego: "Llegó",
  quitar_llegada: "Quitar llegada",
  llamar: "Llamar",
  volver_a_llamar: "Volver a llamar",
  paso_a_consulta: "Pasó a consulta",
  no_respondio: "No respondió",
  regreso: "Regresó",
  devolver_a_espera: "Devolver a la espera",
};

export const ETIQUETA_ESTADO: Record<EstadoCitaCE, string> = {
  citado: "Citado",
  espera: "En espera",
  llamado: "Llamado",
  atendido: "Pasó a consulta",
  no_respondio: "No respondió",
};

/**
 * Estados de la primera versión, que tenía preconsulta (solo los usó la
 * prueba del 13/11/2026). Se leen como su equivalente actual.
 */
const ESTADOS_ANTERIORES: Record<string, EstadoCitaCE> = {
  espera_preconsulta: "espera",
  espera_consultorio: "espera",
  llamado_preconsulta: "llamado",
  llamado_consultorio: "llamado",
};

export function normalizarEstado(estado: string): EstadoCitaCE {
  return ESTADOS_ANTERIORES[estado] ?? (estado as EstadoCitaCE);
}

export interface Transicion {
  estado: EstadoCitaCE;
  /** La acción anuncia un llamado en las pantallas. */
  anuncia?: boolean;
}

/**
 * Estado al que lleva una acción, o null si no aplica en el estado actual
 * (p. ej. alguien ya movió la cita desde otra computadora).
 */
export function aplicarAccion(estadoGuardado: string, accion: AccionCE): Transicion | null {
  const estado = normalizarEstado(estadoGuardado);
  switch (accion) {
    case "llego":
      return estado === "citado" ? { estado: "espera" } : null;
    case "quitar_llegada":
      return estado === "espera" ? { estado: "citado" } : null;
    case "llamar":
      return estado === "espera" ? { estado: "llamado", anuncia: true } : null;
    case "volver_a_llamar":
      return estado === "llamado" ? { estado: "llamado", anuncia: true } : null;
    case "paso_a_consulta":
      return estado === "llamado" ? { estado: "atendido" } : null;
    case "no_respondio":
      return estado === "llamado" ? { estado: "no_respondio" } : null;
    case "regreso":
      return estado === "no_respondio" ? { estado: "espera" } : null;
    case "devolver_a_espera":
      return estado === "llamado" ? { estado: "espera" } : null;
  }
}

/** Acciones que se ofrecen en cada estado; la primera es la principal. */
export function accionesDe(estadoGuardado: string): AccionCE[] {
  switch (normalizarEstado(estadoGuardado)) {
    case "citado":
      return ["llego"];
    case "espera":
      return ["llamar", "quitar_llegada"];
    case "llamado":
      return ["paso_a_consulta", "volver_a_llamar", "no_respondio", "devolver_a_espera"];
    case "no_respondio":
      return ["regreso"];
    case "atendido":
      return [];
  }
}

// ─── Colas ──────────────────────────────────────────────────────────────────

export interface CitaEnCola {
  franjaInicio: string;
  numero: number;
  /** Milisegundos de la llegada; null si aún no llegó. */
  llegadaMs: number | null;
}

/**
 * Orden sugerido: primero la franja de la cita (la agenda manda), dentro de la
 * franja quien llegó antes, y si no hay hora de llegada, el número del código.
 */
export function compararCola(a: CitaEnCola, b: CitaEnCola): number {
  return (
    a.franjaInicio.localeCompare(b.franjaInicio) ||
    (a.llegadaMs ?? Infinity) - (b.llegadaMs ?? Infinity) ||
    a.numero - b.numero
  );
}

// ─── Destino en pantalla ────────────────────────────────────────────────────

/** "Cardiologia - 3" → "Consultorio 3 de Cardiología" (con el nombre del catálogo). */
export function nombreConsultorio(consultorio: string, especialidadId?: string): string {
  const m = String(consultorio ?? "").trim().match(/^(.*?)\s*-\s*(\d+)$/);
  if (!m) return consultorio ? `Consultorio ${consultorio}` : "Consultorio";
  const esp = resolverEspecialidad(m[1]) ?? (especialidadId ? especialidadPorId(especialidadId) : undefined);
  return `Consultorio ${m[2]} de ${esp?.nombre ?? m[1]}`;
}

/**
 * Consultorio que eligió la estación, como se muestra y se lee. Acepta el del
 * SIS ("Cardiologia - 3" → "Consultorio 3 de Cardiología") o lo que escriba la
 * enfermera ("7" → "Consultorio 7", "consultorio 7b" → "Consultorio 7b").
 */
export function destinoConsultorio(consultorio: string): string {
  const t = String(consultorio ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const yaDice = t.match(/^consultorio\s*(.*)$/i);
  if (yaDice) return yaDice[1] ? `Consultorio ${yaDice[1]}` : "Consultorio";
  if (/^(.*?)\s*-\s*(\d+)$/.test(t)) return nombreConsultorio(t);
  return `Consultorio ${t}`;
}

/**
 * A dónde se llama (decisión del usuario, 2026-11-18): a la estación, como
 * siempre, salvo que la estación elija el consultorio. La agenda del SIS dice
 * un consultorio, pero el médico a veces atiende en otro: lo sabe la estación
 * ese día, así que el de la agenda nunca se usa solo.
 */
export function destinoDelLlamado(estacionId: EstacionCEId, consultorio?: string): string {
  return destinoConsultorio(consultorio ?? "") || destinoEstacion(estacionId);
}

/** Una cola por médico (y su consultorio en la agenda). */
export const claveColaMedico = (c: { medico: string; consultorio: string }) => `${c.medico}|${c.consultorio}`;

/** Consultorios de la agenda del día (como los escribe el SIS), sin repetir y en orden. */
export function consultoriosDeCitas(citas: { consultorio: string }[]): string[] {
  const unicos = new Set(citas.map((c) => String(c.consultorio ?? "").trim()).filter(Boolean));
  return [...unicos].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
}

// ─── Documento de llamados (lo que escuchan las pantallas) ──────────────────
//
// Desde el 2026-11-17 se llama por expediente y nombre, a la estación de
// enfermería (decisión del usuario); antes, por código ("HE-12", para no
// mostrar nombres) y al consultorio. Desde el 2026-11-18 la estación puede
// elegir el consultorio (destinoDelLlamado). Los llamados anteriores solo
// traen `codigo` y la pantalla los sigue mostrando así.

export interface LlamadoPantalla {
  /** Identifica cada anuncio; un "Volver a llamar" genera uno nuevo. */
  id: string;
  /**
   * Agrupa los llamados de una misma persona: el id de su cita, o
   * idLlamadoManual() si la enfermera escribió los datos a mano.
   */
  citaId: string;
  /**
   * En orden natural, listo para mostrar y leer (ver nombreParaLlamado). En
   * un mensaje (`mensaje: true`) es el texto que se escribió para la pantalla.
   */
  paciente?: string;
  expediente?: string;
  /** Solo en los llamados anteriores al 2026-11-17. */
  codigo?: string;
  /**
   * "Estación Cardiología", o el consultorio que eligió la estación (ver
   * destinoDelLlamado). En un mensaje puede ir vacío: la pantalla solo muestra el texto.
   */
  destino: string;
  /** La estación que llamó; los mensajes no la llevan (la cuenta es de todas). */
  estacionId?: EstacionCEId;
  /** Milisegundos (Date.now()); en un arreglo no cabe serverTimestamp. */
  enMs: number;
  /** Escrito a mano en la estación: paciente que no está en la agenda del día. */
  manual?: boolean;
  /** Quién lo escribió (solo en los manuales, que no tienen cita con historial). */
  porNombre?: string;
  /** Texto libre de Mensajes a pantalla (ver crearMensajePantalla). */
  mensaje?: boolean;
}

export const MAX_LLAMADOS_PANTALLA = 8;

/**
 * Pone el llamado nuevo arriba. Si la misma cita ya estaba en la lista (un
 * "Volver a llamar"), se quita la entrada anterior para no repetirla.
 */
export function agregarLlamado(
  ultimos: LlamadoPantalla[],
  nuevo: LlamadoPantalla,
  max = MAX_LLAMADOS_PANTALLA,
): LlamadoPantalla[] {
  return [nuevo, ...ultimos.filter((l) => l.citaId !== nuevo.citaId)].slice(0, max);
}

/**
 * ¿Sacaron este llamado de la pantalla a propósito ("Quitar de la pantalla",
 * "Limpiar pantallas", un "Volver a llamar" que lo reemplaza)? Si la lista
 * está llena y él es más viejo que todos, no: lo empujaron los llamados nuevos
 * (tope de `max`) y debe seguir su turno en la pantalla.
 */
export function quitadoDeLaLista(
  llamado: Pick<LlamadoPantalla, "id" | "enMs">,
  ultimos: LlamadoPantalla[],
  max = MAX_LLAMADOS_PANTALLA,
): boolean {
  if (ultimos.some((l) => l.id === llamado.id)) return false;
  if (ultimos.length < max) return true;
  return ultimos.some((l) => l.enMs <= llamado.enMs);
}

/** Quita de la pantalla los llamados de una cita (al devolverla a la espera por error). */
export function quitarLlamadosDeCita(ultimos: LlamadoPantalla[], citaId: string): LlamadoPantalla[] {
  return ultimos.filter((l) => l.citaId !== citaId);
}

// ─── Nombre y expediente para el llamado ────────────────────────────────────

/** Partículas que van en minúscula dentro de un nombre ("José de León"). */
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "e", "vda.", "viuda"]);

const mayusculaInicial = (palabra: string) =>
  palabra.replace(/(^|[-'’])([a-záéíóúüñ])/g, (_, sep: string, letra: string) => sep + letra.toUpperCase());

/** "MARÍA DE LEÓN" → "María de León": cada palabra con mayúscula inicial, salvo las de `enMinuscula`. */
function aNombrePropio(texto: string, enMinuscula: Set<string>): string {
  return texto
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && enMinuscula.has(p) ? p : mayusculaInicial(p)))
    .join(" ");
}

/** Todo en mayúsculas o todo en minúsculas (y con letras). */
const sinCaja = (t: string) => /[a-záéíóúüñ]/i.test(t) && (t === t.toUpperCase() || t === t.toLowerCase());

/** Texto → clave para un id: sin tildes, minúsculas y guiones ("José Ñandú" → "jose-nandu"). */
function claveTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Nombre como se muestra y se lee en la pantalla. El SIS lo escribe
 * "Apellidos, Nombres"; aquí va en orden natural ("María Pilar López
 * Gonzales"). Si viene todo en mayúsculas (o todo en minúsculas) se pasa a
 * nombre propio: se lee mejor de lejos y la voz no deletrea palabras cortas
 * como si fueran siglas.
 */
export function nombreParaLlamado(nombre: string): string {
  let n = String(nombre ?? "").replace(/\s+/g, " ").trim();
  const coma = n.indexOf(",");
  if (coma >= 0) {
    const apellidos = n.slice(0, coma).trim();
    const nombres = n.slice(coma + 1).replace(/,/g, " ").replace(/\s+/g, " ").trim();
    n = [nombres, apellidos].filter(Boolean).join(" ");
  }
  return sinCaja(n) ? aNombrePropio(n, PARTICULAS) : n;
}

/** Expediente escrito a mano, sin espacios: " 11431 - 26 " → "11431-26". */
export function limpiarExpediente(expediente: string): string {
  return String(expediente ?? "").replace(/\s+/g, "").toUpperCase();
}

/**
 * citaId de un llamado manual. Volver a llamar al mismo expediente desde la
 * misma estación reemplaza su entrada en la pantalla en vez de repetirla. El
 * expediente es opcional (pedido del usuario, 2026-11-18): sin él, se
 * identifica por el nombre, para que dos llamados solo por nombre no se pisen.
 */
export function idLlamadoManual(estacionId: EstacionCEId, expediente: string, nombre = ""): string {
  const exp = limpiarExpediente(expediente);
  if (exp) return `manual:${estacionId}:${exp}`;
  return `manual:${estacionId}:nombre:${claveTexto(nombreParaLlamado(nombre))}`;
}

/** Destino de todo llamado: la estación de enfermería que llama ("Estación Cardiología"). */
export function destinoEstacion(estacionId: EstacionCEId): string {
  return `Estación ${estacionPorId(estacionId)?.nombre ?? estacionId}`;
}

/** Lo que la pantalla muestra en grande: el nombre, o el código en los llamados anteriores. */
export function tituloLlamado(l: Pick<LlamadoPantalla, "paciente" | "codigo">): string {
  return l.paciente || l.codigo || "";
}

// ─── Mensajes a pantalla (texto libre) ──────────────────────────────────────
//
// Desde el 2026-11-18 una cuenta general (rol mensajes_ce) escribe lo que debe
// decir la pantalla, sin agenda ni expediente (decisión del usuario):
// Hematología y Oncología comparten espacio, y las de Cardiología también, así
// que cada quien escribe lo que necesita. Si el paciente está en la agenda
// del día (la carga ESDOMED), se busca por expediente o nombre y el mensaje
// lleva su expediente; si no, se escribe el texto libre. Después elige a dónde
// va (obligatorio): la toma de signos vitales, un consultorio o la estación
// (para despacharlo), siempre con su especialidad, o Trabajo Social. Si no
// aplica ninguna, se elige "Texto libre" y la pantalla muestra solo el texto.

/** Largo máximo del mensaje: con más, ya no se lee de lejos en la TV. */
export const MAX_MENSAJE_PANTALLA = 80;

/**
 * "cirugia_torax" → "Estación Cardiología": la estación de enfermería que
 * atiende esa especialidad (para despachar al paciente). "" sin especialidad.
 */
export function destinoEstacionDe(especialidadId: string): string {
  const esp = especialidadPorId(especialidadId);
  return esp ? destinoEstacion(esp.estacion) : "";
}

/** "cardiologia" → "Toma de signos vitales de Cardiología"; "" sin especialidad. */
export function destinoSignosVitales(especialidadId: string): string {
  const esp = especialidadPorId(especialidadId);
  return esp ? `Toma de signos vitales de ${esp.nombre}` : "";
}

/** Palabras que van en minúscula dentro de un mensaje ("Pasar A La Ventanilla" no). */
const MINUSCULAS_MENSAJE = new Set([...PARTICULAS, "a", "al", "en", "con", "por", "para", "o", "u"]);

/**
 * Mayúscula inicial en cada palabra, como se escribe un nombre: en el speaker,
 * el nombre de quien no está en la agenda se escribe a mano y se corrige
 * mientras se escribe (pedido del usuario, 2026-11-20). Las palabras de
 * MINUSCULAS_MENSAJE van en minúscula salvo al inicio ("María de la Cruz",
 * "Pasar a la Ventanilla"); el inicio es la primera palabra con letras, así
 * "11431-26 de León" empieza en "De".
 *
 * Solo cambia mayúsculas y minúsculas, nunca el largo (el cursor queda donde
 * estaba), y no toca el resto de cada palabra: las siglas ("UCI") quedan
 * como se escribieron.
 *
 * `cursor`: dónde está el cursor mientras se escribe. La palabra que termina
 * ahí todavía se está escribiendo y no se pasa a minúscula aunque ya diga
 * "de" (puede ser "Delmy"). Sin cursor, todas las palabras están terminadas.
 */
export function mayusculaEnCadaPalabra(texto: string, cursor = -1): string {
  let alInicio = true;
  return String(texto ?? "").replace(/\S+/g, (palabra: string, inicio: number) => {
    if (!/\p{L}/u.test(palabra)) return palabra;
    const primera = alInicio;
    alInicio = false;
    const resto = palabra.slice(1);
    const min = palabra.toLocaleLowerCase("es");
    const enMinuscula =
      !primera &&
      inicio + palabra.length !== cursor &&
      MINUSCULAS_MENSAJE.has(min.replace(/[,;:]+$/, "")) &&
      resto === resto.toLocaleLowerCase("es"); // "DE" escrito con bloqueo de mayúsculas no se toca
    if (enMinuscula) return min.length === palabra.length ? min : palabra;
    return palabra.replace(/(^[^\p{L}\p{N}]*|[-'’])(\p{Ll})/gu, (todo: string, antes: string, letra: string) => {
      const mayuscula = letra.toLocaleUpperCase("es");
      return mayuscula.length === 1 ? antes + mayuscula : todo;
    });
  });
}

/**
 * El mensaje como se mostrará: espacios simples y mayúscula inicial en cada
 * palabra (`mayusculaEnCadaPalabra`). Si viene todo en mayúsculas, primero se
 * pasa a minúsculas: de lejos se lee mejor y la voz no deletrea las palabras
 * cortas como siglas.
 */
export function textoParaPantalla(texto: string): string {
  const t = String(texto ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_MENSAJE_PANTALLA).trim();
  return mayusculaEnCadaPalabra(sinCaja(t) ? t.toLocaleLowerCase("es") : t);
}

/**
 * Agrupa los envíos del mismo texto: volver a mandarlo (o mandarlo a otro
 * lugar) reemplaza su entrada en la pantalla en vez de repetirla.
 */
export function idMensajePantalla(texto: string): string {
  return `mensaje:${claveTexto(textoParaPantalla(texto))}`;
}

/** "cardiologia" + "3" → "Consultorio 3 de Cardiología"; "" si falta algo. */
export function destinoConsultorioDe(especialidadId: string, numero: string): string {
  const esp = especialidadPorId(especialidadId);
  const n = String(numero ?? "")
    .replace(/^\s*consultorio\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return esp && n ? `Consultorio ${n} de ${esp.nombre}` : "";
}

/** Trabajo Social es un solo lugar para toda Consulta Externa: no lleva especialidad. */
export const DESTINO_TRABAJO_SOCIAL = "Trabajo Social";

/**
 * A dónde va el mensaje (pedido del usuario, 2026-11-18): signos vitales,
 * consultorio, estación o Trabajo Social. Si no aplica ninguna se marca
 * "libre" (solo el texto, sin "Acercarse a"): también hay que elegirlo, para
 * que nadie envíe sin destino por olvido. "" = aún no eligió.
 */
export type IndicacionMensaje = "" | "signos" | "consultorio" | "estacion" | "trabajo_social" | "libre";

export interface EleccionDestino {
  indicacion: IndicacionMensaje;
  /** La especialidad; en "estacion", la estación (sus ids coinciden con los de su especialidad). */
  especialidadId: string;
  /** Solo en "consultorio". */
  numero: string;
}

/** Las que dicen de qué especialidad (o estación) se trata. */
export function pideEspecialidad(indicacion: IndicacionMensaje): boolean {
  return indicacion === "signos" || indicacion === "consultorio" || indicacion === "estacion";
}

/**
 * "Toma de signos vitales de Cardiología", "Consultorio 3 de Cardiología",
 * "Estación Cardiología" o "Trabajo Social"; "" en texto libre o si falta algo.
 */
export function destinoMensaje(e: EleccionDestino): string {
  if (e.indicacion === "signos") return destinoSignosVitales(e.especialidadId);
  if (e.indicacion === "consultorio") return destinoConsultorioDe(e.especialidadId, e.numero);
  if (e.indicacion === "estacion") return destinoEstacionDe(e.especialidadId);
  if (e.indicacion === "trabajo_social") return DESTINO_TRABAJO_SOCIAL;
  return "";
}

export type PasoMensaje = "texto" | "nombre" | "destino" | "especialidad" | "numero";

/**
 * Lo primero que falta para poder enviar, en el orden del flujo; "" si está
 * completo. Todo es obligatorio (pedido del usuario, 2026-11-18): el texto, a
 * dónde va (o "Texto libre", elegido a propósito), la especialidad (o la
 * estación) y, en consultorio, el número.
 *
 * El texto necesita al menos una letra (pedido del usuario, 2026-11-19): solo
 * números es un expediente sin elegir al paciente de la agenda ni escribir su
 * nombre, y la pantalla mostraría "11431-26" sin decir a quién llaman.
 */
export function pasoPendienteMensaje(texto: string, e: EleccionDestino): PasoMensaje | "" {
  const t = textoParaPantalla(texto);
  if (t.length < 2) return "texto";
  if (!/\p{L}/u.test(t)) return "nombre";
  if (!e.indicacion) return "destino";
  if (!pideEspecialidad(e.indicacion)) return "";
  if (!especialidadPorId(e.especialidadId)) return "especialidad";
  if (!destinoMensaje(e)) return "numero";
  return "";
}

/**
 * El mensaje listo para la lista de las pantallas (sin estación). Si se eligió
 * al paciente de la agenda del día, lleva su expediente y se agrupa por él.
 */
export function crearMensajePantalla(
  datos: { texto: string; destino: string; porNombre: string; expediente?: string },
  ahora = Date.now(),
): LlamadoPantalla {
  const expediente = limpiarExpediente(datos.expediente ?? "");
  const citaId = expediente ? `mensaje:exp:${expediente}` : idMensajePantalla(datos.texto);
  return {
    id: `${citaId}#${ahora}`,
    citaId,
    paciente: textoParaPantalla(datos.texto),
    // Sin la clave, no vacía ni undefined: Firestore no acepta undefined dentro de un arreglo.
    ...(expediente ? { expediente } : {}),
    destino: String(datos.destino ?? "").trim(),
    enMs: ahora,
    manual: true,
    mensaje: true,
    porNombre: datos.porNombre,
  };
}
