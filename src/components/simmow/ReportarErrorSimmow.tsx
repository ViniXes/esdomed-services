"use client";

import { useEffect, useRef, useState } from "react";
import { X, Check, Image as ImageIcon, Loader2, Inbox } from "lucide-react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  crearReporteBugSimmow,
  listarMisReportesBugsSimmow,
  type FlujoReporteBug,
  type EstadoReporteBug,
  type ReporteBugSimmow,
} from "@/lib/simmow/reportesBugs";

const MAX_IMAGENES = 3;

const ETIQUETA_ESTADO: Record<EstadoReporteBug, string> = {
  pendiente: "Pendiente de revisión",
  confirmado: "Confirmado y corregido",
  no_es_error: "Revisado — no era este error",
};

const ESTILO_ESTADO: Record<EstadoReporteBug, string> = {
  pendiente: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  confirmado: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  no_es_error: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

interface ImagenSeleccionada {
  archivo: File;
  previewUrl: string;
}

/**
 * Canal oficial para reportar un posible error de programación de la
 * herramienta SIMMOW — un espacio de reporte técnico, no un canal de quejas
 * (ver terminosSimmow.ts sección 6). Botón flotante fijo, visible solo
 * dentro de /dashboard/simmow.
 *
 * El personal de ESDOMED que reporta NO ve el listado general de reportes
 * (eso es solo para admin, /dashboard/simmow/reportes) — pero sí puede
 * revisar en la pestaña "Mis reportes" si los suyos ya se resolvieron.
 */
export function ReportarErrorSimmow() {
  const { user, profile } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [vista, setVista] = useState<"reportar" | "mis_reportes">("reportar");

  const [flujo, setFlujo] = useState<FlujoReporteBug>("hospitalaria");
  const [descripcion, setDescripcion] = useState("");
  const [expediente, setExpediente] = useState("");
  const [imagenes, setImagenes] = useState<ImagenSeleccionada[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  const [misReportes, setMisReportes] = useState<ReporteBugSimmow[] | null>(null);
  const [cargandoMisReportes, setCargandoMisReportes] = useState(false);

  useEffect(() => {
    return () => {
      imagenes.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (vista !== "mis_reportes" || !user || misReportes !== null) return;
    queueMicrotask(() => setCargandoMisReportes(true));
    listarMisReportesBugsSimmow(user.uid)
      .then(setMisReportes)
      .finally(() => setCargandoMisReportes(false));
  }, [vista, user, misReportes]);

  if (!user || !profile) return null;

  const agregarImagenes = (archivos: FileList | null) => {
    if (!archivos) return;
    const disponibles = MAX_IMAGENES - imagenes.length;
    const nuevas = Array.from(archivos)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, disponibles)
      .map((archivo) => ({ archivo, previewUrl: URL.createObjectURL(archivo) }));
    setImagenes((prev) => [...prev, ...nuevas]);
    if (inputArchivoRef.current) inputArchivoRef.current.value = "";
  };

  const quitarImagen = (index: number) => {
    setImagenes((prev) => {
      const copia = [...prev];
      const [quitada] = copia.splice(index, 1);
      if (quitada) URL.revokeObjectURL(quitada.previewUrl);
      return copia;
    });
  };

  const enviar = async () => {
    if (!descripcion.trim() || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const imagenesSubidas = await Promise.all(
        imagenes.map(async ({ archivo }) => {
          const storageRef = ref(storage, `reportes_bugs/${user.uid}/${Date.now()}_${archivo.name}`);
          await uploadBytes(storageRef, archivo);
          const url = await getDownloadURL(storageRef);
          return { url, nombre: archivo.name };
        })
      );

      await crearReporteBugSimmow({
        uid: user.uid,
        nombreUsuario: profile.nombre,
        flujo,
        descripcion: descripcion.trim(),
        expediente: expediente.trim(),
        imagenes: imagenesSubidas,
      });
      setEnviado(true);
      setDescripcion("");
      setExpediente("");
      imagenes.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      setImagenes([]);
      setMisReportes(null); // fuerza recarga la próxima vez que se abra "Mis reportes"
    } catch {
      setError("No se pudo enviar el reporte. Intente de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {abierto && (
        <div className="mb-4 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-80 max-w-[calc(100vw-3rem)] animate-in slide-in-from-bottom-5 fade-in duration-200">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Reportar un error de la herramienta</h3>
            <button
              onClick={() => setAbierto(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg mb-3">
            <button
              onClick={() => setVista("reportar")}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                vista === "reportar" ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm" : "text-slate-500"
              }`}
            >
              Reportar
            </button>
            <button
              onClick={() => setVista("mis_reportes")}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                vista === "mis_reportes" ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm" : "text-slate-500"
              }`}
            >
              Mis reportes
            </button>
          </div>

          {vista === "mis_reportes" ? (
            <div className="max-h-80 overflow-y-auto space-y-2">
              {cargandoMisReportes ? (
                <p className="text-xs text-slate-400 text-center py-4">Cargando…</p>
              ) : !misReportes || misReportes.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                  <Inbox className="h-6 w-6 text-slate-300" />
                  <p className="text-xs text-slate-400">Todavía no has enviado ningún reporte.</p>
                </div>
              ) : (
                misReportes.map((r) => (
                  <div key={r.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-2.5">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 flex-1">{r.descripcion}</p>
                      <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ESTILO_ESTADO[r.estado]}`}>
                        {ETIQUETA_ESTADO[r.estado]}
                      </span>
                    </div>
                    {r.notaAdmin && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 italic mt-1">Nota: {r.notaAdmin}</p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1">
                      {r.fecha ? r.fecha.toLocaleDateString("es-SV") : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          ) : enviado ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <Check className="h-8 w-8 text-green-600" />
              <p className="text-sm text-slate-600 dark:text-slate-300">
                ¡Gracias! Quedó registrado para revisión. Este es un espacio de reporte técnico, así que no aplica
                a datos que ya se hayan grabado antes de enviarlo — pero ayuda a que se revise y mejore la
                herramienta. Podés revisar si ya se resolvió en la pestaña &quot;Mis reportes&quot;.
              </p>
              <button
                onClick={() => {
                  setEnviado(false);
                  setAbierto(false);
                }}
                className="text-xs text-blue-600 hover:underline mt-1"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Use este espacio para un posible error de programación de la herramienta (no para un dato mal
                traído del reporte del SIS, eso se corrige a mano en SIMMOW). Es un reporte técnico y ayuda a
                mejorar la herramienta.
              </p>
              <select
                value={flujo}
                onChange={(e) => setFlujo(e.target.value as FlujoReporteBug)}
                className="w-full text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-900 rounded-lg px-2 py-1.5 text-slate-800 dark:text-slate-100"
              >
                <option value="hospitalaria">Atención Hospitalaria</option>
                <option value="ambulatoria">Atención Ambulatoria</option>
                <option value="otro">Otro</option>
              </select>
              <input
                value={expediente}
                onChange={(e) => setExpediente(e.target.value)}
                placeholder="Expediente (opcional)"
                className="w-full text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-900 rounded-lg px-2 py-1.5 text-slate-800 dark:text-slate-100"
              />
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Describa qué campo o comportamiento no es correcto…"
                rows={4}
                className="w-full text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-900 rounded-lg px-2 py-1.5 text-slate-800 dark:text-slate-100"
              />

              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                  Hasta {MAX_IMAGENES} capturas de pantalla (opcional) — a veces es más fácil mostrar el problema que
                  explicarlo.
                </p>
                <div className="flex flex-wrap gap-2">
                  {imagenes.map((img, i) => (
                    <div key={img.previewUrl} className="relative w-14 h-14 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.previewUrl} alt={`Adjunto ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => quitarImagen(i)}
                        className="absolute top-0 right-0 bg-black/60 text-white rounded-bl-lg p-0.5 hover:bg-black/80"
                        title="Quitar imagen"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  {imagenes.length < MAX_IMAGENES && (
                    <button
                      onClick={() => inputArchivoRef.current?.click()}
                      className="w-14 h-14 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-400 transition-colors"
                      title="Agregar imagen"
                    >
                      <ImageIcon size={18} />
                    </button>
                  )}
                </div>
                <input
                  ref={inputArchivoRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => agregarImagenes(e.target.files)}
                />
              </div>

              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
              <button
                onClick={enviar}
                disabled={!descripcion.trim() || enviando}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {enviando && <Loader2 size={14} className="animate-spin" />}
                {enviando ? "Enviando…" : "Enviar reporte"}
              </button>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setAbierto(!abierto)}
        className="w-16 h-16 rounded-full bg-white dark:bg-slate-800 shadow-2xl border-2 border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center hover:scale-105 hover:shadow-blue-500/20 active:scale-95 transition-all"
        title="Reportar un error de la herramienta"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/vault-tec.png" alt="Reportar error" className="w-full h-full object-cover" />
      </button>
    </div>
  );
}
