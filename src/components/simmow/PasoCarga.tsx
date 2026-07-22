"use client";

import { useState } from "react";
import type { DragEvent } from "react";
import { Upload, AlertTriangle } from "lucide-react";
import { extraerDocumento } from "@/lib/simmow/pdfEngine";
import { esFieh } from "@/lib/simmow/fiehExtractor";
import { esCertificado } from "@/lib/simmow/certificadoExtractor";

type Condicion = "VIVO" | "MUERTO";
type Zona = "fieh" | "certificado";

export interface DatosCarga {
  condicion: Condicion;
  archivoFieh: File;
  archivoCertificado: File | null;
}

interface Props {
  procesando: boolean;
  error: string | null;
  onProcesar: (datos: DatosCarga) => void;
}

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100";

const dropzoneCls =
  "flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl py-8 cursor-pointer hover:border-blue-400 dark:hover:border-[#c9a892] transition-colors";

const dropzoneActivaCls = "border-blue-400 dark:border-[#c9a892] bg-blue-50 dark:bg-[#c9a892]/10";

/** Clasifica un PDF suelto extrayendo su texto y probando contra los mismos
 * detectores de tipo de documento que usa el paso de procesamiento. */
async function clasificarArchivo(file: File): Promise<Zona | null> {
  try {
    const doc = await extraerDocumento(file);
    if (esFieh(doc.textoCompleto)) return "fieh";
    if (esCertificado(doc.textoCompleto)) return "certificado";
  } catch {
    // Archivo no legible como PDF digital: se trata como no detectado.
  }
  return null;
}

function NombreArchivo({ archivo }: { archivo: File | null }) {
  if (!archivo) return null;
  return (
    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 truncate">
      Seleccionado: {archivo.name}
    </p>
  );
}

export function PasoCarga({ procesando, error, onProcesar }: Props) {
  const [condicion, setCondicion] = useState<Condicion>("VIVO");
  const [archivoFieh, setArchivoFieh] = useState<File | null>(null);
  const [archivoCertificado, setArchivoCertificado] = useState<File | null>(null);
  const [zonaArrastrando, setZonaArrastrando] = useState<Zona | null>(null);
  const [detectando, setDetectando] = useState(false);
  const [errorDrop, setErrorDrop] = useState<string | null>(null);

  const esMuerto = condicion === "MUERTO";
  const listo = !!archivoFieh && (!esMuerto || !!archivoCertificado);
  const bloqueado = procesando || detectando;

  const cambiarCondicion = (nueva: Condicion) => {
    setCondicion(nueva);
    if (nueva === "VIVO") setArchivoCertificado(null);
  };

  const procesar = () => {
    if (!archivoFieh || (esMuerto && !archivoCertificado)) return;
    onProcesar({ condicion, archivoFieh, archivoCertificado });
  };

  const sobreArrastre = (zona: Zona) => (e: DragEvent) => {
    e.preventDefault();
    if (!bloqueado) setZonaArrastrando(zona);
  };

  const salirArrastre = () => setZonaArrastrando(null);

  /**
   * Al soltar UN archivo se asigna directo a la casilla donde se soltó. Al
   * soltar DOS a la vez (caso fallecido: siempre uno es FIEH y el otro
   * Certificado), se extraen ambos y se clasifican automáticamente por su
   * contenido para asignarlos sin importar en cuál casilla cayeron; si no
   * se logra identificar los dos con certeza, no se adivina — se pide
   * soltarlos uno a la vez.
   */
  const soltar = (zona: Zona) => async (e: DragEvent) => {
    e.preventDefault();
    setZonaArrastrando(null);
    if (bloqueado) return;

    const archivos = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    if (archivos.length === 0) return;
    setErrorDrop(null);

    if (archivos.length === 1 || !esMuerto) {
      if (zona === "fieh") setArchivoFieh(archivos[0]);
      else setArchivoCertificado(archivos[0]);
      return;
    }

    if (archivos.length > 2) {
      setErrorDrop("Suelte como máximo 2 archivos PDF: el FIEH y el Certificado de Defunción.");
      return;
    }

    setDetectando(true);
    try {
      const [tipoA, tipoB] = await Promise.all([
        clasificarArchivo(archivos[0]),
        clasificarArchivo(archivos[1]),
      ]);
      const fieh = tipoA === "fieh" ? archivos[0] : tipoB === "fieh" ? archivos[1] : null;
      const cert =
        tipoA === "certificado" ? archivos[0] : tipoB === "certificado" ? archivos[1] : null;

      if (fieh && cert) {
        setArchivoFieh(fieh);
        setArchivoCertificado(cert);
      } else {
        setErrorDrop(
          "No se pudo identificar automáticamente cuál archivo es el FIEH y cuál el " +
            "Certificado de Defunción. Suéltelos uno a la vez en su casilla correspondiente."
        );
      }
    } finally {
      setDetectando(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
          1. Condición del paciente
        </h2>
        <div className="flex gap-4 text-sm text-slate-700 dark:text-slate-200">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="condicion"
              checked={condicion === "VIVO"}
              onChange={() => cambiarCondicion("VIVO")}
              disabled={bloqueado}
            />
            Vivo
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="condicion"
              checked={condicion === "MUERTO"}
              onChange={() => cambiarCondicion("MUERTO")}
              disabled={bloqueado}
            />
            Fallecido
          </label>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
          2. Subir FIEH (Formulario de Ingreso y Egreso Hospitalario)
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          El PDF se procesa aquí mismo en el navegador — no se sube a ningún servidor.
          {esMuerto && " Puede arrastrar el FIEH y el Certificado juntos sobre cualquiera de las dos casillas."}
        </p>
        <label
          className={dropzoneCls + (zonaArrastrando === "fieh" ? " " + dropzoneActivaCls : "")}
          onDragOver={sobreArrastre("fieh")}
          onDragLeave={salirArrastre}
          onDrop={soltar("fieh")}
        >
          <Upload className="h-7 w-7 text-slate-400" />
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Clic o arrastre aquí el PDF del FIEH
          </span>
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={bloqueado}
            onChange={(e) => setArchivoFieh(e.target.files?.[0] ?? null)}
          />
        </label>
        <NombreArchivo archivo={archivoFieh} />
      </div>

      {esMuerto && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
            3. Subir Certificado de Defunción
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Obligatorio para pacientes fallecidos — trae las causas de defunción (numeral 13).
          </p>
          <label
            className={dropzoneCls + (zonaArrastrando === "certificado" ? " " + dropzoneActivaCls : "")}
            onDragOver={sobreArrastre("certificado")}
            onDragLeave={salirArrastre}
            onDrop={soltar("certificado")}
          >
            <Upload className="h-7 w-7 text-slate-400" />
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Clic o arrastre aquí el PDF del Certificado
            </span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={bloqueado}
              onChange={(e) => setArchivoCertificado(e.target.files?.[0] ?? null)}
            />
          </label>
          <NombreArchivo archivo={archivoCertificado} />
        </div>
      )}

      {detectando && (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Identificando cuál archivo es el FIEH y cuál el Certificado de Defunción...
        </div>
      )}

      {(error || errorDrop) && (
        <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{errorDrop || error}</span>
        </div>
      )}

      <button
        onClick={procesar}
        disabled={!listo || bloqueado}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
      >
        {procesando ? "Procesando..." : "Subir y extraer datos"}
      </button>
    </div>
  );
}
