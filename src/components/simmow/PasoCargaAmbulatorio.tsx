"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import {
  localizarFilas,
  mapearFilaEmergencia,
  type FilaEmergenciaMapeada,
} from "@/lib/emergencia/importMapper";
import {
  localizarFilasRegistro,
  mapearFilaRegistro,
  type FilaMapeada,
} from "@/lib/emergencia/registroDiarioMapper";

export interface DatosCargaAmbulatorio {
  filasEmergencia: FilaEmergenciaMapeada[];
  filasRegistro: FilaMapeada[];
}

interface Props {
  procesando: boolean;
  error: string | null;
  onProcesar: (datos: DatosCargaAmbulatorio) => void;
}

type Clasificacion = "pacientes_atendidos" | "registro_diario" | "desconocido";

async function leerMatriz(file: File): Promise<unknown[][]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
}

function clasificar(matriz: unknown[][]): Clasificacion {
  if (localizarFilas(matriz).length > 0) return "pacientes_atendidos";
  if (localizarFilasRegistro(matriz).length > 0) return "registro_diario";
  return "desconocido";
}

/**
 * Sube los dos reportes del SIS que hoy ESDOMED cruza a mano por expediente
 * ("Pacientes Atendidos En Emergencia" + "Registro Diario de Emergencia").
 * Un solo cuadro de arrastre acepta ambos archivos a la vez (o uno por uno) y
 * los clasifica automáticamente leyendo su encabezado — igual que el flujo
 * hospitalario clasifica FIEH vs. Certificado de Defunción.
 */
export function PasoCargaAmbulatorio({ procesando, error, onProcesar }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [pacientesAtendidos, setPacientesAtendidos] = useState<{ nombre: string; filas: FilaEmergenciaMapeada[] } | null>(null);
  const [registroDiario, setRegistroDiario] = useState<{ nombre: string; filas: FilaMapeada[] } | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setErrorLocal(null);
    setAnalizando(true);
    try {
      for (const file of Array.from(files)) {
        const matriz = await leerMatriz(file);
        const clase = clasificar(matriz);
        if (clase === "pacientes_atendidos") {
          setPacientesAtendidos({ nombre: file.name, filas: localizarFilas(matriz).map(mapearFilaEmergencia) });
        } else if (clase === "registro_diario") {
          setRegistroDiario({ nombre: file.name, filas: localizarFilasRegistro(matriz).map(mapearFilaRegistro) });
        } else {
          setErrorLocal(`"${file.name}" no parece ninguno de los dos reportes de emergencia esperados.`);
        }
      }
    } catch (e) {
      setErrorLocal(`Error al leer el archivo: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setAnalizando(false);
    }
  };

  const listo = !!pacientesAtendidos && !!registroDiario;

  return (
    <div className="space-y-4">
      {(error || errorLocal) && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error || errorLocal}</span>
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl px-6 py-10 text-center cursor-pointer transition-all ${
          dragActive
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
            : "border-slate-300 dark:border-slate-700 hover:border-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/30"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx,.html,.htm"
          multiple
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          className="hidden"
        />
        {analizando ? (
          <div className="flex flex-col items-center gap-2 text-slate-500">
            <Loader2 size={28} className="animate-spin text-blue-500" />
            <p className="text-sm font-medium">Analizando archivo(s)...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-500">
            <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 flex items-center justify-center">
              <Upload size={20} className="text-rose-600 dark:text-rose-400" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Arrastra los dos reportes aquí (o haz clic) — pueden ir juntos o uno por uno
            </p>
            <p className="text-xs text-slate-400">
              &ldquo;Pacientes Atendidos En Emergencia&rdquo; + &ldquo;Registro Diario de Emergencia&rdquo;
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: "Pacientes Atendidos En Emergencia", dato: pacientesAtendidos },
          { label: "Registro Diario de Emergencia", dato: registroDiario },
        ].map(({ label, dato }) => (
          <div
            key={label}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
              dato
                ? "border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 text-slate-400"
            }`}
          >
            {dato ? <CheckCircle2 size={16} className="flex-shrink-0" /> : <FileSpreadsheet size={16} className="flex-shrink-0" />}
            <div className="min-w-0">
              <div className="font-medium">{label}</div>
              <div className="text-xs truncate opacity-80">
                {dato ? `${dato.nombre} — ${dato.filas.length} filas` : "Falta subir"}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        disabled={!listo || procesando}
        onClick={() => listo && onProcesar({ filasEmergencia: pacientesAtendidos!.filas, filasRegistro: registroDiario!.filas })}
        className="flex items-center gap-1.5 px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
      >
        {procesando ? <Loader2 size={16} className="animate-spin" /> : null}
        Cruzar reportes y ver pacientes
      </button>
    </div>
  );
}
