"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, getDocs, Timestamp } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { NotificacionFallecido } from "@/types";
import type { Paciente, AtencionEmergencia } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { DateField } from "@/components/ui/DateField";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { toDate } from "@/lib/pacientes/helpers";
import { condicionEgreso, CONDICION_LABEL } from "@/lib/emergencia/helpers";
import {
  HeartPulse, Plus, CheckCircle2, AlertCircle, X,
  Search, Loader2, BedDouble, Ambulance, ClipboardCheck, Clock3, FileText, ChevronRight, Info,
} from "lucide-react";

// Origen del fallecido: paciente hospitalizado (activo) o atención de emergencia.
type FuenteFallecido = "activo" | "emergencia";
interface SeleccionFallecido {
  nombre: string;
  expediente: string;
  servicio: string;
  cama: string;
  origen: FuenteFallecido;
  pacienteId?: string;
  atencionEmergenciaId?: string;
}

const toDtLocal = (d?: Date | null) => {
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";

type ModalState = { type: "success"; expediente: string; nombre: string } | { type: "error"; message: string } | null;

export default function MedicoFallecidosPage() {
  const { user, profile } = useAuth();
  const [notificaciones, setNotificaciones] = useState<NotificacionFallecido[]>([]);
  const [busquedaExpediente, setBusquedaExpediente] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);

  // Estado de búsqueda de paciente
  const [fuente, setFuente] = useState<FuenteFallecido>("activo");
  const [expBusqueda, setExpBusqueda] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<Paciente[]>([]);
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [atencion, setAtencion] = useState<AtencionEmergencia | null>(null);
  const [atencionResultados, setAtencionResultados] = useState<AtencionEmergencia[]>([]);
  const [errorBusqueda, setErrorBusqueda] = useState("");

  // Selección unificada (venga de activos o de emergencia).
  const sel: SeleccionFallecido | null = paciente
    ? {
        nombre: `${paciente.apellidos}, ${paciente.nombres}`,
        expediente: paciente.expediente,
        servicio: paciente.servicioActual,
        cama: paciente.camaActual || "",
        origen: "activo",
        pacienteId: paciente.id,
      }
    : atencion
    ? {
        nombre: atencion.pacienteNombre,
        expediente: atencion.expediente,
        servicio: "Emergencia",
        cama: "",
        origen: "emergencia",
        atencionEmergenciaId: atencion.id,
      }
    : null;

  // Campos de la notificación
  const [fechaDefuncion, setFechaDefuncion] = useState("");
  const [causaMuerte, setCausaMuerte] = useState("");

  // Validación: la defunción debe caer dentro de la estancia y no en el futuro
  // (atrapa años mal tecleados en el datetime-local, ej. 2025 en vez de 2026).
  const fechaIngresoSel = paciente ? toDate(paciente.fechaIngreso) : atencion?.fechaHoraIngreso;
  const errorFecha = (() => {
    if (!fechaDefuncion) return null;
    const d = new Date(fechaDefuncion);
    if (isNaN(d.getTime())) return "La fecha ingresada no es válida.";
    if (d > new Date()) return "La fecha de defunción no puede estar en el futuro. Revisa el año y la hora.";
    if (fechaIngresoSel && d < fechaIngresoSel)
      return `La fecha de defunción no puede ser anterior al ingreso del paciente (${fechaIngresoSel.toLocaleString("es-SV", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}). Revisa el año.`;
    return null;
  })();

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "notificaciones_fallecidos"), where("medicoId", "==", user.uid));
    return onSnapshot(q, s => {
      const docs = s.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionFallecido));
      docs.sort((a, b) => {
        const at = (a.creadoEn as { toDate?: () => Date }).toDate?.()?.getTime() ?? 0;
        const bt = (b.creadoEn as { toDate?: () => Date }).toDate?.()?.getTime() ?? 0;
        return bt - at;
      });
      setNotificaciones(docs);
    });
  }, [user]);

  const resetForm = () => {
    setExpBusqueda("");
    setResultados([]);
    setPaciente(null);
    setAtencion(null);
    setAtencionResultados([]);
    setErrorBusqueda("");
    setFechaDefuncion("");
    setCausaMuerte("");
  };

  const cambiarFuente = (f: FuenteFallecido) => {
    setFuente(f);
    setExpBusqueda("");
    setResultados([]);
    setAtencionResultados([]);
    setPaciente(null);
    setAtencion(null);
    setErrorBusqueda("");
  };

  // Al elegir una atención de emergencia, precarga fecha (de alta/egreso) y causa (diagnóstico).
  const elegirAtencion = (a: AtencionEmergencia) => {
    setAtencion(a);
    setAtencionResultados([]);
    setFechaDefuncion(toDtLocal(a.fechaHoraAltaIngreso));
    setCausaMuerte(a.diagnostico ?? "");
  };

  const buscar = async () => {
    const val = expBusqueda.trim();
    if (!val) return;
    setBuscando(true);
    setErrorBusqueda("");
    setResultados([]);
    setAtencionResultados([]);
    setPaciente(null);
    setAtencion(null);

    try {
      if (fuente === "activo") {
        const snap = await getDocs(query(
          collection(db, "pacientes"),
          where("expediente", "==", val),
          where("estado", "==", "activo"),
        ));
        if (snap.empty) {
          setErrorBusqueda(`No se encontró ningún paciente activo con el expediente "${val}". Si murió en emergencia (sin haber ingresado), cambia el origen a "Emergencia".`);
        } else {
          const found = snap.docs.map(d => ({ id: d.id, ...d.data() } as Paciente));
          if (found.length === 1) setPaciente(found[0]); else setResultados(found);
        }
      } else {
        // Sin orderBy en la consulta para no depender de un índice compuesto
        // (expediente + fechaHoraIngreso); se ordena en cliente (pocas visitas).
        const snap = await getDocs(query(
          collection(db, "atenciones_emergencia"),
          where("expediente", "==", val),
        ));
        if (snap.empty) {
          setErrorBusqueda(`No se encontró ninguna atención de emergencia con el expediente "${val}". Verifica que el reporte de emergencia ya se haya importado.`);
        } else {
          const found = snap.docs.map(d => {
            const data = d.data();
            return {
              id: d.id, ...data,
              fechaHoraIngreso: toDate(data.fechaHoraIngreso) ?? new Date(),
              fechaHoraAltaIngreso: toDate(data.fechaHoraAltaIngreso),
            } as AtencionEmergencia;
          });
          found.sort((a, b) => b.fechaHoraIngreso.getTime() - a.fechaHoraIngreso.getTime());
          if (found.length === 1) elegirAtencion(found[0]); else setAtencionResultados(found);
        }
      }
    } catch {
      setErrorBusqueda("Error al buscar. Verifica tu conexión e intenta de nuevo.");
    } finally {
      setBuscando(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !sel || !fechaDefuncion || errorFecha) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        pacienteNombre: sel.nombre,
        pacienteExpediente: sel.expediente,
        servicio: sel.servicio,
        cama: sel.cama || "",
        fechaDefuncion: Timestamp.fromDate(new Date(fechaDefuncion)),
        causaMuerte: causaMuerte.trim() || null,
        medicoId: user.uid,
        medicoNombre: profile.nombre,
        medicoJvpm: profile.jvpm || null,
        medicoServicio: profile.servicios?.join(" / ") || profile.servicio || "",
        estado: "pendiente",
        origen: sel.origen,
        // Nace explícitamente ABIERTO: la bandeja de ESDOMED consulta
        // `tramiteCerrado == false` en el servidor, y Firestore no devuelve los
        // documentos donde el campo no existe.
        tramiteCerrado: false,
        creadoEn: Timestamp.now(),
      };
      if (sel.pacienteId) payload.pacienteId = sel.pacienteId;
      if (sel.atencionEmergenciaId) payload.atencionEmergenciaId = sel.atencionEmergenciaId;
      await addDoc(collection(db, "notificaciones_fallecidos"), payload);
      setModal({ type: "success", expediente: sel.expediente, nombre: sel.nombre });
      resetForm();
      setShowForm(false);
    } catch (err) {
      setModal({ type: "error", message: err instanceof Error ? err.message : "No se pudo enviar la notificación." });
    } finally {
      setSaving(false);
    }
  };

  const displayList = notificaciones.filter(n => {
    if (busquedaExpediente && !(n.pacienteExpediente?.toLowerCase() ?? "").includes(busquedaExpediente.toLowerCase())) return false;
    if (fechaDesde || fechaHasta) {
      const d = ((n.creadoEn as unknown) as { toDate?: () => Date }).toDate?.() ?? n.creadoEn;
      if (fechaDesde && d < new Date(fechaDesde + "T00:00:00")) return false;
      if (fechaHasta && d > new Date(fechaHasta + "T23:59:59")) return false;
    }
    return true;
  });

  const pendientes = notificaciones.filter(n => n.estado === "pendiente").length;
  const confirmadas = notificaciones.filter(n => n.estado === "confirmado").length;

  const formatFecha = (ts: unknown) => {
    if (!ts) return "—";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleString("es-HN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Encabezado de tarea: deja claro qué se hará y a quién se notificará. */}
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#4a2430] via-[#713246] to-[#91435a] px-5 py-5 shadow-lg shadow-rose-950/20 md:px-7 md:py-6">
        <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full border border-white/10" />
        <div className="absolute bottom-[-5.5rem] right-16 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
              <HeartPulse size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white md:text-2xl font-heading">Notificar defunción</h1>
              <p className="mt-1 max-w-xl text-sm text-rose-50/90">Identifique al paciente, confirme los datos clínicos y envíe el aviso a ESDOMED.</p>
            </div>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-all ${
              showForm
                ? "bg-white/10 text-white ring-1 ring-white/30 hover:bg-white/20"
                : "bg-white text-rose-900 hover:bg-rose-50"
            }`}
          >
            {showForm ? <><X size={16} /> Cerrar registro</> : <><Plus size={16} /> Nueva notificación</>}
          </button>
        </div>
      </section>

      {/* Formulario */}
      {showForm && (
        <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 md:p-6">
          <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
            <aside className="rounded-2xl border border-cyan-100 bg-gradient-to-b from-cyan-50/80 via-white to-white p-4 dark:border-cyan-900/60 dark:from-cyan-950/30 dark:via-slate-900 dark:to-slate-900">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Flujo guiado</p>
              <ol className="space-y-4">
                <li className="flex gap-3">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${sel ? "bg-emerald-500 text-white" : "bg-cyan-600 text-white"}`}>{sel ? <CheckCircle2 size={15} /> : "1"}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Identificar</p>
                    <p className="mt-0.5 text-xs leading-4 text-slate-500">Busque por expediente y seleccione al paciente.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${sel && fechaDefuncion && !errorFecha ? "bg-emerald-500 text-white" : sel ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>{sel && fechaDefuncion && !errorFecha ? <CheckCircle2 size={15} /> : "2"}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Verificar datos</p>
                    <p className="mt-0.5 text-xs leading-4 text-slate-500">Confirme fecha, hora y causa clínica.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-50 text-xs font-bold text-rose-600 ring-1 ring-rose-100 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-900">3</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Notificar</p>
                    <p className="mt-0.5 text-xs leading-4 text-slate-500">El aviso se enviará directamente a ESDOMED.</p>
                  </div>
                </li>
              </ol>
              <div className="mt-5 rounded-xl border border-cyan-100 bg-white/80 p-3 text-xs leading-4 text-slate-500 dark:border-cyan-900/60 dark:bg-slate-900/70 dark:text-slate-400">
                <Info size={14} className="mb-1.5 text-cyan-600 dark:text-cyan-300" />
                Verifique el expediente antes de enviar: la notificación quedará registrada en el historial.
              </div>
            </aside>

            <div className="min-w-0 space-y-6">

          {/* Paso 1: Buscar paciente */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-600 text-xs font-bold text-white">1</span>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Identificar al paciente</p>
                <p className="text-xs text-slate-500">Elija el origen y busque el número de expediente.</p>
              </div>
            </div>

            {!sel && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {([
                  { v: "activo", l: "Hospitalización", d: "Paciente ingresado en un servicio", icon: BedDouble },
                  { v: "emergencia", l: "Emergencia", d: "Atención sin ingreso hospitalario", icon: Ambulance },
                ] as { v: FuenteFallecido; l: string; d: string; icon: typeof BedDouble }[]).map(({ v, l, d, icon: Icon }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => cambiarFuente(v)}
                    className={`group relative flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                      fuente === v
                        ? "border-cyan-300 bg-cyan-50 text-cyan-900 shadow-sm shadow-cyan-950/5 dark:border-cyan-700 dark:bg-cyan-950/35 dark:text-cyan-100"
                        : "border-slate-200 bg-white text-slate-600 hover:border-cyan-200 hover:bg-cyan-50/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-cyan-800"
                    }`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${fuente === v ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-500 group-hover:bg-cyan-100 group-hover:text-cyan-700 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-cyan-950"}`}>
                      <Icon size={18} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{l}</span>
                      <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{d}</span>
                    </span>
                    {fuente === v && <CheckCircle2 size={16} className="ml-auto shrink-0 text-cyan-600 dark:text-cyan-300" />}
                  </button>
                ))}
              </div>
            )}

            {!sel ? (
              <>
                {fuente === "emergencia" && (
                  <p className="text-xs text-slate-500 -mt-1">
                    Para quien falleció en emergencia sin haber ingresado a un servicio. Se toma de las atenciones de emergencia importadas.
                  </p>
                )}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-2 dark:border-slate-700 dark:bg-slate-800/50 sm:flex sm:gap-2">
                  <input
                    type="text"
                    value={expBusqueda}
                    onChange={e => { setExpBusqueda(e.target.value); setErrorBusqueda(""); }}
                    onKeyDown={e => e.key === "Enter" && buscar()}
                    placeholder="Número de expediente (ej: 1234-26)"
                    className={`${inputCls} bg-white dark:bg-slate-900`}
                  />
                  <button
                    type="button"
                    onClick={buscar}
                    disabled={buscando || !expBusqueda.trim()}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-cyan-500 dark:disabled:bg-cyan-800 sm:mt-0 sm:w-auto"
                  >
                    {buscando ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    Buscar
                  </button>
                </div>

                {errorBusqueda && (
                  <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700 dark:text-red-300">{errorBusqueda}</p>
                  </div>
                )}

                {resultados.length > 1 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Varios registros — selecciona uno:</p>
                    {resultados.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setPaciente(p); setResultados([]); }}
                        className="w-full text-left border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-all"
                      >
                        <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">{p.apellidos}, {p.nombres}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{p.servicioActual} — Cama {p.camaActual || "sin asignar"}</p>
                      </button>
                    ))}
                  </div>
                )}

                {atencionResultados.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Atenciones de emergencia — selecciona una:</p>
                    {atencionResultados.map(a => {
                      const cond = condicionEgreso(a.tipoEgreso);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => elegirAtencion(a)}
                          className="w-full text-left border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-rose-400 dark:hover:border-rose-600 hover:bg-rose-50/50 dark:hover:bg-rose-900/20 transition-all"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">{a.pacienteNombre}</p>
                            <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${cond === "fallecido" ? "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
                              {CONDICION_LABEL[cond]}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Ingreso a emergencia: {a.fechaHoraIngreso.toLocaleString("es-SV", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
                            {a.diagnostico ? ` · ${a.diagnostico}` : ""}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-blue-50/80 to-white p-4 dark:border-cyan-800 dark:from-cyan-950/40 dark:via-blue-950/20 dark:to-slate-900">
                  <div className="absolute bottom-0 left-0 top-0 w-1 bg-gradient-to-b from-cyan-500 to-blue-600" />
                  <div className="flex items-start gap-3 pl-1">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-sm shadow-cyan-600/30"><CheckCircle2 size={19} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-300">Paciente seleccionado</p>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{sel.nombre}</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">Expediente {sel.expediente}</p>
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      {sel.origen === "emergencia" ? (
                        <>
                          <Ambulance size={13} className="text-rose-400 shrink-0" />
                          <span className="text-slate-700 dark:text-slate-300 font-medium">Emergencia</span>
                          <span className="text-xs text-slate-400">· sin ingreso a hospitalización</span>
                        </>
                      ) : (
                        <>
                          <BedDouble size={13} className="text-slate-400 shrink-0" />
                          <span className="text-slate-700 dark:text-slate-300">
                            <span className="font-medium">{sel.servicio}</span>
                            {sel.cama
                              ? <> — Cama <span className="font-medium">{sel.cama}</span></>
                              : <span className="text-amber-600 dark:text-amber-400"> — sin cama asignada</span>}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setPaciente(null); setAtencion(null); setExpBusqueda(""); }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 transition-colors hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-100"
                >
                  Buscar otro expediente <ChevronRight size={13} />
                </button>
              </div>
            )}
          </div>

          {/* Paso 2: Detalles de la defunción */}
          {sel && (
            <form onSubmit={handleSubmit} className="space-y-5 border-t border-slate-200 pt-6 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-600 text-xs font-bold text-white">2</span>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Verificar datos de la defunción</p>
                  <p className="text-xs text-slate-500">La fecha y hora son obligatorias; la causa clínica es opcional.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/35 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">
                    Fecha y hora de defunción <span className="text-red-500">*</span>
                  </label>
                  <DateTimeField
                    value={fechaDefuncion}
                    onChange={setFechaDefuncion}
                    ariaLabel="Fecha y hora de defunción"
                    minDate={fechaIngresoSel}
                    maxDate={new Date()}
                  />
                  {errorFecha && (
                    <p className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400 mt-1.5">
                      <AlertCircle size={13} className="mt-0.5 shrink-0" />
                      {errorFecha}
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">
                    Causa de muerte <span className="text-slate-400 font-normal">(opcional)</span>
                  </label>
                  <textarea
                    value={causaMuerte}
                    onChange={e => setCausaMuerte(e.target.value)}
                    rows={3}
                    className={`${inputCls} resize-none`}
                    placeholder="Diagnóstico o causa de fallecimiento..."
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-rose-200 bg-rose-50/75 p-4 dark:border-rose-900/70 dark:bg-rose-950/25">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-900/60 dark:text-rose-300"><HeartPulse size={18} /></span>
                  <div>
                    <p className="text-sm font-bold text-rose-900 dark:text-rose-100">Paso 3 · Enviar notificación</p>
                    <p className="mt-0.5 text-xs leading-5 text-rose-700/90 dark:text-rose-200/80">Revise el paciente y la fecha antes de continuar. El aviso quedará disponible para el equipo ESDOMED.</p>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={saving || !fechaDefuncion || !!errorFecha}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 text-sm font-semibold text-white shadow-sm shadow-rose-600/25 transition-all hover:bg-rose-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 size={17} className="animate-spin" /> : <ClipboardCheck size={17} />}
                  {saving ? "Enviando notificación..." : "Enviar notificación a ESDOMED"}
                </button>
              </div>
            </form>
          )}
            </div>
          </div>
        </div>
      )}

      {/* Historial y filtros: los estados visibles evitan abrir registros para saber qué requiere seguimiento. */}
      <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 md:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Seguimiento</p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">Mis notificaciones</h2>
            <p className="mt-0.5 text-xs text-slate-500">Consulte el estado de los avisos enviados.</p>
          </div>
          <span className="text-xs font-medium text-slate-500">{displayList.length} {displayList.length === 1 ? "resultado" : "resultados"}</span>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-cyan-100 bg-cyan-50/70 px-3 py-2.5 dark:border-cyan-900/60 dark:bg-cyan-950/25">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-600 text-white"><FileText size={16} /></span>
            <div><p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{notificaciones.length}</p><p className="mt-1 text-[11px] font-medium text-slate-500">Enviadas</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5 dark:border-amber-900/60 dark:bg-amber-950/25">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white"><Clock3 size={16} /></span>
            <div><p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{pendientes}</p><p className="mt-1 text-[11px] font-medium text-slate-500">Pendientes</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 dark:border-emerald-900/60 dark:bg-emerald-950/25">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white"><CheckCircle2 size={16} /></span>
            <div><p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{confirmadas}</p><p className="mt-1 text-[11px] font-medium text-slate-500">Confirmadas</p></div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/50">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por expediente..."
            value={busquedaExpediente}
            onChange={e => setBusquedaExpediente(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Desde</span>
          <DateField value={fechaDesde} onChange={v => setFechaDesde(v)}
            placeholder="Desde" ariaLabel="Filtrar desde" clearable />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Hasta</span>
          <DateField value={fechaHasta} onChange={v => setFechaHasta(v)}
            placeholder="Hasta" ariaLabel="Filtrar hasta" clearable />
        </div>
        {(busquedaExpediente || fechaDesde || fechaHasta) && (
          <button
            onClick={() => { setBusquedaExpediente(""); setFechaDesde(""); setFechaHasta(""); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
          >
            <X size={12} /> Limpiar
          </button>
        )}
        </div>
      </section>

      {/* Lista */}
      <div className="space-y-3">
        {displayList.length === 0 && !showForm && (
          <p className="text-sm text-slate-500 py-10 text-center">
            {notificaciones.length === 0
              ? "No has enviado notificaciones de fallecido."
              : "Sin resultados para los filtros aplicados."}
          </p>
        )}
        {displayList.map(n => (
          <div
            key={n.id}
            className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.03] transition-all hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-md hover:shadow-cyan-950/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-800"
          >
            <span className={`absolute bottom-0 left-0 top-0 w-1 ${n.estado === "confirmado" ? "bg-emerald-500" : "bg-amber-400"}`} />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 pl-1">
                <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{n.pacienteNombre}</p>
                <p className="font-mono font-medium text-xs text-slate-500 mt-0.5">Exp. {n.pacienteExpediente}</p>
                <p className="text-xs text-slate-500 mt-1">{n.servicio} · Cama {n.cama}</p>
                <p className="text-xs text-slate-500 mt-0.5">Defunción: {formatFecha(n.fechaDefuncion)}</p>
                {n.causaMuerte && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">Causa: {n.causaMuerte}</p>
                )}
                {n.estado === "confirmado" && n.confirmadoPorNombre && (
                  <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                    Confirmado por {n.confirmadoPorNombre} · {formatFecha(n.confirmadoEn)}
                  </p>
                )}
              </div>
              <Badge estado={n.estado} />
            </div>
          </div>
        ))}
      </div>

      {/* Modal de resultado */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center text-center gap-4">
            {modal.type === "success" ? (
              <>
                <div className="w-14 h-14 bg-green-50 dark:bg-green-500/10 rounded-full flex items-center justify-center border border-green-200 dark:border-green-500/30">
                  <CheckCircle2 size={28} className="text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-base font-bold text-slate-900 dark:text-slate-100">Notificación enviada</p>
                  <p className="text-sm text-slate-500 mt-1">
                    La notificación del paciente{" "}
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{modal.nombre}</span>{" "}
                    (Exp. <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{modal.expediente}</span>)
                    fue enviada correctamente a ESDOMED.
                  </p>
                </div>
                <button
                  onClick={() => setModal(null)}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  Aceptar
                </button>
              </>
            ) : (
              <>
                <div className="w-14 h-14 bg-red-50 dark:bg-red-500/10 rounded-full flex items-center justify-center border border-red-200 dark:border-red-500/30">
                  <AlertCircle size={28} className="text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-base font-bold text-slate-900 dark:text-slate-100">Error al enviar</p>
                  <p className="text-sm text-slate-500 mt-1">{modal.message}</p>
                </div>
                <button
                  onClick={() => setModal(null)}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  Cerrar
                </button>
              </>
            )}
            <button
              onClick={() => setModal(null)}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
