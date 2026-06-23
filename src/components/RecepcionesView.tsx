"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { NotificacionFallecido } from "@/types";
import { Inbox, CheckCircle2, Clock } from "lucide-react";

export default function RecepcionesView() {
  const { profile } = useAuth();
  const [registros, setRegistros] = useState<NotificacionFallecido[]>([]);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const q = query(
      collection(db, "notificaciones_fallecidos"),
      where("recibeDePsUid", "==", profile.uid)
    );
    return onSnapshot(
      q,
      s => {
        setPermissionError(false);
        const docs = s.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionFallecido));
        docs.sort((a, b) => {
          const at = (a.creadoEn as { toDate?: () => Date }).toDate?.()?.getTime() ?? 0;
          const bt = (b.creadoEn as { toDate?: () => Date }).toDate?.()?.getTime() ?? 0;
          return bt - at;
        });
        setRegistros(docs);
      },
      err => { if (err.code === "permission-denied") setPermissionError(true); }
    );
  }, [profile]);

  const confirmar = async (id: string) => {
    setConfirmando(id);
    await updateDoc(doc(db, "notificaciones_fallecidos", id), {
      recibeDePsConfirmado: true,
      recibeDePsConfirmadoEn: Timestamp.now(),
    });
    setConfirmando(null);
  };

  const formatFecha = (ts: unknown) => {
    if (!ts) return "—";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const pendientes   = registros.filter(r => !r.recibeDePsConfirmado);
  const confirmados  = registros.filter(r => r.recibeDePsConfirmado);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-teal-50 dark:bg-teal-950 rounded-xl flex items-center justify-center border border-teal-200 dark:border-teal-900">
          <Inbox size={17} className="text-teal-600 dark:text-teal-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Recepciones</h1>
          <p className="text-xs text-slate-500 mt-0.5">Certificados que ESDOMED reporta como entregados a ti</p>
        </div>
        {pendientes.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-3 py-1.5 rounded-xl">
            <Clock size={14} />
            {pendientes.length} pendiente{pendientes.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer recepciones. Pide al administrador que actualice las reglas de Firestore.
        </div>
      )}

      {/* Pendientes */}
      {pendientes.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Por confirmar</p>
          {pendientes.map(r => (
            <div key={r.id}
              className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900 dark:text-slate-100 font-mono text-base">{r.pacienteExpediente}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{r.pacienteNombre}</p>
                  <p className="text-xs text-slate-500 mt-1">{r.servicio} · Cama {r.cama} · {formatFecha(r.fechaDefuncion)}</p>
                  {r.recibeDePsEntregadoPor && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                      Entregado por <span className="font-medium">{r.recibeDePsEntregadoPor}</span> (ESDOMED)
                    </p>
                  )}
                </div>
                <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-2 py-1 rounded-lg">
                  <Clock size={11} /> Pendiente
                </span>
              </div>
              <button
                onClick={() => confirmar(r.id!)}
                disabled={confirmando === r.id}
                className="w-full py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-500 rounded-xl disabled:opacity-50 transition-colors"
              >
                {confirmando === r.id ? "Confirmando..." : "Confirmar recepción del certificado"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Confirmados */}
      {confirmados.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Confirmados</p>
          {confirmados.map(r => (
            <div key={r.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100 font-mono text-sm">{r.pacienteExpediente}</p>
                <p className="text-xs text-slate-500 mt-0.5">{r.pacienteNombre} · {r.servicio}</p>
                {r.recibeDePsEntregadoPor && (
                  <p className="text-xs text-slate-500 mt-0.5">Entregado por {r.recibeDePsEntregadoPor} (ESDOMED)</p>
                )}
              </div>
              <span className="flex-shrink-0 flex items-center gap-1 text-[11px] font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-900 px-2 py-1 rounded-lg">
                <CheckCircle2 size={11} /> Confirmado
              </span>
            </div>
          ))}
        </div>
      )}

      {registros.length === 0 && !permissionError && (
        <div className="text-center py-16 text-slate-400">
          <Inbox size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No tienes recepciones asignadas.</p>
        </div>
      )}
    </div>
  );
}
