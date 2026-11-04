// Formato oficial de inconsistencia (art. 60 del Reglamento Interno de RRHH):
// la hoja que el empleado imprime, firma y lleva al Vo. Bo. de su jefe.
//
// Solo aplica cuando falta UNA marca. Un día sin ninguna marca es un proceso
// especial de RRHH que pide documentación de respaldo, y uno con las dos marcas
// sí tiene registro: ninguno de los dos se reclama por esta vía.

import type { DiaInconsistenciaMarcacion, FilaPlanTrabajo } from "@/types";
import { normalizarCodigoMarcacion } from "@/lib/esdomed/catalogo-plan";
import { getHorario } from "@/lib/esdomed/horarios";
import { NOMBRES_MES } from "@/lib/esdomed/plan";
import { MIN_DIA, ventanaTurno } from "@/lib/esdomed/turnos-dia";
import { tipoIncidencia } from "./analisis";

export interface JefeFormato {
  nombre: string;
  cargo: string;
}

/** Quien da el Vo. Bo. de todo el personal de ESDOMED... */
const JEFE_ESDOMED: JefeFormato = { nombre: "HEBER BENJAMIN CARDOZA GUEVARA", cargo: "COORDINADOR ESDOMED" };
const CODIGO_JEFE_ESDOMED = "C-043";

/** ...y quien se lo da a él. */
const JEFE_DEL_JEFE_ESDOMED: JefeFormato = { nombre: "ROBERTO CENTENO ZAMBRANO", cargo: "JEFE DE UNIDAD DE PLANIFICACIÓN" };

export const jefeDe = (codigoMarcacion?: string | null): JefeFormato =>
  normalizarCodigoMarcacion(codigoMarcacion) === CODIGO_JEFE_ESDOMED ? JEFE_DEL_JEFE_ESDOMED : JEFE_ESDOMED;

/** Pantalla de la hoja para esos días: la imprime y, la primera vez, registra el trámite. */
export const rutaHojaInconsistencia = (periodo: string, fechas: string[]) =>
  `/dashboard/mis-marcaciones/formato?${new URLSearchParams({ periodo, dias: [...fechas].sort().join(",") })}`;

export type MarcaFaltante = "entrada" | "salida";

/** La marca que falta, o null si el día no admite el formato. */
export function marcaFaltante(d: Pick<DiaInconsistenciaMarcacion, "entrada" | "salida">): MarcaFaltante | null {
  const tipo = tipoIncidencia(d);
  if (tipo === "omision_entrada") return "entrada";
  if (tipo === "omision_salida") return "salida";
  return null;
}

export interface FechaFormato {
  dia: number;
  mes: string; // "octubre"
  anio: number;
}

export const fechaFormato = (f: Date): FechaFormato => ({
  dia: f.getDate(),
  mes: NOMBRES_MES[f.getMonth()].toLowerCase(),
  anio: f.getFullYear(),
});

const fechaDesdeIso = (iso: string, masDias: number) => {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return fechaFormato(new Date(anio, mes - 1, dia + masDias));
};

interface Turno {
  entrada: string; // "7:00 am"
  salida: string;
  /** 0 = sale el mismo día; 1 = el turno amanece. */
  diasHastaSalida: number;
}

function turnoDelPlan(fila: FilaPlanTrabajo | undefined, fecha: string): Turno | null {
  const horario = getHorario(fila?.asignaciones[Number(fecha.slice(8, 10)) - 1]);
  const ventana = horario && ventanaTurno(horario);
  if (!ventana) return null;
  return { entrada: horario.entrada, salida: horario.salida, diasHastaSalida: Math.floor(ventana.fin / MIN_DIA) };
}

const aMinutos = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

/** 900 → "3:00 pm", igual que las etiquetas del catálogo de horarios. */
const etiquetaHora = (minutos: number) => {
  const h = Math.floor(minutos / 60) % 24;
  return `${h % 12 || 12}:${String(minutos % 60).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};

/** "07:00 - 15:00": el horario con el que midió el reloj. */
function turnoDelReloj(horario: string): Turno {
  const [inicio, fin] = horario.split("-").map((s) => aMinutos(s.trim()));
  const duracion = (fin - inicio + MIN_DIA) % MIN_DIA || MIN_DIA;
  return { entrada: etiquetaHora(inicio), salida: etiquetaHora(fin), diasHastaSalida: Math.floor((inicio + duracion) / MIN_DIA) };
}

export interface DatosFormato {
  marca: MarcaFaltante;
  /** Hora y fecha de la marca que falta. */
  horaOmitida: string;
  fechaOmitida: FechaFormato;
  /** Turno programado: de `entrada` el día `desde` a `salida` el día `hasta`. */
  entrada: string;
  salida: string;
  desde: FechaFormato;
  hasta: FechaFormato;
}

/**
 * Lo que se escribe en la hoja de un día. Manda el plan; si ese día no tiene
 * turno en él (el plan arranca en junio de 2026, o hubo un cambio de turno) se
 * usa el horario con el que midió el reloj. `d.fecha` es el día en que INICIA
 * el turno, así que la salida de un turno que amanece cae al día siguiente.
 */
export function datosFormato(d: DiaInconsistenciaMarcacion, fila: FilaPlanTrabajo | undefined): DatosFormato | null {
  const marca = marcaFaltante(d);
  if (!marca) return null;
  const { entrada, salida, diasHastaSalida } = turnoDelPlan(fila, d.fecha) ?? turnoDelReloj(d.horario);
  const desde = fechaDesdeIso(d.fecha, 0);
  const hasta = fechaDesdeIso(d.fecha, diasHastaSalida);
  return {
    marca,
    horaOmitida: marca === "entrada" ? entrada : salida,
    fechaOmitida: marca === "entrada" ? desde : hasta,
    entrada,
    salida,
    desde,
    hasta,
  };
}
