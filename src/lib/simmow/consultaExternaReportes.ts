// Lectores de los dos reportes del SIS que alimentan Consulta Externa. Reciben
// la matriz de celdas ya leída del .xls (como hace PasoCargaAmbulatorio); no
// tocan archivos ni dependen del navegador.

import { mayus, sinAcentos } from "./texto";

const txt = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim();

const PATRON_EXPEDIENTE = /^\d{1,7}\s*-\s*\d{2}$/;
const normalizarExpediente = (v: unknown): string => txt(v).replace(/\s+/g, "");

function normalizarFecha(v: string): string {
  const m = v.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}` : "";
}

// ─── Censo diario de consulta externa ───────────────────────────────────────

export interface FilaCenso {
  numero: string;
  expediente: string;
  medico: string;
  especialidad: string;
  /** Celdas por número de campo del formato oficial (1–47); ver la fila de numeración del reporte. */
  campos: Record<number, string>;
}

export interface CensoLeido {
  /** Primer día del rango "Fecha de consulta" del encabezado, DD/MM/YYYY. */
  fecha: string;
  fechaFin: string;
  establecimiento: string;
  filas: FilaCenso[];
}

interface EncabezadoCenso {
  filaNumeracion: number;
  columnaPorCampo: Record<number, number>;
  colMedico: number;
  colEspecialidad: number;
}

function localizarEncabezadoCenso(matriz: unknown[][]): EncabezadoCenso | null {
  const filaNumeracion = matriz.findIndex((f) => txt(f[0]) === "1" && txt(f[1]) === "2");
  if (filaNumeracion < 0) return null;

  // La fila de numeración rotula cada columna con su número de campo ("5, 6, 7"
  // para la edad); así no se depende de la posición fija de las columnas.
  const columnaPorCampo: Record<number, number> = {};
  matriz[filaNumeracion].forEach((celda, indice) => {
    const m = txt(celda).match(/^(\d+)(?:\s*,.*)?$/);
    if (m) columnaPorCampo[Number(m[1])] = indice;
  });

  let colMedico = 2;
  let colEspecialidad = 3;
  for (let i = Math.max(0, filaNumeracion - 4); i < filaNumeracion; i++) {
    const fila = matriz[i] ?? [];
    const iMedico = fila.findIndex((c) => sinAcentos(txt(c)).toLowerCase() === "medico");
    const iEspecialidad = fila.findIndex((c) => sinAcentos(txt(c)).toLowerCase() === "especialidad");
    if (iMedico >= 0 && iEspecialidad >= 0) {
      colMedico = iMedico;
      colEspecialidad = iEspecialidad;
      break;
    }
  }

  return { filaNumeracion, columnaPorCampo, colMedico, colEspecialidad };
}

export function esCensoConsultaExterna(matriz: unknown[][]): boolean {
  const enc = localizarEncabezadoCenso(matriz);
  if (!enc) return false;
  const cabecera = matriz.slice(0, enc.filaNumeracion).flat().map((c) => sinAcentos(txt(c)).toLowerCase());
  return cabecera.some((c) => c.includes("numero de expediente clinico")) && cabecera.some((c) => c === "sexo");
}

export function leerCenso(matriz: unknown[][]): CensoLeido | null {
  const enc = localizarEncabezadoCenso(matriz);
  if (!enc) return null;

  const encabezado = matriz
    .slice(0, 4)
    .flat()
    .map((c) => txt(c))
    .join(" ");
  const rango = encabezado.match(
    /Fecha\s+de\s+consulta:\s*(\d{1,2}\/\d{1,2}\/\d{4})(?:\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4}))?/i
  );
  const establecimiento = txt(
    encabezado.match(/Establecimiento:\s*(.*?)\s*(?=M[eé]dico:|Especialidad:|Fecha\s+de\s+consulta:|$)/i)?.[1]
  );

  const filas: FilaCenso[] = [];
  const colExpediente = enc.columnaPorCampo[2];
  const colNumero = enc.columnaPorCampo[1] ?? 0;
  if (colExpediente === undefined) return null;

  for (const fila of matriz.slice(enc.filaNumeracion + 1)) {
    const expediente = normalizarExpediente(fila[colExpediente]);
    if (!PATRON_EXPEDIENTE.test(expediente)) continue;

    const campos: Record<number, string> = {};
    for (const [campo, columna] of Object.entries(enc.columnaPorCampo)) {
      campos[Number(campo)] = txt(fila[columna]);
    }

    filas.push({
      numero: txt(fila[colNumero]),
      expediente,
      medico: txt(fila[enc.colMedico]),
      especialidad: txt(fila[enc.colEspecialidad]),
      campos,
    });
  }

  const fecha = normalizarFecha(rango?.[1] ?? "");
  return {
    fecha,
    fechaFin: normalizarFecha(rango?.[2] ?? "") || fecha,
    establecimiento,
    filas,
  };
}

// ─── Programación de citas por día ──────────────────────────────────────────

export interface CitaProgramada {
  expediente: string;
  dui: string; // sin guion
  /** "NOMBRES APELLIDOS" en mayúsculas; el reporte lo trae como "Apellidos, Nombres". */
  nombre: string;
  tipoCita: string;
  medico: string;
  especialidad: string;
  consultorio: string;
  fecha: string;
}

export interface ProgramacionLeida {
  porExpediente: Map<string, CitaProgramada>;
  /** Expedientes con más de una cita en el día (se conserva la primera). */
  repetidos: Set<string>;
  fechas: string[];
}

function nombresApellidos(apellidosNombres: string): string {
  const [apellidos, ...resto] = apellidosNombres.split(",");
  const nombres = resto.join(" ");
  return mayus(`${nombres} ${apellidos}`.replace(/\s+/g, " "));
}

export function esProgramacionCitas(matriz: unknown[][]): boolean {
  return matriz
    .slice(0, 12)
    .some((f) => sinAcentos(txt(f[0])).toLowerCase() === "numero expediente" && sinAcentos(txt(f[1])).toLowerCase() === "dui");
}

/** Una hoja por médico y consultorio: se leen todas. */
export function leerProgramacion(hojas: unknown[][][]): ProgramacionLeida {
  const porExpediente = new Map<string, CitaProgramada>();
  const repetidos = new Set<string>();
  const fechas = new Set<string>();

  for (const matriz of hojas) {
    if (!esProgramacionCitas(matriz)) continue;
    const especialidad = txt(matriz[0]?.[0]);
    const medico = txt(matriz[2]?.[0]);
    const fecha = normalizarFecha(txt(matriz[3]?.[0]));
    if (fecha) fechas.add(fecha);

    let consultorio = "";
    for (const fila of matriz) {
      const columnaD = txt(fila[3]);
      if (/^Consultorio:/i.test(columnaD)) {
        consultorio = columnaD.replace(/^Consultorio:\s*/i, "");
        continue;
      }
      const expediente = normalizarExpediente(fila[0]);
      if (!PATRON_EXPEDIENTE.test(expediente) || !txt(fila[2])) continue;

      if (porExpediente.has(expediente)) {
        repetidos.add(expediente);
        continue;
      }
      porExpediente.set(expediente, {
        expediente,
        dui: txt(fila[1]).replace(/\D/g, ""),
        nombre: nombresApellidos(txt(fila[2])),
        tipoCita: txt(fila[3]),
        medico,
        especialidad,
        consultorio,
        fecha,
      });
    }
  }

  return { porExpediente, repetidos, fechas: [...fechas] };
}
