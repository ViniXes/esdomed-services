// Extracción del Certificado de Defunción: numeral 13 (causas de defunción
// a, b, c, causa básica d) y numeral "II. Otros estados patológicos" (e, f).
// Port de la herramienta original de Apps Script, simplificado porque el
// texto ya no viene de OCR: las capas de "corrección" que existían solo para
// compensar ruido de OCR (código e intervalo separados, líneas partidas) ya
// no aplican sobre el texto digital del certificado (wkhtmltopdf).

import type {
  CampoSimmow,
  DatosSimmow,
  DocumentoExtraido,
  ResultadoExtraccion,
} from "./types";
import { datosVacios } from "./types";
import { limpiarDato, normalizarCodigoCIEConPunto, sinAcentos } from "./texto";

export function esCertificado(textoCompleto: string): boolean {
  const t = sinAcentos(textoCompleto);
  return (
    /CERTIFICADO\s+DE\s+DEFUNCI[OÓ]N/i.test(t) ||
    /CAUSA\s+DE\s+DEFUNCI[OÓ]N/i.test(t)
  );
}

interface CausaCertificado {
  texto: string;
  codigo: string;
  intervalo: string;
  tiempo: string;
}

const CIE = "([A-Z]\\s*\\d\\s*\\d(?:\\s*[.,]\\s*\\d{1,2})?)";
const UNIDAD =
  "(a[nñ]o\\(s\\)|a[nñ]os?|mes\\(es\\)|meses?|dia\\(s\\)|dias?|hora\\(s\\)|horas?|minuto\\(s\\)|minutos?)";

function normalizarTiempo(unidadTxt: string): string {
  const u = sinAcentos(String(unidadTxt || "").toLowerCase());
  if (u.includes("ano")) return "años";
  if (u.includes("mes")) return "meses";
  if (u.includes("dia")) return "dias";
  if (u.includes("hora")) return "horas";
  if (u.includes("minuto")) return "minutos";
  return "";
}

/** Recorta el texto de una causa en la siguiente marca de letra/sección. */
function limpiarTextoCausa(txt: string): string {
  let v = String(txt || "");
  // Corta si el OCR (ya no aplica, pero por seguridad) mezcla la siguiente causa.
  v = v.replace(/\s+\(?[abcd]\)?\s*[A-Z]\s*\d\s*\d(?:\s*[.,]\s*\d{1,2})?[\s\S]*$/i, "");
  v = v.replace(/\s+\(?[abcd]\)?\s*[\s\S]*$/i, "");
  return limpiarDato(
    v
      .replace(/\bCodigo\b/gi, "")
      .replace(/\bCIE[- ]?10\b/gi, "")
      .replace(/\bIntervalo\b/gi, "")
      .replace(/\bDebido\s+a\b/gi, "")
      .replace(/\bcomo\s+consecuencia\s+de\b/gi, "")
      .replace(/\(\s*o\s*\)/gi, "")
      .replace(/\bCAUSA\s+BASICA\b/gi, "")
      .replace(/\s+/g, " ")
  );
}

function causaVacia(): CausaCertificado {
  return { texto: "", codigo: "", intervalo: "", tiempo: "" };
}

/** Extrae las causas a, b, c, d (numeral 13) y e, f (numeral II) del certificado. */
function extraerCausas(textoCompleto: string): Record<"a" | "b" | "c" | "d" | "e" | "f", CausaCertificado> {
  const res = {
    a: causaVacia(),
    b: causaVacia(),
    c: causaVacia(),
    d: causaVacia(),
    e: causaVacia(),
    f: causaVacia(),
  };

  const base = sinAcentos(textoCompleto).replace(/\r/g, "\n").replace(/\t/g, " ");

  const bloqueMatch = base.match(
    /13\.?\s*CAUSA\s+DE\s+DEFUNCION([\s\S]*?)(?:II\.?\s*Otros\s+estados|8\.\s*Edad|14\.|MUERTE\s+ACCIDENTAL|ASISTENCIA|$)/i
  );
  const bloque = (bloqueMatch ? bloqueMatch[1] : base)
    .replace(/\n+/g, " ")
    .replace(/[ ]+/g, " ")
    .trim();

  (["a", "b", "c", "d"] as const).forEach((letra) => {
    const patron = new RegExp(
      "\\(\\s*" +
        letra +
        "\\s*\\)\\s*" +
        CIE +
        "\\s*[-–:]?\\s*" +
        "([\\s\\S]{0,450}?)\\s+(\\d+)\\s*" +
        UNIDAD,
      "i"
    );
    const m = bloque.match(patron);
    if (!m) return;

    res[letra] = {
      codigo: normalizarCodigoCIEConPunto(m[1]),
      texto: limpiarTextoCausa(m[2]),
      intervalo: String(m[3] || "").trim(),
      tiempo: normalizarTiempo(m[4]),
    };
  });

  // Otros estados patológicos (sección II) → Otro Estado Patológico 1 y 2.
  const otrosMatch = base.match(
    /II\.?\s*Otros\s+estados\s+patologicos([\s\S]*?)(?:8\.?\s*Edad|14\.|MUERTE\s+ACCIDENTAL|ASISTENCIA|$)/i
  );
  const bloqueOtros = (otrosMatch ? otrosMatch[1] : "")
    .replace(/\n+/g, " ")
    .replace(/[ ]+/g, " ")
    .trim();

  const patronOtros = new RegExp(
    CIE + "\\s*[-–:]?\\s*([\\s\\S]{0,300}?)\\s+(\\d+)\\s*" + UNIDAD,
    "gi"
  );

  const otros: CausaCertificado[] = [];
  let m: RegExpExecArray | null;
  while ((m = patronOtros.exec(bloqueOtros)) !== null) {
    const codigo = normalizarCodigoCIEConPunto(m[1]);
    if (!/^[A-Z]\d{2}(?:\.\d{1,2})?$/.test(codigo)) continue;
    otros.push({
      codigo,
      texto: limpiarTextoCausa(m[2]),
      intervalo: String(m[3] || "").trim(),
      tiempo: normalizarTiempo(m[4]),
    });
    if (otros.length >= 2) break;
  }

  if (otros[0]) res.e = otros[0];
  if (otros[1]) res.f = otros[1];

  return res;
}

const CAMPOS_CERT: Record<
  "a" | "b" | "c" | "d" | "e" | "f",
  { texto: CampoSimmow; codigo: CampoSimmow; intervalo: CampoSimmow; tiempo: CampoSimmow }
> = {
  a: {
    texto: "CERT_CAUSA_A_TEXTO",
    codigo: "CERT_CAUSA_A_CODIGO",
    intervalo: "CERT_CAUSA_A_INTERVALO",
    tiempo: "CERT_CAUSA_A_TIEMPO",
  },
  b: {
    texto: "CERT_CAUSA_B_TEXTO",
    codigo: "CERT_CAUSA_B_CODIGO",
    intervalo: "CERT_CAUSA_B_INTERVALO",
    tiempo: "CERT_CAUSA_B_TIEMPO",
  },
  c: {
    texto: "CERT_CAUSA_C_TEXTO",
    codigo: "CERT_CAUSA_C_CODIGO",
    intervalo: "CERT_CAUSA_C_INTERVALO",
    tiempo: "CERT_CAUSA_C_TIEMPO",
  },
  d: {
    texto: "CERT_CAUSA_BASICA_D_TEXTO",
    codigo: "CERT_CAUSA_BASICA_D_CODIGO",
    intervalo: "CERT_CAUSA_BASICA_D_INTERVALO",
    tiempo: "CERT_CAUSA_BASICA_D_TIEMPO",
  },
  e: {
    texto: "CERT_OTRO_ESTADO_1_TEXTO",
    codigo: "CERT_OTRO_ESTADO_1_CODIGO",
    intervalo: "CERT_OTRO_ESTADO_1_INTERVALO",
    tiempo: "CERT_OTRO_ESTADO_1_TIEMPO",
  },
  f: {
    texto: "CERT_OTRO_ESTADO_2_TEXTO",
    codigo: "CERT_OTRO_ESTADO_2_CODIGO",
    intervalo: "CERT_OTRO_ESTADO_2_INTERVALO",
    tiempo: "CERT_OTRO_ESTADO_2_TIEMPO",
  },
};

const CAMPOS_CERT_LISTA: CampoSimmow[] = Object.values(CAMPOS_CERT).flatMap((c) => [
  c.texto,
  c.codigo,
  c.intervalo,
  c.tiempo,
]);

/**
 * Copia SOLO los campos CERT_* de `datosCert` sobre una copia de `base`.
 * `extraerCertificado` devuelve un `DatosSimmow` completo (vía `datosVacios()`)
 * con el resto de campos vacíos, así que nunca se debe hacer un spread directo
 * de ese resultado sobre los datos del FIEH — pisaría todo lo demás con "".
 */
export function fusionarCertificado(base: DatosSimmow, datosCert: DatosSimmow): DatosSimmow {
  const resultado = { ...base } as unknown as Record<string, string>;
  const origen = datosCert as unknown as Record<string, string>;
  for (const campo of CAMPOS_CERT_LISTA) {
    resultado[campo] = origen[campo];
  }
  return resultado as unknown as DatosSimmow;
}

/** Extrae las causas de defunción del Certificado y las mapea a los campos CERT_*. */
export function extraerCertificado(doc: DocumentoExtraido): ResultadoExtraccion {
  const advertencias: string[] = [];
  const camposNoEncontrados: CampoSimmow[] = [];
  const datos: DatosSimmow = datosVacios();

  const causas = extraerCausas(doc.textoCompleto);
  const datosPlanos = datos as unknown as Record<string, string>;

  (["a", "b", "c", "d", "e", "f"] as const).forEach((letra) => {
    const campos = CAMPOS_CERT[letra];
    const causa = causas[letra];
    datosPlanos[campos.texto] = causa.texto;
    datosPlanos[campos.codigo] = causa.codigo;
    datosPlanos[campos.intervalo] = causa.intervalo;
    datosPlanos[campos.tiempo] = causa.tiempo;
  });

  if (!causas.d.codigo) {
    advertencias.push(
      "No se detectó la Causa Básica (d) en el certificado. Revise manualmente el numeral 13."
    );
    camposNoEncontrados.push("CERT_CAUSA_BASICA_D_CODIGO");
  }
  if (!causas.a.codigo) {
    advertencias.push("No se detectó la Causa (a) en el certificado. Revise manualmente.");
    camposNoEncontrados.push("CERT_CAUSA_A_CODIGO");
  }

  return { datos, advertencias, camposNoEncontrados };
}

/** Limpia los campos CERT_* (usado cuando la condición es VIVO). */
export function limpiarCamposCertificado(datos: DatosSimmow): DatosSimmow {
  const datosPlanos = datos as unknown as Record<string, string>;
  (["a", "b", "c", "d", "e", "f"] as const).forEach((letra) => {
    const campos = CAMPOS_CERT[letra];
    datosPlanos[campos.texto] = "";
    datosPlanos[campos.codigo] = "";
    datosPlanos[campos.intervalo] = "";
    datosPlanos[campos.tiempo] = "";
  });
  return datos;
}
