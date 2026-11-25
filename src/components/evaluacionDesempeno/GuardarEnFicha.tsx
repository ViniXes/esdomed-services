"use client";

// Botón de la lista "Evaluadas": guarda la hoja de la evaluación semestral (la
// misma de "Vista de impresión") como PDF en la pestaña Evaluaciones de la ficha
// de la persona, como si el admin la subiera a mano: un registro del archivero
// (evaluaciones_personal) con el PDF en la carpeta del evaluado. Así cada quien
// la ve en su ficha, de solo lectura (las reglas solo dejan leer al dueño o al
// admin, y solo el admin crea o cambia registros).
// Un registro por evaluación (id `semestral_{evaluación}`): volver a darle
// reemplaza el PDF por el actual, sin duplicar. Sin nota 0–10, para que no
// cuente en las sugerencias de evaluaciones futuras.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileCheck2, FileUp, Loader2 } from "lucide-react";
import { deleteObject, ref as storageRef } from "firebase/storage";
import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from "@/lib/firestoreMeter";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { AdjuntoBitacora } from "@/types";
import { calificacionDe, factoresCompletos, puntajeDe, type EvaluacionDesempeno } from "@/lib/evaluacionDesempeno";
import { EvaluacionDesempenoPrintLayout } from "@/components/evaluacionDesempeno/EvaluacionDesempenoPrintLayout";
import { subirAdjunto } from "@/components/personal/EvaluacionesPersonal";

/** Marca de los registros del archivero que salen de este botón. */
export const ORIGEN_EVALUACION_SEMESTRAL = "evaluacion_desempeno";
export const idRegistroSemestral = (evaluacionId: string) => `semestral_${evaluacionId}`;

const pad = (n: number) => String(n).padStart(2, "0");
const isoLocal = (f: Date) => `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}`;
const comoFecha = (v: unknown): Date | null => {
  const d = v instanceof Date ? v : ((v as { toDate?: () => Date } | null)?.toDate?.() ?? null);
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/** Lo mismo que imprime el editor: el puntaje sale de las letras y las firmas llevan el día de la evaluación. */
function hojaDeEvaluacion(e: EvaluacionDesempeno) {
  const respuestas = e.respuestas ?? {};
  const puntaje = puntajeDe(respuestas);
  return {
    datos: e.datos,
    respuestas,
    puntaje,
    calificacion: factoresCompletos(respuestas) ? calificacionDe(puntaje) : null,
    incidentes: e.incidentes ?? [],
    observacionesIncidentes: e.observacionesIncidentes ?? "",
    tiempoSupervisar: e.tiempoSupervisar ?? "",
    comentariosEvaluador: e.comentariosEvaluador ?? "",
    fechaEvaluador: e.fechaEvaluador ?? "",
    fechaJefeSuperior: e.fechaJefeSuperior ?? "",
    comentariosEvaluado: e.comentariosEvaluado ?? "",
    fechaEvaluado: e.fechaEvaluado ?? "",
    acciones: e.acciones ?? "",
    fechaAcciones: e.fechaAcciones ?? "",
    formato: e.formato ?? "mpe",
    fechaEvaluacion: isoLocal(comoFecha(e.creadoEn) ?? new Date()),
  };
}

/** Cada hoja carta a imagen y todas juntas en un PDF carta. */
async function pdfDeHojas(raiz: HTMLElement): Promise<Blob> {
  const [{ toJpeg }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  await document.fonts?.ready;
  await Promise.all([...raiz.querySelectorAll("img")].map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => {}))));
  const hojas = [...raiz.querySelectorAll<HTMLElement>(".eval-desempeno .hoja")];
  if (!hojas.length) throw new Error("No se pudo armar la hoja.");
  const pdf = new jsPDF({ orientation: "portrait", unit: "in", format: "letter", compress: true });
  for (let i = 0; i < hojas.length; i++) {
    const imagen = await toJpeg(hojas[i], {
      quality: 0.92,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      skipFonts: true, // la hoja usa fuentes del sistema
      style: { margin: "0", boxShadow: "none" },
    });
    if (i > 0) pdf.addPage("letter", "portrait");
    pdf.addImage(imagen, "JPEG", 0, 0, 8.5, 11);
  }
  return pdf.output("blob");
}

/** Arma la hoja fuera de la vista (dentro del mismo árbol, para que carguen sus estilos) y la convierte a PDF. */
function CapturaHoja({ evaluacion, alTerminar }: { evaluacion: EvaluacionDesempeno; alTerminar: (r: Blob | Error) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const terminar = useRef(alTerminar);
  useEffect(() => {
    let cancelado = false;
    const raiz = ref.current;
    if (!raiz) return;
    pdfDeHojas(raiz)
      .then((blob) => !cancelado && terminar.current(blob))
      .catch((e) => !cancelado && terminar.current(e instanceof Error ? e : new Error("No se pudo armar el PDF.")));
    return () => {
      cancelado = true;
    };
  }, []);
  return createPortal(
    <div ref={ref} aria-hidden style={{ position: "fixed", left: 0, top: 0, opacity: 0, pointerEvents: "none", zIndex: -1 }}>
      <EvaluacionDesempenoPrintLayout ev={hojaDeEvaluacion(evaluacion)} />
    </div>,
    document.body,
  );
}

export function BotonGuardarEnFicha({
  evaluacion,
  guardada,
  onGuardada,
}: {
  evaluacion: EvaluacionDesempeno;
  /** Ya tiene su PDF en la ficha. */
  guardada: boolean;
  onGuardada: (evaluacionId: string) => void;
}) {
  const { user, profile } = useAuth();
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async (resultado: Blob | Error) => {
    try {
      if (resultado instanceof Error) throw resultado;
      if (!user || !profile || !evaluacion.id) throw new Error("Sin sesión.");
      const nombre = `Evaluación semestral ${evaluacion.periodo} - ${evaluacion.empleadoNombre}.pdf`;
      const adjunto = await subirAdjunto(evaluacion.empleadoId, new File([resultado], nombre, { type: "application/pdf" }), () => {});
      const registro = doc(db, "evaluaciones_personal", idRegistroSemestral(evaluacion.id));
      const anterior = (await getDoc(registro)).data() as { archivos?: AdjuntoBitacora[] } | undefined;
      const dia = evaluacion.fechaEvaluador ? new Date(`${evaluacion.fechaEvaluador}T00:00:00`) : (comoFecha(evaluacion.creadoEn) ?? new Date());
      await setDoc(
        registro,
        {
          empleadoId: evaluacion.empleadoId,
          empleadoNombre: evaluacion.empleadoNombre,
          categoria: "evaluacion",
          tipo: "Evaluación semestral",
          notas: `Periodo ${evaluacion.periodo}`,
          fecha: Timestamp.fromDate(new Date(dia.getFullYear(), dia.getMonth(), dia.getDate())),
          archivos: [adjunto],
          registradaPorId: user.uid,
          registradaPorNombre: profile.nombre,
          creadoEn: serverTimestamp(),
          origen: ORIGEN_EVALUACION_SEMESTRAL,
          evaluacionDesempenoId: evaluacion.id,
        },
        { merge: true },
      );
      // El PDF anterior (si se actualizó) ya no lo usa nadie.
      await Promise.all(
        (anterior?.archivos ?? [])
          .filter((a) => a.storagePath && a.storagePath !== adjunto.storagePath)
          .map((a) => deleteObject(storageRef(storage, a.storagePath)).catch(() => {})),
      );
      setError("");
      onGuardada(evaluacion.id);
    } catch (e) {
      console.error(e);
      setError("No se pudo guardar en su ficha. Intenta de nuevo.");
    } finally {
      setGenerando(false);
    }
  };

  const titulo = generando
    ? "Guardando en su ficha…"
    : error || (guardada ? "Ya está en su ficha (Evaluaciones). Clic para actualizarla." : "Guardar en su ficha (Evaluaciones)");

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          setGenerando(true);
        }}
        disabled={generando}
        title={titulo}
        aria-label={`${titulo} · ${evaluacion.empleadoNombre}`}
        className={`flex shrink-0 items-center border-l border-slate-100 px-4 transition-colors hover:bg-blue-50 disabled:cursor-wait dark:border-slate-800 dark:hover:bg-blue-950/40 ${
          error
            ? "text-rose-600 dark:text-rose-400"
            : guardada
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-slate-400 hover:text-blue-700 dark:hover:text-blue-300"
        }`}
      >
        {generando ? <Loader2 size={17} className="animate-spin" /> : guardada && !error ? <FileCheck2 size={17} /> : <FileUp size={17} />}
      </button>
      {generando && <CapturaHoja evaluacion={evaluacion} alTerminar={guardar} />}
    </>
  );
}
