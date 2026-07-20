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

export interface ItemUbicado {
  pagina: PaginaExtraida;
  item: ItemTexto;
}

/** Primer item de texto cuyo contenido (sin acentos) coincide con el patrón. */
export function buscarItem(
  doc: DocumentoExtraido,
  patron: RegExp
): ItemUbicado | null {
  for (const pagina of doc.paginas) {
    for (const item of pagina.items) {
      if (patron.test(sinAcentos(item.str))) {
        return { pagina, item };
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
