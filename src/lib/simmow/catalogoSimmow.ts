// Catálogos y mapeos hacia los valores que espera el formulario de SIMMOW.
// Portado de la herramienta original de Apps Script (FIEH_SIMMOW_HNES).

import { sinAcentos, limpiarDato } from "./texto";

// ─── Opciones para selects del formulario de revisión ───────────────────────

export const OPCIONES_TIPO_DOCUMENTO = [
  { valor: "1", etiqueta: "DUI del Paciente" },
  { valor: "2", etiqueta: "Pasaporte" },
  { valor: "3", etiqueta: "DUI del Responsable" },
] as const;

export const OPCIONES_TIPO_AFILIACION = [
  { valor: "1", etiqueta: "Cotizante ISSS" },
  { valor: "2", etiqueta: "Beneficiario ISSS" },
  { valor: "3", etiqueta: "Veterano de Guerra" },
  { valor: "4", etiqueta: "Cotizante ISBM" },
  { valor: "5", etiqueta: "Beneficiario ISBM" },
  { valor: "6", etiqueta: "Cotizante IPSFA" },
  { valor: "7", etiqueta: "Beneficiario IPSFA" },
] as const;

export const OPCIONES_TIPO_ACCIDENTE = [
  { valor: "1", etiqueta: "De Tránsito" },
  { valor: "2", etiqueta: "Laboral" },
] as const;

export const OPCIONES_CIRCUNSTANCIA_ALTA = [
  { valor: "1", etiqueta: "A Domicilio" },
  { valor: "2", etiqueta: "A otro Hospital" },
  { valor: "3", etiqueta: "A Residencia Social" },
  { valor: "4", etiqueta: "Voluntaria" },
  { valor: "5", etiqueta: "In Extremis" },
  { valor: "6", etiqueta: "Fuga" },
] as const;

export const OPCIONES_TIPO_CIRUGIA = [
  { valor: "1", etiqueta: "1 - Mayor Emergencia Hosp." },
  { valor: "3", etiqueta: "3 - Mayor Electiva Hosp." },
  { valor: "5", etiqueta: "5 - Menor" },
] as const;

export const OPCIONES_TIEMPO_INTERVALO = [
  "años",
  "meses",
  "dias",
  "horas",
  "minutos",
] as const;

/** Valores del select "Servicio Hospitalario" de SIMMOW (HNES). */
export const SERVICIOS_SIMMOW = [
  "MED.INTER.HOM.1",
  "MED.INTER.HOM.2",
  "MED.INTER.HOM.3",
  "MED.INTER.MUJ.1",
  "MED.INTER.MUJ.2",
  "MED.INTER.MUJ.3",
  "CARDIOLOGIA",
  "HEMATOLOGIA",
  "AISLAMIENTO",
  "ONCOLOGIA",
  "DOLOR Y CUIDADOS PALIATIVOS",
  "CIRUG.HOMBRES 1",
  "CIRUG.MUJERES 1",
  "CIRUGIA CARDIOVASCULAR",
  "NEUROCIRUGIA",
  "MEDICINA INTERNA D",
  "MEDICINA INTERNA E",
  "HOSPITALIZACION CONVENIO",
  "Terapia Intervencionista Endovascular",
  "DIALISIS PERITONEAL",
] as const;

// ─── Conversión de valores del FIEH a valores SIMMOW ────────────────────────

export function tipoDocumentoValor(tipo: string): string {
  const t = sinAcentos(tipo).toLowerCase();
  if (t.includes("pasaporte")) return "2";
  if (t.includes("responsable")) return "3";
  if (t.includes("dui") || t.includes("documento unico") || t.includes("identidad")) return "1";
  return "1";
}

export function tipoAfiliacionValor(tipo: string): string {
  const t = sinAcentos(tipo).toLowerCase();
  if (t.includes("isss") && t.includes("cotizante")) return "1";
  if (t.includes("isss") && t.includes("beneficiario")) return "2";
  if (t.includes("veterano")) return "3";
  if (t.includes("isbm") && t.includes("cotizante")) return "4";
  if (t.includes("isbm") && t.includes("beneficiario")) return "5";
  if (t.includes("ipsfa") && t.includes("cotizante")) return "6";
  if (t.includes("ipsfa") && t.includes("beneficiario")) return "7";
  return "";
}

export function tipoAccidenteValor(transito: string, laboral: string): string {
  if (/^SI$/i.test(String(transito || "").trim())) return "1";
  if (/^SI$/i.test(String(laboral || "").trim())) return "2";
  return "";
}

// ─── Mapeo Servicio Hospitalario FIEH → SIMMOW ──────────────────────────────

function paresServicioHospitalario(): [string, string][] {
  return [
    // Camas censables
    ["Medicina Interna Hombres 1", "MED.INTER.HOM.1"],
    ["Medicina Interna Hombres 2", "MED.INTER.HOM.2"],
    ["Medicina Interna Hombres 3", "MED.INTER.HOM.3"],
    ["Medicina Interna Mujeres 1", "MED.INTER.MUJ.1"],
    ["Medicina Interna Mujeres 2", "MED.INTER.MUJ.2"],
    ["Medicina Interna Mujeres 3", "MED.INTER.MUJ.3"],
    ["Hombres 1", "MED.INTER.HOM.1"],
    ["Hombres 2", "MED.INTER.HOM.2"],
    ["Hombres 3", "MED.INTER.HOM.3"],
    ["Mujeres 1", "MED.INTER.MUJ.1"],
    ["Mujeres 2", "MED.INTER.MUJ.2"],
    ["Mujeres 3", "MED.INTER.MUJ.3"],
    ["Servicio de Cardiologia", "CARDIOLOGIA"],
    ["Cardiologia", "CARDIOLOGIA"],
    ["Servicio de Hematologia", "HEMATOLOGIA"],
    ["Hematologia", "HEMATOLOGIA"],
    ["Servicio de Aislados", "AISLAMIENTO"],
    ["Aislados", "AISLAMIENTO"],
    ["Servicio de Oncologia", "ONCOLOGIA"],
    ["Oncologia", "ONCOLOGIA"],
    ["Dialisis Peritoneal", "DIALISIS PERITONEAL"],
    ["Dolor y cuidados Paliativos", "DOLOR Y CUIDADOS PALIATIVOS"],
    ["Cirugia hombres 1", "CIRUG.HOMBRES 1"],
    ["Cirugia mujeres 1", "CIRUG.MUJERES 1"],
    ["Cirugia cardiovascular", "CIRUGIA CARDIOVASCULAR"],
    ["Neurocirugia", "NEUROCIRUGIA"],
    ["Bienestar Magisterial", "HOSPITALIZACION CONVENIO"],

    // Áreas de transferencia
    ["Unidad de Cuidados Intensivos Aislados Adultos", "MEDICINA INTERNA D"],
    ["Unidad de Cuidados Intensivos Aislados", "MEDICINA INTERNA D"],
    ["Unidad de Cuidados Intensivos Quirurgicos Adultos", "MEDICINA INTERNA D"],
    ["Unidad de Cuidados Intensivos Quirurgicos", "MEDICINA INTERNA D"],
    ["Cuidados Intensivos Quirurgicos Adultos", "MEDICINA INTERNA D"],
    ["Unidad de Cuidados Intensivos General 1 Adultos", "MEDICINA INTERNA D"],
    ["Unidad de Cuidados Intensivos General 1", "MEDICINA INTERNA D"],
    ["Unidad de Cuidados Coronarios y Posquirurgicos Cardiovasculares", "MEDICINA INTERNA D"],
    ["Unidad de Cuidados Coronarios y Postquirurgicos Cardiovasculares", "MEDICINA INTERNA D"],
    ["Unidad de Cuidados Coronarios y Postquirurgicos Cardiovasculares UCCP", "MEDICINA INTERNA D"],
    ["Unidad de Cuidados Intensivos Extracorporea Adultos", "MEDICINA INTERNA D"],
    ["Unidad de Cuidados Intensivos Extracorporea", "MEDICINA INTERNA D"],
    ["Unidad de Cuidados Neurointensivos Adultos", "MEDICINA INTERNA D"],
    ["Unidad de Cuidados Neurointensivos", "MEDICINA INTERNA D"],
    ["Unidad de Cuidados Intensivos Cardiovascular Adultos", "MEDICINA INTERNA D"],
    ["Unidad de Cuidados Intensivos Cardiovascular", "MEDICINA INTERNA D"],
    ["Unidad de Cuidados Intermedios Adultos MINSAL", "MEDICINA INTERNA E"],
    ["Unidad de Cuidados Intermedios Adultos", "MEDICINA INTERNA E"],
    ["Unidad de Cuidados Intermedios Cronicos Adultos", "MEDICINA INTERNA E"],
    ["Unidad de Cuidados Intermedios Cronicos", "MEDICINA INTERNA E"],
    ["Unidad de Cuidados Intermedios Aislados Adultos", "MEDICINA INTERNA E"],
    ["Unidad de Cuidados Intermedios Aislados", "MEDICINA INTERNA E"],
    ["Unidad de Cuidados Intensivos Convenios ISBM", "HOSPITALIZACION CONVENIO"],
    ["Unidad de Cuidados Intermedios Convenios ISBM", "HOSPITALIZACION CONVENIO"],
    ["Unidad de Terapia Intervencionista Endovascular", "Terapia Intervencionista Endovascular"],

    // Sin mapeo definido por el momento (quedan para selección manual)
    ["Centro quirurgico quirofanos 3 endoscopia 2 y recuperacion 12", ""],
    ["Terapias sanguineas extracorporea", ""],
    ["Unidad de evaluacion y observacion medica", ""],
    ["Quimioterapia ambulatoria", ""],
  ];
}

export function normServicioHospitalario(txt: string): string {
  return sinAcentos(String(txt || ""))
    .toLowerCase()
    .replace(/&quot;/g, " ")
    .replace(/\bmed\s*\.?\s*inter\b/g, "medicina interna")
    .replace(/\bhom\s*\.?\b/g, "hombres")
    .replace(/\bmuj\s*\.?\b/g, "mujeres")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Respaldo por familia de servicio cuando el nombre no coincide exacto. */
export function inferirServicioPorPatron(txt: string): string {
  const s = normServicioHospitalario(txt);
  if (!s) return "";

  if (s.includes("dialisis peritoneal")) return "DIALISIS PERITONEAL";

  if (
    s.includes("centro quirurgico") ||
    s.includes("quirofanos") ||
    s.includes("endoscopia") ||
    s.includes("recuperacion")
  ) {
    return "";
  }
  if (s.includes("terapias sanguineas extracorporea")) return "";
  if (s.includes("evaluacion") && s.includes("observacion") && s.includes("medica")) return "";
  if (s.includes("quimioterapia ambulatoria")) return "";

  if (s.includes("terapia intervencionista endovascular")) {
    return "Terapia Intervencionista Endovascular";
  }
  if (
    s.includes("convenio") ||
    s.includes("isbm") ||
    s.includes("bienestar magisterial")
  ) {
    return "HOSPITALIZACION CONVENIO";
  }
  if (s.includes("dolor") && s.includes("cuidados") && s.includes("paliativos")) {
    return "DOLOR Y CUIDADOS PALIATIVOS";
  }
  if (s.includes("cuidados intermedios")) return "MEDICINA INTERNA E";
  if (
    s.includes("cuidados intensivos") ||
    s.includes("neurointensivos") ||
    s.includes("cuidados coronarios") ||
    s.includes("extracorporea") ||
    (s.includes("cuidados") && s.includes("cardiovascular"))
  ) {
    return "MEDICINA INTERNA D";
  }

  return "";
}

const MAPA_SERVICIOS: Record<string, string> = (() => {
  const mapa: Record<string, string> = {};
  paresServicioHospitalario().forEach(([origen, destino]) => {
    mapa[normServicioHospitalario(origen)] = destino;
  });
  return mapa;
})();

export function mapearServicioSIMMOW(servicioFieh: string): string {
  const servicioNorm = normServicioHospitalario(servicioFieh);
  if (!servicioNorm) return "";

  // 1. Coincidencia exacta.
  if (Object.prototype.hasOwnProperty.call(MAPA_SERVICIOS, servicioNorm)) {
    return MAPA_SERVICIOS[servicioNorm];
  }

  // 2. Coincidencia flexible (contención en cualquier dirección).
  const claves = Object.keys(MAPA_SERVICIOS)
    .filter((k) => k.length >= 8)
    .sort((a, b) => b.length - a.length);

  for (const clave of claves) {
    if (servicioNorm.includes(clave) || clave.includes(servicioNorm)) {
      return MAPA_SERVICIOS[clave];
    }
  }

  // 3. Respaldo por familia.
  return inferirServicioPorPatron(servicioFieh);
}

export interface ServicioHallado {
  idx: number;
  fin: number;
  origen: string;
  valor: string;
  clave: string;
}

/** Encuentra menciones de servicios conocidos dentro de un texto libre. */
export function buscarServiciosConocidosEnTexto(texto: string): ServicioHallado[] {
  const base = normServicioHospitalario(texto);
  const hallazgos: ServicioHallado[] = [];

  paresServicioHospitalario().forEach(([origen, destino]) => {
    const clave = normServicioHospitalario(origen);
    if (!clave || clave.length < 6) return;

    const idx = base.indexOf(clave);
    if (idx >= 0) {
      hallazgos.push({ idx, fin: idx + clave.length, origen, valor: destino, clave });
    }
  });

  hallazgos.sort((a, b) => (a.idx !== b.idx ? a.idx - b.idx : b.clave.length - a.clave.length));

  const limpios: ServicioHallado[] = [];
  hallazgos.forEach((h) => {
    const seCruza = limpios.some((x) => !(h.fin <= x.idx || h.idx >= x.fin));
    if (!seCruza) limpios.push(h);
  });

  if (limpios.length) return limpios;

  // Respaldo por patrón cuando ningún nombre del mapeo coincide.
  const valorInferido = inferirServicioPorPatron(texto);
  if (valorInferido) {
    return [
      {
        idx: 0,
        fin: base.length,
        origen: limpiarDato(texto).slice(0, 80),
        valor: valorInferido,
        clave: "PATRON_" + valorInferido,
      },
    ];
  }

  return [];
}
