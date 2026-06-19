"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ClipboardCheck, File, Clock, CheckCircle, XCircle, Search, Filter, AlertTriangle } from "lucide-react";
import type { TramitePersonal, CategoriaTramitePersonal, EstadoTramitePersonal } from "@/types";
import { toDate } from "@/lib/pacientes/helpers";

const CATEGORIAS: Record<CategoriaTramitePersonal, string> = {
  "A1_permiso_con_goce": "A.1 - Permisos con goce de sueldo",
  "A2_permiso_sin_goce": "A.2 - Permisos sin goce de sueldo",
  "A3_enfermedad": "A.3 - Enfermedad (Incapacidad)",
  "A4_compensatorio": "A.4 - Compensatorio",
  "A5_consulta_isss": "A.5 - Consulta ISSS",
  "A6_paternidad": "A.6 - Paternidad",
  "A7_enfermedad_pariente": "A.7 - Enfermedad de pariente",
  "A8_duelo": "A.8 - Duelo",
  "A9_otros": "A.9 - Otros",
  "B_cambio_turno_individual": "B. Cambio de turno individual",
  "C_cambio_turno_2personas": "C. Cambio de turno (2 personas)",
  "D_licencia_o_acciones": "D. Licencia o Acciones de Personal",
  "E_inconsistencias_marcacion": "E. Inconsistencias de Marcación",
  "F_tiempo_extra": "F. Informe mensual de tiempo extra",
  "G_misiones_oficiales": "G. Misiones oficiales",
};

const ESTADO_BADGE: Record<EstadoTramitePersonal, string> = {
  "subido": "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  "pendiente": "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 animate-pulse",
  "aprobado": "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "rechazado": "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

export default function AprobacionTramitesPage() {
  const { user, profile } = useAuth();
  const [tramites, setTramites] = useState<TramitePersonal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTab, setFiltroTab] = useState<"pendientes" | "todos">("pendientes");
  const [searchTxt, setSearchTxt] = useState("");

  const [tramiteAprobando, setTramiteAprobando] = useState<TramitePersonal | null>(null);
  const [comentarioAdmin, setComentarioAdmin] = useState("");
  const [accionAdmin, setAccionAdmin] = useState<"aprobado" | "rechazado">("aprobado");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, "tramites_personal"),
      orderBy("creadoEn", "desc")
    );
    return onSnapshot(q, (snap) => {
      setTramites(snap.docs.map(d => ({ id: d.id, ...d.data() } as TramitePersonal)));
      setLoading(false);
    });
  }, []);

  const handleResolver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tramiteAprobando?.id || !user || !profile) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "tramites_personal", tramiteAprobando.id), {
        estado: accionAdmin,
        revisadoPorId: user.uid,
        revisadoPorNombre: profile.nombre,
        revisadoEn: Timestamp.now(),
        comentariosRevision: comentarioAdmin.trim() || undefined,
        actualizadoEn: Timestamp.now()
      });
      setTramiteAprobando(null);
      setComentarioAdmin("");
    } catch (err) {
      console.error(err);
      setErrorMsg("No se pudo guardar la resolución. Por favor intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const filtered = tramites.filter(t => {
    if (filtroTab === "pendientes" && t.estado !== "pendiente") return false;
    if (searchTxt) {
      const q = searchTxt.toLowerCase();
      return t.empleadoNombre.toLowerCase().includes(q) || CATEGORIAS[t.categoria].toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1c1e4d] dark:text-[#c9a892] mb-1">
            <ClipboardCheck size={13} /> Administración
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-heading">Gestión de Trámites</h1>
          <p className="text-sm text-slate-500 mt-1">
            Revisa y aprueba los permisos del personal y consulta sus documentos subidos.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full md:w-auto">
            <button
              onClick={() => setFiltroTab("pendientes")}
              className={`flex-1 md:w-40 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors ${
                filtroTab === "pendientes" ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              Pendientes
            </button>
            <button
              onClick={() => setFiltroTab("todos")}
              className={`flex-1 md:w-40 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors ${
                filtroTab === "todos" ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              Historial Total
            </button>
          </div>
          
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Buscar por empleado o trámite..."
              value={searchTxt}
              onChange={e => setSearchTxt(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-20 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 dark:bg-slate-800/50 text-slate-300 mb-4">
              <CheckCircle size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">Todo al día</h3>
            <p className="text-sm text-slate-500">No hay trámites que coincidan con tu búsqueda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Fecha</th>
                  <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Empleado</th>
                  <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Trámite</th>
                  <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Estado</th>
                  <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filtered.map(t => {
                  const d = t.creadoEn as any as { toDate: () => Date };
                  const fecha = d.toDate ? d.toDate() : new Date(t.creadoEn as unknown as string);
                  
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                      <td className="py-3.5 px-4 align-top whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                        {fecha.toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" })}
                        <span className="block text-[10px] mt-0.5 opacity-70">{fecha.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" })}</span>
                      </td>
                      <td className="py-3.5 px-4 align-top">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{t.empleadoNombre}</p>
                      </td>
                      <td className="py-3.5 px-4 align-top max-w-xs">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{CATEGORIAS[t.categoria]}</p>
                        {(t.fechaInicio || t.horas) && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {t.tipoSolicitud && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${t.tipoSolicitud === "diferido" ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"}`}>{t.tipoSolicitud}</span>
                            )}
                            {t.horas && <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 font-bold">{t.horas} hrs</span>}
                            {t.fechaInicio && <span className="text-[10px] text-slate-500">Inicia: {toDate(t.fechaInicio)?.toLocaleString("es-SV", { dateStyle: "short", timeStyle: "short" }) ?? "-"}</span>}
                          </div>
                        )}
                        {t.notas && <p className="text-[11px] text-slate-500 italic mt-1 line-clamp-1 group-hover:line-clamp-none">"{t.notas}"</p>}
                      </td>
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${ESTADO_BADGE[t.estado]}`}>
                          {t.estado === "subido" ? "Info Subida" : t.estado}
                        </span>
                        {t.revisadoPorNombre && (t.estado === "aprobado" || t.estado === "rechazado") && (
                          <span className="block text-[9px] text-slate-400 mt-1 uppercase">Por: {t.revisadoPorNombre}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 align-top whitespace-nowrap text-right space-x-2">
                        {t.documentoUrl && (
                          <a href={t.documentoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors" title="Ver Documento">
                            <File size={14} />
                          </a>
                        )}
                        {t.estado === "pendiente" && (
                          <button
                            onClick={() => setTramiteAprobando(t)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                          >
                            Resolver
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Resolver */}
      {tramiteAprobando && (
        <div className="fixed inset-0 z-50 flex justify-center items-start pt-10 px-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden mb-10 transform transition-all">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/60 bg-amber-50 dark:bg-amber-950/20">
              <h2 className="text-lg font-bold text-amber-800 dark:text-amber-500 flex items-center gap-2">
                <Clock size={20} /> Resolver Solicitud
              </h2>
            </div>
            
            <form onSubmit={handleResolver} className="p-6 space-y-6">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                <p className="text-xs text-slate-500 mb-1">Empleado</p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">{tramiteAprobando.empleadoNombre}</p>
                
                <p className="text-xs text-slate-500 mb-1">Trámite solicitado</p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{CATEGORIAS[tramiteAprobando.categoria]}</p>

                {(tramiteAprobando.fechaInicio || tramiteAprobando.horas || tramiteAprobando.tipoSolicitud) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {tramiteAprobando.tipoSolicitud && (
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${tramiteAprobando.tipoSolicitud === "diferido" ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"}`}>{tramiteAprobando.tipoSolicitud}</span>
                    )}
                    {tramiteAprobando.horas && (
                      <span className="text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300 font-bold">{tramiteAprobando.horas} hrs</span>
                    )}
                    {tramiteAprobando.fechaInicio && (
                      <span className="text-[11px] text-slate-500">
                        {toDate(tramiteAprobando.fechaInicio)?.toLocaleString("es-SV", { dateStyle: "short", timeStyle: "short" }) ?? "-"}
                        {tramiteAprobando.fechaFin && ` → ${toDate(tramiteAprobando.fechaFin)?.toLocaleString("es-SV", { dateStyle: "short", timeStyle: "short" }) ?? "-"}`}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Resolución
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`cursor-pointer border rounded-xl p-3 flex flex-col items-center gap-2 transition-all ${accionAdmin === "aprobado" ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 text-emerald-700 dark:text-emerald-400" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-emerald-200"}`}>
                    <input type="radio" name="resolucion" value="aprobado" checked={accionAdmin === "aprobado"} onChange={() => setAccionAdmin("aprobado")} className="sr-only" />
                    <CheckCircle size={24} />
                    <span className="text-sm font-bold">Aprobar</span>
                  </label>
                  <label className={`cursor-pointer border rounded-xl p-3 flex flex-col items-center gap-2 transition-all ${accionAdmin === "rechazado" ? "bg-rose-50 dark:bg-rose-950/30 border-rose-500 text-rose-700 dark:text-rose-400" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-rose-200"}`}>
                    <input type="radio" name="resolucion" value="rechazado" checked={accionAdmin === "rechazado"} onChange={() => setAccionAdmin("rechazado")} className="sr-only" />
                    <XCircle size={24} />
                    <span className="text-sm font-bold">Rechazar</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Comentario / Respuesta <span className="text-slate-400 font-normal normal-case">(opcional)</span>
                </label>
                <textarea
                  value={comentarioAdmin}
                  onChange={e => setComentarioAdmin(e.target.value)}
                  rows={3}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                  placeholder="Justificación de la resolución..."
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setTramiteAprobando(null)}
                  disabled={saving}
                  className="px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`px-6 py-2.5 text-sm font-bold text-white rounded-xl transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${accionAdmin === "aprobado" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-rose-600 hover:bg-rose-500"}`}
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    "Guardar Resolución"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de error */}
      {errorMsg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="p-6 flex flex-col items-center gap-3 bg-rose-50 dark:bg-rose-950/30">
              <div className="w-14 h-14 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center">
                <AlertTriangle size={28} className="text-rose-600 dark:text-rose-400" />
              </div>
              <h3 className="text-lg font-bold text-rose-800 dark:text-rose-300">No se pudo guardar</h3>
              <p className="text-sm text-center text-rose-700 dark:text-rose-300">{errorMsg}</p>
            </div>
            <div className="p-5">
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
