"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, getCountFromServer, getDocs, limit, query, where } from "@/lib/firestoreMeter";
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Download, History, Search, UserPlus, X, XCircle } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { toDate } from "@/lib/pacientes/helpers";
import { TIPO_MEDICO_CRITICO_LABEL } from "@/lib/cuidadosCriticos";
import { jvpmAUsername } from "@/lib/username";
import type { RegistroMedicoResuelto } from "@/types";

const inputCls =
  "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500";

function formatFechaHora(ts: unknown): string {
  const d = toDate(ts);
  if (!d) return "-";
  return d.toLocaleString("es-SV", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

type Filtro = "todos" | "aprobado" | "rechazado";

const PAGE_SIZE = 10;

export default function RegistrosMedicosHistorialPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  // Búsqueda bajo demanda: nada se carga hasta que se escribe JVPM o nombre y
  // se pulsa Buscar. Antes esta ruta traía hasta 500 documentos completos
  // cada vez que se abría.
  const [busquedaJvpm, setBusquedaJvpm] = useState("");
  const [busquedaNombre, setBusquedaNombre] = useState("");
  const [resultados, setResultados] = useState<RegistroMedicoResuelto[] | null>(null); // null = aún no se busca
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState("");

  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [pagina, setPagina] = useState(1);
  // true cuando la lista viene de "ver todos los rechazados" (sin criterio de búsqueda)
  const [modoRechazados, setModoRechazados] = useState(false);

  // Totales por agregación (getCountFromServer): no lee documentos, no es en vivo.
  const [totalAprobados, setTotalAprobados] = useState<number | null>(null);
  const [totalRechazados, setTotalRechazados] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && profile?.role !== "admin") router.replace("/dashboard");
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== "admin") return;
    let activo = true;
    (async () => {
      try {
        const col = collection(db, "registros_medicos_historial");
        const [aprobadosSnap, rechazadosSnap] = await Promise.all([
          getCountFromServer(query(col, where("estado", "==", "aprobado"))),
          getCountFromServer(query(col, where("estado", "==", "rechazado"))),
        ]);
        if (activo) {
          setTotalAprobados(aprobadosSnap.data().count);
          setTotalRechazados(rechazadosSnap.data().count);
        }
      } catch {
        if (activo) { setTotalAprobados(null); setTotalRechazados(null); }
      }
    })();
    return () => { activo = false; };
  }, [profile?.role]);

  const sinCriterio = !busquedaJvpm.trim() && !busquedaNombre.trim();

  // Una sola lectura (getDocs) por búsqueda, no un listener.
  const buscar = async () => {
    const jvpmInput = busquedaJvpm.trim();
    const nombreInput = busquedaNombre.trim().toUpperCase();
    if (!jvpmInput && !nombreInput) return;
    setBuscando(true);
    setErrorBusqueda("");
    setModoRechazados(false);
    try {
      let docs: RegistroMedicoResuelto[];
      if (jvpmInput) {
        // El JVPM crudo puede variar en mayúsculas/espacios según cómo se
        // autoregistró el médico; "username" es su forma ya normalizada
        // (login), así que buscamos por ahí para que sea confiable.
        const usernameNorm = jvpmAUsername(jvpmInput);
        const snap = await getDocs(query(collection(db, "registros_medicos_historial"), where("username", "==", usernameNorm)));
        docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RegistroMedicoResuelto));
      } else {
        // Nombre: coincidencia desde el inicio del campo (Firestore no tiene "contiene").
        // "nombre" ya se guarda en mayúsculas; se normaliza igual el texto de búsqueda.
        const snap = await getDocs(
          query(
            collection(db, "registros_medicos_historial"),
            where("nombre", ">=", nombreInput),
            where("nombre", "<", nombreInput + ""),
            limit(200),
          )
        );
        docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RegistroMedicoResuelto));
      }
      docs.sort((a, b) => (toDate(b.resueltoEn)?.getTime() ?? 0) - (toDate(a.resueltoEn)?.getTime() ?? 0));
      setResultados(docs);
    } catch (e) {
      setErrorBusqueda((e as Error).message || "No se pudo completar la búsqueda.");
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  };

  const limpiarBusqueda = () => {
    setBusquedaJvpm(""); setBusquedaNombre("");
    setResultados(null); setErrorBusqueda("");
    setModoRechazados(false);
  };

  // Listado completo de rechazados: un solo getDocs filtrado por estado. Suelen
  // ser pocos (ver contador), así que no rompe la búsqueda bajo demanda; el
  // orden se resuelve en el cliente para no requerir índice compuesto.
  const verRechazados = async () => {
    setBusquedaJvpm(""); setBusquedaNombre("");
    setBuscando(true);
    setErrorBusqueda("");
    setModoRechazados(true);
    setFiltro("todos");
    try {
      const snap = await getDocs(
        query(collection(db, "registros_medicos_historial"), where("estado", "==", "rechazado"), limit(500))
      );
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RegistroMedicoResuelto));
      docs.sort((a, b) => (toDate(b.resueltoEn)?.getTime() ?? 0) - (toDate(a.resueltoEn)?.getTime() ?? 0));
      setResultados(docs);
    } catch (e) {
      setErrorBusqueda((e as Error).message || "No se pudo cargar el listado de rechazados.");
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  };

  const filtrados = useMemo(() => {
    if (resultados === null) return [];
    return resultados.filter((r) => filtro === "todos" || r.estado === filtro);
  }, [resultados, filtro]);

  // Al cambiar filtro/resultados, volver a la página 1 (ajuste en render, sin efecto).
  const filtrosKey = `${resultados === null ? "null" : resultados.length}|${filtro}|${modoRechazados}`;
  const [prevFiltros, setPrevFiltros] = useState(filtrosKey);
  if (filtrosKey !== prevFiltros) {
    setPrevFiltros(filtrosKey);
    setPagina(1);
  }

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const filtradosPagina = filtrados.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const filas = filtrados.map((r) => ({
      NOMBRE: r.nombre,
      DUI: r.dui,
      JVPM: r.jvpm,
      USUARIO: r.username,
      TIPO: r.tipoMedico ? TIPO_MEDICO_CRITICO_LABEL[r.tipoMedico] : "Médico general",
      SERVICIOS: (r.servicios ?? []).join(", "),
      ESTADO: r.estado === "aprobado" ? "Aprobado" : "Rechazado",
      MOTIVO: r.motivo ?? "",
      "FECHA SOLICITUD": formatFechaHora(r.solicitadoEn),
      "FECHA RESOLUCIÓN": formatFechaHora(r.resueltoEn),
      "RESUELTO POR": r.resueltoPorNombre ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Registros de médicos");
    XLSX.writeFile(wb, `registros-medicos-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const filtroBtn = (value: Filtro, label: string) => (
    <button
      onClick={() => setFiltro(value)}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
        filtro === value
          ? "bg-blue-600 border-blue-600 text-white"
          : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center border border-slate-300 dark:border-slate-700">
            <ClipboardList size={17} className="text-slate-600 dark:text-slate-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
              Registros de médicos
            </h1>
            <p className="text-xs text-slate-500">Historial de aceptaciones y rechazos</p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={exportar}
            disabled={filtrados.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={15} /> Exportar Excel
          </button>
          <Link prefetch={false}
            href="/dashboard/usuarios"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <UserPlus size={15} /> Solicitudes pendientes
          </Link>
        </div>
      </div>

      {/* Resumen: agregación (getCountFromServer), no lee documentos */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3">
          <p className="text-xs text-emerald-700 dark:text-emerald-400">Aprobados</p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{totalAprobados ?? "…"}</p>
        </div>
        <button
          onClick={verRechazados}
          disabled={buscando}
          title="Ver todos los rechazados"
          className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-left hover:bg-red-100 dark:hover:bg-red-950/70 transition-colors disabled:opacity-60 group"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs text-red-700 dark:text-red-400">Rechazados</p>
              <p className="text-2xl font-bold text-red-700 dark:text-red-300">{totalRechazados ?? "…"}</p>
            </div>
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-red-600 dark:text-red-400 opacity-70 group-hover:opacity-100 transition-opacity">
              Ver todos <ChevronRight size={12} />
            </span>
          </div>
        </button>
      </div>

      {/* Búsqueda bajo demanda: JVPM (exacto) o nombre (coincidencia desde el inicio) */}
      <div className="space-y-2 mb-5">
        <div className="flex items-center gap-2">
          <History size={14} className="text-slate-400 flex-shrink-0" />
          <p className="text-xs text-slate-500">
            Busca por junta de vigilancia (JVPM) o por nombre. La búsqueda se hace bajo demanda para no releer todo el historial.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={busquedaJvpm}
              onChange={(e) => setBusquedaJvpm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") buscar(); }}
              placeholder="Buscar por JVPM…"
              className={`${inputCls} pl-9`}
            />
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={busquedaNombre}
              onChange={(e) => setBusquedaNombre(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") buscar(); }}
              placeholder="Buscar por nombre o apellido…"
              className={`${inputCls} pl-9`}
            />
          </div>
          <button
            onClick={buscar}
            disabled={buscando || sinCriterio}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-sm"
          >
            <Search size={13} /> {buscando ? "Buscando…" : "Buscar"}
          </button>
          {(busquedaJvpm || busquedaNombre || resultados !== null) && (
            <button
              onClick={limpiarBusqueda}
              className="flex items-center gap-1 px-2.5 py-2 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
            >
              <X size={12} /> Limpiar
            </button>
          )}
        </div>
        {errorBusqueda && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {errorBusqueda}
          </div>
        )}
      </div>

      {resultados !== null && !modoRechazados && (
        <div className="flex gap-2 mb-5">
          {filtroBtn("todos", "Todos")}
          {filtroBtn("aprobado", "Aprobados")}
          {filtroBtn("rechazado", "Rechazados")}
        </div>
      )}

      {resultados !== null && modoRechazados && !buscando && (
        <div className="flex items-center gap-2 mb-5">
          <XCircle size={14} className="text-red-500 flex-shrink-0" />
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Mostrando todos los registros rechazados ({filtrados.length})
          </p>
        </div>
      )}

      {/* Lista */}
      {resultados === null ? (
        <p className="text-sm text-slate-400 py-16 text-center">
          Escribe un JVPM o un nombre y pulsa Buscar, o haz clic en la tarjeta de rechazados para ver el listado completo.
        </p>
      ) : buscando ? (
        <p className="text-sm text-slate-400 py-10 text-center">Buscando...</p>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <ClipboardList size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">{modoRechazados ? "No hay registros rechazados." : "Sin resultados para esa búsqueda."}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtradosPagina.map((r) => {
            const aprobado = r.estado === "aprobado";
            return (
              <div
                key={r.id}
                className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3"
              >
                <div className="min-w-0 flex items-start gap-3">
                  {aprobado ? (
                    <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle size={18} className="mt-0.5 flex-shrink-0 text-red-500" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{r.nombre}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      DUI {r.dui} · JVPM {r.jvpm}
                      {r.tipoMedico ? ` · ${TIPO_MEDICO_CRITICO_LABEL[r.tipoMedico]}` : ""}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{r.servicios?.join(", ")}</p>
                    {!aprobado && r.motivo && (
                      <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">Motivo: {r.motivo}</p>
                    )}
                  </div>
                </div>
                <div className="sm:text-right flex-shrink-0 pl-8 sm:pl-0">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                      aprobado
                        ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900"
                        : "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900"
                    }`}
                  >
                    {aprobado ? "Aprobado" : "Rechazado"}
                  </span>
                  <p className="text-[11px] text-slate-400 mt-1">{formatFechaHora(r.resueltoEn)}</p>
                  <p className="text-[11px] text-slate-400">por {r.resueltoPorNombre || "—"}</p>
                </div>
              </div>
            );
          })}

          {/* Paginación */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between pt-3">
              <p className="text-xs text-slate-500">
                Mostrando {(paginaActual - 1) * PAGE_SIZE + 1}–{Math.min(paginaActual * PAGE_SIZE, filtrados.length)} de {filtrados.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={paginaActual === 1}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="px-3 text-xs font-medium text-slate-600 dark:text-slate-400 tabular-nums">
                  {paginaActual} / {totalPaginas}
                </span>
                <button
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={paginaActual === totalPaginas}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
