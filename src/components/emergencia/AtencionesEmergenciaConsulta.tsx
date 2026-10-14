"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection, query, orderBy, limit, where, startAfter, getDocs, getCountFromServer,
  documentId, deleteDoc, doc,
  type QueryConstraint, type QueryDocumentSnapshot, type QuerySnapshot,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  Ambulance, HeartPulse, Search, ChevronLeft, ChevronRight, Upload, X, ArrowUpRight,
  Stethoscope, Clock, MapPin, UserCog, RefreshCw, Download, Trash2, AlertTriangle,
  Hash, Database, CheckCircle2,
} from "lucide-react";
import { DateField } from "@/components/ui/DateField";
import type { AtencionEmergencia } from "@/types";
import { toDate, formatFechaHora } from "@/lib/pacientes/helpers";
import {
  INGRESO_BADGE, INGRESO_LABEL, triageBadge,
  condicionEgreso, condicionAtencion, CONDICIONES_EGRESO, CONDICION_BADGE, CONDICION_LABEL,
} from "@/lib/emergencia/helpers";
import { describirError, type ErrorConsulta } from "@/lib/firestoreErrores";

type Vista = "atendidos" | "egresos";
/** Tipo que se cuenta y se extrae en el servidor (Firestore filtra por él). */
type Tipo = "todos" | "vivo" | "fallecido" | "no" | "si";

const LOTE = 500;      // docs por lectura al extraer el detalle (sin tope total)
const PAGE_SIZE = 50;

// Tipos de cada vista; el punto usa el mismo color semántico que la insignia de la tabla.
const TIPOS: Record<Vista, { value: Tipo; label: string; punto: string }[]> = {
  egresos: [
    { value: "vivo",      label: "Vivos",      punto: "bg-emerald-500" },
    { value: "fallecido", label: "Fallecidos", punto: "bg-rose-500" },
    { value: "todos",     label: "Todos",      punto: "bg-blue-500" },
  ],
  atendidos: [
    { value: "no",    label: "No ingresaron", punto: "bg-blue-500" },
    { value: "si",    label: "Ingresaron",    punto: "bg-amber-500" },
    { value: "todos", label: "Todos",         punto: "bg-slate-400" },
  ],
};

// Sub-filtro de condición sobre el detalle ya cargado de "No ingresaron" (client-side).
type CondRapida = "todos" | "vivo" | "fallecido";

/** Filtro de Firestore de cada tipo. Egresos usa la condición normalizada. */
function filtroTipo(vista: Vista, tipo: Tipo): QueryConstraint[] {
  if (vista === "egresos") {
    return [tipo === "todos"
      ? where("condicionEgreso", "in", CONDICIONES_EGRESO)
      : where("condicionEgreso", "==", tipo)];
  }
  return tipo === "todos" ? [] : [where("ingresoHospitalizacion", "==", tipo)];
}

/** Espejo de filtroTipo en el cliente (derivar un tipo de "Todos", ajustar al eliminar). */
function perteneceATipo(vista: Vista, tipo: Tipo, a: AtencionEmergencia): boolean {
  if (vista === "egresos") {
    const c = a.condicionEgreso ?? condicionAtencion(a.ingresoHospitalizacion, a.tipoEgreso);
    return tipo === "todos" ? c !== "ingreso" : c === tipo;
  }
  return tipo === "todos" || a.ingresoHospitalizacion === tipo;
}

function aAtencion(d: QueryDocumentSnapshot): AtencionEmergencia {
  const data = d.data();
  return {
    id: d.id,
    ...data,
    fechaHoraIngreso: toDate(data.fechaHoraIngreso) ?? new Date(),
    fechaHoraAltaIngreso: toDate(data.fechaHoraAltaIngreso),
    fechaHoraEntradaTriage: toDate(data.fechaHoraEntradaTriage),
    importadoEn: toDate(data.importadoEn) ?? new Date(),
  } as AtencionEmergencia;
}

// Caché por sesión SPA, llaveada por vista + rango de fechas: los conteos y el
// detalle de cada tipo ya extraído. Volver a la pantalla no relee nada.
interface CacheRango {
  conteos?: Partial<Record<Tipo, number>>;
  detalle: Partial<Record<Tipo, AtencionEmergencia[]>>;
}
const cacheEmergencia = new Map<string, CacheRango>();
const rangoVacio = (): CacheRango => ({ detalle: {} });

// Cruce con el padrón por expediente. Se resuelve solo para la página visible
// (no para todo el detalle) y se recuerda durante la sesión.
interface Trazabilidad { pacienteId?: string; enPadron: boolean }
const cachePadron = new Map<string, Trazabilidad>();

/**
 * `personas` (docId = expediente) define "registrado en padrón"; `pacientes` da el
 * id del ingreso para enlazar a la ficha clínica. Best-effort: sin permiso o sin
 * red simplemente no se muestran enlaces.
 */
async function resolverPadron(exps: string[]): Promise<Map<string, Trazabilidad>> {
  const out = new Map<string, Trazabilidad>(exps.map((e) => [e, { enPadron: false }]));
  for (let i = 0; i < exps.length; i += 30) {
    const chunk = exps.slice(i, i + 30);
    const [pac, per] = await Promise.allSettled([
      getDocs(query(collection(db, "pacientes"), where("expediente", "in", chunk))),
      getDocs(query(collection(db, "personas"), where(documentId(), "in", chunk))),
    ]);
    if (pac.status === "fulfilled") {
      pac.value.forEach((d) => {
        const exp = d.data().expediente as string;
        const t = out.get(exp);
        if (t && !t.pacienteId) out.set(exp, { pacienteId: d.id, enPadron: true });
      });
    }
    if (per.status === "fulfilled") {
      per.value.forEach((d) => {
        const t = out.get(d.id);
        if (t) out.set(d.id, { ...t, enPadron: true });
      });
    }
  }
  return out;
}

interface Props {
  /** Muestra el botón "Importar reporte" (solo ESDOMED/admin). */
  permiteImportar?: boolean;
  /** Construye el enlace a la ficha del paciente activo (trazabilidad). Si no se
   *  pasa, solo se muestra la insignia sin enlace (p. ej. en el portal médico). */
  fichaHref?: (pacienteId: string) => string;
  /** "atendidos" = todos los atendidos (tipo por ingreso). "egresos" = solo los
   *  que NO ingresaron, por condición de egreso (vivo / fallecido). */
  vista?: Vista;
}

export function AtencionesEmergenciaConsulta({ permiteImportar, fichaHref, vista = "atendidos" }: Props) {
  const { profile } = useAuth();
  const esEgresos = vista === "egresos";
  // El rango de fechas se aplica sobre el campo que corresponde a la vista: en
  // egresos manda la fecha de egreso (alta); en atendidos, la de ingreso a emergencia.
  const campoFecha = esEgresos ? "fechaHoraAltaIngreso" : "fechaHoraIngreso";
  const etiquetaFecha = esEgresos ? "Egreso" : "Atención";
  const tipos = TIPOS[vista];

  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [tipo, setTipo] = useState<Tipo>(esEgresos ? "todos" : "no");
  const [condRapida, setCondRapida] = useState<CondRapida>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [page, setPage] = useState(1);
  const [contando, setContando] = useState(false);
  const [extrayendo, setExtrayendo] = useState<{ tipo: Tipo; leidos: number } | null>(null);
  const [error, setError] = useState<ErrorConsulta | null>(null);
  const [padron, setPadron] = useState<Map<string, Trazabilidad>>(() => new Map(cachePadron));
  // Atención seleccionada para la ficha de detalle (todos los campos del informe).
  const [seleccion, setSeleccion] = useState<AtencionEmergencia | null>(null);
  const [exportando, setExportando] = useState(false);
  const ocupado = contando || extrayendo !== null;

  // Conteos y detalle del rango en pantalla. Al cambiar el rango NO se lee
  // Firestore: se restaura lo que haya en caché para esa combinación.
  const cacheKey = `${vista}|${fechaDesde}|${fechaHasta}`;
  const [rango, setRango] = useState(() => ({ key: cacheKey, datos: cacheEmergencia.get(cacheKey) ?? rangoVacio() }));
  if (rango.key !== cacheKey) {
    setRango({ key: cacheKey, datos: cacheEmergencia.get(cacheKey) ?? rangoVacio() });
    setError(null);
  }
  const { conteos, detalle } = rango.datos;

  // Guarda en la caché del rango `key` y, si sigue en pantalla, también en el estado.
  const guardar = (key: string, cambio: (prev: CacheRango) => CacheRango) => {
    const nuevo = cambio(cacheEmergencia.get(key) ?? rangoVacio());
    cacheEmergencia.set(key, nuevo);
    setRango((prev) => (prev.key === key ? { key, datos: nuevo } : prev));
  };

  // Conteo y detalle usan la MISMA consulta (orden ascendente) para compartir un
  // solo índice compuesto; el detalle se invierte en el cliente (más reciente primero).
  const consultaTipo = (t: Tipo) => {
    const desde = new Date(fechaDesde + "T00:00:00");
    const hasta = fechaHasta ? new Date(fechaHasta + "T23:59:59") : null;
    return query(
      collection(db, "atenciones_emergencia"),
      ...filtroTipo(vista, t),
      where(campoFecha, ">=", desde),
      ...(hasta ? [where(campoFecha, "<=", hasta)] : []),
      orderBy(campoFecha),
    );
  };

  // ── Paso 1: contar por tipo. Agregación: ~1 lectura por cada 1,000 registros. ──
  const contar = async () => {
    if (!profile || !fechaDesde) return;
    const key = cacheKey;
    setContando(true);
    setError(null);
    try {
      const valores = await Promise.all(
        tipos.map((t) => getCountFromServer(consultaTipo(t.value)).then((s) => s.data().count)),
      );
      const nuevos: Partial<Record<Tipo, number>> = {};
      tipos.forEach((t, i) => { nuevos[t.value] = valores[i]; });
      // El detalle ya cargado sigue valiendo solo si su conteo no cambió.
      guardar(key, (prev) => {
        const vigente: CacheRango["detalle"] = {};
        (Object.keys(prev.detalle) as Tipo[]).forEach((t) => {
          if (prev.conteos?.[t] === nuevos[t]) vigente[t] = prev.detalle[t];
        });
        return { conteos: nuevos, detalle: vigente };
      });
    } catch (e) {
      setError(describirError(e));
    } finally {
      setContando(false);
    }
  };

  // ── Paso 2: extraer el detalle del tipo elegido. Sin tope: lotes con cursor. ──
  const extraer = async (t: Tipo) => {
    if (!profile || !fechaDesde) return;
    const key = cacheKey;
    setExtrayendo({ tipo: t, leidos: 0 });
    setError(null);
    try {
      const lista: AtencionEmergencia[] = [];
      let cursor: QueryDocumentSnapshot | null = null;
      for (;;) {
        const snap: QuerySnapshot = await getDocs(query(
          consultaTipo(t),
          ...(cursor ? [startAfter(cursor)] : []),
          limit(LOTE),
        ));
        snap.docs.forEach((d) => lista.push(aAtencion(d)));
        setExtrayendo({ tipo: t, leidos: lista.length });
        if (snap.docs.length < LOTE) break;
        cursor = snap.docs[snap.docs.length - 1];
      }
      lista.reverse();
      guardar(key, (prev) => {
        if (t !== "todos") {
          return { conteos: { ...prev.conteos, [t]: lista.length }, detalle: { ...prev.detalle, [t]: lista } };
        }
        // Con "Todos" en mano, cada tipo se deriva gratis y sus conteos quedan exactos.
        const conteosTodos: Partial<Record<Tipo, number>> = {};
        tipos.forEach((x) => {
          conteosTodos[x.value] = lista.filter((a) => perteneceATipo(vista, x.value, a)).length;
        });
        return { conteos: conteosTodos, detalle: { todos: lista } };
      });
    } catch (e) {
      setError(describirError(e));
    } finally {
      setExtrayendo(null);
    }
  };

  // Detalle del tipo en pantalla: el extraído, o derivado de "Todos" si ya se cargó.
  // null = aún no se ha extraído (solo hay conteo).
  const detalleTipo = useMemo(() => {
    const propio = detalle[tipo];
    if (propio) return propio;
    return detalle.todos ? detalle.todos.filter((a) => perteneceATipo(vista, tipo, a)) : null;
  }, [detalle, tipo, vista]);
  const atenciones = useMemo(() => detalleTipo ?? [], [detalleTipo]);

  // En egresos la fecha relevante es la de alta; en atendidos, la de ingreso a emergencia.
  const fechaDe = (a: AtencionEmergencia) =>
    esEgresos ? (a.fechaHoraAltaIngreso ?? a.fechaHoraIngreso) : a.fechaHoraIngreso;

  // Sub-filtro Vivos/Fallecidos solo aplica en atendidos, tipo "No ingresaron".
  const usaCondRapida = !esEgresos && tipo === "no";

  const filtrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    return atenciones.filter((a) => {
      if (usaCondRapida && condRapida !== "todos" && condicionEgreso(a.tipoEgreso) !== condRapida) return false;
      if (!term) return true;
      return (
        a.expediente?.toLowerCase().includes(term) ||
        a.dui?.toLowerCase().includes(term) ||
        a.pacienteNombre?.toLowerCase().includes(term)
      ) ?? false;
    });
  }, [atenciones, busqueda, usaCondRapida, condRapida]);

  // Conteo Vivos/Fallecidos del detalle cargado (para el sub-filtro rápido).
  const conteoCondicion = useMemo(() => {
    const c = { todos: 0, vivo: 0, fallecido: 0 };
    atenciones.forEach((a) => {
      c.todos++;
      const k = condicionEgreso(a.tipoEgreso);
      if (k === "vivo") c.vivo++;
      else if (k === "fallecido") c.fallecido++;
    });
    return c;
  }, [atenciones]);

  // Reset de página al cambiar rango, tipo o filtros.
  const filtrosKey = `${cacheKey}|${tipo}|${condRapida}|${busqueda}`;
  const [filtrosPrevios, setFiltrosPrevios] = useState(filtrosKey);
  if (filtrosPrevios !== filtrosKey) { setFiltrosPrevios(filtrosKey); setPage(1); }

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginados = useMemo(
    () => filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtrados, page],
  );

  // ── Paso 3: trazabilidad con el padrón solo de la página visible. ──
  const expsSinResolver = useMemo(
    () => Array.from(new Set(paginados.map((a) => a.expediente).filter((e) => e && !padron.has(e)))).join("|"),
    [paginados, padron],
  );
  useEffect(() => {
    if (!expsSinResolver) return;
    resolverPadron(expsSinResolver.split("|")).then((res) => {
      res.forEach((v, k) => cachePadron.set(k, v));
      setPadron(new Map(cachePadron));
    });
  }, [expsSinResolver]);

  // Lo que "Todos" suma aparte de los tipos con tarjeta propia (otro / sin dato).
  const restoTodos = conteos
    ? (conteos.todos ?? 0) - tipos.reduce((s, t) => s + (t.value === "todos" ? 0 : conteos[t.value] ?? 0), 0)
    : 0;
  const tipoActual = tipos.find((t) => t.value === tipo) ?? tipos[0];
  const nTipo = conteos?.[tipo] ?? 0;

  // Elimina una atención (solo ESDOMED/admin, para corregir un registro agregado
  // por error). Ajusta detalle y conteos de la caché para que no reaparezca.
  const eliminarAtencion = async (a: AtencionEmergencia) => {
    if (!a.id) return;
    await deleteDoc(doc(db, "atenciones_emergencia", a.id));
    guardar(cacheKey, (prev) => {
      const detalleSin: CacheRango["detalle"] = {};
      (Object.keys(prev.detalle) as Tipo[]).forEach((t) => {
        detalleSin[t] = prev.detalle[t]?.filter((x) => x.id !== a.id);
      });
      if (!prev.conteos) return { detalle: detalleSin };
      const conteosSin: Partial<Record<Tipo, number>> = { ...prev.conteos };
      (Object.keys(conteosSin) as Tipo[]).forEach((t) => {
        if (perteneceATipo(vista, t, a)) conteosSin[t] = Math.max(0, (conteosSin[t] ?? 0) - 1);
      });
      return { conteos: conteosSin, detalle: detalleSin };
    });
    setSeleccion(null);
  };

  // Exporta a Excel exactamente lo que se está viendo (respeta tipo, sub-filtro,
  // búsqueda y rango de fechas). Una sola hoja con todas las columnas del informe.
  const generoLabel = (g?: string) =>
    g === "masculino" ? "Masculino" : g === "femenino" ? "Femenino" : g === "otro" ? "Otro" : "";
  const exportarExcel = async () => {
    if (filtrados.length === 0) return;
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const filas = filtrados.map((a) => ({
        Expediente: a.expediente,
        Paciente: a.pacienteNombre ?? "",
        DUI: a.dui ?? "",
        Sexo: generoLabel(a.genero),
        Edad: a.edadTexto ?? (a.edadAnios != null ? `${a.edadAnios} años` : ""),
        "Ingreso a emergencia": a.fechaHoraIngreso ? formatFechaHora(a.fechaHoraIngreso) : "",
        "Fecha de alta / egreso": a.fechaHoraAltaIngreso ? formatFechaHora(a.fechaHoraAltaIngreso) : "",
        "Categorización (triage)": a.categorizacion ?? "",
        Diagnóstico: a.diagnostico ?? "",
        "Ingresó a hospitalización": INGRESO_LABEL[a.ingresoHospitalizacion],
        "Tipo de egreso": a.tipoEgreso ?? "",
        "Condición de egreso": CONDICION_LABEL[condicionEgreso(a.tipoEgreso)],
        "Llega referido": a.llegaReferido ? "Sí" : "No",
        "Veterano de guerra": a.veteranoGuerra ? "Sí" : "No",
        "Médico triage": a.medicoTriage ?? "",
        "Especialidad triage": a.especialidadTriage ?? "",
        "Médico atiende": a.medicoAtiende ?? "",
        "Especialidad atiende": a.especialidadAtiende ?? "",
        "Llegada al establecimiento": a.tiempoLlegadaEstablecimiento ?? "",
        "Duración triage": a.tiempoDuracionTriage ?? "",
        "Espera a consulta": a.tiempoEsperaConsulta ?? "",
        Consulta: a.tiempoConsulta ?? "",
        Evaluación: a.tiempoEvaluacion ?? "",
        "Total en emergencia": a.tiempoTotalEmergencia ?? "",
        "Establecimiento de procedencia": a.establecimientoProcedencia ?? "",
        "Distancia entre establecimientos": a.distanciaEntreEstablecimientos ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(filas);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, esEgresos ? "Egresos emergencia" : "Atendidos emergencia");
      const nombre = `emergencia_${vista}_${tipo}_${fechaDesde || "inicio"}_a_${fechaHasta || "fin"}.xlsx`;
      XLSX.writeFile(wb, nombre);
    } finally {
      setExportando(false);
    }
  };

  const fmtN = (n: number) => n.toLocaleString("es-SV");

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center border bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900">
            {esEgresos
              ? <HeartPulse size={17} className="text-blue-600 dark:text-blue-400" />
              : <Ambulance size={17} className="text-blue-600 dark:text-blue-400" />}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
              {esEgresos ? "Egresos de emergencia" : "Atendidos en emergencia"}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {esEgresos
                ? "Pacientes que egresaron desde emergencia (sin ingresar), por condición de alta."
                : "Pacientes que pasaron por emergencia, según si ingresaron o no a hospitalización."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportarExcel}
            disabled={exportando || filtrados.length === 0}
            title={filtrados.length === 0 ? "Extrae el detalle para exportar" : `Exportar ${filtrados.length} registros a Excel`}
            className="flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={15} />
            {exportando ? "Generando..." : "Excel"}
          </button>
          {permiteImportar && (
            <Link prefetch={false}
              href="/dashboard/emergencia/importar"
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              <Upload size={15} />
              Importar reporte
            </Link>
          )}
        </div>
      </div>

      {/* Rango de fechas → Contar */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0 w-24 sm:w-auto">{etiquetaFecha} desde *</span>
          <DateField
            value={fechaDesde}
            onChange={setFechaDesde}
            clearable
            disabled={ocupado}
            placeholder={`${etiquetaFecha} desde`}
            ariaLabel={`${etiquetaFecha} desde`}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0 w-24 sm:w-auto">Hasta</span>
          <DateField
            value={fechaHasta}
            onChange={setFechaHasta}
            clearable
            disabled={ocupado}
            placeholder="Hasta"
            ariaLabel="Hasta"
          />
        </div>
        <button
          onClick={contar}
          disabled={ocupado || !fechaDesde}
          title={!fechaDesde ? "Elige la fecha desde para contar" : `Contar ${fechaDesde}${fechaHasta ? ` → ${fechaHasta}` : " en adelante"}`}
          className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          {contando ? <RefreshCw size={15} className="animate-spin" /> : <Hash size={15} />}
          {conteos ? "Actualizar conteo" : "Contar"}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p>{error.mensaje}</p>
            {error.enlaceIndice && (
              <a
                href={error.enlaceIndice}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-xs font-semibold underline underline-offset-2"
              >
                Crear el índice en la consola de Firebase <ArrowUpRight size={12} />
              </a>
            )}
          </div>
        </div>
      )}

      {!conteos ? (
        // Sin conteo todavía: nada se ha leído de Firestore.
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 px-4 text-center">
          {contando ? (
            <div className="w-6 h-6 mx-auto border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Ambulance size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-sm text-slate-500">
                Elige un rango de fechas ({esEgresos ? "egreso desde emergencia" : "atención en emergencia"}) y pulsa Contar.
              </p>
              <p className="text-xs text-slate-400 mt-1 mb-4">
                Primero verás cuántos registros hay de cada tipo; el detalle se carga solo cuando lo pidas.
              </p>
              <button
                onClick={contar}
                disabled={!fechaDesde}
                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                <Hash size={15} /> Contar
              </button>
              {!fechaDesde && (
                <p className="text-xs text-slate-400 mt-2">Indica al menos la fecha &ldquo;desde&rdquo;.</p>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          {/* Tarjetas de conteo: elegir un tipo no lee nada; extraer su detalle, sí. */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {tipos.map((t) => {
                const activo = tipo === t.value;
                const cargado = detalle[t.value] != null || detalle.todos != null;
                return (
                  <button
                    key={t.value}
                    onClick={() => setTipo(t.value)}
                    disabled={extrayendo !== null}
                    aria-pressed={activo}
                    className={`text-left rounded-xl border px-3 py-2.5 sm:px-4 sm:py-3 transition-colors disabled:cursor-not-allowed ${
                      activo
                        ? "bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-800 ring-1 ring-blue-500/40"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.punto}`} />
                      <span className="truncate">{t.label}</span>
                    </span>
                    <span className="block mt-1 text-xl sm:text-2xl font-bold font-heading tabular-nums text-slate-900 dark:text-slate-100">
                      {fmtN(conteos[t.value] ?? 0)}
                    </span>
                    <span className={`flex items-center gap-1 mt-0.5 text-[11px] ${
                      cargado ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"
                    }`}>
                      {cargado ? <><CheckCircle2 size={11} className="shrink-0" /> Detalle cargado</> : "Solo conteo"}
                    </span>
                  </button>
                );
              })}
            </div>
            {restoTodos > 0 && (
              <p className="text-[11px] text-slate-400">
                &ldquo;Todos&rdquo; incluye {fmtN(restoTodos)}{" "}
                {esEgresos ? "con otra condición o sin condición registrada" : "sin dato de ingreso a hospitalización"}.
              </p>
            )}
          </div>

          {detalleTipo === null ? (
            // Solo conteo: el detalle se lee únicamente al pedirlo.
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-12 px-4 text-center">
              {extrayendo ? (
                <div className="max-w-sm mx-auto">
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-2 tabular-nums">
                    Cargando detalle… {fmtN(extrayendo.leidos)} de {fmtN(conteos[extrayendo.tipo] ?? extrayendo.leidos)}
                  </p>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-[width] duration-300"
                      style={{ width: `${Math.min(100, (extrayendo.leidos / Math.max(1, conteos[extrayendo.tipo] ?? 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : nTipo === 0 ? (
                <>
                  <Ambulance size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
                  <p className="text-sm text-slate-500">
                    No hay registros de &ldquo;{tipoActual.label}&rdquo; en el rango elegido.
                  </p>
                </>
              ) : (
                <>
                  <Database size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {fmtN(nTipo)} {nTipo === 1 ? "registro" : "registros"} de &ldquo;{tipoActual.label}&rdquo; en el rango
                  </p>
                  <p className="text-xs text-slate-500 mt-1 mb-4">
                    El detalle se carga solo cuando lo pides. Cambiar de tipo no carga nada.
                  </p>
                  <button
                    onClick={() => extraer(tipo)}
                    disabled={ocupado}
                    className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    <Database size={15} /> Extraer detalle ({fmtN(nTipo)})
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Sub-filtro rápido por condición de egreso (solo "No ingresaron") */}
              {usaCondRapida && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">Condición:</span>
                  {([
                    { v: "todos",     l: "Todos",      n: conteoCondicion.todos,     activo: "bg-slate-700 text-white" },
                    { v: "vivo",      l: "Vivos",      n: conteoCondicion.vivo,      activo: "bg-emerald-600 text-white" },
                    { v: "fallecido", l: "Fallecidos", n: conteoCondicion.fallecido, activo: "bg-rose-600 text-white" },
                  ] as { v: CondRapida; l: string; n: number; activo: string }[]).map((c) => (
                    <button
                      key={c.v}
                      onClick={() => setCondRapida(c.v)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        condRapida === c.v
                          ? c.activo
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {c.l}
                      <span className="ml-1.5 opacity-70 tabular-nums">{c.n}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Buscador sobre el detalle cargado */}
              <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por expediente, DUI o nombre..."
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                  />
                </div>
                {busqueda && (
                  <button
                    onClick={() => setBusqueda("")}
                    className="flex items-center gap-1 px-3 py-2 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors shadow-sm"
                  >
                    <X size={12} /> Limpiar
                  </button>
                )}
              </div>

              {/* Tabla */}
              {filtrados.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
                  <Ambulance size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
                  <p className="text-sm text-slate-500">
                    {atenciones.length === 0
                      ? `No hay registros de “${tipoActual.label}” en el rango elegido.`
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
                          const traza = padron.get(a.expediente);
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
                                <EnlacePadron pacienteId={traza?.pacienteId} enPadron={traza?.enPadron ?? false} fichaHref={fichaHref} />
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
                      <span className="font-medium text-slate-700 dark:text-slate-300">{fmtN(filtrados.length)}</span>
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
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Ficha de detalle — todos los campos del informe */}
      {seleccion && (
        <FichaEmergencia
          atencion={seleccion}
          pacienteId={padron.get(seleccion.expediente)?.pacienteId}
          enPadron={padron.get(seleccion.expediente)?.enPadron ?? false}
          fichaHref={fichaHref}
          permiteEliminar={permiteImportar}
          onEliminar={eliminarAtencion}
          onClose={() => setSeleccion(null)}
        />
      )}
    </div>
  );
}

function FichaEmergencia({
  atencion: a, pacienteId, enPadron, fichaHref, permiteEliminar, onEliminar, onClose,
}: {
  atencion: AtencionEmergencia;
  pacienteId?: string;
  enPadron: boolean;
  fichaHref?: (pacienteId: string) => string;
  permiteEliminar?: boolean;
  onEliminar?: (a: AtencionEmergencia) => Promise<void>;
  onClose: () => void;
}) {
  const cond = condicionEgreso(a.tipoEgreso);
  const fechaHora = (d?: Date) => (d ? formatFechaHora(d) : undefined);
  const [confirmando, setConfirmando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  const handleEliminar = async () => {
    if (!onEliminar) return;
    setEliminando(true);
    setErrorEliminar(null);
    try {
      await onEliminar(a);
    } catch (e) {
      setErrorEliminar(e instanceof Error ? e.message : "No se pudo eliminar la atención.");
      setEliminando(false);
    }
  };
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
                <Link prefetch={false} href={fichaHref(pacienteId)} className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500">
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

          <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
            <p className="text-[11px] text-slate-400">
              Importado por {a.importadoPorNombre} · {formatFechaHora(a.importadoEn)}
            </p>
            {permiteEliminar && onEliminar && (
              <button
                onClick={() => setConfirmando(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900 px-3 py-1.5 rounded-lg transition-colors shrink-0"
              >
                <Trash2 size={13} /> Eliminar atención
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmación de eliminación */}
      {confirmando && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-900 dark:text-slate-100">Eliminar atención</p>
                <p className="text-sm text-slate-500 mt-1">
                  Se eliminará la atención de <span className="font-medium text-slate-700 dark:text-slate-300">{a.pacienteNombre || a.expediente}</span> ({formatFechaHora(a.fechaHoraIngreso)}). Esta acción no se puede deshacer.
                </p>
              </div>
            </div>

            {errorEliminar && (
              <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{errorEliminar}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setConfirmando(false); setErrorEliminar(null); }}
                disabled={eliminando}
                className="flex-1 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleEliminar}
                disabled={eliminando}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-xl transition-colors disabled:opacity-50"
              >
                {eliminando ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
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
      <Link prefetch={false}
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
