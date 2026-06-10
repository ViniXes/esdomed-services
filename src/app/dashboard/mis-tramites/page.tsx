"use client";

import { useEffect, useState, useRef } from "react";
import { collection, query, where, orderBy, onSnapshot, addDoc, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { FileText, Plus, Upload, X, CheckCircle2, Clock, XCircle, File } from "lucide-react";
import type { TramitePersonal, CategoriaTramitePersonal, EstadoTramitePersonal } from "@/types";

const CATEGORIAS: Record<CategoriaTramitePersonal, string> = {
  "A1_permiso_con_goce": "A.1 - Permisos personales con goce de sueldo",
  "A2_permiso_sin_goce": "A.2 - Permisos personales sin goce de sueldo",
  "A3_enfermedad": "A.3 - Enfermedad (Incapacidad)",
  "A4_compensatorio": "A.4 - Compensatorio",
  "A5_consulta_isss": "A.5 - Consulta ISSS",
  "A6_paternidad": "A.6 - Paternidad",
  "A7_enfermedad_pariente": "A.7 - Enfermedad de pariente",
  "A8_duelo": "A.8 - Duelo",
  "A9_otros": "A.9 - Otros (Control de Licencia)",
  "B_cambio_turno_individual": "B. Movimiento de RH (cambio de turno individual)",
  "C_cambio_turno_2personas": "C. Formulario para cambio de turno (2 personas)",
  "D_licencia_o_acciones": "D. Solicitud de Licencia o Acciones de Personal",
  "E_inconsistencias_marcacion": "E. Inconsistencias de Marcación",
  "F_tiempo_extra": "F. Informe mensual de tiempo extra laborado",
  "G_misiones_oficiales": "G. Control de misiones oficiales",
};

const REQUIERE_APROBACION = (cat: CategoriaTramitePersonal) => 
  cat === "A1_permiso_con_goce" || cat === "A2_permiso_sin_goce";

const ESTADO_BADGE: Record<EstadoTramitePersonal, string> = {
  "subido": "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  "pendiente": "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "aprobado": "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "rechazado": "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

const ESTADO_LABEL: Record<EstadoTramitePersonal, string> = {
  "subido": "Documento Subido",
  "pendiente": "Pendiente de Aprobación",
  "aprobado": "Aprobado",
  "rechazado": "Rechazado",
};

const inputCls = "w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";

export default function MisTramitesPage() {
  const { user, profile } = useAuth();
  const [tramites, setTramites] = useState<TramitePersonal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [categoria, setCategoria] = useState<CategoriaTramitePersonal>("A1_permiso_con_goce");
  const [notas, setNotas] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [horas, setHoras] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "tramites_personal"),
      where("empleadoId", "==", user.uid),
      orderBy("creadoEn", "desc")
    );
    return onSnapshot(q, (snap) => {
      setTramites(snap.docs.map(d => ({ id: d.id, ...d.data() } as TramitePersonal)));
      setLoading(false);
    });
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    setSaving(true);
    
    try {
      let documentoUrl = "";
      let documentoNombre = "";
      
      if (file) {
        const fileRef = ref(storage, `tramites/${user.uid}/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        documentoUrl = await getDownloadURL(fileRef);
        documentoNombre = file.name;
      }

      const isAprobacion = REQUIERE_APROBACION(categoria);
      
      const payload: Partial<TramitePersonal> = {
        categoria,
        empleadoId: user.uid,
        empleadoNombre: profile.nombre,
        notas: notas.trim() || undefined,
        estado: isAprobacion ? "pendiente" : "subido",
        creadoEn: Timestamp.now() as any,
      };

      if (documentoUrl) {
        payload.documentoUrl = documentoUrl;
        payload.documentoNombre = documentoNombre;
      }

      if (isAprobacion) {
        if (fechaInicio) payload.fechaInicio = Timestamp.fromDate(new Date(fechaInicio)) as any;
        if (fechaFin) payload.fechaFin = Timestamp.fromDate(new Date(fechaFin)) as any;
        if (horas) payload.horas = Number(horas);
      }

      await addDoc(collection(db, "tramites_personal"), payload);
      setShowModal(false);
      resetForm();
    } catch (err) {
      console.error(err);
      alert("Error al enviar el trámite. Por favor intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setCategoria("A1_permiso_con_goce");
    setNotas("");
    setFechaInicio("");
    setFechaFin("");
    setHoras("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const requiereAprobacionActual = REQUIERE_APROBACION(categoria);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1c1e4d] dark:text-[#c9a892] mb-1">
            <FileText size={13} /> Mi área
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-heading">Trámites de Personal</h1>
          <p className="text-sm text-slate-500 mt-1">
            Sube documentación o solicita permisos con o sin goce de sueldo.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm"
        >
          <Plus size={18} /> Nuevo Trámite
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tramites.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 px-6 py-16 text-center bg-white/50 dark:bg-slate-900/50">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mb-4 shadow-sm">
            <FileText size={28} />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1.5">Ningún trámite todavía</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Aquí aparecerá el historial de todas tus solicitudes y documentos subidos.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tramites.map(t => {
            const isAprobacion = REQUIERE_APROBACION(t.categoria);
            const d = t.creadoEn as any as { toDate: () => Date };
            const fecha = d.toDate ? d.toDate() : new Date(t.creadoEn as unknown as string);

            return (
              <div key={t.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-blue-300 dark:hover:border-blue-900/50 shadow-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md ${ESTADO_BADGE[t.estado]}`}>
                      {ESTADO_LABEL[t.estado]}
                    </span>
                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                      <Clock size={12} />
                      {fecha.toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                    {CATEGORIAS[t.categoria]}
                  </h3>
                  
                  {isAprobacion && (t.fechaInicio || t.horas) && (
                    <div className="mt-2 flex flex-wrap gap-3">
                      {t.horas && (
                        <span className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-lg text-xs font-semibold">
                          {t.horas} horas
                        </span>
                      )}
                      {t.fechaInicio && (
                        <span className="inline-flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700">
                          Inicio: {new Date(t.fechaInicio as any).toLocaleString("es-SV", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      )}
                    </div>
                  )}
                  {t.notas && <p className="text-xs text-slate-500 italic mt-2.5 line-clamp-2">"{t.notas}"</p>}
                  
                  {t.comentariosRevision && (
                    <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 border border-amber-100 dark:border-amber-800/30">
                      <p className="text-[11px] font-bold text-amber-800 dark:text-amber-500 mb-1 uppercase tracking-wider">Respuesta de Administración:</p>
                      <p className="text-sm text-amber-950 dark:text-amber-200">{t.comentariosRevision}</p>
                    </div>
                  )}
                </div>

                <div className="shrink-0 flex flex-col items-end gap-2 border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800 pt-3 md:pt-0 md:pl-5">
                  {t.documentoUrl ? (
                    <a href={t.documentoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-300 hover:text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 px-4 py-2.5 rounded-xl transition-colors w-full md:w-auto">
                      <File size={16} /> Ver Documento
                    </a>
                  ) : (
                    <span className="text-xs font-medium text-slate-400 italic bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                      Sin anexo
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Nuevo Trámite */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex justify-center items-start pt-10 px-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden mb-10 transform transition-all">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileText size={20} className="text-blue-500" /> Nuevo Trámite
              </h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  ¿Qué tipo de trámite es?
                </label>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value as CategoriaTramitePersonal)}
                  className={inputCls}
                  required
                >
                  {Object.entries(CATEGORIAS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {requiereAprobacionActual && (
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200/60 dark:border-amber-800/40 rounded-2xl p-5 space-y-5">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-500 mb-1">
                    <Clock size={18} />
                    <span className="text-xs font-bold uppercase tracking-widest">Detalles del Permiso</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-amber-900/60 dark:text-amber-500/60 uppercase tracking-wide mb-1.5">Inicio</label>
                      <input type="datetime-local" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} required className={`${inputCls} border-amber-200 dark:border-amber-800/50 focus:ring-amber-500`} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-amber-900/60 dark:text-amber-500/60 uppercase tracking-wide mb-1.5">Fin</label>
                      <input type="datetime-local" value={fechaFin} onChange={e => setFechaFin(e.target.value)} required className={`${inputCls} border-amber-200 dark:border-amber-800/50 focus:ring-amber-500`} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900/60 dark:text-amber-500/60 uppercase tracking-wide mb-1.5">Cantidad de horas</label>
                    <input type="number" step="0.5" min="0" placeholder="Ej: 4" value={horas} onChange={e => setHoras(e.target.value)} required className={`${inputCls} border-amber-200 dark:border-amber-800/50 focus:ring-amber-500`} />
                  </div>
                </div>
              )}

              <div className="bg-slate-50 dark:bg-slate-800/30 rounded-2xl p-5 border border-slate-100 dark:border-slate-800/60">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                  Documento Adjunto {!requiereAprobacionActual && <span className="text-rose-500">*</span>}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-500 dark:file:bg-blue-600 dark:hover:file:bg-blue-500 transition-colors file:cursor-pointer cursor-pointer"
                    required={!requiereAprobacionActual}
                  />
                </div>
                {requiereAprobacionActual ? (
                  <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-emerald-500" /> Opcional: Adjunta constancia o respaldo.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1.5">
                    <Upload size={12} className="text-blue-500" /> Obligatorio: Sube el formulario o evidencia.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Notas o Comentarios <span className="text-slate-400 font-normal normal-case">(Opcional)</span>
                </label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={3}
                  className={`${inputCls} resize-none`}
                  placeholder="Escribe aquí si necesitas aclarar algo..."
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); resetForm(); }}
                  disabled={saving}
                  className="px-5 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-8 py-3 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Procesando...
                    </>
                  ) : requiereAprobacionActual ? (
                    "Enviar Solicitud"
                  ) : (
                    "Subir Documento"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
