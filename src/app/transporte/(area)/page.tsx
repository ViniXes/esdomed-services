"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  arrayUnion, collection, getDoc, getDocs, limit, onSnapshot, orderBy, query, setDoc, Timestamp,
  updateDoc, where, doc, writeBatch,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { ChecklistVehiculo, UserProfile, VehiculoTransporte, ViajeTransporte } from "@/types";
import {
  CENTROS_COSTOS, ESTADO_VIAJE_COLOR, ESTADO_VIAJE_LABEL, generarFolio,
} from "@/lib/transporte/catalogos";
import {
  ACCION_VIAJE_LABEL, detectarConflictos, eventoViaje, fmtFecha, hayConflictos, hoyStr,
  resumirConflictos, validarKmEntrada, type ConflictosAsignacion,
} from "@/lib/transporte/helpers";
import { DateField } from "@/components/ui/DateField";
import {
  AlertTriangle, Bus, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, ExternalLink, Flag,
  History, LayoutDashboard, Loader2, MapPin, Pencil, Phone, Plus, Search, UserRound, X, XCircle,
} from "lucide-react";

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";
const selectCls =
  "w-full appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer";
const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";
const btnSecundario =
  "inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 px-2 py-1.5 transition-colors";

const PAGE_SIZE = 15;

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
  const [novedades, setNovedades] = useState<ChecklistVehiculo[]>([]);
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
  const [aCerrar, setACerrar] = useState<ViajeTransporte | null>(null);
  const [aCorregir, setACorregir] = useState<ViajeTransporte | null>(null);
  const [verHistorial, setVerHistorial] = useState<ViajeTransporte | null>(null);
  const [nuevoViaje, setNuevoViaje] = useState(false);

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

  // Novedades del checklist sin atender (consulta por igualdad: sin índice compuesto).
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const s = await getDocs(query(
          collection(db, "checklists_vehiculo"),
          where("tieneFallas", "==", true),
          where("atendido", "==", false),
          limit(50),
        ));
        setNovedades(s.docs.map((d) => ({ id: d.id, ...d.data() } as ChecklistVehiculo)));
      } catch { /* la tarjeta de aviso es opcional */ }
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
      historial: arrayUnion(eventoViaje("rechazado", profile, motivo.trim())),
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
        historial: arrayUnion(eventoViaje("cancelado", profile)),
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
        <div className="flex items-center gap-2">
          <a
            href="/transporte/solicitar"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm"
          >
            <ExternalLink size={14} /> Formulario público
          </a>
          <button
            onClick={() => setNuevoViaje(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors shadow-sm"
          >
            <Plus size={14} /> Nuevo viaje
          </button>
        </div>
      </div>

      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer los viajes. Pide al administrador que despliegue las reglas de <strong>viajes_transporte</strong>.
        </div>
      )}

      {/* Novedades del checklist sin atender */}
      {novedades.length > 0 && (
        <a
          href="/transporte/novedades"
          className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl px-4 py-3 text-sm text-amber-800 dark:text-amber-300 hover:border-amber-400 transition-colors"
        >
          <ClipboardCheck size={16} className="mt-0.5 shrink-0" />
          <span>
            <strong>{novedades.length}</strong> checklist{novedades.length === 1 ? "" : "s"} con fallas sin atender
            {" — "}{[...new Set(novedades.map((n) => n.vehiculoNombre))].join(", ")}.
            <span className="underline ml-1">Ver novedades</span>
          </span>
        </a>
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
                  {v.origen === "interno" && (
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded">
                      Interno
                    </span>
                  )}
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
                    {v.horaSalida ? ` · salida ${v.horaSalida}` : ""}
                    {v.horaEntrada ? `–${v.horaEntrada}` : ""}
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
                  className={btnSecundario}
                >
                  Orden
                </a>
                {(v.historial?.length ?? 0) > 0 && (
                  <button onClick={() => setVerHistorial(v)} className={btnSecundario} title="Historial del viaje">
                    <History size={13} /> Historial
                  </button>
                )}
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
                {v.estado === "en_ruta" && (
                  <button
                    onClick={() => setACerrar(v)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg transition-colors"
                    title="Cerrar el viaje si el motorista no pudo hacerlo"
                  >
                    <Flag size={13} /> Cerrar viaje
                  </button>
                )}
                {(v.estado === "finalizado" || v.estado === "en_ruta") && (
                  <button
                    onClick={() => setACorregir(v)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-400 px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    <Pencil size={13} /> Corregir
                  </button>
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
          activos={activos}
          onCerrar={() => setAAsignar(null)}
          onGuardado={(msg) => {
            setAAsignar(null);
            setVista("bandeja");
            setFiltro("asignado");
            setToast({ tipo: "success", msg });
          }}
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

      {/* Modal Cerrar viaje (override del jefe) */}
      {aCerrar && profile && (
        <ModalCerrarViaje
          viaje={aCerrar}
          onCerrar={() => setACerrar(null)}
          onGuardado={(msg) => { setACerrar(null); setToast({ tipo: "success", msg }); }}
          onError={() => setToast({ tipo: "error", msg: "No se pudo cerrar el viaje" })}
        />
      )}

      {/* Modal Corregir datos de ejecución */}
      {aCorregir && profile && (
        <ModalCorregir
          viaje={aCorregir}
          onCerrar={() => setACorregir(null)}
          onGuardado={(msg) => { setACorregir(null); setToast({ tipo: "success", msg }); }}
          onError={() => setToast({ tipo: "error", msg: "No se pudieron guardar las correcciones" })}
        />
      )}

      {/* Modal Historial */}
      {verHistorial && <ModalHistorial viaje={verHistorial} onCerrar={() => setVerHistorial(null)} />}

      {/* Modal Nuevo viaje (registro interno) */}
      {nuevoViaje && (
        <ModalNuevoViaje
          vehiculos={vehiculos.filter((x) => x.estado === "activo")}
          motoristas={motoristas}
          onCerrar={() => setNuevoViaje(false)}
          onGuardado={(msg, asignado) => {
            setNuevoViaje(false);
            setVista("bandeja");
            setFiltro(asignado ? "asignado" : "pendiente");
            setToast({ tipo: "success", msg });
          }}
          onError={() => setToast({ tipo: "error", msg: "No se pudo registrar el viaje" })}
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

// ── Cascarón común de modal ───────────────────────────────────────────────────
function Modal({
  titulo, subtitulo, folio, ancho = "sm:max-w-lg", onCerrar, children, pie,
}: {
  titulo: string;
  subtitulo?: string;
  folio?: string;
  ancho?: string;
  onCerrar: () => void;
  children: React.ReactNode;
  pie: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md">
      <div className={`bg-white dark:bg-slate-900 sm:border border-slate-200 dark:border-slate-800 sm:rounded-3xl w-full ${ancho} shadow-2xl overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[92vh]`}>
        <div className="shrink-0 flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="min-w-0">
            {folio && <p className="font-mono text-[11px] text-slate-500">{folio}</p>}
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate">{titulo}</h2>
            {subtitulo && <p className="text-xs text-slate-500 truncate">{subtitulo}</p>}
          </div>
          <button onClick={onCerrar} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4">{children}</div>
        <div className="shrink-0 flex gap-3 sm:justify-end px-4 sm:px-6 py-3.5 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50">
          {pie}
        </div>
      </div>
    </div>
  );
}

// ── Aviso de choque de agenda ─────────────────────────────────────────────────
function AvisoConflictos({ c }: { c: ConflictosAsignacion }) {
  if (!hayConflictos(c)) return null;
  const linea = (v: ViajeTransporte, texto: string) => (
    <li key={`${texto}-${v.folio}`}>
      <span className="font-mono text-[11px]">{v.folio}</span> · {texto} · {v.horaNecesita} · {v.destinoTexto}
    </li>
  );
  return (
    <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">Choque de agenda</p>
        <ul className="mt-1 space-y-0.5 text-xs">
          {c.vehiculoEnRuta && linea(c.vehiculoEnRuta, "el vehículo está EN RUTA")}
          {c.motoristaEnRuta && linea(c.motoristaEnRuta, "el motorista está EN RUTA")}
          {c.vehiculo.map((v) => linea(v, "mismo vehículo"))}
          {c.motorista.map((v) => linea(v, "mismo motorista"))}
        </ul>
        <p className="mt-1.5 text-xs">Puedes asignar de todos modos; quedará anotado en el historial del viaje.</p>
      </div>
    </div>
  );
}

// ── Modal de asignación ────────────────────────────────────────────────────────
function ModalAsignar({
  viaje, vehiculos, motoristas, activos, onCerrar, onGuardado, onError,
}: {
  viaje: ViajeTransporte;
  vehiculos: VehiculoTransporte[];
  motoristas: UserProfile[];
  activos: ViajeTransporte[];
  onCerrar: () => void;
  onGuardado: (msg: string) => void;
  onError: () => void;
}) {
  const { profile } = useAuth();
  const [vehiculoId, setVehiculoId] = useState(viaje.vehiculoId ?? "");
  const [motoristaId, setMotoristaId] = useState(viaje.motoristaId ?? "");
  const [esTraslado, setEsTraslado] = useState(viaje.esTraslado ?? false);
  const [guardando, setGuardando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);

  const conflictos = useMemo(
    () => detectarConflictos(viaje, vehiculoId, motoristaId, activos),
    [viaje, vehiculoId, motoristaId, activos],
  );
  const conChoque = hayConflictos(conflictos);

  // Al cambiar la selección se pierde la confirmación previa: hay que volver a
  // aceptar el choque de la NUEVA combinación.
  const elegirVehiculo = (id: string) => { setVehiculoId(id); setConfirmado(false); };
  const elegirMotorista = (id: string) => { setMotoristaId(id); setConfirmado(false); };

  const guardar = async () => {
    if (!profile || !vehiculoId || !motoristaId) return;
    const veh = vehiculos.find((x) => x.id === vehiculoId);
    const mot = motoristas.find((x) => x.uid === motoristaId);
    if (!veh || !mot) return;
    setGuardando(true);
    try {
      const detalle = `${veh.placa} · ${mot.nombre}${conChoque ? ` — con choque: ${resumirConflictos(conflictos)}` : ""}`;
      await updateDoc(doc(db, "viajes_transporte", viaje.folio), {
        estado: "asignado",
        vehiculoId,
        vehiculoNombre: `${veh.placa} · ${veh.nombre}`,
        motoristaId,
        motoristaNombre: mot.nombre,
        esTraslado,
        autorizadoPorId: profile.uid,
        autorizadoPorNombre: profile.nombre,
        historial: arrayUnion(eventoViaje("asignado", profile, detalle)),
        actualizadoEn: Timestamp.now(),
      });
      onGuardado(`${viaje.folio} asignado a ${mot.nombre}`);
    } catch {
      onError();
    } finally {
      setGuardando(false);
    }
  };

  const bloqueado = guardando || !vehiculoId || !motoristaId || (conChoque && !confirmado);

  return (
    <Modal
      folio={viaje.folio}
      titulo="Asignar viaje"
      subtitulo={`${viaje.destinoTexto} · ${fmtFecha(viaje.fechaNecesita)} ${viaje.horaNecesita}`}
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar} disabled={guardando} className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={bloqueado}
            className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50 rounded-xl transition-colors ${
              conChoque ? "bg-amber-600 hover:bg-amber-500" : "bg-blue-600 hover:bg-blue-500"
            }`}
          >
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {conChoque ? "Asignar de todos modos" : "Asignar"}
          </button>
        </>
      }
    >
      <div>
        <label className={labelCls}>Vehículo</label>
        <select value={vehiculoId} onChange={(e) => elegirVehiculo(e.target.value)} className={selectCls}>
          <option value="">— Selecciona vehículo</option>
          {vehiculos.map((x) => {
            const enRuta = activos.some((v) => v.vehiculoId === x.id && v.estado === "en_ruta");
            return (
              <option key={x.id} value={x.id}>
                {x.placa} · {x.nombre}{x.kmActual != null ? ` (km ${x.kmActual})` : ""}{enRuta ? " — EN RUTA" : ""}
              </option>
            );
          })}
        </select>
        {vehiculos.length === 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">No hay vehículos activos — regístralos en la pestaña Vehículos.</p>
        )}
      </div>
      <div>
        <label className={labelCls}>Motorista</label>
        <select value={motoristaId} onChange={(e) => elegirMotorista(e.target.value)} className={selectCls}>
          <option value="">— Selecciona motorista</option>
          {motoristas.map((m) => {
            const enRuta = activos.some((v) => v.motoristaId === m.uid && v.estado === "en_ruta");
            return <option key={m.uid} value={m.uid}>{m.nombre}{enRuta ? " — EN RUTA" : ""}</option>;
          })}
        </select>
        {motoristas.length === 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">No hay usuarios con rol Motorista — los crea el administrador en Usuarios.</p>
        )}
      </div>
      <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
        <input type="checkbox" checked={esTraslado} onChange={(e) => setEsTraslado(e.target.checked)} className="w-4 h-4 accent-blue-600" />
        Cuenta como traslado (PERC)
      </label>

      <AvisoConflictos c={conflictos} />
      {conChoque && (
        <label className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} className="mt-0.5 w-4 h-4 accent-amber-600" />
          Confirmo la asignación aunque haya choque de agenda.
        </label>
      )}
    </Modal>
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
    <Modal
      titulo="Rechazar solicitud"
      subtitulo={`${viaje.folio} · ${viaje.solicitanteNombre}`}
      ancho="sm:max-w-md"
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar} disabled={guardando} className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={async () => { setGuardando(true); try { await onConfirmar(motivo); } finally { setGuardando(false); } }}
            disabled={guardando || motivo.trim().length < 3}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 transition-colors disabled:opacity-50"
          >
            {guardando ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
            Rechazar
          </button>
        </>
      }
    >
      <div>
        <label className={labelCls}>Motivo del rechazo</label>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} autoFocus className={inputCls + " resize-y"} />
      </div>
    </Modal>
  );
}

// ── Modal: cerrar viaje que el motorista dejó abierto ─────────────────────────
function ModalCerrarViaje({
  viaje, onCerrar, onGuardado, onError,
}: {
  viaje: ViajeTransporte;
  onCerrar: () => void;
  onGuardado: (msg: string) => void;
  onError: () => void;
}) {
  const { profile } = useAuth();
  const [hora, setHora] = useState(viaje.horaEntrada ?? "");
  const [km, setKm] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const n = Number(km);
  const val = validarKmEntrada(n, viaje.kmSalida);
  const listo = km !== "" && !val.error && !!hora && motivo.trim().length >= 3;

  const guardar = async () => {
    if (!profile || !listo) return;
    setGuardando(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "viajes_transporte", viaje.folio), {
        estado: "finalizado",
        horaEntrada: hora,
        kmEntrada: n,
        kmRecorrido: viaje.kmSalida != null ? n - viaje.kmSalida : null,
        historial: arrayUnion(eventoViaje("cerrado_por_jefe", profile, `Entrada ${hora} · km ${n}. ${motivo.trim()}`)),
        actualizadoEn: Timestamp.now(),
      });
      if (viaje.vehiculoId) {
        batch.set(doc(db, "vehiculos_transporte", viaje.vehiculoId), {
          kmActual: n,
          actualizadoEn: Timestamp.now(),
        }, { merge: true });
      }
      await batch.commit();
      onGuardado(`Viaje ${viaje.folio} cerrado`);
    } catch {
      onError();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      folio={viaje.folio}
      titulo="Cerrar viaje"
      subtitulo={`${viaje.vehiculoNombre ?? ""} · ${viaje.motoristaNombre ?? ""}`}
      ancho="sm:max-w-md"
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar} disabled={guardando} className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando || !listo}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl transition-colors"
          >
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <Flag size={16} />}
            Cerrar viaje
          </button>
        </>
      }
    >
      <p className="text-xs text-slate-500">
        Úsalo solo cuando el motorista no pudo cerrar desde su teléfono. Queda registrado a tu nombre en el historial.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Hora de entrada</label>
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Odómetro (km)</label>
          <input type="number" min={viaje.kmSalida ?? 0} inputMode="numeric" value={km}
            onChange={(e) => setKm(e.target.value)} className={inputCls + " tabular-nums"} />
        </div>
      </div>
      {viaje.kmSalida != null && (
        <p className="text-[11px] text-slate-500">Salida: {viaje.horaSalida ?? "—"} · km {viaje.kmSalida.toLocaleString("es-SV")}</p>
      )}
      {km !== "" && val.error && <p className="text-[11px] text-rose-600 dark:text-rose-400">{val.error}</p>}
      {km !== "" && !val.error && val.aviso && <p className="text-[11px] text-amber-600 dark:text-amber-400">{val.aviso}</p>}
      {km !== "" && !val.error && viaje.kmSalida != null && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Recorrido: {n - viaje.kmSalida} km</p>
      )}
      <div>
        <label className={labelCls}>¿Por qué lo cierras tú?</label>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className={inputCls + " resize-y"}
          placeholder="Ej.: el motorista reportó los datos por teléfono" />
      </div>
    </Modal>
  );
}

// ── Modal: corregir horas y kilometraje ───────────────────────────────────────
function ModalCorregir({
  viaje, onCerrar, onGuardado, onError,
}: {
  viaje: ViajeTransporte;
  onCerrar: () => void;
  onGuardado: (msg: string) => void;
  onError: () => void;
}) {
  const { profile } = useAuth();
  const [horaSalida, setHoraSalida] = useState(viaje.horaSalida ?? "");
  const [kmSalida, setKmSalida] = useState(viaje.kmSalida != null ? String(viaje.kmSalida) : "");
  const [horaEntrada, setHoraEntrada] = useState(viaje.horaEntrada ?? "");
  const [kmEntrada, setKmEntrada] = useState(viaje.kmEntrada != null ? String(viaje.kmEntrada) : "");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const nSalida = kmSalida === "" ? undefined : Number(kmSalida);
  const nEntrada = kmEntrada === "" ? undefined : Number(kmEntrada);
  const errorOrden =
    nSalida != null && nEntrada != null && nEntrada < nSalida
      ? "El kilometraje de entrada no puede ser menor al de salida."
      : undefined;
  const listo = !errorOrden && motivo.trim().length >= 3;

  const guardar = async () => {
    if (!profile || !listo) return;
    setGuardando(true);
    try {
      const cambios: string[] = [];
      const apunta = (etiqueta: string, antes: unknown, ahora: unknown) => {
        if (String(antes ?? "—") !== String(ahora ?? "—")) cambios.push(`${etiqueta}: ${antes ?? "—"} → ${ahora ?? "—"}`);
      };
      apunta("hora salida", viaje.horaSalida, horaSalida || undefined);
      apunta("km salida", viaje.kmSalida, nSalida);
      apunta("hora entrada", viaje.horaEntrada, horaEntrada || undefined);
      apunta("km entrada", viaje.kmEntrada, nEntrada);
      if (cambios.length === 0) { onCerrar(); return; }

      const kmRecorrido = nSalida != null && nEntrada != null ? nEntrada - nSalida : null;

      // El odómetro del vehículo se lee fresco (el catálogo en memoria pudo
      // quedar viejo si hubo viajes después de abrir la pantalla).
      let kmVehiculo: number | undefined;
      if (viaje.vehiculoId) {
        try {
          const s = await getDoc(doc(db, "vehiculos_transporte", viaje.vehiculoId));
          kmVehiculo = s.exists() ? (s.data().kmActual as number | undefined) : undefined;
        } catch { /* si no se puede leer, no se toca el odómetro */ }
      }

      const batch = writeBatch(db);
      batch.update(doc(db, "viajes_transporte", viaje.folio), {
        horaSalida: horaSalida || null,
        kmSalida: nSalida ?? null,
        horaEntrada: horaEntrada || null,
        kmEntrada: nEntrada ?? null,
        kmRecorrido,
        historial: arrayUnion(eventoViaje("corregido", profile, `${cambios.join("; ")}. Motivo: ${motivo.trim()}`)),
        actualizadoEn: Timestamp.now(),
      });
      // El odómetro del vehículo se pone al día si la corrección lo deja más
      // alto, o si el valor que traía salió justamente de ESTE viaje (era el
      // último que lo movió, así que la corrección también aplica hacia abajo).
      const veniaDeEsteViaje =
        kmVehiculo != null && viaje.kmEntrada != null && kmVehiculo === viaje.kmEntrada;
      if (viaje.vehiculoId && nEntrada != null && (nEntrada > (kmVehiculo ?? 0) || veniaDeEsteViaje)) {
        batch.set(doc(db, "vehiculos_transporte", viaje.vehiculoId), {
          kmActual: nEntrada,
          actualizadoEn: Timestamp.now(),
        }, { merge: true });
      }
      await batch.commit();
      onGuardado(`Datos de ${viaje.folio} corregidos`);
    } catch {
      onError();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      folio={viaje.folio}
      titulo="Corregir datos del viaje"
      subtitulo={`${viaje.vehiculoNombre ?? ""} · ${viaje.motoristaNombre ?? ""}`}
      ancho="sm:max-w-md"
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar} disabled={guardando} className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando || !listo}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl transition-colors"
          >
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
            Guardar corrección
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Hora de salida</label>
          <input type="time" value={horaSalida} onChange={(e) => setHoraSalida(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Km de salida</label>
          <input type="number" min={0} inputMode="numeric" value={kmSalida} onChange={(e) => setKmSalida(e.target.value)} className={inputCls + " tabular-nums"} />
        </div>
        <div>
          <label className={labelCls}>Hora de entrada</label>
          <input type="time" value={horaEntrada} onChange={(e) => setHoraEntrada(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Km de entrada</label>
          <input type="number" min={0} inputMode="numeric" value={kmEntrada} onChange={(e) => setKmEntrada(e.target.value)} className={inputCls + " tabular-nums"} />
        </div>
      </div>
      {errorOrden && <p className="text-[11px] text-rose-600 dark:text-rose-400">{errorOrden}</p>}
      {!errorOrden && nSalida != null && nEntrada != null && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Recorrido: {nEntrada - nSalida} km</p>
      )}
      <div>
        <label className={labelCls}>Motivo de la corrección</label>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className={inputCls + " resize-y"}
          placeholder="Ej.: el motorista digitó 1069 en vez de 10069" />
      </div>
    </Modal>
  );
}

// ── Modal: historial de auditoría ─────────────────────────────────────────────
function ModalHistorial({ viaje, onCerrar }: { viaje: ViajeTransporte; onCerrar: () => void }) {
  const eventos = [...(viaje.historial ?? [])].sort((a, b) => fechaMs(a.en) - fechaMs(b.en));
  return (
    <Modal
      folio={viaje.folio}
      titulo="Historial del viaje"
      subtitulo={viaje.destinoTexto}
      ancho="sm:max-w-lg"
      onCerrar={onCerrar}
      pie={
        <button onClick={onCerrar} className="flex-1 sm:flex-none px-6 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
          Cerrar
        </button>
      }
    >
      {eventos.length === 0 ? (
        <p className="text-sm text-slate-500">Sin eventos registrados.</p>
      ) : (
        <ol className="space-y-3">
          {eventos.map((e, i) => (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center shrink-0">
                <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                {i < eventos.length - 1 && <span className="flex-1 w-px bg-slate-200 dark:bg-slate-700" />}
              </div>
              <div className="min-w-0 pb-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {ACCION_VIAJE_LABEL[e.accion] ?? e.accion}
                </p>
                <p className="text-xs text-slate-500">
                  {fmtFechaHora(e.en)} · {e.porNombre}
                </p>
                {e.detalle && <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 break-words">{e.detalle}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

// Los eventos vienen como Timestamp de Firestore o Date según de dónde se lean.
function fechaMs(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  const t = v as { toDate?: () => Date } | null;
  return t?.toDate ? t.toDate().getTime() : 0;
}

function fmtFechaHora(v: unknown): string {
  const ms = fechaMs(v);
  if (!ms) return "—";
  const d = new Date(ms);
  return `${`${d.getDate()}`.padStart(2, "0")}/${`${d.getMonth() + 1}`.padStart(2, "0")}/${d.getFullYear()} ${d.toTimeString().slice(0, 5)}`;
}

// ── Modal: nuevo viaje levantado por transporte ───────────────────────────────
function ModalNuevoViaje({
  vehiculos, motoristas, onCerrar, onGuardado, onError,
}: {
  vehiculos: VehiculoTransporte[];
  motoristas: UserProfile[];
  onCerrar: () => void;
  onGuardado: (msg: string, asignado: boolean) => void;
  onError: () => void;
}) {
  const { profile } = useAuth();
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [area, setArea] = useState("");
  const [mision, setMision] = useState("");
  const [personal, setPersonal] = useState("");
  const [destino, setDestino] = useState("");
  const [fecha, setFecha] = useState(hoyStr());
  const [hora, setHora] = useState("");
  const [vehiculoId, setVehiculoId] = useState("");
  const [motoristaId, setMotoristaId] = useState("");
  const [esTraslado, setEsTraslado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const faltantes = () => {
    const f: string[] = [];
    if (nombre.trim().length < 5) f.push("nombre del solicitante");
    if (!area) f.push("área solicitante");
    if (mision.trim().length < 5) f.push("misión");
    if (destino.trim().length < 3) f.push("destino");
    if (!fecha) f.push("fecha");
    if (!hora) f.push("hora");
    return f;
  };

  const guardar = async () => {
    if (!profile) return;
    const f = faltantes();
    if (f.length) { setError(`Completa: ${f.join(", ")}.`); return; }
    setError("");
    setGuardando(true);
    try {
      const folio = generarFolio();
      const datos: Record<string, unknown> = {
        folio,
        estado: "pendiente",
        solicitanteUid: profile.uid,
        solicitanteNombre: nombre.trim(),
        solicitanteDui: "",
        solicitanteCodigoEmpleado: "",
        telefono: telefono.trim() || undefined,
        area,
        mision: mision.trim(),
        personal: personal.trim() || undefined,
        destinoTexto: destino.trim(),
        fechaNecesita: fecha,
        horaNecesita: hora,
        origen: "interno",
        registradoPorNombre: profile.nombre,
        historial: [eventoViaje("creado", profile, "Registrado desde el tablero")],
        creadoEn: Timestamp.now(),
      };
      await setDoc(
        doc(db, "viajes_transporte", folio),
        Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== undefined)),
      );

      // Si ya viene con vehículo y motorista, se asigna de inmediato (segundo
      // write: el create solo acepta 'pendiente' por regla).
      const veh = vehiculos.find((x) => x.id === vehiculoId);
      const mot = motoristas.find((x) => x.uid === motoristaId);
      if (veh && mot) {
        await updateDoc(doc(db, "viajes_transporte", folio), {
          estado: "asignado",
          vehiculoId,
          vehiculoNombre: `${veh.placa} · ${veh.nombre}`,
          motoristaId,
          motoristaNombre: mot.nombre,
          esTraslado,
          autorizadoPorId: profile.uid,
          autorizadoPorNombre: profile.nombre,
          historial: arrayUnion(eventoViaje("asignado", profile, `${veh.placa} · ${mot.nombre}`)),
          actualizadoEn: Timestamp.now(),
        });
      }
      onGuardado(`Viaje ${folio} registrado`, !!(veh && mot));
    } catch {
      onError();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo="Nuevo viaje"
      subtitulo="Registro interno: misión que no entró por el formulario"
      ancho="sm:max-w-2xl"
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar} disabled={guardando} className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl transition-colors"
          >
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Registrar viaje
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Solicitante</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} placeholder="Nombre de quien pide el transporte" />
        </div>
        <div>
          <label className={labelCls}>Área / centro de costos</label>
          <select value={area} onChange={(e) => setArea(e.target.value)} className={selectCls}>
            <option value="">— Selecciona el área</option>
            {CENTROS_COSTOS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Teléfono o extensión <span className="text-slate-400 normal-case font-normal">(opcional)</span></label>
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inputCls} inputMode="tel" />
        </div>
        <div>
          <label className={labelCls}>Destino</label>
          <input value={destino} onChange={(e) => setDestino(e.target.value)} maxLength={300} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Misión</label>
          <textarea value={mision} onChange={(e) => setMision(e.target.value)} rows={2} maxLength={600} className={inputCls + " resize-y"} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Personal que participa <span className="text-slate-400 normal-case font-normal">(opcional)</span></label>
          <textarea value={personal} onChange={(e) => setPersonal(e.target.value)} rows={2} maxLength={400} className={inputCls + " resize-y"} />
        </div>
        <div>
          <label className={labelCls}>Fecha</label>
          <DateField value={fecha} onChange={setFecha} ariaLabel="Fecha del viaje" />
        </div>
        <div>
          <label className={labelCls}>Hora</label>
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2.5">Asignar ahora <span className="normal-case font-normal text-slate-400">(opcional)</span></p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <select value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)} className={selectCls}>
            <option value="">— Sin vehículo (queda pendiente)</option>
            {vehiculos.map((x) => <option key={x.id} value={x.id}>{x.placa} · {x.nombre}</option>)}
          </select>
          <select value={motoristaId} onChange={(e) => setMotoristaId(e.target.value)} className={selectCls}>
            <option value="">— Sin motorista</option>
            {motoristas.map((m) => <option key={m.uid} value={m.uid}>{m.nombre}</option>)}
          </select>
        </div>
        {vehiculoId && motoristaId && (
          <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer mt-3">
            <input type="checkbox" checked={esTraslado} onChange={(e) => setEsTraslado(e.target.checked)} className="w-4 h-4 accent-blue-600" />
            Cuenta como traslado (PERC)
          </label>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  );
}
