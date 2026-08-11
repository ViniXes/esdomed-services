"use client";

import { useState } from "react";
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { DateField } from "@/components/ui/DateField";
import { calcularEdad, toDate, ESTADO_LABEL as ESTADO_PACIENTE_LABEL, ESTADO_BADGE } from "@/lib/pacientes/helpers";
import {
  TIPOS_CASO, TIPO_CASO_LABEL, TIPO_CASO_CHIP, clasificarIngreso, esMenorDeEdad,
} from "@/lib/conapinaFgr";
import {
  ShieldAlert, Car, HeartCrack, Search, X, Download, AlertTriangle, CheckCircle2,
  Activity, ChevronLeft, ChevronRight, Info, Loader2,
} from "lucide-react";
import type { Paciente, TipoCasoConapinaFgr, NotificacionConapinaFgr } from "@/types";

const ICONO_CASO = { violencia: ShieldAlert, accidente_transito: Car, intento_suicida: HeartCrack } as const;

// Techo de lectura por consulta. El rango es del usuario, así que hay que
// acotarlo: sin esto un rango de un año podría leer decenas de miles de docs.
const MAX_INGRESOS = 2000;
const MAX_AVISOS = 1000;
const PAGE_SIZE = 20;

const thCls = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap";

interface Fila {
  paciente: Paciente;
  categoria: TipoCasoConapinaFgr;
  codigo: string;
  origen: string;
  tieneAviso: boolean;
}

const primerDiaDelMes = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
};
const hoyISO = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function LesionesIngresosPage() {
  const [fechaDesde, setFechaDesde] = useState(primerDiaDelMes());
  const [fechaHasta, setFechaHasta] = useState(hoyISO());
  const [tipo, setTipo] = useState<TipoCasoConapinaFgr | "todos">("todos");
  const [soloSinAviso, setSoloSinAviso] = useState(false);

  const [filas, setFilas] = useState<Fila[] | null>(null);   // null = aún no se busca
  const [leidos, setLeidos] = useState(0);
  const [tope, setTope] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [exportando, setExportando] = useState(false);

  const buscar = async () => {
    if (!fechaDesde || !fechaHasta) {
      setError("Elige el rango de fechas de ingreso.");
      return;
    }
    setBuscando(true);
    setError(null);
    try {
      const desde = Timestamp.fromDate(new Date(fechaDesde + "T00:00:00"));
      const hasta = Timestamp.fromDate(new Date(fechaHasta + "T23:59:59"));

      // Rango y orden sobre el MISMO campo → no exige índice compuesto.
      const snap = await getDocs(query(
        collection(db, "pacientes"),
        where("fechaIngreso", ">=", desde),
        where("fechaIngreso", "<=", hasta),
        orderBy("fechaIngreso", "desc"),
        limit(MAX_INGRESOS),
      ));
      const pacientes = snap.docs.map(d => ({ id: d.id, ...d.data() } as Paciente));
      setLeidos(pacientes.length);
      setTope(pacientes.length >= MAX_INGRESOS);

      // Avisos del periodo para el cruce. Se buscan desde el inicio del rango
      // sin techo superior: el aviso siempre es posterior al ingreso.
      const avisosSnap = await getDocs(query(
        collection(db, "notificaciones_conapina_fgr"),
        where("creadoEn", ">=", desde),
        orderBy("creadoEn", "desc"),
        limit(MAX_AVISOS),
      ));
      const conAviso = new Set(
        avisosSnap.docs
          .map(d => d.data() as NotificacionConapinaFgr)
          .filter(n => n.estado !== "anulado")
          .map(n => (n.pacienteExpediente ?? "").trim().toLowerCase()),
      );

      const encontradas: Fila[] = [];
      for (const p of pacientes) {
        const clas = clasificarIngreso(p);
        if (!clas) continue;
        encontradas.push({
          paciente: p,
          categoria: clas.categoria,
          codigo: clas.codigo,
          origen: clas.origen,
          tieneAviso: conAviso.has((p.expediente ?? "").trim().toLowerCase()),
        });
      }
      setFilas(encontradas);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la búsqueda.");
      setFilas([]);
    } finally {
      setBuscando(false);
    }
  };

  const displayList = (filas ?? []).filter(f => {
    if (tipo !== "todos" && f.categoria !== tipo) return false;
    if (soloSinAviso && f.tieneAviso) return false;
    return true;
  });

  const filtrosKey = `${tipo}|${soloSinAviso}`;
  const [filtrosPrevios, setFiltrosPrevios] = useState(filtrosKey);
  if (filtrosPrevios !== filtrosKey) {
    setFiltrosPrevios(filtrosKey);
    setPage(1);
  }

  const totalPaginas = Math.max(1, Math.ceil(displayList.length / PAGE_SIZE));
  const paginaActual = Math.min(page, totalPaginas);
  const paginados = displayList.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);

  const porCategoria = (c: TipoCasoConapinaFgr) => (filas ?? []).filter(f => f.categoria === c).length;
  const sinAviso = (filas ?? []).filter(f => !f.tieneAviso).length;

  const formatFecha = (d?: Date | null) =>
    d ? d.toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  const exportar = async () => {
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const rows = displayList.map(f => {
        const p = f.paciente;
        return {
          EXPEDIENTE: p.expediente ?? "",
          PACIENTE: `${p.apellidos ?? ""}, ${p.nombres ?? ""}`.trim(),
          EDAD: calcularEdad(toDate(p.fechaNacimiento)) ?? "",
          "FECHA DE INGRESO": formatFecha(toDate(p.fechaIngreso)),
          "SERVICIO DE INGRESO": p.servicioIngreso ?? "",
          "SERVICIO ACTUAL": p.servicioActual ?? "",
          "TIPO DE LESION": TIPO_CASO_LABEL[f.categoria],
          "CODIGO CIE-10": f.codigo,
          "TOMADO DE": f.origen,
          "ESTADO DEL PACIENTE": ESTADO_PACIENTE_LABEL[p.estado] ?? p.estado ?? "",
          "TIENE AVISO CONAPINA/FGR": f.tieneAviso ? "SI" : "NO",
        };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Ingresos lesiones");
      XLSX.writeFile(wb, `ingresos_lesiones_intencionales_${fechaDesde}_a_${fechaHasta}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar.");
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950">
          <Activity size={17} className="text-rose-600 dark:text-rose-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Ingresos por lesiones intencionales</h1>
          <p className="mt-0.5 text-xs text-slate-500">Expedientes con diagnóstico de accidente de tránsito, intento suicida o violencia</p>
        </div>
      </div>

      {/* Criterio de búsqueda */}
      <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 md:p-5">
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Periodo de ingreso</p>
          <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">Buscar ingresos</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Se leen los ingresos del rango y se clasifican por CIE-10 en el navegador. La búsqueda es bajo demanda.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Desde</span>
            <DateField value={fechaDesde} onChange={setFechaDesde} placeholder="Desde" ariaLabel="Ingreso desde" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Hasta</span>
            <DateField value={fechaHasta} onChange={setFechaHasta} placeholder="Hasta" ariaLabel="Ingreso hasta" maxDate={new Date()} />
          </div>
          <button onClick={buscar} disabled={buscando}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 disabled:opacity-50">
            {buscando ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            {buscando ? "Buscando…" : "Buscar"}
          </button>
          {filas !== null && (
            <button onClick={exportar} disabled={exportando || displayList.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50">
              <Download size={13} /> {exportando ? "Generando..." : "Excel"}
            </button>
          )}
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span className="text-xs">{error}</span>
          </div>
        )}

        {filas !== null && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {TIPOS_CASO.map(t => {
                const Icono = ICONO_CASO[t];
                return (
                  <div key={t} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/40">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-600 text-white"><Icono size={16} /></span>
                    <div className="min-w-0">
                      <p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{porCategoria(t)}</p>
                      <p className="mt-1 truncate text-[11px] font-medium text-slate-500">{TIPO_CASO_LABEL[t]}</p>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5 dark:border-amber-900/60 dark:bg-amber-950/25">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white"><AlertTriangle size={16} /></span>
                <div className="min-w-0">
                  <p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{sinAviso}</p>
                  <p className="mt-1 truncate text-[11px] font-medium text-slate-500">Sin aviso registrado</p>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {(["todos", ...TIPOS_CASO] as const).map(t => (
                <button key={t} onClick={() => setTipo(t)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    tipo === t
                      ? "bg-blue-600 text-white"
                      : "border border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                  }`}>
                  {t === "todos" ? "Todos" : TIPO_CASO_LABEL[t]}
                </button>
              ))}
              <button onClick={() => setSoloSinAviso(v => !v)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  soloSinAviso
                    ? "bg-amber-700 text-white"
                    : "border border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                }`}>
                <AlertTriangle size={13} /> Solo sin aviso
              </button>
              {soloSinAviso && (
                <button onClick={() => setSoloSinAviso(false)}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-500 transition-colors hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:hover:text-slate-100">
                  <X size={12} /> Quitar
                </button>
              )}
            </div>

            <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-slate-500">
              <Info size={13} className="mt-0.5 shrink-0 text-cyan-600 dark:text-cyan-300" />
              Se revisaron {leidos} ingresos del periodo y {displayList.length} corresponden a lesiones intencionales.
              La clasificación depende de cómo esté codificado el expediente: si un atropello quedó registrado solo como
              &quot;fractura&quot; sin causa externa, no aparecerá aquí.
              {tope && <strong className="ml-1 text-amber-700 dark:text-amber-400">Se alcanzó el tope de {MAX_INGRESOS} ingresos: acorta el rango para no perder registros.</strong>}
            </p>
          </>
        )}
      </section>

      {/* Tabla */}
      {filas !== null && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 dark:bg-slate-800/50">
                <tr>
                  <th className={thCls}>Expediente</th>
                  <th className={thCls}>Paciente</th>
                  <th className={thCls}>Edad</th>
                  <th className={thCls}>Ingreso</th>
                  <th className={thCls}>Servicio</th>
                  <th className={thCls}>Tipo de lesión</th>
                  <th className={thCls}>CIE-10</th>
                  <th className={thCls}>Estado</th>
                  <th className={thCls}>Aviso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginados.map(f => {
                  const p = f.paciente;
                  const edad = calcularEdad(toDate(p.fechaNacimiento));
                  const Icono = ICONO_CASO[f.categoria];
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">{p.expediente}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">{p.apellidos}, {p.nombres}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {edad !== null ? (
                          <span className="flex items-center gap-1.5">
                            <span className="text-slate-700 dark:text-slate-300">{edad}</span>
                            {esMenorDeEdad(edad) && (
                              <span className="rounded border border-violet-200 bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-800 dark:bg-violet-900/50 dark:text-violet-300">
                                Menor
                              </span>
                            )}
                          </span>
                        ) : <span className="text-slate-400">s/d</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">{formatFecha(toDate(p.fechaIngreso))}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">{p.servicioActual || p.servicioIngreso || "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TIPO_CASO_CHIP[f.categoria]}`}>
                          <Icono size={11} /> {TIPO_CASO_LABEL[f.categoria]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300">{f.codigo}</span>
                        <span className="mt-0.5 block text-[11px] text-slate-400">{f.origen}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_BADGE[p.estado] ?? ""}`}>
                          {ESTADO_PACIENTE_LABEL[p.estado] ?? p.estado}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {f.tieneAviso ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 size={12} /> Notificado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                            <AlertTriangle size={11} /> Sin aviso
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {paginados.length === 0 && (
            <p className="py-12 text-center text-sm text-slate-500">
              No se encontraron ingresos por lesiones intencionales con estos criterios.
            </p>
          )}

          {totalPaginas > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/50">
              <span className="text-xs text-slate-500">Página {paginaActual} de {totalPaginas}</span>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={paginaActual === 1}
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:hover:text-slate-100"
                  aria-label="Página anterior">
                  <ChevronLeft size={14} />
                </button>
                <button onClick={() => setPage(p => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas}
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:hover:text-slate-100"
                  aria-label="Página siguiente">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {filas === null && !buscando && (
        <p className="py-12 text-center text-sm text-slate-400">
          Elige el periodo de ingreso y pulsa Buscar.
        </p>
      )}
    </div>
  );
}
