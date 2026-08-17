"use client";

import { useState } from "react";
import {
  collection, query, where, orderBy, limit, getDocs, getCountFromServer, Timestamp,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { DateField } from "@/components/ui/DateField";
import {
  calcularEdadEn, toDate, formatFecha, diasEstancia,
  ESTADO_LABEL, ESTADO_BADGE, GENERO_LABEL,
} from "@/lib/pacientes/helpers";
import {
  EDAD_MAX_ADOLESCENTE, esAdolescente, corteNacimientoAdolescentes, grupoEdadAdolescente,
  GRUPOS_EDAD_ADOLESCENTE, GRUPO_EDAD_LABEL, type GrupoEdadAdolescente,
} from "@/lib/conapinaFgr";
import {
  Users, Search, Download, AlertTriangle, Info, Loader2, RefreshCw,
  ChevronLeft, ChevronRight, Activity, HeartPulse, HeartCrack, CalendarClock,
} from "lucide-react";
import type { Paciente, EstadoPaciente, Genero } from "@/types";

// Techo de lectura por consulta. El rango lo elige el usuario, así que hay que
// acotarlo aunque la consulta ya venga filtrada por edad en el servidor.
const MAX_INGRESOS = 3000;
const PAGE_SIZE = 20;

// Piso para preguntarle a Firestore "¿tiene fecha de nacimiento?": un documento
// sin el campo no entra en el índice, así que la única forma de saber cuántos
// quedan fuera del informe es contar el periodo completo y restar.
const PISO_NACIMIENTO = new Date(1800, 0, 1);

type FiltroEstado = "todos" | "activo" | "egresado" | "fallecido";
type FiltroGenero = "todos" | Genero;

interface Fila {
  paciente: Paciente;
  edadIngreso: number | null;   // null = el expediente no trae fecha de nacimiento
  grupo: GrupoEdadAdolescente | null;
}

// ── Caché de la última búsqueda ─────────────────────────────────────────────
// Sobrevive a la navegación SPA (no a un reload): volver a la pantalla con el
// mismo rango no vuelve a leer nada. "Actualizar" fuerza la consulta.
interface CacheBusqueda {
  desde: string;
  hasta: string;
  filas: Fila[];
  totalPeriodo: number | null;
  sinFechaNacimiento: number | null;
  sinFechaCargados: boolean;    // ya se hizo el barrido de los que no tienen fecha
  tope: boolean;
  consultadoEn: Date;
}

// La mutación vive a nivel de módulo a propósito: la regla de lint
// `react-hooks/globals` prohíbe reasignar una variable de módulo desde dentro
// del componente.
let cacheBusqueda: CacheBusqueda | null = null;
const getCache = () => cacheBusqueda;
const setCache = (c: CacheBusqueda | null) => { cacheBusqueda = c; };

const inicioDia = (iso: string) => new Date(iso + "T00:00:00");
const finDia = (iso: string) => new Date(iso + "T23:59:59.999");

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

const thCls = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap";

// El servidor devuelve en orden ascendente (ver la consulta); la tabla se lee
// del más reciente al más viejo, como el resto del portal.
const porIngresoDesc = (a: Fila, b: Fila) =>
  (toDate(b.paciente.fechaIngreso)?.getTime() ?? 0) - (toDate(a.paciente.fechaIngreso)?.getTime() ?? 0);

const esFallecido = (e: EstadoPaciente) => e === "alta_fallecido";
const esActivo = (e: EstadoPaciente) => e === "activo";

const dx = (d?: { codigo?: string; descripcion?: string } | null) =>
  d?.codigo ? `${d.codigo} · ${d.descripcion ?? ""}`.trim() : "";

// Firestore devuelve el enlace de creación del índice dentro del mensaje de
// error; se extrae para poder ofrecerlo como enlace en vez de texto crudo.
const urlDeIndice = (msg: string) => msg.match(/https:\/\/console\.firebase\.google\.com\/\S+/)?.[0] ?? null;

export default function IngresosAdolescentesPage() {
  const [fechaDesde, setFechaDesde] = useState(primerDiaDelMes());
  const [fechaHasta, setFechaHasta] = useState(hoyISO());

  const [filas, setFilas] = useState<Fila[] | null>(null);   // null = aún no se busca
  const [alcance, setAlcance] = useState<Omit<CacheBusqueda, "filas"> | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [cargandoSinFecha, setCargandoSinFecha] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [page, setPage] = useState(1);

  const [grupo, setGrupo] = useState<GrupoEdadAdolescente | "todos">("todos");
  const [estado, setEstado] = useState<FiltroEstado>("todos");
  const [genero, setGenero] = useState<FiltroGenero>("todos");

  const aFila = (p: Paciente): Fila => {
    const edadIngreso = calcularEdadEn(toDate(p.fechaNacimiento), toDate(p.fechaIngreso));
    return { paciente: p, edadIngreso, grupo: grupoEdadAdolescente(edadIngreso) };
  };

  const buscar = async (forzar = false) => {
    if (!fechaDesde || !fechaHasta) {
      setError("Elige el rango de fechas de ingreso.");
      return;
    }
    if (fechaHasta < fechaDesde) {
      setError("La fecha 'Hasta' no puede ser anterior a 'Desde'.");
      return;
    }

    // Mismo rango ya consultado: se sirve de la caché sin leer nada.
    const cache = getCache();
    if (!forzar && cache && cache.desde === fechaDesde && cache.hasta === fechaHasta) {
      setFilas(cache.filas);
      setAlcance(cache);
      setError(null);
      setPage(1);
      return;
    }

    setBuscando(true);
    setError(null);
    try {
      const desde = Timestamp.fromDate(inicioDia(fechaDesde));
      const hasta = Timestamp.fromDate(finDia(fechaHasta));
      // Quien ingresa con 18 años o menos nació forzosamente después de este
      // corte: filtrar por él en el SERVIDOR evita leer todo el censo del
      // periodo. Arrastra de más solo a los que cumplieron 19 dentro del rango,
      // que se descartan abajo por la edad exacta al ingreso.
      const corte = Timestamp.fromDate(corteNacimientoAdolescentes(inicioDia(fechaDesde)));

      const enRango = () => [
        where("fechaIngreso", ">=", desde),
        where("fechaIngreso", "<=", hasta),
      ] as const;

      const [snap, totalSnap, conFechaSnap] = await Promise.all([
        // El orden va ASCENDENTE a propósito, aunque la tabla se muestre al
        // revés: así esta consulta y las dos agregaciones de abajo comparten
        // UN solo índice compuesto (fechaIngreso ASC + fechaNacimiento ASC).
        // Pedir orden descendente exigiría un segundo índice, y cada índice
        // encarece todas las escrituras de `pacientes`, que es la colección
        // que más se escribe (cada importación del SIS la toca entera).
        getDocs(query(
          collection(db, "pacientes"),
          ...enRango(),
          where("fechaNacimiento", ">", corte),
          orderBy("fechaIngreso", "asc"),
          limit(MAX_INGRESOS),
        )),
        // Agregaciones: ~1 lectura cada una. Dan el denominador del informe y,
        // por diferencia, cuántos ingresos quedan fuera por no tener fecha de
        // nacimiento (un documento sin el campo no existe para el índice).
        getCountFromServer(query(collection(db, "pacientes"), ...enRango())),
        getCountFromServer(query(
          collection(db, "pacientes"),
          ...enRango(),
          where("fechaNacimiento", ">", Timestamp.fromDate(PISO_NACIMIENTO)),
        )),
      ]);

      const total = totalSnap.data().count;
      const conFecha = conFechaSnap.data().count;

      const adolescentes = snap.docs
        .map(d => aFila({ id: d.id, ...d.data() } as Paciente))
        .filter(f => esAdolescente(f.edadIngreso))
        .sort(porIngresoDesc);

      const nuevo: CacheBusqueda = {
        desde: fechaDesde,
        hasta: fechaHasta,
        filas: adolescentes,
        totalPeriodo: total,
        sinFechaNacimiento: Math.max(0, total - conFecha),
        sinFechaCargados: false,
        tope: snap.size >= MAX_INGRESOS,
        consultadoEn: new Date(),
      };
      setCache(nuevo);
      setFilas(nuevo.filas);
      setAlcance(nuevo);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la búsqueda.");
      setFilas([]);
      setAlcance(null);
      setCache(null);
    } finally {
      setBuscando(false);
    }
  };

  // Los ingresos sin fecha de nacimiento no pueden filtrarse por edad en el
  // servidor. Se traen SOLO si el usuario lo pide, porque exige leer el censo
  // completo del periodo: es la diferencia entre un informe rápido y uno
  // exhaustivo, y en un módulo auditado conviene poder cerrar el hueco.
  const cargarSinFecha = async () => {
    const base = getCache();
    if (!base) return;
    setCargandoSinFecha(true);
    setError(null);
    try {
      // El rango sale de la búsqueda ya hecha, no de los selectores: el usuario
      // pudo cambiarlos sin volver a buscar y se mezclarían dos periodos.
      const snap = await getDocs(query(
        collection(db, "pacientes"),
        where("fechaIngreso", ">=", Timestamp.fromDate(inicioDia(base.desde))),
        where("fechaIngreso", "<=", Timestamp.fromDate(finDia(base.hasta))),
        orderBy("fechaIngreso", "desc"),
        limit(MAX_INGRESOS),
      ));

      const sinFecha = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Paciente))
        .filter(p => !toDate(p.fechaNacimiento))
        .map(aFila);

      const actualizado: CacheBusqueda = {
        ...base,
        filas: [...base.filas, ...sinFecha].sort(porIngresoDesc),
        sinFechaNacimiento: sinFecha.length,
        sinFechaCargados: true,
        tope: base.tope || snap.size >= MAX_INGRESOS,
      };
      setCache(actualizado);
      setFilas(actualizado.filas);
      setAlcance(actualizado);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron traer los ingresos sin fecha de nacimiento.");
    } finally {
      setCargandoSinFecha(false);
    }
  };

  const todas = filas ?? [];
  const displayList = todas.filter(f => {
    if (grupo !== "todos" && f.grupo !== grupo) return false;
    if (genero !== "todos" && f.paciente.genero !== genero) return false;
    if (estado === "activo" && !esActivo(f.paciente.estado)) return false;
    if (estado === "fallecido" && !esFallecido(f.paciente.estado)) return false;
    if (estado === "egresado" && (esActivo(f.paciente.estado) || esFallecido(f.paciente.estado))) return false;
    return true;
  });

  const filtrosKey = `${grupo}|${estado}|${genero}`;
  const [filtrosPrevios, setFiltrosPrevios] = useState(filtrosKey);
  if (filtrosPrevios !== filtrosKey) {
    setFiltrosPrevios(filtrosKey);
    setPage(1);
  }

  const totalPaginas = Math.max(1, Math.ceil(displayList.length / PAGE_SIZE));
  const paginaActual = Math.min(page, totalPaginas);
  const paginados = displayList.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);

  const activos = todas.filter(f => esActivo(f.paciente.estado)).length;
  const fallecidos = todas.filter(f => esFallecido(f.paciente.estado)).length;
  const egresados = todas.length - activos - fallecidos;

  const exportar = async () => {
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const rows = displayList.map(({ paciente: p, edadIngreso, grupo: g }) => {
        const ingreso = toDate(p.fechaIngreso);
        const egreso = toDate(p.fechaEgreso);
        return {
          EXPEDIENTE: p.expediente ?? "",
          PACIENTE: `${p.apellidos ?? ""}, ${p.nombres ?? ""}`.trim(),
          SEXO: GENERO_LABEL[p.genero] ?? "",
          "FECHA DE NACIMIENTO": toDate(p.fechaNacimiento) ? formatFecha(toDate(p.fechaNacimiento)) : "",
          "EDAD AL INGRESO": edadIngreso ?? "",
          "GRUPO DE EDAD": g ? GRUPO_EDAD_LABEL[g] : "",
          "FECHA DE INGRESO": ingreso ? formatFecha(ingreso) : "",
          "SERVICIO DE INGRESO": p.servicioIngreso ?? "",
          "SERVICIO ACTUAL": p.servicioActual ?? "",
          CAMA: p.camaActual ?? "",
          MUNICIPIO: p.municipio ?? "",
          DEPARTAMENTO: p.departamento ?? "",
          "DIAGNOSTICO DE INGRESO": dx(p.diagnosticoIngreso),
          "DIAGNOSTICO DE EGRESO": dx(p.diagnosticoEgreso) || dx(p.ultimoDiagnostico),
          "CAUSA EXTERNA": dx(p.causaExterna),
          ESTADO: ESTADO_LABEL[p.estado] ?? p.estado ?? "",
          "FECHA DE EGRESO": egreso ? formatFecha(egreso) : "",
          "DIAS DE ESTANCIA": p.diasEstancia ?? (ingreso ? diasEstancia(ingreso, egreso) : ""),
        };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Ingresos adolescentes");
      XLSX.writeFile(wb, `ingresos_adolescentes_${fechaDesde}_a_${fechaHasta}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar.");
    } finally {
      setExportando(false);
    }
  };

  const linkIndice = error ? urlDeIndice(error) : null;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950">
          <Users size={17} className="text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Ingresos de adolescentes</h1>
          <p className="mt-0.5 text-xs text-slate-500">Ingresos de {EDAD_MAX_ADOLESCENTE} años o menos en el periodo, cualquiera sea su estado</p>
        </div>
      </div>

      {/* Criterio de búsqueda */}
      <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 md:p-5">
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Periodo de ingreso</p>
          <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">
            Buscar ingresos de {EDAD_MAX_ADOLESCENTE} años o menos
          </h2>
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
          <button onClick={() => buscar()} disabled={buscando}
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

        {alcance && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-slate-400">
            <span>
              Consultado del{" "}
              <strong className="font-semibold text-slate-500 dark:text-slate-400">{formatFecha(inicioDia(alcance.desde))}</strong>
              {" al "}
              <strong className="font-semibold text-slate-500 dark:text-slate-400">{formatFecha(inicioDia(alcance.hasta))}</strong>
              {" · "}
              {alcance.consultadoEn.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <button onClick={() => buscar(true)} disabled={buscando}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-cyan-700 transition-colors hover:bg-cyan-50 disabled:opacity-50 dark:text-cyan-300 dark:hover:bg-cyan-950/40">
              <RefreshCw size={11} className={buscando ? "animate-spin" : ""} /> Actualizar
            </button>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span className="text-xs">
              {linkIndice ? (
                <>
                  Esta consulta necesita un índice de Firestore que aún no existe.{" "}
                  <a href={linkIndice} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                    Crearlo en la consola de Firebase
                  </a>{" "}
                  y volver a buscar (tarda unos minutos en construirse).
                </>
              ) : error}
            </span>
          </div>
        )}

        {filas !== null && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Tile n={todas.length} label={`${EDAD_MAX_ADOLESCENTE} años o menos`} icon={Users} tone="violet" />
              <Tile n={activos} label="Activos" icon={Activity} tone="emerald" />
              <Tile n={egresados} label="Egresados" icon={HeartPulse} tone="cyan" />
              <Tile n={fallecidos} label="Fallecidos" icon={HeartCrack} tone="rose" />
            </div>

            {/* Los que el índice no puede ver: sin fecha de nacimiento no hay
                edad que filtrar, y en un informe auditado ese hueco debe
                poder cerrarse a voluntad. */}
            {!!alcance?.sinFechaNacimiento && !alcance.sinFechaCargados && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle size={14} className="shrink-0" />
                <span className="text-xs">
                  {alcance.sinFechaNacimiento} ingreso{alcance.sinFechaNacimiento === 1 ? "" : "s"} del periodo no tiene
                  {alcance.sinFechaNacimiento === 1 ? "" : "n"} fecha de nacimiento, así que no se les puede calcular la edad.
                </span>
                <button onClick={cargarSinFecha} disabled={cargandoSinFecha}
                  className="ml-auto flex items-center gap-1 rounded-md bg-amber-700 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50">
                  {cargandoSinFecha ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
                  {cargandoSinFecha ? "Revisando…" : "Traerlos a la lista"}
                </button>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">Edad:</span>
              {(["todos", ...GRUPOS_EDAD_ADOLESCENTE] as const).map(g => (
                <button key={g} onClick={() => setGrupo(g)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    grupo === g
                      ? "bg-violet-600 text-white"
                      : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                  }`}>
                  {g === "todos" ? "Todas" : GRUPO_EDAD_LABEL[g]}
                </button>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">Estado:</span>
              {([
                { v: "todos", l: "Todos" },
                { v: "activo", l: "Activos", n: activos },
                { v: "egresado", l: "Egresados", n: egresados },
                { v: "fallecido", l: "Fallecidos", n: fallecidos },
              ] as { v: FiltroEstado; l: string; n?: number }[]).map(o => (
                <button key={o.v} onClick={() => setEstado(o.v)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    estado === o.v
                      ? "bg-slate-700 text-white dark:bg-slate-600"
                      : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                  }`}>
                  {o.l}
                  {typeof o.n === "number" && o.n > 0 && (
                    <span className={`rounded-full px-1.5 py-px text-[10px] font-bold ${estado === o.v ? "bg-white/25" : "bg-slate-200 dark:bg-slate-700"}`}>{o.n}</span>
                  )}
                </button>
              ))}

              <span className="ml-2 text-xs text-slate-400">Sexo:</span>
              {([
                { v: "todos", l: "Todos" },
                { v: "masculino", l: "Masculino" },
                { v: "femenino", l: "Femenino" },
              ] as { v: FiltroGenero; l: string }[]).map(o => (
                <button key={o.v} onClick={() => setGenero(o.v)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    genero === o.v
                      ? "bg-slate-700 text-white dark:bg-slate-600"
                      : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                  }`}>
                  {o.l}
                </button>
              ))}
            </div>

            <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-slate-500">
              <Info size={13} className="mt-0.5 shrink-0 text-cyan-600 dark:text-cyan-300" />
              {alcance?.totalPeriodo
                ? <>De {alcance.totalPeriodo} ingresos del periodo, {todas.length} fueron de pacientes de {EDAD_MAX_ADOLESCENTE} años o menos.{" "}</>
                : <>{todas.length} ingresos de pacientes de {EDAD_MAX_ADOLESCENTE} años o menos en el periodo.{" "}</>}
              La consulta filtra por fecha de nacimiento en el servidor, así que solo se leen los expedientes que pueden
              entrar en el informe.
              {alcance?.tope && <strong className="ml-1 text-amber-700 dark:text-amber-400">Se alcanzó el tope de {MAX_INGRESOS} registros: acorta el rango para no perder ingresos.</strong>}
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
                  <th className={thCls}>Edad al ingreso</th>
                  <th className={thCls}>Sexo</th>
                  <th className={thCls}>Ingreso</th>
                  <th className={thCls}>Servicio</th>
                  <th className={thCls}>Diagnóstico</th>
                  <th className={thCls}>Estado</th>
                  <th className={thCls}>Egreso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginados.map(({ paciente: p, edadIngreso, grupo: g }) => {
                  const ingreso = toDate(p.fechaIngreso);
                  const egreso = toDate(p.fechaEgreso);
                  const diagnostico = p.diagnosticoEgreso ?? p.ultimoDiagnostico ?? p.diagnosticoIngreso;
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">{p.expediente}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">{p.apellidos}, {p.nombres}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {edadIngreso !== null ? (
                          <span className="flex items-center gap-1.5">
                            <span className="text-slate-700 dark:text-slate-300">{edadIngreso}</span>
                            {g && (
                              <span className="rounded border border-violet-200 bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-800 dark:bg-violet-900/50 dark:text-violet-300">
                                {GRUPO_EDAD_LABEL[g]}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Sin fecha de nac.
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">{GENERO_LABEL[p.genero] ?? "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">{formatFecha(ingreso)}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                        {p.servicioActual || p.servicioIngreso || "—"}
                        {p.camaActual && <span className="text-slate-400"> · {p.camaActual}</span>}
                      </td>
                      <td className="max-w-[260px] px-3 py-2.5">
                        {diagnostico?.codigo ? (
                          <span className="flex items-baseline gap-1.5">
                            <span className="shrink-0 font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300">{diagnostico.codigo}</span>
                            <span className="line-clamp-2 text-xs text-slate-700 dark:text-slate-300">{diagnostico.descripcion}</span>
                          </span>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_BADGE[p.estado] ?? ""}`}>
                          {ESTADO_LABEL[p.estado] ?? p.estado}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                        {egreso ? (
                          <span className="flex items-center gap-1">
                            {formatFecha(egreso)}
                            <span className="text-slate-400">· {p.diasEstancia ?? (ingreso ? diasEstancia(ingreso, egreso) : "—")} d</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-slate-400">
                            <CalendarClock size={11} /> hospitalizado
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
              No hay ingresos de {EDAD_MAX_ADOLESCENTE} años o menos para estos criterios.
            </p>
          )}

          {totalPaginas > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/50">
              <span className="text-xs text-slate-500">{displayList.length} registros · página {paginaActual} de {totalPaginas}</span>
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
        <p className="py-12 text-center text-sm text-slate-400">Elige el periodo de ingreso y pulsa Buscar.</p>
      )}
    </div>
  );
}

const TONOS = {
  violet: { borde: "border-violet-100 dark:border-violet-900/60", fondo: "bg-violet-50/70 dark:bg-violet-950/25", icono: "bg-violet-600" },
  cyan: { borde: "border-cyan-100 dark:border-cyan-900/60", fondo: "bg-cyan-50/70 dark:bg-cyan-950/25", icono: "bg-cyan-600" },
  emerald: { borde: "border-emerald-100 dark:border-emerald-900/60", fondo: "bg-emerald-50/70 dark:bg-emerald-950/25", icono: "bg-emerald-500" },
  rose: { borde: "border-rose-100 dark:border-rose-900/60", fondo: "bg-rose-50/70 dark:bg-rose-950/25", icono: "bg-rose-500" },
} as const;

function Tile({ n, label, icon: Icono, tone }: {
  n: number; label: string; icon: React.ElementType; tone: keyof typeof TONOS;
}) {
  const t = TONOS[tone];
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${t.borde} ${t.fondo}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${t.icono}`}><Icono size={16} /></span>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{n}</p>
        <p className="mt-1 truncate text-[11px] font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}
