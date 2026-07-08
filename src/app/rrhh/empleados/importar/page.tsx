"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  collection, doc, getDocs, Timestamp, writeBatch,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { ArrowLeft, Upload, AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import type { Empleado } from "@/types";
import { mapearEmpleado } from "@/lib/rrhh/importEmpleados";

interface Resultado {
  total: number;
  importados: number;
  omitidos: number;
  motivos: string[];
}

export default function ImportarEmpleadosPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const onFile = async (file: File) => {
    setError(null);
    setResultado(null);
    if (!file.name.toLowerCase().match(/\.xlsm?$|\.xls$/)) {
      setError(`"${file.name}" no es un archivo Excel (.xlsx / .xlsm / .xls).`);
      return;
    }
    setProcesando(true);
    setProgreso("Leyendo archivo…");
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });

      // Preferir la hoja CONSULTA; si no existe, usar la primera.
      const nombreHoja =
        wb.SheetNames.find((n) => /consulta/i.test(n)) ?? wb.SheetNames[0];
      const sheet = wb.Sheets[nombreHoja];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

      if (rows.length === 0) {
        setError(`La hoja "${nombreHoja}" está vacía.`);
        setProcesando(false);
        return;
      }

      // Mapear y deduplicar por código (se queda el último).
      const porCodigo = new Map<string, Empleado>();
      const motivos: string[] = [];
      let omitidos = 0;
      for (const row of rows) {
        const { empleado, motivo } = mapearEmpleado(row);
        if (!empleado) {
          omitidos++;
          if (motivo && motivos.length < 10) motivos.push(motivo);
          continue;
        }
        porCodigo.set(empleado.codigo, empleado);
      }

      // Códigos ya existentes (para marcar actualizadoEn vs importadoEn).
      setProgreso("Verificando padrón existente…");
      const existentesSnap = await getDocs(collection(db, "empleados"));
      const existentes = new Set(existentesSnap.docs.map((d) => d.id));

      // Escritura por lotes (máx 500 ops por batch).
      const empleados = [...porCodigo.values()];
      const LOTE = 400;
      let escritos = 0;
      for (let i = 0; i < empleados.length; i += LOTE) {
        const batch = writeBatch(db);
        for (const emp of empleados.slice(i, i + LOTE)) {
          const ref = doc(db, "empleados", emp.codigo);
          const data: Record<string, unknown> = {
            ...emp,
            fechaIngreso: emp.fechaIngreso ? Timestamp.fromDate(emp.fechaIngreso) : null,
            actualizadoEn: Timestamp.now(),
          };
          if (!existentes.has(emp.codigo)) data.importadoEn = Timestamp.now();
          batch.set(ref, data, { merge: true });
        }
        await batch.commit();
        escritos += empleados.slice(i, i + LOTE).length;
        setProgreso(`Guardando… ${escritos}/${empleados.length}`);
      }

      setResultado({
        total: rows.length,
        importados: empleados.length,
        omitidos,
        motivos,
      });
    } catch (e) {
      setError(`Error al importar: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setProcesando(false);
      setProgreso(null);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/rrhh/empleados" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors" aria-label="Volver">
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Importar padrón</h1>
      </div>

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <p className="text-sm text-slate-500">
          Sube el export del padrón de empleados (.xlsx / .xlsm). Se lee la hoja <strong>CONSULTA</strong>.
          Los empleados se agregan o actualizan por <strong>código de plaza</strong>; no se borra a nadie.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
        />

        <button
          onClick={() => inputRef.current?.click()}
          disabled={procesando}
          className="w-full flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-300 dark:hover:border-blue-800 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors disabled:opacity-60"
        >
          {procesando ? (
            <>
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-slate-500">{progreso ?? "Procesando…"}</span>
            </>
          ) : (
            <>
              <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                <FileSpreadsheet size={22} className="text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Seleccionar archivo Excel</span>
              <span className="text-xs text-slate-400">CONSULTA · .xlsx / .xlsm</span>
            </>
          )}
        </button>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {resultado && (
          <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-900 rounded-xl px-4 py-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-green-700 dark:text-green-400">
              <CheckCircle2 size={15} /> Importación completada
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5">
              {resultado.importados} empleados cargados de {resultado.total} filas.
              {resultado.omitidos > 0 && <> {resultado.omitidos} omitidas.</>}
            </p>
            {resultado.motivos.length > 0 && (
              <ul className="mt-2 text-xs text-slate-500 list-disc list-inside space-y-0.5">
                {resultado.motivos.map((m, i) => <li key={i}>{m}</li>)}
                {resultado.omitidos > resultado.motivos.length && <li>…y {resultado.omitidos - resultado.motivos.length} más</li>}
              </ul>
            )}
            <Link href="/rrhh/empleados" className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-blue-600 hover:underline">
              <Upload size={13} /> Ver empleados
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
