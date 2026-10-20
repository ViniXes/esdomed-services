// Lector del "Reporte Descuentos {Mes} de {Año}" (reloj marcador → RRHH).
//
// El PDF es digital (JasperReports, página apaisada con /Rotate 90): el texto
// sale limpio de pdfjs. Aquí NO se toca pdfjs (eso vive en ./pdf): se recibe el
// texto ya ubicado en coordenadas de la página tal como se ve, se reconstruyen
// las líneas por su altura y cada línea se reconoce con una expresión regular.
// Reconocer la línea completa (y no la posición de cada pieza) hace que no
// importe cómo pdfjs parta el texto en fragmentos.
//
// Estructura por empleado, repetida (puede cruzar de página):
//   Planilla : DIRECCION   Unidad Organizativa: ESDOMED      ← abre ficha
//   Codigo C-043 - NOMBRE COMPLETO   COMIDA
//   Plaza: 264 - Supervisor Sección de Estadística y Documentos
//   Cod. en Marcador: C-043
//   dd-mmm-aaaa  HH:MM - HH:MM  ENTRADA SALIDA … TIEMPO $ MONTO   ← un día con incidencia
//   Total por Empleado / TARDANZA - SALIDA TEMP. / AUSENCIAS / … ← resumen
// y al final del documento "Total General $ X".

import type {
  ConceptoDescuentoMarcacion,
  DiaInconsistenciaMarcacion,
  EmpleadoInconsistenciasMarcacion,
  ReporteInconsistenciasMarcacion,
} from "@/types";

export interface ItemPdf {
  str: string;
  x: number; // izquierda → derecha
  y: number; // arriba → abajo (línea base)
}

export type ReporteLeido = Omit<
  ReporteInconsistenciasMarcacion,
  "id" | "archivoNombre" | "cargadoEn" | "cargadoPorId" | "cargadoPorNombre"
>;

export interface ResultadoLectura {
  reporte: ReporteLeido | null;
  /** Impiden guardar: el reporte no se entendió completo. */
  errores: string[];
  /** No impiden guardar, pero el admin debe verlos (descuadres de centavos, otra unidad…). */
  avisos: string[];
}

// Dos fragmentos están en la misma línea si su línea base difiere menos que esto
// (pt). Las filas del reporte están a ≥ 3.6 pt; los fragmentos de una fila, a < 1.
const TOLERANCIA_LINEA = 2.5;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const HM = String.raw`\d{1,3}:\d{2}`;
const DINERO = String.raw`[\d,]+\.\d+`;

const RE_TITULO = /Reporte Descuentos\s+([A-Za-zÁÉÍÓÚáéíóú]+)\s+de\s+(\d{4})/i;
const RE_IMPRESION = /(\d{2}-[a-z]{3}-\d{4})\s+(\d{1,2}[.:]\d{2}\s*[AP]M)/i;
const RE_PLANILLA = /^Planilla\s*:\s*(.*?)\s*Unidad Organizativa\s*:\s*(.+)$/i;
const RE_CODIGO = /^Codigo\s+([A-Z0-9]+-\d+)\s*-\s*(.+?)(?:\s+COMIDA)?$/i;
const RE_PLAZA = /^Plaza\s*:\s*(\d+)\s*-\s*(.+?)(?:\s+(?:Salida|Entrada)\b.*)?$/i;
const RE_MARCADOR = /^Cod\.\s*en\s*Marcador\s*:\s*(\S+)/i;
const RE_FECHA_INICIO = /^\d{2}-[a-z]{3}-\d{4}\b/i;
const RE_DIA = new RegExp(
  "^(\\d{2})-([a-z]{3})-(\\d{4})" +
  `\\s+(${HM})\\s*-\\s*(${HM})` +                        // horario
  `\\s+(${HM})\\s+(${HM})` +                             // entrada, salida
  `\\s+(${HM})\\s+(${HM})\\s+(${HM})\\s+(${HM})` +       // sal.com, ent.com, ent.pau, sal.pau
  `\\s+(${HM})` +                                        // trabajadas
  `\\s+(${DINERO})\\s+(${DINERO})` +                     // séptimo, ausencia
  `\\s+(${HM})\\s+\\$\\s*(${DINERO})$`,                  // tiempo, monto
  "i",
);
const RE_TOTAL_EMPLEADO = new RegExp(`^Total por Empleado\\s*:\\s*-*\\s*\\$\\s*(${DINERO})`, "i");
const RE_CONCEPTO = new RegExp(
  `^(TARDANZA - SALIDA TEMP\\.|AUSENCIAS|PERMISO SIN GOCE DE SUELDO|INCAPACIDAD SIN GOCE DE SUELDO)\\s+(\\d+)\\s*:\\s*(\\d+)\\s+\\$\\s*(${DINERO})`,
  "i",
);
const RE_SEPTIMO = new RegExp(`^SEPTIMO\\s+(?:-+\\s+)?(\\d+)\\s+\\$\\s*(${DINERO})`, "i");
const RE_MIN_ANTERIOR = /^MIN\.\s*PERIODO ANTERIOR\s+(\d+)\s*:\s*(\d+)/i;
const RE_TOTAL_GENERAL = new RegExp(`^Total General\\s+\\$\\s*(${DINERO})`, "i");

const dinero = (s: string) => Math.round(parseFloat(s.replace(/,/g, "")) * 100) / 100;
const aMinutos = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};
const pad2 = (n: number) => String(n).padStart(2, "0");
const plata = (n: number) => `$${n.toFixed(2)}`;

/** Reconstruye las líneas de texto de cada página (orden de lectura). */
export function lineasDePaginas(paginas: ItemPdf[][]): { pagina: number; texto: string }[] {
  const lineas: { pagina: number; texto: string }[] = [];
  paginas.forEach((items, i) => {
    const ordenados = items
      .filter((it) => it.str.trim() !== "")
      .sort((a, b) => a.y - b.y || a.x - b.x);
    let grupo: ItemPdf[] = [];
    let yInicio = Number.NEGATIVE_INFINITY;
    const cerrar = () => {
      if (grupo.length === 0) return;
      const texto = grupo
        .sort((a, b) => a.x - b.x)
        .map((it) => it.str.trim())
        .join(" ")
        .replace(/\s+/g, " ");
      lineas.push({ pagina: i + 1, texto });
    };
    for (const it of ordenados) {
      if (it.y - yInicio > TOLERANCIA_LINEA) {
        cerrar();
        grupo = [];
        yInicio = it.y;
      }
      grupo.push(it);
    }
    cerrar();
  });
  return lineas;
}

const conceptoVacio = (): ConceptoDescuentoMarcacion => ({ minutos: 0, monto: 0 });

function empleadoVacio(): EmpleadoInconsistenciasMarcacion {
  return {
    codigoMarcacion: "",
    nombre: "",
    plaza: "",
    dias: [],
    total: 0,
    tardanza: conceptoVacio(),
    ausencias: conceptoVacio(),
    permisoSinGoce: conceptoVacio(),
    incapacidadSinGoce: conceptoVacio(),
    septimo: { cantidad: 0, monto: 0 },
    minutosPeriodoAnterior: 0,
  };
}

/** Lee el reporte a partir del texto ubicado de cada página. */
export function leerReporteDescuentos(paginas: ItemPdf[][]): ResultadoLectura {
  const errores: string[] = [];
  const avisos: string[] = [];
  const lineas = lineasDePaginas(paginas);

  let anio = 0;
  let mes = 0;
  let fechaImpresion: string | null = null;
  let totalGeneral: number | null = null;
  const unidades = new Set<string>();
  const empleados: EmpleadoInconsistenciasMarcacion[] = [];
  let actual: EmpleadoInconsistenciasMarcacion | null = null;
  let filasNoLeidas = 0;

  for (const { pagina, texto } of lineas) {
    let m: RegExpMatchArray | null;

    if (!mes && (m = texto.match(RE_TITULO))) {
      const i = MESES.indexOf(m[1].toLowerCase().replace(/^setiembre$/, "septiembre"));
      if (i >= 0) {
        mes = i + 1;
        anio = Number(m[2]);
      }
      continue;
    }
    if (!fechaImpresion && (m = texto.match(RE_IMPRESION))) {
      fechaImpresion = `${m[1]} ${m[2]}`;
      // La fecha de impresión comparte línea con "Hospital Nacional El Salvador".
      continue;
    }
    if ((m = texto.match(RE_PLANILLA))) {
      actual = empleadoVacio();
      empleados.push(actual);
      unidades.add(m[2].trim());
      continue;
    }
    if ((m = texto.match(RE_TOTAL_GENERAL))) {
      totalGeneral = dinero(m[1]);
      continue;
    }

    if (!actual) continue; // encabezados de página antes de la primera ficha

    if ((m = texto.match(RE_CODIGO))) {
      actual.codigoMarcacion = actual.codigoMarcacion || m[1].toUpperCase();
      actual.nombre = m[2].trim();
    } else if ((m = texto.match(RE_PLAZA))) {
      actual.plaza = m[2].trim();
    } else if ((m = texto.match(RE_MARCADOR))) {
      // El código del marcador es la llave que usa la app (UserProfile.codigoMarcacion).
      actual.codigoMarcacion = m[1].toUpperCase();
    } else if ((m = texto.match(RE_DIA))) {
      const mesDia = MESES_CORTOS.indexOf(m[2].toLowerCase()) + 1;
      if (mesDia === 0) {
        filasNoLeidas++;
        errores.push(`Pág. ${pagina}: mes desconocido en la fila "${texto}".`);
        continue;
      }
      const dia: DiaInconsistenciaMarcacion = {
        fecha: `${m[3]}-${pad2(mesDia)}-${m[1]}`,
        horario: `${m[4]} - ${m[5]}`,
        entrada: m[6],
        salida: m[7],
        salidaComida: m[8],
        entradaComida: m[9],
        entradaPausa: m[10],
        salidaPausa: m[11],
        trabajadas: m[12],
        septimo: dinero(m[13]),
        ausencia: dinero(m[14]),
        minutos: aMinutos(m[15]),
        monto: dinero(m[16]),
      };
      actual.dias.push(dia);
    } else if (RE_FECHA_INICIO.test(texto)) {
      filasNoLeidas++;
      errores.push(`Pág. ${pagina}: no se pudo leer la fila "${texto}".`);
    } else if ((m = texto.match(RE_TOTAL_EMPLEADO))) {
      actual.total = dinero(m[1]);
    } else if ((m = texto.match(RE_CONCEPTO))) {
      const concepto = { minutos: Number(m[2]) * 60 + Number(m[3]), monto: dinero(m[4]) };
      const etiqueta = m[1].toUpperCase();
      if (etiqueta.startsWith("TARDANZA")) actual.tardanza = concepto;
      else if (etiqueta === "AUSENCIAS") actual.ausencias = concepto;
      else if (etiqueta.startsWith("PERMISO")) actual.permisoSinGoce = concepto;
      else actual.incapacidadSinGoce = concepto;
    } else if ((m = texto.match(RE_SEPTIMO))) {
      actual.septimo = { cantidad: Number(m[1]), monto: dinero(m[2]) };
    } else if ((m = texto.match(RE_MIN_ANTERIOR))) {
      actual.minutosPeriodoAnterior = Number(m[1]) * 60 + Number(m[2]);
    }
  }

  // ── Validaciones ──────────────────────────────────────────────────────────
  if (!mes) errores.push('No se encontró el título "Reporte Descuentos {Mes} de {Año}". ¿Es el reporte correcto?');
  if (empleados.length === 0) errores.push("No se encontró ningún empleado en el reporte.");
  if (filasNoLeidas > 0) {
    errores.unshift(`${filasNoLeidas} fila(s) de días no se pudieron leer; no se guarda para no dejar estadísticas incompletas.`);
  }

  const sinCodigo = empleados.filter((e) => !e.codigoMarcacion);
  if (sinCodigo.length) errores.push(`${sinCodigo.length} ficha(s) sin código de marcador.`);

  const vistos = new Set<string>();
  for (const e of empleados) {
    if (e.codigoMarcacion && vistos.has(e.codigoMarcacion)) {
      avisos.push(`El código ${e.codigoMarcacion} aparece en más de una ficha.`);
    }
    vistos.add(e.codigoMarcacion);

    const quien = `${e.codigoMarcacion} ${e.nombre}`.trim();
    if (e.dias.length === 0) avisos.push(`${quien}: la ficha no trae días con incidencia.`);
    // Cada monto del reporte ya viene redondeado: se tolera ~1 centavo por fila.
    const sumaDias = e.dias.reduce((a, d) => a + d.monto, 0);
    if (Math.abs(sumaDias - e.total) > 0.02 + 0.01 * e.dias.length) {
      avisos.push(`${quien}: los días suman ${plata(sumaDias)} pero el total del empleado es ${plata(e.total)}.`);
    }
    const sumaConceptos =
      e.tardanza.monto + e.ausencias.monto + e.permisoSinGoce.monto + e.incapacidadSinGoce.monto + e.septimo.monto;
    if (Math.abs(sumaConceptos - e.total) > 0.05) {
      avisos.push(`${quien}: los conceptos del resumen suman ${plata(sumaConceptos)} y el total es ${plata(e.total)}.`);
    }
    if (mes && e.dias.some((d) => Number(d.fecha.slice(5, 7)) !== mes)) {
      avisos.push(`${quien}: trae días fuera de ${MESES[mes - 1]}.`);
    }
  }

  const sumaEmpleados = empleados.reduce((a, e) => a + e.total, 0);
  if (totalGeneral === null) {
    avisos.push('No se encontró el "Total General" al final del reporte; no se pudo comprobar la suma.');
  } else if (Math.abs(sumaEmpleados - totalGeneral) > 0.02 + 0.01 * empleados.length) {
    avisos.push(`Los empleados suman ${plata(sumaEmpleados)} pero el Total General del reporte es ${plata(totalGeneral)}.`);
  }

  const otrasUnidades = [...unidades].filter((u) => u.toUpperCase() !== "ESDOMED");
  if (otrasUnidades.length) avisos.push(`El reporte incluye la unidad organizativa ${otrasUnidades.join(", ")} (se esperaba ESDOMED).`);

  if (errores.length) return { reporte: null, errores, avisos };

  return {
    reporte: {
      periodo: `${anio}-${pad2(mes)}`,
      anio,
      mes,
      unidad: [...unidades].join(", ") || "ESDOMED",
      fechaImpresion,
      totalGeneral: totalGeneral ?? Math.round(sumaEmpleados * 100) / 100,
      empleados,
    },
    errores,
    avisos,
  };
}

/** 9 → "septiembre". */
export function nombreMes(mes: number): string {
  return MESES[mes - 1] ?? "";
}
