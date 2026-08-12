"use client";

import { useEffect, useState } from "react";
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, doc, getDoc,
  Timestamp, serverTimestamp,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { DateField } from "@/components/ui/DateField";
import { BuscadorPacienteActivo } from "@/components/pacientes/BuscadorPacienteActivo";
import { CIE10Combobox } from "@/components/ui/CIE10Combobox";
import { calcularEdad, toDate, ESTADO_LABEL as ESTADO_PACIENTE_LABEL } from "@/lib/pacientes/helpers";
import {
  TIPOS_CASO, TIPO_CASO_LABEL, TIPO_CASO_AYUDA, TIPO_CASO_CHIP,
  ESTADO_LABEL, ESTADO_CHIP, esMenorDeEdad, INSTANCIA_LABEL,
  NOTA_MIN_SIN_CIE, NOTA_MAX, causaExternaCoincide, CAUSA_EXTERNA_AVISO,
  validarFechaHecho, duplicadosDeExpediente,
} from "@/lib/conapinaFgr";
import {
  ShieldAlert, Plus, X, CheckCircle2, AlertCircle, AlertTriangle, Search, Loader2,
  BedDouble, Car, HeartCrack, ClipboardCheck, Clock3, FileText, ChevronRight, Info,
  StickyNote, Copy, Ban, CalendarDays, Landmark,
} from "lucide-react";
import type { Paciente, DiagnosticoCIE, TipoCasoConapinaFgr, NotificacionConapinaFgr } from "@/types";

const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";

const SIN_DIAGNOSTICO: DiagnosticoCIE = { codigo: "", descripcion: "" };
const ICONO_CASO = { violencia: ShieldAlert, accidente_transito: Car, intento_suicida: HeartCrack } as const;
const MOTIVO_ANULACION_MIN = 10;

// El servidor resuelve creadoEn (serverTimestamp); mientras la escritura está
// pendiente llega null → esos documentos son los más nuevos, no los más viejos.
const msDe = (v: unknown) => (v as { toDate?: () => Date })?.toDate?.()?.getTime() ?? Number.MAX_SAFE_INTEGER;

type ModalState =
  | { type: "success"; expediente: string; nombre: string }
  | { type: "error"; message: string }
  | null;

export default function MedicoConapinaFgrPage() {
  const { user, profile } = useAuth();

  const [notificaciones, setNotificaciones] = useState<NotificacionConapinaFgr[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);

  // Campos de la notificación
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [tipoCaso, setTipoCaso] = useState<TipoCasoConapinaFgr | "">("");
  const [fechaHecho, setFechaHecho] = useState("");
  const [diagnostico, setDiagnostico] = useState<DiagnosticoCIE>(SIN_DIAGNOSTICO);
  const [causaExterna, setCausaExterna] = useState<DiagnosticoCIE>(SIN_DIAGNOSTICO);
  const [nota, setNota] = useState("");
  // Segundo clic requerido cuando el paciente ya no está activo al enviar.
  const [avisoInactivo, setAvisoInactivo] = useState<string | null>(null);

  // Anulación
  const [anulando, setAnulando] = useState<NotificacionConapinaFgr | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [anulandoSave, setAnulandoSave] = useState(false);
  const [errAnular, setErrAnular] = useState<string | null>(null);

  // Filtros del historial
  const [busquedaExpediente, setBusquedaExpediente] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const fechaNacimiento = paciente ? toDate(paciente.fechaNacimiento) ?? null : null;
  const edad = calcularEdad(fechaNacimiento);

  // Sugerencia: el diagnóstico que ya trae el expediente, por si es el mismo
  // hecho que se está notificando. Se ofrece, nunca se rellena solo.
  const sugerencia = paciente?.ultimoDiagnostico?.codigo
    ? paciente.ultimoDiagnostico
    : paciente?.diagnosticoIngreso?.codigo
      ? paciente.diagnosticoIngreso
      : null;
  const sugerenciaCausa = paciente?.causaExterna?.codigo ? paciente.causaExterna : null;

  // Duplicados: se resuelve contra las notificaciones que ya están en memoria
  // (las del propio médico), sin lecturas extra. El comité ve los cruzados
  // entre médicos, que aquí no se pueden consultar por reglas.
  const duplicados = paciente ? duplicadosDeExpediente(notificaciones, paciente.expediente) : [];

  const notaLimpia = nota.trim();
  const errorFechaHecho = validarFechaHecho(fechaHecho, fechaNacimiento);
  const errorNota =
    notaLimpia.length > NOTA_MAX
      ? `La nota no puede pasar de ${NOTA_MAX} caracteres.`
      : !diagnostico.codigo && notaLimpia.length > 0 && notaLimpia.length < NOTA_MIN_SIN_CIE
        ? `Sin código CIE-10 la nota es el único dato clínico: describe el caso con al menos ${NOTA_MIN_SIN_CIE} caracteres.`
        : null;
  const hayDiagnostico = !!diagnostico.codigo || notaLimpia.length >= NOTA_MIN_SIN_CIE;
  const avisoCausaExterna =
    tipoCaso && causaExterna.codigo && !causaExternaCoincide(tipoCaso, causaExterna.codigo)
      ? CAUSA_EXTERNA_AVISO[tipoCaso]
      : null;

  const puedeEnviar = !!paciente && !!tipoCaso && !!fechaHecho && !errorFechaHecho && hayDiagnostico && !errorNota;

  useEffect(() => {
    if (!user) return;
    // Sin orderBy: se ordena en cliente para no exigir índice compuesto.
    const q = query(collection(db, "notificaciones_conapina_fgr"), where("medicoId", "==", user.uid));
    return onSnapshot(q, s => {
      const docs = s.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionConapinaFgr));
      docs.sort((a, b) => msDe(b.creadoEn) - msDe(a.creadoEn));
      setNotificaciones(docs);
    });
  }, [user]);

  const resetForm = () => {
    setPaciente(null);
    setTipoCaso("");
    setFechaHecho("");
    setDiagnostico(SIN_DIAGNOSTICO);
    setCausaExterna(SIN_DIAGNOSTICO);
    setNota("");
    setAvisoInactivo(null);
  };

  const seleccionarPaciente = (p: Paciente | null) => {
    setPaciente(p);
    setDiagnostico(SIN_DIAGNOSTICO);
    setCausaExterna(SIN_DIAGNOSTICO);
    setAvisoInactivo(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !paciente || !tipoCaso || !puedeEnviar) return;
    setSaving(true);
    const nombre = `${paciente.apellidos}, ${paciente.nombres}`;
    let servicio = paciente.servicioActual ?? "";
    let cama = paciente.camaActual ?? "";
    try {
      // Entre la búsqueda y el envío el paciente pudo egresar. No se bloquea (el
      // caso sigue siendo notificable), pero se avisa y se pide un segundo clic;
      // de paso refresca el snapshot de servicio y cama.
      if (paciente.id && !avisoInactivo) {
        const snap = await getDoc(doc(db, "pacientes", paciente.id));
        const data = snap.data() as Paciente | undefined;
        if (data) {
          servicio = data.servicioActual ?? servicio;
          cama = data.camaActual ?? "";
          if (data.estado !== "activo") {
            setAvisoInactivo(
              `Este expediente ya no está activo (${ESTADO_PACIENTE_LABEL[data.estado] ?? data.estado}). ` +
              "Verifica que sea el paciente correcto: puedes enviar la notificación de todos modos.",
            );
            setSaving(false);
            return;
          }
        }
      }

      await addDoc(collection(db, "notificaciones_conapina_fgr"), {
        medicoId: user.uid,
        medicoNombre: profile.nombre,
        medicoServicio: profile.servicios?.join(" / ") || profile.servicio || "",
        medicoJvpm: profile.jvpm || "",
        pacienteId: paciente.id ?? null,
        pacienteNombre: nombre,
        pacienteExpediente: paciente.expediente,
        pacienteEdad: edad,
        servicio,
        cama,
        tipoCaso,
        fechaHecho: Timestamp.fromDate(new Date(fechaHecho + "T00:00:00")),
        diagnostico: diagnostico.codigo ? diagnostico : null,
        causaExterna: causaExterna.codigo ? causaExterna : null,
        nota: notaLimpia || null,
        estado: "pendiente",
        // serverTimestamp: las reglas exigen creadoEn == request.time para que
        // nadie pueda antedatar una notificación.
        creadoEn: serverTimestamp(),
        actualizadoEn: serverTimestamp(),
      });
      setModal({ type: "success", expediente: paciente.expediente, nombre });
      resetForm();
      setShowForm(false);
    } catch (err) {
      setModal({ type: "error", message: err instanceof Error ? err.message : "No se pudo enviar la notificación." });
    } finally {
      setSaving(false);
    }
  };

  const anular = async () => {
    if (!anulando?.id || !user || !profile) return;
    const motivo = motivoAnulacion.trim();
    if (motivo.length < MOTIVO_ANULACION_MIN) {
      setErrAnular(`Explica el motivo con al menos ${MOTIVO_ANULACION_MIN} caracteres.`);
      return;
    }
    setAnulandoSave(true);
    setErrAnular(null);
    try {
      await updateDoc(doc(db, "notificaciones_conapina_fgr", anulando.id), {
        estado: "anulado",
        anuladoPor: user.uid,
        anuladoPorNombre: profile.nombre,
        anuladoEn: serverTimestamp(),
        motivoAnulacion: motivo,
        actualizadoEn: serverTimestamp(),
      });
      setAnulando(null);
      setMotivoAnulacion("");
    } catch (err) {
      setErrAnular(err instanceof Error ? err.message : "No se pudo anular la notificación.");
    } finally {
      setAnulandoSave(false);
    }
  };

  const formatFecha = (ts: unknown) => {
    if (!ts) return "—";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleString("es-SV", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  };
  const formatDia = (ts: unknown) => {
    if (!ts) return "—";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });
  };

  const displayList = notificaciones.filter(n => {
    if (busquedaExpediente) {
      const q = busquedaExpediente.toLowerCase();
      if (!(n.pacienteExpediente?.toLowerCase() ?? "").includes(q) &&
          !(n.pacienteNombre?.toLowerCase() ?? "").includes(q) &&
          !(n.diagnostico?.descripcion?.toLowerCase() ?? "").includes(q) &&
          !(n.diagnostico?.codigo?.toLowerCase() ?? "").includes(q)) return false;
    }
    if (fechaDesde || fechaHasta) {
      const d = ((n.creadoEn as unknown) as { toDate?: () => Date }).toDate?.() ?? (n.creadoEn as Date);
      if (!d) return true;   // escritura recién enviada, aún sin sello del servidor
      if (fechaDesde && d < new Date(fechaDesde + "T00:00:00")) return false;
      if (fechaHasta && d > new Date(fechaHasta + "T23:59:59")) return false;
    }
    return true;
  });

  const porRecibir = notificaciones.filter(n => n.estado === "pendiente").length;
  // Para el médico "recibidas" incluye las ya avisadas: desde su lado el caso
  // dejó de estar en el aire en cuanto el comité lo tomó.
  const recibidas = notificaciones.filter(n => n.estado === "confirmado" || n.estado === "avisado").length;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Encabezado de tarea: deja claro qué se notifica y a quién le llega. */}
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#4a3312] via-amber-700 to-orange-600 px-5 py-5 shadow-lg shadow-amber-950/20 md:px-7 md:py-6">
        <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full border border-white/10" />
        <div className="absolute bottom-[-5.5rem] right-16 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
              <ShieldAlert size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white md:text-2xl font-heading">Notificación CONAPINA / FGR</h1>
              <p className="mt-1 max-w-xl text-sm text-amber-50/90">
                Reporte los casos de violencia o accidente de tránsito: el aviso llega al Comité de Lesiones Intencionales para su gestión.
              </p>
            </div>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-all ${
              showForm
                ? "bg-white/10 text-white ring-1 ring-white/30 hover:bg-white/20"
                : "bg-white text-amber-900 hover:bg-amber-50"
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
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${paciente ? "bg-emerald-500 text-white" : "bg-cyan-600 text-white"}`}>
                    {paciente ? <CheckCircle2 size={15} /> : "1"}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Identificar</p>
                    <p className="mt-0.5 text-xs leading-4 text-slate-500">Busque y seleccione al paciente activo.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    puedeEnviar ? "bg-emerald-500 text-white" : paciente ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                  }`}>
                    {puedeEnviar ? <CheckCircle2 size={15} /> : "2"}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Clasificar</p>
                    <p className="mt-0.5 text-xs leading-4 text-slate-500">Tipo de caso, fecha del hecho y diagnóstico.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-50 text-xs font-bold text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900">3</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Notificar</p>
                    <p className="mt-0.5 text-xs leading-4 text-slate-500">El aviso se enviará directamente al comité.</p>
                  </div>
                </li>
              </ol>
              <div className="mt-5 rounded-xl border border-cyan-100 bg-white/80 p-3 text-xs leading-4 text-slate-500 dark:border-cyan-900/60 dark:bg-slate-900/70 dark:text-slate-400">
                <Info size={14} className="mb-1.5 text-cyan-600 dark:text-cyan-300" />
                Si el paciente es menor de edad, el caso también corresponde a CONAPINA. El comité define a qué instancia se remite.
              </div>
            </aside>

            <div className="min-w-0 space-y-6">
              {/* Paso 1: Identificar al paciente */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-600 text-xs font-bold text-white">1</span>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Identificar al paciente</p>
                    <p className="text-xs text-slate-500">Busque por servicio, expediente o cama.</p>
                  </div>
                </div>

                {!paciente ? (
                  <BuscadorPacienteActivo value={paciente} onSelect={seleccionarPaciente} accent="amber" />
                ) : (
                  <div className="space-y-3">
                    <div className="relative overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-blue-50/80 to-white p-4 dark:border-cyan-800 dark:from-cyan-950/40 dark:via-blue-950/20 dark:to-slate-900">
                      <div className="absolute bottom-0 left-0 top-0 w-1 bg-gradient-to-b from-cyan-500 to-blue-600" />
                      <div className="flex items-start gap-3 pl-1">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-sm shadow-cyan-600/30"><CheckCircle2 size={19} /></span>
                        <div className="flex-1 min-w-0">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-300">Paciente seleccionado</p>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{paciente.apellidos}, {paciente.nombres}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                              Expediente {paciente.expediente}{edad !== null ? ` · ${edad} años` : ""}
                            </p>
                            {esMenorDeEdad(edad) && (
                              <span className="rounded border border-violet-200 bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-800 dark:bg-violet-900/50 dark:text-violet-300">
                                Menor de edad
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-sm">
                            <BedDouble size={13} className="text-slate-400 shrink-0" />
                            <span className="text-slate-700 dark:text-slate-300">
                              <span className="font-medium">{paciente.servicioActual}</span>
                              {paciente.camaActual
                                ? <> — Cama <span className="font-medium">{paciente.camaActual}</span></>
                                : <span className="text-amber-600 dark:text-amber-400"> — sin cama asignada</span>}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sin fecha de nacimiento no se puede saber si aplica CONAPINA. */}
                    {edad === null && (
                      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
                        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <p className="text-xs leading-5 text-amber-800 dark:text-amber-200">
                          El expediente no tiene fecha de nacimiento registrada, así que el comité no podrá ver si el
                          paciente es menor de edad. Puede notificar igual, pero conviene completar el dato en el expediente.
                        </p>
                      </div>
                    )}

                    {/* Duplicados propios (los de otros médicos los detecta el comité). */}
                    {duplicados.length > 0 && (
                      <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
                        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <div className="min-w-0 text-xs leading-5 text-amber-800 dark:text-amber-200">
                          <p className="font-semibold">
                            Ya notificaste este expediente {duplicados.length > 1 ? `${duplicados.length} veces` : "antes"}.
                          </p>
                          <ul className="mt-1 space-y-0.5">
                            {duplicados.slice(0, 3).map(d => (
                              <li key={d.id}>
                                · {TIPO_CASO_LABEL[d.tipoCaso]} — {d.fechaHecho ? `hecho del ${formatDia(d.fechaHecho)}` : "sin fecha del hecho"}
                                {" "}(enviada {formatDia(d.creadoEn)})
                              </li>
                            ))}
                          </ul>
                          <p className="mt-1">Si es un hecho distinto, continúe; si no, cierre el registro.</p>
                        </div>
                      </div>
                    )}

                    <button type="button" onClick={() => seleccionarPaciente(null)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 transition-colors hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-100">
                      Buscar otro expediente <ChevronRight size={13} />
                    </button>
                  </div>
                )}
              </div>

              {/* Paso 2: Clasificar el caso */}
              {paciente && (
                <form onSubmit={handleSubmit} className="space-y-5 border-t border-slate-200 pt-6 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-600 text-xs font-bold text-white">2</span>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Clasificar el caso</p>
                      <p className="text-xs text-slate-500">Tipo y fecha son obligatorios; describa el diagnóstico con CIE-10 o en la nota.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {TIPOS_CASO.map(t => {
                      const Icono = ICONO_CASO[t];
                      const activo = tipoCaso === t;
                      return (
                        <button key={t} type="button" onClick={() => setTipoCaso(t)}
                          className={`group relative flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                            activo
                              ? "border-amber-300 bg-amber-50 text-amber-900 shadow-sm shadow-amber-950/5 dark:border-amber-700 dark:bg-amber-950/35 dark:text-amber-100"
                              : "border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:bg-amber-50/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-amber-800"
                          }`}>
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                            activo ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-500 group-hover:bg-amber-100 group-hover:text-amber-700 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-amber-950"
                          }`}>
                            <Icono size={18} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{TIPO_CASO_LABEL[t]}</span>
                            <span className="mt-0.5 block text-xs leading-4 text-slate-500 dark:text-slate-400">{TIPO_CASO_AYUDA[t]}</span>
                          </span>
                          {activo && <CheckCircle2 size={16} className="ml-auto shrink-0 text-amber-600 dark:text-amber-300" />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/35">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">
                        Fecha del hecho <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <CalendarDays size={15} className="shrink-0 text-slate-400" />
                        <DateField value={fechaHecho} onChange={setFechaHecho} clearable
                          placeholder="Fecha del hecho" ariaLabel="Fecha del hecho" maxDate={new Date()} />
                      </div>
                      <p className="mt-1.5 text-xs text-slate-400">
                        Cuándo ocurrió el hecho, no cuándo se notifica. Si no se conoce con exactitud, use la fecha aproximada o la de detección.
                      </p>
                      {errorFechaHecho && (
                        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                          <AlertCircle size={13} className="mt-0.5 shrink-0" />
                          {errorFechaHecho}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">
                        Diagnóstico clínico (CIE-10)
                      </label>
                      <CIE10Combobox value={diagnostico} onChange={setDiagnostico}
                        placeholder="Buscar diagnóstico o código CIE-10..." />
                      {sugerencia && !diagnostico.codigo && (
                        <button type="button" onClick={() => setDiagnostico(sugerencia)}
                          className="mt-2 flex items-start gap-1.5 text-left text-xs text-slate-500 transition-colors hover:text-amber-700 dark:hover:text-amber-400">
                          <Copy size={12} className="mt-0.5 shrink-0 text-slate-400" />
                          <span>
                            Usar el del expediente:{" "}
                            <span className="font-mono font-semibold">{sugerencia.codigo}</span> — {sugerencia.descripcion}
                          </span>
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">
                        Causa externa (CIE-10) <span className="font-normal text-slate-400">(opcional)</span>
                      </label>
                      <CIE10Combobox value={causaExterna} onChange={setCausaExterna}
                        placeholder="Código del hecho: V01–V99 tránsito, X85–Y09 agresiones..." />
                      <p className="mt-1.5 text-xs text-slate-400">
                        El diagnóstico suele ser la lesión (fractura, trauma); este campo guarda el hecho que la causó.
                      </p>
                      {sugerenciaCausa && !causaExterna.codigo && (
                        <button type="button" onClick={() => setCausaExterna(sugerenciaCausa)}
                          className="mt-2 flex items-start gap-1.5 text-left text-xs text-slate-500 transition-colors hover:text-amber-700 dark:hover:text-amber-400">
                          <Copy size={12} className="mt-0.5 shrink-0 text-slate-400" />
                          <span>
                            Usar la del expediente:{" "}
                            <span className="font-mono font-semibold">{sugerenciaCausa.codigo}</span> — {sugerenciaCausa.descripcion}
                          </span>
                        </button>
                      )}
                      {avisoCausaExterna && (
                        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                          {avisoCausaExterna} Revise que el código sea el correcto — puede enviarlo de todos modos.
                        </p>
                      )}
                    </div>

                    <div>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <label className="text-xs font-medium text-slate-500">
                          Nota <span className="font-normal text-slate-400">(si no encuentra el código exacto)</span>
                        </label>
                        <span className={`text-[11px] tabular-nums ${notaLimpia.length > NOTA_MAX ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-400"}`}>
                          {notaLimpia.length}/{NOTA_MAX}
                        </span>
                      </div>
                      <textarea value={nota} onChange={e => setNota(e.target.value)} rows={4}
                        maxLength={NOTA_MAX + 200}
                        className={`${inputCls} resize-none`}
                        placeholder="Describa el hecho o el diagnóstico que no aparece en el catálogo CIE-10..." />
                      {errorNota && (
                        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                          <AlertCircle size={13} className="mt-0.5 shrink-0" />
                          {errorNota}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-amber-200 bg-amber-50/75 p-4 dark:border-amber-900/70 dark:bg-amber-950/25">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300"><ShieldAlert size={18} /></span>
                      <div>
                        <p className="text-sm font-bold text-amber-900 dark:text-amber-100">Paso 3 · Enviar notificación</p>
                        <p className="mt-0.5 text-xs leading-5 text-amber-800/90 dark:text-amber-200/80">
                          Revise el paciente y el diagnóstico antes de continuar. El aviso quedará disponible para el comité.
                        </p>
                      </div>
                    </div>

                    {!hayDiagnostico && !errorNota && (
                      <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                        <AlertCircle size={13} className="mt-0.5 shrink-0" />
                        Indique un diagnóstico CIE-10 o describa el caso en la nota ({NOTA_MIN_SIN_CIE} caracteres como mínimo).
                      </p>
                    )}

                    {avisoInactivo && (
                      <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-white/70 p-3 dark:border-amber-800 dark:bg-slate-900/60">
                        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <p className="text-xs leading-5 text-amber-800 dark:text-amber-200">{avisoInactivo}</p>
                      </div>
                    )}

                    <button type="submit" disabled={saving || !puedeEnviar}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700 py-3 text-sm font-semibold text-white shadow-sm shadow-amber-700/25 transition-all hover:bg-amber-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">
                      {saving ? <Loader2 size={17} className="animate-spin" /> : <ClipboardCheck size={17} />}
                      {saving
                        ? "Enviando notificación..."
                        : avisoInactivo
                          ? "Enviar de todos modos"
                          : "Enviar notificación al comité"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Historial y filtros */}
      <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 md:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Seguimiento</p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">Mis notificaciones</h2>
            <p className="mt-0.5 text-xs text-slate-500">Consulte el estado de los avisos enviados al comité.</p>
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
            <div><p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{porRecibir}</p><p className="mt-1 text-[11px] font-medium text-slate-500">Por recibir</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 dark:border-emerald-900/60 dark:bg-emerald-950/25">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white"><CheckCircle2 size={16} /></span>
            <div><p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{recibidas}</p><p className="mt-1 text-[11px] font-medium text-slate-500">Recibidas</p></div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="text" placeholder="Buscar por expediente, paciente o diagnóstico..." value={busquedaExpediente} onChange={e => setBusquedaExpediente(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Desde</span>
            <DateField value={fechaDesde} onChange={setFechaDesde} clearable placeholder="Desde" ariaLabel="Fecha desde" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Hasta</span>
            <DateField value={fechaHasta} onChange={setFechaHasta} clearable placeholder="Hasta" ariaLabel="Fecha hasta" />
          </div>
          {(busquedaExpediente || fechaDesde || fechaHasta) && (
            <button onClick={() => { setBusquedaExpediente(""); setFechaDesde(""); setFechaHasta(""); }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors">
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
              ? "No has enviado notificaciones CONAPINA/FGR."
              : "Sin resultados para los filtros aplicados."}
          </p>
        )}
        {displayList.map(n => {
          const Icono = ICONO_CASO[n.tipoCaso] ?? ShieldAlert;
          const anulada = n.estado === "anulado";
          return (
            <article key={n.id}
              className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.03] transition-all dark:border-slate-800 dark:bg-slate-900 md:p-5 ${
                anulada ? "opacity-70" : "hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-md hover:shadow-amber-950/5 dark:hover:border-amber-800"
              }`}>
              <span className={`absolute bottom-0 left-0 top-0 w-1 ${
                n.estado === "avisado" ? "bg-emerald-500"
                  : n.estado === "confirmado" ? "bg-blue-500"
                  : anulada ? "bg-slate-300 dark:bg-slate-700"
                  : "bg-amber-400"
              }`} />
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 pl-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TIPO_CASO_CHIP[n.tipoCaso]}`}>
                      <Icono size={12} /> {TIPO_CASO_LABEL[n.tipoCaso]}
                    </span>
                    {esMenorDeEdad(n.pacienteEdad) && (
                      <span className="rounded border border-violet-200 bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-800 dark:bg-violet-900/50 dark:text-violet-300">
                        Menor de edad
                      </span>
                    )}
                    <span className="text-xs font-medium text-slate-400">Enviada {formatFecha(n.creadoEn)}</span>
                  </div>

                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{n.pacienteNombre}</p>
                  <p className="mt-0.5 font-mono text-xs font-medium text-slate-500">Exp. {n.pacienteExpediente}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {n.servicio || "—"}{n.cama ? ` · Cama ${n.cama}` : ""}
                    {typeof n.pacienteEdad === "number" ? ` · ${n.pacienteEdad} años` : ""}
                  </p>
                  {/* Las notificaciones anteriores a este campo no tienen fechaHecho. */}
                  {n.fechaHecho && <p className="mt-0.5 text-xs text-slate-500">Hecho del {formatDia(n.fechaHecho)}</p>}

                  {(n.diagnostico?.codigo || n.causaExterna?.codigo) && (
                    <div className="mt-2.5 space-y-1.5 rounded-xl border border-blue-100 bg-blue-50/70 p-2.5 dark:border-blue-900/60 dark:bg-blue-950/25">
                      {n.diagnostico?.codigo && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Diagnóstico</p>
                          <p className="mt-0.5 text-xs text-slate-800 dark:text-slate-100">
                            <span className="font-mono font-semibold">{n.diagnostico.codigo}</span> · {n.diagnostico.descripcion}
                          </p>
                        </div>
                      )}
                      {n.causaExterna?.codigo && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Causa externa</p>
                          <p className="mt-0.5 text-xs text-slate-800 dark:text-slate-100">
                            <span className="font-mono font-semibold">{n.causaExterna.codigo}</span> · {n.causaExterna.descripcion}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {n.nota && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
                      <StickyNote size={12} className="mt-0.5 shrink-0 text-slate-400" />
                      <span className="italic whitespace-pre-wrap">{n.nota}</span>
                    </p>
                  )}

                  {n.revisadoPorNombre && (
                    <div className="mt-2">
                      <span className="rounded border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-400">
                        Recibido por: {n.revisadoPorNombre}
                      </span>
                    </div>
                  )}

                  {n.notasComite && (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-3.5 dark:border-amber-900/60 dark:bg-amber-950/35">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">Observación del comité</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{n.notasComite}</p>
                    </div>
                  )}

                  {/* Cierre del circuito: el médico ve que el aviso se dio. */}
                  {n.estado === "avisado" && n.avisoInstancia && (
                    <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3.5 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        <Landmark size={12} /> Aviso dado a {INSTANCIA_LABEL[n.avisoInstancia]}
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {formatDia(n.avisoFecha)}{n.avisoLugar ? ` · ${n.avisoLugar}` : ""}
                        {n.avisoRecibidoPor ? ` · recibió ${n.avisoRecibidoPor}` : ""}
                      </p>
                    </div>
                  )}

                  {anulada && n.motivoAnulacion && (
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-800/50">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Anulada · {formatFecha(n.anuladoEn)}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{n.motivoAnulacion}</p>
                    </div>
                  )}

                  {n.estado === "pendiente" && (
                    <button
                      onClick={() => { setAnulando(n); setMotivoAnulacion(""); setErrAnular(null); }}
                      className="mt-3 flex items-center gap-1.5 rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-rose-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-300">
                      <Ban size={12} /> Anular
                    </button>
                  )}
                </div>
                <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTADO_CHIP[n.estado]}`}>
                  {ESTADO_LABEL[n.estado]}
                </span>
              </div>
            </article>
          );
        })}
      </div>

      {/* Modal de anulación */}
      {anulando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
              <h2 className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 font-heading">
                <Ban size={16} className="text-rose-500" /> Anular notificación
              </h2>
              <button onClick={() => setAnulando(null)} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
            </div>
            <div className="space-y-4 p-5 text-sm">
              <p className="text-xs leading-5 text-slate-500">
                Se anulará la notificación de <span className="font-semibold text-slate-700 dark:text-slate-300">{anulando.pacienteNombre}</span>{" "}
                (Exp. <span className="font-mono">{anulando.pacienteExpediente}</span>). No se borra: queda registrada como anulada con su motivo.
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  Motivo <span className="text-red-500">*</span>
                </label>
                <textarea value={motivoAnulacion} onChange={e => setMotivoAnulacion(e.target.value)} rows={3}
                  className={`${inputCls} resize-none`}
                  placeholder="Ej.: se notificó el expediente equivocado" />
                <p className="mt-1 text-[11px] text-slate-400">Mínimo {MOTIVO_ANULACION_MIN} caracteres.</p>
              </div>
              {errAnular && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span className="text-xs">{errAnular}</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <button onClick={() => setAnulando(null)} disabled={anulandoSave}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                Cancelar
              </button>
              <button onClick={anular} disabled={anulandoSave || motivoAnulacion.trim().length < MOTIVO_ANULACION_MIN}
                className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50">
                <Ban size={14} /> {anulandoSave ? "Anulando..." : "Anular"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                    El caso del paciente{" "}
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{modal.nombre}</span>{" "}
                    (Exp. <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{modal.expediente}</span>)
                    fue enviado correctamente al comité.
                  </p>
                </div>
                <button onClick={() => setModal(null)}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-xl transition-colors">
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
                <button onClick={() => setModal(null)}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl transition-colors">
                  Cerrar
                </button>
              </>
            )}
            <button onClick={() => setModal(null)}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
