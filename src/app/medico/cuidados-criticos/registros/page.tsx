"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, FileSpreadsheet, Search, Table2, Trash2, Users } from "lucide-react";
import { LienzoMatrizCuidadosCriticos } from "@/components/cuidados-criticos/LienzoMatrizCuidadosCriticos";
import { useAuth } from "@/contexts/AuthContext";
import { DateField } from "@/components/ui/DateField";
import {
  servicioCoincideCuidadosCriticos,
  serviciosPorTipoMedico,
  TIPO_MEDICO_CRITICO_LABEL,
} from "@/lib/cuidadosCriticos";
import {
  actualizarFichaEnCache,
  consultarFichasCuidadosCriticos,
  getFichasCuidadosCriticosCache,
  queryFichasServicios,
} from "@/lib/fichasCuidadosCriticosQueries";
import { fechaCuidadosCriticos } from "@/lib/fechasCuidadosCriticos";
import { esValorRegistrado, fichaPendienteCierreCuidadosCriticos, valorComoTexto } from "@/lib/matrizCuidadosCriticos";
import type { FichaCuidadosCriticos, TipoMedicoCuidadosCriticos } from "@/types";

type PeriodoFiltro = "todos" | "mes" | "rango";
type CierreFiltro = "todos" | "pendientes" | "cerrados";
type FiltrosPersistidos = {
  servicio?: string;
  periodo?: PeriodoFiltro;
  cierre?: CierreFiltro;
  mes?: string;
  desde?: string;
  hasta?: string;
  busqueda?: string;
};

const FILTROS_STORAGE_KEY = "cuidados-criticos:mis-registros:filtros:v1";

const MESES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

const inputCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

function esPeriodoFiltro(value: unknown): value is PeriodoFiltro {
  return value === "todos" || value === "mes" || value === "rango";
}

function esCierreFiltro(value: unknown): value is CierreFiltro {
  return value === "todos" || value === "pendientes" || value === "cerrados";
}

function leerFiltrosPersistidos(): FiltrosPersistidos {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FILTROS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<FiltrosPersistidos>;
    return {
      servicio: typeof parsed.servicio === "string" ? parsed.servicio : undefined,
      periodo: esPeriodoFiltro(parsed.periodo) ? parsed.periodo : undefined,
      cierre: esCierreFiltro(parsed.cierre) ? parsed.cierre : undefined,
      mes: typeof parsed.mes === "string" && MESES.includes(parsed.mes) ? parsed.mes : undefined,
      desde: typeof parsed.desde === "string" ? parsed.desde : undefined,
      hasta: typeof parsed.hasta === "string" ? parsed.hasta : undefined,
      busqueda: typeof parsed.busqueda === "string" ? parsed.busqueda : undefined,
    };
  } catch {
    return {};
  }
}

function fechaIngresoFicha(ficha: FichaCuidadosCriticos) {
  if (!esValorRegistrado(ficha.datos?.fecha_ingreso_al_servicio)) return null;
  return fechaCuidadosCriticos(ficha.datos?.fecha_ingreso_al_servicio);
}

function mesFicha(ficha: FichaCuidadosCriticos) {
  const indice = MESES.indexOf(valorComoTexto(ficha.datos?.mes));
  return indice === -1 ? MESES.length : indice;
}

function enRango(fecha: Date | null, desde: string, hasta: string) {
  if (!fecha) return false;
  const inicio = fechaCuidadosCriticos(desde);
  const fin = fechaCuidadosCriticos(hasta);
  if (inicio && fecha < inicio) return false;
  if (fin && fecha > fin) return false;
  return true;
}

function fichaEgresada(ficha: FichaCuidadosCriticos) {
  return ficha.estadoEstancia === "egresada"
    || esValorRegistrado(ficha.datos?.fecha_egreso_del_servicio)
    || ficha.datos?.alta === "FALLECIDO";
}

function servicioEnLista(servicio: string | null | undefined, servicios: string[]) {
  return servicios.some(item => servicioCoincideCuidadosCriticos(servicio, item));
}

function ordenarFichas(fichas: FichaCuidadosCriticos[]) {
  return [...fichas].sort((a, b) => {
    const mesA = mesFicha(a);
    const mesB = mesFicha(b);
    if (mesA !== mesB) return mesA - mesB;
    const fechaA = fechaIngresoFicha(a)?.getTime();
    const fechaB = fechaIngresoFicha(b)?.getTime();
    if (fechaA == null && fechaB == null) return 0;
    if (fechaA == null) return 1;
    if (fechaB == null) return -1;
    return fechaA - fechaB;
  });
}

export default function RegistrosCuidadosCriticosMedicoPage() {
  const { profile } = useAuth();
  const [filtrosIniciales] = useState<FiltrosPersistidos>(() => leerFiltrosPersistidos());
  const [servicio, setServicio] = useState(filtrosIniciales.servicio ?? "todos");
  const [periodo, setPeriodo] = useState<PeriodoFiltro>(filtrosIniciales.periodo ?? "mes");
  const [cierre, setCierre] = useState<CierreFiltro>(filtrosIniciales.cierre ?? "todos");
  const [mes, setMes] = useState(filtrosIniciales.mes ?? MESES[new Date().getMonth()]);
  const [desde, setDesde] = useState(filtrosIniciales.desde ?? "");
  const [hasta, setHasta] = useState(filtrosIniciales.hasta ?? "");
  const [busqueda, setBusqueda] = useState(filtrosIniciales.busqueda ?? "");

  const tipoMedicoActivo: TipoMedicoCuidadosCriticos | null = profile?.role === "admin"
    ? "uci_ucin"
    : profile?.tipoMedico ?? null;
  const servicios = useMemo(() => tipoMedicoActivo ? serviciosPorTipoMedico(tipoMedicoActivo) : [], [tipoMedicoActivo]);
  const claveConsulta = `medico-registros-cuidados:${servicios.join("|")}`;
  const cacheInicial = getFichasCuidadosCriticosCache(claveConsulta);
  const [fichas, setFichas] = useState<FichaCuidadosCriticos[]>(() => ordenarFichas((cacheInicial?.fichas ?? []).filter(ficha => servicioEnLista(ficha.servicio, servicios))));
  const [consultadoEn, setConsultadoEn] = useState<Date | null>(() => cacheInicial?.consultadoEn ?? null);
  const [consultando, setConsultando] = useState(false);

  useEffect(() => {
    if (servicio === "todos" || servicios.length === 0 || servicioEnLista(servicio, servicios)) return;
    setServicio("todos");
  }, [servicio, servicios]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(FILTROS_STORAGE_KEY, JSON.stringify({
      servicio,
      periodo,
      cierre,
      mes,
      desde,
      hasta,
      busqueda,
    } satisfies FiltrosPersistidos));
  }, [busqueda, cierre, desde, hasta, mes, periodo, servicio]);

  useEffect(() => {
    const cache = getFichasCuidadosCriticosCache(claveConsulta);
    queueMicrotask(() => {
      setFichas(ordenarFichas((cache?.fichas ?? []).filter(ficha => servicioEnLista(ficha.servicio, servicios))));
      setConsultadoEn(cache?.consultadoEn ?? null);
    });
  }, [claveConsulta, servicios]);

  const consultarFichas = async () => {
    if (!tipoMedicoActivo || servicios.length === 0 || consultando) return;
    setConsultando(true);
    try {
      const resultado = await consultarFichasCuidadosCriticos(claveConsulta, [queryFichasServicios(servicios)]);
      setFichas(ordenarFichas(resultado.fichas.filter(ficha => servicioEnLista(ficha.servicio, servicios))));
      setConsultadoEn(resultado.consultadoEn);
    } finally {
      setConsultando(false);
    }
  };

  const fichasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return fichas.filter(ficha => {
      if (servicio !== "todos" && !servicioCoincideCuidadosCriticos(ficha.servicio, servicio)) return false;
      const pendienteCierre = fichaPendienteCierreCuidadosCriticos(ficha);
      if (cierre === "pendientes" && !pendienteCierre) return false;
      if (cierre === "cerrados" && pendienteCierre) return false;
      if (periodo === "mes" && valorComoTexto(ficha.datos?.mes) !== mes) return false;
      if (periodo === "rango" && !enRango(fechaIngresoFicha(ficha), desde, hasta)) return false;
      if (!texto) return true;
      return `${ficha.pacienteExpediente} ${ficha.pacienteNombre} ${ficha.servicio} ${ficha.cama ?? ""}`
        .toLowerCase()
        .includes(texto);
    });
  }, [busqueda, cierre, desde, fichas, hasta, mes, periodo, servicio]);

  const pacientesUnicos = new Set(fichasFiltradas.map(ficha => ficha.pacienteExpediente)).size;
  const activas = fichasFiltradas.filter(ficha => !fichaEgresada(ficha)).length;
  const pendientesCierre = fichasFiltradas.filter(fichaPendienteCierreCuidadosCriticos).length;
  const solicitudesPendientes = fichasFiltradas.filter(ficha => ficha.solicitudEliminacion?.estado === "pendiente").length;

  const manejarFichaActualizada = (ficha: FichaCuidadosCriticos) => {
    setFichas(prev => prev.map(item => item.id === ficha.id ? ficha : item));
    actualizarFichaEnCache(claveConsulta, ficha);
  };

  if (!tipoMedicoActivo) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Tu usuario no tiene permisos de Medico UCI o Medico UCIN para consultar este consolidado.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
          <Table2 size={19} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-heading text-slate-900 dark:text-slate-100">Mis registros UCI / UCIN</h1>
          <p className="text-xs text-slate-500">
            {TIPO_MEDICO_CRITICO_LABEL[tipoMedicoActivo]} - Vista consolidada de las estancias registradas en tus unidades.
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<FileSpreadsheet size={18} />} label="Entradas filtradas" value={fichasFiltradas.length} />
        <Stat icon={<Users size={18} />} label="Pacientes" value={pacientesUnicos} />
        <Stat icon={<Activity size={18} />} label="Activas" value={activas} />
        <Stat icon={<AlertCircle size={18} />} label="Pendientes de cierre" value={pendientesCierre} variant={pendientesCierre > 0 ? "warning" : "default"} />
        <Stat icon={<Trash2 size={18} />} label="Solicitudes de eliminación" value={solicitudesPendientes} variant={solicitudesPendientes > 0 ? "warning" : "default"} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Servicio</span>
            <select value={servicio} onChange={event => setServicio(event.target.value)} className={`${inputCls} w-full`}>
              <option value="todos">Todos mis servicios</option>
              {servicios.map(item => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Periodo</span>
            <select value={periodo} onChange={event => setPeriodo(event.target.value as PeriodoFiltro)} className={inputCls}>
              <option value="todos">Todas las entradas</option>
              <option value="mes">Por mes</option>
              <option value="rango">Rango de fechas</option>
            </select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Cierre</span>
            <select value={cierre} onChange={event => setCierre(event.target.value as CierreFiltro)} className={inputCls}>
              <option value="todos">Todos</option>
              <option value="pendientes">Pendientes</option>
              <option value="cerrados">Cerrados</option>
            </select>
          </label>

          {periodo === "mes" && (
            <label>
              <span className="mb-1 block text-xs font-semibold text-slate-500">Mes</span>
              <select value={mes} onChange={event => setMes(event.target.value)} className={inputCls}>
                {MESES.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          )}

          {periodo === "rango" && (
            <>
              <label>
                <span className="mb-1 block text-xs font-semibold text-slate-500">Desde ingreso UCI/UCIN</span>
                <DateField value={desde} onChange={setDesde} placeholder="Desde" ariaLabel="Desde ingreso UCI/UCIN" clearable />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold text-slate-500">Hasta ingreso UCI/UCIN</span>
                <DateField value={hasta} onChange={setHasta} placeholder="Hasta" ariaLabel="Hasta ingreso UCI/UCIN" clearable />
              </label>
            </>
          )}

          <button
            type="button"
            onClick={consultarFichas}
            disabled={consultando}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Search size={14} />
            {consultando ? "Consultando..." : consultadoEn ? "Actualizar" : "Consultar"}
          </button>

          <label className="min-w-64 flex-1">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Buscar</span>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={busqueda}
                onChange={event => setBusqueda(event.target.value)}
                placeholder="Expediente, paciente, servicio o cama..."
                className={`${inputCls} w-full pl-9`}
              />
            </div>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <LienzoMatrizCuidadosCriticos
          tipo={tipoMedicoActivo}
          fichas={fichasFiltradas}
          expedienteHref={ficha => ficha.id ? `/medico/cuidados-criticos?ficha=${ficha.id}` : undefined}
          onFichaActualizada={manejarFichaActualizada}
        />
      </section>
    </div>
  );
}

function Stat({ icon, label, value, variant = "default" }: { icon: React.ReactNode; label: string; value: number | string; variant?: "default" | "warning" }) {
  const warning = variant === "warning";
  return (
    <div className={`group relative overflow-hidden rounded-2xl border p-4 shadow-sm transition-shadow hover:shadow-md ${
      warning
        ? "border-rose-200 bg-gradient-to-br from-rose-50 to-white dark:border-rose-900/60 dark:from-rose-950/40 dark:to-slate-900"
        : "border-slate-200 bg-gradient-to-br from-slate-50 to-white dark:border-slate-800 dark:from-slate-900 dark:to-slate-900"
    }`}>
      <div className={`absolute -right-3 -top-3 h-16 w-16 rounded-full blur-2xl ${warning ? "bg-rose-300/30 dark:bg-rose-500/10" : "bg-blue-300/20 dark:bg-blue-500/10"}`} />
      <div className="relative flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          warning
            ? "bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-300"
            : "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300"
        }`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className={`truncate text-xs font-semibold uppercase tracking-wide ${warning ? "text-rose-600 dark:text-rose-300" : "text-slate-500 dark:text-slate-400"}`}>{label}</p>
          <p className={`text-2xl font-bold font-heading leading-tight ${warning ? "text-rose-700 dark:text-rose-100" : "text-slate-900 dark:text-slate-100"}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}
