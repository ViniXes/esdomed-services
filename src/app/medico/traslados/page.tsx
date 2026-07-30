"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp } from "@/lib/firestoreMeter";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { DateField } from "@/components/ui/DateField";
import { useAuth } from "@/contexts/AuthContext";
import { useServicios } from "@/contexts/ServiciosContext";
import { SolicitudTraslado } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { ArrowRightLeft, Plus, Building2, RefreshCw, Search, X, Pencil, Send, MessageSquare, AlertCircle, Clock3, FileText } from "lucide-react";

const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function MedicoTrasladosPage() {
  const { user } = useAuth();
  const { servicios, getCamas } = useServicios();
  const [traslados, setTraslados] = useState<SolicitudTraslado[]>([]);
  const [busquedaExpediente, setBusquedaExpediente] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  // Edición / respuesta a una observación de ESDOMED (solo estado en_revision)
  const [editando, setEditando] = useState<SolicitudTraslado | null>(null);
  const [editForm, setEditForm] = useState({ servicioDestino: "", camaDestino: "", motivoTraslado: "", respuestaMedico: "" });
  const [guardando, setGuardando] = useState(false);
  const [errEdit, setErrEdit] = useState<string | null>(null);

  const abrirEdicion = (t: SolicitudTraslado) => {
    setEditando(t);
    setErrEdit(null);
    setEditForm({
      servicioDestino: t.servicioDestino ?? "",
      camaDestino: t.camaDestino ?? "",
      motivoTraslado: t.motivoTraslado ?? "",
      respuestaMedico: t.respuestaMedico ?? "",
    });
  };

  const reenviar = async () => {
    if (!editando?.id) return;
    const tipo = editando.tipoTraslado;
    if (!editForm.motivoTraslado.trim()) { setErrEdit("El motivo del traslado es obligatorio."); return; }
    if (tipo === "servicio_cama" && (!editForm.servicioDestino || !editForm.camaDestino)) {
      setErrEdit("Selecciona servicio y cama de destino."); return;
    }
    if (tipo === "interno" && !editForm.camaDestino) {
      setErrEdit("Selecciona la cama de destino."); return;
    }
    setGuardando(true);
    setErrEdit(null);
    try {
      const update: Record<string, unknown> = {
        motivoTraslado: editForm.motivoTraslado.trim(),
        respuestaMedico: editForm.respuestaMedico.trim() || null,
        estado: "pendiente",
        actualizadoEn: Timestamp.now(),
      };
      if (tipo === "servicio_cama") {
        update.servicioDestino = editForm.servicioDestino;
        update.camaDestino = editForm.camaDestino;
      } else if (tipo === "interno") {
        update.camaDestino = editForm.camaDestino;
      }
      await updateDoc(doc(db, "traslados", editando.id), update);
      setEditando(null);
    } catch (e) {
      setErrEdit(`No se pudo reenviar: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setGuardando(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "traslados"), where("medicoId", "==", user.uid));
    return onSnapshot(q, s => {
      const docs = s.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudTraslado));
      docs.sort((a, b) => {
        const at = (a.creadoEn as { toDate?: () => Date }).toDate?.()?.getTime() ?? 0;
        const bt = (b.creadoEn as { toDate?: () => Date }).toDate?.()?.getTime() ?? 0;
        return bt - at;
      });
      setTraslados(docs);
    });
  }, [user]);

  const formatFecha = (ts: unknown) => {
    if (!ts) return "—";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleString("es-HN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  };

  const getTipoLabel = (tipo?: string) => {
    if (tipo === "servicio_cama") return { label: "Servicio a Servicio", color: "text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 border-blue-200 dark:border-blue-800", icon: Building2 };
    if (tipo === "interno") return { label: "Interno", color: "text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/50 border-purple-200 dark:border-purple-800", icon: ArrowRightLeft };
    if (tipo === "intercambio") return { label: "Intercambio", color: "text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/50 border-orange-200 dark:border-orange-800", icon: RefreshCw };
    return { label: "Traslado", color: "text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700", icon: ArrowRightLeft };
  };

  const displayList = traslados.filter(t => {
    if (busquedaExpediente) {
      const q = busquedaExpediente.toLowerCase();
      if (!(t.pacienteExpediente?.toLowerCase() ?? "").includes(q) &&
          !(t.pacienteBExpediente?.toLowerCase() ?? "").includes(q)) return false;
    }
    if (fechaDesde || fechaHasta) {
      const d = ((t.creadoEn as unknown) as { toDate?: () => Date }).toDate?.() ?? t.creadoEn;
      if (fechaDesde && d < new Date(fechaDesde + "T00:00:00")) return false;
      if (fechaHasta && d > new Date(fechaHasta + "T23:59:59")) return false;
    }
    return true;
  });

  const pendientes = traslados.filter(t => t.estado === "pendiente").length;
  const enRevision = traslados.filter(t => t.estado === "en_revision").length;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#075d70] via-cyan-700 to-blue-700 px-5 py-5 shadow-lg shadow-cyan-950/15 md:px-7 md:py-6">
        <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full border border-white/10" />
        <div className="absolute bottom-[-5.5rem] right-16 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
              <ArrowRightLeft size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white md:text-2xl font-heading">Centro de traslados de cama</h1>
              <p className="mt-1 max-w-xl text-sm text-cyan-50/90">Cree solicitudes, revise los movimientos clínicos y responda las observaciones de ESDOMED.</p>
            </div>
          </div>
          <Link prefetch={false} href="/medico/traslados/nueva"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-cyan-800 shadow-sm transition-colors hover:bg-cyan-50">
            <Plus size={16} /> Nueva solicitud
          </Link>
        </div>
      </section>

      <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 md:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Seguimiento de movimientos</p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">Mis solicitudes</h2>
            <p className="mt-0.5 text-xs text-slate-500">Identifique rápidamente los traslados que requieren seguimiento.</p>
          </div>
          <span className="text-xs font-medium text-slate-500">{displayList.length} {displayList.length === 1 ? "resultado" : "resultados"}</span>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-cyan-100 bg-cyan-50/70 px-3 py-2.5 dark:border-cyan-900/60 dark:bg-cyan-950/25">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-600 text-white"><FileText size={16} /></span>
            <div><p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{traslados.length}</p><p className="mt-1 text-[11px] font-medium text-slate-500">Enviadas</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5 dark:border-amber-900/60 dark:bg-amber-950/25">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white"><Clock3 size={16} /></span>
            <div><p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{pendientes}</p><p className="mt-1 text-[11px] font-medium text-slate-500">Pendientes</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2.5 dark:border-blue-900/60 dark:bg-blue-950/25">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white"><MessageSquare size={16} /></span>
            <div><p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{enRevision}</p><p className="mt-1 text-[11px] font-medium text-slate-500">En revisión</p></div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/50">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" placeholder="Buscar por expediente..." value={busquedaExpediente} onChange={e => setBusquedaExpediente(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Desde</span>
          <DateField value={fechaDesde} onChange={setFechaDesde} clearable
            placeholder="Desde" ariaLabel="Fecha desde" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Hasta</span>
          <DateField value={fechaHasta} onChange={setFechaHasta} clearable
            placeholder="Hasta" ariaLabel="Fecha hasta" />
        </div>
        {(busquedaExpediente || fechaDesde || fechaHasta) && (
          <button onClick={() => { setBusquedaExpediente(""); setFechaDesde(""); setFechaHasta(""); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors">
            <X size={12} /> Limpiar
          </button>
        )}
        </div>
      </section>

      <div className="space-y-3">
        {displayList.length === 0 && (
          <p className="text-sm text-slate-500 py-10 text-center">
            {traslados.length === 0 ? "No has enviado solicitudes de traslado." : "Sin resultados para los filtros aplicados."}
          </p>
        )}
        {displayList.map(t => {
          const typeInfo = getTipoLabel(t.tipoTraslado);
          const Icon = typeInfo.icon;

          return (
            <article key={t.id} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.03] transition-all hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-md hover:shadow-cyan-950/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-800 md:p-5">
              <span className={`absolute bottom-0 left-0 top-0 w-1 ${t.estado === "aprobado" ? "bg-emerald-500" : t.estado === "en_revision" ? "bg-blue-500" : t.estado === "rechazado" ? "bg-rose-500" : "bg-amber-400"}`} />
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 pl-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${typeInfo.color}`}>
                      <Icon size={12} /> {typeInfo.label}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">{formatFecha(t.creadoEn)}</span>
                  </div>

                  {t.tipoTraslado === "intercambio" ? (
                    <div className="grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-center gap-2">
                      <div className="rounded-xl border border-violet-100 bg-violet-50/70 p-2.5 dark:border-violet-900/60 dark:bg-violet-950/25">
                        <p className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">Exp. {t.pacienteExpediente}</p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">{t.pacienteNombre || "Paciente sin nombre"}</p>
                        <p className="mt-1 text-[11px] font-medium text-violet-700 dark:text-violet-300">{t.servicioOrigen}</p>
                      </div>
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-white shadow-sm shadow-violet-600/25"><RefreshCw size={14} /></span>
                      <div className="rounded-xl border border-violet-100 bg-violet-50/70 p-2.5 dark:border-violet-900/60 dark:bg-violet-950/25">
                        <p className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">Exp. {t.pacienteBExpediente}</p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">{t.pacienteBNombre || "Paciente sin nombre"}</p>
                        <p className="mt-1 text-[11px] font-medium text-violet-700 dark:text-violet-300">{t.servicioDestino}</p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        <span className="font-mono">Exp. {t.pacienteExpediente}</span>{t.pacienteNombre ? <span className="ml-1.5 font-medium text-slate-600 dark:text-slate-300">· {t.pacienteNombre}</span> : ""}
                      </p>
                      <div className="grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-center gap-2">
                        <div className="rounded-xl border border-cyan-100 bg-cyan-50/70 p-2.5 dark:border-cyan-900/60 dark:bg-cyan-950/25">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Origen</p>
                          <p className="mt-1 truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{t.servicioOrigen}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">Cama {t.camaOrigen}</p>
                        </div>
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm shadow-blue-600/25"><ArrowRightLeft size={15} /></span>
                        <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-2.5 dark:border-blue-900/60 dark:bg-blue-950/25">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Destino</p>
                          <p className="mt-1 truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{t.tipoTraslado === "interno" ? t.servicioOrigen : t.servicioDestino}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">Cama {t.camaDestino}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {t.revisadoPorNombre && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded uppercase tracking-wider">
                        Procesado por: {t.revisadoPorNombre}
                      </span>
                    </div>
                  )}

                  {t.notasEsdomed && (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-3.5 dark:border-amber-900/60 dark:bg-amber-950/35">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1">Observación de ESDOMED</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{t.notasEsdomed}</p>
                    </div>
                  )}

                  {t.respuestaMedico && (
                    <div className="mt-2 bg-blue-50 dark:bg-blue-950/40 rounded-lg p-3 border border-blue-200 dark:border-blue-900/50">
                      <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-1">Tu respuesta</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{t.respuestaMedico}</p>
                    </div>
                  )}

                  {t.estado === "en_revision" && (
                    <button
                      onClick={() => abrirEdicion(t)}
                      className="mt-3 flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-blue-500"
                    >
                      <Pencil size={12} /> Editar y responder
                    </button>
                  )}
                </div>
                <Badge estado={t.estado} />
              </div>
            </article>
          );
        })}
      </div>

      {/* Modal de edición / respuesta */}
      {editando && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 rounded-t-2xl">
              <h2 className="font-bold text-slate-900 dark:text-slate-100 font-heading flex items-center gap-2">
                <MessageSquare size={16} className="text-blue-500" />
                Responder revisión
              </h2>
              <button onClick={() => setEditando(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"><X size={16} /></button>
            </div>

            <div className="p-5 space-y-4 text-sm">
              {/* Observación de ESDOMED */}
              {editando.notasEsdomed && (
                <div className="bg-amber-50 dark:bg-amber-950/40 rounded-lg p-3 border border-amber-200 dark:border-amber-900/50">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1">Observación de ESDOMED</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{editando.notasEsdomed}</p>
                </div>
              )}

              {/* Paciente (no editable) */}
              <div className="text-xs text-slate-500">
                Exp. <span className="font-mono">{editando.pacienteExpediente}</span>
                {editando.pacienteNombre && <> · {editando.pacienteNombre}</>}
                {" · "}{editando.servicioOrigen} (Cama {editando.camaOrigen})
              </div>

              {/* Destino editable según tipo */}
              {editando.tipoTraslado === "servicio_cama" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Servicio destino *</label>
                    <select
                      value={editForm.servicioDestino}
                      onChange={(e) => setEditForm((p) => ({ ...p, servicioDestino: e.target.value, camaDestino: "" }))}
                      className={inputCls}
                    >
                      <option value="">Seleccionar...</option>
                      {servicios.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <CamaSelect
                    servicio={editForm.servicioDestino}
                    value={editForm.camaDestino}
                    onChange={(v) => setEditForm((p) => ({ ...p, camaDestino: v }))}
                    getCamas={getCamas}
                  />
                </div>
              )}

              {editando.tipoTraslado === "interno" && (
                <CamaSelect
                  servicio={editando.servicioOrigen}
                  value={editForm.camaDestino}
                  onChange={(v) => setEditForm((p) => ({ ...p, camaDestino: v }))}
                  getCamas={getCamas}
                  label="Cama destino *"
                />
              )}

              {editando.tipoTraslado === "intercambio" && (
                <p className="text-xs text-slate-500 italic">
                  En un intercambio no se puede cambiar la cama aquí. Si el problema es con los pacientes/camas, cancela y crea una nueva solicitud; para todo lo demás, ajusta el motivo y responde.
                </p>
              )}

              {/* Motivo */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Motivo del traslado *</label>
                <textarea
                  value={editForm.motivoTraslado}
                  onChange={(e) => setEditForm((p) => ({ ...p, motivoTraslado: e.target.value }))}
                  rows={3}
                  className={`${inputCls} resize-none`}
                  placeholder="Describe el motivo del traslado..."
                />
              </div>

              {/* Respuesta a la observación */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Respuesta a ESDOMED (opcional)</label>
                <textarea
                  value={editForm.respuestaMedico}
                  onChange={(e) => setEditForm((p) => ({ ...p, respuestaMedico: e.target.value }))}
                  rows={3}
                  className={`${inputCls} resize-none`}
                  placeholder="Aclara o responde a la observación de ESDOMED..."
                />
              </div>

              {errEdit && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-red-700 dark:text-red-400">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{errEdit}</span>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2 justify-end bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
              <button
                onClick={() => setEditando(null)}
                disabled={guardando}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={reenviar}
                disabled={guardando}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors"
              >
                <Send size={14} />
                {guardando ? "Reenviando..." : "Reenviar a ESDOMED"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Selector de cama con fallback a texto libre si el servicio no tiene camas configuradas.
function CamaSelect({
  servicio, value, onChange, getCamas, label = "Cama destino *",
}: {
  servicio: string;
  value: string;
  onChange: (v: string) => void;
  getCamas: (servicio: string) => string[];
  label?: string;
}) {
  const camas = servicio ? getCamas(servicio) : [];
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>
      {camas.length > 0 ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">Seleccionar cama...</option>
          {camas.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
          placeholder={!servicio ? "Primero selecciona el servicio" : "Cama"}
          disabled={!servicio}
        />
      )}
    </div>
  );
}
