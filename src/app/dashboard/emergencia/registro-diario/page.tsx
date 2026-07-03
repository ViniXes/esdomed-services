"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection, doc, getDocs, query, Timestamp, where, writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertTriangle, CheckCircle2, FileSpreadsheet, ListChecks, Loader2, RefreshCw, Upload,
} from "lucide-react";
import { DateField } from "@/components/ui/DateField";
import { toDate } from "@/lib/pacientes/helpers";
import {
  localizarFilasRegistro, mapearFilaRegistro, type DatosRegistroDiario,
} from "@/lib/emergencia/registroDiarioMapper";

const pad = (n: number) => String(n).padStart(2, "0");
const toDia = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

interface Candidato { dedupId: string; expediente: string; datos: DatosRegistroDiario }

// Sin undefined en Firestore: se limpian las claves vacías.
function aFirestore(datos: DatosRegistroDiario): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(datos).forEach(([k, v]) => { if (v !== undefined) out[k] = v; });
  return out;
}

export default function RegistroDiarioPage() {
  const { profile } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  // El reporte del SIS no trae fecha: ESDOMED indica de qué día es.
  const [fechaReporte, setFechaReporte] = useState(() => toDia(new Date()));
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Vista del día: qué hay cargado para la fecha elegida.
  const [cargados, setCargados] = useState<{ id: string; expediente: string; subservicio?: string; dx?: string; ingreso: boolean }[]>([]);
  const [cargandoLista, setCargandoLista] = useState(false);

  const cargarDia = useCallback(async () => {
    setCargandoLista(true);
    try {
      const desde = new Date(fechaReporte + "T00:00:00");
      const hasta = new Date(fechaReporte + "T23:59:59");
      const snap = await getDocs(query(
        collection(db, "registro_diario_emergencia"),
        where("fechaReporte", ">=", Timestamp.fromDate(desde)),
        where("fechaReporte", "<=", Timestamp.fromDate(hasta)),
      ));
      setCargados(snap.docs
        .map((d) => {
          const r = d.data();
          return {
            id: d.id,
            expediente: r.expediente as string,
            subservicio: r.subservicio as string | undefined,
            dx: r.diagnosticoPrincipal?.descripcion as string | undefined,
            ingreso: !!r.ingresoHospitalario,
            fecha: toDate(r.importadoEn)?.getTime() ?? 0,
          };
        })
        .sort((a, b) => a.expediente.localeCompare(b.expediente)));
    } catch (e) {
      setError(`No se pudo cargar el día: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setCargandoLista(false);
    }
  }, [fechaReporte]);

  useEffect(() => {
    const t = setTimeout(() => { cargarDia(); }, 0);
    return () => clearTimeout(t);
  }, [cargarDia]);

  const procesarArchivo = async (file: File) => {
    if (!profile) return;
    setError(null);
    setOk(null);
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xls") && !lower.endsWith(".xlsx")) {
      setError(`"${file.name}" no parece el Registro Diario de Emergencia (.xls).`);
      return;
    }
    setNombreArchivo(file.name);
    setProcesando(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      // raw:true — el reporte trae códigos como texto (sexo "1", ingreso "2");
      // se conserva el texto crudo y el mapper decide.
      const wb = XLSX.read(new Uint8Array(buf), { type: "array", raw: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const matriz = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const filas = localizarFilasRegistro(matriz);
      if (filas.length === 0) {
        setError("No se encontró la tabla del Registro Diario en el archivo. ¿Es el reporte correcto?");
        return;
      }

      // Mapeo + dedup determinista expediente__fecha (dentro del archivo y contra Firestore).
      const candidatos = new Map<string, Candidato>();
      let invalidas = 0;
      filas.forEach((row) => {
        const m = mapearFilaRegistro(row);
        if (!m.valido) { invalidas++; return; }
        const dedupId = `${m.expediente}__${fechaReporte}`;
        candidatos.set(dedupId, { dedupId, expediente: m.expediente, datos: m.datos });
      });

      const ids = Array.from(candidatos.keys());
      const existentes = new Set<string>();
      for (let i = 0; i < ids.length; i += 30) {
        const chunk = ids.slice(i, i + 30);
        const snap = await getDocs(query(
          collection(db, "registro_diario_emergencia"),
          where("__name__", "in", chunk),
        ));
        snap.forEach((d) => existentes.add(d.id));
      }
      const nuevos = Array.from(candidatos.values()).filter((c) => !existentes.has(c.dedupId));

      setGuardando(true);
      const ahora = Timestamp.now();
      const fecha = Timestamp.fromDate(new Date(fechaReporte + "T00:00:00"));
      let batch = writeBatch(db);
      let ops = 0;
      for (const n of nuevos) {
        batch.set(doc(db, "registro_diario_emergencia", n.dedupId), {
          ...aFirestore(n.datos),
          fechaReporte: fecha,
          importadoEn: ahora,
          importadoPorId: profile.uid,
          importadoPorNombre: profile.nombre,
          archivoOrigen: file.name,
        });
        if (++ops >= 400) { await batch.commit(); batch = writeBatch(db); ops = 0; }
      }
      if (ops > 0) await batch.commit();

      setOk(
        `${nuevos.length} paciente${nuevos.length === 1 ? "" : "s"} agregado${nuevos.length === 1 ? "" : "s"} al ${fechaReporte.split("-").reverse().join("/")}` +
        (existentes.size ? ` · ${existentes.size} ya estaban cargados` : "") +
        (invalidas ? ` · ${invalidas} filas omitidas` : ""),
      );
      cargarDia();
    } catch (e) {
      setError(`Error al importar: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setProcesando(false);
      setGuardando(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-rose-50 dark:bg-rose-950 rounded-xl flex items-center justify-center border border-rose-200 dark:border-rose-900">
          <ListChecks size={17} className="text-rose-600 dark:text-rose-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Registro diario de emergencia</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Reporte del SIS con los pacientes que ENTRAN a emergencia. Alimenta el prellenado de
            identidad (edad y sexo) en los censos de los médicos.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {ok && (
        <div className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
          <span>{ok}</span>
        </div>
      )}

      {/* Fecha + zona de carga */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">El reporte corresponde al día</span>
          <DateField value={fechaReporte} onChange={setFechaReporte} ariaLabel="Fecha del reporte" />
          <span className="text-xs text-slate-400">(el archivo del SIS no trae fecha — se registra con esta)</span>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files?.length) procesarArchivo(e.dataTransfer.files[0]); }}
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
            accept=".xls,.xlsx"
            onChange={(e) => { if (e.target.files?.length) procesarArchivo(e.target.files[0]); e.target.value = ""; }}
            className="hidden"
          />
          {procesando || guardando ? (
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <Loader2 size={26} className="animate-spin text-blue-500" />
              <p className="text-sm font-medium">{guardando ? "Guardando..." : `Analizando ${nombreArchivo}...`}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 flex items-center justify-center">
                <Upload size={20} className="text-rose-600 dark:text-rose-400" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Arrastra el Registro Diario aquí o haz clic para seleccionar
              </p>
              <p className="text-xs text-slate-500">Los expedientes ya cargados para ese día se omiten automáticamente.</p>
            </div>
          )}
        </div>
      </div>

      {/* Lo cargado para el día */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">
            <FileSpreadsheet size={14} className="inline mr-1.5 text-slate-400" />
            {cargados.length} paciente{cargados.length === 1 ? "" : "s"} cargado{cargados.length === 1 ? "" : "s"} el {fechaReporte.split("-").reverse().join("/")}
          </p>
          <button
            onClick={cargarDia}
            disabled={cargandoLista}
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={cargandoLista ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
        {cargandoLista ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : cargados.length === 0 ? (
          <p className="text-sm text-slate-400 italic px-4 pb-5">Aún no se ha importado el reporte de este día.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  {["Expediente", "Subservicio", "Diagnóstico principal", "Ingresa"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {cargados.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-300">{c.expediente}</td>
                    <td className="px-4 py-2 text-xs text-slate-600 dark:text-slate-400">{c.subservicio ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-slate-600 dark:text-slate-400 max-w-[320px] truncate">{c.dx ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        c.ingreso
                          ? "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700"
                      }`}>
                        {c.ingreso ? "Sí" : "No"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
