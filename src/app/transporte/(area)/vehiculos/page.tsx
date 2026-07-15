"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, onSnapshot, Timestamp, updateDoc } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { VehiculoTransporte } from "@/types";
import { TIPO_VEHICULO_LABEL, TIPOS_VEHICULO, type TipoVehiculo } from "@/lib/transporte/catalogos";
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plus, Truck, X } from "lucide-react";

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";
const selectCls =
  "w-full appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer";
const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";

const ESTADO_VEHICULO_LABEL: Record<VehiculoTransporte["estado"], string> = {
  activo: "Activo",
  taller: "En taller",
  baja: "De baja",
};
const ESTADO_VEHICULO_COLOR: Record<VehiculoTransporte["estado"], string> = {
  activo: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900",
  taller: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900",
  baja: "text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700",
};

export default function VehiculosPage() {
  const { profile } = useAuth();
  const [vehiculos, setVehiculos] = useState<VehiculoTransporte[]>([]);
  const [permissionError, setPermissionError] = useState(false);
  const [editando, setEditando] = useState<VehiculoTransporte | "nuevo" | null>(null);
  const [toast, setToast] = useState<{ tipo: "success" | "error"; msg: string } | null>(null);

  // Flota chica y acotada: escucharla completa es barato y mantiene el catálogo al día.
  useEffect(() => {
    return onSnapshot(collection(db, "vehiculos_transporte"), (s) => {
      setPermissionError(false);
      setVehiculos(s.docs.map((d) => ({ id: d.id, ...d.data() } as VehiculoTransporte)));
    }, (err) => { if (err.code === "permission-denied") setPermissionError(true); });
  }, []);

  const ordenados = useMemo(
    () => [...vehiculos].sort((a, b) => a.estado.localeCompare(b.estado) || a.placa.localeCompare(b.placa)),
    [vehiculos],
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const esJefe = profile?.role === "transporte" || profile?.role === "admin";

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1c1e4d] dark:text-[#c9a892] mb-1">
            <Truck size={13} /> Transporte
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Vehículos</h1>
        </div>
        {esJefe && (
          <button
            onClick={() => setEditando("nuevo")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors shadow-sm"
          >
            <Plus size={14} /> Agregar vehículo
          </button>
        )}
      </div>

      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer la flota. Pide al administrador que despliegue las reglas de <strong>vehiculos_transporte</strong>.
        </div>
      )}

      {/* Lista */}
      {ordenados.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Truck size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Aún no hay vehículos registrados.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
          {ordenados.map((v) => (
            <div key={v.id} className="px-4 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-bold text-slate-700 dark:text-slate-300">{v.placa}</span>
                  <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${ESTADO_VEHICULO_COLOR[v.estado]}`}>
                    {ESTADO_VEHICULO_LABEL[v.estado]}
                  </span>
                </div>
                <p className="font-semibold text-slate-800 dark:text-slate-200 truncate mt-0.5">{v.nombre}</p>
                <p className="text-xs text-slate-500">
                  {TIPO_VEHICULO_LABEL[v.tipo]} · {v.combustible === "diesel" ? "Diésel" : "Gasolina"}
                  {v.kmActual != null ? ` · Km ${v.kmActual}` : ""}
                </p>
              </div>
              {esJefe && (
                <button
                  onClick={() => setEditando(v)}
                  className="shrink-0 p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  aria-label={`Editar ${v.placa}`}
                >
                  <Pencil size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal crear/editar */}
      {editando && (
        <ModalVehiculo
          vehiculo={editando === "nuevo" ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardado={(msg) => { setEditando(null); setToast({ tipo: "success", msg }); }}
          onError={() => setToast({ tipo: "error", msg: "No se pudo guardar el vehículo" })}
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

// ── Modal de vehículo ──────────────────────────────────────────────────────────
function ModalVehiculo({
  vehiculo, onCerrar, onGuardado, onError,
}: {
  vehiculo: VehiculoTransporte | null;
  onCerrar: () => void;
  onGuardado: (msg: string) => void;
  onError: () => void;
}) {
  const [placa, setPlaca] = useState(vehiculo?.placa ?? "");
  const [nombre, setNombre] = useState(vehiculo?.nombre ?? "");
  const [tipo, setTipo] = useState<TipoVehiculo>(vehiculo?.tipo ?? "pickup");
  const [combustible, setCombustible] = useState<"diesel" | "gasolina">(vehiculo?.combustible ?? "diesel");
  const [km, setKm] = useState(vehiculo?.kmActual != null ? String(vehiculo.kmActual) : "");
  const [estado, setEstado] = useState<VehiculoTransporte["estado"]>(vehiculo?.estado ?? "activo");
  const [notas, setNotas] = useState(vehiculo?.notas ?? "");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!placa.trim() || !nombre.trim()) return;
    setGuardando(true);
    try {
      const datos: Record<string, unknown> = {
        placa: placa.trim().toUpperCase(),
        nombre: nombre.trim().toUpperCase(),
        tipo,
        combustible,
        kmActual: km ? Number(km) : null,
        estado,
        notas: notas.trim() || null,
        actualizadoEn: Timestamp.now(),
      };
      if (vehiculo?.id) {
        await updateDoc(doc(db, "vehiculos_transporte", vehiculo.id), datos);
        onGuardado(`${datos.placa} actualizado`);
      } else {
        await addDoc(collection(db, "vehiculos_transporte"), { ...datos, creadoEn: Timestamp.now() });
        onGuardado(`${datos.placa} agregado a la flota`);
      }
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
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {vehiculo ? `Editar ${vehiculo.placa}` : "Agregar vehículo"}
          </h2>
          <button onClick={onCerrar} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Placa / identificador</label>
            <input value={placa} onChange={(e) => setPlaca(e.target.value)} className={inputCls} placeholder="N-17895 / PODADORA" />
          </div>
          <div>
            <label className={labelCls}>Marca y modelo</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} placeholder="TOYOTA HILUX 2BLE CABINA" />
          </div>
          <div>
            <label className={labelCls}>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoVehiculo)} className={selectCls}>
              {TIPOS_VEHICULO.map((t) => <option key={t} value={t}>{TIPO_VEHICULO_LABEL[t]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Combustible</label>
            <select value={combustible} onChange={(e) => setCombustible(e.target.value as "diesel" | "gasolina")} className={selectCls}>
              <option value="diesel">Diésel</option>
              <option value="gasolina">Gasolina</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Kilometraje actual</label>
            <input type="number" min={0} inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Estado</label>
            <select value={estado} onChange={(e) => setEstado(e.target.value as VehiculoTransporte["estado"])} className={selectCls}>
              <option value="activo">Activo</option>
              <option value="taller">En taller</option>
              <option value="baja">De baja</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Notas</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={inputCls + " resize-y"} />
          </div>
        </div>

        <div className="shrink-0 flex gap-3 sm:justify-end px-4 sm:px-6 py-3.5 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50">
          <button onClick={onCerrar} disabled={guardando} className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando || !placa.trim() || !nombre.trim()}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl transition-colors"
          >
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
