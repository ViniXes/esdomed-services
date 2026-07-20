// Helpers de texto compartidos por los extractores y el generador.
// Portados de la herramienta original de Apps Script (FIEH_SIMMOW_HNES).

export function sinAcentos(txt: string): string {
  return String(txt || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function limpiarDato(txt: string): string {
  return String(txt || "")
    .replace(/\s+/g, " ")
    .replace(/^[:\-\s]+/, "")
    .replace(/[:\-\s]+$/, "")
    .trim();
}

export function limpiarNA(txt: string): string {
  const v = limpiarDato(txt);
  if (!v) return "";
  if (/^(N\/A|NA|NO APLICA|_+)$/i.test(v)) return "";
  return v;
}

export function soloNumeros(txt: string): string {
  return String(txt || "").replace(/\D/g, "");
}

export function mayus(txt: string): string {
  return String(txt || "").toUpperCase().trim();
}

export function pad2(n: string | number): string {
  return String(n || "").padStart(2, "0");
}

export function cortar(txt: string, max: number): string {
  const v = String(txt || "");
  return v.length > max ? v.slice(0, max) : v;
}

export function convertirHora24(hora: string, ampm?: string): string {
  let h = parseInt(hora, 10);
  const mer = String(ampm || "").toUpperCase();
  if (mer === "PM" && h < 12) h += 12;
  if (mer === "AM" && h === 12) h = 0;
  return pad2(h);
}

export function normalizarCodigoCIE(cod: string): string {
  return String(cod || "")
    .replace(/\s+/g, "")
    .replace(",", ".")
    .toUpperCase()
    .trim();
}

/** Corrige códigos sin punto (R651 → R65.1) y normaliza separadores. */
export function normalizarCodigoCIEConPunto(cod: string): string {
  let c = normalizarCodigoCIE(cod);
  if (/^[A-Z]\d{3,4}$/.test(c)) {
    c = c.slice(0, 3) + "." + c.slice(3);
  }
  return c;
}

/** Para SIMMOW los números de documento/afiliación van solo con dígitos. */
export function limpiarNumeroIdentificacionSIMMOW(txt: string): string {
  const original = String(txt || "").trim();
  if (!original) return "";

  const normal = sinAcentos(original).toUpperCase().replace(/\s+/g, "");
  if (["N/A", "NA", "N", "NOAPLICA", "SINNUMERO", "SN"].includes(normal)) {
    return "";
  }

  const soloDigitos = original.replace(/\D/g, "");
  return soloDigitos || "";
}

/** Divide apellidos/nombres respetando partículas (DE, DEL, DE LA/LAS/LOS). */
export function dividirNombre(txt: string): string[] {
  const palabras = limpiarDato(txt)
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  const partes: string[] = [];

  for (let i = 0; i < palabras.length; i++) {
    const actual = palabras[i];
    const siguiente = palabras[i + 1] || "";
    const tercero = palabras[i + 2] || "";

    if (actual === "DE" && ["LA", "LAS", "LOS"].includes(siguiente)) {
      if (tercero) {
        partes.push(`${actual} ${siguiente} ${tercero}`);
        i += 2;
      } else {
        partes.push(`${actual} ${siguiente}`);
        i += 1;
      }
      continue;
    }

    if ((actual === "DE" || actual === "DEL") && siguiente) {
      partes.push(`${actual} ${siguiente}`);
      i += 1;
      continue;
    }

    partes.push(actual);
  }

  return partes;
}

/** Dirección apta para SIMMOW: sin acentos, mayúsculas, solo alfanumérico y Ñ. */
export function limpiarDireccionParaSIMMOW(txt: string): string {
  return sinAcentos(String(txt || ""))
    .toUpperCase()
    .replace(/[^A-ZÑ0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buscar(texto: string, regex: RegExp): string {
  const m = String(texto || "").match(regex);
  return m ? limpiarDato(m[1]) : "";
}
