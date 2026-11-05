import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

// Llena la plantilla oficial del "Reporte de ocupación de camas" editando las
// celdas directamente en el XML: el formulario de MINSAL no admite cambios de
// estructura y una librería de hojas de cálculo perdería el logo y los formatos.

const HOJA_OCUPACION = "xl/worksheets/sheet1.xml";
const HOJA_TOTAL_CAMAS = "xl/worksheets/sheet2.xml";
const LIBRO = "xl/workbook.xml";

export interface FilaOcupacion {
  /** Fila en la hoja OCUPACION. */
  fila: number;
  /** Fila en la hoja "Total camas". */
  filaTotal: number;
  tipo: "censable" | "noCensable";
  oficiales: number;
  extras: number;
  ocupadas: number;
  ocupadasExtra: number;
}

/** Cuidados críticos (UCI + UCIN): filas 14 a 25, que excluyen Centro Quirúrgico. */
const esCritico = (f: FilaOcupacion) => f.fila >= 14 && f.fila <= 25;

const suma = <T,>(items: T[], valor: (item: T) => number) =>
  items.reduce((total, item) => total + valor(item), 0);

const razon = (parte: number, total: number) => (total > 0 ? parte / total : 0);

/** El formulario deja las extras en blanco salvo que haya pacientes en ellas. */
export const extrasDisponibles = (f: FilaOcupacion) => (f.ocupadasExtra > 0 ? f.extras : 0);

export const ocupacionFila = (f: FilaOcupacion) =>
  razon(f.ocupadas + f.ocupadasExtra, f.oficiales);

export function totalesOcupacion(filas: FilaOcupacion[]) {
  const censables = filas.filter((f) => f.tipo === "censable");
  const noCensables = filas.filter((f) => f.tipo === "noCensable");
  const criticos = filas.filter(esCritico);
  const camasCensables = suma(censables, (f) => f.oficiales);
  const ocupadasCensables = suma(censables, (f) => f.ocupadas);
  const ocupadasExtra = suma(censables, (f) => f.ocupadasExtra);
  return {
    camasCensables,
    ocupadasCensables,
    extrasDisponibles: suma(censables, extrasDisponibles),
    ocupadasExtra,
    camasNoCensables: suma(noCensables, (f) => f.oficiales),
    ocupadasNoCensables: suma(noCensables, (f) => f.ocupadas),
    ocupacionHospitalizacion: razon(ocupadasCensables + ocupadasExtra, camasCensables),
    ocupacionCriticos: razon(suma(criticos, (f) => f.ocupadas), suma(criticos, (f) => f.oficiales)),
  };
}

/** Escribe un número (o deja en blanco) conservando el estilo y la fórmula de la celda. */
function fijarCelda(xml: string, ref: string, valor: number | null): string {
  const celda = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`);
  const hallada = celda.exec(xml);
  if (!hallada) throw new Error(`La plantilla no tiene la celda ${ref}`);
  const atributos = hallada[1].replace(/\s+t="[^"]*"/, "");
  const formula = hallada[2]?.match(/<f[^>]*\/>|<f[\s\S]*?<\/f>/)?.[0] ?? "";
  const contenido = formula + (valor === null ? "" : `<v>${valor}</v>`);
  const nueva = contenido ? `<c r="${ref}"${atributos}>${contenido}</c>` : `<c r="${ref}"${atributos}/>`;
  return xml.slice(0, hallada.index) + nueva + xml.slice(hallada.index + hallada[0].length);
}

function fijarCeldas(xml: string, celdas: Record<string, number | null>): string {
  return Object.entries(celdas).reduce((acc, [ref, valor]) => fijarCelda(acc, ref, valor), xml);
}

/** Número de serie de Excel de una fecha "YYYY-MM-DD". */
function serialExcel(fecha: string): number {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return Date.UTC(anio, mes - 1, dia) / 86_400_000 + 25_569;
}

export function generarOcupacionXlsx(
  plantilla: Uint8Array,
  filas: FilaOcupacion[],
  fecha: string,
): Uint8Array {
  const archivos = unzipSync(plantilla);
  const totales = totalesOcupacion(filas);

  const ocupacion: Record<string, number | null> = {
    F6: serialExcel(fecha),
    I5: totales.ocupacionHospitalizacion,
    I6: totales.ocupacionCriticos,
    D47: totales.camasCensables,
    E47: totales.ocupadasCensables,
    F47: totales.extrasDisponibles,
    G47: totales.ocupadasExtra,
    H47: totales.camasNoCensables,
    I47: totales.ocupadasNoCensables,
    J47: totales.ocupacionHospitalizacion,
  };
  const totalCamas: Record<string, number | null> = {
    D37: totales.camasCensables,
    E37: suma(filas, (f) => f.extras),
    F37: totales.camasNoCensables,
    D41: totales.camasCensables,
    D42: suma(filas, (f) => f.extras),
    D43: totales.camasNoCensables,
    D44: totales.camasCensables + suma(filas, (f) => f.extras) + totales.camasNoCensables,
  };

  for (const f of filas) {
    ocupacion[`J${f.fila}`] = ocupacionFila(f);
    totalCamas[`G${f.filaTotal}`] = f.oficiales;
    if (f.tipo === "noCensable") {
      ocupacion[`H${f.fila}`] = f.oficiales;
      ocupacion[`I${f.fila}`] = f.ocupadas;
      totalCamas[`F${f.filaTotal}`] = f.oficiales;
      continue;
    }
    ocupacion[`D${f.fila}`] = f.oficiales;
    ocupacion[`E${f.fila}`] = f.ocupadas;
    ocupacion[`F${f.fila}`] = f.ocupadasExtra > 0 ? f.extras : null;
    ocupacion[`G${f.fila}`] = f.ocupadasExtra > 0 ? f.ocupadasExtra : null;
    totalCamas[`D${f.filaTotal}`] = f.oficiales;
    totalCamas[`E${f.filaTotal}`] = f.extras;
  }

  archivos[HOJA_OCUPACION] = strToU8(fijarCeldas(strFromU8(archivos[HOJA_OCUPACION]), ocupacion));
  archivos[HOJA_TOTAL_CAMAS] = strToU8(fijarCeldas(strFromU8(archivos[HOJA_TOTAL_CAMAS]), totalCamas));
  // Los valores calculados ya van escritos; Excel igual los recalcula al abrir.
  archivos[LIBRO] = strToU8(
    strFromU8(archivos[LIBRO]).replace(/<calcPr (?![^>]*fullCalcOnLoad)/, '<calcPr fullCalcOnLoad="1" '),
  );

  return zipSync(archivos);
}
