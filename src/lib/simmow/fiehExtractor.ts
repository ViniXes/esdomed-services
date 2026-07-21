// Extracción de campos del FIEH (Formulario de Ingreso y Egreso Hospitalario).
// Port de la herramienta original de Apps Script, adaptado a texto digital
// (sin los parches anti-ruido de OCR) y con lectura REAL de casillas:
// condición de egreso, circunstancia de alta y cirugía suspendida se resuelven
// por las casillas marcadas del PDF, no adivinando sobre texto.

import type {
  CampoSimmow,
  DatosSimmow,
  DocumentoExtraido,
  ResultadoExtraccion,
} from "./types";
import { datosVacios } from "./types";
import {
  buscar,
  convertirHora24,
  dividirNombre,
  limpiarDato,
  limpiarDireccionParaSIMMOW,
  limpiarNA,
  normalizarCodigoCIE,
  pad2,
  sinAcentos,
  soloNumeros,
} from "./texto";
import {
  buscarServiciosConocidosEnTexto,
  inferirServicioPorPatron,
  mapearServicioSIMMOW,
  normServicioHospitalario,
  tipoAccidenteValor,
  tipoAfiliacionValor,
  tipoDocumentoValor,
} from "./catalogoSimmow";
import { buscarItem, checkboxesEnLinea, leerCeldaMultilinea } from "./layout";

// ─── Detección de tipo de documento ─────────────────────────────────────────

export function esFieh(textoCompleto: string): boolean {
  const t = sinAcentos(textoCompleto);
  return (
    /FORMULARIO\s+DE\s+INGRESO\s+Y\s+EGRESO/i.test(t) ||
    (/NEC\s*:/i.test(t) && /DATOS\s+DEL\s+INGRESO/i.test(t))
  );
}

// ─── Campos por casillas ────────────────────────────────────────────────────

function condicionPorCheckbox(doc: DocumentoExtraido): "" | "VIVO" | "MUERTO" {
  const etiqueta = buscarItem(doc, /^Condicion de\b/i);
  if (!etiqueta) return "";

  const marcadas = checkboxesEnLinea(etiqueta.pagina, etiqueta.item.y).filter(
    (cb) => cb.marcado
  );
  for (const cb of marcadas) {
    const op = sinAcentos(cb.opcion).toLowerCase();
    if (op === "vivo") return "VIVO";
    if (op === "muerto") return "MUERTO";
  }
  return "";
}

function circunstanciaAltaPorCheckbox(doc: DocumentoExtraido): string {
  const etiqueta = buscarItem(doc, /Circunstancia de alta/i);
  if (!etiqueta) return "";

  const marcadas = checkboxesEnLinea(etiqueta.pagina, etiqueta.item.y).filter(
    (cb) => cb.marcado
  );
  for (const cb of marcadas) {
    const op = sinAcentos(cb.opcion).toLowerCase();
    if (op.includes("domicilio") || op.includes("destino")) return "1";
    if (op.includes("referido") || op.includes("hospital")) return "2";
    if (op.includes("residencia")) return "3";
    if (op.includes("voluntaria") || op === "alta") return "4";
    if (op.includes("extremis") || op.includes("morir en casa")) return "5";
    if (op.includes("fuga")) return "6";
  }
  return "";
}

function cirugiaSuspendidaPorCheckbox(doc: DocumentoExtraido): string {
  const etiqueta = buscarItem(doc, /Se suspendio cirugia programada/i);
  if (!etiqueta) return "";

  const marcadas = checkboxesEnLinea(etiqueta.pagina, etiqueta.item.y).filter(
    (cb) => cb.marcado
  );
  for (const cb of marcadas) {
    const op = sinAcentos(cb.opcion).toUpperCase();
    if (op === "SI") return "SI";
    if (op === "NO") return "";
  }
  return "";
}

/** Limpia el nombre del establecimiento de la sección E (comillas, comas, N/A). */
function limpiarNombreEstablecimiento(txt: string): string {
  const sinComillas = txt.replace(/["“”]/g, "").replace(/,/g, " ");
  return limpiarNA(limpiarDato(sinComillas));
}

/**
 * Sección E (Seguimiento de paciente a su egreso): un único nombre de
 * establecimiento se reparte entre "Referido al Establecimiento" o "Retorno
 * hacia" en SIMMOW según cuál casilla ("Referencia" / "Retorno") esté
 * marcada junto a él. El nombre puede envolver a una segunda línea.
 */
function referidoRetornoSeguimientoPorCheckbox(
  doc: DocumentoExtraido
): { referidoA: string; retorno: string } {
  const vacio = { referidoA: "", retorno: "" };

  const etiquetaEstablecimiento = buscarItem(doc, /Nombre\s+establecimiento:/i);
  if (!etiquetaEstablecimiento) return vacio;

  const celda = leerCeldaMultilinea(
    etiquetaEstablecimiento.pagina,
    etiquetaEstablecimiento.item,
    /^Recomendaciones:/i
  );
  const nombreEstablecimiento = limpiarNombreEstablecimiento(
    celda.replace(/Nombre\s+establecimiento:\s*/i, "")
  );
  if (!nombreEstablecimiento) return vacio;

  const marcadas = checkboxesEnLinea(
    etiquetaEstablecimiento.pagina,
    etiquetaEstablecimiento.item.y
  )
    .filter((cb) => cb.marcado)
    .map((cb) => sinAcentos(cb.opcion).toLowerCase());

  return {
    referidoA: marcadas.some((op) => op.includes("referencia")) ? nombreEstablecimiento : "",
    retorno: marcadas.some((op) => op.includes("retorno")) ? nombreEstablecimiento : "",
  };
}

// ─── Edad ───────────────────────────────────────────────────────────────────

function extraerEdad(plano: string): { anios: string; meses: string; dias: string } {
  const resultado = { anios: "", meses: "", dias: "" };

  const mBloque = plano.match(/Edad\s*:?\s*(.*?)\s*Sexo\s*:/i);
  let bloque = mBloque ? mBloque[1] : "";
  if (!bloque) {
    const m = plano.match(/Edad\s*:?\s*(.{0,80})/i);
    bloque = m ? m[1] : "";
  }

  let texto = sinAcentos(bloque)
    .replace(/,/g, " ")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  texto = texto
    .replace(/\ba\s*nos?\b/g, "anos")
    .replace(/\banos?\b/g, "anos")
    .replace(/\bmes\b/g, "meses")
    .replace(/\bdia\b/g, "dias");

  const mAnio = texto.match(/(\d+)\s*anos?/i);
  const mMes = texto.match(/(\d+)\s*meses?/i);
  const mDia = texto.match(/(\d+)\s*dias?/i);

  if (mAnio) resultado.anios = mAnio[1];
  if (mMes) resultado.meses = mMes[1];
  if (mDia) resultado.dias = mDia[1];

  if (!resultado.anios && !resultado.meses && !resultado.dias) {
    const nums = texto.match(/\d+/g) || [];
    resultado.anios = nums[0] || "";
    resultado.meses = nums[1] || "";
    resultado.dias = nums[2] || "";
  }

  return resultado;
}

// ─── Referido del establecimiento ───────────────────────────────────────────

function extraerReferidoDelEstablecimiento(plano: string): string {
  const m = plano.match(
    /Nombre\s+del\s+establecimiento\s*\(?\s*referido\s+de\s*:?\)?\s*([\s\S]*?)(?:\s+C[oó]digo\s+UCSF\s*:|\s+Motivo\s+de\s+la\s+referencia\s*:|\s+B\.?\s*DATOS\s+DEL\s+INGRESO|$)/i
  );
  if (!m) return "";

  let valor = limpiarDato(m[1])
    .replace(/\bC[oó]digo\s+UCSF\b[\s\S]*$/i, "")
    .replace(/\bMotivo\s+de\s+la\s+referencia\b[\s\S]*$/i, "")
    .replace(/\bB\.?\s*DATOS\s+DEL\s+INGRESO\b[\s\S]*$/i, "");
  valor = limpiarDato(valor);
  if (!valor) return "";

  const normal = sinAcentos(valor).toUpperCase().replace(/\s+/g, "").trim();
  if (
    ["N/A", "NA", "N", "NOAPLICA", "SINREFERENCIA", "NINGUNO"].includes(normal) ||
    /^_+$/.test(normal) ||
    /^-+$/.test(normal)
  ) {
    return "";
  }
  return valor;
}

// ─── Servicio hospitalario ──────────────────────────────────────────────────

function serialFechaHora(fecha: string, hora: string): number {
  const f = String(fecha || "").trim().replace(/-/g, "/");
  const h = String(hora || "").trim();

  const mf = f.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  const mh = h.match(/^(\d{1,2}):(\d{2})/);
  if (!mf) return 0;

  const dia = parseInt(mf[1], 10);
  const mes = parseInt(mf[2], 10) - 1;
  let anio = parseInt(mf[3], 10);
  if (anio < 100) anio += 2000;

  const horaNum = mh ? parseInt(mh[1], 10) : 0;
  const minNum = mh ? parseInt(mh[2], 10) : 0;
  return new Date(anio, mes, dia, horaNum, minNum, 0).getTime();
}

interface ServicioDetectado {
  origen: string;
  valor: string;
  fuente: string;
  detalle: string;
}

function limpiarServicioFieh(txt: string): string {
  return limpiarDato(
    String(txt || "")
      .replace(/\bFecha\s+probable\s+parto\b[\s\S]*$/i, "")
      .replace(/\bEmbarazada\b[\s\S]*$/i, "")
      .replace(/\bSemanas\s+de\s+amenorrea\b[\s\S]*$/i, "")
      .replace(/\bDiagn[oó]stico\s+de\s+ingreso\b[\s\S]*$/i, "")
      .replace(/\bAccidente\s+de\s+tr[aá]nsito\b[\s\S]*$/i, "")
      .replace(/\bNombre\s+del\s+m[eé]dico\b[\s\S]*$/i, "")
      .replace(/\s+/g, " ")
  );
}

function extraerUltimoServicioRuta(texto: string): {
  origen: string;
  valor: string;
  fuente: string;
  fecha: string;
  hora: string;
} | null {
  const base = sinAcentos(texto);

  const bloqueMatch = base.match(
    /C\.?\s*RUTA\s+DE\s+MOVIMIENTOS?\s+DE\s+PACIENTE\s+DURANTE\s+SU\s+HOSPITALIZACION([\s\S]*?)(?:D\.?\s*DATOS\s+DEL\s+EGRESO|Diagnostico\s+principal|$)/i
  );
  if (!bloqueMatch) return null;

  const plano = String(bloqueMatch[1] || "")
    .replace(/\r/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  interface Movimiento {
    fecha: string;
    hora: string;
    origen: string;
    valor: string;
    fuente: string;
    indice: number;
    serial: number;
  }

  const movimientos: Movimiento[] = [];
  const patronFila =
    /(\d{1,2}[/-]\d{1,2}[/-](?:\d{2}|\d{4}))\s+(\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)\s+([\s\S]*?)(?=\s+\d{1,2}[/-]\d{1,2}[/-](?:\d{2}|\d{4})\s+\d{1,2}:\d{2}|$)/gi;

  let m: RegExpExecArray | null;
  let idx = 0;

  while ((m = patronFila.exec(plano)) !== null) {
    const fecha = limpiarDato(m[1]);
    const hora = limpiarDato(m[2]);
    const segmento = limpiarDato(m[3]);

    const servicios = buscarServiciosConocidosEnTexto(segmento);
    if (!servicios.length) {
      idx++;
      continue;
    }

    // Cada fila trae "traslado de" + "traslado a" + médico: el último servicio
    // detectado en la fila es el destino ("Traslado a").
    const destino = servicios[servicios.length - 1];
    movimientos.push({
      fecha,
      hora,
      origen: destino.origen,
      valor: destino.valor,
      fuente: "RUTA_MOVIMIENTO",
      indice: idx,
      serial: serialFechaHora(fecha, hora),
    });
    idx++;
  }

  if (movimientos.length) {
    movimientos.sort((a, b) =>
      b.serial !== a.serial ? b.serial - a.serial : b.indice - a.indice
    );
    return movimientos[0];
  }

  // Respaldo: servicios sueltos dentro del bloque C sin filas fecha/hora.
  const serviciosBloque = buscarServiciosConocidosEnTexto(plano);
  if (serviciosBloque.length) {
    const ultimo = serviciosBloque[serviciosBloque.length - 1];
    return {
      fecha: "",
      hora: "",
      origen: ultimo.origen,
      valor: ultimo.valor,
      fuente: "RUTA_MOVIMIENTO_SIN_FECHA",
    };
  }

  return null;
}

function extraerServicioIngresoParteB(texto: string): string {
  const plano = texto.replace(/\s+/g, " ").trim();

  const etiqueta = plano.match(/Servicio\s+(?:en\s+la\s+que|al\s+que)\s+ingresa\s*:?\s*/i);
  if (etiqueta && etiqueta.index !== undefined) {
    const desde = etiqueta.index + etiqueta[0].length;
    let ventana = plano.slice(desde, desde + 320);

    const corte = ventana.search(
      /Fecha\s+probable\s+parto|Embarazada|Semanas\s+de\s+amenorrea|Diagn[oó]stico\s+de\s+ingreso|C[oó]digo\s+CIE|Accidente\s+de\s+tr[aá]nsito|Accidente\s+laboral|Nombre\s+del\s+m[eé]dico|C\.?\s*RUTA/i
    );
    if (corte >= 0) ventana = ventana.slice(0, corte);

    const servicios = buscarServiciosConocidosEnTexto(ventana);
    if (servicios.length) return servicios[0].origen;

    const limpio = limpiarServicioFieh(ventana);
    if (limpio) return limpio;
  }

  // Respaldo: buscar dentro del bloque B completo.
  const base = sinAcentos(texto);
  const bloqueBMatch = base.match(
    /B\.?\s*DATOS\s+DEL\s+INGRESO([\s\S]*?)(?:C\.?\s*RUTA\s+DE\s+MOVIMIENTOS?|D\.?\s*DATOS\s+DEL\s+EGRESO|$)/i
  );
  if (bloqueBMatch) {
    const bloqueB = bloqueBMatch[1] || "";
    const servicios = buscarServiciosConocidosEnTexto(bloqueB);
    if (servicios.length) return servicios[servicios.length - 1].origen;

    const valorInferido = inferirServicioPorPatron(bloqueB);
    if (valorInferido) {
      const b = normServicioHospitalario(bloqueB);
      if (b.includes("cuidados intermedios")) return "Unidad de Cuidados Intermedios detectada en FIEH";
      if (
        b.includes("cuidados intensivos") ||
        b.includes("neurointensivos") ||
        b.includes("cuidados coronarios") ||
        b.includes("extracorporea")
      ) {
        return "Unidad de Cuidados Intensivos detectada en FIEH";
      }
      if (b.includes("convenio") || b.includes("isbm")) return "Servicio de Convenio detectado en FIEH";
      if (b.includes("terapia intervencionista endovascular")) return "Unidad de Terapia Intervencionista Endovascular";
      return "Servicio hospitalario detectado por patrón en FIEH";
    }
  }

  return "";
}

function extraerServicioHospitalario(texto: string): ServicioDetectado {
  // Prioridad 1: último traslado del literal C.
  const ruta = extraerUltimoServicioRuta(texto);
  if (ruta && ruta.origen) {
    return {
      origen: ruta.origen,
      valor: mapearServicioSIMMOW(ruta.origen),
      fuente: ruta.fuente,
      detalle: `${ruta.fecha} ${ruta.hora}`.trim(),
    };
  }

  // Prioridad 2: servicio en la que ingresa (parte B).
  const ingreso = extraerServicioIngresoParteB(texto);
  return {
    origen: ingreso || "",
    valor: ingreso ? mapearServicioSIMMOW(ingreso) : "",
    fuente: ingreso ? "INGRESO" : "",
    detalle: "",
  };
}

// ─── Diagnósticos complementarios ───────────────────────────────────────────

interface DxSimple {
  texto: string;
  codigo: string;
}

function extraerComplementarios(texto: string): {
  c: DxSimple;
  b: DxSimple;
  a: DxSimple;
  ii1: DxSimple;
  ii2: DxSimple;
} {
  const vacio = (): DxSimple => ({ texto: "", codigo: "" });
  const res = { c: vacio(), b: vacio(), a: vacio(), ii1: vacio(), ii2: vacio() };

  const plano = sinAcentos(texto)
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const cie = "([A-Z]\\s*\\d\\s*\\d(?:\\s*[\\.,]\\s*\\d{1,2})?)";

  const limpiarTextoDx = (txt: string) =>
    limpiarDato(
      String(txt || "")
        .replace(/\bCodigo\s*CIE[- ]?10\b/gi, "")
        .replace(/\bCodigo\b/gi, "")
        .replace(/\bDiagnostico\s+complementarios?\s+o\s+Debido\s+a\b/gi, "")
        .replace(/\bDiagnostico\s+de\s+causa\s+externa\b/gi, "")
        .replace(/\bDiscapacidad\s+principal\b/gi, "")
        .replace(/\bProcedimientos?.*$/gi, "")
        .replace(/\s+/g, " ")
    );

  const bloqueMatch = plano.match(
    /Diagnostico\s+complementarios?\s+o\s+Debido\s+a([\s\S]*?)(?:Diagnostico\s+de\s+causa\s+externa|Discapacidad\s+principal|Procedimientos|Fecha\s+de\s+egreso|Condicion|$)/i
  );
  const bloque = bloqueMatch ? bloqueMatch[1] : plano;

  const extraerSegmento = (letra: string, siguienteRegex: string): DxSimple => {
    const patron = new RegExp(
      "(?:^|\\s)" +
        letra +
        "\\s*\\)\\s*([\\s\\S]*?)(?=\\s*(?:" +
        siguienteRegex +
        "|Diagnostico\\s+de\\s+causa\\s+externa|Discapacidad\\s+principal|Procedimientos|Fecha\\s+de\\s+egreso|Condicion|$))",
      "i"
    );
    const m = bloque.match(patron);
    if (!m) return vacio();

    const segmento = String(m[1] || "").trim();
    const codMatch = segmento.match(new RegExp(cie, "i"));
    if (!codMatch) return { texto: limpiarTextoDx(segmento), codigo: "" };

    return {
      texto: limpiarTextoDx(segmento.replace(codMatch[0], " ")),
      codigo: normalizarCodigoCIE(codMatch[1]),
    };
  };

  // Orden visual del FIEH: c) = Complementario 1, b) = 2, a) = 3.
  res.c = extraerSegmento("c", "b\\s*\\)");
  res.b = extraerSegmento("b", "a\\s*\\)");
  res.a = extraerSegmento("a", "II\\s*\\)");

  const patronII = new RegExp(
    "(?:^|\\s)II\\s*\\)\\s*([\\s\\S]*?)(?=\\s*(?:II\\s*\\)|Diagnostico\\s+de\\s+causa\\s+externa|Discapacidad\\s+principal|Procedimientos|Fecha\\s+de\\s+egreso|Condicion|$))",
    "gi"
  );

  const encontradosII: DxSimple[] = [];
  let mII: RegExpExecArray | null;
  while ((mII = patronII.exec(bloque)) !== null) {
    const segmento = String(mII[1] || "").trim();
    const codMatch = segmento.match(new RegExp(cie, "i"));
    if (!codMatch) continue;
    encontradosII.push({
      texto: limpiarTextoDx(segmento.replace(codMatch[0], " ")),
      codigo: normalizarCodigoCIE(codMatch[1]),
    });
  }

  if (encontradosII[0]) res.ii1 = encontradosII[0];
  if (encontradosII[1]) res.ii2 = encontradosII[1];

  return res;
}

// ─── Causa externa, discapacidad y cirugías ─────────────────────────────────

interface Cirugia {
  texto: string;
  codigo: string;
  fecha: string;
  cirujano: string;
  tipo: string;
}

function extraerCausaExternaYCirugias(texto: string): {
  causaExterna: DxSimple;
  discapacidad: DxSimple;
  cirugias: Cirugia[];
} {
  const res = {
    causaExterna: { texto: "", codigo: "" },
    discapacidad: { texto: "", codigo: "" },
    cirugias: [] as Cirugia[],
  };

  const plano = sinAcentos(texto)
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const cie = "([A-Z]\\s*\\d\\s*\\d(?:\\s*[\\.,]\\s*\\d{1,2})?)";
  const patronCodigoCIE10 = "Codigo\\s*CIE\\s*[-\\s]*10\\s*:?";

  const limpiarTextoLocal = (txt: string) =>
    limpiarDato(
      String(txt || "")
        .replace(/\bCodigo\s*CIE\s*[- ]?10\b/gi, "")
        .replace(/\bCodigo\b/gi, "")
        .replace(/\s+/g, " ")
    );

  // Causa externa
  const mCausaExterna = plano.match(
    new RegExp(
      "Diagnostico\\s+de\\s+causa\\s+externa\\s*:?\\s*([\\s\\S]*?)\\s*" +
        patronCodigoCIE10 +
        "\\s*" +
        cie +
        "\\s*(?=Discapacidad\\s+principal|Procedimientos|Condicion\\s+de\\s+egreso|$)",
      "i"
    )
  );
  if (mCausaExterna) {
    res.causaExterna.texto = limpiarTextoLocal(mCausaExterna[1]);
    res.causaExterna.codigo = normalizarCodigoCIE(mCausaExterna[2]);
  }

  // Discapacidad principal
  const mDiscapacidad = plano.match(
    /Discapacidad\s+principal\s*:?\s*([\s\S]*?)(?=Procedimientos?\s+o\s+intervenciones?|Condicion\s+de\s+egreso|$)/i
  );
  if (mDiscapacidad) {
    const bloqueDiscapacidad = limpiarDato(mDiscapacidad[1] || "");
    const mCodigo = bloqueDiscapacidad.match(
      /Codigo\s+CIF\s*[-\s]*9\s*:?\s*([A-Z0-9][A-Z0-9.\-]{0,12})/i
    );
    const textoDiscapacidad = bloqueDiscapacidad.replace(
      /Codigo\s+CIF\s*[-\s]*9\s*:?\s*[A-Z0-9.\-]*/i,
      ""
    );

    res.discapacidad.texto = limpiarTextoLocal(textoDiscapacidad);
    res.discapacidad.codigo = mCodigo ? normalizarCodigoCIE(mCodigo[1]) : "";
    if (/^(N\/A|NA|N|NOAPLICA|NINGUNO|SIN)$/i.test(res.discapacidad.codigo)) {
      res.discapacidad.codigo = "";
    }
  }

  // Cirugías / intervenciones quirúrgicas
  const bloqueCirugiaMatch = plano.match(
    /Procedimientos?\s+o\s+intervenciones?\s+quirurgicas[\s\S]*?Tipo\s+de\s+cirugia\s+([\s\S]*?)(?:\(a\)\s*Tipo\s+de\s+Cirugia|Se\s+suspendio|Procedimientos\s+medicos|Procedimientos\s+y\s+terapeuticos|Presento\s+reaccion|Condicion\s+de\s+egreso|$)/i
  );
  const bloqueCirugia = bloqueCirugiaMatch ? bloqueCirugiaMatch[1] : "";

  const patronCirugia = new RegExp(
    "(.+?)\\s+" +
      "(\\d{1,2}(?:\\.\\d{1,2})?)\\s+" +
      "(\\d{1,2}\\/\\d{1,2}\\/\\d{4})\\s+" +
      "([A-Za-zÁÉÍÓÚÑáéíóúñüÜ.\\s]+?)\\s+" +
      "([135])" +
      "(?=\\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñüÜ,\\s]+\\s+\\d{1,2}(?:\\.\\d{1,2})?\\s+\\d{1,2}\\/\\d{1,2}\\/\\d{4}|\\s*$)",
    "gi"
  );

  let mCirugia: RegExpExecArray | null;
  while ((mCirugia = patronCirugia.exec(bloqueCirugia)) !== null) {
    res.cirugias.push({
      texto: limpiarTextoLocal(mCirugia[1]),
      codigo: normalizarCodigoCIE(mCirugia[2]),
      fecha: limpiarDato(mCirugia[3]),
      cirujano: limpiarDato(mCirugia[4]),
      tipo: limpiarDato(mCirugia[5]),
    });
    if (res.cirugias.length >= 4) break;
  }

  return res;
}

// ─── Validación ─────────────────────────────────────────────────────────────

const OBLIGATORIOS: [CampoSimmow, string][] = [
  ["NEC", "No se detectó NEC."],
  ["NUM_DOCUMENTO", "No se detectó documento."],
  ["APELLIDOS", "No se detectaron apellidos."],
  ["NOMBRES", "No se detectaron nombres."],
  ["FECHA_INGRESO", "No se detectó fecha de ingreso."],
  ["DIAG_PRINCIPAL_CODIGO", "No se detectó diagnóstico principal."],
  ["FECHA_EGRESO", "No se detectó fecha de egreso."],
  ["HORA_EGRESO", "No se detectó hora de egreso."],
  ["JVPM_MEDICO_NUMERO", "No se detectó número JVPM del médico."],
];

// ─── Extractor principal ────────────────────────────────────────────────────

export function extraerFieh(doc: DocumentoExtraido): ResultadoExtraccion {
  const advertencias: string[] = [];
  const camposNoEncontrados: CampoSimmow[] = [];
  const datos: DatosSimmow = datosVacios();

  const texto = doc.textoCompleto.replace(/\r/g, "\n").replace(/\t/g, " ");
  const plano = texto.replace(/\s+/g, " ").trim();

  datos.NEC = buscar(plano, /NEC\s*:\s*([A-Z0-9\-]+)/i);

  datos.TIPO_DOCUMENTO = buscar(plano, /Tipo\s+documento:\s*(.*?)\s*\d{7,10}-?\d?/i);

  // Caso normal: "Tipo documento: 12345678-9" contiguo. Caso partido: la
  // etiqueta ("Tipo" ... "documento:") Y el número quedan repartidos entre
  // las dos líneas (p. ej. "Tipo 00260386- Tipo de ..." / "documento: 2
  // afiliación:") — se reconstruye uniendo ambos fragmentos del número.
  let numDocumento = buscar(plano, /Tipo\s+documento:\s*.*?(\d{7,10}-?\d?)/i);
  if (!numDocumento) {
    const parte1 = plano.match(/Tipo\s+(\d[\d-]{5,10})\s*Tipo\s+de/i);
    const parte2 = plano.match(/documento:\s*(\d)\s*afiliaci[oó]n/i);
    if (parte1) numDocumento = parte1[1] + (parte2 ? parte2[1] : "");
  }
  datos.NUM_DOCUMENTO = soloNumeros(numDocumento);
  datos.TIPO_DOCUMENTO_VALOR = tipoDocumentoValor(datos.TIPO_DOCUMENTO);

  // "Tipo de afiliación:" a veces se parte en dos líneas visuales en el PDF
  // ("Tipo de" ... "afiliación:"), quedando el valor entre ambas mitades. El
  // segundo tramo de la etiqueta se hace opcional para cubrir ambos casos.
  datos.TIPO_AFILIACION = buscar(
    plano,
    /Tipo\s+de\s+(?:afiliaci[oó]n:?\s*)?(.*?)\s*No\.?\s*Afiliaci[oó]n:/i
  );
  datos.NUM_AFILIACION = soloNumeros(
    buscar(plano, /No\.?\s*Afiliaci[oó]n:\s*([A-Z0-9\-/]+)/i)
  );
  datos.TIPO_AFILIACION_VALOR = tipoAfiliacionValor(datos.TIPO_AFILIACION);

  datos.APELLIDOS = limpiarDato(buscar(plano, /Apellidos:\s*(.*?)\s*Nombres:/i));
  // "Fecha Nacimiento:" también puede partirse en dos líneas ("Fecha" ...
  // "Nacimiento:"); cortar solo en "Fecha" evita que el nombre se trague el
  // resto de la fila cuando eso pasa.
  datos.NOMBRES = limpiarDato(buscar(plano, /Nombres:\s*(.*?)\s*Fecha\b/i));

  const apellidos = dividirNombre(datos.APELLIDOS);
  datos.PRIMER_APELLIDO = apellidos[0] || "";
  datos.SEGUNDO_APELLIDO = apellidos[1] || "";
  datos.TERCER_APELLIDO = apellidos.slice(2).join(" ");

  const nombres = dividirNombre(datos.NOMBRES);
  datos.PRIMER_NOMBRE = nombres[0] || "";
  datos.SEGUNDO_NOMBRE = nombres[1] || "";
  datos.TERCER_NOMBRE = nombres.slice(2).join(" ");

  // Caso normal: "Fecha Nacimiento: DD/MM/YYYY" contiguo. Caso partido: la
  // etiqueta se separa en dos líneas y la fecha queda partida junto con
  // ella ("Fecha DD/MM/ ... Edad: ... Nacimiento: YYYY") — se reconstruye
  // tomando día/mes de la primera mitad y el año de la segunda.
  const fechaNacContigua = plano.match(
    /Fecha\s+Nacimiento:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i
  );
  if (fechaNacContigua) {
    datos.FECHA_NACIMIENTO = fechaNacContigua[1];
  } else {
    const diaMes = plano.match(/Fecha\s+(\d{1,2}\/\d{1,2})\/?\s*Edad/i);
    const anio = plano.match(/Nacimiento:\s*(\d{4})/i);
    datos.FECHA_NACIMIENTO = diaMes && anio ? `${diaMes[1]}/${anio[1]}` : "";
  }

  const edad = extraerEdad(plano);
  datos.EDAD_ANIOS = edad.anios;
  datos.EDAD_MESES = edad.meses;
  datos.EDAD_DIAS = edad.dias;

  datos.SEXO = buscar(plano, /Sexo:\s*(Masculino|Femenino|Intersexual)/i);

  // "Dirección residencia:" también puede partirse ("Dirección" ...
  // "residencia:"); el segundo tramo se hace opcional.
  const direccionCruda = buscar(
    plano,
    /Direcci[oó]n\s+(?:residencia:?\s*)?(.*?)\s*Departamento:/i
  );
  datos.DIRECCION = limpiarDireccionParaSIMMOW(direccionCruda);

  // Igual que arriba: "Área geográfica:" puede partirse en dos líneas
  // ("Área" ... "geográfica:"), por eso el cierre del bloque corta solo en
  // "Área" y el resto de la etiqueta queda opcional.
  const depMun = plano.match(
    /Departamento:\s*(.*?)\s*Municipio:\s*(.*?)\s*Cant[oó]n:\s*(.*?)\s*[ÁA]rea\b/i
  );
  datos.DEPARTAMENTO = depMun ? limpiarDato(depMun[1]) : "";
  datos.DISTRITO = depMun ? limpiarDato(depMun[2]) : "";
  datos.CANTON = depMun ? limpiarNA(depMun[3]) : "";

  // "Área geográfica:" puede partirse igual que las demás etiquetas de dos
  // palabras; "geográfica:" se vuelve opcional para cubrir ambos casos.
  datos.AREA = buscar(
    plano,
    /[ÁA]rea\s+(?:geogr[aá]fica:?\s*)?(Urbana|Urbano|Rural)/i
  );
  if (/urbano/i.test(datos.AREA)) datos.AREA = "Urbana";

  const seguimiento = referidoRetornoSeguimientoPorCheckbox(doc);
  datos.REFERIDO_A_ESTABLECIMIENTO = seguimiento.referidoA;
  datos.REFERIDO_DEL_ESTABLECIMIENTO = extraerReferidoDelEstablecimiento(plano);
  datos.RETORNO_HACIA = seguimiento.retorno;

  datos.FECHA_INGRESO = buscar(
    plano,
    /Fecha\s+de\s+ingreso:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i
  );
  datos.HORA_INGRESO = buscar(
    plano,
    /Hora\s+de\s+ingreso:\s*([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM)?)/i
  );

  const dxIngreso = plano.match(
    /Diagn[oó]stico\s+de\s+ingreso:\s*"?(.+?)"?\s*C[oó]digo\s+CIE-10:\s*([A-Z]\d{2}(?:\.\d{1,2})?)/i
  );
  datos.DIAG_INGRESO_TEXTO = dxIngreso ? limpiarDato(dxIngreso[1]) : "";
  datos.DIAG_INGRESO_CODIGO = dxIngreso ? dxIngreso[2] : "";

  datos.ACCIDENTE_TRANSITO = buscar(plano, /Accidente\s+de\s+tr[aá]nsito:\s*(SI|NO)/i);
  datos.ACCIDENTE_LABORAL = buscar(plano, /Accidente\s+laboral:\s*(SI|NO)/i);
  datos.TIPO_ACCIDENTE_VALOR = tipoAccidenteValor(
    datos.ACCIDENTE_TRANSITO,
    datos.ACCIDENTE_LABORAL
  );

  // Servicio hospitalario (último traslado del literal C, o ingreso).
  const servicio = extraerServicioHospitalario(texto);
  datos.SERVICIO_HOSPITALARIO_ORIGEN = servicio.origen;
  datos.SERVICIO_HOSPITALARIO_VALOR = servicio.valor;
  datos.SERVICIO_HOSPITALARIO_FUENTE = servicio.fuente;
  datos.SERVICIO_HOSPITALARIO_DETALLE = servicio.detalle;

  if (!datos.SERVICIO_HOSPITALARIO_ORIGEN) {
    advertencias.push("No se detectó Servicio Hospitalario en el FIEH. Revise manualmente.");
    camposNoEncontrados.push("SERVICIO_HOSPITALARIO_VALOR");
  } else if (!datos.SERVICIO_HOSPITALARIO_VALOR) {
    advertencias.push(
      "Servicio Hospitalario sin mapeo para SIMMOW: " + datos.SERVICIO_HOSPITALARIO_ORIGEN
    );
    camposNoEncontrados.push("SERVICIO_HOSPITALARIO_VALOR");
  }

  // Diagnóstico principal
  const dxPrincipal = plano.match(
    new RegExp(
      "Diagn[oó]stico\\s+principal\\s*(?:\\(d\\))?\\s*:\\s*([\\s\\S]*?)\\s*C[oó]digo\\s*CIE\\s*[-\\s]*10\\s*:?\\s*([A-Z]\\s*\\d\\s*\\d(?:\\s*[\\.,]\\s*\\d{1,2})?)",
      "i"
    )
  );
  datos.DIAG_PRINCIPAL_TEXTO = dxPrincipal ? limpiarDato(dxPrincipal[1]) : "";
  datos.DIAG_PRINCIPAL_CODIGO = dxPrincipal ? normalizarCodigoCIE(dxPrincipal[2]) : "";

  // Complementarios (c, b, a, II, II)
  const comp = extraerComplementarios(texto);
  datos.DIAG_C_TEXTO = comp.c.texto;
  datos.DIAG_C_CODIGO = comp.c.codigo;
  datos.DIAG_B_TEXTO = comp.b.texto;
  datos.DIAG_B_CODIGO = comp.b.codigo;
  datos.DIAG_A_TEXTO = comp.a.texto;
  datos.DIAG_A_CODIGO = comp.a.codigo;
  datos.DIAG_II1_TEXTO = comp.ii1.texto;
  datos.DIAG_II1_CODIGO = comp.ii1.codigo;
  datos.DIAG_II2_TEXTO = comp.ii2.texto;
  datos.DIAG_II2_CODIGO = comp.ii2.codigo;

  // Causa externa, discapacidad y cirugías
  const causaProc = extraerCausaExternaYCirugias(texto);
  datos.CAUSA_EXTERNA_TEXTO = causaProc.causaExterna.texto;
  datos.CAUSA_EXTERNA_CODIGO = causaProc.causaExterna.codigo;
  datos.DISCAPACIDAD_PRINCIPAL_TEXTO = causaProc.discapacidad.texto;
  datos.DISCAPACIDAD_PRINCIPAL_CODIGO = causaProc.discapacidad.codigo;

  // Los campos de cirugía son todos `string` en DatosSimmow; se asignan por
  // clave dinámica con un escape de tipo acotado (nunca toca CONDICION_EGRESO).
  const datosCirugias = datos as unknown as Record<string, string>;
  for (let i = 1; i <= 4; i++) {
    const c = causaProc.cirugias[i - 1];
    const pref = `CIRUGIA_${i}_`;
    datosCirugias[`${pref}TEXTO`] = c?.texto || "";
    datosCirugias[`${pref}CODIGO`] = c?.codigo || "";
    datosCirugias[`${pref}FECHA`] = c?.fecha || "";
    datosCirugias[`${pref}CIRUJANO`] = c?.cirujano || "";
    datosCirugias[`${pref}TIPO`] = c?.tipo || "";
  }

  // ── Casillas (lectura real del PDF) ──
  datos.CIRUGIA_SUSPENDIDA_VALOR = cirugiaSuspendidaPorCheckbox(doc);

  const condicion = condicionPorCheckbox(doc);
  if (condicion) {
    datos.CONDICION_EGRESO = condicion;
  } else if (
    datos.DIAG_A_CODIGO &&
    datos.DIAG_B_CODIGO &&
    datos.DIAG_C_CODIGO &&
    datos.DIAG_PRINCIPAL_CODIGO
  ) {
    datos.CONDICION_EGRESO = "MUERTO";
    advertencias.push(
      "Condición MUERTO asignada por presencia de causas a, b, c y básica d (casilla no legible). Confirme."
    );
  } else {
    datos.CONDICION_EGRESO = "";
    advertencias.push(
      "No se pudo determinar la condición de egreso. Seleccione VIVO o MUERTO en la revisión."
    );
    camposNoEncontrados.push("CONDICION_EGRESO");
  }

  datos.MOTIVO_ALTA_VALOR = circunstanciaAltaPorCheckbox(doc);
  if (!datos.MOTIVO_ALTA_VALOR && datos.CONDICION_EGRESO !== "MUERTO") {
    camposNoEncontrados.push("MOTIVO_ALTA_VALOR");
  }

  datos.FECHA_EGRESO = buscar(plano, /Fecha\s+de\s+egreso:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);

  // "Hora de egreso:" puede partirse ("Hora de" ... "egreso:"), con el valor
  // quedando ANTES del segundo tramo. Se busca primero la forma contigua y,
  // si falla, la forma partida acotada a partir de "Fecha de egreso:" (para
  // no confundirla con "Hora de ingreso:", que aparece antes en el documento).
  let horaEgreso = plano.match(/Hora\s+de\s+egreso:\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!horaEgreso) {
    const idxFechaEgreso = plano.search(/Fecha\s+de\s+egreso:/i);
    const desdeEgreso = idxFechaEgreso >= 0 ? plano.slice(idxFechaEgreso) : "";
    horaEgreso = desdeEgreso.match(/Hora\s+de\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  }
  if (horaEgreso) {
    datos.HORA_EGRESO = convertirHora24(horaEgreso[1], horaEgreso[3]);
    datos.MINUTO_EGRESO = pad2(horaEgreso[2]);
  }

  datos.RECOMENDACIONES = buscar(
    plano,
    /Recomendaciones:\s*(.*?)\s*Nombre\s+del\s+m[eé]dico\s+responsable\s+del\s+alta/i
  );

  const medicoAlta = plano.match(
    /Nombre\s+del\s+m[eé]dico\s+responsable\s+del\s+alta\s+(.+?)\s+No\.?\s*JVPM:\s*([A-Z0-9\-]+)/i
  );
  datos.MEDICO_RESPONSABLE_ALTA = medicoAlta ? limpiarDato(medicoAlta[1]) : "";
  datos.JVPM_MEDICO = medicoAlta ? limpiarDato(medicoAlta[2]) : "";
  datos.JVPM_MEDICO_NUMERO = soloNumeros(datos.JVPM_MEDICO);

  datos.ESDOMED_DIGITA = buscar(
    plano,
    /Nombre\s+de\s+ESDOMED\s+de\s+digitar\s+informaci[oó]n\s*(.*?)\s*Fecha\s+de\s+digitaci[oó]n/i
  );
  datos.FECHA_DIGITACION = buscar(
    plano,
    /Fecha\s+de\s+digitaci[oó]n\s*(\d{1,2}\/\d{1,2}\/\d{4})/i
  );

  // Validación de obligatorios
  OBLIGATORIOS.forEach(([campo, msg]) => {
    if (!datos[campo]) {
      advertencias.push(msg);
      if (!camposNoEncontrados.includes(campo)) camposNoEncontrados.push(campo);
    }
  });

  return { datos, advertencias, camposNoEncontrados };
}
