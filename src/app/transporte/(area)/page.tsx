"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection, getDocs, limit, onSnapshot, orderBy, query, Timestamp, updateDoc, where, doc,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { UserProfile, VehiculoTransporte, ViajeTransporte } from "@/types";
import { ESTADO_VIAJE_COLOR, ESTADO_VIAJE_LABEL } from "@/lib/transporte/catalogos";
import { DateField } from "@/components/ui/DateField";
import {
  AlertTriangle, Bus, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, LayoutDashboard,
  Loader2, MapPin, Phone, Search, UserRound, X, XCircle,
} from "lucide-react";

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";
const selectCls =
  "w-full appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer";
const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";

const PAGE_SIZE = 15;

const fmtFecha = (f?: string) => {
  if (!f) return "—";
  const [y, m, d] = f.split("-");
  return y && m && d ? `${d}/${m}/${y}` : f;
};

type FiltroRapido = "todos" | "pendiente" | "asignado" | "en_ruta";
type Vista = "bandeja" | "buscar";

export default function TableroTransportePage() {
  const { profile } = useAuth();
  const router = useRouter();

  // El motorista tiene su propia vista; este tablero es del jefe/admin.
  useEffect(() => {
    if (profile?.role === "motorista") router.replace("/transporte/mis-viajes");
  }, [profile?.role, router]);

  const [activos, setActivos] = useState<ViajeTransporte[]>([]);
  const [vehiculos, setVehiculos] = useState<VehiculoTransporte[]>([]);
  const [motoristas, setMotoristas] = useState<UserProfile[]>([]);
  const [permissionError, setPermissionError] = useState(false);

  const [vista, setVista] = useState<Vista>("bandeja");
  const [filtro, setFiltro] = useState<FiltroRapido>("pendiente");
  const [busqueda, setBusqueda] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<{ tipo: "success" | "error"; msg: string } | null>(null);

  // Búsqueda histórica bajo demanda (por rango de fecha del viaje).
  const [histDesde, setHistDesde] = useState("");
  const [histHasta, setHistHasta] = useState("");
  const [histResultados, setHistResultados] = useState<ViajeTransporte[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  // Modales
  const [aAsignar, setAAsignar] = useState<ViajeTransporte | null>(null);
  const [aRechazar, setARechazar] = useState<ViajeTransporte | null>(null);

  // Viajes activos EN VIVO (pendiente/asignado/en ruta): acotado por naturaleza —
  // lo cerrado (finalizado/rechazado/cancelado) sale del listener solo.
  useEffect(() => {
    const q = query(collection(db, "viajes_transporte"), where("estado", "in", ["pendiente", "asignado", "en_ruta"]));
    return onSnapshot(q, (s) => {
      setPermissionError(false);
      setActivos(s.docs.map((d) => ({ id: d.id, ...d.data() } as ViajeTransporte)));
    }, (err) => { if (err.code === "permission-denied") setPermissionError(true); });
  }, []);

  // Catálogos (flota chica: lecturas puntuales al montar).
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const [vs, ms] = await Promise.all([
          getDocs(collection(db, "vehiculos_transporte")),
          getDocs(query(collection(db, "usuarios"), where("role", "==", "motorista"))),
        ]);
        setVehiculos(vs.docs.map((d) => ({ id: d.id, ...d.data() } as VehiculoTransporte)));
        setMotoristas(ms.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile)));
      } catch { /* el tablero funciona sin catálogos; el modal avisa */ }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const stats = useMemo(() => ({
    pendientes: activos.filter((v) => v.estado === "pendiente").length,
    asignados: activos.filter((v) => v.estado === "asignado").length,
    enRuta: activos.filter((v) => v.estado === "en_ruta").length,
  }), [activos]);

  const lista = useMemo(() => {
    const base = vista === "buscar" ? (histResultados ?? []) : activos;
    const t = busqueda.trim().toLowerCase();
    return base
      .filter((v) => {
        if (vista === "bandeja" && filtro !== "todos" && v.estado !== filtro) return false;
        if (!t) return true;
        return (
          v.folio.toLowerCase().includes(t) ||
          v.solicitanteNombre.toLowerCase().includes(t) ||
          v.area.toLowerCase().includes(t) ||
          v.destinoTexto.toLowerCase().includes(t) ||
          (v.motoristaNombre ?? "").toLowerCase().includes(t) ||
          (v.vehiculoNombre ?? "").toLowerCase().includes(t)
        );
      })
      .sort((a, b) => a.fechaNecesita.localeCompare(b.fechaNecesita) || a.horaNecesita.localeCompare(b.horaNecesita));
  }, [vista, activos, histResultados, filtro, busqueda]);

  const totalPages = Math.max(1, Math.ceil(lista.length / PAGE_SIZE));
  const filtrosKey = `${vista}|${filtro}|${busqueda}`;
  const [filtrosPrevios, setFiltrosPrevios] = useState(filtrosKey);
  if (filtrosPrevios !== filtrosKey) { setFiltrosPrevios(filtrosKey); setPage(1); }
  const pageSafe = Math.min(page, totalPages);
  const paginados = lista.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const buscarHistorial = useCallback(async () => {
    if (!histDesde || !histHasta) return;
    setBuscando(true);
    try {
      const q = query(
        collection(db, "viajes_transporte"),
        where("fechaNecesita", ">=", histDesde),
        where("fechaNecesita", "<=", histHasta),
        orderBy("fechaNecesita", "desc"),
        limit(300),
      );
      const s = await getDocs(q);
      setHistResultados(s.docs.map((d) => ({ id: d.id, ...d.data() } as ViajeTransporte)));
    } catch {
      setToast({ tipo: "error", msg: "No se pudo buscar el historial" });
    } finally {
      setBuscando(false);
    }
  }, [histDesde, histHasta]);

  const rechazar = async (v: ViajeTransporte, motivo: string) => {
    if (!profile) return;
    await updateDoc(doc(db, "viajes_transporte", v.folio), {
      estado: "rechazado",
      motivoRechazo: motivo.trim(),
      autorizadoPorId: profile.uid,
      autorizadoPorNombre: profile.nombre,
      actualizadoEn: Timestamp.now(),
    });
  };

  const cancelar = async (v: ViajeTransporte) => {
    if (!profile) return;
    try {
      await updateDoc(doc(db, "viajes_transporte", v.folio), {
        estado: "cancelado",
        autorizadoPorId: profile.uid,
        autorizadoPorNombre: profile.nombre,
        actualizadoEn: Timestamp.now(),
      });
      setToast({ tipo: "success", msg: `Viaje ${v.folio} cancelado` });
    } catch {
      setToast({ tipo: "error", msg: "No se pudo cancelar el viaje" });
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1c1e4d] dark:text-[#c9a892] mb-1">
            <LayoutDashboard size={13} /> Transporte
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Tablero de viajes</h1>
        </div>
        <a
          href="/transporte/solicitar"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm"
        >
          <ExternalLink size={14} /> Formulario público
        </a>
      </div>

      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer los viajes. Pide al administrador que despliegue las reglas de <strong>viajes_transporte</strong>.
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {([
          { k: "pendiente" as FiltroRapido, label: "Pendientes", n: stats.pendientes, cls: "text-amber-600 dark:text-amber-400" },
          { k: "asignado" as FiltroRapido, label: "Asignados", n: stats.asignados, cls: "text-blue-600 dark:text-blue-400" },
          { k: "en_ruta" as FiltroRapido, label: "En ruta", n: stats.enRuta, cls: "text-violet-600 dark:text-violet-400" },
          { k: "todos" as FiltroRapido, label: "Activos", n: activos.length, cls: "text-slate-800 dark:text-slate-200" },
        ]).map((s) => (
          <button
            key={s.k}
            onClick={() => { setVista("bandeja"); setFiltro(s.k); }}
            className={`text-left bg-white dark:bg-slate-900 border rounded-2xl px-4 py-3 transition-colors ${
              vista === "bandeja" && filtro === s.k ? "border-blue-400 dark:border-blue-700 ring-1 ring-blue-400/40" : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
            }`}
          >
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{s.label}</p>
            <p className={`text-2xl font-bold font-heading tabular-nums ${s.cls}`}>{s.n}</p>
          </button>
        ))}
      </div>

      {/* Bandeja / Buscar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl">
          {(["bandeja", "buscar"] as Vista[]).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                vista === v ? "bg-white dark:bg-slate-900 shadow-sm text-blue-700 dark:text-blue-300" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {v === "bandeja" ? "Bandeja" : "Buscar anteriores"}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por folio, solicitante, área, destino, motorista…" className={inputCls + " pl-9"} />
        </div>
      </div>

      {vista === "buscar" && (
        <div className="flex flex-wrap items-end gap-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3">
          <div>
            <label className={labelCls}>Desde</label>
            <DateField value={histDesde} onChange={setHistDesde} ariaLabel="Desde" className="w-[150px]" />
          </div>
          <div>
            <label className={labelCls}>Hasta</label>
            <DateField value={histHasta} onChange={setHistHasta} ariaLabel="Hasta" className="w-[150px]" />
          </div>
          <button
            onClick={buscarHistorial}
            disabled={!histDesde || !histHasta || buscando}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl transition-colors"
          >
            {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Buscar
          </button>
          {histResultados && (
            <span className="text-xs text-slate-500 pb-2.5">{histResultados.length} viajes en el rango</span>
          )}
        </div>
      )}

      {/* Lista */}
      {lista.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Bus size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">
            {vista === "buscar"
              ? histResultados ? "Sin viajes en el rango elegido." : "Elige un rango de fechas y pulsa Buscar."
              : "No hay viajes que coincidan con el filtro."}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
          {paginados.map((v) => (
            <div key={v.folio} className="px-4 py-3 flex flex-col lg:flex-row lg:items-center gap-2.5 lg:gap-4">
              {/* Identidad del viaje */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[11px] text-slate-500">{v.folio}</span>
                  <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${ESTADO_VIAJE_COLOR[v.estado]}`}>
                    {ESTADO_VIAJE_LABEL[v.estado]}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                    {fmtFecha(v.fechaNecesita)} · {v.horaNecesita}
                  </span>
                </div>
                <p className="font-semibold text-slate-800 dark:text-slate-200 truncate mt-0.5">
                  <MapPin size={12} className="inline mr-1 text-slate-400" />{v.destinoTexto}
                  <span className="font-normal text-slate-500"> — {v.mision}</span>
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {v.area} · <UserRound size={11} className="inline text-slate-400" /> {v.solicitanteNombre}
                  {v.telefono ? <> · <Phone size={11} className="inline text-slate-400" /> {v.telefono}</> : null}
                </p>
                {(v.vehiculoNombre || v.motoristaNombre) && (
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    <Bus size={11} className="inline mr-1 text-slate-400" />
                    {[v.vehiculoNombre, v.motoristaNombre].filter(Boolean).join(" · ")}
                    {v.kmRecorrido != null ? ` · ${v.kmRecorrido} km` : ""}
                  </p>
                )}
                {v.estado === "rechazado" && v.motivoRechazo && (
                  <p className="text-xs text-rose-600 dark:text-rose-400 truncate mt-0.5">Motivo: {v.motivoRechazo}</p>
                )}
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <a
                  href={`/transporte/solicitud/${v.folio}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 px-2 py-1.5 transition-colors"
                >
                  Orden
                </a>
                {v.estado === "pendiente" && (
                  <>
                    <button
                      onClick={() => setARechazar(v)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 hover:border-rose-400 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <XCircle size={13} /> Rechazar
                    </button>
                    <button
                      onClick={() => setAAsignar(v)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <CheckCircle2 size={13} /> Asignar
                    </button>
                  </>
                )}
                {v.estado === "asignado" && (
                  <>
                    <button
                      onClick={() => cancelar(v)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-500 px-2 py-1.5 transition-colors"
                    >
                      <XCircle size={13} /> Cancelar
                    </button>
                    <button
                      onClick={() => setAAsignar(v)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 hover:border-blue-400 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      Reasignar
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {lista.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-slate-500 shrink-0">
            {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, lista.length)} de{" "}
            <span className="font-medium text-slate-700 dark:text-slate-300">{lista.length}</span>
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(Math.max(1, pageSafe - 1))} disabled={pageSafe === 1} className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={14} /></button>
            <span className="text-xs text-slate-500 px-2 tabular-nums">{pageSafe} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, pageSafe + 1))} disabled={pageSafe === totalPages} className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      {/* Modal Asignar / Reasignar */}
      {aAsignar && (
        <ModalAsignar
          viaje={aAsignar}
          vehiculos={vehiculos.filter((x) => x.estado === "activo")}
          motoristas={motoristas}
          onCerrar={() => setAAsignar(null)}
          onGuardado={(msg) => { setAAsignar(null); setToast({ tipo: "success", msg }); }}
          onError={() => setToast({ tipo: "error", msg: "No se pudo asignar el viaje" })}
        />
      )}

      {/* Modal Rechazar */}
      {aRechazar && (
        <ModalRechazar
          viaje={aRechazar}
          onCerrar={() => setARechazar(null)}
          onConfirmar={async (motivo) => {
            try {
              await rechazar(aRechazar, motivo);
              setToast({ tipo: "success", msg: `Solicitud ${aRechazar.folio} rechazada` });
            } catch {
              setToast({ tipo: "error", msg: "No se pudo rechazar la solicitud" });
            } finally {
              setARechazar(null);
            }
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[210] flex items-center gap-2.5 rounded-xl border px-4 py-3 shadow-xl text-sm font-medium bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
          style={{ borderLeftWidth: 4, borderLeftColor: toast.tipo === "success" ? "#10b981" : "#f43f5e" }}>
          {toast.tipo === "success" ? <CheckCircle2 size={16} className="text-emerald-500" /> : <AlertTriangle size={16} className="text-rose-500" />}
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

// ── Modal de asignación ────────────────────────────────────────────────────────
function ModalAsignar({
  viaje, vehiculos, motoristas, onCerrar, onGuardado, onError,
}: {
  viaje: ViajeTransporte;
  vehiculos: VehiculoTransporte[];
  motoristas: UserProfile[];
  onCerrar: () => void;
  onGuardado: (msg: string) => void;
  onError: () => void;
}) {
  const { profile } = useAuth();
  const [vehiculoId, setVehiculoId] = useState(viaje.vehiculoId ?? "");
  const [motoristaId, setMotoristaId] = useState(viaje.motoristaId ?? "");
  const [esTraslado, setEsTraslado] = useState(viaje.esTraslado ?? false);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!profile || !vehiculoId || !motoristaId) return;
    const veh = vehiculos.find((x) => x.id === vehiculoId);
    const mot = motoristas.find((x) => x.uid === motoristaId);
    if (!veh || !mot) return;
    setGuardando(true);
    try {
      await updateDoc(doc(db, "viajes_transporte", viaje.folio), {
        estado: "asignado",
        vehiculoId,
        vehiculoNombre: `${veh.placa} · ${veh.nombre}`,
        motoristaId,
        motoristaNombre: mot.nombre,
        esTraslado,
        autorizadoPorId: profile.uid,
        autorizadoPorNombre: profile.nombre,
        actualizadoEn: Timestamp.now(),
      });
      onGuardado(`${viaje.folio} asignado a ${mot.nombre}`);
    } catch {
      onError();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md">
      <div className="bg-white dark:bg-slate-900 sm:border border-slate-200 dark:border-slate-800 sm:rounded-3xl w-full sm:max-w-lg shadow-2xl overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[92vh]">
        <div className="shrink-0 flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-slate-500">{viaje.folio}</p>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate">Asignar viaje</h2>
            <p className="text-xs text-slate-500 truncate">{viaje.destinoTexto} · {fmtFecha(viaje.fechaNecesita)} {viaje.horaNecesita}</p>
          </div>
          <button onClick={onCerrar} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div>
            <label className={labelCls}>Vehículo</label>
            <select value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)} className={selectCls}>
              <option value="">— Selecciona vehículo</option>
              {vehiculos.map((x) => (
                <option key={x.id} value={x.id}>{x.placa} · {x.nombre}{x.kmActual != null ? ` (km ${x.kmActual})` : ""}</option>
              ))}
            </select>
            {vehiculos.length === 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">No hay vehículos activos — regístralos en la pestaña Vehículos.</p>
            )}
          </div>
          <div>
            <label className={labelCls}>Motorista</label>
            <select value={motoristaId} onChange={(e) => setMotoristaId(e.target.value)} className={selectCls}>
              <option value="">— Selecciona motorista</option>
              {motoristas.map((m) => <option key={m.uid} value={m.uid}>{m.nombre}</option>)}
            </select>
            {motoristas.length === 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">No hay usuarios con rol Motorista — los crea el administrador en Usuarios.</p>
            )}
          </div>
          <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={esTraslado} onChange={(e) => setEsTraslado(e.target.checked)} className="w-4 h-4 accent-blue-600" />
            Cuenta como traslado (PERC)
          </label>
        </div>

        <div className="shrink-0 flex gap-3 sm:justify-end px-4 sm:px-6 py-3.5 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50">
          <button onClick={onCerrar} disabled={guardando} className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando || !vehiculoId || !motoristaId}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl transition-colors"
          >
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Asignar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de rechazo (motivo obligatorio) ─────────────────────────────────────
function ModalRechazar({
  viaje, onCerrar, onConfirmar,
}: {
  viaje: ViajeTransporte;
  onCerrar: () => void;
  onConfirmar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Rechazar solicitud</h3>
              <p className="text-xs text-slate-500 mt-0.5">{viaje.folio} · {viaje.solicitanteNombre}</p>
            </div>
            <button onClick={onCerrar} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors shrink-0">
              <X size={18} />
            </button>
          </div>
          <div>
            <label className={labelCls}>Motivo del rechazo</label>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} autoFocus className={inputCls + " resize-y"} />
          </div>
        </div>
        <div className="p-5 pt-0 flex gap-3">
          <button onClick={onCerrar} disabled={guardando} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={async () => { setGuardando(true); try { await onConfirmar(motivo); } finally { setGuardando(false); } }}
            disabled={guardando || motivo.trim().length < 3}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors disabled:opacity-50"
          >
            {guardando ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
            Rechazar
          </button>
        </div>
      </div>
    </div>
  );
}
