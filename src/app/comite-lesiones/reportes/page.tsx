"use client";

// Reportes del Comité de Lesiones: primeras 10 causas por rango de fechas,
// con filtros de estado (vivo/fallecido/todos) y edad. Dos fuentes:
//   · Emergencia:      "causas de atención" — atenciones_emergencia (diagnóstico =
//                      texto del catálogo del SIS, sin código CIE → se agrupa por
//                      texto normalizado). Cuenta TODAS las atenciones del rango,
//                      hayan ingresado o no a hospitalización (pedido del comité:
//                      interesa la causa por la que llegaron a Emergencia). El
//                      filtro vivo/fallecido se aplica sobre `tipoEgreso` del
//                      reporte; el SIS lo deja VACÍO en quien ingresó a un servicio
//                      (verificado con datos reales), así que el ingresado cuenta
//                      como vivo: salió vivo de Emergencia hacia hospitalización.
//   · Hospitalización: "causas de egreso" — pacientes egresados (diagnosticoEgreso
//                      CIE-10). Se
//                      agrupa por DESCRIPCIÓN normalizada, no por código:
//                      verificado con datos reales, el mismo diagnóstico se
//                      captura a veces con el código de 3 y de 4 caracteres
//                      (N18 y N18.5, misma descripción) y agrupar por código
//                      partía el conteo en dos. Los códigos vistos se muestran
//                      juntos en la columna CIE-10.
// Solo cuenta el diagnóstico PRINCIPAL (los complementarios se ignoran).

import { useState } from "react";
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { DateField } from "@/components/ui/DateField";
import { calcularEdadEn, toDate } from "@/lib/pacientes/helpers";
import { condicionEgreso } from "@/lib/emergencia/helpers";
import type { EstadoPaciente } from "@/types";
import {
  BarChart3, Download, Search, Loader2, AlertTriangle, Siren, BedDouble, Info,
} from "lucide-react";

type Vista = "emergencia" | "hospitalizacion";
type FiltroEstado = "todos" | "vivo" | "fallecido";

// Cualquier egreso no fallecido cuenta como "vivo" (misma definición que los
// tabuladores de ESDOMED).
const ESTADOS_VIVO: EstadoPaciente[] = ["alta_vivo", "alta_voluntaria", "referido", "fuga", "in_extremis"];

// Techo de lectura por consulta: el rango lo elige el usuario y hay que acotarlo.
const MAX_DOCS = 5000;

interface FilaCausa {
  etiqueta: string;   // descripción a mostrar (la variante más frecuente)
  codigo?: string;    // código CIE-10 (solo hospitalización)
  casos: number;
}

interface ResultadoReporte {
  vista: Vista;
  estado: FiltroEstado;
  desde: string;
  hasta: string;
  edadMin: number | null;
  edadMax: number | null;
  top: FilaCausa[];
  todas: FilaCausa[];
  totalCasos: number;        // egresos del filtro CON diagnóstico (los contados)
  totalDistintas: number;    // causas distintas
  sinDiagnostico: number;    // egresos del filtro sin diagnóstico registrado
  sinEdad: number;           // excluidos por no tener edad (solo si hay filtro de edad)
  truncado: boolean;         // se alcanzó MAX_DOCS
}

// Llave de agrupación para texto libre: mayúsculas, sin tildes, espacios
// colapsados y sin puntuación final. Los textos del SIS vienen de catálogo,
// así que variantes idénticas agrupan exacto.
function normalizarDiagnostico(s: string): string {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[\s.,;]+$/g, "")
    .trim();
}

// Acumulador: por llave guarda el conteo, la variante de texto más vista (para
// mostrar la etiqueta tal como la escriben, no la normalizada) y los códigos
// CIE con que se capturó la causa (puede haber más de uno, ver arriba).
class Acumulador {
  private mapa = new Map<string, { casos: number; variantes: Map<string, number>; codigos: Map<string, number> }>();

  agregar(llave: string, etiqueta: string, codigo?: string) {
    let e = this.mapa.get(llave);
    if (!e) { e = { casos: 0, variantes: new Map(), codigos: new Map() }; this.mapa.set(llave, e); }
    e.casos++;
    e.variantes.set(etiqueta, (e.variantes.get(etiqueta) ?? 0) + 1);
    if (codigo) e.codigos.set(codigo, (e.codigos.get(codigo) ?? 0) + 1);
  }

  filas(): FilaCausa[] {
    return Array.from(this.mapa.values())
      .map((e) => {
        let mejor = ""; let n = -1;
        e.variantes.forEach((c, v) => { if (c > n) { n = c; mejor = v; } });
        const cods = Array.from(e.codigos.entries()).sort((a, b) => b[1] - a[1]).map(([c]) => c);
        const codigo = cods.length === 0
          ? undefined
          : cods.length <= 2 ? cods.join(" / ") : `${cods[0]} +${cods.length - 1}`;
        return { etiqueta: mejor, codigo, casos: e.casos };
      })
      .sort((a, b) => b.casos - a.casos || a.etiqueta.localeCompare(b.etiqueta));
  }
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-600 dark:focus:bg-slate-800";

// `unidad` es el sustantivo de lo que se cuenta en cada vista (Emergencia cuenta
// atenciones; Hospitalización, egresos) y `archivo` el prefijo del Excel exportado.
const VISTA_META: Record<Vista, { label: string; icono: typeof Siren; unidad: string; archivo: string }> = {
  emergencia: { label: "Causas de atención · Emergencia", icono: Siren, unidad: "atenciones", archivo: "causas_atencion_emergencia" },
  hospitalizacion: { label: "Causas de egreso · Hospitalización", icono: BedDouble, unidad: "egresos", archivo: "causas_egreso_hospitalizacion" },
};

export default function ReportesComitePage() {
  const hoyStr = (() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  })();
  const inicioMesStr = hoyStr.slice(0, 8) + "01";

  const [vista, setVista] = useState<Vista>("emergencia");
  const [fechaDesde, setFechaDesde] = useState(inicioMesStr);
  const [fechaHasta, setFechaHasta] = useState(hoyStr);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [edadMin, setEdadMin] = useState("");
  const [edadMax, setEdadMax] = useState("");
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoReporte | null>(null);

  const cambiarVista = (v: Vista) => {
    setVista(v);
    setResultado(null);
    setError(null);
  };

  const generar = async () => {
    if (!fechaDesde || !fechaHasta) { setError("Elige el rango de fechas."); return; }
    if (fechaDesde > fechaHasta) { setError("La fecha inicial no puede ser mayor que la final."); return; }
    const min = edadMin.trim() ? parseInt(edadMin, 10) : null;
    const max = edadMax.trim() ? parseInt(edadMax, 10) : null;
    if (min !== null && max !== null && min > max) { setError("La edad mínima no puede ser mayor que la máxima."); return; }

    setCargando(true);
    setError(null);
    setResultado(null);
    try {
      const desde = Timestamp.fromDate(new Date(fechaDesde + "T00:00:00"));
      const hasta = Timestamp.fromDate(new Date(fechaHasta + "T23:59:59"));
      const conFiltroEdad = min !== null || max !== null;
      const pasaEdad = (edad: number | null): boolean => {
        if (!conFiltroEdad) return true;
        if (edad === null) return false;
        if (min !== null && edad < min) return false;
        if (max !== null && edad > max) return false;
        return true;
      };

      const acumulador = new Acumulador();
      let totalCasos = 0, sinDiagnostico = 0, sinEdad = 0, truncado = false;

      if (vista === "emergencia") {
        // Rango sobre fechaHoraIngreso (mismo campo en where/orderBy → sin índice compuesto).
        const snap = await getDocs(query(
          collection(db, "atenciones_emergencia"),
          where("fechaHoraIngreso", ">=", desde),
          where("fechaHoraIngreso", "<=", hasta),
          orderBy("fechaHoraIngreso", "desc"),
          limit(MAX_DOCS),
        ));
        truncado = snap.size >= MAX_DOCS;
        snap.docs.forEach((d) => {
          const a = d.data();
          // Ingresó a un servicio ⇒ salió vivo de Emergencia (el reporte no trae tipoEgreso en ese caso).
          const condicion = a.ingresoHospitalizacion === "si" ? "vivo" : condicionEgreso(a.tipoEgreso);
          if (filtroEstado !== "todos" && condicion !== filtroEstado) return;
          const edad = typeof a.edadAnios === "number" ? a.edadAnios : null;
          if (!pasaEdad(edad)) { if (edad === null) sinEdad++; return; }
          const diag = String(a.diagnostico ?? "").trim();
          if (!diag) { sinDiagnostico++; return; }
          totalCasos++;
          acumulador.agregar(normalizarDiagnostico(diag), diag);
        });
      } else {
        const snap = await getDocs(query(
          collection(db, "pacientes"),
          where("fechaEgreso", ">=", desde),
          where("fechaEgreso", "<=", hasta),
          orderBy("fechaEgreso", "desc"),
          limit(MAX_DOCS),
        ));
        truncado = snap.size >= MAX_DOCS;
        snap.docs.forEach((d) => {
          const p = d.data();
          const estado = p.estado as EstadoPaciente;
          if (filtroEstado === "vivo" && !ESTADOS_VIVO.includes(estado)) return;
          if (filtroEstado === "fallecido" && estado !== "alta_fallecido") return;
          if (filtroEstado === "todos" && estado === "activo") return;
          const edad = calcularEdadEn(toDate(p.fechaNacimiento), toDate(p.fechaEgreso));
          if (!pasaEdad(edad)) { if (edad === null) sinEdad++; return; }
          const diag = p.diagnosticoEgreso as { codigo?: string; descripcion?: string } | undefined;
          const codigo = String(diag?.codigo ?? "").trim().toUpperCase();
          const descripcion = String(diag?.descripcion ?? "").trim();
          if (!codigo && !descripcion) { sinDiagnostico++; return; }
          totalCasos++;
          // Llave = descripción normalizada (agrupa N18 con N18.5); el código
          // solo se acumula para mostrarlo.
          acumulador.agregar(
            normalizarDiagnostico(descripcion || codigo),
            descripcion || codigo,
            codigo || undefined,
          );
        });
      }

      const todas = acumulador.filas();
      setResultado({
        vista, estado: filtroEstado, desde: fechaDesde, hasta: fechaHasta,
        edadMin: min, edadMax: max,
        top: todas.slice(0, 10), todas,
        totalCasos, totalDistintas: todas.length, sinDiagnostico, sinEdad, truncado,
      });
    } catch (e) {
      setError(`No se pudo generar el reporte: ${e instanceof Error ? e.message : "error desconocido"}`);
    } finally {
      setCargando(false);
    }
  };

  const exportarExcel = async () => {
    if (!resultado) return;
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const meta = etiquetaFiltros(resultado);
      const esHosp = resultado.vista === "hospitalizacion";
      const { unidad, archivo } = VISTA_META[resultado.vista];
      const unidadCap = unidad.charAt(0).toUpperCase() + unidad.slice(1);

      const hoja = (filas: FilaCausa[], titulo: string) => {
        const aoa: (string | number)[][] = [
          [`${VISTA_META[resultado.vista].label} — ${titulo}`],
          [`Del ${resultado.desde} al ${resultado.hasta} · ${meta}`],
          [`${unidadCap} con diagnóstico: ${resultado.totalCasos} · Causas distintas: ${resultado.totalDistintas}`],
          [],
          ["#", ...(esHosp ? ["Código CIE-10"] : []), "Diagnóstico", "Casos", "%"],
        ];
        filas.forEach((f, i) => {
          aoa.push([
            i + 1,
            ...(esHosp ? [f.codigo ?? ""] : []),
            f.etiqueta,
            f.casos,
            resultado.totalCasos ? Number(((f.casos / resultado.totalCasos) * 100).toFixed(1)) : 0,
          ]);
        });
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws["!cols"] = [{ wch: 4 }, ...(esHosp ? [{ wch: 15 }] : []), { wch: 70 }, { wch: 8 }, { wch: 7 }];
        return ws;
      };

      XLSX.utils.book_append_sheet(wb, hoja(resultado.top, "Top 10"), "Top 10");
      XLSX.utils.book_append_sheet(wb, hoja(resultado.todas, "Todas las causas"), "Todas las causas");
      XLSX.writeFile(wb, `${archivo}_${resultado.desde}_a_${resultado.hasta}.xlsx`);
    } catch (e) {
      setError(`No se pudo exportar: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setExportando(false);
    }
  };

  const etiquetaFiltros = (r: ResultadoReporte) => {
    const partes = [
      r.estado === "todos" ? "Vivos y fallecidos" : r.estado === "vivo" ? "Solo vivos" : "Solo fallecidos",
    ];
    if (r.edadMin !== null || r.edadMax !== null) {
      partes.push(`Edad ${r.edadMin ?? 0}–${r.edadMax ?? "y más"} años`);
    }
    return partes.join(" · ");
  };

  const maxCasos = resultado?.top[0]?.casos ?? 0;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Encabezado */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950">
          <BarChart3 size={17} className="text-rose-600 dark:text-rose-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Reportes</h1>
          <p className="mt-0.5 text-xs text-slate-500">Primeras 10 causas según el diagnóstico principal · atenciones en Emergencia o egresos de Hospitalización</p>
        </div>
      </div>

      {/* Selector de reporte */}
      <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {(Object.keys(VISTA_META) as Vista[]).map((v) => {
          const IconoVista = VISTA_META[v].icono;
          const activo = vista === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => cambiarVista(v)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                activo
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <IconoVista size={14} />
              {VISTA_META[v].label}
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 md:p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">
          Filtros del reporte
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Desde</label>
            <DateField value={fechaDesde} onChange={setFechaDesde} ariaLabel="Fecha desde" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Hasta</label>
            <DateField value={fechaHasta} onChange={setFechaHasta} ariaLabel="Fecha hasta" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Estado</label>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)}
              className={`${inputCls} w-40 appearance-none`}
            >
              <option value="todos">Todos</option>
              <option value="vivo">Vivos</option>
              <option value="fallecido">Fallecidos</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Edad de</label>
            <input
              type="text" inputMode="numeric" placeholder="0" value={edadMin}
              onChange={(e) => setEdadMin(e.target.value.replace(/\D/g, "").slice(0, 3))}
              className={`${inputCls} w-20`}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">a</label>
            <input
              type="text" inputMode="numeric" placeholder="120" value={edadMax}
              onChange={(e) => setEdadMax(e.target.value.replace(/\D/g, "").slice(0, 3))}
              className={`${inputCls} w-20`}
            />
          </div>
          <button
            type="button"
            onClick={generar}
            disabled={cargando}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {cargando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {cargando ? "Generando…" : "Generar reporte"}
          </button>
          <button
            type="button"
            onClick={exportarExcel}
            disabled={exportando || !resultado || resultado.top.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            <Download size={15} />
            {exportando ? "Generando…" : "Exportar a Excel"}
          </button>
        </div>
      </section>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertTriangle size={15} className="shrink-0" /> {error}
        </div>
      )}

      {resultado && (
        <>
          {/* Resumen del filtro aplicado */}
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              Del {resultado.desde} al {resultado.hasta}
            </span>
            <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {etiquetaFiltros(resultado)}
            </span>
            <span className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
              {resultado.totalCasos} {VISTA_META[resultado.vista].unidad} con diagnóstico
            </span>
            <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {resultado.totalDistintas} causas distintas
            </span>
            {resultado.sinDiagnostico > 0 && (
              <span className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                <Info size={13} /> {resultado.sinDiagnostico} sin diagnóstico registrado (no contados)
              </span>
            )}
            {resultado.sinEdad > 0 && (
              <span className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                <Info size={13} /> {resultado.sinEdad} sin dato de edad (excluidos por el filtro)
              </span>
            )}
            {resultado.truncado && (
              <span className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                <AlertTriangle size={13} /> Rango muy amplio: se leyeron solo los {MAX_DOCS} registros más recientes
              </span>
            )}
          </div>

          {/* Top 10 */}
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900">
            <div className="bg-gradient-to-r from-blue-50/80 via-white to-indigo-50/60 px-4 py-3.5 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/60">
              <p className="font-heading text-sm font-bold text-slate-900 dark:text-slate-100">
                Top 10 · {VISTA_META[resultado.vista].label}
              </p>
            </div>
            {resultado.top.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">
                No hay {VISTA_META[resultado.vista].unidad} con diagnóstico en ese rango y filtros.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/50">
                      <th className="w-10 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">#</th>
                      {resultado.vista === "hospitalizacion" && (
                        <th className="w-28 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">CIE-10</th>
                      )}
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Diagnóstico</th>
                      <th className="w-20 px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Casos</th>
                      <th className="w-16 px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">%</th>
                      <th className="hidden w-[26%] px-3 py-3 sm:table-cell" aria-label="Proporción" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {resultado.top.map((f, i) => {
                      const pct = resultado.totalCasos ? (f.casos / resultado.totalCasos) * 100 : 0;
                      return (
                        <tr key={`${f.codigo ?? ""}-${f.etiqueta}`} className="transition-colors hover:bg-blue-50/40 dark:hover:bg-slate-800/50">
                          <td className="px-3 py-2.5 text-center">
                            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold ${
                              i < 3
                                ? "bg-blue-600 text-white"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            }`}>{i + 1}</span>
                          </td>
                          {resultado.vista === "hospitalizacion" && (
                            <td className="px-3 py-2.5">
                              <span className="rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
                                {f.codigo}
                              </span>
                            </td>
                          )}
                          <td className="px-3 py-2.5 text-slate-800 dark:text-slate-200">{f.etiqueta}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900 dark:text-slate-100">{f.casos}</td>
                          <td className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500">{pct.toFixed(1)}%</td>
                          <td className="hidden px-3 py-2.5 sm:table-cell">
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                              <div
                                className="h-full rounded-full bg-blue-500 dark:bg-blue-600"
                                style={{ width: `${maxCasos ? (f.casos / maxCasos) * 100 : 0}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {resultado.totalDistintas > 10 && resultado.top.length > 0 && (
              <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500 dark:border-slate-800">
                El Excel incluye las {resultado.totalDistintas} causas del periodo, no solo el top 10.
              </p>
            )}
          </div>
        </>
      )}

      {!resultado && !error && !cargando && (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 py-14 text-center dark:border-slate-700 dark:bg-slate-900/40">
          <BarChart3 size={28} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500">Elige el rango de fechas y presiona &ldquo;Generar reporte&rdquo;.</p>
        </div>
      )}
    </div>
  );
}
