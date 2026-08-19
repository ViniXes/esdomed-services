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
import { buscarItem, checkboxesEnLinea, leerCeldaMultilinea, opcionesMarcadas } from "./layout";

// ─── Detección de tipo de documento ─────────────────────────────────────────

export function esFieh(textoCompleto: string): boolean {
  const t = sinAcentos(textoCompleto);
  return (
    /FORMULARIO\s+DE\s+INGRESO\s+Y\s+EGRESO/i.test(t) ||
    (/NEC\s*:/i.test(t) && /DATOS\s+DEL\s+INGRESO/i.test(t))
  );
}

// ─── Campos por casillas ────────────────────────────────────────────────────

/**
 * "Vivo" / "Muerto" son las únicas casillas de todo el documento con ese
 * texto exacto, así que se busca la marcada en TODO el documento en vez de
 * anclarla a la línea de la etiqueta "Condición de": en algunos FIEH reales
 * la casilla de esta fila queda justo en el borde de la tolerancia vertical
 * usada para asociar checkbox↔línea y la búsqueda por línea no la encuentra,
 * aunque la casilla sí se detectó y asoció correctamente a su opción.
 */
function condicionPorCheckbox(doc: DocumentoExtraido): "" | "VIVO" | "MUERTO" {
  for (const cb of opcionesMarcadas(doc)) {
    const op = sinAcentos(cb.opcion).toLowerCase();
    if (op === "vivo") return "VIVO";
    if (op === "muerto") return "MUERTO";
  }
  return "";
}

/**
 * Cada opción de "Circunstancia de alta" envuelve su palabra clave a una
 * segunda línea ("Referido a otro" / "hospital", "Alta" / "voluntaria",
 * etc.), y el navegador real entrega cada palabra como su propio ítem de
 * texto (no se puede agrupar por X exacta: dos palabras de una misma opción
 * casi nunca comparten X). Se resuelve por posición: en la línea SUPERIOR
 * (la de las casillas) se detectan los INICIOS de columna por los saltos
 * grandes de X entre palabras consecutivas — las opciones quedan bien
 * separadas entre sí, pero las palabras de una misma opción quedan pegadas
 * con el espaciado normal de una oración. Con esas columnas ya delimitadas,
 * se junta el texto de ambas líneas que caiga dentro de cada una, y cada
 * casilla marcada se clasifica según la columna donde caiga su X.
 */
function circunstanciaAltaPorCheckbox(doc: DocumentoExtraido): string {
  const etiqueta = buscarItem(doc, /Circunstancia de alta/i);
  if (!etiqueta) return "";

  const marcadas = checkboxesEnLinea(etiqueta.pagina, etiqueta.item.y).filter(
    (cb) => cb.marcado
  );
  if (!marcadas.length) return "";

  const lineaSuperior = etiqueta.pagina.items
    .filter(
      (it) =>
        Math.abs(it.y - etiqueta.item.y) <= 2 &&
        it.x > etiqueta.item.x + etiqueta.item.w
    )
    .sort((a, b) => a.x - b.x);

  const inicios: number[] = [];
  let finAnterior: number | null = null;
  for (const it of lineaSuperior) {
    if (finAnterior === null || it.x - finAnterior > 15) inicios.push(it.x);
    finAnterior = it.x + it.w;
  }
  if (!inicios.length) return "";

  const fragmentos = etiqueta.pagina.items.filter(
    (it) =>
      it.x > etiqueta.item.x &&
      it.y <= etiqueta.item.y + 2 &&
      it.y >= etiqueta.item.y - 12
  );
  const columnas = inicios.map((x) => ({ x, texto: "" }));
  for (const it of fragmentos) {
    let columna = columnas[0];
    for (const col of columnas) {
      if (col.x <= it.x + 2) columna = col;
      else break;
    }
    columna.texto += " " + it.str;
  }

  for (const cb of marcadas) {
    let columna = columnas[0];
    for (const col of columnas) {
      if (col.x <= cb.x + 2) columna = col;
      else break;
    }
    const texto = sinAcentos(columna.texto).toLowerCase();
    if (texto.includes("domicilio") || texto.includes("destino")) return "1";
    if (texto.includes("referido") || texto.includes("hospital")) return "2";
    if (texto.includes("residencia")) return "3";
    if (texto.includes("voluntaria") || /\balta\b/.test(texto)) return "4";
    if (texto.includes("extremis") || texto.includes("morir en casa")) return "5";
    if (texto.includes("fuga")) return "6";
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
 * establecimiento, marcado con cualquiera de las dos casillas ("Referencia" /
 * "Retorno" — cuál de las dos esté marcada NO decide el destino), se reparte
 * entre "Referido al Establecimiento" o "Retorno hacia" en SIMMOW según la
 * Circunstancia de Alta (numeral 8, sección D) elegida:
 *   - Circunstancia = "A otro Hospital" (valor "2") → Referido al Establecimiento.
 *   - Cualquier otra circunstancia (Domicilio, Residencia, Voluntaria,
 *     In Extremis, Fuga) → Retorno hacia.
 * Regla confirmada por el personal de ESDOMED (no es una inferencia propia).
 * El nombre puede envolver a una segunda línea.
 */
function referidoRetornoSeguimientoPorCheckbox(
  doc: DocumentoExtraido,
  circunstanciaAltaValor: string
): { referidoA: string; retorno: string; advertencia?: string } {
  const vacio = { referidoA: "", retorno: "" };

  const etiquetaEstablecimiento = buscarItem(doc, /Nombre\s+establecimiento:/i);
  if (!etiquetaEstablecimiento) return vacio;

  const celda = leerCeldaMultilinea(
    etiquetaEstablecimiento.pagina,
    etiquetaEstablecimiento.item,
    /^Recomendaciones:/i
  );
  // buscarItem devuelve como `item` el ÚLTIMO ítem consumido al matchear
  // /Nombre\s+establecimiento:/i, que es el ítem "establecimiento:" (no
  // "Nombre"). leerCeldaMultilinea recorta por la X de ESE ítem, así que
  // "Nombre" (más a la izquierda) queda fuera de `celda` — solo
  // "establecimiento:" sigue presente al inicio. El .replace() de abajo
  // buscaba "Nombre establecimiento:" completo y nunca matcheaba, dejando
  // "establecimiento: " pegado como prefijo del valor.
  const nombreEstablecimiento = limpiarNombreEstablecimiento(
    celda.replace(/^(?:Nombre\s+)?establecimiento:\s*/i, "")
  );
  if (!nombreEstablecimiento) return vacio;

  // No se filtra por el texto de opción de la casilla ("Referencia"/"Retorno"):
  // ambas etiquetas terminan en la palabra suelta "a" ("Referencia a" / "Retorno
  // a"), y asociarOpciones() en pdfEngine.ts le asigna a cada casilla el ítem de
  // texto más cercano a su izquierda — que en este layout es justo esa "a", no
  // "Referencia" ni "Retorno". Filtrar por opcion.includes("referencia"/"retorno")
  // nunca matcheaba, así que una casilla realmente marcada se leía como si nada
  // estuviera marcado. Como el propio comentario de arriba dice, cuál de las dos
  // esté marcada no decide el destino — basta con que haya alguna marcada.
  const hayMarca = checkboxesEnLinea(
    etiquetaEstablecimiento.pagina,
    etiquetaEstablecimiento.item.y
  ).some((cb) => cb.marcado);
  if (!hayMarca) return vacio;

  if (circunstanciaAltaValor === "2") {
    return { referidoA: nombreEstablecimiento, retorno: "" };
  }
  if (circunstanciaAltaValor) {
    return { referidoA: "", retorno: nombreEstablecimiento };
  }
  return {
    ...vacio,
    advertencia:
      `Se detectó establecimiento de seguimiento ("${nombreEstablecimiento}") pero no se ` +
      "pudo determinar la Circunstancia de Alta para saber si va en Referido al " +
      "Establecimiento o Retorno hacia. Complételo manualmente.",
  };
}

/**
 * Sección A: "Nombre del establecimiento (referido de:)" a veces se parte en
 * TRES líneas ("Nombre del" / "establecimiento" / "(referido de:)"), con el
 * valor completo pegado a la derecha de la primera línea. Se ancla con
 * buscarItem (que ya reconstruye la etiqueta aunque "Nombre" y "del" lleguen
 * como ítems de texto separados) y se confirma que "establecimiento"
 * aparece justo debajo, alineado con el inicio de la etiqueta — para no
 * confundirlo con "Nombre del médico..." u otras etiquetas.
 */
function extraerReferidoDelEstablecimientoPorCoordenadas(doc: DocumentoExtraido): string {
  const etiqueta = buscarItem(doc, /^Nombre\s+del$/i);
  if (!etiqueta) return "";

  const continuacion = etiqueta.pagina.items.find(
    (it) =>
      Math.abs(it.x - etiqueta.inicio.x) <= 3 &&
      it.y < etiqueta.item.y &&
      etiqueta.item.y - it.y <= 15 &&
      /^establecimiento\b/i.test(it.str.trim())
  );
  if (!continuacion) return "";

  const valor = etiqueta.pagina.items
    .filter(
      (it) =>
        Math.abs(it.y - etiqueta.item.y) <= 5 &&
        it.x >= etiqueta.item.x + etiqueta.item.w - 2
    )
    .sort((a, b) => a.x - b.x)
    .map((it) => it.str)
    .join(" ");

  return limpiarNombreEstablecimiento(valor);
}

/**
 * Variante actual de la plantilla del FIEH (confirmada en varios documentos
 * reales): la etiqueta ya NO se parte en "Nombre del" / "establecimiento" —
 * viene junta como "Nombre del establecimiento" (a veces en un solo ítem, a
 * veces repartida palabra por palabra), y "(referido" queda pegado en la
 * MISMA línea justo antes de donde empezaría el valor — no es una nota
 * suelta de una línea de abajo como se pensaba antes. El resto de la
 * etiqueta, "de:)", se envuelve solo a la línea de abajo. Cuando el campo
 * SÍ trae un establecimiento, ese valor queda intercalado entre "(referido"
 * y "de:)" (en esa misma línea, después de "(referido"), así que tomar todo
 * lo que sigue a la etiqueta sin filtrar arrastraba "(referido" como si
 * fuera parte del valor — y cuando el campo está vacío, "(referido" o "de:)"
 * quedaban solos y se leían como si fueran el valor. Se leen ambas líneas
 * (la de la etiqueta y la que envuelve debajo) y se descartan explícitamente
 * los fragmentos que son parte de la propia etiqueta.
 */
function extraerReferidoDelEstablecimientoEtiquetaCompleta(doc: DocumentoExtraido): string {
  const etiqueta = buscarItem(doc, /^Nombre\s+del\s+establecimiento$/i);
  if (!etiqueta) return "";

  const esFragmentoEtiqueta = (s: string) =>
    /^\(?referido$/i.test(s.trim()) || /^de:?\)?$/i.test(s.trim()) || s.trim() === ")";

  const lineaEtiqueta = etiqueta.pagina.items.filter(
    (it) =>
      Math.abs(it.y - etiqueta.item.y) <= 5 &&
      it.x >= etiqueta.item.x + etiqueta.item.w - 2
  );
  const lineaEnvuelta = etiqueta.pagina.items.filter(
    (it) => it.y < etiqueta.item.y - 2 && etiqueta.item.y - it.y <= 15
  );

  const valor = [...lineaEtiqueta, ...lineaEnvuelta]
    .filter((it) => !esFragmentoEtiqueta(it.str))
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((it) => it.str)
    .join(" ");

  return limpiarNombreEstablecimiento(valor);
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

interface Movimiento {
  fecha: string;
  hora: string;
  origen: string;
  valor: string;
  fuente: string;
}

/** Concatena ítems (ya filtrados a una columna) respetando huecos reales entre ellos. */
function juntarPalabras(items: { str: string; x: number; w: number }[]): string {
  const ordenados = [...items].sort((a, b) => a.x - b.x);
  let texto = "";
  let finAnterior: number | null = null;
  for (const it of ordenados) {
    if (finAnterior !== null && it.x - finAnterior > 1) texto += " ";
    texto += it.str;
    finAnterior = it.x + it.w;
  }
  return texto;
}

/**
 * Sección C (Ruta de movimiento): tabla "Fecha | Hora | Traslado de: |
 * Traslado a: | Nombre del médico...". Cuando el nombre del servicio es
 * largo (típico en UCI/UCIN: "Unidad de Cuidados Intensivos Aislados
 * Adultos"), la celda envuelve a una segunda línea — y como el navegador
 * real entrega cada palabra como su propio ítem, aplanar todo a texto
 * mezcla las columnas ("Traslado de:" y "Traslado a:" quedan intercaladas
 * antes de que las líneas envueltas de cada una aparezcan, lejos de su
 * columna). Eso hacía que solo sobreviviera una palabra suelta del destino
 * real (p. ej. "aislados" en vez de "Unidad de Cuidados Intensivos Aislados
 * Adultos"), mapeando al servicio equivocado (AISLAMIENTO en vez de
 * MEDICINA INTERNA D). Se resuelve leyendo la tabla por coordenadas: se
 * ubican las columnas por el encabezado y se junta el texto de "Traslado
 * a:" en ambas líneas de cada fila.
 */
function extraerUltimoServicioRutaPorCoordenadas(doc: DocumentoExtraido): Movimiento | null {
  for (const pagina of doc.paginas) {
    // Puede haber un tercer "traslado" suelto en la nota final de la sección
    // ("...encargada del traslado de paciente"): se descarta agrupando por Y
    // y quedándose con la línea que tiene DOS "Traslado" (el encabezado real
    // "Traslado de:" / "Traslado a:"), no cualquier par por cercanía en X.
    const traslados = pagina.items.filter((it) => /^Traslado$/i.test(sinAcentos(it.str).trim()));
    if (traslados.length < 2) continue;

    const gruposPorY: typeof traslados[] = [];
    for (const it of traslados) {
      const grupo = gruposPorY.find((g) => Math.abs(g[0].y - it.y) <= 3);
      if (grupo) grupo.push(it);
      else gruposPorY.push([it]);
    }
    const filaEncabezadoTraslados = gruposPorY.find((g) => g.length >= 2);
    if (!filaEncabezadoTraslados) continue;

    const [colDe, colA] = [...filaEncabezadoTraslados].sort((a, b) => a.x - b.x);
    const yEncabezado = colA.y;

    const filaEncabezado = pagina.items.filter((it) => Math.abs(it.y - yEncabezado) <= 3);
    const colFecha = filaEncabezado.find((it) => /^Fecha$/i.test(sinAcentos(it.str).trim()));
    const colHora = filaEncabezado.find((it) => /^Hora$/i.test(sinAcentos(it.str).trim()));
    const colMedico = filaEncabezado.find((it) => /^Nombre$/i.test(sinAcentos(it.str).trim()));
    if (!colFecha || !colHora) continue;

    // Límites de columna = punto medio entre encabezados consecutivos, NO la
    // X cruda de cada encabezado: el contenido de una columna (p. ej. la
    // fecha "17-01-2026") suele empezar más a la izquierda que su propia
    // etiqueta ("Fecha"), así que anclar el límite en la etiqueta recortaba
    // contenido real de la columna.
    const medio = (a: number, b: number) => (a + b) / 2;
    const limFechaHora = medio(colFecha.x, colHora.x);
    const limHoraDe = medio(colHora.x, colDe.x);
    const limDeA = medio(colDe.x, colA.x);
    const limANombre = colMedico ? medio(colA.x, colMedico.x) : colA.x + 200;

    const notaFinal = pagina.items.find(
      (it) => /^El$/i.test(it.str.trim()) && it.y < yEncabezado
    );
    const yFinTabla = notaFinal ? notaFinal.y : -Infinity;

    const itemsTabla = pagina.items.filter(
      (it) => it.y < yEncabezado - 3 && it.y > yFinTabla + 3
    );
    if (!itemsTabla.length) continue;

    const lineas: typeof itemsTabla[] = [];
    for (const it of itemsTabla) {
      const linea = lineas.find((l) => Math.abs(l[0].y - it.y) <= 4);
      if (linea) linea.push(it);
      else lineas.push([it]);
    }
    lineas.sort((a, b) => b[0].y - a[0].y);

    interface Fila {
      fecha: string;
      hora: string;
      colA: string;
      serial: number;
      indice: number;
    }
    const filas: Fila[] = [];

    for (const linea of lineas) {
      const enFecha = linea.filter((it) => it.x < limFechaHora);
      const enColA = linea.filter((it) => it.x >= limDeA && it.x < limANombre);

      if (enFecha.length) {
        const enHora = linea.filter((it) => it.x >= limFechaHora && it.x < limHoraDe);
        const fecha = juntarPalabras(enFecha);
        const hora = juntarPalabras(enHora);
        filas.push({
          fecha,
          hora,
          colA: juntarPalabras(enColA),
          serial: serialFechaHora(fecha, hora),
          indice: filas.length,
        });
      } else if (filas.length && enColA.length) {
        filas[filas.length - 1].colA += " " + juntarPalabras(enColA);
      }
    }

    if (!filas.length) return null;

    const orden = [...filas].sort((a, b) =>
      b.serial !== a.serial ? b.serial - a.serial : b.indice - a.indice
    );

    for (const fila of orden) {
      const destino = limpiarServicioFieh(fila.colA);
      const servicios = buscarServiciosConocidosEnTexto(destino);
      if (servicios.length) {
        const s = servicios[servicios.length - 1];
        return {
          origen: s.origen,
          valor: s.valor,
          fuente: "RUTA_MOVIMIENTO",
          fecha: fila.fecha,
          hora: fila.hora,
        };
      }
    }
    return null;
  }
  return null;
}

/** Respaldo por texto plano, para plantillas donde no se ubique el encabezado por coordenadas. */
function extraerUltimoServicioRutaPorTexto(texto: string): Movimiento | null {
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

  interface MovimientoTexto extends Movimiento {
    indice: number;
    serial: number;
  }

  const movimientos: MovimientoTexto[] = [];
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

function extraerUltimoServicioRuta(doc: DocumentoExtraido, texto: string): Movimiento | null {
  return extraerUltimoServicioRutaPorCoordenadas(doc) ?? extraerUltimoServicioRutaPorTexto(texto);
}

interface ServicioIngresoB {
  origen: string;
  /**
   * Valor SIMMOW ya resuelto, cuando viene de `buscarServiciosConocidosEnTexto`
   * (coincidencia exacta o por patrón). Si viene undefined, el llamador debe
   * resolverlo con `mapearServicioSIMMOW(origen)` — pero OJO: cuando el
   * "origen" es un extracto de texto crudo (no un nombre de servicio real),
   * remapearlo después casi nunca funciona. Por eso esta función siempre
   * intenta traer el valor ya resuelto en vez de dejarlo para después.
   */
  valor?: string;
}

/**
 * "Servicio en la que ingresa" / "Servicio al que ingresa" (Parte B). Dos
 * variantes vistas en FIEH reales, ambas por el mismo motivo (una celda de
 * tabla envuelve a una segunda línea) y ambas rompían el aplanado a texto
 * corrido de extraerServicioIngresoParteB:
 *
 * 1. La ETIQUETA envuelve ("Servicio en la que" / "ingresa:") y el VALOR
 *    también es largo (p. ej. "Cirugía Hombres 1"): su primera palabra
 *    queda pegada a la primera línea de la etiqueta y el resto a la
 *    segunda. Aplanado a texto, solo sobrevive "Hombres 1" suelto → mapeo
 *    por defecto a Medicina Interna en vez de Cirugía.
 * 2. La etiqueta cabe entera en una línea ("Servicio en la que ingresa:")
 *    pero es el VALOR el que envuelve por su cuenta (p. ej. "Servicio de
 *    Oncologia" → "Servicio de" en la primera línea, "Oncologia" sola en
 *    la siguiente, sin ninguna etiqueta ahí). Aplanado a texto, solo
 *    sobrevive "Servicio de" — sin la última palabra no coincide con
 *    ningún servicio conocido, y el fuzzy-match de mapearServicioSIMMOW
 *    termina resolviendo al primer "Servicio de X" del catálogo que
 *    empiece igual (Cardiología), no al servicio real (Oncología).
 *
 * Mismo tipo de bug que ya se resolvió para "Traslado a:" en la Ruta de
 * Movimiento — se resuelve igual, leyendo por coordenadas: se ubica dónde
 * termina la etiqueta (en una línea o dos) y se junta todo lo que quede a
 * la derecha de ella, en esa línea y en la de abajo si la hay.
 */
function extraerServicioIngresoPorCoordenadas(doc: DocumentoExtraido): ServicioIngresoB | null {
  // pt — separa "etiqueta" de "valor" en la misma línea. El espacio normal
  // entre palabras de una misma etiqueta medido en FIEH reales es de
  // 2-3pt; el salto hacia la columna de valor puede ser tan chico como 9pt
  // (etiqueta corta que ya trae el valor pegado) o mucho más grande.
  const UMBRAL_GAP = 6;
  const LINEA_ABAJO_MIN = 6;
  const LINEA_ABAJO_MAX = 16;

  for (const pagina of doc.paginas) {
    const candidatos = pagina.items.filter(
      (it) => sinAcentos(it.str).trim().toLowerCase() === "servicio"
    );

    for (const itemServicio of candidatos) {
      const y0 = itemServicio.y;
      const fila0 = pagina.items
        .filter((it) => Math.abs(it.y - y0) <= 3)
        .sort((a, b) => a.x - b.x);
      const idx0 = fila0.indexOf(itemServicio);
      const siguiente = sinAcentos(fila0[idx0 + 1]?.str || "").trim().toLowerCase();
      if (siguiente !== "en" && siguiente !== "al") continue; // no es "Servicio en la que"/"Servicio al que"

      const idxQue = fila0.findIndex(
        (it, i) => i > idx0 && sinAcentos(it.str).trim().toLowerCase() === "que"
      );
      if (idxQue < 0) continue;

      let finEtiqueta0 = fila0[idxQue].x + fila0[idxQue].w;
      let etiquetaCompleta = false;

      // "ingresa:" puede venir pegado en la misma línea que "...que" (la
      // etiqueta entera cabe en una línea) — si es así, sigue siendo parte
      // de la etiqueta, nunca del valor.
      const posibleIngresa0 = fila0[idxQue + 1];
      if (
        posibleIngresa0 &&
        /^ingresa:?$/i.test(sinAcentos(posibleIngresa0.str).trim()) &&
        posibleIngresa0.x - finEtiqueta0 <= UMBRAL_GAP
      ) {
        finEtiqueta0 = posibleIngresa0.x + posibleIngresa0.w;
        etiquetaCompleta = true;
      }

      const valor0 = fila0.filter((it) => it.x > finEtiqueta0 + UMBRAL_GAP);

      // Línea inmediatamente debajo (envoltura de la etiqueta y/o del valor
      // — misma celda de la tabla, una sola línea más abajo).
      let valor1: typeof fila0 = [];
      const itemsAbajo = pagina.items.filter(
        (it) => y0 - it.y >= LINEA_ABAJO_MIN && y0 - it.y <= LINEA_ABAJO_MAX
      );
      if (itemsAbajo.length) {
        const y1 = itemsAbajo[0].y;
        const fila1 = pagina.items
          .filter((it) => Math.abs(it.y - y1) <= 3)
          .sort((a, b) => a.x - b.x);

        const itemIngresa1 = fila1.find(
          (it) => /^ingresa:?$/i.test(sinAcentos(it.str).trim()) && Math.abs(it.x - itemServicio.x) <= 8
        );
        if (itemIngresa1) {
          // Caso 1: la etiqueta envolvió, "ingresa:" está en esta línea.
          const finEtiqueta1 = itemIngresa1.x + itemIngresa1.w;
          valor1 = fila1.filter((it) => it.x > finEtiqueta1 + UMBRAL_GAP);
          etiquetaCompleta = true;
        } else if (etiquetaCompleta) {
          // Caso 2: la etiqueta ya terminó arriba — esta línea es solo la
          // continuación del valor. Se restringe a la columna del valor
          // (no toda la línea) para no arrastrar texto de otra columna.
          const xValor = valor0.length ? Math.min(...valor0.map((it) => it.x)) : itemServicio.x;
          valor1 = fila1.filter((it) => it.x >= xValor - 15);
        }
      }

      // Sin forma de confirmar dónde termina la etiqueta (ni en esta línea
      // ni en la de abajo), no es seguro tomar valor0 solo — mejor no
      // resolver este candidato que arriesgar un valor incompleto.
      if (!etiquetaCompleta) continue;

      const valorTexto = [...valor0, ...valor1]
        .map((it) => it.str)
        .join(" ")
        .trim();
      if (!valorTexto) continue;

      const servicios = buscarServiciosConocidosEnTexto(valorTexto);
      if (servicios.length) {
        return { origen: servicios[0].origen, valor: servicios[0].valor };
      }
      const limpio = limpiarServicioFieh(valorTexto);
      if (limpio) return { origen: limpio };
    }
  }

  return null;
}

function extraerServicioIngresoParteB(texto: string): ServicioIngresoB {
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
    if (servicios.length) return { origen: servicios[0].origen, valor: servicios[0].valor };

    const limpio = limpiarServicioFieh(ventana);
    if (limpio) return { origen: limpio };
  }

  // Respaldo: buscar dentro del bloque B completo. Esta es la ruta que se
  // toma cuando "Servicio en la que ingresa:" viene partido en dos líneas
  // (con el valor intercalado) y el patrón de arriba no matchea.
  const base = sinAcentos(texto);
  const bloqueBMatch = base.match(
    /B\.?\s*DATOS\s+DEL\s+INGRESO([\s\S]*?)(?:C\.?\s*RUTA\s+DE\s+MOVIMIENTOS?|D\.?\s*DATOS\s+DEL\s+EGRESO|$)/i
  );
  if (bloqueBMatch) {
    const bloqueB = bloqueBMatch[1] || "";
    const servicios = buscarServiciosConocidosEnTexto(bloqueB);
    if (servicios.length) {
      const ultimo = servicios[servicios.length - 1];
      return { origen: ultimo.origen, valor: ultimo.valor };
    }

    // buscarServiciosConocidosEnTexto ya intenta este mismo respaldo por
    // patrón internamente, pero cuando lo activa devuelve como "origen" un
    // extracto arbitrario del texto (no necesariamente relacionado con el
    // patrón que encontró) — por eso aquí se vuelve a inferir directamente
    // sobre bloqueB y se arma un origen descriptivo real, conservando el
    // valor SIMMOW correcto en vez de perderlo.
    const valorInferido = inferirServicioPorPatron(bloqueB);
    if (valorInferido) {
      const b = normServicioHospitalario(bloqueB);
      if (b.includes("cuidados intermedios")) {
        return { origen: "Unidad de Cuidados Intermedios detectada en FIEH", valor: valorInferido };
      }
      if (
        b.includes("cuidados intensivos") ||
        b.includes("neurointensivos") ||
        b.includes("cuidados coronarios") ||
        b.includes("extracorporea")
      ) {
        return { origen: "Unidad de Cuidados Intensivos detectada en FIEH", valor: valorInferido };
      }
      if (b.includes("convenio") || b.includes("isbm")) {
        return { origen: "Servicio de Convenio detectado en FIEH", valor: valorInferido };
      }
      if (b.includes("terapia intervencionista endovascular")) {
        return { origen: "Unidad de Terapia Intervencionista Endovascular", valor: valorInferido };
      }
      return { origen: "Servicio hospitalario detectado por patrón en FIEH", valor: valorInferido };
    }
  }

  return { origen: "" };
}

function extraerServicioHospitalario(doc: DocumentoExtraido, texto: string): ServicioDetectado {
  // Prioridad 1: último traslado del literal C.
  const ruta = extraerUltimoServicioRuta(doc, texto);
  if (ruta && ruta.origen) {
    return {
      origen: ruta.origen,
      valor: mapearServicioSIMMOW(ruta.origen),
      fuente: ruta.fuente,
      detalle: `${ruta.fecha} ${ruta.hora}`.trim(),
    };
  }

  // Prioridad 2: servicio en la que ingresa (parte B). Por coordenadas
  // primero (evita perder la primera palabra del valor cuando envuelve a
  // dos líneas junto con la etiqueta); si no se ubica, respaldo por texto.
  const ingreso = extraerServicioIngresoPorCoordenadas(doc) ?? extraerServicioIngresoParteB(texto);
  return {
    origen: ingreso.origen,
    valor: ingreso.valor ?? (ingreso.origen ? mapearServicioSIMMOW(ingreso.origen) : ""),
    fuente: ingreso.origen ? "INGRESO" : "",
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
        // El texto de un diagnóstico suele terminar en palabras como
        // "primaria)" — sin el (?<![A-Za-z]) de abajo, el marcador del
        // SIGUIENTE segmento ("a)") matchea ahí mismo (la "a" final de
        // "primaria" + el paréntesis de cierre de la palabra), cortando el
        // texto antes de llegar al código CIE-10 real y dejándolo vacío.
        "\\s*\\)\\s*([\\s\\S]*?)(?=\\s*(?:(?<![A-Za-z])" +
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

  // El FIEH imprime este bloque en orden visual INVERSO al alfabético:
  // c) aparece primero (arriba), luego b), y a) al final (abajo) — se ubica
  // cada uno por su letra literal, no por posición. SIMMOW en cambio numera
  // los complementarios 1, 2, 3 en orden alfabético normal (a→1, b→2, c→3),
  // así que lo que el FIEH marca "a)" debe terminar en el complementario 1
  // de SIMMOW (res.c, que alimenta ese campo — ver DIAG_C_* en extraerFieh),
  // lo de "c)" en el 3 (res.a), y "b)" se queda en medio en ambos órdenes.
  const dxC = extraerSegmento("c", "b\\s*\\)");
  const dxB = extraerSegmento("b", "a\\s*\\)");
  const dxA = extraerSegmento("a", "II\\s*\\)");
  res.c = dxA;
  res.b = dxB;
  res.a = dxC;

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
  // "10" opcional: a veces queda desplazado DESPUÉS del código en vez de
  // antes (ver comentario en extraerFieh, Diagnóstico principal).
  const patronCodigoCIE10 = "Codigo\\s*CIE\\s*[-\\s]*(?:10)?\\s*:?";

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
  //
  // "No. Afiliación:" tiene el mismo problema pero al revés: cuando "Tipo
  // documento: ... Identidad" se envuelve, la palabra "Identidad" se lleva
  // consigo a "Afiliación:" a la línea de abajo, dejando en la línea de
  // arriba "No. <VALOR>" solo — es decir, el propio VALOR numérico queda
  // ANTES de su etiqueta, no después. Antes se exigía "No.? Afiliación:"
  // pegado antes de capturar, así que ese envoltorio rompía la búsqueda
  // entera (nunca encontraba "Afiliación:" inmediatamente después de "No.")
  // y tipo Y número quedaban vacíos los dos. Ahora "Afiliación:" es opcional
  // después de "No.", igual que ya se hacía con "Tipo de".
  datos.TIPO_AFILIACION = buscar(
    plano,
    /Tipo\s+de\s+(?:afiliaci[oó]n:?\s*)?(.*?)\s*No\.?\s/i
  );
  datos.NUM_AFILIACION = soloNumeros(
    buscar(
      plano,
      /Tipo\s+de\s+(?:afiliaci[oó]n:?\s*)?.*?\s*No\.?\s*(?:Afiliaci[oó]n:?\s*)?([A-Z0-9\-/]+)/i
    )
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

  const circunstanciaAlta = circunstanciaAltaPorCheckbox(doc);
  const seguimiento = referidoRetornoSeguimientoPorCheckbox(doc, circunstanciaAlta);
  datos.REFERIDO_A_ESTABLECIMIENTO = seguimiento.referidoA;
  // Regex sobre texto plano primero (caso etiqueta contigua); si la etiqueta
  // "Nombre del establecimiento (referido de:)" viene partida en varias
  // líneas, cae al respaldo por coordenadas.
  datos.REFERIDO_DEL_ESTABLECIMIENTO =
    extraerReferidoDelEstablecimiento(plano) ||
    extraerReferidoDelEstablecimientoPorCoordenadas(doc) ||
    extraerReferidoDelEstablecimientoEtiquetaCompleta(doc);
  datos.RETORNO_HACIA = seguimiento.retorno;
  if (seguimiento.advertencia) advertencias.push(seguimiento.advertencia);

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
  const servicio = extraerServicioHospitalario(doc, texto);
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
  //
  // "Código CIE-10:" a veces llega con el "10:" desplazado DESPUÉS del
  // código en vez de antes (p. ej. "Código CIE- J15.8 10:") — un elemento de
  // posición fija en la plantilla que no se mueve con el ancho del código
  // cuando este es corto. Se hace "10" opcional para no depender de su
  // posición exacta.
  const dxPrincipal = plano.match(
    new RegExp(
      "Diagn[oó]stico\\s+principal\\s*(?:\\(d\\))?\\s*:\\s*([\\s\\S]*?)\\s*C[oó]digo\\s*CIE\\s*[-\\s]*(?:10)?\\s*:?\\s*([A-Z]\\s*\\d\\s*\\d(?:\\s*[\\.,]\\s*\\d{1,2})?)",
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

  datos.MOTIVO_ALTA_VALOR = circunstanciaAlta;
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
