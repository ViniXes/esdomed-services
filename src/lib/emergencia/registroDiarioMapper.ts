// Mapper del reporte SIS "Registro Diario de Emergencia" (.xls).
//
// Estructura del archivo: fila 1 = título del ministerio, fila 2 = encabezados,
// resto = una fila por paciente que ENTRÓ a emergencia (aparece aquí antes que
// en "Pacientes Atendidos En Emergencia", que se genera al cerrar triage).
// El reporte NO trae fecha (es diario) — la elige ESDOMED al importar — ni
// nombre del paciente.

import type { AreaGeografica, DiagnosticoCIE, Genero } from "@/types";

// Columnas por posición (0-based) según el formato oficial del SIS.
const COL = {
  expediente: 1,
  sexo: 2,            // 1 = masculino, 2 = femenino
  edad: 3,            // "64 años 7 meses 18 días"
  departamento: 5,
  municipio: 6,
  area: 7,            // 1 = urbana, 2 = rural
  medico: 9,
  subservicio: 10,
  dxPrincipal: 11,
  ciePrincipal: 12,
  dxSecundario: 13,
  cieSecundario: 14,
  causaExterna: 15,
  cieCausaExterna: 16,
  ingreso: 17,        // 1 = sí, 2 = no
  tipoAfiliacion: 18,
  numeroAfiliacion: 19,
  establecimientoReferido: 22,
} as const;

const texto = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim();

export interface DatosRegistroDiario {
  expediente: string;
  genero: Genero;
  edadTexto?: string;
  edadAnios?: number;
  departamento?: string;
  municipio?: string;
  area?: AreaGeografica;
  medico?: string;
  subservicio?: string;
  diagnosticoPrincipal?: DiagnosticoCIE;
  diagnosticoSecundario?: DiagnosticoCIE;
  causaExterna?: DiagnosticoCIE;
  ingresoHospitalario: boolean;
  tipoAfiliacion?: string;
  numeroAfiliacion?: string;
  establecimientoReferido?: string;
}

export interface FilaMapeada {
  valido: boolean;
  motivoInvalido?: string;
  expediente: string;
  datos: DatosRegistroDiario;
}

// Encuentra las filas de datos: todo lo que sigue al encabezado y tiene expediente.
export function localizarFilasRegistro(matriz: unknown[][]): unknown[][] {
  const hIdx = matriz.findIndex((f) =>
    f.some((c) => typeof c === "string" && c.toLowerCase().includes("expediente cl")),
  );
  if (hIdx === -1) return [];
  return matriz.slice(hIdx + 1).filter((f) => texto(f[COL.expediente]) !== "");
}

function edadEnAnios(edadTexto: string): number | undefined {
  if (!edadTexto) return undefined;
  const m = edadTexto.match(/(\d+)\s*años?/i);
  if (m) return parseInt(m[1], 10);
  // Solo meses/días → menor de un año.
  if (/mes|día|dia/i.test(edadTexto)) return 0;
  return undefined;
}

function dx(descripcion: unknown, codigo: unknown): DiagnosticoCIE | undefined {
  const d = texto(descripcion);
  const c = texto(codigo).toUpperCase();
  if (!d && !c) return undefined;
  return { codigo: c, descripcion: d };
}

export function mapearFilaRegistro(row: unknown[]): FilaMapeada {
  const expediente = texto(row[COL.expediente]);
  if (!expediente) {
    return { valido: false, motivoInvalido: "sin expediente", expediente: "", datos: {} as DatosRegistroDiario };
  }

  const sexo = texto(row[COL.sexo]);
  const areaRaw = texto(row[COL.area]);
  const edadTexto = texto(row[COL.edad]);

  const datos: DatosRegistroDiario = {
    expediente,
    genero: sexo === "1" ? "masculino" : sexo === "2" ? "femenino" : "otro",
    edadTexto: edadTexto || undefined,
    edadAnios: edadEnAnios(edadTexto),
    departamento: texto(row[COL.departamento]) || undefined,
    municipio: texto(row[COL.municipio]) || undefined,
    area: areaRaw === "1" ? "urbana" : areaRaw === "2" ? "rural" : undefined,
    medico: texto(row[COL.medico]) || undefined,
    subservicio: texto(row[COL.subservicio]) || undefined,
    diagnosticoPrincipal: dx(row[COL.dxPrincipal], row[COL.ciePrincipal]),
    diagnosticoSecundario: dx(row[COL.dxSecundario], row[COL.cieSecundario]),
    causaExterna: dx(row[COL.causaExterna], row[COL.cieCausaExterna]),
    ingresoHospitalario: texto(row[COL.ingreso]) === "1",
    tipoAfiliacion: texto(row[COL.tipoAfiliacion]) || undefined,
    numeroAfiliacion: texto(row[COL.numeroAfiliacion]) || undefined,
    establecimientoReferido: texto(row[COL.establecimientoReferido]) || undefined,
  };

  return { valido: true, expediente, datos };
}
