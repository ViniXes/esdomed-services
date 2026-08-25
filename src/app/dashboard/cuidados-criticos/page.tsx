"use client";

import { useEffect, useState } from "react";
import { Activity, AlertCircle, FileSpreadsheet, Trash2, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { puedeVerModuloCuidadosCriticos } from "@/lib/accesoCuidadosCriticos";
import { LienzoMatrizCuidadosCriticos } from "@/components/cuidados-criticos/LienzoMatrizCuidadosCriticos";
import { collection, getDocs, limit, orderBy, query } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import {
  actualizarFichaEnCache,
  consultarFichasCuidadosCriticos,
  eliminarFichaDeCache,
  getFichasCuidadosCriticosCache,
  queryFichasServicios,
  queryFichasTodas,
} from "@/lib/fichasCuidadosCriticosQueries";
import { fechaCuidadosCriticos } from "@/lib/fechasCuidadosCriticos";
import { serviciosPorTipoMedico, tipoUnidadPorServicio } from "@/lib/cuidadosCriticos";
import {
  fichaCerradaSinDiagnosticoEgresoCuidadosCriticos,
  fichaPendienteCierreCuidadosCriticos,
} from "@/lib/matrizCuidadosCriticos";
import type { FichaCuidadosCriticos, HistorialEliminacionCuidadosCriticos, TipoMedicoCuidadosCriticos } from "@/types";

type Filtro = "todos" | TipoMedicoCuidadosCriticos;
type FiltroCierre = "todos" | "pendientes" | "cerrados" | "sin_diagnostico_egreso";
type FiltroMes = "todos" | number;

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
] as const;

function toDate(value: unknown): Date | null {
  return fechaCuidadosCriticos(value);
}

function normalizarTexto(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function mesFicha(ficha: FichaCuidadosCriticos) {
  const mesTexto = normalizarTexto(ficha.datos?.mes);
  const indiceMesTexto = MESES.findIndex(mes => mes === mesTexto);
  if (indiceMesTexto >= 0) return indiceMesTexto + 1;

  const fechaIngreso = toDate(ficha.datos?.fecha_ingreso_al_servicio);
  if (fechaIngreso) return fechaIngreso.getMonth() + 1;

  const fechaCreacion = toDate(ficha.creadoEn);
  if (fechaCreacion) return fechaCreacion.getMonth() + 1;

  return 99;
}

function fechaIngresoOrdenFicha(ficha: FichaCuidadosCriticos) {
  return toDate(ficha.datos?.fecha_ingreso_al_servicio)?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function tipoFicha(ficha: FichaCuidadosCriticos) {
  return tipoUnidadPorServicio(ficha.servicio) ?? ficha.tipoUnidad;
}

export default function CuidadosCriticosDashboardPage() {
  const { profile, loading } = useAuth();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [filtroMes, setFiltroMes] = useState<FiltroMes>(() => new Date().getMonth() + 1);
  const [filtroCierre, setFiltroCierre] = useState<FiltroCierre>("todos");
  const [soloSolicitudes, setSoloSolicitudes] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);
  const [historial, setHistorial] = useState<HistorialEliminacionCuidadosCriticos[]>([]);
  const [consultandoHistorial, setConsultandoHistorial] = useState(false);

  const puedeVer = puedeVerModuloCuidadosCriticos(profile);
  const anioConsulta = new Date().getFullYear();
  const serviciosConsulta = profile?.role === "admin" ? [] : serviciosPorTipoMedico(profile?.tipoMedico);
  const claveConsulta = `dashboard-cuidados-criticos:${anioConsulta}:${profile?.role ?? "sin-rol"}:${profile?.tipoMedico ?? "sin-tipo"}`;
  const cacheInicial = getFichasCuidadosCriticosCache(claveConsulta);
  const [fichas, setFichas] = useState<FichaCuidadosCriticos[]>(() => cacheInicial?.fichas ?? []);
  const [consultadoEn, setConsultadoEn] = useState<Date | null>(() => cacheInicial?.consultadoEn ?? null);
  const [consultando, setConsultando] = useState(false);

  useEffect(() => {
    const cache = getFichasCuidadosCriticosCache(claveConsulta);
    queueMicrotask(() => {
      setFichas(cache?.fichas ?? []);
      setConsultadoEn(cache?.consultadoEn ?? null);
    });
  }, [claveConsulta]);

  const consultarFichas = async () => {
    if (!puedeVer || consultando) return;
    setConsultando(true);
    try {
      const consultas = profile?.role === "admin"
        ? [queryFichasTodas()]
        : [queryFichasServicios(serviciosConsulta)];
      const resultado = await consultarFichasCuidadosCriticos(claveConsulta, consultas);
      const docs = [...resultado.fichas].sort((a, b) => (toDate(b.actualizadoEn)?.getTime() ?? 0) - (toDate(a.actualizadoEn)?.getTime() ?? 0));
      setFichas(docs);
      setConsultadoEn(resultado.consultadoEn);
    } finally {
      setConsultando(false);
    }
  };

  const fichasPeriodoCierre = fichas.filter(ficha => {
    const pendiente = fichaPendienteCierreCuidadosCriticos(ficha);
    if (filtroMes !== "todos" && mesFicha(ficha) !== filtroMes) return false;
    if (filtroCierre === "pendientes") return pendiente;
    if (filtroCierre === "cerrados") return !pendiente;
    if (filtroCierre === "sin_diagnostico_egreso") return fichaCerradaSinDiagnosticoEgresoCuidadosCriticos(ficha);
    return true;
  });
  const fichasPeriodoSinFiltroCierre = fichas.filter(ficha => filtroMes === "todos" || mesFicha(ficha) === filtroMes);
  const fichasSinDiagnosticoEgresoPeriodo = fichasPeriodoSinFiltroCierre.filter(fichaCerradaSinDiagnosticoEgresoCuidadosCriticos);
  const fichasPorTipo = filtro === "todos"
    ? fichasPeriodoCierre
    : fichasPeriodoCierre.filter(ficha => tipoFicha(ficha) === filtro);
  const fichasBasePorTipo = filtro === "todos"
    ? fichasPeriodoSinFiltroCierre
    : fichasPeriodoSinFiltroCierre.filter(ficha => tipoFicha(ficha) === filtro);
  const fichasFiltradas = [...fichasPorTipo].sort((a, b) => {
    const mesA = mesFicha(a);
    const mesB = mesFicha(b);
    if (mesA !== mesB) return mesA - mesB;
    const fechaA = fechaIngresoOrdenFicha(a);
    const fechaB = fechaIngresoOrdenFicha(b);
    return fechaA - fechaB;
  });
  const pendientesCierre = fichasBasePorTipo.filter(fichaPendienteCierreCuidadosCriticos).length;
  const cerradasSinDiagnosticoEgreso = (filtro === "todos"
    ? fichasSinDiagnosticoEgresoPeriodo
    : fichasSinDiagnosticoEgresoPeriodo.filter(ficha => tipoFicha(ficha) === filtro)
  ).length;
  const solicitudesEliminacionPendientes = fichasBasePorTipo.filter(ficha => ficha.solicitudEliminacion?.estado === "pendiente").length;
  const fichasMostradas = soloSolicitudes
    ? fichasFiltradas.filter(ficha => ficha.solicitudEliminacion?.estado === "pendiente")
    : fichasFiltradas;

  const alternarSoloSolicitudes = () => {
    setSoloSolicitudes(prev => {
      const siguiente = !prev;
      if (siguiente) setFiltroMes("todos"); // evita que el periodo esconda la solicitud que se busca
      return siguiente;
    });
  };

  const alternarCerradasSinDiagnosticoEgreso = () => {
    setFiltroCierre(prev => prev === "sin_diagnostico_egreso" ? "todos" : "sin_diagnostico_egreso");
  };

  const consultarHistorial = async () => {
    if (profile?.role !== "admin" || consultandoHistorial) return;
    setConsultandoHistorial(true);
    try {
      const snap = await getDocs(query(
        collection(db, "historial_eliminaciones_cuidados_criticos"),
        orderBy("eliminadoEn", "desc"),
        limit(30),
      ));
      setHistorial(snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as HistorialEliminacionCuidadosCriticos)));
    } finally {
      setConsultandoHistorial(false);
    }
  };

  const alternarHistorial = () => {
    const siguiente = !verHistorial;
    setVerHistorial(siguiente);
    if (siguiente && historial.length === 0) void consultarHistorial();
  };

  const manejarFichaEliminada = (id: string) => {
    setFichas(prev => prev.filter(item => item.id !== id));
    eliminarFichaDeCache(claveConsulta, id);
  };
  const manejarFichaActualizada = (ficha: FichaCuidadosCriticos) => {
    setFichas(prev => prev.map(item => item.id === ficha.id ? ficha : item));
    actualizarFichaEnCache(claveConsulta, ficha);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!puedeVer) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Esta vista UCI / UCIN esta habilitada temporalmente solo para el usuario administrador autorizado.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto space-y-6">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
          <Activity size={19} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-heading text-slate-900 dark:text-slate-100">Consolidado UCI y UCIN</h1>
          <p className="text-xs text-slate-500">Lienzo institucional consolidado desde las fichas registradas por los médicos</p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Stat icon={<FileSpreadsheet size={18} />} label="Fichas registradas" value={fichasPeriodoCierre.length} />
        <Stat icon={<Users size={18} />} label="Pacientes UCI" value={fichasPeriodoCierre.filter(item => tipoFicha(item) === "uci").length} />
        <Stat icon={<Users size={18} />} label="Pacientes UCIN" value={fichasPeriodoCierre.filter(item => tipoFicha(item) === "ucin").length} />
        <Stat icon={<AlertCircle size={18} />} label="Pendientes de cierre" value={pendientesCierre} />
        <Stat
          icon={<AlertCircle size={18} />}
          label="Sin diagnóstico egreso"
          value={cerradasSinDiagnosticoEgreso}
          alerta={cerradasSinDiagnosticoEgreso > 0}
          onClick={cerradasSinDiagnosticoEgreso > 0 || filtroCierre === "sin_diagnostico_egreso" ? alternarCerradasSinDiagnosticoEgreso : undefined}
          activo={filtroCierre === "sin_diagnostico_egreso"}
        />
        <Stat
          icon={<Trash2 size={18} />}
          label="Solicitudes de eliminación"
          value={solicitudesEliminacionPendientes}
          alerta={solicitudesEliminacionPendientes > 0}
          onClick={solicitudesEliminacionPendientes > 0 || soloSolicitudes ? alternarSoloSolicitudes : undefined}
          activo={soloSolicitudes}
        />
      </div>
      {profile?.role === "admin" && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={alternarHistorial}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
              verHistorial
                ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
                : "border-slate-200 text-slate-600 hover:border-amber-300 hover:text-amber-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-amber-900 dark:hover:text-amber-300"
            }`}
          >
            <Trash2 size={14} />
            Historial de eliminaciones
          </button>
        </div>
      )}
      {verHistorial && profile?.role === "admin" && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-heading font-bold text-amber-900 dark:text-amber-200">Historial de eliminaciones UCI/UCIN</h2>
              <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-300/80">Ultimos 30 registros eliminados por administracion.</p>
            </div>
            <button
              type="button"
              onClick={consultarHistorial}
              disabled={consultandoHistorial}
              className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950"
            >
              {consultandoHistorial ? "Consultando..." : "Actualizar"}
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-amber-200 bg-white dark:border-amber-900 dark:bg-slate-950">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Expediente</th>
                  <th className="px-3 py-2">Paciente</th>
                  <th className="px-3 py-2">Servicio</th>
                  <th className="px-3 py-2">Solicitado por</th>
                  <th className="px-3 py-2">Eliminado por</th>
                  <th className="px-3 py-2">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100 dark:divide-slate-800">
                {historial.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-center text-slate-500">
                      {consultandoHistorial ? "Cargando historial..." : "Sin eliminaciones registradas desde la activacion de esta bitacora."}
                    </td>
                  </tr>
                ) : historial.map(item => (
                  <tr key={item.id}>
                    <td className="px-3 py-2">{toDate(item.eliminadoEn)?.toLocaleString("es-SV") ?? "No registrado"}</td>
                    <td className="px-3 py-2 font-mono">{item.pacienteExpediente}</td>
                    <td className="px-3 py-2">{item.pacienteNombre}</td>
                    <td className="px-3 py-2">{item.servicio}</td>
                    <td className="px-3 py-2">{item.solicitudEliminacion?.solicitadoPorNombre ?? "Eliminacion directa"}</td>
                    <td className="px-3 py-2">{item.eliminadoPorNombre}</td>
                    <td className="px-3 py-2">{item.solicitudEliminacion?.motivo ?? "Eliminacion directa por administrador"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {soloSolicitudes && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Mostrando solo fichas con solicitud de eliminación pendiente. Activa <strong>&quot;Eliminar&quot;</strong> en la tabla para ver el ícono y revisarla.
          <button type="button" onClick={alternarSoloSolicitudes} className="ml-auto font-semibold underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100">
            Ver todas
          </button>
        </div>
      )}

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold font-heading text-slate-900 dark:text-slate-100">Lienzo consolidado</h2>
            <p className="mt-1 text-xs text-slate-500">Cada ficha forma una fila. Las columnas mantienen los nombres y el orden de la matriz compartida.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex rounded-lg border border-slate-200 p-1 dark:border-slate-700">
              {(["todos", "uci", "ucin"] as Filtro[]).map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFiltro(value)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase ${filtro === value ? "bg-blue-600 text-white" : "text-slate-500 hover:text-blue-600"}`}
                >
                  {value}
                </button>
              ))}
            </div>
            <label className="space-y-1">
              <span className="block text-[11px] font-semibold text-slate-500">Periodo</span>
              <select
                value={filtroMes}
                onChange={event => setFiltroMes(event.target.value === "todos" ? "todos" : Number(event.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="todos">Todos los meses</option>
                {MESES.map((mes, index) => (
                  <option key={mes} value={index + 1}>{mes}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-[11px] font-semibold text-slate-500">Cierre</span>
              <select
                value={filtroCierre}
                onChange={event => setFiltroCierre(event.target.value as FiltroCierre)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="todos">Todos</option>
                <option value="pendientes">Pendientes</option>
                <option value="cerrados">Cerrados</option>
                <option value="sin_diagnostico_egreso">Sin diagnóstico egreso</option>
              </select>
            </label>
          </div>
        </div>
        <LienzoMatrizCuidadosCriticos
          tipo={filtro === "uci" ? "uci" : "ucin"}
          fichas={fichasMostradas}
          onRefresh={consultarFichas}
          refreshing={consultando}
          refreshLabel={consultadoEn ? "Actualizar matriz" : "Consultar matriz"}
          onFichaEliminada={manejarFichaEliminada}
          onFichaActualizada={manejarFichaActualizada}
        />
      </section>
    </div>
  );
}

function Stat({
  icon, label, value, alerta = false, onClick, activo = false,
}: {
  icon: React.ReactNode; label: string; value: number | string; alerta?: boolean; onClick?: () => void; activo?: boolean;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition-colors ${onClick ? "cursor-pointer hover:border-amber-400" : ""} ${
        activo
          ? "border-amber-500 bg-amber-100 ring-2 ring-amber-300 dark:border-amber-500 dark:bg-amber-950 dark:ring-amber-800"
          : alerta
            ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
            : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      }`}
    >
      <div className={`flex items-center gap-2 ${alerta || activo ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400"}`}>{icon}<span className={`text-xs font-medium ${alerta || activo ? "text-amber-700 dark:text-amber-400" : "text-slate-500"}`}>{label}</span></div>
      <p className={`mt-2 text-2xl font-bold ${alerta || activo ? "text-amber-700 dark:text-amber-300" : "text-slate-900 dark:text-slate-100"}`}>{value}</p>
      {onClick && <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">{activo ? "Mostrando solo estas ▾" : "Click para filtrar"}</p>}
    </Wrapper>
  );
}
