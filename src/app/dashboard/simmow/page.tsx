"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileCode2, CheckCircle2, Copy, Check, AlertTriangle } from "lucide-react";
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
import { generarScriptConsola } from "@/lib/simmow/generadorScript";
import { cargarEstablecimientos, mejorCoincidenciaEstablecimiento } from "@/lib/simmow/establecimientos";
import { cargarMedicos, mejorCoincidenciaMedico } from "@/lib/simmow/medicos";
import type { DatosSimmow, DocumentoExtraido, ResultadoExtraccion } from "@/lib/simmow/types";
import { PasoCarga, type DatosCarga } from "@/components/simmow/PasoCarga";
import { FormularioRevision } from "@/components/simmow/FormularioRevision";

type Paso = "carga" | "revision";

/**
 * Reemplaza los tres campos de establecimiento con el nombre EXACTO del
 * catálogo real de SIMMOW cuando hay una coincidencia confiable (el FIEH
 * puede traer el nombre en otro orden o con leves diferencias). Si no hay
 * suficiente certeza, deja el texto tal como se extrajo del FIEH para que
 * el personal lo busque/corrija a mano en el formulario.
 */
async function sugerirEstablecimientosDelCatalogo(datos: DatosSimmow): Promise<DatosSimmow> {
  const campos: Array<"REFERIDO_A_ESTABLECIMIENTO" | "REFERIDO_DEL_ESTABLECIMIENTO" | "RETORNO_HACIA"> = [
    "REFERIDO_A_ESTABLECIMIENTO",
    "REFERIDO_DEL_ESTABLECIMIENTO",
    "RETORNO_HACIA",
  ];
  if (!campos.some((campo) => datos[campo])) return datos;

  const catalogo = await cargarEstablecimientos();
  const actualizado = { ...datos };

  for (const campo of campos) {
    const valor = actualizado[campo];
    if (!valor) continue;
    const coincidencia = mejorCoincidenciaEstablecimiento(catalogo, valor);
    if (coincidencia) actualizado[campo] = coincidencia.nombre;
  }

  return actualizado;
}

/**
 * Resuelve el código interno de SIMMOW para el médico responsable del alta,
 * buscando por NOMBRE (el mismo en SIS y SIMMOW) contra el catálogo real de
 * médicos — el JVPM del SIS no coincide con el código que SIMMOW espera en
 * ese campo, por eso el nombre nunca precargaba automáticamente antes. Si no
 * hay una coincidencia única y confiable, deja el código vacío para que el
 * personal lo busque/confirme a mano.
 */
async function sugerirMedicoDelCatalogo(datos: DatosSimmow): Promise<DatosSimmow> {
  if (!datos.MEDICO_RESPONSABLE_ALTA) return datos;

  const catalogo = await cargarMedicos();
  const coincidencia = mejorCoincidenciaMedico(catalogo, datos.MEDICO_RESPONSABLE_ALTA);
  if (!coincidencia) return datos;

  return { ...datos, MEDICO_RESPONSABLE_CODIGO_SIMMOW: coincidencia.codigo };
}

export default function SimmowPage() {
  const router = useRouter();
  const { profile, loading } = useAuth();

  const [paso, setPaso] = useState<Paso>("carga");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documento, setDocumento] = useState<DocumentoExtraido | null>(null);
  const [resultado, setResultado] = useState<ResultadoExtraccion | null>(null);
  const [datos, setDatos] = useState<DatosSimmow | null>(null);
  const [errorGeneracion, setErrorGeneracion] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

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
      datosFinal = await sugerirEstablecimientosDelCatalogo(datosFinal);
      datosFinal = await sugerirMedicoDelCatalogo(datosFinal);

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
    setErrorGeneracion(null);
    setCopiado(false);
    setError(null);
    setPaso("carga");
  };

  const copiarCodigo = async () => {
    if (!datos) return;
    if (!datos.EDAD_ANIOS.trim()) {
      setErrorGeneracion(
        "Falta la edad en años (EDAD_ANIOS). Complétela en el formulario antes de generar el código."
      );
      return;
    }
    setErrorGeneracion(null);
    const codigo = generarScriptConsola(datos, resultado?.advertencias ?? []);

    try {
      await navigator.clipboard.writeText(codigo);
    } catch {
      // Navegadores sin permiso/soporte para el Clipboard API: respaldo con
      // un textarea invisible + execCommand, sin mostrar el código en pantalla.
      const textarea = document.createElement("textarea");
      textarea.value = codigo;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
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

            {errorGeneracion && (
              <div className="mb-4 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
                {errorGeneracion}
              </div>
            )}

            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2 mb-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Este código no presiona &quot;Grabar&quot; en SIMMOW. Abra SIMMOW, entre a la pantalla de
                Ingreso/Egreso del paciente, presione F12 para abrir la consola, pegue el código, presione
                Enter, y revise cada campo antes de grabar manualmente.
              </span>
            </div>

            <button
              onClick={copiarCodigo}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiado ? "Copiado correctamente" : "Copiar código para SIMMOW"}
            </button>
          </div>

          <FormularioRevision
            datos={datos}
            camposNoEncontrados={resultado.camposNoEncontrados}
            onChange={actualizar}
          />
        </div>
      )}
    </div>
  );
}
