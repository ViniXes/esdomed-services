"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection, doc, getDoc, onSnapshot, query, setDoc, Timestamp, updateDoc, where, writeBatch,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { ChecklistVehiculo, ViajeTransporte } from "@/types";
import {
  CHECKLIST_ITEMS, ESTADO_VIAJE_COLOR, ESTADO_VIAJE_LABEL, NIVELES_COMBUSTIBLE, type NivelCombustible,
} from "@/lib/transporte/catalogos";
import {
  AlertTriangle, Bus, CheckCircle2, ClipboardCheck, Flag, Loader2, MapPin, Phone, Play, UserRound, X,
} from "lucide-react";

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";
const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";

const hoyStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};
const ahoraHHMM = () => new Date().toTimeString().slice(0, 5);
const fmtFecha = (f?: string) => {
  if (!f) return "—";
  const [y, m, d] = f.split("-");
  return y && m && d ? `${d}/${m}/${y}` : f;
};

export default function MisViajesPage() {
  const { profile } = useAuth();

  const [activos, setActivos] = useState<ViajeTransporte[]>([]);
  const [finalizadosHoy, setFinalizadosHoy] = useState<ViajeTransporte[]>([]);
  const [permissionError, setPermissionError] = useState(false);
  const [toast, setToast] = useState<{ tipo: "success" | "error"; msg: string } | null>(null);

  // Flujo de salida: primero el checklist del día (si falta), luego el kilometraje.
  const [viajeChecklist, setViajeChecklist] = useState<ViajeTransporte | null>(null);
  const [viajeSalida, setViajeSalida] = useState<ViajeTransporte | null>(null);
  const [viajeEntrada, setViajeEntrada] = useState<ViajeTransporte | null>(null);
  const [verificando, setVerificando] = useState<string | null>(null); // folio en verificación de checklist

  // Mis viajes activos (asignados / en ruta), en vivo.
  useEffect(() => {
    if (!profile) return;
    const q = query(
      collection(db, "viajes_transporte"),
      where("motoristaId", "==", profile.uid),
      where("estado", "in", ["asignado", "en_ruta"]),
    );
    return onSnapshot(q, (s) => {
      setPermissionError(false);
      setActivos(s.docs.map((d) => ({ id: d.id, ...d.data() } as ViajeTransporte)));
    }, (err) => { if (err.code === "permission-denied") setPermissionError(true); });
  }, [profile]);

  // Lo que ya cerré hoy (constancia del turno).
  useEffect(() => {
    if (!profile) return;
    const q = query(
      collection(db, "viajes_transporte"),
      where("motoristaId", "==", profile.uid),
      where("estado", "==", "finalizado"),
      where("fechaNecesita", "==", hoyStr()),
    );
    return onSnapshot(q, (s) => {
      setFinalizadosHoy(s.docs.map((d) => ({ id: d.id, ...d.data() } as ViajeTransporte)));
    }, () => { /* opcional */ });
  }, [profile]);

  const ordenados = useMemo(
    () => [...activos].sort((a, b) =>
      a.fechaNecesita.localeCompare(b.fechaNecesita) || a.horaNecesita.localeCompare(b.horaNecesita)),
    [activos],
  );

  // Iniciar ruta: el checklist del día por vehículo es requisito. Si ya existe
  // (docId determinístico vehículo+fecha+motorista), pasa directo al kilometraje.
  const iniciarRuta = async (v: ViajeTransporte) => {
    if (!profile || !v.vehiculoId) return;
    setVerificando(v.folio);
    try {
      const id = `${v.vehiculoId}_${hoyStr()}_${profile.uid}`;
      const snap = await getDoc(doc(db, "checklists_vehiculo", id));
      if (snap.exists()) setViajeSalida(v);
      else setViajeChecklist(v);
    } catch {
      setToast({ tipo: "error", msg: "No se pudo verificar el checklist" });
    } finally {
      setVerificando(null);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1c1e4d] dark:text-[#c9a892] mb-1">
          <Bus size={13} /> Transporte
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Mis viajes</h1>
      </div>

      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer tus viajes. Pide al administrador que despliegue las reglas de <strong>viajes_transporte</strong>.
        </div>
      )}

      {/* Activos */}
      {ordenados.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Bus size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No tienes viajes asignados.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ordenados.map((v) => (
            <div key={v.folio} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[11px] text-slate-500">{v.folio}</span>
                <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${ESTADO_VIAJE_COLOR[v.estado]}`}>
                  {ESTADO_VIAJE_LABEL[v.estado]}
                </span>
                <span className="ml-auto text-sm font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                  {fmtFecha(v.fechaNecesita)} · {v.horaNecesita}
                </span>
              </div>
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  <MapPin size={13} className="inline mr-1 text-slate-400" />{v.destinoTexto}
                </p>
                <p className="text-sm text-slate-500 mt-0.5">{v.mision}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {v.area} · <UserRound size={11} className="inline text-slate-400" /> {v.solicitanteNombre}
                  {v.telefono ? <> · <Phone size={11} className="inline text-slate-400" /> {v.telefono}</> : null}
                </p>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-1">
                  <Bus size={12} className="inline mr-1 text-slate-400" />{v.vehiculoNombre}
                </p>
                {v.estado === "en_ruta" && (
                  <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">
                    Salida {v.horaSalida} · Km {v.kmSalida}
                  </p>
                )}
              </div>
              {v.estado === "asignado" ? (
                <button
                  onClick={() => iniciarRuta(v)}
                  disabled={verificando === v.folio}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl transition-colors"
                >
                  {verificando === v.folio ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                  Iniciar ruta
                </button>
              ) : (
                <button
                  onClick={() => setViajeEntrada(v)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors"
                >
                  <Flag size={16} /> Finalizar viaje
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Finalizados hoy */}
      {finalizadosHoy.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
          <p className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500">Finalizados hoy · {finalizadosHoy.length}</p>
          {finalizadosHoy.map((v) => (
            <div key={v.folio} className="px-4 py-2.5 flex items-center gap-3 text-sm">
              <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300">{v.destinoTexto}</span>
              <span className="text-xs text-slate-500 tabular-nums shrink-0">{v.horaSalida}–{v.horaEntrada} · {v.kmRecorrido ?? 0} km</span>
            </div>
          ))}
        </div>
      )}

      {/* Modal: checklist del día */}
      {viajeChecklist && profile && (
        <ModalChecklist
          viaje={viajeChecklist}
          motoristaId={profile.uid}
          motoristaNombre={profile.nombre}
          onCerrar={() => setViajeChecklist(null)}
          onListo={() => {
            const v = viajeChecklist;
            setViajeChecklist(null);
            setViajeSalida(v);
            setToast({ tipo: "success", msg: "Checklist del día guardado" });
          }}
          onError={() => setToast({ tipo: "error", msg: "No se pudo guardar el checklist" })}
        />
      )}

      {/* Modal: kilometraje de salida */}
      {viajeSalida && (
        <ModalKm
          titulo="Salida"
          viaje={viajeSalida}
          onCerrar={() => setViajeSalida(null)}
          onConfirmar={async (km) => {
            try {
              await updateDoc(doc(db, "viajes_transporte", viajeSalida.folio), {
                estado: "en_ruta",
                horaSalida: ahoraHHMM(),
                kmSalida: km,
                actualizadoEn: Timestamp.now(),
              });
              setToast({ tipo: "success", msg: "Ruta iniciada — buen viaje" });
            } catch {
              setToast({ tipo: "error", msg: "No se pudo iniciar la ruta" });
            } finally {
              setViajeSalida(null);
            }
          }}
        />
      )}

      {/* Modal: kilometraje de entrada */}
      {viajeEntrada && (
        <ModalKm
          titulo="Entrada"
          viaje={viajeEntrada}
          minimo={viajeEntrada.kmSalida}
          onCerrar={() => setViajeEntrada(null)}
          onConfirmar={async (km) => {
            const v = viajeEntrada;
            try {
              const batch = writeBatch(db);
              batch.update(doc(db, "viajes_transporte", v.folio), {
                estado: "finalizado",
                horaEntrada: ahoraHHMM(),
                kmEntrada: km,
                kmRecorrido: v.kmSalida != null ? km - v.kmSalida : null,
                actualizadoEn: Timestamp.now(),
              });
              // El odómetro del vehículo queda al día (prellena el próximo viaje).
              if (v.vehiculoId) {
                batch.set(doc(db, "vehiculos_transporte", v.vehiculoId), {
                  kmActual: km,
                  actualizadoEn: Timestamp.now(),
                }, { merge: true });
              }
              await batch.commit();
              setToast({ tipo: "success", msg: `Viaje finalizado · ${v.kmSalida != null ? km - v.kmSalida : 0} km` });
            } catch {
              setToast({ tipo: "error", msg: "No se pudo finalizar el viaje" });
            } finally {
              setViajeEntrada(null);
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

// ── Modal: checklist del vehículo (formato STO1/06-HNES-F) ────────────────────
function ModalChecklist({
  viaje, motoristaId, motoristaNombre, onCerrar, onListo, onError,
}: {
  viaje: ViajeTransporte;
  motoristaId: string;
  motoristaNombre: string;
  onCerrar: () => void;
  onListo: () => void;
  onError: () => void;
}) {
  const [items, setItems] = useState<Record<string, boolean>>(
    () => Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i.id, true])),
  );
  const [nivel, setNivel] = useState<NivelCombustible>("1/2");
  const [km, setKm] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [guardando, setGuardando] = useState(false);

  const conFallas = CHECKLIST_ITEMS.filter((i) => !items[i.id]);

  const guardar = async () => {
    if (!viaje.vehiculoId) return;
    setGuardando(true);
    try {
      const datos: Omit<ChecklistVehiculo, "id"> = {
        vehiculoId: viaje.vehiculoId,
        vehiculoNombre: viaje.vehiculoNombre ?? "",
        fecha: hoyStr(),
        motoristaId,
        motoristaNombre,
        items,
        nivelCombustible: nivel,
        kilometraje: km ? Number(km) : undefined,
        observaciones: observaciones.trim() || undefined,
        creadoEn: Timestamp.now() as unknown as Date,
      };
      const payload = Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== undefined));
      await setDoc(doc(db, "checklists_vehiculo", `${viaje.vehiculoId}_${hoyStr()}_${motoristaId}`), payload);
      onListo();
    } catch {
      onError();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md">
      <div className="bg-white dark:bg-slate-900 sm:border border-slate-200 dark:border-slate-800 sm:rounded-3xl w-full sm:max-w-2xl shadow-2xl overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[92vh]">
        <div className="shrink-0 flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <ClipboardCheck size={12} /> Check list del día
            </p>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate">{viaje.vehiculoNombre}</h2>
          </div>
          <button onClick={onCerrar} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4">
          {/* Ítems Sí/No */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            {CHECKLIST_ITEMS.map((i) => {
              const ok = items[i.id];
              return (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setItems((prev) => ({ ...prev, [i.id]: !prev[i.id] }))}
                  className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-left"
                >
                  <span className={`text-sm ${ok ? "text-slate-700 dark:text-slate-300" : "text-rose-600 dark:text-rose-400 font-semibold"}`}>{i.label}</span>
                  <span className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-md border ${
                    ok
                      ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900"
                      : "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-900"
                  }`}>
                    {ok ? "SÍ" : "NO"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Combustible + km */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Nivel de combustible</label>
              <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl">
                {NIVELES_COMBUSTIBLE.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNivel(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                      nivel === n ? "bg-white dark:bg-slate-900 shadow-sm text-blue-700 dark:text-blue-300" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Kilometraje</label>
              <input type="number" min={0} inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Observaciones o sugerencias</label>
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} className={inputCls + " resize-y"} />
          </div>

          {conFallas.length > 0 && (
            <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{conFallas.length} ítem{conFallas.length === 1 ? "" : "s"} en NO: {conFallas.map((i) => i.label).join(", ")}.</span>
            </div>
          )}
        </div>

        <div className="shrink-0 flex gap-3 sm:justify-end px-4 sm:px-6 py-3.5 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50">
          <button onClick={onCerrar} disabled={guardando} className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl transition-colors"
          >
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}
            Guardar y continuar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: kilometraje (salida / entrada) ─────────────────────────────────────
function ModalKm({
  titulo, viaje, minimo, onCerrar, onConfirmar,
}: {
  titulo: "Salida" | "Entrada";
  viaje: ViajeTransporte;
  minimo?: number;
  onCerrar: () => void;
  onConfirmar: (km: number) => Promise<void>;
}) {
  const [km, setKm] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cargandoPrefill, setCargandoPrefill] = useState(() => titulo === "Salida" && !!viaje.vehiculoId);

  // El odómetro actual del vehículo prellena el km de salida (consistencia:
  // el cierre del viaje anterior dejó el vehículo al día).
  useEffect(() => {
    if (titulo !== "Salida" || !viaje.vehiculoId) return;
    const t = setTimeout(async () => {
      try {
        const snap = await getDoc(doc(db, "vehiculos_transporte", viaje.vehiculoId!));
        const kmActual = snap.exists() ? (snap.data().kmActual as number | undefined) : undefined;
        if (kmActual != null) setKm(String(kmActual));
      } catch { /* prellenado opcional */ } finally {
        setCargandoPrefill(false);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [titulo, viaje.vehiculoId]);

  const n = Number(km);
  const valido = km !== "" && Number.isFinite(n) && n >= 0 && (minimo == null || n >= minimo);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Kilometraje de {titulo.toLowerCase()}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{viaje.vehiculoNombre}</p>
            </div>
            <button onClick={onCerrar} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors shrink-0">
              <X size={18} />
            </button>
          </div>
          <div>
            <label className={labelCls}>Odómetro (km)</label>
            <input
              type="number"
              min={minimo ?? 0}
              inputMode="numeric"
              value={km}
              onChange={(e) => setKm(e.target.value)}
              autoFocus
              disabled={cargandoPrefill}
              className={inputCls + " text-lg font-bold tabular-nums"}
            />
            {minimo != null && km !== "" && n < minimo && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1.5">Debe ser mayor o igual al km de salida ({minimo}).</p>
            )}
            {minimo != null && valido && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1.5">Recorrido: {n - minimo} km</p>
            )}
          </div>
        </div>
        <div className="p-5 pt-0 flex gap-3">
          <button onClick={onCerrar} disabled={guardando} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={async () => { setGuardando(true); try { await onConfirmar(n); } finally { setGuardando(false); } }}
            disabled={guardando || !valido}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {guardando ? <Loader2 size={15} className="animate-spin" /> : titulo === "Salida" ? <Play size={15} /> : <Flag size={15} />}
            {titulo === "Salida" ? "Iniciar ruta" : "Finalizar"}
          </button>
        </div>
      </div>
    </div>
  );
}
