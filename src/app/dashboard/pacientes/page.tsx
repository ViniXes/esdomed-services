"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  collection, query, where, orderBy, getDocs, limit, QueryConstraint,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { DateField } from "@/components/ui/DateField";
import { useAuth } from "@/contexts/AuthContext";
import { useServicios } from "@/contexts/ServiciosContext";
import { BedDouble, Plus, Search, Clock, Filter, ChevronDown, ChevronLeft, ChevronRight, Upload, X, RefreshCw, FileDown } from "lucide-react";
import type { EstadoPaciente, Paciente } from "@/types";
import {
  ESTADO_BADGE, ESTADO_LABEL, calcularEdad, diasEstancia, formatFecha,
  nombreCompleto, toDate,
} from "@/lib/pacientes/helpers";

type FiltroEstado = EstadoPaciente | "todos" | "alta_vivo_todos";

// Egresos vivos de cualquier tipo (toda alta sin defunción). Se consultan juntos
// con un `where("estado", "in", ...)`.
const ESTADOS_ALTA_VIVO: EstadoPaciente[] = [
  "alta_vivo", "alta_voluntaria", "referido", "fuga", "in_extremis",
];

const FILTROS: { value: FiltroEstado; label: string }[] = [
  { value: "activo",          label: "Activos" },
  { value: "alta_vivo_todos", label: "Alta vivo (todos)" },
  { value: "alta_vivo",       label: "Alta vivo" },
  { value: "alta_fallecido",  label: "Fallecidos" },
  { value: "alta_voluntaria", label: "Alta vol." },
  { value: "referido",        label: "Referidos" },
  { value: "fuga",            label: "Fugas" },
  // "Todos" oculto a propósito: lee hasta LIMIT_TODOS (1000) docs por consulta —
  // es la pestaña más cara y era fácil pulsarla por accidente. La lógica sigue
  // intacta (LIMIT_TODOS, ramas `filtro === "todos"`); para reactivarla,
  // descomentar esta línea.
  // { value: "todos",           label: "Todos" },
];

const LIMIT_HISTORICO = 300;
// "Todos" mezcla todos los estados; un tope más alto evita que ingresos antiguos
// (p. ej. de reportes viejos) queden fuera de la ventana y no se encuentren al buscar.
const LIMIT_TODOS = 1000;
const PAGE_SIZE = 50;

// Caché de consultas ya hechas en la sesión del SPA (sobrevive a navegación
// client-side, no a recarga completa). Volver a una combinación ya consultada
// la muestra sin releer Firestore; "Actualizar" siempre re-lee y refresca la
// entrada. Con techo de entradas para no acumular rangos grandes toda la sesión.
const cachePacientes = new Map<string, Paciente[]>();
const CACHE_MAX = 20;

// Llave según los criterios que realmente van al servidor: activos por servicio;
// históricos por tab + expediente exacto, o tab + rango de egreso.
const claveConsulta = (
  filtro: FiltroEstado, servicio: string, exp: string, desde: string, hasta: string
) =>
  filtro === "activo"
    ? `activo|${servicio}`
    : exp
      ? `${filtro}|exp:${exp}`
      : `${filtro}|${desde}|${hasta}`;

// Snapshot de la última vista consultada (tab, filtros, resultados y página).
// Al volver del detalle la página se desmonta y remonta; este snapshot restaura
// exactamente lo que había en pantalla sin releer Firestore — también para los
// tabs históricos, que a propósito no entran en cachePacientes.
let ultimaConsulta: {
  filtro: FiltroEstado;
  servicioFiltro: string;
  busqueda: string;
  fechaDesde: string;
  fechaHasta: string;
  page: number;
  pacientes: Paciente[];
} | null = null;

export default function PacientesPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const { servicios: catalogoServicios } = useServicios();
  // Mount: primero restaura la última vista consultada (volver del detalle); si no
  // hay, cae a la caché del censo de activos; si tampoco, vacío hasta Consultar.
  const [pacientes, setPacientes] = useState<Paciente[]>(
    () => ultimaConsulta?.pacientes ?? cachePacientes.get("activo|") ?? []
  );
  const [loading, setLoading] = useState(false);
  const [consultado, setConsultado] = useState(() => !!ultimaConsulta || cachePacientes.has("activo|"));
  const [filtro, setFiltro] = useState<FiltroEstado>(() => ultimaConsulta?.filtro ?? "activo");
  const [servicioFiltro, setServicioFiltro] = useState<string>(() => ultimaConsulta?.servicioFiltro ?? "");
  const [busqueda, setBusqueda] = useState(() => ultimaConsulta?.busqueda ?? "");
  const [fechaDesde, setFechaDesde] = useState(() => ultimaConsulta?.fechaDesde ?? "");
  const [fechaHasta, setFechaHasta] = useState(() => ultimaConsulta?.fechaHasta ?? "");
  const [page, setPage] = useState(() => ultimaConsulta?.page ?? 1);

  // Mantener el snapshot al día con lo que está en pantalla. Solo mientras hay
  // una vista consultada; al cambiar de tab (que vacía la vista) no se pisa, así
  // el snapshot conserva la última consulta real.
  useEffect(() => {
    if (consultado) {
      ultimaConsulta = { filtro, servicioFiltro, busqueda, fechaDesde, fechaHasta, page, pacientes };
    }
  }, [consultado, filtro, servicioFiltro, busqueda, fechaDesde, fechaHasta, page, pacientes]);

  // Para estados de egreso, el rango filtra por fecha de egreso; si no, por ingreso.
  const usaFechaEgreso = filtro !== "activo" && filtro !== "todos";
  const labelFecha = usaFechaEgreso ? "Egreso" : "Ingreso";
  // Tope de lectura aplicado en la consulta (para avisar de resultados truncados).
  const topeHistorico = filtro === "todos" ? LIMIT_TODOS : LIMIT_HISTORICO;

  // Criterio obligatorio para los tabs históricos (todo menos "Activos"): un
  // expediente exacto, o un rango de fecha (desde Y hasta). Activos no lo exige.
  const exp = busqueda.trim();
  const tieneRango = !!(fechaDesde && fechaHasta);
  const puedeConsultar = filtro === "activo" || !!exp || tieneRango;

  // Llave de caché de la consulta actual según sus criterios efectivos.
  const cacheKey = claveConsulta(filtro, servicioFiltro, exp, fechaDesde, fechaHasta);

  // Trigger de "vaciar la vista": activos depende de estado+servicio (el servicio va al
  // servidor); históricos solo del estado (el servicio se filtra en cliente, no re-consulta).
  // No depende de la búsqueda ni del rango, para no borrar la vista mientras se escribe.
  const resetKey = filtro === "activo" ? cacheKey : filtro;
  const [resetKeyPrev, setResetKeyPrev] = useState(resetKey);
  if (resetKeyPrev !== resetKey) {
    setResetKeyPrev(resetKey);
    // Si la combinación del tab entrante ya se consultó en la sesión, se
    // restaura de caché (0 lecturas); si no, vacío hasta pulsar Consultar.
    const cached = cachePacientes.get(cacheKey);
    setPacientes(cached ?? []);
    setConsultado(!!cached);
  }

  // ── Lectura puntual bajo demanda (botón Consultar / Actualizar) ──
  // Activos: censo (opcional por servicio, en el servidor). Históricos: exige
  // expediente exacto o rango de egreso, y trae SOLO eso (no un tope de "recientes").
  const consultar = async () => {
    if (!profile || !puedeConsultar) return;
    setLoading(true);
    try {
      const constraints: QueryConstraint[] = [];
      const grupo = filtro === "alta_vivo_todos" ? ESTADOS_ALTA_VIVO : null;

      if (filtro === "activo") {
        constraints.push(where("estado", "==", "activo"));
        if (servicioFiltro) {
          // Servicio en el servidor (lee solo ese servicio); se ordena en cliente.
          constraints.push(where("servicioActual", "==", servicioFiltro));
        } else {
          constraints.push(orderBy("fechaIngreso", "desc"));
        }
      } else if (exp) {
        // Solo ese expediente (consulta exacta): trae únicamente sus registros,
        // sin importar la fecha. El servicio se afina en cliente si estuviera puesto.
        constraints.push(where("expediente", "==", exp));
      } else {
        // Rango de egreso OBLIGATORIO: trae solo lo del período pedido.
        // where + orderBy sobre fechaEgreso + estado → usa el índice (estado, fechaEgreso).
        const desde = new Date(fechaDesde + "T00:00:00");
        const hasta = new Date(fechaHasta + "T23:59:59");
        if (grupo) constraints.push(where("estado", "in", grupo));
        else if (filtro !== "todos") constraints.push(where("estado", "==", filtro));
        constraints.push(where("fechaEgreso", ">=", desde));
        constraints.push(where("fechaEgreso", "<=", hasta));
        constraints.push(orderBy("fechaEgreso", "desc"));
        constraints.push(limit(filtro === "todos" ? LIMIT_TODOS : LIMIT_HISTORICO));
      }

      const snap = await getDocs(query(collection(db, "pacientes"), ...constraints));
      const lista = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            fechaIngreso: toDate(data.fechaIngreso) ?? new Date(),
            fechaEgreso: toDate(data.fechaEgreso),
            fechaNacimiento: toDate(data.fechaNacimiento),
            creadoEn: toDate(data.creadoEn) ?? new Date(),
          } as Paciente;
        })
        // Orden garantizado en cliente (la consulta con servicio no trae orderBy).
        .sort((a, b) =>
          usaFechaEgreso
            ? (b.fechaEgreso?.getTime() ?? 0) - (a.fechaEgreso?.getTime() ?? 0)
            : b.fechaIngreso.getTime() - a.fechaIngreso.getTime()
        );

      // Guardar/refrescar la entrada de esta combinación; si la caché está
      // llena, se descarta la más vieja (Map conserva orden de inserción).
      if (!cachePacientes.has(cacheKey) && cachePacientes.size >= CACHE_MAX) {
        const masVieja = cachePacientes.keys().next().value;
        if (masVieja !== undefined) cachePacientes.delete(masVieja);
      }
      cachePacientes.set(cacheKey, lista);
      setPacientes(lista);
      setConsultado(true);
    } finally {
      setLoading(false);
    }
  };

  // ── Opciones de servicio: catálogo + los presentes en lo ya cargado ──
  const serviciosUnicos = useMemo(() => {
    const set = new Set<string>(catalogoServicios);
    pacientes.forEach((p) => p.servicioActual && set.add(p.servicioActual));
    return Array.from(set).sort();
  }, [catalogoServicios, pacientes]);

  const filtrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    // Rango en hora local para no correr el día (UTC-6).
    const desde = fechaDesde ? new Date(fechaDesde + "T00:00:00") : null;
    const hasta = fechaHasta ? new Date(fechaHasta + "T23:59:59") : null;
    return pacientes.filter((p) => {
      if (servicioFiltro && p.servicioActual !== servicioFiltro) return false;
      // El rango solo se filtra en cliente para ACTIVOS (por ingreso). En históricos
      // el rango ya lo aplicó el servidor (por egreso), y la búsqueda por expediente
      // trae ese expediente completo sin acotar por fecha.
      if (filtro === "activo" && (desde || hasta)) {
        if (desde && p.fechaIngreso < desde) return false;
        if (hasta && p.fechaIngreso > hasta) return false;
      }
      if (!term) return true;
      const hay =
        p.expediente?.toLowerCase().includes(term) ||
        p.dui?.toLowerCase().includes(term) ||
        nombreCompleto(p).toLowerCase().includes(term);
      return !!hay;
    });
  }, [pacientes, busqueda, servicioFiltro, filtro, fechaDesde, fechaHasta]);

  // Al cambiar cualquier filtro, volver a la página 1 (ajuste de estado en render).
  const filtrosKey = `${filtro}|${servicioFiltro}|${busqueda}|${fechaDesde}|${fechaHasta}`;
  const [filtrosPrevios, setFiltrosPrevios] = useState(filtrosKey);
  if (filtrosPrevios !== filtrosKey) {
    setFiltrosPrevios(filtrosKey);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginados = filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activosCount = useMemo(
    () => pacientes.filter((p) => p.estado === "activo").length,
    [pacientes]
  );

  // ── Exportar a Excel lo que esté filtrado en pantalla ──
  const exportar = async () => {
    if (filtrados.length === 0) return;
    const XLSX = await import("xlsx");
    const generoLetra = (g?: string) =>
      g === "masculino" ? "M" : g === "femenino" ? "F" : g === "otro" ? "O" : "";
    const dx = (d?: { codigo?: string; descripcion?: string }) =>
      d ? [d.codigo, d.descripcion].filter(Boolean).join(" - ") : "";

    const filas = filtrados.map((p) => ({
      EXPEDIENTE: p.expediente ?? "",
      DUI: p.dui ?? "",
      APELLIDOS: p.apellidos ?? "",
      NOMBRES: p.nombres ?? "",
      EDAD: calcularEdad(p.fechaNacimiento) ?? "",
      GENERO: generoLetra(p.genero),
      "ESTADO FAMILIAR": p.estadoFamiliar ?? "",
      OCUPACION: p.ocupacion ?? "",
      "AFILIACION ISSS": p.numeroAfiliacion ?? "",
      TELEFONO: p.telefono ?? "",
      DIRECCION: p.direccion ?? "",
      MUNICIPIO: p.municipio ?? "",
      DEPARTAMENTO: p.departamento ?? "",
      RESPONSABLE: p.responsable?.nombre ?? "",
      PARENTESCO: p.responsable?.parentesco ?? "",
      "TEL. RESPONSABLE": p.responsable?.telefono ?? "",
      SERVICIO: p.servicioActual ?? "",
      CAMA: p.camaActual ?? "",
      INGRESO: p.fechaIngreso ? formatFecha(p.fechaIngreso) : "",
      EGRESO: p.fechaEgreso ? formatFecha(p.fechaEgreso) : "",
      "ESTANCIA (DIAS)": diasEstancia(p.fechaIngreso, p.fechaEgreso),
      ESTADO: ESTADO_LABEL[p.estado] ?? p.estado,
      "DX INGRESO": dx(p.diagnosticoIngreso),
      "ULTIMO DX": dx(p.ultimoDiagnostico),
    }));

    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pacientes");
    const stamp = new Date().toISOString().slice(0, 10);
    const sufijo = servicioFiltro ? `-${servicioFiltro.replace(/\s+/g, "_")}` : "";
    XLSX.writeFile(wb, `pacientes-${filtro}${sufijo}-${stamp}.xlsx`);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-50 dark:bg-emerald-950 rounded-xl flex items-center justify-center border border-emerald-200 dark:border-emerald-900">
            <BedDouble size={17} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
            Gestión de pacientes
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {filtro === "activo" && consultado && (
            <div className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 px-3 py-1.5 rounded-xl">
              <Clock size={14} />
              {activosCount} hospitalizados
            </div>
          )}
          <button
            onClick={exportar}
            disabled={filtrados.length === 0}
            title={filtrados.length === 0 ? "No hay pacientes para exportar" : `Exportar ${filtrados.length} registros a Excel`}
            className="flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileDown size={15} />
            Exportar Excel
          </button>
          <Link prefetch={false}
            href="/dashboard/pacientes/importar"
            className="flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            <Upload size={15} />
            Importar reporte
          </Link>
          <Link prefetch={false}
            href="/dashboard/pacientes/nuevo"
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <Plus size={15} />
            Nuevo ingreso
          </Link>
        </div>
      </div>

      {/* Filtros estado */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
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
          </button>
        ))}
      </div>

      {/* Buscador + filtro servicio + rango de fecha */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={filtro === "activo" ? "Buscar por expediente, DUI o nombre..." : "Expediente exacto (trae solo ese)…"}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
        </div>
        <div className="relative sm:w-56">
          <Filter
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <select
            value={servicioFiltro}
            onChange={(e) => setServicioFiltro(e.target.value)}
            className="w-full appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-8 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-sm"
          >
            <option value="">Todos los servicios</option>
            {serviciosUnicos.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <ChevronDown
            size={13}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">{labelFecha} desde</span>
          <DateField
            value={fechaDesde}
            onChange={setFechaDesde}
            clearable
            placeholder={`${labelFecha} desde`}
            ariaLabel={`${labelFecha} desde`}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Hasta</span>
          <DateField
            value={fechaHasta}
            onChange={setFechaHasta}
            clearable
            placeholder="Hasta"
            ariaLabel="Fecha hasta"
          />
        </div>
        {(busqueda || servicioFiltro || fechaDesde || fechaHasta) && (
          <button
            onClick={() => { setBusqueda(""); setServicioFiltro(""); setFechaDesde(""); setFechaHasta(""); }}
            className="flex items-center gap-1 px-3 py-2 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors shadow-sm"
          >
            <X size={12} /> Limpiar
          </button>
        )}
        <button
          onClick={consultar}
          disabled={loading || !puedeConsultar}
          title={puedeConsultar ? undefined : "Ingresá un expediente exacto o un rango de fechas (desde y hasta)"}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm shrink-0"
        >
          {loading ? (
            <RefreshCw size={15} className="animate-spin" />
          ) : (
            <Search size={15} />
          )}
          {consultado ? "Actualizar" : "Consultar"}
          {servicioFiltro && <span className="opacity-80">· {servicioFiltro}</span>}
        </button>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !consultado ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <Search size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            {filtro === "activo"
              ? <>Selecciona{servicioFiltro ? ` el servicio (${servicioFiltro})` : ", si quieres, un servicio"} y pulsa Consultar.</>
              : "Para los históricos, ingresá un expediente exacto (trae solo ese) o un rango de fechas de egreso — desde y hasta — y pulsá Consultar."}
          </p>
          <button
            onClick={consultar}
            disabled={!puedeConsultar}
            className="inline-flex items-center gap-1.5 mt-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Search size={15} /> Consultar
          </button>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <BedDouble size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">
            {pacientes.length === 0
              ? "Aún no hay pacientes registrados."
              : "Sin coincidencias para los filtros actuales."}
          </p>
          {pacientes.length === 0 && (
            <Link prefetch={false}
              href="/dashboard/pacientes/nuevo"
              className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500"
            >
              <Plus size={14} /> Crear el primer ingreso
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <Th>Expediente</Th>
                  <Th>Paciente</Th>
                  <Th>Servicio / Cama</Th>
                  <Th>Ingreso</Th>
                  <Th>Estancia</Th>
                  <Th>Estado</Th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginados.map((p) => {
                  const edad = calcularEdad(p.fechaNacimiento);
                  const dias = diasEstancia(p.fechaIngreso, p.fechaEgreso);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/dashboard/pacientes/${p.id}`)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold font-mono text-slate-900 dark:text-slate-100">
                          {p.expediente}
                        </p>
                        {p.dui && (
                          <p className="text-[11px] text-slate-500 mt-0.5 font-mono">{p.dui}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {nombreCompleto(p)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {edad !== null ? `${edad} años` : "—"}
                          {p.genero && <> · {p.genero === "masculino" ? "M" : p.genero === "femenino" ? "F" : "O"}</>}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-700 dark:text-slate-300 text-sm">{p.servicioActual}</p>
                        {p.camaActual && (
                          <p className="text-xs text-slate-500 mt-0.5">Cama {p.camaActual}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                        {formatFecha(p.fechaIngreso)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                        {dias} {dias === 1 ? "día" : "días"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${ESTADO_BADGE[p.estado]}`}
                        >
                          {ESTADO_LABEL[p.estado]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          Ver detalle →
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-between gap-4">
            {/* Contador */}
            <span className="text-xs text-slate-500 shrink-0">
              {filtrados.length === 0 ? "0 resultados" : (
                <>
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtrados.length)}
                  {" "}de{" "}
                  <span className="font-medium text-slate-700 dark:text-slate-300">{filtrados.length}</span>
                  {filtrados.length < pacientes.length && <> (filtrados de {pacientes.length})</>}
                </>
              )}
            </span>

            {/* Controles de página */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>

                {/* Números de página */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                  .reduce<(number | "…")[]>((acc, n, idx, arr) => {
                    if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push("…");
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === "…" ? (
                      <span key={`ellipsis-${idx}`} className="w-7 text-center text-xs text-slate-400">…</span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => setPage(item as number)}
                        className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                          page === item
                            ? "bg-blue-600 text-white"
                            : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}

                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            {/* Aviso de techo histórico */}
            {filtro !== "activo" && !exp && pacientes.length >= topeHistorico && (
              <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">
                Tope de {topeHistorico} alcanzado — achica el rango de fechas para ver todo
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
      {children}
    </th>
  );
}
