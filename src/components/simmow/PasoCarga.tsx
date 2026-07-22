"use client";

import { useState } from "react";
import { Upload, AlertTriangle } from "lucide-react";

type Condicion = "VIVO" | "MUERTO";

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

  const esMuerto = condicion === "MUERTO";
  const listo = !!archivoFieh && (!esMuerto || !!archivoCertificado);

  const cambiarCondicion = (nueva: Condicion) => {
    setCondicion(nueva);
    if (nueva === "VIVO") setArchivoCertificado(null);
  };

  const procesar = () => {
    if (!archivoFieh || (esMuerto && !archivoCertificado)) return;
    onProcesar({ condicion, archivoFieh, archivoCertificado });
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
              disabled={procesando}
            />
            Vivo
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="condicion"
              checked={condicion === "MUERTO"}
              onChange={() => cambiarCondicion("MUERTO")}
              disabled={procesando}
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
        </p>
        <label className={dropzoneCls}>
          <Upload className="h-7 w-7 text-slate-400" />
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Clic para seleccionar el PDF del FIEH
          </span>
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={procesando}
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
          <label className={dropzoneCls}>
            <Upload className="h-7 w-7 text-slate-400" />
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Clic para seleccionar el PDF del Certificado
            </span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={procesando}
              onChange={(e) => setArchivoCertificado(e.target.files?.[0] ?? null)}
            />
          </label>
          <NombreArchivo archivo={archivoCertificado} />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        onClick={procesar}
        disabled={!listo || procesando}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
      >
        {procesando ? "Procesando..." : "Subir y extraer datos"}
      </button>
    </div>
  );
}
