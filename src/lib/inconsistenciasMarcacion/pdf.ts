// Extracción del texto del PDF del reporte de descuentos (lazy import de
// pdfjs-dist, solo cliente). Devuelve cada fragmento en coordenadas de la página
// TAL COMO SE VE: el reporte es apaisado vía /Rotate 90, así que las coordenadas
// crudas del PDF (sin rotar) no sirven para armar filas; el viewport las rota.

import type { PDFDocumentProxy } from "pdfjs-dist";
import type { ItemPdf } from "./parser";

/** Texto ubicado de cada página de un documento ya abierto. */
export async function itemsDeDocumento(pdf: PDFDocumentProxy): Promise<ItemPdf[][]> {
  const paginas: ItemPdf[][] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const contenido = await page.getTextContent();
    const items: ItemPdf[] = [];
    for (const raw of contenido.items) {
      const it = raw as { str?: string; transform?: number[] };
      if (!it.str?.trim() || !it.transform) continue;
      const [x, y] = viewport.convertToViewportPoint(it.transform[4], it.transform[5]);
      items.push({ str: it.str, x, y });
    }
    paginas.push(items);
  }
  return paginas;
}

/** Abre el PDF en el navegador y devuelve su texto ubicado por página. */
export async function extraerItemsPdf(file: File): Promise<ItemPdf[][]> {
  if (typeof window === "undefined") {
    throw new Error("extraerItemsPdf solo funciona en el navegador");
  }
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    return await itemsDeDocumento(pdf);
  } finally {
    void pdf.destroy();
  }
}
