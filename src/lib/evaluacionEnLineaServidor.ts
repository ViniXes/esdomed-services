import { randomUUID } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { jsPDF } from "jspdf";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { EVALUACION_EN_LINEA, LETRAS_OPCIONES, periodoSV } from "@/lib/evaluacionEnLinea";
import { CLAVES_EVALUACION } from "@/lib/evaluacionEnLineaClaves";
import { NOTA_MINIMA_EVALUACION } from "@/lib/evaluacionesPersonal";
import { normalizarCodigoMarcacion } from "@/lib/esdomed/catalogo-plan";
import type { FilaPlanTrabajo, PlanTrabajo } from "@/types";

// SOLO SERVIDOR. Plan del mes, hoja PDF del resultado y registro en la ficha
// (archivero evaluaciones_personal, pestaña Evaluaciones), con nota 0–10.

export const ORIGEN_EVALUACION_EN_LINEA = "evaluacion_en_linea";
export const idRegistroFicha = (uid: string) => `conocimientos_${EVALUACION_EN_LINEA.id}_${uid}`;

/** Fila del plan del mes de cada persona (por uid, respaldo por código de marcación). */
export async function filasDelPlan(): Promise<{ porUid: Map<string, FilaPlanTrabajo>; porCodigo: Map<string, FilaPlanTrabajo> }> {
  const snap = await adminDb.collection("planes_trabajo").doc(periodoSV()).get();
  const filas = ((snap.data() as PlanTrabajo | undefined)?.filas ?? []) as FilaPlanTrabajo[];
  const porUid = new Map<string, FilaPlanTrabajo>();
  const porCodigo = new Map<string, FilaPlanTrabajo>();
  for (const f of filas) {
    if (f.uid) porUid.set(f.uid, f);
    const c = normalizarCodigoMarcacion(f.codigoMarcacion);
    if (c) porCodigo.set(c, f);
  }
  return { porUid, porCodigo };
}

export function filaDe(
  plan: { porUid: Map<string, FilaPlanTrabajo>; porCodigo: Map<string, FilaPlanTrabajo> },
  uid: string,
  codigo?: string,
): FilaPlanTrabajo | undefined {
  return plan.porUid.get(uid) ?? plan.porCodigo.get(normalizarCodigoMarcacion(codigo));
}

const fechaSV = (ms: number) =>
  new Intl.DateTimeFormat("es-SV", { timeZone: "America/El_Salvador", day: "2-digit", month: "2-digit", year: "numeric" }).format(ms);
const horaSV = (ms: number) =>
  new Intl.DateTimeFormat("es-SV", { timeZone: "America/El_Salvador", hour: "numeric", minute: "2-digit", hour12: true }).format(ms);

export interface DatosHoja {
  nombre: string;
  grupo: string;
  clave: number;
  respuestas: number[];
  puntaje: number;
  total: number;
  iniciadaEnMs: number;
  entregadaEnMs: number;
}

/**
 * Hoja carta con el resultado. Muestra la respuesta que marcó la persona en
 * cada pregunta, pero NO cuál era la correcta ni si acertó: la ficha la ve el
 * propio empleado y las respuestas no se le muestran (pedido del usuario).
 */
export function pdfResultado(d: DatosHoja): Buffer {
  const pdf = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const ancho = pdf.internal.pageSize.getWidth();
  const alto = pdf.internal.pageSize.getHeight();
  const margen = 54;
  const util = ancho - margen * 2;
  let y = margen;

  const pie = () => {
    pdf.setDrawColor(26, 78, 112);
    pdf.setLineWidth(0.6);
    pdf.line(margen, alto - 40, ancho - margen, alto - 40);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text("HNES | Evaluación de conocimientos | Lineamientos internos 2026", margen, alto - 28);
    pdf.text(`Clave ${d.clave} | Evaluación en línea · ESDOMED Services`, ancho - margen, alto - 28, { align: "right" });
  };
  const saltoSiHaceFalta = (necesita: number) => {
    if (y + necesita <= alto - 56) return;
    pie();
    pdf.addPage("letter", "portrait");
    y = margen;
  };

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(26, 78, 112);
  pdf.text(`Examen · Clave ${d.clave}`, margen, y + 6);
  y += 24;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(71, 85, 105);
  pdf.text("HOSPITAL NACIONAL EL SALVADOR", margen, y);
  y += 13;
  pdf.text(EVALUACION_EN_LINEA.tema, margen, y);
  y += 13;
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(26, 78, 112);
  pdf.text("RESULTADO · Evaluación en línea", margen, y);
  y += 16;

  // Datos y nota
  const aprobada = (d.puntaje * 10) / d.total >= NOTA_MINIMA_EVALUACION;
  pdf.setDrawColor(203, 213, 225);
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(margen, y, util, 70, 6, 6, "FD");
  pdf.setFontSize(10);
  pdf.setTextColor(22, 25, 28);
  const fila = (etiqueta: string, valor: string, x: number, yy: number) => {
    pdf.setFont("helvetica", "bold");
    pdf.text(`${etiqueta}:`, x, yy);
    pdf.setFont("helvetica", "normal");
    pdf.text(valor, x + pdf.getTextWidth(`${etiqueta}: `), yy);
  };
  fila("Nombre", d.nombre, margen + 12, y + 18);
  fila("Área", d.grupo || "—", margen + 12, y + 34);
  fila("Fecha", fechaSV(d.entregadaEnMs), margen + 12, y + 50);
  fila("Inicio", horaSV(d.iniciadaEnMs), margen + 150, y + 50);
  fila("Entrega", horaSV(d.entregadaEnMs), margen + 260, y + 50);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.setTextColor(26, 78, 112);
  pdf.text(`${d.puntaje} / ${d.total}`, ancho - margen - 14, y + 34, { align: "right" });
  pdf.setFontSize(10);
  if (aprobada) pdf.setTextColor(4, 120, 87);
  else pdf.setTextColor(190, 18, 60);
  pdf.text(aprobada ? "Aprobada" : "Reprobada", ancho - margen - 14, y + 52, { align: "right" });
  y += 86;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  pdf.text("Cada respuesta correcta vale 1 punto. Se marca la opción elegida por el evaluado.", margen, y);
  y += 18;

  const { preguntas } = CLAVES_EVALUACION[d.clave];
  preguntas.forEach((p, i) => {
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    const enunciado = pdf.splitTextToSize(`${i + 1}. ${p.texto}`, util) as string[];
    const opciones = p.opciones.map((o, j) => pdf.splitTextToSize(`${LETRAS_OPCIONES[j]}) ${o}`, util - 34) as string[]);
    const altoBloque = enunciado.length * 13 + opciones.reduce((s, o) => s + o.length * 12 + 2, 0) + 10;
    saltoSiHaceFalta(altoBloque);
    pdf.setTextColor(22, 25, 28);
    pdf.text(enunciado, margen, y);
    y += enunciado.length * 13;
    opciones.forEach((lineas, j) => {
      const elegida = d.respuestas[i] === j;
      pdf.setFont("helvetica", elegida ? "bold" : "normal");
      pdf.setFontSize(9.5);
      pdf.setTextColor(elegida ? 26 : 71, elegida ? 78 : 85, elegida ? 112 : 105);
      pdf.text(elegida ? "(X)" : "(   )", margen + 10, y);
      pdf.text(lineas, margen + 34, y);
      y += lineas.length * 12 + 2;
    });
    y += 8;
  });
  pie();
  return Buffer.from(pdf.output("arraybuffer"));
}

/**
 * Guarda la hoja en la ficha: PDF en Storage (carpeta del evaluado, como las
 * que sube el admin) y el registro del archivero con la nota. Un registro por
 * persona y evaluación: repetirlo reemplaza el PDF sin duplicar.
 */
export async function guardarEnFicha(uid: string, d: DatosHoja): Promise<void> {
  const contenido = pdfResultado(d);
  const bucket = adminStorage.bucket();
  const nombre = `Evaluación de conocimientos - Clave ${d.clave} - ${d.nombre}.pdf`;
  const seguro = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_");
  const storagePath = `evaluaciones_personal/${uid}/${Date.now()}_${seguro}`;
  const token = randomUUID();
  await bucket.file(storagePath).save(contenido, {
    resumable: false,
    contentType: "application/pdf",
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;

  const ref = adminDb.collection("evaluaciones_personal").doc(idRegistroFicha(uid));
  const anterior = (await ref.get()).data() as { archivos?: { storagePath?: string }[] } | undefined;
  const dia = new Date(d.entregadaEnMs - 6 * 3600 * 1000);
  await ref.set({
    empleadoId: uid,
    empleadoNombre: d.nombre,
    categoria: "evaluacion",
    tipo: "Evaluación de conocimientos — Lineamientos internos 2026",
    notas: `Evaluación en línea · Clave ${d.clave} · ${d.puntaje} de ${d.total} correctas`,
    // Medianoche del día en El Salvador (como las que registra el admin a mano).
    fecha: Timestamp.fromDate(new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), 6))),
    nota: Math.round(((d.puntaje * 10) / d.total) * 10) / 10,
    archivos: [{ url, nombre, tipo: "pdf", tamano: contenido.length, storagePath }],
    registradaPorId: ORIGEN_EVALUACION_EN_LINEA,
    registradaPorNombre: "Evaluación en línea",
    creadoEn: FieldValue.serverTimestamp(),
    origen: ORIGEN_EVALUACION_EN_LINEA,
    evaluacionEnLineaId: EVALUACION_EN_LINEA.id,
  });
  await Promise.all(
    (anterior?.archivos ?? [])
      .filter((a) => a.storagePath && a.storagePath !== storagePath)
      .map((a) => bucket.file(a.storagePath as string).delete().catch(() => {})),
  );
}
