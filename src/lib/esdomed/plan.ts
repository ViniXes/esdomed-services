import type { FilaPlanTrabajo, PlanTrabajo, UserProfile } from "@/types";
import { esMarcaEspecial, getHorario } from "@/lib/esdomed/horarios";
import {
  codigoAdministrativoHabitual,
  esAdministrativoPlan,
  normalizarCodigoMarcacion,
  normalizarMetadatosFilaPlan,
} from "@/lib/esdomed/catalogo-plan";
import {
  esDiaNoLaboralAdministrativo,
  primerDiaLaboralAdministrativo,
} from "@/lib/esdomed/calendario-plan";

// Helpers de calendario y armado de planes de trabajo ESDOMED.

// ── Grupos de trabajo ────────────────────────────────────────────────────────
// Cada empleado se asigna a un grupo dentro del mes (puede variar mes a mes).
export const GRUPOS_ESDOMED = [
  "Administrativo",
  "Grupo 1",
  "Grupo 2",
  "Grupo 3",
  "Grupo 4",
  "Equipo de emergencia",
] as const;

export type GrupoEsdomed = (typeof GRUPOS_ESDOMED)[number];

// Estilos por grupo para badges/encabezados (colores distintos para identificar).
export const COLOR_GRUPO: Record<string, { badge: string; dot: string; barra: string; corto: string }> = {
  "Administrativo": {
    badge: "bg-[#1c1e4d]/10 text-[#1c1e4d] dark:bg-[var(--color-institutional-navy)] dark:text-[#c9a892]",
    dot: "bg-[#1c1e4d] dark:bg-[#c9a892]",
    barra: "bg-[#1c1e4d]/10 text-[#1c1e4d] dark:bg-[var(--color-institutional-navy)] dark:text-[#c9a892]",
    corto: "Adm",
  },
  "Grupo 1": {
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    dot: "bg-blue-500",
    barra: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    corto: "G1",
  },
  "Grupo 2": {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    dot: "bg-amber-500",
    barra: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    corto: "G2",
  },
  "Grupo 3": {
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    dot: "bg-emerald-500",
    barra: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    corto: "G3",
  },
  "Grupo 4": {
    badge: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
    dot: "bg-teal-500",
    barra: "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
    corto: "G4",
  },
  "Equipo de emergencia": {
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    dot: "bg-rose-500",
    barra: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    corto: "Emerg.",
  },
};

/** Orden de un grupo para ordenar filas (los sin grupo van al final). */
export function ordenGrupo(grupo: string | undefined | null): number {
  const i = GRUPOS_ESDOMED.indexOf((grupo ?? "") as GrupoEsdomed);
  return i === -1 ? 99 : i;
}

/**
 * Criterio único para ordenar las filas del plan: primero por grupo, luego por
 * el orden MANUAL (`orden`) si está definido, y como respaldo el jefe de primero
 * y el resto alfabético. Lo usan el editor, la impresión y la exportación a Excel.
 */
export function compararFilasPlan(a: FilaPlanTrabajo, b: FilaPlanTrabajo): number {
  const grupoDiff = ordenGrupo(a.grupo) - ordenGrupo(b.grupo);
  if (grupoDiff !== 0) return grupoDiff;

  const oa = a.orden;
  const ob = b.orden;
  if (typeof oa === "number" && typeof ob === "number") {
    if (oa !== ob) return oa - ob;
  } else if (typeof oa === "number") {
    return -1; // las filas con orden manual van antes que las que no lo tienen
  } else if (typeof ob === "number") {
    return 1;
  }

  const isJefeA = a.nombre.toLowerCase().includes("benjamin") && a.nombre.toLowerCase().includes("cardoza");
  const isJefeB = b.nombre.toLowerCase().includes("benjamin") && b.nombre.toLowerCase().includes("cardoza");
  if (isJefeA && !isJefeB) return -1;
  if (!isJefeA && isJefeB) return 1;

  return a.nombre.localeCompare(b.nombre);
}

export const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Iniciales de día como en el formato oficial: D L M Mi J V S
const INICIALES_DIA = ["D", "L", "M", "Mi", "J", "V", "S"];

/** "YYYY-MM" → { anio, mes }. */
export function parsePeriodo(periodo: string): { anio: number; mes: number } {
  const [a, m] = periodo.split("-").map(Number);
  return { anio: a, mes: m };
}

/** { anio, mes(1-12) } → "YYYY-MM". */
export function formatPeriodo(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

/** Etiqueta legible, ej. "Junio 2026". */
export function labelPeriodo(periodo: string): string {
  const { anio, mes } = parsePeriodo(periodo);
  return `${NOMBRES_MES[mes - 1]} ${anio}`;
}

/** Cantidad de días del mes (mes 1-12). */
export function diasDelMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate();
}

/** Lista de números de día [1..n] del mes. */
export function diasDelMesArray(anio: number, mes: number): number[] {
  return Array.from({ length: diasDelMes(anio, mes) }, (_, i) => i + 1);
}

/** Inicial del día de la semana para cada día del mes (alineado a diasDelMesArray). */
export function inicialesDeMes(anio: number, mes: number): string[] {
  return diasDelMesArray(anio, mes).map((dia) => {
    const dow = new Date(anio, mes - 1, dia).getDay(); // 0=Domingo
    return INICIALES_DIA[dow];
  });
}

/** True si el día (1-based) cae en sábado o domingo. */
export function esFinDeSemana(anio: number, mes: number, dia: number): boolean {
  const dow = new Date(anio, mes - 1, dia).getDay();
  return dow === 0 || dow === 6;
}

export const PERIODO_ACTUAL = (() => {
  const hoy = new Date();
  return formatPeriodo(hoy.getFullYear(), hoy.getMonth() + 1);
})();

/** Genera los últimos N y próximos M periodos alrededor del actual (para selectores). */
export function periodosCercanos(atras = 12, adelante = 2): string[] {
  const hoy = new Date();
  const out: string[] = [];
  for (let i = atras; i >= -adelante; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    out.push(formatPeriodo(d.getFullYear(), d.getMonth() + 1));
  }
  return out;
}

/**
 * Roster: usuarios que deben aparecer en el plan. Es el personal ESDOMED y,
 * además, un admin (superusuario) que también sea personal de ESDOMED — en cuyo
 * caso se identifica porque tiene código de marcación.
 */
export function esPersonalPlan(role: string, codigoMarcacion?: string): boolean {
  if (role === "esdomed" || role === "asistente_esdomed") return true;
  if (role === "admin") return Boolean(codigoMarcacion?.trim());
  return false;
}

/**
 * Construye una fila en blanco para un usuario, con `n` días sin asignar.
 * Si ya existía una fila previa (otro mes), se reutilizan nombre/puesto.
 */
export function filaDesdeUsuario(u: Pick<UserProfile, "uid" | "nombre" | "codigoMarcacion" | "puesto">, dias: number): FilaPlanTrabajo {
  return normalizarMetadatosFilaPlan({
    uid: u.uid,
    codigoMarcacion: u.codigoMarcacion?.trim() || "",
    nombre: u.nombre,
    puesto: u.puesto?.trim() || "",
    asignaciones: Array(dias).fill(""),
    observaciones: "",
  });
}

/**
 * Mezcla el roster actual de usuarios con un plan existente: conserva las
 * asignaciones ya guardadas y agrega filas nuevas para usuarios sin fila.
 * Empareja por uid, y como respaldo por código de marcación.
 */
export function sincronizarFilas(
  usuarios: Pick<UserProfile, "uid" | "nombre" | "codigoMarcacion" | "puesto">[],
  filasPrevias: FilaPlanTrabajo[],
  dias: number,
): FilaPlanTrabajo[] {
  const porUid = new Map(filasPrevias.filter((f) => f.uid).map((f) => [f.uid, f]));
  const porCodigo = new Map(
    filasPrevias
      .filter((f) => f.codigoMarcacion)
      .map((f) => [normalizarCodigoMarcacion(f.codigoMarcacion), f]),
  );

  return usuarios.map((u) => {
    const previa =
      (u.uid && porUid.get(u.uid)) ||
      (u.codigoMarcacion && porCodigo.get(normalizarCodigoMarcacion(u.codigoMarcacion))) ||
      null;
    if (previa) {
      // Ajusta el largo de asignaciones al mes (por si cambió de febrero a marzo).
      const asignaciones = Array(dias)
        .fill("")
        .map((_, i) => previa.asignaciones[i] ?? "");
      return normalizarMetadatosFilaPlan({
        ...previa,
        uid: u.uid,
        nombre: u.nombre,
        puesto: u.puesto?.trim() || previa.puesto || "",
        codigoMarcacion: u.codigoMarcacion?.trim() || previa.codigoMarcacion || "",
        asignaciones,
      });
    }
    return filaDesdeUsuario(u, dias);
  });
}

type UsuarioRosterPlan = Pick<UserProfile, "uid" | "nombre" | "codigoMarcacion" | "puesto">;

function filaCoincidente(
  filas: FilaPlanTrabajo[],
  referencia: Pick<FilaPlanTrabajo, "uid" | "codigoMarcacion">,
): FilaPlanTrabajo | undefined {
  return (
    filas.find((f) => referencia.uid && f.uid === referencia.uid) ||
    filas.find(
      (f) =>
        normalizarCodigoMarcacion(f.codigoMarcacion) !== "" &&
        normalizarCodigoMarcacion(f.codigoMarcacion) === normalizarCodigoMarcacion(referencia.codigoMarcacion),
    )
  );
}

/** Rellena un mes administrativo y deja vacíos fines de semana y asuetos. */
export function asignacionesAdministrativasDelMes(
  codigo: string,
  anio: number,
  mes: number,
  dias = diasDelMes(anio, mes),
): string[] {
  const valor = codigo.trim().toUpperCase();
  return Array.from({ length: dias }, (_, indice) =>
    esDiaNoLaboralAdministrativo(anio, mes, indice + 1) ? "" : valor,
  );
}

/**
 * Construye un mes nuevo conservando metadatos del mes anterior. Los operativos
 * empiezan sin turnos; los administrativos reutilizan su código habitual solo
 * en días laborables.
 */
export function prepararFilasNuevoPeriodo(
  usuarios: UsuarioRosterPlan[],
  planAnterior: PlanTrabajo | null,
  anio: number,
  mes: number,
): FilaPlanTrabajo[] {
  const dias = diasDelMes(anio, mes);
  const anteriores = planAnterior?.filas ?? [];
  return sincronizarFilas(usuarios, anteriores, dias).map((fila) => {
    const origen = filaCoincidente(anteriores, fila);
    const normalizada = normalizarMetadatosFilaPlan(fila);
    if (!esAdministrativoPlan(normalizada)) {
      return { ...normalizada, asignaciones: Array(dias).fill("") };
    }
    const codigo = codigoAdministrativoHabitual(origen?.asignaciones ?? []);
    return {
      ...normalizada,
      asignaciones: codigo ? asignacionesAdministrativasDelMes(codigo, anio, mes, dias) : Array(dias).fill(""),
    };
  });
}

/**
 * Copia explícitamente un mes anterior. Además de los turnos conserva grupo,
 * orden y observaciones; para administrativos reconstruye el calendario laboral.
 */
export function copiarFilasMesAnterior(
  filasActuales: FilaPlanTrabajo[],
  planAnterior: PlanTrabajo,
  anio: number,
  mes: number,
): FilaPlanTrabajo[] {
  const dias = diasDelMes(anio, mes);
  return filasActuales.map((fila) => {
    const origen = filaCoincidente(planAnterior.filas ?? [], fila);
    if (!origen) return normalizarMetadatosFilaPlan(fila);
    const combinada = normalizarMetadatosFilaPlan({
      ...fila,
      grupo: origen.grupo ?? fila.grupo,
      tipoJornada: origen.tipoJornada ?? fila.tipoJornada,
      observaciones: origen.observaciones ?? fila.observaciones,
      ...(typeof origen.orden === "number" ? { orden: origen.orden } : {}),
    });
    if (esAdministrativoPlan(combinada)) {
      const codigo = codigoAdministrativoHabitual(origen.asignaciones);
      return {
        ...combinada,
        asignaciones: codigo ? asignacionesAdministrativasDelMes(codigo, anio, mes, dias) : Array(dias).fill(""),
      };
    }
    return {
      ...combinada,
      asignaciones: Array.from({ length: dias }, (_, indice) => origen.asignaciones[indice] ?? ""),
    };
  });
}

function minutosHora(etiqueta: string): number | null {
  const valor = etiqueta.trim().toLowerCase();
  const match = valor.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!match) return null;
  let hora = Number(match[1]) % 12;
  if (match[3].toLowerCase() === "pm") hora += 12;
  return hora * 60 + Number(match[2]);
}

function turnoAmaneceAlDiaSiguiente(codigo: string): boolean {
  const horario = getHorario(codigo);
  if (!horario || horario.horas < 12) return false;
  const entrada = minutosHora(horario.entrada);
  const salida = minutosHora(horario.salida);
  return entrada !== null && salida !== null && salida <= entrada;
}

export function bloqueoInicioMes(
  fila: FilaPlanTrabajo,
  planAnterior: PlanTrabajo | null,
): { codigo: string; diaAnterior: number } | null {
  if (!planAnterior || esAdministrativoPlan(fila)) return null;
  const origen = filaCoincidente(planAnterior.filas ?? [], fila);
  if (!origen) return null;
  const diaAnterior = origen.asignaciones.length;
  const codigo = (origen.asignaciones[diaAnterior - 1] ?? "").trim().toUpperCase();
  return turnoAmaneceAlDiaSiguiente(codigo) ? { codigo, diaAnterior } : null;
}

export function validarAsignacionPlan(
  fila: FilaPlanTrabajo,
  dia: number,
  codigo: string,
  anio: number,
  mes: number,
  planAnterior: PlanTrabajo | null,
): string | null {
  const valor = codigo.trim().toUpperCase();
  if (!valor) return null;
  if (esAdministrativoPlan(fila) && esDiaNoLaboralAdministrativo(anio, mes, dia)) {
    return `${fila.nombre} es personal administrativo y el día ${dia} no es laborable.`;
  }
  if (!esAdministrativoPlan(fila) && dia === 1 && getHorario(valor)) {
    const bloqueo = bloqueoInicioMes(fila, planAnterior);
    if (bloqueo) {
      return `${fila.nombre} tuvo ${bloqueo.codigo} el último día del mes anterior y ese turno amanece el día 1.`;
    }
  }
  return null;
}

/** Guía de ciclo cada cuatro días, incluyendo la continuidad del mes anterior. */
export function casillasSugeridasPlan(
  fila: FilaPlanTrabajo,
  planAnterior: PlanTrabajo | null,
): boolean[] {
  const n = fila.asignaciones.length;
  const salida = new Array(n).fill(false);
  let ultimoTurno = -1;
  for (let indice = 0; indice < n; indice++) {
    if (getHorario(fila.asignaciones[indice])) ultimoTurno = indice;
  }

  if (ultimoTurno >= 0) {
    for (let indice = ultimoTurno + 4; indice < n; indice += 4) {
      if (!(fila.asignaciones[indice] ?? "").trim()) salida[indice] = true;
    }
    return salida;
  }

  if (!planAnterior) return salida;
  const origen = filaCoincidente(planAnterior.filas ?? [], fila);
  if (!origen) return salida;
  let ultimoDiaAnterior = 0;
  for (let indice = origen.asignaciones.length - 1; indice >= 0; indice--) {
    if (getHorario(origen.asignaciones[indice])) {
      ultimoDiaAnterior = indice + 1;
      break;
    }
  }
  if (!ultimoDiaAnterior) return salida;
  let primerDia = ultimoDiaAnterior + 4 - origen.asignaciones.length;
  while (primerDia <= 0) primerDia += 4;
  for (let dia = primerDia; dia <= n; dia += 4) {
    if (!(fila.asignaciones[dia - 1] ?? "").trim()) salida[dia - 1] = true;
  }
  return salida;
}

export function autocompletarAdministrativoSiCorresponde(
  fila: FilaPlanTrabajo,
  dia: number,
  codigo: string,
  anio: number,
  mes: number,
): FilaPlanTrabajo | null {
  if (!esAdministrativoPlan(fila)) return null;
  const horario = getHorario(codigo);
  if (!horario || (horario.tipo !== "Administrativo" && horario.tipo !== "Medico Administrativo")) return null;
  const primerDia = primerDiaLaboralAdministrativo(anio, mes, fila.asignaciones.length);
  if (primerDia !== dia) return null;
  return {
    ...normalizarMetadatosFilaPlan(fila),
    asignaciones: asignacionesAdministrativasDelMes(codigo, anio, mes, fila.asignaciones.length),
  };
}

export interface ValidacionReglasPlan {
  errores: string[];
  advertencias: string[];
}

/** Validaciones puras que también cubren datos introducidos por copia o arrastre. */
export function validarReglasFilasPlan(
  filas: FilaPlanTrabajo[],
  anio: number,
  mes: number,
  planAnterior: PlanTrabajo | null,
): ValidacionReglasPlan {
  const errores: string[] = [];
  const advertencias: string[] = [];
  filas.forEach((fila) => {
    fila.asignaciones.forEach((codigoRaw, indice) => {
      const codigo = codigoRaw.trim().toUpperCase();
      if (!codigo) return;
      const dia = indice + 1;
      if (!getHorario(codigo) && !esMarcaEspecial(codigo)) {
        errores.push(`${fila.nombre}, día ${dia}: código desconocido (${codigo}).`);
      }
      const restriccion = validarAsignacionPlan(fila, dia, codigo, anio, mes, planAnterior);
      if (restriccion) errores.push(restriccion);
    });

    if (esAdministrativoPlan(fila)) return;
    const origen = planAnterior ? filaCoincidente(planAnterior.filas ?? [], fila) : undefined;
    if (!origen) return;
    let ultimoDiaAnterior = 0;
    for (let indice = origen.asignaciones.length - 1; indice >= 0; indice--) {
      const horario = getHorario(origen.asignaciones[indice]);
      if (horario?.horas === 24) {
        ultimoDiaAnterior = indice + 1;
        break;
      }
    }
    if (!ultimoDiaAnterior) return;
    const primerTurnoActual = fila.asignaciones.findIndex((codigo) => getHorario(codigo)?.horas === 24) + 1;
    if (!primerTurnoActual) return;
    let sugerido = ultimoDiaAnterior + 4 - origen.asignaciones.length;
    while (sugerido <= 0) sugerido += 4;
    if (primerTurnoActual !== sugerido) {
      advertencias.push(
        `${fila.nombre}: el primer turno de 24 horas está en el día ${primerTurnoActual}; la continuidad sugerida es el día ${sugerido}.`,
      );
    }
  });
  return { errores: [...new Set(errores)], advertencias: [...new Set(advertencias)] };
}

/** Encuentra la fila de un usuario dentro de un plan (por uid o código). */
export function filaDeUsuario(plan: PlanTrabajo, u: Pick<UserProfile, "uid" | "codigoMarcacion">): FilaPlanTrabajo | undefined {
  return (
    plan.filas.find((f) => f.uid && f.uid === u.uid) ||
    (u.codigoMarcacion
      ? plan.filas.find((f) => f.codigoMarcacion?.trim() === u.codigoMarcacion?.trim())
      : undefined)
  );
}
