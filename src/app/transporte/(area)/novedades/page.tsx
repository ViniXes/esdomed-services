"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection, doc, getDocs, limit, query, Timestamp, updateDoc, where,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { ChecklistVehiculo, VehiculoTransporte } from "@/types";
import { NIVELES_COMBUSTIBLE } from "@/lib/transporte/catalogos";
import { etiquetasItems, fmtFecha } from "@/lib/transporte/helpers";
import {
  AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, Truck, UserRound, Wrench, X,
} from "lucide-react";

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";
const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";

type Filtro = "pendientes" | "todas";

export default function NovedadesPage() {
  const { profile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (profile?.role === "motorista") router.replace("/transporte/mis-viajes");
  }, [profile?.role, router]);

  const [checklists, setChecklists] = useState<ChecklistVehiculo[]>([]);
  const [vehiculos, setVehiculos] = useState<VehiculoTransporte[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("pendientes");
  const [aAtender, setAAtender] = useState<ChecklistVehiculo | null>(null);
  const [toast, setToast] = useState<{ tipo: "success" | "error"; msg: string } | null>(null);

  // Solo filtros de igualdad: Firestore los resuelve sin índice compuesto.
  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [cs, vs] = await Promise.all([
        getDocs(query(collection(db, "checklists_vehiculo"), where("tieneFallas", "==", true), limit(100))),
        getDocs(collection(db, "vehiculos_transporte")),
      ]);
      setChecklists(cs.docs.map((d) => ({ id: d.id, ...d.data() } as ChecklistVehiculo)));
      setVehiculos(vs.docs.map((d) => ({ id: d.id, ...d.data() } as VehiculoTransporte)));
    } catch {
      setToast({ tipo: "error", msg: "No se pudieron cargar las novedades" });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [cargar]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const lista = useMemo(
    () => checklists
      .filter((c) => (filtro === "pendientes" ? !c.atendido : true))
      .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [checklists, filtro],
  );

  const enTaller = useMemo(() => vehiculos.filter((v) => v.estado === "taller"), [vehiculos]);

  const cambiarEstadoVehiculo = async (v: VehiculoTransporte, estado: VehiculoTransporte["estado"]) => {
    if (!v.id) return;
    try {
      await updateDoc(doc(db, "vehiculos_transporte", v.id), { estado, actualizadoEn: Timestamp.now() });
      setVehiculos((prev) => prev.map((x) => (x.id === v.id ? { ...x, estado } : x)));
      setToast({
        tipo: "success",
        msg: estado === "taller" ? `${v.placa} enviado a taller` : `${v.placa} de vuelta en servicio`,
      });
    } catch {
      setToast({ tipo: "error", msg: "No se pudo cambiar el estado del vehículo" });
    }
  };

  const atender = async (c: ChecklistVehiculo, nota: string) => {
    if (!profile || !c.id) return;
    await updateDoc(doc(db, "checklists_vehiculo", c.id), {
      atendido: true,
      atendidoPorId: profile.uid,
      atendidoPorNombre: profile.nombre,
      atendidoEn: Timestamp.now(),
      notaAtencion: nota.trim() || null,
    });
    setChecklists((prev) => prev.map((x) => (x.id === c.id
      ? { ...x, atendido: true, atendidoPorNombre: profile.nombre, notaAtencion: nota.trim() || undefined }
      : x)));
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1c1e4d] dark:text-[#c9a892] mb-1">
            <ClipboardCheck size={13} /> Transporte
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Novedades del checklist</h1>
          <p className="text-xs text-slate-500 mt-0.5">Fallas reportadas por los motoristas al revisar el vehículo.</p>
        </div>
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl">
          {(["pendientes", "todas"] as Filtro[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filtro === f ? "bg-white dark:bg-slate-900 shadow-sm text-blue-700 dark:text-blue-300" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {f === "pendientes" ? "Sin atender" : "Todas"}
            </button>
          ))}
        </div>
      </div>

      {/* Vehículos en taller */}
      {enTaller.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
          <p className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
            <Wrench size={13} /> En taller · {enTaller.length}
          </p>
          {enTaller.map((v) => (
            <div key={v.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
              <Truck size={15} className="text-amber-500 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300">
                <span className="font-mono font-semibold">{v.placa}</span> · {v.nombre}
              </span>
              <button
                onClick={() => cambiarEstadoVehiculo(v, "activo")}
                className="shrink-0 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 hover:border-emerald-400 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                Regresar a servicio
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lista de novedades */}
      {cargando ? (
        <div className="py-20 flex items-center justify-center gap-2 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin" /> Cargando novedades…
        </div>
      ) : lista.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <CheckCircle2 size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">
            {filtro === "pendientes" ? "Ningún checklist con fallas pendientes." : "Sin checklists con fallas registradas."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((c) => {
            const vehiculo = vehiculos.find((v) => v.id === c.vehiculoId);
            const fallas = etiquetasItems(c.itemsEnNo);
            return (
              <div
                key={c.id}
                className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 space-y-3 ${
                  c.atendido ? "border-slate-200 dark:border-slate-800" : "border-amber-300 dark:border-amber-900"
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      <Truck size={13} className="inline mr-1.5 text-slate-400" />{c.vehiculoNombre}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {fmtFecha(c.fecha)} · <UserRound size={11} className="inline text-slate-400" /> {c.motoristaNombre}
                      {c.kilometraje != null ? ` · km ${c.kilometraje.toLocaleString("es-SV")}` : ""}
                      {NIVELES_COMBUSTIBLE.includes(c.nivelCombustible) ? ` · combustible ${c.nivelCombustible}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                    c.atendido
                      ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900"
                      : "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900"
                  }`}>
                    {c.atendido ? "Atendida" : "Sin atender"}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {fallas.map((f) => (
                    <span key={f} className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 px-2 py-1 rounded-md">
                      <AlertTriangle size={11} /> {f}
                    </span>
                  ))}
                </div>

                {c.observaciones && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
                    {c.observaciones}
                  </p>
                )}

                {c.atendido && c.notaAtencion && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    Atendida por {c.atendidoPorNombre}: {c.notaAtencion}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {vehiculo && vehiculo.estado !== "taller" && (
                    <button
                      onClick={() => cambiarEstadoVehiculo(vehiculo, "taller")}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 hover:border-amber-400 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <Wrench size={13} /> Enviar a taller
                    </button>
                  )}
                  {vehiculo?.estado === "taller" && (
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Vehículo en taller</span>
                  )}
                  {!c.atendido && (
                    <button
                      onClick={() => setAAtender(c)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg transition-colors ml-auto"
                    >
                      <CheckCircle2 size={13} /> Marcar atendida
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal atender */}
      {aAtender && (
        <ModalAtender
          checklist={aAtender}
          onCerrar={() => setAAtender(null)}
          onConfirmar={async (nota) => {
            try {
              await atender(aAtender, nota);
              setToast({ tipo: "success", msg: "Novedad marcada como atendida" });
            } catch {
              setToast({ tipo: "error", msg: "No se pudo guardar. ¿Se desplegaron las reglas de checklists_vehiculo?" });
            } finally {
              setAAtender(null);
            }
          }}
        />
      )}

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

function ModalAtender({
  checklist, onCerrar, onConfirmar,
}: {
  checklist: ChecklistVehiculo;
  onCerrar: () => void;
  onConfirmar: (nota: string) => Promise<void>;
}) {
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Marcar novedad atendida</h3>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {checklist.vehiculoNombre} · {fmtFecha(checklist.fecha)}
              </p>
            </div>
            <button onClick={onCerrar} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors shrink-0">
              <X size={18} />
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Fallas: {etiquetasItems(checklist.itemsEnNo).join(", ")}
          </p>
          <div>
            <label className={labelCls}>¿Qué se hizo? <span className="text-slate-400 normal-case font-normal">(opcional)</span></label>
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} autoFocus className={inputCls + " resize-y"}
              placeholder="Ej.: se repuso el extintor el mismo día" />
          </div>
        </div>
        <div className="p-5 pt-0 flex gap-3">
          <button onClick={onCerrar} disabled={guardando} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={async () => { setGuardando(true); try { await onConfirmar(nota); } finally { setGuardando(false); } }}
            disabled={guardando}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-50"
          >
            {guardando ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            Marcar atendida
          </button>
        </div>
      </div>
    </div>
  );
}
