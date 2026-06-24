"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection, query, orderBy, onSnapshot, limit, where, getDocs, documentId,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  Ambulance, HeartPulse, Search, ChevronLeft, ChevronRight, Upload, X,
  ArrowUpRight, Stethoscope, Clock, MapPin, UserCog,
} from "lucide-react";
import { DateField } from "@/components/ui/DateField";
import type { AtencionEmergencia, IngresoHospitalizacion } from "@/types";
import { toDate, formatFechaHora } from "@/lib/pacientes/helpers";
import {
  INGRESO_BADGE, INGRESO_LABEL, triageBadge,
  condicionEgreso, CONDICION_BADGE, CONDICION_LABEL, type CondicionEgresoEmergencia,
} from "@/lib/emergencia/helpers";

type Vista = "atendidos" | "egresos";

const LIMIT = 500;
const PAGE_SIZE = 50;

const FILTROS_ATENDIDOS: { value: string; label: string }[] = [
  { value: "no",    label: "No ingresaron" },
  { value: "si",    label: "Ingresaron" },
  { value: "todos", label: "Todos" },
];

const FILTROS_EGRESOS: { value: string; label: string }[] = [
  { value: "todos",     label: "Todos" },
  { value: "vivo",      label: "Vivos" },
  { value: "fallecido", label: "Fallecidos" },
  { value: "otro",      label: "Otros" },
];

interface Props {
  /** Muestra el botón "Importar reporte" (solo ESDOMED/admin). */
  permiteImportar?: boolean;
  /** Construye el enlace a la ficha del paciente activo (trazabilidad). Si no se
   *  pasa, solo se muestra la insignia sin enlace (p. ej. en el portal médico). */
  fichaHref?: (pacienteId: string) => string;
  /** "atendidos" = todos los atendidos (filtro por ingreso). "egresos" = solo los
   *  que NO ingresaron, filtrados por condición de egreso (vivo / fallecido). */
  vista?: Vista;
}

export function AtencionesEmergenciaConsulta({ permiteImportar, fichaHref, vista = "atendidos" }: Props) {
  const { profile } = useAuth();
  const esEgresos = vista === "egresos";
  const [atenciones, setAtenciones] = useState<AtencionEmergencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<string>(esEgresos ? "todos" : "no");
  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [page, setPage] = useState(1);
  // Mapa expediente → id del ingreso en `pacientes` (para enlazar a la ficha clínica).
  const [ingresosPorExp, setIngresosPorExp] = useState<Map<string, string>>(new Map());
  // Expedientes que existen en el padrón `personas` (registrado en padrón).
  const [registradosPadron, setRegistradosPadron] = useState<Set<string>>(new Set());
  // Atención seleccionada para la ficha de detalle (todos los campos del informe).
  const [seleccion, setSeleccion] = useState<AtencionEmergencia | null>(null);

  useEffect(() => {
    if (!profile) return;
    const q = query(
      collection(db, "atenciones_emergencia"),
      orderBy("fechaHoraIngreso", "desc"),
      limit(LIMIT),
    );
    const unsub = onSnapshot(q, (snap) => {
      setAtenciones(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          fechaHoraIngreso: toDate(data.fechaHoraIngreso) ?? new Date(),
          fechaHoraAltaIngreso: toDate(data.fechaHoraAltaIngreso),
          fechaHoraEntradaTriage: toDate(data.fechaHoraEntradaTriage),
          importadoEn: toDate(data.importadoEn) ?? new Date(),
        } as AtencionEmergencia;
      }));
      setLoading(false);
    });
    return unsub;
  }, [profile]);

  // ── Trazabilidad con el padrón ──────────────────────────────────────────────
  // `personas` (docId = expediente) define "registrado en padrón"; `pacientes` da
  // el id del ingreso para enlazar a la ficha clínica cuando existe.
  //
  // Clave estable del CONJUNTO de expedientes: el cruce solo se recalcula cuando
  // cambian los expedientes (nuevo/quitado), no en cada delta del listener — antes
  // re-consultaba pacientes+personas en cada cambio del snapshot (amplificaba lecturas).
  const expedientesKey = useMemo(
    () => Array.from(new Set(atenciones.map((a) => a.expediente).filter(Boolean))).sort().join("|"),
    [atenciones],
  );

  useEffect(() => {
    if (!profile || !expedientesKey) return;
    const exps = expedientesKey.split("|");
    let cancelado = false;
    (async () => {
      const mapa = new Map<string, string>();
      const padron = new Set<string>();
      try {
        for (let i = 0; i < exps.length; i += 30) {
          const chunk = exps.slice(i, i + 30);
          const [snapPac, snapPer] = await Promise.all([
            getDocs(query(collection(db, "pacientes"), where("expediente", "in", chunk))),
            getDocs(query(collection(db, "personas"), where(documentId(), "in", chunk))),
          ]);
          snapPac.forEach((d) => {
            if (!mapa.has(d.data().expediente)) mapa.set(d.data().expediente, d.id);
          });
          snapPer.forEach((d) => padron.add(d.id));
        }
        if (!cancelado) { setIngresosPorExp(mapa); setRegistradosPadron(padron); }
      } catch {
        // Best-effort: sin permisos o error de red, simplemente no se muestran enlaces.
      }
    })();
    return () => { cancelado = true; };
  }, [profile, expedientesKey]);

  // En egresos, el universo son los que NO ingresaron a hospitalización (egresaron
  // de emergencia). En atendidos, son todas las atenciones.
  const base = useMemo(
    () => (esEgresos ? atenciones.filter((a) => a.ingresoHospitalizacion !== "si") : atenciones),
    [atenciones, esEgresos],
  );

  // En egresos la fecha relevante es la de alta; en atendidos, la de ingreso a emergencia.
  const fechaDe = useCallback(
    (a: AtencionEmergencia) => (esEgresos ? (a.fechaHoraAltaIngreso ?? a.fechaHoraIngreso) : a.fechaHoraIngreso),
    [esEgresos],
  );

  const filtrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    const desde = fechaDesde ? new Date(fechaDesde + "T00:00:00") : null;
    const hasta = fechaHasta ? new Date(fechaHasta + "T23:59:59") : null;
    return base.filter((a) => {
      if (filtro !== "todos") {
        if (esEgresos) { if (condicionEgreso(a.tipoEgreso) !== filtro) return false; }
        else if (a.ingresoHospitalizacion !== filtro) return false;
      }
      const fecha = fechaDe(a);
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      if (!term) return true;
      return (
        a.expediente?.toLowerCase().includes(term) ||
        a.dui?.toLowerCase().includes(term) ||
        a.pacienteNombre?.toLowerCase().includes(term)
      ) ?? false;
    });
  }, [base, filtro, busqueda, fechaDesde, fechaHasta, esEgresos, fechaDe]);

  // Reset de página al cambiar filtros.
  const filtrosKey = `${filtro}|${busqueda}|${fechaDesde}|${fechaHasta}`;
  const [filtrosPrevios, setFiltrosPrevios] = useState(filtrosKey);
  if (filtrosPrevios !== filtrosKey) { setFiltrosPrevios(filtrosKey); setPage(1); }

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginados = filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const conteoAtendidos = useMemo(() => {
    const c: Record<IngresoHospitalizacion, number> = { no: 0, si: 0, sin_dato: 0 };
    base.forEach((a) => { c[a.ingresoHospitalizacion]++; });
    return c;
  }, [base]);

  const conteoEgresos = useMemo(() => {
    const c: Record<CondicionEgresoEmergencia, number> = { vivo: 0, fallecido: 0, otro: 0, sin_dato: 0 };
    base.forEach((a) => { c[condicionEgreso(a.tipoEgreso)]++; });
    return c;
  }, [base]);

  const filtros = esEgresos ? FILTROS_EGRESOS : FILTROS_ATENDIDOS;
  const contarTab = (value: string): number => {
    if (value === "todos") return base.length;
    return esEgresos
      ? conteoEgresos[value as CondicionEgresoEmergencia]
      : conteoAtendidos[value as IngresoHospitalizacion];
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
            esEgresos
              ? "bg-violet-50 dark:bg-violet-950 border-violet-200 dark:border-violet-900"
              : "bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-900"
          }`}>
            {esEgresos
              ? <HeartPulse size={17} className="text-violet-600 dark:text-violet-400" />
              : <Ambulance size={17} className="text-rose-600 dark:text-rose-400" />}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
              {esEgresos ? "Egresos de emergencia" : "Atendidos en emergencia"}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {esEgresos
                ? "Pacientes que egresaron desde emergencia (sin ingresar), por condición de alta."
                : <>Pacientes que pasaron por emergencia. Por defecto se muestran los que <span className="font-medium">no ingresaron</span> a hospitalización.</>}
            </p>
          </div>
        </div>
        {permiteImportar && (
          <Link
            href="/dashboard/emergencia/importar"
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <Upload size={15} />
            Importar reporte
          </Link>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {filtros.map((f) => (
          <button
            key={f.value}
            onClick={() => setFiltro(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filtro === f.value
                ? "bg-blue-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {f.label}
            <span className="ml-1.5 text-xs opacity-70 tabular-nums">{contarTab(f.value)}</span>
          </button>
        ))}
      </div>

      {/* Buscador + rango de fecha */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por expediente, DUI o nombre..."
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">{esEgresos ? "Alta desde" : "Ingreso desde"}</span>
          <DateField
            value={fechaDesde}
            onChange={setFechaDesde}
            clearable
            placeholder={esEgresos ? "Alta desde" : "Ingreso desde"}
            ariaLabel={esEgresos ? "Alta desde" : "Ingreso desde"}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Hasta</span>
          <DateField
            value={fechaHasta}
            onChange={setFechaHasta}
            clearable
            placeholder="Hasta"
            ariaLabel="Hasta"
          />
        </div>
        {(busqueda || fechaDesde || fechaHasta) && (
          <button
            onClick={() => { setBusqueda(""); setFechaDesde(""); setFechaHasta(""); }}
            className="flex items-center gap-1 px-3 py-2 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors shadow-sm"
          >
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <Ambulance size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">
            {atenciones.length === 0
              ? "Aún no hay atenciones de emergencia importadas."
              : "Sin coincidencias para los filtros actuales."}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <Th>Expediente</Th>
                  <Th>Paciente</Th>
                  <Th>{esEgresos ? "Fecha de alta" : "Ingreso a emergencia"}</Th>
                  {!esEgresos && <Th>Triage</Th>}
                  <Th>Diagnóstico</Th>
                  <Th>{esEgresos ? "Condición" : "Hospitalización"}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginados.map((a) => {
                  const pacienteId = ingresosPorExp.get(a.expediente);
                  const enPadron = pacienteId != null || registradosPadron.has(a.expediente);
                  const triage = triageBadge(a.categorizacion);
                  const cond = condicionEgreso(a.tipoEgreso);
                  return (
                    <tr
                      key={a.id}
                      onClick={() => setSeleccion(a)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors align-top cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold font-mono text-slate-900 dark:text-slate-100">{a.expediente}</p>
                        {a.dui && <p className="text-[11px] text-slate-500 mt-0.5 font-mono">{a.dui}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{a.pacienteNombre || "—"}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {a.edadAnios != null ? `${a.edadAnios} años` : a.edadTexto || "—"}
                          {a.genero && <> · {a.genero === "masculino" ? "M" : a.genero === "femenino" ? "F" : "O"}</>}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs whitespace-nowrap">
                        {formatFechaHora(fechaDe(a))}
                        {!esEgresos && a.llegaReferido && (
                          <span className="block text-[11px] text-sky-600 dark:text-sky-400 mt-0.5">Referido</span>
                        )}
                      </td>
                      {!esEgresos && (
                        <td className="px-4 py-3">
                          {a.categorizacion ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${triage ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"}`}>
                              {a.categorizacion}
                            </span>
                          ) : <span className="text-slate-400 text-xs">—</span>}
                        </td>
                      )}
                      <td className="px-4 py-3 max-w-[240px]">
                        <p className="text-slate-700 dark:text-slate-300 text-xs line-clamp-2">{a.diagnostico || "—"}</p>
                      </td>
                      <td className="px-4 py-3">
                        {esEgresos ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${CONDICION_BADGE[cond]}`}>
                            {CONDICION_LABEL[cond]}
                          </span>
                        ) : (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${INGRESO_BADGE[a.ingresoHospitalizacion]}`}>
                            {INGRESO_LABEL[a.ingresoHospitalizacion]}
                          </span>
                        )}
                        <EnlacePadron pacienteId={pacienteId} enPadron={enPadron} fichaHref={fichaHref} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-between gap-4">
            <span className="text-xs text-slate-500 shrink-0">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtrados.length)} de{" "}
              <span className="font-medium text-slate-700 dark:text-slate-300">{filtrados.length}</span>
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-slate-500 px-2 tabular-nums">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
            {atenciones.length === LIMIT && (
              <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">
                Límite de {LIMIT} — afina por fecha
              </span>
            )}
          </div>
        </div>
      )}

      {/* Ficha de detalle — todos los campos del informe */}
      {seleccion && (
        <FichaEmergencia
          atencion={seleccion}
          pacienteId={ingresosPorExp.get(seleccion.expediente)}
          enPadron={ingresosPorExp.has(seleccion.expediente) || registradosPadron.has(seleccion.expediente)}
          fichaHref={fichaHref}
          onClose={() => setSeleccion(null)}
        />
      )}
    </div>
  );
}

function FichaEmergencia({
  atencion: a, pacienteId, enPadron, fichaHref, onClose,
}: {
  atencion: AtencionEmergencia;
  pacienteId?: string;
  enPadron: boolean;
  fichaHref?: (pacienteId: string) => string;
  onClose: () => void;
}) {
  const cond = condicionEgreso(a.tipoEgreso);
  const fechaHora = (d?: Date) => (d ? formatFechaHora(d) : undefined);
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 dark:text-slate-100">{a.pacienteNombre || "—"}</p>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">
              {a.expediente}{a.dui ? ` · ${a.dui}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${INGRESO_BADGE[a.ingresoHospitalizacion]}`}>
                {INGRESO_LABEL[a.ingresoHospitalizacion]}
              </span>
              {a.tipoEgreso && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${CONDICION_BADGE[cond]}`}>
                  {CONDICION_LABEL[cond]}
                </span>
              )}
              {/* Enlace al padrón si el paciente está registrado en personas */}
              {pacienteId && fichaHref ? (
                <Link href={fichaHref(pacienteId)} className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500">
                  <ArrowUpRight size={12} /> Ver ficha en padrón
                </Link>
              ) : enPadron ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                  <Stethoscope size={12} /> Registrado en padrón
                </span>
              ) : null}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 flex-shrink-0" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-5 space-y-5">
          <SeccionFicha icon={Ambulance} titulo="Atención">
            <Campo label="Sexo" value={a.genero ? (a.genero === "masculino" ? "Masculino" : a.genero === "femenino" ? "Femenino" : "Otro") : undefined} />
            <Campo label="Edad" value={a.edadTexto} />
            <Campo label="Ingreso a emergencia" value={fechaHora(a.fechaHoraIngreso)} />
            <Campo label="Categorización (triage)" value={a.categorizacion} />
            <Campo label="Llega referido" value={a.llegaReferido ? "Sí" : "No"} />
            <Campo label="Veterano de guerra" value={a.veteranoGuerra ? "Sí" : "No"} />
            <Campo label="Diagnóstico" value={a.diagnostico} full />
          </SeccionFicha>

          <SeccionFicha icon={UserCog} titulo="Personal médico">
            <Campo label="Médico que realiza el triage" value={a.medicoTriage} />
            <Campo label="Especialidad (triage)" value={a.especialidadTriage} />
            <Campo label="Médico que atiende" value={a.medicoAtiende} />
            <Campo label="Especialidad (atiende)" value={a.especialidadAtiende} />
          </SeccionFicha>

          <SeccionFicha icon={HeartPulse} titulo="Egreso / Hospitalización">
            <Campo label="Ingresó a hospitalización" value={INGRESO_LABEL[a.ingresoHospitalizacion]} />
            <Campo label="Tipo de egreso (condición)" value={a.tipoEgreso} />
            <Campo label="Fecha y hora de alta o ingreso" value={fechaHora(a.fechaHoraAltaIngreso)} />
          </SeccionFicha>

          <SeccionFicha icon={Clock} titulo="Tiempos">
            <Campo label="Entrada a triage" value={fechaHora(a.fechaHoraEntradaTriage)} />
            <Campo label="Llegada al establecimiento" value={a.tiempoLlegadaEstablecimiento} />
            <Campo label="Duración del triage" value={a.tiempoDuracionTriage} />
            <Campo label="Espera a consulta" value={a.tiempoEsperaConsulta} />
            <Campo label="Consulta" value={a.tiempoConsulta} />
            <Campo label="Evaluación" value={a.tiempoEvaluacion} />
            <Campo label="Total en emergencia" value={a.tiempoTotalEmergencia} />
          </SeccionFicha>

          <SeccionFicha icon={MapPin} titulo="Procedencia">
            <Campo label="Establecimiento de procedencia" value={a.establecimientoProcedencia} full />
            <Campo label="Distancia entre establecimientos" value={a.distanciaEntreEstablecimientos} />
          </SeccionFicha>

          <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
            Importado por {a.importadoPorNombre} · {formatFechaHora(a.importadoEn)}
          </p>
        </div>
      </div>
    </div>
  );
}

function SeccionFicha({ icon: Icon, titulo, children }: { icon: typeof Ambulance; titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
        <Icon size={13} className="text-slate-400" /> {titulo}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">{children}</div>
    </div>
  );
}

function Campo({ label, value, full }: { label: string; value?: React.ReactNode; full?: boolean }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-slate-800 dark:text-slate-200 mt-0.5">{value}</p>
    </div>
  );
}

// Indicador de padrón para la fila: enlace a la ficha si hay ingreso, o etiqueta
// "Registrado en padrón" si existe en personas pero no se puede enlazar (o sin permiso).
function EnlacePadron({
  pacienteId, enPadron, fichaHref,
}: {
  pacienteId?: string;
  enPadron: boolean;
  fichaHref?: (pacienteId: string) => string;
}) {
  if (pacienteId && fichaHref) {
    return (
      <Link
        href={fichaHref(pacienteId)}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 mt-1"
      >
        <ArrowUpRight size={11} /> Ver ficha
      </Link>
    );
  }
  if (enPadron) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
        <Stethoscope size={11} /> Registrado en padrón
      </span>
    );
  }
  return null;
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
      {children}
    </th>
  );
}
