"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileCode2, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { extraerDocumento } from "@/lib/simmow/pdfEngine";
import { esFieh, extraerFieh } from "@/lib/simmow/fiehExtractor";
import type { DatosSimmow, DocumentoExtraido, ResultadoExtraccion } from "@/lib/simmow/types";

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100";

type Paso = "carga" | "revision" | "codigo";

export default function SimmowPage() {
  const router = useRouter();
  const { profile, loading } = useAuth();

  const [paso, setPaso] = useState<Paso>("carga");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documento, setDocumento] = useState<DocumentoExtraido | null>(null);
  const [resultado, setResultado] = useState<ResultadoExtraccion | null>(null);
  const [datos, setDatos] = useState<DatosSimmow | null>(null);

  // Temporalmente solo admin mientras está en pruebas (ver dashboard/layout.tsx).
  useEffect(() => {
    if (!loading && profile && profile.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [loading, profile, router]);

  if (!profile || profile.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const procesarFieh = async (file: File) => {
    setError(null);
    setProcesando(true);
    try {
      const doc = await extraerDocumento(file);
      if (!esFieh(doc.textoCompleto)) {
        setError(
          doc.textoCompleto.trim().length < 100
            ? "El PDF parece un escaneo (imagen) sin texto digital — esta herramienta solo procesa el FIEH generado por el sistema, no fotocopias."
            : "El PDF no parece ser un FIEH (Formulario de Ingreso y Egreso Hospitalario)."
        );
        setProcesando(false);
        return;
      }
      const res = extraerFieh(doc);
      setDocumento(doc);
      setResultado(res);
      setDatos(res.datos);
      setPaso("revision");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error procesando el PDF.");
    } finally {
      setProcesando(false);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) procesarFieh(file);
  };

  const reiniciar = () => {
    setDocumento(null);
    setResultado(null);
    setDatos(null);
    setError(null);
    setPaso("carga");
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <FileCode2 className="h-6 w-6 text-blue-600 dark:text-[#c9a892]" />
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          SIMMOW — Generador de código de llenado
        </h1>
      </div>

      {paso === "carga" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
            1. Subir FIEH (Formulario de Ingreso y Egreso Hospitalario)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            El PDF se procesa aquí mismo en el navegador — no se sube a ningún servidor.
          </p>

          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl py-10 cursor-pointer hover:border-blue-400 dark:hover:border-[#c9a892] transition-colors">
            <Upload className="h-8 w-8 text-slate-400" />
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {procesando ? "Procesando..." : "Clic para seleccionar el PDF del FIEH"}
            </span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={procesando}
              onChange={onFile}
            />
          </label>

          {error && (
            <div className="mt-4 flex items-start gap-2 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {paso === "revision" && resultado && datos && documento && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Extracción completada — {documento.numPaginas} páginas
              </h2>
              <button
                onClick={reiniciar}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Procesar otro
              </button>
            </div>

            {resultado.advertencias.length > 0 && (
              <div className="mb-4 space-y-1">
                {resultado.advertencias.map((a, i) => (
                  <div
                    key={i}
                    className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2"
                  >
                    {a}
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              Panel de depuración temporal — el formulario de revisión definitivo (con CIE-10, selects y validación)
              todavía no está construido. Esto muestra lo que el motor detectó, campo por campo.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              {Object.entries(datos).map(([campo, valor]) => (
                <div
                  key={campo}
                  className={`rounded-lg border px-2 py-1.5 ${
                    resultado.camposNoEncontrados.includes(campo as keyof DatosSimmow)
                      ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20"
                      : "border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <div className="text-slate-400 dark:text-slate-500 truncate">{campo}</div>
                  <div className="text-slate-800 dark:text-slate-200 truncate">
                    {String(valor) || <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <details className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <summary className="text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
              Casillas detectadas por página (debug)
            </summary>
            <div className="mt-3 space-y-3">
              {documento.paginas.map((p) => (
                <div key={p.numero} className="text-xs">
                  <div className="font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Página {p.numero} — {p.checkboxes.length} casillas detectadas
                  </div>
                  <div className={inputCls + " font-mono whitespace-pre-wrap"}>
                    {p.checkboxes.length === 0
                      ? "(sin casillas en esta página)"
                      : p.checkboxes
                          .map(
                            (cb) =>
                              `${cb.marcado ? "[X]" : "[ ]"} "${cb.opcion}" (ratio ${(cb.ratioOscuro * 100).toFixed(1)}%)`
                          )
                          .join("\n")}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
