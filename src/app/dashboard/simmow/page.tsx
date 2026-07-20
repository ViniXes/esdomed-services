"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileCode2, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { extraerDocumento } from "@/lib/simmow/pdfEngine";
import { esFieh, extraerFieh } from "@/lib/simmow/fiehExtractor";
import {
  esCertificado,
  extraerCertificado,
  fusionarCertificado,
  limpiarCamposCertificado,
} from "@/lib/simmow/certificadoExtractor";
import { aplicarReglasCondicionEgreso } from "@/lib/simmow/reglas";
import type { DatosSimmow, DocumentoExtraido, ResultadoExtraccion } from "@/lib/simmow/types";
import { PasoCarga, type DatosCarga } from "@/components/simmow/PasoCarga";
import { FormularioRevision } from "@/components/simmow/FormularioRevision";

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

  const procesar = async ({ condicion, archivoFieh, archivoCertificado }: DatosCarga) => {
    setError(null);
    setProcesando(true);
    try {
      const docFieh = await extraerDocumento(archivoFieh);
      if (!esFieh(docFieh.textoCompleto)) {
        setError(
          docFieh.textoCompleto.trim().length < 100
            ? "El FIEH parece un escaneo (imagen) sin texto digital — esta herramienta solo procesa el PDF generado por el sistema, no fotocopias."
            : "El PDF no parece ser un FIEH (Formulario de Ingreso y Egreso Hospitalario)."
        );
        return;
      }

      const resFieh = extraerFieh(docFieh);
      let datosFinal = resFieh.datos;
      let advertencias = [...resFieh.advertencias];
      let camposNoEncontrados = [...resFieh.camposNoEncontrados];

      // La condición seleccionada manualmente tiene prioridad sobre la casilla
      // detectada en el FIEH (que puede no ser legible en todos los casos).
      datosFinal.CONDICION_EGRESO = condicion;

      if (condicion === "MUERTO") {
        if (!archivoCertificado) {
          setError("Debe subir el Certificado de Defunción para un paciente fallecido.");
          return;
        }

        const docCert = await extraerDocumento(archivoCertificado);
        if (!esCertificado(docCert.textoCompleto)) {
          setError(
            docCert.textoCompleto.trim().length < 100
              ? "El Certificado parece un escaneo (imagen) sin texto digital — esta herramienta solo procesa el PDF generado por el sistema."
              : "El PDF no parece ser un Certificado de Defunción."
          );
          return;
        }

        const resCert = extraerCertificado(docCert);
        datosFinal = fusionarCertificado(datosFinal, resCert.datos);
        advertencias = [...advertencias, ...resCert.advertencias];
        camposNoEncontrados = [...camposNoEncontrados, ...resCert.camposNoEncontrados];
      } else {
        datosFinal = limpiarCamposCertificado(datosFinal);
      }

      datosFinal = aplicarReglasCondicionEgreso(datosFinal);

      setDocumento(docFieh);
      setResultado({ datos: datosFinal, advertencias, camposNoEncontrados });
      setDatos(datosFinal);
      setPaso("revision");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error procesando el PDF.");
    } finally {
      setProcesando(false);
    }
  };

  const actualizar = (patch: Partial<DatosSimmow>) => {
    setDatos((d) => (d ? { ...d, ...patch } : d));
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
        <PasoCarga procesando={procesando} error={error} onProcesar={procesar} />
      )}

      {paso === "revision" && resultado && datos && documento && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Extracción completada — {documento.numPaginas} páginas — {datos.CONDICION_EGRESO}
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

          </div>

          <FormularioRevision
            datos={datos}
            camposNoEncontrados={resultado.camposNoEncontrados}
            onChange={actualizar}
          />

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
