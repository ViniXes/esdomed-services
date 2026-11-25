// Adjuntos de una gestión de Trabajo Social de Consulta Externa: el respaldo de
// lo que se hizo (constancia, referencia, comprobante, foto de un documento).
//
// Son documentos de pacientes, así que van cerrados como el resto del módulo:
// se guardan en `consulta_externa_ts/{gestión}/…`, una carpeta que las reglas de
// Storage no abren a ningún navegador. Se suben y se abren solo por la API (con
// un enlace firmado que vence en minutos).
//
// Pura: la usan la API, la pantalla y scripts/test-trabajo-social-ce.mjs.

import type { Resultado } from "./trabajoSocial";

export const CARPETA_ADJUNTOS = "consulta_externa_ts";
/** El archivo viaja por la API y Vercel corta las peticiones de más de 4.5 MB. */
export const MAX_ADJUNTO_BYTES = 4 * 1024 * 1024;
export const MAX_ADJUNTOS = 10;

export type ClaseAdjunto = "pdf" | "imagen" | "word" | "excel";

export interface AdjuntoTS {
  id: string;
  nombre: string;
  /** Tipo MIME con que se guardó (lo decide el servidor, no el navegador). */
  tipo: string;
  clase: ClaseAdjunto;
  tamano: number;
  subidoPor: string;
  subidoPorNombre: string;
  subidoEnMs: number;
}

type Firma = "pdf" | "jpg" | "png" | "webp" | "zip" | "ole";
interface Formato { ext: string[]; mime: string; clase: ClaseAdjunto; firma: Firma; nombre: string }

const FORMATOS: Formato[] = [
  { ext: ["pdf"], mime: "application/pdf", clase: "pdf", firma: "pdf", nombre: "PDF" },
  { ext: ["jpg", "jpeg"], mime: "image/jpeg", clase: "imagen", firma: "jpg", nombre: "imagen JPG" },
  { ext: ["png"], mime: "image/png", clase: "imagen", firma: "png", nombre: "imagen PNG" },
  { ext: ["webp"], mime: "image/webp", clase: "imagen", firma: "webp", nombre: "imagen WEBP" },
  { ext: ["docx"], mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", clase: "word", firma: "zip", nombre: "documento de Word" },
  { ext: ["doc"], mime: "application/msword", clase: "word", firma: "ole", nombre: "documento de Word" },
  { ext: ["odt"], mime: "application/vnd.oasis.opendocument.text", clase: "word", firma: "zip", nombre: "documento de texto" },
  { ext: ["xlsx"], mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", clase: "excel", firma: "zip", nombre: "libro de Excel" },
  { ext: ["xls"], mime: "application/vnd.ms-excel", clase: "excel", firma: "ole", nombre: "libro de Excel" },
];

/** Para el selector de archivos. Con los tipos de imagen, el celular ofrece tomar la foto. */
export const ACEPTA_ADJUNTOS = [...FORMATOS.flatMap((f) => f.ext.map((e) => `.${e}`)), "image/jpeg", "image/png", "image/webp"].join(",");
export const FORMATOS_TEXTO = "PDF, imágenes, Word o Excel";

export const CLASE_LABEL: Record<ClaseAdjunto, string> = { pdf: "PDF", imagen: "Imagen", word: "Word", excel: "Excel" };

const empieza = (b: Uint8Array, firma: number[], desde = 0) => firma.every((x, i) => b[desde + i] === x);
// Los primeros bytes dicen qué es el archivo de verdad, sin importar cómo se llame.
const FIRMAS: Record<Firma, (b: Uint8Array) => boolean> = {
  // El %PDF puede venir tras unos bytes de basura; la norma lo admite en el primer kilobyte.
  pdf: (b) => { for (let i = 0; i + 4 <= Math.min(b.length, 1024); i++) if (empieza(b, [0x25, 0x50, 0x44, 0x46], i)) return true; return false; },
  jpg: (b) => empieza(b, [0xff, 0xd8, 0xff]),
  png: (b) => empieza(b, [0x89, 0x50, 0x4e, 0x47]),
  webp: (b) => empieza(b, [0x52, 0x49, 0x46, 0x46]) && empieza(b, [0x57, 0x45, 0x42, 0x50], 8),
  zip: (b) => empieza(b, [0x50, 0x4b, 0x03, 0x04]),
  ole: (b) => empieza(b, [0xd0, 0xcf, 0x11, 0xe0]),
};

/** "1.2 MB", "340 KB". */
export function tamanoTexto(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** El nombre como se muestra: sin carpetas ni caracteres de control. */
function nombreLimpio(nombre: unknown): string {
  const base = String(nombre ?? "").split(/[\\/]/).pop() ?? "";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(-120);
}

/** Dónde queda en Storage: solo letras, números, punto y guiones, para que la ruta nunca dé sorpresas. */
export function rutaAdjunto(gestionId: string, adjuntoId: string, nombre: string): string {
  const seguro = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "archivo";
  return `${CARPETA_ADJUNTOS}/${gestionId}/${adjuntoId}_${seguro}`;
}

export interface AdjuntoValido { nombre: string; mime: string; clase: ClaseAdjunto }

/**
 * Qué se acepta. La pantalla la llama sin `cabecera` (extensión y tamaño, para
 * avisar antes de subir); la API, con los primeros bytes: así un archivo con la
 * extensión cambiada no entra.
 */
export function validarAdjunto(nombre: unknown, tamano: number, cabecera?: Uint8Array): Resultado<AdjuntoValido> {
  const limpio = nombreLimpio(nombre);
  const ext = limpio.includes(".") ? limpio.split(".").pop()!.toLowerCase() : "";
  const formato = FORMATOS.find((f) => f.ext.includes(ext));
  if (!limpio || !formato) return { ok: false, error: `Ese tipo de archivo no se admite. Se aceptan ${FORMATOS_TEXTO}.` };
  if (!(tamano > 0)) return { ok: false, error: "El archivo está vacío." };
  if (tamano > MAX_ADJUNTO_BYTES) return { ok: false, error: `Pesa ${tamanoTexto(tamano)} y el máximo es ${tamanoTexto(MAX_ADJUNTO_BYTES)}.` };
  if (cabecera && !FIRMAS[formato.firma](cabecera)) return { ok: false, error: `El archivo no es un ${formato.nombre} (está dañado o tiene la extensión cambiada).` };
  return { ok: true, datos: { nombre: limpio, mime: formato.mime, clase: formato.clase } };
}

/** PDF e imágenes se abren en el navegador; lo demás se descarga. */
export const seAbreEnNavegador = (clase: ClaseAdjunto): boolean => clase === "pdf" || clase === "imagen";
