// Helpers de geometría sobre el resultado del motor PDF (sin dependencia de
// pdfjs, para poder probarlos con fixtures). Sirven para resolver los campos
// que en el FIEH se responden con casillas (condición de egreso, circunstancia
// de alta, cirugía suspendida, etc.).

import type {
  CheckboxDetectado,
  DocumentoExtraido,
  ItemTexto,
  PaginaExtraida,
} from "./types";
import { sinAcentos } from "./texto";

const TOL_LINEA = 9;
const TOL_LINEA_TEXTO = 5;

export interface ItemUbicado {
  pagina: PaginaExtraida;
  /** Último ítem consumido en el momento del match (fin de la etiqueta). */
  item: ItemTexto;
  /** Primer ítem de esa misma línea (inicio de la etiqueta). */
  inicio: ItemTexto;
}

/**
 * Primer item de texto cuyo contenido (sin acentos) coincide con el patrón.
 *
 * El navegador real reparte una misma etiqueta en varios ítems de texto, uno
 * por palabra (p. ej. "Circunstancia de alta:" llega como los ítems
 * "Circunstancia", "de", "alta:" por separado, no como uno solo) — probar el
 * patrón contra CADA ítem por separado nunca encuentra una etiqueta de más
 * de una palabra. Por eso se agrupan los ítems de cada línea (misma Y,
 * ordenados por X) y se prueba el patrón contra el texto acumulado palabra a
 * palabra, devolviendo el último ítem consumido en el momento del match (así
 * `.y` sigue sirviendo para ubicar la línea y `.x`/`.w` quedan apuntando al
 * final de la etiqueta, útil para leer el valor a la derecha).
 */
export function buscarItem(
  doc: DocumentoExtraido,
  patron: RegExp
): ItemUbicado | null {
  for (const pagina of doc.paginas) {
    const lineas: ItemTexto[][] = [];
    for (const it of pagina.items) {
      const linea = lineas.find((l) => Math.abs(l[0].y - it.y) <= TOL_LINEA_TEXTO);
      if (linea) linea.push(it);
      else lineas.push([it]);
    }

    for (const linea of lineas) {
      const ordenada = [...linea].sort((a, b) => a.x - b.x);
      let texto = "";
      for (const it of ordenada) {
        texto += (texto ? " " : "") + it.str;
        if (patron.test(sinAcentos(texto))) {
          return { pagina, item: it, inicio: ordenada[0] };
        }
      }
    }
  }
  return null;
}

/** Casillas cuya línea coincide (±tolerancia) con la Y dada. */
export function checkboxesEnLinea(
  pagina: PaginaExtraida,
  y: number,
  tol: number = TOL_LINEA
): CheckboxDetectado[] {
  return pagina.checkboxes.filter(
    (cb) => Math.abs(cb.y + cb.h / 2 - y) <= tol
  );
}

/**
 * Opción marcada en la línea donde aparece una etiqueta de sección.
 * Ej.: etiqueta /Condicion de/ → devuelve "Vivo" o "Muerto" si su casilla
 * está marcada; "" si ninguna lo está.
 */
export function opcionMarcadaJuntoA(
  doc: DocumentoExtraido,
  patronEtiqueta: RegExp,
  tol: number = TOL_LINEA
): string {
  const ubicado = buscarItem(doc, patronEtiqueta);
  if (!ubicado) return "";

  const marcadas = checkboxesEnLinea(ubicado.pagina, ubicado.item.y, tol).filter(
    (cb) => cb.marcado
  );
  return marcadas.length ? marcadas[0].opcion : "";
}

/**
 * Lee el valor de una "celda" que puede extenderse en varias líneas (p. ej.
 * un nombre de establecimiento largo que envuelve a la línea de abajo). Toma
 * todos los items desde la línea de `item` (la etiqueta) hacia abajo, con X
 * igual o mayor a la de la etiqueta —para no arrastrar columnas vecinas más a
 * la izquierda—, hasta (sin incluir) la línea donde aparece `patronFin`.
 */
export function leerCeldaMultilinea(
  pagina: PaginaExtraida,
  item: ItemTexto,
  patronFin: RegExp,
  maxLineas: number = 3
): string {
  const finItem = pagina.items.find(
    (it) => it !== item && it.y < item.y && patronFin.test(it.str)
  );
  const yLimite = finItem ? finItem.y : item.y - 40;

  const candidatos = pagina.items.filter(
    (it) => it.y <= item.y + 2 && it.y > yLimite + 2 && it.x >= item.x - 5
  );

  const lineas: ItemTexto[][] = [];
  for (const it of [...candidatos].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const linea = lineas.find((l) => Math.abs(l[0].y - it.y) <= 5);
    if (linea) linea.push(it);
    else lineas.push([it]);
  }

  return lineas
    .slice(0, maxLineas)
    .map((l) => l.sort((a, b) => a.x - b.x).map((i) => i.str).join(" "))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Todas las casillas marcadas del documento con su opción asociada. */
export function opcionesMarcadas(doc: DocumentoExtraido): CheckboxDetectado[] {
  return doc.paginas.flatMap((p) => p.checkboxes.filter((cb) => cb.marcado));
}

/**
 * Busca entre TODAS las casillas marcadas una cuya opción coincida con alguno
 * de los patrones dados; devuelve el índice del patrón que coincidió o -1.
 */
export function indicePatronMarcado(
  doc: DocumentoExtraido,
  patrones: RegExp[]
): number {
  for (const cb of opcionesMarcadas(doc)) {
    const opcion = sinAcentos(cb.opcion).toLowerCase();
    for (let i = 0; i < patrones.length; i++) {
      if (patrones[i].test(opcion)) return i;
    }
  }
  return -1;
}
