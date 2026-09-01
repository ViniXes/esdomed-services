"use client";

// Consulta de los censos de emergencia — libro digital.
// Vista de solo lectura organizada como los libros de Excel (una fila por
// atención, columnas del libro). Lecturas optimizadas: nada en vivo, una sola
// getDocs bajo demanda por pestaña, acotada por fecha (default: hoy), rango o
// expediente exacto; resultados en caché por pestaña hasta volver a buscar.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs, limit, orderBy, query, Timestamp, where, QueryConstraint } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import {
  ArrowLeft, BookOpenText, Building2, CalendarDays, ClipboardList, Download, Loader2, Pencil, Search, X,
} from "lucide-react";
import type { CensoDemandaEspontanea, CensoReferido, DiagnosticoCIE } from "@/types";
import { DateField } from "@/components/ui/DateField";
import { toDate } from "@/lib/pacientes/helpers";
import {
  DESTINO_LABEL, TRIAGE_LABEL, TURNO_LABEL,
} from "@/lib/emergencia/censos";
import { EstadoRegistroBadge, inputCls } from "@/components/emergencia/censoUi";
import { BOTON_PRIMARIO, pad } from "@/components/emergencia/censoSecciones";

type TabCenso = "demanda" | "referido";

const COLECCION: Record<TabCenso, string> = {
  demanda: "censo_demanda_espontanea",
  referido: "censo_referidos",
};

const toDia = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ── Formato de celdas (convención del libro) ─────────────────────────────────
const fFecha = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const fHora = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const siNo = (v: unknown) => (v ? "SÍ" : "NO");
const generoMF = (g: unknown) => (g === "masculino" ? "M" : g === "femenino" ? "F" : "—");
const procsCelda = (p?: string[]) => (p?.length ? p.map((x) => x.toUpperCase()).join(", ") : "NO");
const dxCelda = (dx?: DiagnosticoCIE[]) =>
  dx?.length ? dx.map((d) => `${d.descripcion.toUpperCase()}${d.codigo ? ` (${d.codigo})` : ""}`).join(" // ") : "—";
const triEstado = (v?: string) => (v === "si" ? "SÍ" : v === "no" ? "NO" : v === "no_aplica" ? "NO APLICA" : "—");
const notasCelda = (notas?: { texto: string; fecha: unknown }[]) =>
  notas?.length
    ? notas.map((n) => {
        const d = toDate(n.fecha);
        return `${d ? `[${fFecha(d)} ${fHora(d)}] ` : ""}${n.texto}`;
      }).join(" // ")
    : "—";

// Celda con truncado + tooltip para columnas de texto largo.
function CeldaLarga({ texto, ancho = "max-w-[260px]" }: { texto: string; ancho?: string }) {
  return (
    <span className={`block truncate ${ancho}`} title={texto === "—" ? undefined : texto}>
      {texto}
    </span>
  );
}

const thCls =
  "sticky top-0 z-10 text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-cyan-50 bg-blue-800 dark:bg-blue-900 whitespace-nowrap border-b-2 border-cyan-500";
const tdCls = "px-3 py-1.5 text-[11px] text-slate-700 dark:text-slate-300 whitespace-nowrap";

export default function ConsultaCensosPage() {
  const hoyStr = toDia(new Date());

  const [tab, setTab] = useState<TabCenso>("demanda");
  const [exp, setExp] = useState("");
  const [fechaDesde, setFechaDesde] = useState(hoyStr);
  const [fechaHasta, setFechaHasta] = useState(hoyStr);

  const [demanda, setDemanda] = useState<CensoDemandaEspontanea[] | null>(null);
  const [referido, setReferido] = useState<CensoReferido[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Una sola lectura bajo demanda. Por expediente: where == (sin índice
  // compuesto, filtro de fechas en cliente). Por fechas: rango sobre `fecha`
  // (mismo campo en where/orderBy). Siempre con límite.
  const buscar = useCallback(async (t: TabCenso) => {
    setCargando(true);
    setError(null);
    try {
      const expTrim = exp.trim();
      let docs: (CensoDemandaEspontanea | CensoReferido)[];
      if (expTrim) {
        const snap = await getDocs(query(
          collection(db, COLECCION[t]),
          where("expediente", "==", expTrim),
          limit(300),
        ));
        docs = snap.docs.map((d) => ({ id: d.id, ...d.data(), fecha: toDate(d.data().fecha) ?? new Date() } as CensoDemandaEspontanea | CensoReferido));
        if (fechaDesde) docs = docs.filter((r) => r.fecha >= new Date(fechaDesde + "T00:00:00"));
        if (fechaHasta) docs = docs.filter((r) => r.fecha <= new Date(fechaHasta + "T23:59:59"));
        docs.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
      } else {
        // Sin filtros: se acota a hoy para nunca leer la colección completa.
        const desde = fechaDesde || (fechaHasta ? fechaHasta : hoyStr);
        const hasta = fechaHasta || (fechaDesde ? fechaDesde : hoyStr);
        const constraints: QueryConstraint[] = [
          where("fecha", ">=", Timestamp.fromDate(new Date(desde + "T00:00:00"))),
          where("fecha", "<=", Timestamp.fromDate(new Date(hasta + "T23:59:59"))),
          orderBy("fecha", "asc"),
          limit(800),
        ];
        const snap = await getDocs(query(collection(db, COLECCION[t]), ...constraints));
        docs = snap.docs.map((d) => ({ id: d.id, ...d.data(), fecha: toDate(d.data().fecha) ?? new Date() } as CensoDemandaEspontanea | CensoReferido));
      }
      if (t === "demanda") setDemanda(docs as CensoDemandaEspontanea[]);
      else setReferido(docs as CensoReferido[]);
    } catch (e) {
      setError(`No se pudo consultar el censo: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setCargando(false);
    }
  }, [exp, fechaDesde, fechaHasta, hoyStr]);

  // Carga inicial: el libro de HOY de la pestaña activa (una sola lectura).
  useEffect(() => {
    const t = setTimeout(() => { buscar("demanda"); }, 0);
    return () => clearTimeout(t);
    // Solo al montar — las siguientes búsquedas son explícitas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cambiarTab = (t: TabCenso) => {
    setTab(t);
    // Primera vez que se abre la pestaña: se consulta con los filtros actuales.
    if (t === "demanda" && demanda === null) buscar(t);
    if (t === "referido" && referido === null) buscar(t);
  };

  const lista = tab === "demanda" ? demanda : referido;
  const abiertos = lista?.filter((r) => r.estadoRegistro !== "cerrado").length ?? 0;

  const ponerHoy = () => { setFechaDesde(hoyStr); setFechaHasta(hoyStr); };

  // ── Export a Excel de lo que ya está en pantalla (cero lecturas extra),
  // con las columnas exactas de los libros. ──
  const [exportando, setExportando] = useState(false);
  const exportar = async () => {
    if (!lista?.length) return;
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      let filas: Record<string, unknown>[];
      if (tab === "demanda") {
        filas = (lista as CensoDemandaEspontanea[]).map((r) => ({
          "FECHA": fFecha(r.fecha),
          "HORARIO": TURNO_LABEL[r.turno] ?? "",
          "NOMBRE DE PACIENTE": r.pacienteNombre,
          "# DE REGISTRO": r.expediente,
          "EDAD": r.edad ?? "",
          "TRIAGE": r.triage ? TRIAGE_LABEL[r.triage] : "",
          "SEXO: M / F": generoMF(r.genero) === "—" ? "" : generoMF(r.genero),
          "CONDICION DE PACIENTE": r.condicion === "fallecido" ? "Fallecido" : "Vivo",
          "IMPRESION DIAGNOSTICA": dxCelda(r.diagnosticos) === "—" ? "" : dxCelda(r.diagnosticos),
          "ESPECIALIDAD": (r.especialidad ?? "").toUpperCase(),
          "TRAE REFERENCIA": r.traeReferencia ? "Sí" : "No",
          "LUGAR DE REFERENCIA": r.lugarReferencia ?? "",
          "DESTINO DE PACIENTE": r.destino ? DESTINO_LABEL[r.destino] : "",
          "SERVICIO A INGRESAR": r.servicioIngresar ?? "",
          // Convención del libro: si evaluó un médico general, la columna de
          // staff dice "MEDICO GENERAL" y el nombre va en la columna propia.
          "STAFF QUE EVALUA": r.evaluadoPor === "medico_general" ? "MEDICO GENERAL" : r.staffEvalua,
          "REEVALUACION MEDICA": r.reevaluacion || "NO APLICA",
          "VENTILACION MECANICA": r.ventilacionMecanica ? "Sí" : "No",
          "MEDICO GENERAL QUE ASISTE EN LA ATENCION":
            r.evaluadoPor === "medico_general" ? r.staffEvalua : r.medicosGenerales ?? "",
          "CENTRO DE SALUD AL QUE REFIERE": r.centroRefiere ?? "",
          "CONSULTA NUEVAMENTE EN < 48H": siNo(r.consulta48h),
          "ASEGURADO ISSS": siNo(r.aseguradoIsss),
          "EMPLEADO DE HES": siNo(r.empleadoHes),
          "DEPENDENCIA": r.dependencia ?? "",
          "PROCEDIMIENTOS EN MAXIMA": procsCelda(r.procedimientosMaxima),
          "PROCEDIMIENTO EN U/E": procsCelda(r.procedimientosUE),
          "PLAN / OBSERVACIONES": notasCelda(r.notas) === "—" ? "" : notasCelda(r.notas),
        }));
      } else {
        filas = (lista as CensoReferido[]).map((r) => ({
          "FECHA": fFecha(r.fecha),
          "HORARIO": TURNO_LABEL[r.turno] ?? "",
          "NOMBRE": r.pacienteNombre,
          "REGISTRO": r.expediente,
          "EDAD": r.edad ?? "",
          "SEXO": r.genero === "masculino" ? "Masculino" : r.genero === "femenino" ? "Femenino" : "",
          "HOSPITAL DE REFERENCIA": r.hospitalReferencia ?? "",
          "REFERENCIA EN SIS": r.clasificacionSis ?? "",
          "CONDICION PACIENTE": r.condicion === "estable" ? "Estable" : r.condicion === "inestable" ? "Inestable" : "",
          "DISPOSITIVO DE OXIGENO AL INGRESO": (r.dispositivoO2 ?? "No").toUpperCase(),
          "DISCREPANCIAS EN DIAGNOSTICOS": triEstado(r.discrepanciaDiagnostico) === "—" ? "" : triEstado(r.discrepanciaDiagnostico),
          "MODIFICACION DE SERVICIO A INGRESAR": triEstado(r.modificacionServicio) === "—" ? "" : triEstado(r.modificacionServicio),
          "SERVICIO DE INGRESO": (r.servicioIngreso ?? "").toUpperCase(),
          "DIAGNOSTICO": dxCelda(r.diagnosticos) === "—" ? "" : dxCelda(r.diagnosticos),
          "STAFF QUE EVALUA": r.evaluadoPor === "medico_general" ? "MEDICO GENERAL" : r.staffEvalua,
          "REEVALUACION MEDICA": r.reevaluacion || "NO APLICA",
          "TIEMPO TOTAL QUE PERMANECE": r.tiempoPermanencia ?? "",
          "RAZON DE DEMORA": r.razonDemora ?? "",
          "PROCEDIMIENTOS EN MAXIMA": procsCelda(r.procedimientosMaxima),
          "OTROS PROCEDIMIENTOS": procsCelda(r.otrosProcedimientos),
          "OBSERVACIONES": notasCelda(r.notas) === "—" ? "" : notasCelda(r.notas),
          "MEDICOS GENERALES": r.evaluadoPor === "medico_general" ? r.staffEvalua : r.medicosGenerales ?? "",
        }));
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "CENSO");
      const sufijo = exp.trim()
        ? `exp_${exp.trim().replace(/[^\w-]/g, "_")}`
        : `${fechaDesde || hoyStr}_a_${fechaHasta || hoyStr}`;
      const base = tab === "demanda" ? "demandas_espontaneas" : "referidos_hes";
      XLSX.writeFile(wb, `${base}_${sufijo}.xlsx`);
    } catch (e) {
      setError(`No se pudo exportar: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* Hero institucional */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] px-5 py-5 shadow-lg shadow-cyan-950/15 md:px-7 md:py-6">
        <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full border border-white/10" />
        <div className="absolute bottom-[-5.5rem] right-16 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
              <BookOpenText size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white md:text-2xl font-heading">Consulta de censos de emergencia</h1>
              <p className="mt-1 max-w-xl text-sm text-cyan-50/90">Libro digital de demanda espontánea y referidos. Consulte por día, rango o expediente y exporte lo que ve en pantalla.</p>
            </div>
          </div>
          <Link
            href="/medico/cola-expedientes"
            className="inline-flex items-center justify-center gap-1.5 self-start rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/25 transition-colors hover:bg-white/20"
          >
            <ArrowLeft size={16} /> Cola de expedientes
          </Link>
        </div>
      </section>

      {/* Pestañas */}
      <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        {([
          { key: "demanda", label: "Demanda espontánea", icon: ClipboardList },
          { key: "referido", label: "Referidos", icon: Building2 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => cambiarTab(key)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === key
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <Icon size={14} className={tab === key ? "text-cyan-600 dark:text-cyan-300" : ""} />
            {label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 space-y-2 shadow-sm shadow-slate-900/5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[150px] md:max-w-[200px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Expediente exacto…"
              value={exp}
              onChange={(e) => setExp(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(tab); } }}
              className="w-full pl-8 pr-7 py-1.5 text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400 font-mono"
            />
            {exp && (
              <button onClick={() => setExp("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={12} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Desde</span>
            <DateField value={fechaDesde} onChange={setFechaDesde} placeholder="Desde" ariaLabel="Fecha desde" clearable />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Hasta</span>
            <DateField value={fechaHasta} onChange={setFechaHasta} placeholder="Hasta" ariaLabel="Fecha hasta" clearable />
          </div>
          <button
            onClick={ponerHoy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <CalendarDays size={13} /> Hoy
          </button>
          <button
            onClick={() => buscar(tab)}
            disabled={cargando}
            className={`${BOTON_PRIMARIO} px-4 py-1.5 text-sm`}
          >
            {cargando ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            {cargando ? "Consultando…" : "Buscar"}
          </button>
        </div>
        <p className="text-[11px] text-slate-400">
          La consulta se hace bajo demanda y acotada (fecha, rango o expediente exacto) para ahorrar lecturas.
          Sin filtros se muestra el libro de hoy.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Libro */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm shadow-slate-900/5">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-600 text-white shadow-sm shadow-cyan-600/25">
            <BookOpenText size={14} />
          </span>
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 font-heading">
            {tab === "demanda" ? "Libro de demanda espontánea" : "Libro de referidos"}
          </span>
          {lista !== null && (
            <>
              <span className="text-xs text-slate-400">({lista.length} registro{lista.length === 1 ? "" : "s"})</span>
              {abiertos > 0 && (
                <span className="text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-2 py-0.5 rounded-full">
                  {abiertos} por cerrar
                </span>
              )}
            </>
          )}
          <button
            onClick={exportar}
            disabled={exportando || !lista?.length}
            className="ml-auto flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={13} />
            {exportando ? "Generando…" : "Exportar Excel"}
          </button>
        </div>

        {cargando ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !lista || lista.length === 0 ? (
          <p className="text-sm text-slate-500 py-12 text-center">
            {lista === null ? "Presiona Buscar para consultar." : "Sin registros para esos filtros."}
          </p>
        ) : tab === "demanda" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {[
                    "Fecha", "Horario", "Nombre de paciente", "# de registro", "Edad", "Triage", "Sexo",
                    "Condición", "Impresión diagnóstica", "Especialidad", "Trae ref.", "Lugar de referencia",
                    "Destino", "Servicio a ingresar", "Staff que evalúa", "Reevaluación", "V. mecánica",
                    "Médico general", "Centro al que refiere", "< 48 h", "ISSS", "HES", "Dependencia",
                    "Proc. Máxima", "Proc. U/E", "Plan / observaciones", "Estado", "",
                  ].map((h, i) => <th key={`${h}-${i}`} className={thCls}>{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(lista as CensoDemandaEspontanea[]).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 divide-x divide-slate-100 dark:divide-slate-800">
                    <td className={`${tdCls} font-mono`}>{fFecha(r.fecha)}<span className="block text-[10px] text-slate-400">{fHora(r.fecha)}</span></td>
                    <td className={tdCls}>{TURNO_LABEL[r.turno] ?? "—"}</td>
                    <td className={`${tdCls} font-medium text-slate-900 dark:text-slate-100`}><CeldaLarga texto={r.pacienteNombre || "—"} ancho="max-w-[200px]" /></td>
                    <td className={`${tdCls} font-mono font-semibold`}>{r.expediente}</td>
                    <td className={tdCls}>{r.edad ?? "—"}</td>
                    <td className={tdCls}>{r.triage ? TRIAGE_LABEL[r.triage] : "—"}</td>
                    <td className={tdCls}>{generoMF(r.genero)}</td>
                    <td className={tdCls}>{r.condicion === "fallecido" ? "FALLECIDO" : "VIVO"}</td>
                    <td className={tdCls}><CeldaLarga texto={dxCelda(r.diagnosticos)} /></td>
                    <td className={tdCls}>{(r.especialidad || "—").toUpperCase()}</td>
                    <td className={tdCls}>{siNo(r.traeReferencia)}</td>
                    <td className={tdCls}><CeldaLarga texto={r.lugarReferencia || "—"} ancho="max-w-[160px]" /></td>
                    <td className={tdCls}>{r.destino ? DESTINO_LABEL[r.destino] : "—"}</td>
                    <td className={tdCls}><CeldaLarga texto={r.servicioIngresar || "—"} ancho="max-w-[200px]" /></td>
                    {/* Convención del libro: si evaluó un médico general, la columna
                        de staff dice MÉDICO GENERAL y el nombre va en la suya. */}
                    <td className={tdCls}><CeldaLarga texto={r.evaluadoPor === "medico_general" ? "MÉDICO GENERAL" : (r.staffEvalua || "—")} ancho="max-w-[200px]" /></td>
                    <td className={tdCls}><CeldaLarga texto={r.reevaluacion || "NO APLICA"} ancho="max-w-[180px]" /></td>
                    <td className={tdCls}>{siNo(r.ventilacionMecanica)}</td>
                    <td className={tdCls}><CeldaLarga texto={(r.evaluadoPor === "medico_general" ? r.staffEvalua : r.medicosGenerales) || "—"} ancho="max-w-[200px]" /></td>
                    <td className={tdCls}><CeldaLarga texto={r.centroRefiere || "—"} ancho="max-w-[180px]" /></td>
                    <td className={tdCls}>{siNo(r.consulta48h)}</td>
                    <td className={tdCls}>{siNo(r.aseguradoIsss)}</td>
                    <td className={tdCls}>{siNo(r.empleadoHes)}</td>
                    <td className={tdCls}>{r.dependencia || "—"}</td>
                    <td className={tdCls}><CeldaLarga texto={procsCelda(r.procedimientosMaxima)} ancho="max-w-[180px]" /></td>
                    <td className={tdCls}><CeldaLarga texto={procsCelda(r.procedimientosUE)} ancho="max-w-[180px]" /></td>
                    <td className={tdCls}><CeldaLarga texto={notasCelda(r.notas)} ancho="max-w-[280px]" /></td>
                    <td className={tdCls}><EstadoRegistroBadge estado={r.estadoRegistro ?? "cerrado"} faltantes={r.camposFaltantes} /></td>
                    <td className={tdCls}>
                      <Link
                        href={`/medico/censos/demanda-espontanea?editar=${r.id}`}
                        className="inline-flex p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                        aria-label="Editar registro"
                        title="Editar registro"
                      >
                        <Pencil size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {[
                    "Fecha", "Horario", "Nombre de paciente", "# de registro", "Edad", "Sexo",
                    "Hospital de referencia", "Referencia en SIS", "Condición", "Dispositivo O₂",
                    "Discrepancia dx", "Modif. de servicio", "Servicio de ingreso", "Diagnóstico",
                    "Staff que evalúa", "Reevaluación", "Tiempo en Admisión", "Razón de demora",
                    "Proc. Máxima", "Otros proc.", "Observaciones", "Médicos generales", "Estado", "",
                  ].map((h, i) => <th key={`${h}-${i}`} className={thCls}>{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(lista as CensoReferido[]).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 divide-x divide-slate-100 dark:divide-slate-800">
                    <td className={`${tdCls} font-mono`}>{fFecha(r.fecha)}<span className="block text-[10px] text-slate-400">{fHora(r.fecha)}</span></td>
                    <td className={tdCls}>{TURNO_LABEL[r.turno] ?? "—"}</td>
                    <td className={`${tdCls} font-medium text-slate-900 dark:text-slate-100`}><CeldaLarga texto={r.pacienteNombre || "—"} ancho="max-w-[200px]" /></td>
                    <td className={`${tdCls} font-mono font-semibold`}>{r.expediente}</td>
                    <td className={tdCls}>{r.edad ?? "—"}</td>
                    <td className={tdCls}>{generoMF(r.genero)}</td>
                    <td className={tdCls}><CeldaLarga texto={r.hospitalReferencia || "—"} ancho="max-w-[180px]" /></td>
                    <td className={`${tdCls} font-mono`}>{r.clasificacionSis ?? "—"}</td>
                    <td className={tdCls}>{r.condicion === "inestable" ? "INESTABLE" : r.condicion === "estable" ? "ESTABLE" : "—"}</td>
                    <td className={tdCls}>{r.dispositivoO2 || "—"}</td>
                    <td className={tdCls}>{triEstado(r.discrepanciaDiagnostico)}</td>
                    <td className={tdCls}>{triEstado(r.modificacionServicio)}</td>
                    <td className={tdCls}><CeldaLarga texto={r.servicioIngreso || "—"} ancho="max-w-[200px]" /></td>
                    <td className={tdCls}><CeldaLarga texto={dxCelda(r.diagnosticos)} /></td>
                    <td className={tdCls}><CeldaLarga texto={r.evaluadoPor === "medico_general" ? "MÉDICO GENERAL" : (r.staffEvalua || "—")} ancho="max-w-[200px]" /></td>
                    <td className={tdCls}><CeldaLarga texto={r.reevaluacion || "NO APLICA"} ancho="max-w-[180px]" /></td>
                    <td className={tdCls}>{r.tiempoPermanencia || "—"}</td>
                    <td className={tdCls}><CeldaLarga texto={r.razonDemora || "—"} ancho="max-w-[200px]" /></td>
                    <td className={tdCls}><CeldaLarga texto={procsCelda(r.procedimientosMaxima)} ancho="max-w-[180px]" /></td>
                    <td className={tdCls}><CeldaLarga texto={procsCelda(r.otrosProcedimientos)} ancho="max-w-[180px]" /></td>
                    <td className={tdCls}><CeldaLarga texto={notasCelda(r.notas)} ancho="max-w-[280px]" /></td>
                    <td className={tdCls}><CeldaLarga texto={(r.evaluadoPor === "medico_general" ? r.staffEvalua : r.medicosGenerales) || "—"} ancho="max-w-[200px]" /></td>
                    <td className={tdCls}><EstadoRegistroBadge estado={r.estadoRegistro ?? "cerrado"} faltantes={r.camposFaltantes} /></td>
                    <td className={tdCls}>
                      <Link
                        href={`/medico/censos/referidos?editar=${r.id}`}
                        className="inline-flex p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                        aria-label="Editar registro"
                        title="Editar registro"
                      >
                        <Pencil size={13} />
                      </Link>
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
