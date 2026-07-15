"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  collection, doc, documentId, getDocs, query, where, writeBatch, Timestamp,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft, Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2,
  UserPlus, CheckCheck, LogIn, HelpCircle, ChevronDown,
} from "lucide-react";
import {
  localizarFilas, mapearFilaEmergencia, type DatosAtencion,
} from "@/lib/emergencia/importMapper";
import { INGRESO_BADGE, INGRESO_LABEL } from "@/lib/emergencia/helpers";
import { formatFechaHora } from "@/lib/pacientes/helpers";
import type { IngresoHospitalizacion } from "@/types";

type Paso = "subir" | "previsualizar" | "hecho";

interface Nuevo {
  dedupId: string;
  expediente: string;
  nombre: string;
  fecha: Date;
  ingreso: IngresoHospitalizacion;
  datos: DatosAtencion;
}
interface YaImportado { dedupId: string; expediente: string; nombre: string; }
interface Invalido { fila: number; motivo: string; }

interface Diff {
  nuevos: Nuevo[];
  yaImportados: YaImportado[];
  invalidos: Invalido[];
  totalFilas: number;
}

// Convierte los datos parseados (con Date) al shape de Firestore (Timestamp).
function aFirestore(datos: DatosAtencion): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...datos,
    fechaHoraIngreso: Timestamp.fromDate(datos.fechaHoraIngreso),
  };
  if (datos.fechaHoraAltaIngreso) out.fechaHoraAltaIngreso = Timestamp.fromDate(datos.fechaHoraAltaIngreso);
  if (datos.fechaHoraEntradaTriage) out.fechaHoraEntradaTriage = Timestamp.fromDate(datos.fechaHoraEntradaTriage);
  return out;
}

export default function ImportarEmergenciaPage() {
  const { profile } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [paso, setPaso] = useState<Paso>("subir");
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<Diff | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ creados: number } | null>(null);

  const reset = () => {
    setPaso("subir");
    setNombreArchivo("");
    setDiff(null);
    setError(null);
    setResultado(null);
  };

  // ── Parseo + diff ───────────────────────────────────────────────────────
  const procesarArchivo = async (file: File) => {
    setError(null);
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xls") && !lower.endsWith(".xlsx") && !lower.endsWith(".html") && !lower.endsWith(".htm")) {
      setError(`"${file.name}" no parece el reporte de emergencia (.xls).`);
      return;
    }
    setNombreArchivo(file.name);
    setProcesando(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      // raw:true preserva el TEXTO original de las celdas. Es clave para el reporte
      // del SIS (HTML exportado como .xls): sin esto, SheetJS interpreta las fechas
      // "DD/MM/YYYY" como M/D/Y (formato de EE.UU.) y "01/07/2026" (1 de julio) se
      // vuelve 7 de enero. Con el texto crudo, parseFechaHoraEmergencia aplica D/M/Y.
      // Para un .xlsx real las fechas llegan como serial de Excel, ya soportado.
      const wb = XLSX.read(new Uint8Array(buf), { type: "array", raw: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const matriz = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const filas = localizarFilas(matriz);

      if (filas.length === 0) {
        setError("No se encontró la tabla de atenciones en el archivo. ¿Es el reporte correcto?");
        setProcesando(false);
        return;
      }

      // Mapeo + dedup dentro del propio archivo (por id determinista).
      const invalidos: Invalido[] = [];
      const candidatos = new Map<string, Nuevo>();
      filas.forEach((row, i) => {
        const m = mapearFilaEmergencia(row);
        if (!m.valido) {
          invalidos.push({ fila: i + 1, motivo: m.motivoInvalido ?? "fila inválida" });
          return;
        }
        candidatos.set(m.dedupId, {
          dedupId: m.dedupId,
          expediente: m.expediente,
          nombre: m.pacienteNombre,
          fecha: m.datos.fechaHoraIngreso,
          ingreso: m.ingresoHospitalizacion,
          datos: m.datos,
        });
      });

      // ¿Cuáles ya existen en Firestore? (chunks de 30 por restricción de "in").
      const ids = Array.from(candidatos.keys());
      const existentes = new Set<string>();
      for (let i = 0; i < ids.length; i += 30) {
        const chunk = ids.slice(i, i + 30);
        const snap = await getDocs(
          query(collection(db, "atenciones_emergencia"), where(documentId(), "in", chunk)),
        );
        snap.forEach((d) => existentes.add(d.id));
      }

      const nuevos: Nuevo[] = [];
      const yaImportados: YaImportado[] = [];
      candidatos.forEach((c) => {
        if (existentes.has(c.dedupId)) {
          yaImportados.push({ dedupId: c.dedupId, expediente: c.expediente, nombre: c.nombre });
        } else {
          nuevos.push(c);
        }
      });
      nuevos.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

      setDiff({ nuevos, yaImportados, invalidos, totalFilas: filas.length });
      setPaso("previsualizar");
    } catch (e) {
      setError(`Error al leer el archivo: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setProcesando(false);
    }
  };

  // ── Confirmar (escritura) ─────────────────────────────────────────────────
  const confirmar = async () => {
    if (!profile || !diff) return;
    setGuardando(true);
    setError(null);
    try {
      const ahora = Timestamp.now();
      let batch = writeBatch(db);
      let ops = 0;
      for (const n of diff.nuevos) {
        batch.set(doc(db, "atenciones_emergencia", n.dedupId), {
          ...aFirestore(n.datos),
          importadoEn: ahora,
          importadoPorId: profile.uid,
          importadoPorNombre: profile.nombre,
          archivoOrigen: nombreArchivo,
        });
        if (++ops >= 400) { await batch.commit(); batch = writeBatch(db); ops = 0; }
      }
      if (ops > 0) await batch.commit();
      setResultado({ creados: diff.nuevos.length });
      setPaso("hecho");
    } catch (e) {
      setError(`Error al guardar: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setGuardando(false);
    }
  };

  const onFiles = (files: FileList | null) => {
    if (files?.length) procesarArchivo(files[0]);
  };

  const noIngresaron = diff?.nuevos.filter((n) => n.ingreso === "no").length ?? 0;
  const ingresaron = diff?.nuevos.filter((n) => n.ingreso === "si").length ?? 0;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link prefetch={false}
          href="/dashboard/emergencia"
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
            Importar reporte de emergencia
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Sube el reporte del SIS &ldquo;Pacientes Atendidos En Emergencia&rdquo;. Se agregan
            todas las atenciones (hayan ingresado o no); las ya importadas se omiten.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Paso: subir */}
      {paso === "subir" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => { e.preventDefault(); setDragActive(false); onFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl px-6 py-12 text-center cursor-pointer transition-all ${
            dragActive
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
              : "border-slate-300 dark:border-slate-700 hover:border-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/30"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx,.html,.htm"
            onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
            className="hidden"
          />
          {procesando ? (
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <Loader2 size={28} className="animate-spin text-blue-500" />
              <p className="text-sm font-medium">Analizando {nombreArchivo}...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 flex items-center justify-center">
                <Upload size={20} className="text-rose-600 dark:text-rose-400" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Arrastra el reporte aquí o haz clic para seleccionar
              </p>
              <p className="text-xs text-slate-500">Formato del SIS — pacientes atendidos en emergencia (.xls)</p>
            </div>
          )}
        </div>
      )}

      {/* Paso: previsualizar */}
      {paso === "previsualizar" && diff && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <FileSpreadsheet size={15} className="text-rose-500" />
            <span className="font-medium">{nombreArchivo}</span>
            <span className="text-slate-400">· {diff.totalFilas} filas</span>
          </div>

          {/* Tarjetas resumen */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ResumenCard icon={UserPlus}  color="emerald" label="Nuevos"        n={diff.nuevos.length} />
            <ResumenCard icon={LogIn}     color="blue"    label="No ingresaron" n={noIngresaron} />
            <ResumenCard icon={CheckCheck} color="amber"  label="Ingresaron"    n={ingresaron} />
            <ResumenCard icon={HelpCircle} color="slate"  label="Ya importados" n={diff.yaImportados.length} />
          </div>

          <Seccion titulo="Atenciones nuevas a registrar" vacioMsg="No hay atenciones nuevas en el reporte." items={diff.nuevos}>
            {diff.nuevos.map((n) => (
              <div key={n.dedupId} className="flex items-center gap-3 py-2 text-sm">
                <span className="font-mono text-xs text-slate-500 w-20 flex-shrink-0">{n.expediente}</span>
                <span className="font-medium text-slate-800 dark:text-slate-200 truncate flex-1 min-w-0">{n.nombre || "—"}</span>
                <span className="text-xs text-slate-500 whitespace-nowrap hidden sm:inline">{formatFechaHora(n.fecha)}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${INGRESO_BADGE[n.ingreso]}`}>
                  {INGRESO_LABEL[n.ingreso]}
                </span>
              </div>
            ))}
          </Seccion>

          <Seccion titulo="Ya importadas (se omiten)" vacioMsg="Ninguna atención del reporte estaba ya importada." items={diff.yaImportados}>
            {diff.yaImportados.map((y) => (
              <div key={y.dedupId} className="flex items-center gap-3 py-2 text-sm">
                <span className="font-mono text-xs text-slate-500 w-20 flex-shrink-0">{y.expediente}</span>
                <span className="text-slate-600 dark:text-slate-400 truncate flex-1">{y.nombre || "—"}</span>
              </div>
            ))}
          </Seccion>

          {diff.invalidos.length > 0 && (
            <Seccion titulo="Filas omitidas (datos incompletos)" vacioMsg="" items={diff.invalidos}>
              {diff.invalidos.map((iv, i) => (
                <div key={i} className="flex items-center gap-3 py-2 text-sm">
                  <span className="font-mono text-xs text-slate-500 w-20 flex-shrink-0">Fila {iv.fila}</span>
                  <span className="text-xs text-slate-500 flex-1">{iv.motivo}</span>
                </div>
              ))}
            </Seccion>
          )}

          {/* Footer */}
          <div className="sticky bottom-0 bg-gradient-to-t from-slate-50 dark:from-slate-950 via-slate-50/95 dark:via-slate-950/95 to-transparent pt-4 pb-2 -mx-4 px-4 md:-mx-6 md:px-6 flex items-center justify-end gap-3">
            <button
              onClick={reset}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={confirmar}
              disabled={guardando || diff.nuevos.length === 0}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors"
            >
              {guardando ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {guardando ? "Guardando..." : `Registrar ${diff.nuevos.length} atenciones`}
            </button>
          </div>
        </div>
      )}

      {/* Paso: hecho */}
      {paso === "hecho" && resultado && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 flex items-center justify-center mx-auto">
            <CheckCircle2 size={26} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">Importación completa</p>
            <p className="text-sm text-slate-500 mt-1">{resultado.creados} atenciones registradas</p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={reset}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Importar otro
            </button>
            <Link prefetch={false}
              href="/dashboard/emergencia"
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
            >
              Ver atenciones
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

const COLORS: Record<string, string> = {
  emerald: "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400",
  blue: "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-400",
  amber: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400",
  slate: "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300",
};

function ResumenCard({ icon: Icon, color, label, n }: { icon: typeof UserPlus; color: string; label: string; n: number }) {
  return (
    <div className={`rounded-2xl border p-3.5 ${COLORS[color]}`}>
      <div className="flex items-center gap-1.5 mb-1.5 opacity-80">
        <Icon size={13} />
        <p className="text-[11px] font-medium uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-bold tabular-nums">{n}</p>
    </div>
  );
}

function Seccion({
  titulo, vacioMsg, items, children,
}: {
  titulo: string; vacioMsg: string; items: unknown[]; children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(true);
  if (items.length === 0) {
    if (!vacioMsg) return null;
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{titulo} <span className="text-slate-400 font-normal">· 0</span></p>
        <p className="text-xs text-slate-400 italic mt-1">{vacioMsg}</p>
      </div>
    );
  }
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
      >
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${abierto ? "" : "-rotate-90"}`} />
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex-1 text-left">{titulo}</span>
        <span className="text-xs font-medium text-slate-400 tabular-nums">{items.length}</span>
      </button>
      {abierto && <div className="px-4 pb-3 max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">{children}</div>}
    </div>
  );
}
