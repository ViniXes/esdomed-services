"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection, query, where, onSnapshot, getDocs,
  addDoc, updateDoc, deleteDoc, doc, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { BuscadorPacienteActivo } from "@/components/pacientes/BuscadorPacienteActivo";
import { ubicacionLabel } from "@/lib/servicios";
import { toDate } from "@/lib/pacientes/helpers";
import type { Paciente, NotificacionPrealta, EstadoPrealta, TarjetaVisita } from "@/types";
import {
  ClipboardCheck, Plus, X, Search, CalendarDays, Printer, Trash2,
  Pencil, CheckCircle2, AlertTriangle, ArrowLeft,
} from "lucide-react";

// ── Estilos compartidos ───────────────────────────────────────────────────────
const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 transition";
const selectCls =
  "w-full appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 transition cursor-pointer";

const ESTADOS: { v: EstadoPrealta; label: string }[] = [
  { v: "notificado",  label: "Notificado" },
  { v: "pendiente",   label: "Pendiente" },
  { v: "no_responde", label: "N/R (no respondió)" },
  { v: "suspendida",  label: "Suspendida" },
  { v: "deposito",    label: "Depósito" },
];

const ESTADO_CFG: Record<EstadoPrealta, { label: string; c: string }> = {
  notificado:  { label: "Notificado", c: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900" },
  pendiente:   { label: "Pendiente",  c: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900" },
  no_responde: { label: "N/R",        c: "text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" },
  suspendida:  { label: "Suspendida", c: "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-900" },
  deposito:    { label: "Depósito",   c: "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950 border-violet-200 dark:border-violet-900" },
};

// ── Utilidades ────────────────────────────────────────────────────────────────
function fechaStr(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}
function hoyStr(): string { return fechaStr(new Date()); }

function fmtFechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("es-SV", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}
function fmtHora(d?: Date): string {
  if (!d) return "—";
  return d.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function horaInputStr(d: Date): string {
  return `${`${d.getHours()}`.padStart(2, "0")}:${`${d.getMinutes()}`.padStart(2, "0")}`;
}

function generoLetra(g?: string): string {
  if (g === "masculino") return "M";
  if (g === "femenino") return "F";
  return "—";
}

function edadDesde(fechaNac?: Date, ref: Date = new Date()): number | undefined {
  if (!fechaNac) return undefined;
  let edad = ref.getFullYear() - fechaNac.getFullYear();
  const m = ref.getMonth() - fechaNac.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < fechaNac.getDate())) edad--;
  return edad >= 0 && edad < 130 ? edad : undefined;
}

type Feedback = { id: number; tipo: "success" | "error"; mensaje: string };

// ── Página ────────────────────────────────────────────────────────────────────
export default function NotificacionAltasPage() {
  const { profile } = useAuth();
  const esTS = profile?.role === "trabajo_social";

  const [fecha, setFecha] = useState(hoyStr());
  const [registros, setRegistros] = useState<NotificacionPrealta[]>([]);
  const [texto, setTexto] = useState("");

  const [adding, setAdding] = useState(false);
  const [editando, setEditando] = useState<NotificacionPrealta | null>(null);
  const [borrar, setBorrar] = useState<NotificacionPrealta | null>(null);
  const [imprimiendo, setImprimiendo] = useState(false);

  const feedbackId = useRef(0);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const notify = useCallback((tipo: "success" | "error", mensaje: string) => {
    const id = ++feedbackId.current;
    setFeedbacks(f => [...f, { id, tipo, mensaje }]);
  }, []);
  const dismiss = useCallback((id: number) => setFeedbacks(f => f.filter(x => x.id !== id)), []);

  useEffect(() => {
    const q = query(collection(db, "notificaciones_prealta"), where("fecha", "==", fecha));
    return onSnapshot(q, s => {
      const docs = s.docs.map(d => {
        const data = d.data();
        return {
          id: d.id, ...data,
          horaNotificacion: toDate(data.horaNotificacion),
          creadoEn: toDate(data.creadoEn) ?? new Date(),
        } as NotificacionPrealta;
      });
      docs.sort((a, b) => (a.creadoEn?.getTime() ?? 0) - (b.creadoEn?.getTime() ?? 0));
      setRegistros(docs);
    });
  }, [fecha]);

  const filtrados = useMemo(() => {
    const t = texto.trim().toLowerCase();
    if (!t) return registros;
    return registros.filter(r =>
      r.pacienteExpediente?.toLowerCase().includes(t) ||
      r.pacienteNombre?.toLowerCase().includes(t) ||
      r.servicio?.toLowerCase().includes(t) ||
      (r.cama ?? "").toLowerCase().includes(t) ||
      (r.familiarNombre ?? "").toLowerCase().includes(t)
    );
  }, [registros, texto]);

  const eliminar = async () => {
    if (!borrar?.id) return;
    try {
      await deleteDoc(doc(db, "notificaciones_prealta", borrar.id));
      notify("success", "Registro eliminado");
    } catch {
      notify("error", "No se pudo eliminar");
    } finally {
      setBorrar(null);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-50 dark:bg-amber-950/40 rounded-xl flex items-center justify-center border border-amber-200 dark:border-amber-900">
            <ClipboardCheck size={17} className="text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Notificación de Altas</h1>
            <p className="text-xs text-slate-500 mt-0.5">Registro de altas notificadas a familiares — control interno de Trabajo Social</p>
          </div>
        </div>
        {esTS && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-700 rounded-xl transition-colors"
          >
            <Plus size={16} /> Registrar notificación
          </button>
        )}
      </div>

      {/* Barra: fecha + buscador + imprimir */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <CalendarDays size={15} />
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </label>
        {fecha !== hoyStr() && (
          <button onClick={() => setFecha(hoyStr())} className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-amber-500">Hoy</button>
        )}
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={texto} onChange={e => setTexto(e.target.value)}
            placeholder="Filtrar por paciente, expediente, servicio, cama o familiar…"
            className={inputCls + " pl-9"} />
        </div>
        <span className="text-sm text-slate-500">{filtrados.length} registro(s)</span>
        <button
          onClick={() => setImprimiendo(true)}
          disabled={registros.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          <Printer size={15} /> Imprimir reporte
        </button>
      </div>

      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">{fmtFechaLarga(fecha)}</p>

      {/* Tabla */}
      {filtrados.length === 0 ? (
        <p className="text-sm text-slate-400 py-12 text-center">
          {registros.length === 0 ? "No hay notificaciones registradas para esta fecha." : "Ningún registro coincide con el filtro."}
        </p>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  {["N°", "Servicio", "Exp.", "Gén.", "Paciente", "Familiar", "Edad", "Hora", "Estado", "Registró", ""].map((h, i) => (
                    <th key={i} className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtrados.map((r, i) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 align-top">
                    <td className="px-3 py-3 text-slate-500">{i + 1}</td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap" title={r.servicio}>{ubicacionLabel(r.servicio, r.cama)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{r.pacienteExpediente}</td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-400">{generoLetra(r.genero)}</td>
                    <td className="px-3 py-3 min-w-[180px]">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{r.pacienteNombre}</p>
                      {r.observacionesPaciente && <p className="text-xs text-slate-500 whitespace-pre-line">{r.observacionesPaciente}</p>}
                    </td>
                    <td className="px-3 py-3 min-w-[180px]">
                      <p className="text-slate-800 dark:text-slate-200">{r.familiarNombre || "—"}</p>
                      {r.observacionesFamiliar && <p className="text-xs text-slate-500 whitespace-pre-line">{r.observacionesFamiliar}</p>}
                    </td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-400">{r.edad ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{fmtHora(r.horaNotificacion)}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-1 rounded-lg border whitespace-nowrap ${ESTADO_CFG[r.estado].c}`}>
                        {ESTADO_CFG[r.estado].label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">{r.creadoPorNombre || "—"}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {esTS && (
                        <div className="flex items-center gap-1.5 justify-end">
                          <button onClick={() => setEditando(r)} className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Editar">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => setBorrar(r)} className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors" title="Eliminar">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(adding || editando) && profile && (
        <RegistroModal
          fecha={fecha}
          registro={editando ?? undefined}
          profile={{ uid: profile.uid, nombre: profile.nombre }}
          onClose={() => { setAdding(false); setEditando(null); }}
          notify={notify}
        />
      )}

      {borrar && (
        <ConfirmarBorrado registro={borrar} onCancel={() => setBorrar(null)} onConfirm={eliminar} />
      )}

      {imprimiendo && (
        <ReportePrealtaPrint fecha={fecha} registros={registros} onClose={() => setImprimiendo(false)} />
      )}

      <FeedbackStack items={feedbacks} onDismiss={dismiss} />
    </div>
  );
}

// ── Modal: registrar / editar notificación ────────────────────────────────────
function RegistroModal({ fecha, registro, profile, onClose, notify }: {
  fecha: string;
  registro?: NotificacionPrealta;
  profile: { uid: string; nombre: string };
  onClose: () => void;
  notify: (tipo: "success" | "error", mensaje: string) => void;
}) {
  const editar = !!registro;
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [tarjeta, setTarjeta] = useState<TarjetaVisita | null>(null);
  const [familiarNombre, setFamiliarNombre] = useState(registro?.familiarNombre ?? "");
  const [obsPaciente, setObsPaciente] = useState(registro?.observacionesPaciente ?? "");
  const [obsFamiliar, setObsFamiliar] = useState(registro?.observacionesFamiliar ?? "");
  const [estado, setEstado] = useState<EstadoPrealta>(registro?.estado ?? "notificado");
  const [edad, setEdad] = useState<string>(registro?.edad != null ? String(registro.edad) : "");
  const [hora, setHora] = useState(horaInputStr(registro?.horaNotificacion ?? new Date()));
  const [guardando, setGuardando] = useState(false);

  // Al elegir paciente (modo crear): autollenar la edad desde su fecha de nacimiento.
  const elegirPaciente = (p: Paciente | null) => {
    setPaciente(p);
    if (p) {
      const e = edadDesde(toDate((p as { fechaNacimiento?: unknown }).fechaNacimiento));
      setEdad(e != null ? String(e) : "");
    }
  };

  // Buscar la tarjeta de visita activa del paciente para ofrecer su lista blanca.
  useEffect(() => {
    if (editar || !paciente?.id) return;
    let cancel = false;
    (async () => {
      const snap = await getDocs(query(collection(db, "tarjetas_visita"), where("pacienteId", "==", paciente.id)));
      if (cancel) return;
      const todas = snap.docs.map(d => ({ id: d.id, ...d.data() } as TarjetaVisita));
      setTarjeta(todas.find(t => t.estado === "activa") ?? null);
    })();
    return () => { cancel = true; };
  }, [paciente, editar]);

  const horaADate = (): Date => {
    const [y, m, d] = fecha.split("-").map(Number);
    const [hh, mm] = hora.split(":").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const edadNum = edad.trim() ? Number(edad) : undefined;
      if (editar && registro?.id) {
        await updateDoc(doc(db, "notificaciones_prealta", registro.id), {
          familiarNombre: familiarNombre.trim() || null,
          observacionesPaciente: obsPaciente.trim() || null,
          observacionesFamiliar: obsFamiliar.trim() || null,
          estado,
          edad: edadNum ?? null,
          horaNotificacion: Timestamp.fromDate(horaADate()),
          actualizadoEn: Timestamp.now(),
        });
        notify("success", "Registro actualizado");
      } else {
        if (!paciente?.id) { notify("error", "Selecciona un paciente activo"); setGuardando(false); return; }
        await addDoc(collection(db, "notificaciones_prealta"), {
          fecha,
          pacienteId: paciente.id,
          pacienteExpediente: paciente.expediente,
          pacienteNombre: `${paciente.apellidos}, ${paciente.nombres}`,
          genero: paciente.genero,
          servicio: paciente.servicioActual,
          cama: paciente.camaActual ?? "",
          edad: edadNum ?? null,
          observacionesPaciente: obsPaciente.trim() || null,
          familiarNombre: familiarNombre.trim() || null,
          observacionesFamiliar: obsFamiliar.trim() || null,
          estado,
          horaNotificacion: Timestamp.fromDate(horaADate()),
          creadoEn: Timestamp.now(),
          creadoPorId: profile.uid,
          creadoPorNombre: profile.nombre,
        });
        notify("success", "Notificación registrada");
      }
      onClose();
    } catch {
      notify("error", "No se pudo guardar");
      setGuardando(false);
    }
  };

  const pac = registro
    ? { nombre: registro.pacienteNombre, exp: registro.pacienteExpediente, servicio: registro.servicio, cama: registro.cama, genero: registro.genero }
    : paciente
      ? { nombre: `${paciente.apellidos}, ${paciente.nombres}`, exp: paciente.expediente, servicio: paciente.servicioActual, cama: paciente.camaActual, genero: paciente.genero }
      : null;

  const listaBlanca = tarjeta ? [tarjeta.titular, ...tarjeta.listaBlanca.filter(v => v.nombre !== tarjeta.titular.nombre)] : [];

  return (
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
          <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ClipboardCheck size={18} className="text-amber-600" /> {editar ? "Editar notificación" : "Registrar notificación"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {!editar && !paciente && (
            <BuscadorPacienteActivo value={paciente} onSelect={elegirPaciente} accent="amber" />
          )}

          {pac && (
            <>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 dark:text-slate-200">{pac.nombre}</p>
                  <p className="text-xs text-slate-500">Exp. {pac.exp} · {pac.servicio} · Cama {pac.cama || "—"} · {generoLetra(pac.genero)}</p>
                </div>
                {!editar && (
                  <button onClick={() => setPaciente(null)} className="text-xs font-medium text-slate-500 hover:text-amber-600 flex items-center gap-1 flex-shrink-0">
                    <ArrowLeft size={13} /> Cambiar
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Familiar notificado</label>
                {listaBlanca.length > 0 && (
                  <select
                    value=""
                    onChange={e => { if (e.target.value) setFamiliarNombre(e.target.value); }}
                    className={selectCls + " mb-2"}
                  >
                    <option value="">— Elegir de la lista blanca de visitas —</option>
                    {listaBlanca.map((v, i) => <option key={i} value={v.nombre}>{v.nombre}{v.parentesco ? ` · ${v.parentesco}` : ""}</option>)}
                  </select>
                )}
                <input className={inputCls} placeholder="Nombre del familiar" value={familiarNombre}
                  onChange={e => setFamiliarNombre(e.target.value.toUpperCase())} />
                <textarea className={inputCls + " mt-2 resize-none"} rows={2} placeholder="Observaciones del familiar (autorizaciones, contacto de emergencia…)"
                  value={obsFamiliar} onChange={e => setObsFamiliar(e.target.value)} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Observaciones del paciente</label>
                <textarea className={inputCls + " resize-none"} rows={2} placeholder="Reingreso, fecha de alta, cuenta con teléfono, etc."
                  value={obsPaciente} onChange={e => setObsPaciente(e.target.value)} />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Edad</label>
                  <input type="number" min={0} max={130} className={inputCls} value={edad} onChange={e => setEdad(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Hora</label>
                  <input type="time" className={inputCls} value={hora} onChange={e => setHora(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Estado</label>
                  <select value={estado} onChange={e => setEstado(e.target.value as EstadoPrealta)} className={selectCls}>
                    {ESTADOS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              <button onClick={guardar} disabled={guardando}
                className="w-full py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-700 rounded-xl disabled:opacity-50 transition-colors">
                {guardando ? "Guardando…" : editar ? "Guardar cambios" : "Registrar notificación"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Confirmar borrado ─────────────────────────────────────────────────────────
function ConfirmarBorrado({ registro, onCancel, onConfirm }: {
  registro: NotificacionPrealta; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[210] bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={18} className="text-rose-500" />
          <h2 className="font-bold text-slate-900 dark:text-slate-100">Eliminar registro</h2>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">¿Eliminar la notificación de <strong>{registro.pacienteNombre}</strong>? Esta acción no se puede deshacer.</p>
        <div className="flex gap-2 pt-4">
          <button onClick={onCancel} className="flex-1 py-2 text-sm font-semibold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 py-2 text-sm font-semibold rounded-xl text-white bg-rose-600 hover:bg-rose-500 transition-colors">Eliminar</button>
        </div>
      </div>
    </div>
  );
}

// ── Reporte imprimible del día ────────────────────────────────────────────────
function ReportePrealtaPrint({ fecha, registros, onClose }: {
  fecha: string; registros: NotificacionPrealta[]; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[220] bg-slate-200 overflow-y-auto print:bg-white print:static print:inset-auto print:overflow-visible">
      {/* Toolbar — oculto al imprimir */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors">
            <ArrowLeft size={15} /> Volver
          </button>
          <p className="text-xs text-slate-500">Vista previa del reporte</p>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <Printer size={14} /> Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      {/* Hoja */}
      <div className="py-6 px-4 print:p-0">
        <div className="bg-white shadow-lg max-w-[27cm] mx-auto p-6 print:shadow-none print:max-w-none print:p-3" style={{ color: "#0f172a" }}>
          {/* Encabezado */}
          <div className="flex items-center justify-between gap-4 border-b-2 border-slate-300 pb-3 mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo_hnes.png" alt="Hospital El Salvador" className="h-12 w-auto object-contain" />
            <div className="text-center">
              <h1 className="text-base font-bold uppercase tracking-wide">Altas notificadas por Trabajo Social</h1>
              <p className="text-sm text-slate-600 capitalize">{fmtFechaLarga(fecha)}</p>
            </div>
            <div className="text-[10px] font-semibold uppercase text-slate-500 text-right w-16">Trabajo Social</div>
          </div>

          <table className="w-full border-collapse" style={{ fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#dbeafe" }}>
                {["N°", "Servicio", "Exp.", "Género", "Paciente", "Familiar", "Edad", "Hora", "Estado"].map((h, i) => (
                  <th key={i} className="border border-slate-400 px-1.5 py-1 text-left font-bold uppercase" style={{ fontSize: "9px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {registros.map((r, i) => (
                <tr key={r.id} style={{ pageBreakInside: "avoid" }}>
                  <td className="border border-slate-400 px-1.5 py-1 text-center">{i + 1}</td>
                  <td className="border border-slate-400 px-1.5 py-1 whitespace-nowrap font-semibold">{ubicacionLabel(r.servicio, r.cama)}</td>
                  <td className="border border-slate-400 px-1.5 py-1 whitespace-nowrap">{r.pacienteExpediente}</td>
                  <td className="border border-slate-400 px-1.5 py-1 text-center">{generoLetra(r.genero)}</td>
                  <td className="border border-slate-400 px-1.5 py-1">
                    <span className="font-semibold">{r.pacienteNombre}</span>
                    {r.observacionesPaciente && <span className="block text-slate-600" style={{ fontSize: "9px" }}>{r.observacionesPaciente}</span>}
                  </td>
                  <td className="border border-slate-400 px-1.5 py-1">
                    {r.familiarNombre || "—"}
                    {r.observacionesFamiliar && <span className="block text-slate-600" style={{ fontSize: "9px" }}>{r.observacionesFamiliar}</span>}
                  </td>
                  <td className="border border-slate-400 px-1.5 py-1 text-center">{r.edad ?? "—"}</td>
                  <td className="border border-slate-400 px-1.5 py-1 whitespace-nowrap text-center">{fmtHora(r.horaNotificacion)}</td>
                  <td className="border border-slate-400 px-1.5 py-1 whitespace-nowrap font-semibold">{ESTADO_CFG[r.estado].label}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-right text-slate-500 mt-2" style={{ fontSize: "9px" }}>Total: {registros.length} paciente(s) notificado(s)</p>
        </div>
      </div>

      {/* Oculta sidebar/barras del dashboard al imprimir */}
      <style jsx global>{`
        @media print {
          aside,
          [class*="md:hidden fixed top-0"] {
            display: none !important;
          }
          main { padding: 0 !important; overflow: visible !important; }
          html, body { background: white !important; }
          @page { size: landscape; margin: 8mm; }
        }
      `}</style>
    </div>
  );
}

// ── Feedback (toasts) ─────────────────────────────────────────────────────────
function FeedbackStack({ items, onDismiss }: { items: Feedback[]; onDismiss: (id: number) => void }) {
  if (!items.length) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[230] flex flex-col gap-2 items-center pointer-events-none">
      {items.map(f => <FeedbackToast key={f.id} f={f} onDismiss={() => onDismiss(f.id)} />)}
    </div>
  );
}
function FeedbackToast({ f, onDismiss }: { f: Feedback; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  const ok = f.tipo === "success";
  return (
    <div className={`pointer-events-auto flex items-center gap-2.5 rounded-xl border px-4 py-3 shadow-xl text-sm font-medium bg-white dark:bg-slate-800 border-l-4 ${ok ? "border-l-emerald-500" : "border-l-rose-500"} border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100`}>
      {ok ? <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" /> : <AlertTriangle size={16} className="text-rose-500 flex-shrink-0" />}
      <span>{f.mensaje}</span>
      <button onClick={onDismiss} className="ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={13} /></button>
    </div>
  );
}
