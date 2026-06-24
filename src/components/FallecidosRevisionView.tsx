"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { NotificacionFallecido } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { HeartPulse, X, CheckCircle2, Clock } from "lucide-react";

/**
 * Vista de revisión de notificaciones de fallecidos para personal que solo
 * confirma "visto" (Psicología / Trabajo Social). Comparte los campos
 * recibeDePs / recibeDePsEn definidos en NotificacionFallecido.
 */
export default function FallecidosRevisionView({
  rol = "psicologia",
}: {
  rol?: "psicologia" | "trabajo_social";
}) {
  const areaLabel = rol === "trabajo_social" ? "Trabajo Social" : "Psicología";
  const reglaLabel = rol === "trabajo_social" ? "trabajo_social" : "psicologia";

  const { profile } = useAuth();
  const [notificaciones, setNotificaciones] = useState<NotificacionFallecido[]>([]);
  const [filtro, setFiltro] = useState<"pendiente" | "confirmado" | "todos">("todos");
  const [selected, setSelected] = useState<NotificacionFallecido | null>(null);
  const [savingVisto, setSavingVisto] = useState(false);
  const [permissionError, setPermissionError] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "notificaciones_fallecidos"), orderBy("creadoEn", "desc"));
    return onSnapshot(
      q,
      s => {
        setPermissionError(false);
        setNotificaciones(s.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionFallecido)));
      },
      err => {
        if (err.code === "permission-denied") setPermissionError(true);
      }
    );
  }, []);

  const filtered = filtro === "todos" ? notificaciones : notificaciones.filter(n => n.estado === filtro);
  const pendientes = notificaciones.filter(n => n.estado === "pendiente").length;
  const selectedLive = selected ? notificaciones.find(n => n.id === selected.id) ?? selected : null;

  const confirmarVisto = async () => {
    if (!selectedLive?.id || !profile) return;
    setSavingVisto(true);
    await updateDoc(doc(db, "notificaciones_fallecidos", selectedLive.id), {
      recibeDePs:   profile.nombre,
      recibeDePsEn: Timestamp.now(),
    });
    setSavingVisto(false);
  };

  const formatHora = (ts: unknown) => {
    if (!ts) return null;
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleString("es-HN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  };

  // Fecha + hora completas (hora de fallecimiento que indicó el médico).
  const formatFechaHora = (ts: unknown) => {
    if (!ts) return "—";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleString("es-HN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-rose-50 dark:bg-rose-950 rounded-xl flex items-center justify-center border border-rose-200 dark:border-rose-900">
            <HeartPulse size={17} className="text-rose-600 dark:text-rose-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
            Notificaciones de fallecidos
          </h1>
        </div>
        {pendientes > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-3 py-1.5 rounded-xl">
            <Clock size={14} />
            {pendientes} sin confirmar
          </div>
        )}
      </div>

      {/* Error de permisos */}
      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer notificaciones. Pide al administrador que agregue <strong>{reglaLabel}</strong> a las reglas de Firestore.
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { label: "Todos",       value: "todos"      },
          { label: "Pendientes",  value: "pendiente"  },
          { label: "Confirmados", value: "confirmado" },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFiltro(f.value as typeof filtro)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filtro === f.value
                ? "bg-blue-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-sm text-slate-500">{filtered.length} registros</span>
      </div>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500 py-10 text-center">Sin notificaciones en este filtro.</p>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Paciente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Servicio / Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Médico</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{areaLabel}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map(n => (
                  <tr key={n.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 dark:text-slate-100 font-mono text-sm">{n.pacienteExpediente}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{n.pacienteNombre}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700 dark:text-slate-300">{n.servicio} · Cama {n.cama}</p>
                      <p className="text-xs text-slate-500 mt-0.5">† {formatFechaHora(n.fechaDefuncion)}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                      Dr. {n.medicoNombre}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <Badge estado={n.estado} />
                        {n.estado === "confirmado" && n.confirmadoPorNombre && (
                          <span className="text-[11px] text-slate-500">por {n.confirmadoPorNombre}</span>
                        )}
                        {n.estado === "confirmado" && <DuiBadge ok={!!n.duiValidado} />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {n.recibeDePs ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <CheckCircle2 size={13} /> Visto
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Pendiente</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelected(n)}
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 transition-colors whitespace-nowrap"
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de detalle */}
      {selectedLive && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-[95vw] max-w-lg max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 flex-shrink-0">
              <div>
                <p className="text-xs text-slate-500 font-medium mb-0.5">Expediente</p>
                <h2 className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                  {selectedLive.pacienteExpediente}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedLive.pacienteNombre} · {selectedLive.servicio} · Cama {selectedLive.cama}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge estado={selectedLive.estado} />
                <button
                  onClick={() => setSelected(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-5">

              {/* Datos del caso */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Datos del caso</p>
                <InfoCell label="Fecha y hora de defunción"  value={formatFechaHora(selectedLive.fechaDefuncion)} />
                <InfoCell label="Notificado por"   value={`Dr. ${selectedLive.medicoNombre}`} />
                <InfoCell label="Servicio"         value={selectedLive.servicio} />
                {selectedLive.causaMuerte && <InfoCell label="Causa" value={selectedLive.causaMuerte} />}
                {selectedLive.estado === "confirmado" && (
                  <InfoCell label="DUI validado (ESDOMED)" value={selectedLive.duiValidado ? "Sí — DUI ok" : "No — Sin DUI"} />
                )}
              </div>

              {/* Confirmación del área */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{areaLabel}</p>
                {selectedLive.recibeDePs ? (
                  <p className="flex items-start gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10 px-3 py-2.5 rounded-lg">
                    <CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" />
                    <span>
                      Confirmado por <span className="font-semibold">{selectedLive.recibeDePs}</span>
                      {selectedLive.recibeDePsEn && (
                        <><br /><span className="text-xs opacity-75">{formatHora(selectedLive.recibeDePsEn)}</span></>
                      )}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">Aún no confirmado por {areaLabel}.</p>
                )}
              </div>
            </div>

            {/* Footer: confirmar visto */}
            {!selectedLive.recibeDePs && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
                <button
                  onClick={confirmarVisto}
                  disabled={savingVisto}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-500 disabled:opacity-50 transition-colors"
                >
                  {savingVisto ? "Confirmando..." : `Confirmar visto por ${areaLabel}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DuiBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
      DUI ok
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
      Sin DUI
    </span>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-slate-800 dark:text-slate-200 font-medium mt-0.5">{value}</p>
    </div>
  );
}
