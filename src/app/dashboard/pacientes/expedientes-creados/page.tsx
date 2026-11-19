"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, FileSpreadsheet, Loader2, Upload, UserCheck, UserPlus, Users,
} from "lucide-react";
import { doc, onSnapshot } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  leerExpedientesCreados, type ExpedienteCreado, type LecturaExpedientesCreados,
} from "@/lib/consultaExterna/expedientesCreados";

// Carga del reporte SIS "Expedientes creados" (Consulta Externa). Igual que la
// importación de pacientes ingresados: se lee en el navegador, se muestra una
// vista previa y se guarda en el servidor. Solo registra productividad y agrega
// al padrón a quien no exista; no crea ingresos.

type Paso = "subir" | "previsualizar" | "hecho";

interface Resumen {
  expedientes: number;
  descartadas: number;
  personasNuevas: number;
  personasExistentes: number;
  productividadNueva: number;
  productividadYaRegistrada: number;
  creadoresSinUsuario: string[];
  porCreador: { creadoPor: string; usuario: string | null; nuevos: number; yaRegistrados: number }[];
  fechas: string[];
}
interface Detalle {
  expediente: string; nombre: string; creadoPor: string; usuario: string | null;
  fechaCreacion: string; personaNueva: boolean; agregaMadre: boolean; productividadNueva: boolean;
}
interface Guardado { personasCreadas: number; madresAgregadas: number; productividadRegistrada: number }

const fechaCorta = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");
const ROLES = ["esdomed", "asistente_esdomed", "admin"];

export default function ExpedientesCreadosPage() {
  const { profile, user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [paso, setPaso] = useState<Paso>("subir");
  const [archivo, setArchivo] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lectura, setLectura] = useState<LecturaExpedientesCreados | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [detalle, setDetalle] = useState<Detalle[]>([]);
  const [guardado, setGuardado] = useState<Guardado | null>(null);
  const [ultima, setUltima] = useState<{ en: Date | null; fechas: string[] } | null>(null);

  useEffect(() => onSnapshot(doc(db, "configuracion", "sincronizacion_expedientes_ce"), (s) => {
    const d = s.data();
    setUltima(d ? { en: d.sincronizadoEn?.toDate?.() ?? null, fechas: Array.isArray(d.fechas) ? d.fechas : [] } : null);
  }, () => setUltima(null)), []);

  const reset = () => {
    setPaso("subir"); setArchivo(""); setError(null); setLectura(null);
    setResumen(null); setDetalle([]); setGuardado(null);
  };

  const llamarApi = async (filas: ExpedienteCreado[], confirmar: boolean, nombreArchivo: string) => {
    if (!user) throw new Error("Sesión no disponible.");
    const r = await fetch("/api/consulta-externa/expedientes-creados", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify({ filas, confirmar, archivo: nombreArchivo }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "No se pudo procesar el reporte.");
    return data as { resumen: Resumen; detalle?: Detalle[]; guardado?: Guardado };
  };

  const procesarArchivo = async (file: File) => {
    setError(null);
    if (!/\.xlsx?$/i.test(file.name)) { setError(`"${file.name}" no es un archivo Excel (.xlsx).`); return; }
    setArchivo(file.name);
    setProcesando(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: null, raw: true });
      const l = leerExpedientesCreados(matriz);
      setLectura(l);
      if (l.filas.length === 0) {
        setError("El reporte no trae expedientes creados en Consulta Externa.");
        setPaso("subir");
        return;
      }
      const data = await llamarApi(l.filas, false, file.name);
      setResumen(data.resumen);
      setDetalle(data.detalle ?? []);
      setPaso("previsualizar");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally {
      setProcesando(false);
    }
  };

  const confirmar = async () => {
    if (!lectura) return;
    setGuardando(true);
    setError(null);
    try {
      const data = await llamarApi(lectura.filas, true, archivo);
      setResumen(data.resumen);
      setGuardado(data.guardado ?? null);
      setPaso("hecho");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const onFiles = (files: FileList | null) => { const f = files?.[0]; if (f) void procesarArchivo(f); };

  if (!profile) return null;
  if (!ROLES.includes(profile.role)) {
    return <p className="p-6 text-sm text-slate-500">No tienes acceso a esta carga.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Link prefetch={false} href="/dashboard/pacientes" aria-label="Volver"
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="font-heading text-xl font-bold text-slate-900 dark:text-slate-100">Expedientes creados en Consulta Externa</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Sube el reporte del SIS &quot;Expedientes creados&quot; (.xlsx) de un día o de un rango de fechas. Solo se toman
            los de área Consulta Externa: se registra la productividad de quien creó cada expediente y se agrega al
            padrón de pacientes a quien services aún no tenga, solo con sus datos personales. No crea ingresos,
            pre-ingresos ni atenciones de emergencia. Subir dos veces el mismo día no cuenta doble.
          </p>
          {ultima?.en && (
            <p className="mt-1 text-xs text-slate-500">
              Última carga: {ultima.en.toLocaleString("es-SV", { dateStyle: "medium", timeStyle: "short" })}
              {ultima.fechas.length === 2 && ` · creados del ${fechaCorta(ultima.fechas[0])} al ${fechaCorta(ultima.fechas[1])}`}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /><span>{error}</span>
        </div>
      )}

      {paso === "subir" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => { e.preventDefault(); setDragActive(false); onFiles(e.dataTransfer.files); }}
          onClick={() => !procesando && inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all ${
            dragActive ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-slate-300 hover:border-blue-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/30"
          }`}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
          {procesando ? (
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <Loader2 size={28} className="animate-spin text-blue-500" />
              <p className="text-sm font-medium">Analizando {archivo}...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
                <Upload size={20} className="text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Arrastra el reporte aquí o haz clic para seleccionar</p>
              <p className="text-xs text-slate-500">Reporte del SIS &quot;Expedientes creados&quot;</p>
            </div>
          )}
        </div>
      )}

      {(paso === "previsualizar" || paso === "hecho") && resumen && lectura && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <FileSpreadsheet size={15} className="text-blue-500" />
            <span className="font-medium">{archivo}</span>
            <span className="text-slate-400">
              · {lectura.totalFilas} filas · {resumen.expedientes} de Consulta Externa
              {resumen.fechas.length === 2 && ` · creados del ${fechaCorta(resumen.fechas[0])} al ${fechaCorta(resumen.fechas[1])}`}
            </span>
          </div>

          {paso === "hecho" && guardado && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
              <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
              <span>
                Listo: {guardado.productividadRegistrada} expedientes sumados a la productividad y {guardado.personasCreadas} pacientes
                agregados al padrón{guardado.madresAgregadas > 0 && ` (y el nombre de la madre en ${guardado.madresAgregadas} que ya estaban)`}.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tarjeta icon={UserPlus} label="Nuevos en el padrón" n={resumen.personasNuevas} />
            <Tarjeta icon={UserCheck} label="Ya estaban en el padrón" n={resumen.personasExistentes} />
            <Tarjeta icon={Users} label="Productividad nueva" n={resumen.productividadNueva} />
            <Tarjeta icon={CheckCircle2} label="Ya contados antes" n={resumen.productividadYaRegistrada} />
          </div>

          {(lectura.otrasAreas.length > 0 || lectura.invalidas.length > 0 || lectura.repetidas > 0) && (
            <div className="space-y-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              {lectura.otrasAreas.length > 0 && (
                <p>No se toman (otras áreas): {lectura.otrasAreas.map((a) => `${a.area} (${a.total})`).join(", ")}.</p>
              )}
              {lectura.repetidas > 0 && <p>{lectura.repetidas} filas repetidas del mismo expediente se cuentan una sola vez.</p>}
              {lectura.invalidas.length > 0 && (
                <p className="text-amber-700 dark:text-amber-400">
                  {lectura.invalidas.length} filas no se pueden usar: {lectura.invalidas.slice(0, 5).map((i) => `fila ${i.fila}${i.expediente ? ` (${i.expediente})` : ""}: ${i.motivo}`).join(" ")}
                  {lectura.invalidas.length > 5 && " …"}
                </p>
              )}
            </div>
          )}

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Por quién creó el expediente</p>
              <p className="text-xs text-slate-500">Se acredita a quien lo creó en el SIS, no a quien sube el reporte.</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-500 dark:border-slate-800">
                  <th className="px-4 py-2">Creó expediente (SIS)</th>
                  <th className="px-4 py-2">Usuario en services</th>
                  <th className="px-4 py-2 text-center">Nuevos</th>
                  <th className="px-4 py-2 text-center">Ya contados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {resumen.porCreador.map((c) => (
                  <tr key={c.creadoPor}>
                    <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-100">{c.creadoPor}</td>
                    <td className="px-4 py-2">
                      {c.usuario ?? <span className="text-amber-700 dark:text-amber-400">Sin usuario: se guarda con el nombre del SIS</span>}
                    </td>
                    <td className="px-4 py-2 text-center tabular-nums">{c.nuevos}</td>
                    <td className="px-4 py-2 text-center tabular-nums text-slate-500">{c.yaRegistrados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {detalle.length > 0 && paso === "previsualizar" && (
            <details className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Ver los {detalle.length} expedientes</summary>
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-y border-slate-200 text-left uppercase text-slate-500 dark:border-slate-800">
                      <th className="px-4 py-2">Expediente</th><th className="px-4 py-2">Paciente</th>
                      <th className="px-4 py-2">Creado</th><th className="px-4 py-2">Creó</th><th className="px-4 py-2">Padrón</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {detalle.map((d) => (
                      <tr key={d.expediente}>
                        <td className="px-4 py-1.5 font-mono">{d.expediente}</td>
                        <td className="px-4 py-1.5">{d.nombre}</td>
                        <td className="px-4 py-1.5">{fechaCorta(d.fechaCreacion)}</td>
                        <td className="px-4 py-1.5">{d.usuario ?? d.creadoPor}</td>
                        <td className="px-4 py-1.5">{d.personaNueva ? "Nuevo" : "Ya estaba"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={reset} disabled={guardando}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              {paso === "hecho" ? "Subir otro reporte" : "Cancelar"}
            </button>
            {paso === "previsualizar" && (
              <button type="button" onClick={() => void confirmar()}
                disabled={guardando || (resumen.personasNuevas === 0 && resumen.productividadNueva === 0 && !detalle.some((d) => d.agregaMadre))}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
                {guardando && <Loader2 size={14} className="animate-spin" />}
                {resumen.personasNuevas === 0 && resumen.productividadNueva === 0 ? "Nada nuevo que guardar" : "Guardar"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Tarjeta({ icon: Icon, label, n }: { icon: typeof Users; label: string; n: number }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="absolute inset-x-0 top-0 h-1 bg-blue-500" />
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><Icon size={13} />{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{n}</p>
    </div>
  );
}
