// Motor de lectura de PDF para el módulo SIMMOW. ÚNICO archivo que toca pdfjs.
//
// Los PDF del FIEH (pdfmake) y del Certificado de Defunción (wkhtmltopdf) son
// digitales: el texto se lee perfecto con getTextContent(). Las casillas de
// selección NO son texto ni campos de formulario: son imágenes bitmap (~10 pt)
// repetidas por toda la página — una imagen para la casilla vacía y otra (con
// más píxeles oscuros) para la marcada.
//
// La UBICACIÓN de cada casilla se detecta recorriendo la lista de operadores
// gráficos (posición de cada paintImageXObject vía la matriz CTM). La
// CLASIFICACIÓN (marcada o vacía) se hace renderizando la página completa a un
// canvas y leyendo los píxeles del recorte correspondiente a cada casilla, en
// vez de intentar resolver el bitmap original vía page.objs: algunas casillas
// viven dentro de grupos de gráficos anidados cuyos ids (p. ej. "g_d0_img_p1_1")
// nunca resuelven contra el registro de objetos de la página. Leer el render
// final evita depender de esa resolución interna — es exactamente lo que se ve.

import type {
  CheckboxDetectado,
  DocumentoExtraido,
  ItemTexto,
  PaginaExtraida,
} from "./types";
import { decodificarEntidadesHtml } from "./texto";

// Rango de tamaño (pt) que consideramos "casilla" al filtrar imágenes.
const CASILLA_MIN = 5;
const CASILLA_MAX = 18;
// Tolerancia vertical para considerar dos elementos "en la misma línea".
const TOLERANCIA_LINEA = 8;
// Escala de renderizado para el recorte de casillas: a mayor escala, más
// píxeles por casilla y clasificación más estable.
const ESCALA_RENDER = 4;

type Matriz = [number, number, number, number, number, number];

function multiplicar(a: Matriz, b: Matriz): Matriz {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

function aplicar(m: Matriz, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

interface ImagenColocada {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Proporción de píxeles oscuros (< 128 de luminancia) de un recorte RGBA de canvas. */
function ratioOscuroDeRecorte(pix: Uint8ClampedArray): number {
  let oscuro = 0;
  const total = pix.length / 4;
  if (!total) return 0;
  for (let i = 0; i < pix.length; i += 4) {
    const alpha = pix[i + 3];
    // Píxel transparente: no cuenta como marca (fondo).
    if (alpha < 40) continue;
    const v = (pix[i] + pix[i + 1] + pix[i + 2]) / 3;
    if (v < 128) oscuro++;
  }
  return total ? oscuro / total : 0;
}

/**
 * Reconstruye texto en orden de lectura: líneas por Y desc, items por X asc.
 *
 * El navegador real (a diferencia del build de Node usado para depurar)
 * suele partir un mismo token en varios ítems contiguos sin ningún hueco
 * real entre ellos — p. ej. "6057-26" llega como los ítems "6057-" y "26"
 * pegados, o "03/07/2026" como "03/", "07/" y "2026" pegados. Unir SIEMPRE
 * con un espacio (como antes) metía un espacio falso ahí ("6057- 26",
 * "03/ 07/ 2026"), rompiendo cualquier regex que no tolerara espacios entre
 * dígitos/símbolos (fechas, NEC, horas). Ahora solo se agrega un espacio
 * cuando hay un hueco horizontal real entre un ítem y el siguiente; si ya
 * están pegados, se concatenan tal cual (los espacios genuinos entre
 * palabras ya llegan como su propio ítem de texto " ").
 */
function construirTextoPlano(items: ItemTexto[]): string {
  const restantes = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lineas: ItemTexto[][] = [];

  for (const it of restantes) {
    const linea = lineas.find(
      (l) => Math.abs(l[0].y - it.y) <= TOLERANCIA_LINEA / 2 + 1
    );
    if (linea) linea.push(it);
    else lineas.push([it]);
  }

  return lineas
    .map((l) => {
      const ordenados = [...l].sort((a, b) => a.x - b.x);
      let texto = "";
      let finAnterior: number | null = null;
      for (const it of ordenados) {
        if (finAnterior !== null && it.x - finAnterior > 1) texto += " ";
        texto += it.str;
        finAnterior = it.x + it.w;
      }
      return texto;
    })
    .join("\n");
}

/** Asocia cada casilla con la opción de texto inmediata a su izquierda. */
function asociarOpciones(
  checkboxes: Omit<CheckboxDetectado, "opcion">[],
  items: ItemTexto[]
): CheckboxDetectado[] {
  return checkboxes.map((cb) => {
    const centroY = cb.y + cb.h / 2;
    const enLinea = items.filter(
      (it) => Math.abs(it.y - centroY) <= TOLERANCIA_LINEA && it.x < cb.x
    );
    // La opción es el item más a la derecha que quede a la izquierda de la casilla.
    let mejor: ItemTexto | null = null;
    for (const it of enLinea) {
      if (!mejor || it.x > mejor.x) mejor = it;
    }
    return { ...cb, opcion: mejor ? mejor.str.trim() : "" };
  });
}

/**
 * Extrae texto con coordenadas y casillas detectadas de un PDF digital.
 * Solo funciona en el navegador.
 */
export async function extraerDocumento(file: File): Promise<DocumentoExtraido> {
  if (typeof window === "undefined") {
    throw new Error("extraerDocumento solo funciona en el navegador");
  }

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const OPS = pdfjs.OPS;

  const paginas: PaginaExtraida[] = [];

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const contenido = await page.getTextContent();

    const items: ItemTexto[] = contenido.items
      .map((raw) => {
        const it = raw as {
          str?: string;
          transform?: number[];
          width?: number;
          height?: number;
          fontName?: string;
        };
        return {
          // Algunos FIEH traen entidades HTML sin decodificar (&quot; etc.),
          // arrastre del sistema origen. Se limpia aquí, en la fuente, para
          // que todo lo que viene después (texto plano, checkboxes, campos)
          // ya reciba el texto correcto.
          str: decodificarEntidadesHtml(it.str ?? ""),
          x: it.transform ? it.transform[4] : 0,
          y: it.transform ? it.transform[5] : 0,
          w: it.width ?? 0,
          h: it.height ?? 0,
          fontName: it.fontName ?? "",
        };
      })
      .filter((it) => it.str.trim() !== "");

    // Recorrer operadores para ubicar imágenes pequeñas (candidatas a casilla).
    // Solo se usa para POSICIÓN; la clasificación se hace luego sobre el render.
    const ops = await page.getOperatorList();
    let ctm: Matriz = [1, 0, 0, 1, 0, 0];
    const pila: Matriz[] = [];
    const imagenes: ImagenColocada[] = [];

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];

      if (fn === OPS.save) {
        pila.push([...ctm] as Matriz);
      } else if (fn === OPS.restore) {
        ctm = pila.pop() ?? [1, 0, 0, 1, 0, 0];
      } else if (fn === OPS.transform) {
        ctm = multiplicar(args as Matriz, ctm);
      } else if (fn === OPS.paintImageXObject || fn === OPS.paintImageMaskXObject) {
        const [x0, y0] = aplicar(ctm, 0, 0);
        const [x1, y1] = aplicar(ctm, 1, 1);
        const w = Math.abs(x1 - x0);
        const h = Math.abs(y1 - y0);
        if (w >= CASILLA_MIN && w <= CASILLA_MAX && h >= CASILLA_MIN && h <= CASILLA_MAX) {
          imagenes.push({ x: Math.min(x0, x1), y: Math.min(y0, y1), w, h });
        }
      }
    }

    // Renderizar la página completa una sola vez para clasificar las casillas
    // detectadas por su apariencia visual real (evita depender de page.objs).
    const viewport = page.getViewport({ scale: ESCALA_RENDER });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const ratiosCrudos: number[] = [];
    if (ctx) {
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;

      for (const im of imagenes) {
        // Esquinas de la casilla en espacio PDF → espacio de canvas (pdf.js
        // ya resuelve el volteo de eje Y y la escala con este helper).
        const [cx0, cy0] = viewport.convertToViewportPoint(im.x, im.y);
        const [cx1, cy1] = viewport.convertToViewportPoint(im.x + im.w, im.y + im.h);

        const left = Math.max(0, Math.floor(Math.min(cx0, cx1)));
        const top = Math.max(0, Math.floor(Math.min(cy0, cy1)));
        const right = Math.min(canvas.width, Math.ceil(Math.max(cx0, cx1)));
        const bottom = Math.min(canvas.height, Math.ceil(Math.max(cy0, cy1)));
        const w = right - left;
        const h = bottom - top;

        if (w <= 0 || h <= 0) {
          ratiosCrudos.push(0);
          continue;
        }

        const pix = ctx.getImageData(left, top, w, h).data;
        ratiosCrudos.push(ratioOscuroDeRecorte(pix));
      }
    }

    const min = ratiosCrudos.length ? Math.min(...ratiosCrudos) : 0;
    const max = ratiosCrudos.length ? Math.max(...ratiosCrudos) : 0;
    // Clasificación relativa cuando hay variación real entre casillas de la
    // misma página; umbral absoluto de respaldo si todas salen parecidas.
    const umbral = max - min >= 0.05 ? (max + min) / 2 : 0.5;

    const sinOpcion = imagenes.map((im, i) => ({
      x: im.x,
      y: im.y,
      w: im.w,
      h: im.h,
      objId: `pos_${n}_${i}`,
      ratioOscuro: ratiosCrudos[i] ?? 0,
      marcado: (ratiosCrudos[i] ?? 0) >= umbral,
    }));

    paginas.push({
      numero: n,
      items,
      checkboxes: asociarOpciones(sinOpcion, items),
      textoPlano: construirTextoPlano(items),
    });
  }

  try {
    await pdf.destroy();
  } catch {
    // El documento ya se procesó; ignorar fallos de limpieza.
  }

  return {
    paginas,
    textoCompleto: paginas.map((p) => p.textoPlano).join("\n"),
    numPaginas: paginas.length,
  };
}
