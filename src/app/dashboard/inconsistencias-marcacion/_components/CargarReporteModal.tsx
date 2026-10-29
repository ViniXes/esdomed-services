"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, X } from "lucide-react";
import { doc, serverTimestamp, writeBatch } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { extraerItemsPdf } from "@/lib/inconsistenciasMarcacion/pdf";
import { leerReporteDescuentos, nombreMes, type ResultadoLectura } from "@/lib/inconsistenciasMarcacion/parser";
import { formatoDinero } from "@/lib/inconsistenciasMarcacion/analisis";
import { borrarCopiasDelMes, COLECCION_INCONSISTENCIAS } from "@/lib/inconsistenciasMarcacion/personal";
import type { ReporteInconsistenciasMarcacion } from "@/types";

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Subir el PDF del mes: se lee en el navegador, se muestra una vista previa
 * con los controles de cuadre y, si el admin confirma, se guarda (o reemplaza)
 * `inconsistencias_marcacion/{YYYY-MM}`.
 */
export function CargarReporteModal({
  existentes,
  onCerrar,
  onGuardado,
}: {
  existentes: Map<string, ReporteInconsistenciasMarcacion>;
  onCerrar: () => void;
  onGuardado: (periodo: string) => void;
}) {
  const { profile } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [lectura, setLectura] = useState<ResultadoLectura | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const leer = async (f: File) => {
    setArchivo(f);
    setLectura(null);
    setError(null);
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setError("El archivo debe ser el PDF del reporte de descuentos.");
      return;
    }
    setLeyendo(true);
    try {
      setLectura(leerReporteDescuentos(await extraerItemsPdf(f)));
    } catch (e) {
      setError(`No se pudo leer el PDF: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setLeyendo(false);
    }
  };

  const reporte = lectura?.reporte ?? null;
  const previo = reporte ? existentes.get(reporte.periodo) : undefined;
  const etiquetaMes = reporte ? `${capitalizar(nombreMes(reporte.mes))} ${reporte.anio}` : "";
  const dias = reporte?.empleados.reduce((a, e) => a + e.dias.length, 0) ?? 0;

  const guardar = async () => {
    if (!reporte || !archivo || !profile) return;
    setGuardando(true);
    setError(null);
    try {
      // Reemplazar un mes retira lo publicado al personal (el documento nuevo
      // no trae `publicacion`): el admin revisa la versión nueva y la vuelve a publicar.
      const batch = writeBatch(db);
      if (previo) await borrarCopiasDelMes(batch, reporte.periodo);
      batch.set(doc(db, COLECCION_INCONSISTENCIAS, reporte.periodo), {
        ...reporte,
        archivoNombre: archivo.name,
        cargadoEn: serverTimestamp(),
        cargadoPorId: profile.uid,
        cargadoPorNombre: profile.nombre,
      });
      await batch.commit();
      onGuardado(reporte.periodo);
    } catch (e) {
      setError(`No se pudo guardar: ${e instanceof Error ? e.message : "error"}`);
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-cargar-reporte">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 id="titulo-cargar-reporte" className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading">Cargar reporte del mes</h2>
            <p className="text-xs text-slate-500">PDF &quot;Reporte Descuentos&quot; que envía RRHH. El mes se toma del título del reporte.</p>
          </div>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void leer(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastrando(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void leer(f);
            }}
            disabled={leyendo || guardando}
            className={`flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
              arrastrando
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
                : "border-slate-300 hover:border-blue-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
            }`}
          >
            {leyendo ? <Loader2 size={22} className="animate-spin text-blue-600 dark:text-blue-400" /> : <FileUp size={22} className="text-blue-600 dark:text-blue-400" />}
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {leyendo ? "Leyendo el PDF…" : archivo ? archivo.name : "Arrastra el PDF aquí o toca para elegirlo"}
            </span>
            {archivo && !leyendo && <span className="text-xs text-slate-500">Toca para elegir otro archivo</span>}
          </button>

          {error && <Alerta tono="error" mensajes={[error]} />}
          {lectura && lectura.errores.length > 0 && (
            <Alerta tono="error" titulo="No se puede guardar este reporte" mensajes={lectura.errores} />
          )}

          {reporte && (
            <>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Reporte de</p>
                <p className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">{etiquetaMes}</p>
                <p className="text-xs text-slate-500">
                  Unidad {reporte.unidad}
                  {reporte.fechaImpresion && <> · impreso el {reporte.fechaImpresion}</>}
                </p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Dato label="Personas" valor={String(reporte.empleados.length)} />
                  <Dato label="Días con incidencia" valor={String(dias)} />
                  <Dato label="Total general" valor={formatoDinero(reporte.totalGeneral)} />
                </dl>
              </div>

              {lectura!.avisos.length === 0 ? (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                  <span>Los montos de cada día cuadran con el total de cada persona y con el Total General del reporte.</span>
                </div>
              ) : (
                <Alerta tono="aviso" titulo="Revisa antes de guardar" mensajes={lectura!.avisos} />
              )}

              {previo && (
                <Alerta
                  tono="aviso"
                  mensajes={[
                    `Ya hay un reporte de ${etiquetaMes} cargado por ${previo.cargadoPorNombre}${
                      previo.cargadoEn ? ` el ${previo.cargadoEn.toLocaleDateString("es-SV")}` : ""
                    } (${formatoDinero(previo.totalGeneral)}). Si guardas, se reemplaza.`,
                    ...(previo.publicacion
                      ? ["Ese mes está publicado al personal: al reemplazarlo se retira la publicación hasta que revises la versión nueva y la vuelvas a publicar."]
                      : []),
                  ]}
                />
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <button type="button" onClick={onCerrar} disabled={guardando} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={!reporte || guardando || leyendo}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {guardando && <Loader2 size={14} className="animate-spin" />}
            {guardando ? "Guardando…" : previo ? "Reemplazar reporte" : "Guardar reporte"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-2 dark:bg-slate-800/60">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="text-base font-bold text-slate-900 dark:text-slate-100">{valor}</dd>
    </div>
  );
}

export function Alerta({ tono, titulo, mensajes }: { tono: "error" | "aviso"; titulo?: string; mensajes: string[] }) {
  const cls =
    tono === "error"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400"
      : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${cls}`}>
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <div className="min-w-0 space-y-1">
        {titulo && <p className="font-semibold">{titulo}</p>}
        {mensajes.length === 1 ? (
          <p>{mensajes[0]}</p>
        ) : (
          <ul className="list-disc space-y-0.5 pl-4">
            {mensajes.slice(0, 8).map((m) => <li key={m}>{m}</li>)}
            {mensajes.length > 8 && <li>…y {mensajes.length - 8} más.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
