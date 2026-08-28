"use client";

import { useEffect, useState, useRef } from "react";
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, doc, getDoc, deleteField, Timestamp } from "@/lib/firestoreMeter";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { FileText, Plus, Upload, X, CheckCircle2, Clock, File, Pencil, AlertTriangle, Paperclip, CalendarDays, ChevronLeft, Wallet, WalletCards, Check } from "lucide-react";
import type { TramitePersonal, CategoriaTramitePersonal, EstadoTramitePersonal, PlanTrabajo, FilaPlanTrabajo } from "@/types";
import { toDate } from "@/lib/pacientes/helpers";
import { getHorario, esMarcaEspecial, labelMarca } from "@/lib/esdomed/horarios";
import { filaDeUsuario, formatPeriodo, labelPeriodo, parsePeriodo, PERIODO_ACTUAL } from "@/lib/esdomed/plan";
import { minutosDeEtiqueta } from "@/lib/esdomed/permisos-plan";

const toLocalInput = (val: unknown): string => {
  const d = toDate(val);
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const aLocalInput = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// El permiso es "diferido" si el documento/solicitud se registra un día posterior
// al de inicio del permiso (retroactivo); "ordinario" si es ese mismo día o antes.
const clasificarSolicitud = (inicioLocal: string): "ordinario" | "diferido" => {
  const inicio = new Date(inicioLocal);
  if (isNaN(inicio.getTime())) return "ordinario";
  const hoy = new Date();
  const diaInicio = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  const diaHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return diaHoy > diaInicio ? "diferido" : "ordinario";
};

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

const OTRAS_CATEGORIAS = (Object.keys(CATEGORIAS) as CategoriaTramitePersonal[]).filter((c) => !REQUIERE_APROBACION(c));

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

const MAX_ADJUNTOS = 5;

const SEMANA = ["D", "L", "M", "Mi", "J", "V", "S"];

// Lista de adjuntos de un trámite, compatible con el campo legado de un solo archivo.
const docsDe = (t: TramitePersonal): { url: string; nombre: string }[] =>
  t.documentos?.length
    ? t.documentos
    : t.documentoUrl
      ? [{ url: t.documentoUrl, nombre: t.documentoNombre ?? "Documento" }]
      : [];

const subirArchivos = async (uid: string, lista: File[]): Promise<{ url: string; nombre: string }[]> => {
  const subidos: { url: string; nombre: string }[] = [];
  for (const f of lista) {
    const fileRef = ref(storage, `tramites/${uid}/${Date.now()}_${f.name}`);
    await uploadBytes(fileRef, f);
    const url = await getDownloadURL(fileRef);
    subidos.push({ url, nombre: f.name });
  }
  return subidos;
};

// Periodos visibles en el selector de turnos: mes anterior (permisos diferidos),
// actual y siguiente.
const PERIODOS_WIZARD = (() => {
  const { anio, mes } = parsePeriodo(PERIODO_ACTUAL);
  const d = (off: number) => new Date(anio, mes - 1 + off, 1);
  return [-1, 0, 1].map((off) => formatPeriodo(d(off).getFullYear(), d(off).getMonth() + 1));
})();

export default function MisTramitesPage() {
  const { user, profile } = useAuth();
  const [tramites, setTramites] = useState<TramitePersonal[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Wizard ──
  const [showWizard, setShowWizard] = useState(false);
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [categoria, setCategoria] = useState<CategoriaTramitePersonal>("A1_permiso_con_goce");
  const [notas, setNotas] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [docsActuales, setDocsActuales] = useState<{ url: string; nombre: string }[]>([]);
  const [feedback, setFeedback] = useState<{ tipo: "exito" | "error"; mensaje: string } | null>(null);

  // Selector de turnos (paso 2 de permisos A1/A2)
  const [planes, setPlanes] = useState<Record<string, PlanTrabajo | null> | null>(null);
  const [cargandoPlanes, setCargandoPlanes] = useState(false);
  const [periodoSel, setPeriodoSel] = useState(PERIODO_ACTUAL);
  const [diasSel, setDiasSel] = useState<number[]>([]);
  const [fraccion, setFraccion] = useState(false);
  const [horasFraccion, setHorasFraccion] = useState("");
  const [horaInicioFraccion, setHoraInicioFraccion] = useState("");

  // Modo manual: respaldo cuando no hay plan publicado (o al editar una solicitud).
  const [modoManual, setModoManual] = useState(false);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [horas, setHoras] = useState("");

  // "Agregar documentos" a un trámite ya aprobado (no cambia el estado).
  const [adjuntarA, setAdjuntarA] = useState<TramitePersonal | null>(null);
  const [filesAdjuntar, setFilesAdjuntar] = useState<File[]>([]);
  const adjuntarInputRef = useRef<HTMLInputElement>(null);

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

  const esPermiso = REQUIERE_APROBACION(categoria);
  const totalPasos = esPermiso ? 3 : 2;

  // ── Carga puntual de los planes (3 lecturas, solo al entrar al selector) ──
  const cargarPlanes = async () => {
    if (planes || cargandoPlanes) return;
    setCargandoPlanes(true);
    try {
      const out: Record<string, PlanTrabajo | null> = {};
      await Promise.all(
        PERIODOS_WIZARD.map(async (p) => {
          const snap = await getDoc(doc(db, "planes_trabajo", p));
          out[p] = snap.exists() ? ({ id: snap.id, ...snap.data() } as PlanTrabajo) : null;
        }),
      );
      setPlanes(out);
    } catch (err) {
      console.error("No se pudieron cargar los planes de trabajo", err);
      setPlanes({});
    } finally {
      setCargandoPlanes(false);
    }
  };

  const filaDe = (periodo: string): FilaPlanTrabajo | undefined => {
    const plan = planes?.[periodo];
    return plan && profile ? filaDeUsuario(plan, profile) : undefined;
  };

  const filaSel = filaDe(periodoSel);
  const turnoUnicoSel = diasSel.length === 1 && filaSel ? getHorario(filaSel.asignaciones[diasSel[0] - 1]) : undefined;

  const toggleDia = (d: number) => {
    setDiasSel((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  };

  const cambiarPeriodo = (p: string) => {
    if (p === periodoSel) return;
    setPeriodoSel(p);
    setDiasSel([]);
    setFraccion(false);
  };

  // Deriva fechaInicio/fechaFin/horas del turno seleccionado en el plan.
  const construirDatosPermiso = (): { inicio: Date; fin: Date; horas: number } | { error: string } => {
    if (!filaSel || diasSel.length === 0) return { error: "Selecciona al menos un día con turno." };
    const dias = [...diasSel].sort((a, b) => a - b);
    const { anio, mes } = parsePeriodo(periodoSel);

    // La selección debe ser un rango continuo de días de turno: si en medio hay
    // otro turno sin marcar, el rango fechaInicio–fechaFin lo cubriría por error.
    for (let d = dias[0]; d <= dias[dias.length - 1]; d++) {
      if (getHorario(filaSel.asignaciones[d - 1]) && !dias.includes(d)) {
        return { error: `La selección debe ser continua: el día ${d} también tiene turno. Inclúyelo o haz dos solicitudes.` };
      }
    }

    const turnoPrimero = getHorario(filaSel.asignaciones[dias[0] - 1]);
    const turnoUltimo = getHorario(filaSel.asignaciones[dias[dias.length - 1] - 1]);
    if (!turnoPrimero || !turnoUltimo) return { error: "Los días seleccionados deben tener turno asignado." };
    const entradaMin = minutosDeEtiqueta(turnoPrimero.entrada) ?? 7 * 60;

    if (fraccion && dias.length === 1) {
      const horasNum = Number(horasFraccion);
      if (!horasNum || horasNum <= 0) return { error: "Indica cuántas horas de permiso necesitas." };
      if (horasNum > turnoPrimero.horas) return { error: `El turno de ese día es de ${turnoPrimero.horas} horas; la fracción no puede excederlo.` };
      let inicioMin = entradaMin;
      if (horaInicioFraccion) {
        const [h, m] = horaInicioFraccion.split(":").map(Number);
        if (!Number.isNaN(h)) inicioMin = h * 60 + (m || 0);
      }
      const inicio = new Date(anio, mes - 1, dias[0], Math.floor(inicioMin / 60), inicioMin % 60);
      const fin = new Date(inicio.getTime() + horasNum * 60 * 60 * 1000);
      return { inicio, fin, horas: horasNum };
    }

    const inicio = new Date(anio, mes - 1, dias[0], Math.floor(entradaMin / 60), entradaMin % 60);
    const salidaMin = minutosDeEtiqueta(turnoUltimo.salida) ?? 15 * 60;
    const entradaUltimoMin = minutosDeEtiqueta(turnoUltimo.entrada) ?? 7 * 60;
    // Turnos que amanecen (salida <= entrada) terminan al día siguiente.
    const diaFin = dias[dias.length - 1] + (salidaMin <= entradaUltimoMin ? 1 : 0);
    const fin = new Date(anio, mes - 1, diaFin, Math.floor(salidaMin / 60), salidaMin % 60);
    const horasTot = dias.reduce((acc, d) => acc + (getHorario(filaSel.asignaciones[d - 1])?.horas ?? 0), 0);
    return { inicio, fin, horas: horasTot };
  };

  // Datos finales del permiso según el modo activo (selector o manual).
  const datosPermiso = (): { inicio: Date; fin: Date; horas: number } | { error: string } => {
    if (!modoManual) return construirDatosPermiso();
    if (!fechaInicio || !fechaFin) return { error: "Completa las fechas de inicio y fin." };
    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);
    if (isNaN(inicio.getTime()) || isNaN(fin.getTime()) || fin < inicio) return { error: "El fin del permiso debe ser posterior al inicio." };
    const horasNum = Number(horas);
    if (!horasNum || horasNum <= 0) return { error: "Indica la cantidad de horas del permiso." };
    return { inicio, fin, horas: horasNum };
  };

  const irAPaso3 = () => {
    const datos = datosPermiso();
    if ("error" in datos) {
      setFeedback({ tipo: "error", mensaje: datos.error });
      return;
    }
    setPaso(3);
  };

  const agregarArchivos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const elegidos = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!elegidos.length) return;
    const espacio = MAX_ADJUNTOS - docsActuales.length - files.length;
    if (espacio <= 0) {
      setFeedback({ tipo: "error", mensaje: `Solo se permiten hasta ${MAX_ADJUNTOS} adjuntos.` });
      return;
    }
    if (elegidos.length > espacio) {
      setFeedback({ tipo: "error", mensaje: `Solo se permiten hasta ${MAX_ADJUNTOS} adjuntos. Se agregaron los primeros ${espacio}.` });
    }
    setFiles(prev => [...prev, ...elegidos.slice(0, espacio)]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    const totalAdjuntos = docsActuales.length + files.length;
    if (!esPermiso && totalAdjuntos === 0) {
      setFeedback({ tipo: "error", mensaje: "Debes adjuntar al menos un documento." });
      return;
    }

    let datos: { inicio: Date; fin: Date; horas: number } | null = null;
    if (esPermiso) {
      const d = datosPermiso();
      if ("error" in d) {
        setFeedback({ tipo: "error", mensaje: d.error });
        return;
      }
      datos = d;
    }

    setSaving(true);
    try {
      const subidos = await subirArchivos(user.uid, files);
      const documentos = [...docsActuales, ...subidos];

      if (editId) {
        // Edición de una solicitud existente (subida, pendiente o rechazada).
        await updateDoc(doc(db, "tramites_personal", editId), {
          categoria,
          estado: esPermiso ? "pendiente" : "subido",
          notas: notas.trim() || deleteField(),
          documentos: documentos.length ? documentos : deleteField(),
          documentoUrl: deleteField(),    // limpia el campo legado
          documentoNombre: deleteField(),
          fechaInicio: datos ? Timestamp.fromDate(datos.inicio) : deleteField(),
          fechaFin: datos ? Timestamp.fromDate(datos.fin) : deleteField(),
          horas: datos ? datos.horas : deleteField(),
          tipoSolicitud: datos ? clasificarSolicitud(aLocalInput(datos.inicio)) : deleteField(),
          actualizadoEn: Timestamp.now(),
        });
      } else {
        const payload: Record<string, unknown> = {
          categoria,
          empleadoId: user.uid,
          empleadoNombre: profile.nombre,
          estado: esPermiso ? "pendiente" : "subido",
          creadoEn: Timestamp.now(),
        };
        if (notas.trim()) payload.notas = notas.trim();
        if (documentos.length) payload.documentos = documentos;
        if (datos) {
          payload.fechaInicio = Timestamp.fromDate(datos.inicio);
          payload.fechaFin = Timestamp.fromDate(datos.fin);
          payload.horas = datos.horas;
          payload.tipoSolicitud = clasificarSolicitud(aLocalInput(datos.inicio));
        }
        await addDoc(collection(db, "tramites_personal"), payload);
      }

      const fueEdicion = !!editId;
      cerrarWizard();
      setFeedback({
        tipo: "exito",
        mensaje: fueEdicion
          ? "Tu solicitud se actualizó correctamente."
          : "Tu trámite se envió correctamente.",
      });
    } catch (err) {
      console.error(err);
      setFeedback({ tipo: "error", mensaje: "No se pudo guardar el trámite. Por favor intenta de nuevo." });
    } finally {
      setSaving(false);
    }
  };

  // Adjuntar documentos a un trámite APROBADO: el estado no cambia; solo se
  // reclasifica ordinario/diferido según el día en que se sube el documento
  // respecto a la fecha del permiso.
  const guardarAdjuntos = async () => {
    if (!adjuntarA?.id || !user || filesAdjuntar.length === 0) return;
    setSaving(true);
    try {
      const subidos = await subirArchivos(user.uid, filesAdjuntar);
      const documentos = [...docsDe(adjuntarA), ...subidos];
      const payload: Record<string, unknown> = {
        documentos,
        documentoUrl: deleteField(),
        documentoNombre: deleteField(),
        actualizadoEn: Timestamp.now(),
      };
      if (REQUIERE_APROBACION(adjuntarA.categoria) && adjuntarA.fechaInicio) {
        payload.tipoSolicitud = clasificarSolicitud(toLocalInput(adjuntarA.fechaInicio));
      }
      await updateDoc(doc(db, "tramites_personal", adjuntarA.id), payload);
      setAdjuntarA(null);
      setFilesAdjuntar([]);
      setFeedback({ tipo: "exito", mensaje: "Documentos agregados. El trámite sigue aprobado." });
    } catch (err) {
      console.error(err);
      setFeedback({ tipo: "error", mensaje: "No se pudieron subir los documentos. Intenta de nuevo." });
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
    setFiles([]);
    setDocsActuales([]);
    setDiasSel([]);
    setFraccion(false);
    setHorasFraccion("");
    setHoraInicioFraccion("");
    setPeriodoSel(PERIODO_ACTUAL);
    setModoManual(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const abrirNuevo = () => {
    resetForm();
    setEditId(null);
    setPaso(1);
    setShowWizard(true);
  };

  const abrirEditar = (t: TramitePersonal) => {
    resetForm();
    setEditId(t.id ?? null);
    setCategoria(t.categoria);
    setNotas(t.notas ?? "");
    setFechaInicio(toLocalInput(t.fechaInicio));
    setFechaFin(toLocalInput(t.fechaFin));
    setHoras(t.horas != null ? String(t.horas) : "");
    setDocsActuales(docsDe(t));
    // Al editar se entra directo al detalle en modo manual (fechas prellenadas).
    setModoManual(true);
    setPaso(2);
    setShowWizard(true);
  };

  const cerrarWizard = () => {
    setShowWizard(false);
    setEditId(null);
    resetForm();
  };

  const resumen = esPermiso ? datosPermiso() : null;
  const resumenValido = resumen && !("error" in resumen) ? resumen : null;

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
          onClick={abrirNuevo}
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
            const fecha = toDate(t.creadoEn) ?? new Date();
            const docs = docsDe(t);

            return (
              <div key={t.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-blue-300 dark:hover:border-blue-900/50 shadow-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md ${ESTADO_BADGE[t.estado]}`}>
                      {ESTADO_LABEL[t.estado]}
                    </span>
                    {t.tipoSolicitud && (
                      <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md ${t.tipoSolicitud === "diferido" ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"}`}>
                        {t.tipoSolicitud}
                      </span>
                    )}
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
                          Inicio: {toDate(t.fechaInicio)?.toLocaleString("es-SV", { dateStyle: "short", timeStyle: "short" }) ?? "-"}
                        </span>
                      )}
                      {t.fechaFin && (
                        <span className="inline-flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700">
                          Fin: {toDate(t.fechaFin)?.toLocaleString("es-SV", { dateStyle: "short", timeStyle: "short" }) ?? "-"}
                        </span>
                      )}
                    </div>
                  )}
                  {t.notas && <p className="text-xs text-slate-500 italic mt-2.5 line-clamp-2">&ldquo;{t.notas}&rdquo;</p>}

                  {t.comentariosRevision && (t.estado === "aprobado" || t.estado === "rechazado") && (
                    <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-100 dark:border-blue-800/30">
                      <p className="text-[11px] font-bold text-blue-800 dark:text-blue-400 mb-1 uppercase tracking-wider">Respuesta de Administración:</p>
                      <p className="text-sm text-blue-950 dark:text-blue-200">{t.comentariosRevision}</p>
                    </div>
                  )}
                </div>

                <div className="shrink-0 flex flex-col items-stretch md:items-end gap-2 border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800 pt-3 md:pt-0 md:pl-5 w-full md:w-auto">
                  {docs.length > 0 ? (
                    docs.map((docu, i) => (
                      <a key={i} href={docu.url} target="_blank" rel="noopener noreferrer" title={docu.nombre} className="flex items-center justify-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-300 hover:text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 px-4 py-2.5 rounded-xl transition-colors w-full md:w-auto max-w-[220px]">
                        <File size={16} className="shrink-0" /> <span className="truncate">{docs.length > 1 ? `Documento ${i + 1}` : "Ver Documento"}</span>
                      </a>
                    ))
                  ) : (
                    <span className="text-xs font-medium text-slate-400 italic bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800 text-center">
                      Sin anexo
                    </span>
                  )}
                  {t.estado === "aprobado" ? (
                    // Un trámite aprobado ya no se reabre: solo se le agrega el
                    // respaldo físico escaneado (antes o después del permiso).
                    <button
                      onClick={() => { setAdjuntarA(t); setFilesAdjuntar([]); }}
                      className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 px-4 py-2.5 rounded-xl transition-colors w-full md:w-auto"
                    >
                      <Paperclip size={14} /> Agregar documentos
                    </button>
                  ) : (
                    <button
                      onClick={() => abrirEditar(t)}
                      className="flex items-center justify-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-4 py-2.5 rounded-xl transition-colors w-full md:w-auto"
                    >
                      <Pencil size={14} /> Editar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Wizard Nuevo/Editar Trámite ── */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex justify-center items-start pt-6 md:pt-10 px-3 md:px-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden mb-10">
            {/* Encabezado con pasos */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <FileText size={20} className="text-blue-500" /> {editId ? "Editar Trámite" : "Nuevo Trámite"}
                </h2>
                <button onClick={cerrarWizard} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                {Array.from({ length: totalPasos }, (_, i) => i + 1).map((p) => (
                  <div key={p} className={`h-1.5 flex-1 rounded-full transition-colors ${p <= paso ? "bg-blue-600 dark:bg-blue-500" : "bg-slate-200 dark:bg-slate-800"}`} />
                ))}
              </div>
              <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Paso {Math.min(paso, totalPasos)} de {totalPasos} · {paso === 1 ? "Tipo de trámite" : paso === 2 ? (esPermiso ? "Tus turnos y el tiempo" : "Documentos") : "Respaldo y envío"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* ── Paso 1: tipo de trámite ── */}
              {paso === 1 && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setCategoria("A1_permiso_con_goce")}
                      className={`text-left rounded-2xl border-2 p-4 transition-all ${categoria === "A1_permiso_con_goce" ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-500" : "border-slate-200 dark:border-slate-700 hover:border-blue-300"}`}
                    >
                      <Wallet size={22} className={categoria === "A1_permiso_con_goce" ? "text-blue-600 dark:text-blue-400" : "text-slate-400"} />
                      <p className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-100">Permiso personal con goce</p>
                      <p className="mt-0.5 text-xs text-slate-500">A.1 · Se descuenta de tus horas con goce de sueldo. Requiere aprobación.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategoria("A2_permiso_sin_goce")}
                      className={`text-left rounded-2xl border-2 p-4 transition-all ${categoria === "A2_permiso_sin_goce" ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-500" : "border-slate-200 dark:border-slate-700 hover:border-blue-300"}`}
                    >
                      <WalletCards size={22} className={categoria === "A2_permiso_sin_goce" ? "text-blue-600 dark:text-blue-400" : "text-slate-400"} />
                      <p className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-100">Permiso personal sin goce</p>
                      <p className="mt-0.5 text-xs text-slate-500">A.2 · Sin goce de sueldo. Requiere aprobación.</p>
                    </button>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">Otros trámites (solo suben documento)</p>
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                      {OTRAS_CATEGORIAS.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCategoria(cat)}
                          className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors ${categoria === cat ? "bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 font-semibold" : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
                        >
                          <span className="min-w-0 truncate">{CATEGORIAS[cat]}</span>
                          {categoria === cat && <Check size={16} className="shrink-0 text-blue-600 dark:text-blue-400" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Paso 2 (permisos): turnos del plan ── */}
              {paso === 2 && esPermiso && !modoManual && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-500">
                    <CalendarDays size={18} />
                    <span className="text-xs font-bold uppercase tracking-widest">¿Qué turnos cubre tu permiso?</span>
                  </div>

                  <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                    {PERIODOS_WIZARD.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => cambiarPeriodo(p)}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${periodoSel === p ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                      >
                        {labelPeriodo(p)}
                      </button>
                    ))}
                  </div>

                  {cargandoPlanes ? (
                    <div className="flex justify-center py-10">
                      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : !filaSel ? (
                    <div className="rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 p-5 text-center">
                      <p className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-1">
                        {planes?.[periodoSel] ? "No apareces en el plan de este mes" : "Aún no hay plan de trabajo publicado para este mes"}
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Puedes revisar otro mes o ingresar las fechas manualmente.
                      </p>
                    </div>
                  ) : (
                    <CalendarioTurnos
                      periodo={periodoSel}
                      fila={filaSel}
                      diasSel={diasSel}
                      onToggle={toggleDia}
                    />
                  )}

                  {/* Fracción de turno: solo con un día seleccionado */}
                  {turnoUnicoSel && (
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200/60 dark:border-amber-800/40 rounded-2xl p-4 space-y-3">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={fraccion}
                          onChange={(e) => {
                            setFraccion(e.target.checked);
                            if (e.target.checked && !horaInicioFraccion) {
                              const min = minutosDeEtiqueta(turnoUnicoSel.entrada) ?? 7 * 60;
                              setHoraInicioFraccion(`${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);
                            }
                          }}
                          className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-sm font-bold text-amber-900 dark:text-amber-200">
                          Solo necesito una fracción del turno ({turnoUnicoSel.entrada} – {turnoUnicoSel.salida}, {turnoUnicoSel.horas} h)
                        </span>
                      </label>
                      {fraccion && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-amber-900/60 dark:text-amber-500/60 uppercase tracking-wide mb-1.5">Desde qué hora</label>
                            <input type="time" value={horaInicioFraccion} onChange={(e) => setHoraInicioFraccion(e.target.value)} className={`${inputCls} border-amber-200 dark:border-amber-800/50 focus:ring-amber-500`} />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-amber-900/60 dark:text-amber-500/60 uppercase tracking-wide mb-1.5">Horas de permiso</label>
                            <input type="number" step="0.5" min="0.5" max={turnoUnicoSel.horas} placeholder={`Máx ${turnoUnicoSel.horas}`} value={horasFraccion} onChange={(e) => setHorasFraccion(e.target.value)} className={`${inputCls} border-amber-200 dark:border-amber-800/50 focus:ring-amber-500`} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {diasSel.length > 0 && resumenValido && (
                    <div className="rounded-2xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-900 dark:text-blue-200">
                      <span className="font-bold">{diasSel.length === 1 ? "1 día" : `${diasSel.length} días`} · {resumenValido.horas} h de permiso.</span>{" "}
                      Del {resumenValido.inicio.toLocaleString("es-SV", { dateStyle: "short", timeStyle: "short" })} al {resumenValido.fin.toLocaleString("es-SV", { dateStyle: "short", timeStyle: "short" })}.
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setModoManual(true)}
                    className="text-xs font-semibold text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 underline underline-offset-2 transition-colors"
                  >
                    ¿No ves tus turnos? Ingresar fechas manualmente
                  </button>
                </div>
              )}

              {/* ── Paso 2 (permisos): modo manual ── */}
              {paso === 2 && esPermiso && modoManual && (
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200/60 dark:border-amber-800/40 rounded-2xl p-5 space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-500">
                      <Clock size={18} />
                      <span className="text-xs font-bold uppercase tracking-widest">Detalles del Permiso</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setModoManual(false);
                        void cargarPlanes();
                      }}
                      className="text-xs font-semibold text-amber-700 dark:text-amber-400 underline underline-offset-2"
                    >
                      Elegir desde mis turnos
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-amber-900/60 dark:text-amber-500/60 uppercase tracking-wide mb-1.5">Inicio</label>
                      <input type="datetime-local" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className={`${inputCls} border-amber-200 dark:border-amber-800/50 focus:ring-amber-500`} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-amber-900/60 dark:text-amber-500/60 uppercase tracking-wide mb-1.5">Fin</label>
                      <input type="datetime-local" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className={`${inputCls} border-amber-200 dark:border-amber-800/50 focus:ring-amber-500`} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900/60 dark:text-amber-500/60 uppercase tracking-wide mb-1.5">Cantidad de horas</label>
                    <input type="number" step="0.5" min="0" placeholder="Ej: 4" value={horas} onChange={e => setHoras(e.target.value)} className={`${inputCls} border-amber-200 dark:border-amber-800/50 focus:ring-amber-500`} />
                  </div>
                </div>
              )}

              {/* ── Paso 2 (otros trámites) y Paso 3 (permisos): documentos + notas ── */}
              {((paso === 2 && !esPermiso) || (paso === 3 && esPermiso)) && (
                <>
                  {paso === 3 && resumenValido && (
                    <div className="rounded-2xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30 p-4 space-y-1.5">
                      <p className="text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">Resumen de tu solicitud</p>
                      <p className="text-sm text-blue-950 dark:text-blue-100 font-semibold">{CATEGORIAS[categoria]}</p>
                      <p className="text-sm text-blue-900 dark:text-blue-200">
                        Del {resumenValido.inicio.toLocaleString("es-SV", { dateStyle: "medium", timeStyle: "short" })} al {resumenValido.fin.toLocaleString("es-SV", { dateStyle: "medium", timeStyle: "short" })} · {resumenValido.horas} horas
                      </p>
                      <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${clasificarSolicitud(aLocalInput(resumenValido.inicio)) === "diferido" ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"}`}>
                        {clasificarSolicitud(aLocalInput(resumenValido.inicio))}
                      </span>
                    </div>
                  )}

                  <div className="bg-slate-50 dark:bg-slate-800/30 rounded-2xl p-5 border border-slate-100 dark:border-slate-800/60">
                    <label className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                      <span>Documentos Adjuntos {!esPermiso && <span className="text-rose-500">*</span>}</span>
                      <span className="text-[11px] font-semibold normal-case text-slate-400">{docsActuales.length + files.length}/{MAX_ADJUNTOS}</span>
                    </label>

                    {(docsActuales.length > 0 || files.length > 0) && (
                      <ul className="space-y-1.5 mb-3">
                        {docsActuales.map((docu, i) => (
                          <li key={`a-${i}`} className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                            <File size={14} className="text-blue-500 shrink-0" />
                            <a href={docu.url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-700 dark:text-slate-300 truncate flex-1 hover:underline">{docu.nombre}</a>
                            <button type="button" onClick={() => setDocsActuales(prev => prev.filter((_, idx) => idx !== i))} className="p-1 text-slate-400 hover:text-rose-500 transition-colors shrink-0" aria-label="Quitar adjunto">
                              <X size={14} />
                            </button>
                          </li>
                        ))}
                        {files.map((f, i) => (
                          <li key={`n-${i}`} className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                            <Upload size={14} className="text-emerald-500 shrink-0" />
                            <span className="text-xs text-slate-700 dark:text-slate-300 truncate flex-1">{f.name}</span>
                            <button type="button" onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} className="p-1 text-slate-400 hover:text-rose-500 transition-colors shrink-0" aria-label="Quitar archivo">
                              <X size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {docsActuales.length + files.length < MAX_ADJUNTOS ? (
                      <input
                        type="file"
                        multiple
                        ref={fileInputRef}
                        onChange={agregarArchivos}
                        className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-500 dark:file:bg-blue-600 dark:hover:file:bg-blue-500 transition-colors file:cursor-pointer cursor-pointer"
                      />
                    ) : (
                      <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <CheckCircle2 size={12} className="text-blue-500" /> Llegaste al máximo de {MAX_ADJUNTOS} adjuntos. Quita uno para agregar otro.
                      </p>
                    )}

                    <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1.5">
                      {esPermiso ? (
                        <><CheckCircle2 size={12} className="text-emerald-500" /> Opcional: puedes subir el respaldo físico ahora o después de aprobado, sin que el trámite vuelva a revisión.</>
                      ) : (
                        <><Upload size={12} className="text-blue-500" /> Obligatorio: Sube el formulario o evidencia (hasta {MAX_ADJUNTOS} archivos).</>
                      )}
                    </p>
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
                </>
              )}

              {/* ── Navegación ── */}
              <div className="pt-2 flex items-center justify-between gap-3">
                {paso > 1 ? (
                  <button
                    type="button"
                    onClick={() => setPaso((p) => (p === 3 ? 2 : 1))}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                  >
                    <ChevronLeft size={16} /> Atrás
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={cerrarWizard}
                    disabled={saving}
                    className="px-4 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                  >
                    Cancelar
                  </button>
                )}

                {paso === 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPaso(2);
                      if (REQUIERE_APROBACION(categoria)) void cargarPlanes();
                    }}
                    className="px-8 py-3 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all shadow-md"
                  >
                    Continuar
                  </button>
                )}
                {paso === 2 && esPermiso && (
                  <button
                    type="button"
                    onClick={irAPaso3}
                    className="px-8 py-3 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all shadow-md"
                  >
                    Continuar
                  </button>
                )}
                {((paso === 2 && !esPermiso) || paso === 3) && (
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
                    ) : editId ? (
                      "Guardar Cambios"
                    ) : esPermiso ? (
                      "Enviar Solicitud"
                    ) : (
                      "Subir Documento"
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: agregar documentos a un trámite aprobado ── */}
      {adjuntarA && (
        <div className="fixed inset-0 z-50 flex justify-center items-start pt-10 px-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden mb-10">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/60 bg-emerald-50 dark:bg-emerald-950/20">
              <h2 className="text-lg font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-2">
                <Paperclip size={20} /> Agregar documentos
              </h2>
              <button onClick={() => setAdjuntarA(null)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{CATEGORIAS[adjuntarA.categoria]}</p>
                <p className="text-xs text-slate-500 mt-1">
                  El trámite <span className="font-bold text-emerald-600 dark:text-emerald-400">sigue aprobado</span>; solo se agrega el respaldo. Si lo subes después de la fecha del permiso, quedará como <span className="font-bold">diferido</span>; si es antes o el mismo día, como <span className="font-bold">ordinario</span>.
                </p>
              </div>

              {docsDe(adjuntarA).length > 0 && (
                <ul className="space-y-1.5">
                  {docsDe(adjuntarA).map((docu, i) => (
                    <li key={i} className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                      <File size={14} className="text-blue-500 shrink-0" />
                      <a href={docu.url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-700 dark:text-slate-300 truncate flex-1 hover:underline">{docu.nombre}</a>
                    </li>
                  ))}
                  {filesAdjuntar.map((f, i) => (
                    <li key={`n-${i}`} className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                      <Upload size={14} className="text-emerald-500 shrink-0" />
                      <span className="text-xs text-slate-700 dark:text-slate-300 truncate flex-1">{f.name}</span>
                      <button type="button" onClick={() => setFilesAdjuntar(prev => prev.filter((_, idx) => idx !== i))} className="p-1 text-slate-400 hover:text-rose-500 transition-colors shrink-0" aria-label="Quitar archivo">
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {docsDe(adjuntarA).length + filesAdjuntar.length < MAX_ADJUNTOS ? (
                <input
                  type="file"
                  multiple
                  ref={adjuntarInputRef}
                  onChange={(e) => {
                    const elegidos = Array.from(e.target.files ?? []);
                    if (adjuntarInputRef.current) adjuntarInputRef.current.value = "";
                    const espacio = MAX_ADJUNTOS - docsDe(adjuntarA).length - filesAdjuntar.length;
                    setFilesAdjuntar(prev => [...prev, ...elegidos.slice(0, Math.max(0, espacio))]);
                  }}
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 transition-colors file:cursor-pointer cursor-pointer"
                />
              ) : (
                <p className="text-[11px] text-slate-500">Llegaste al máximo de {MAX_ADJUNTOS} adjuntos.</p>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAdjuntarA(null)}
                  disabled={saving}
                  className="px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={guardarAdjuntos}
                  disabled={saving || filesAdjuntar.length === 0}
                  className="px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    "Subir Documentos"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de feedback (éxito / error) */}
      {feedback && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className={`p-6 flex flex-col items-center gap-3 ${feedback.tipo === "exito" ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-rose-50 dark:bg-rose-950/30"}`}>
              <div className={`w-14 h-14 rounded-full flex items-center justify-center ${feedback.tipo === "exito" ? "bg-emerald-100 dark:bg-emerald-900/50" : "bg-rose-100 dark:bg-rose-900/50"}`}>
                {feedback.tipo === "exito" ? (
                  <CheckCircle2 size={28} className="text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertTriangle size={28} className="text-rose-600 dark:text-rose-400" />
                )}
              </div>
              <h3 className={`text-lg font-bold ${feedback.tipo === "exito" ? "text-emerald-800 dark:text-emerald-300" : "text-rose-800 dark:text-rose-300"}`}>
                {feedback.tipo === "exito" ? "Listo" : "Revisa tu solicitud"}
              </h3>
              <p className={`text-sm text-center ${feedback.tipo === "exito" ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                {feedback.mensaje}
              </p>
            </div>
            <div className="p-5">
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className={`w-full py-2.5 rounded-xl text-sm font-bold text-white transition-colors ${feedback.tipo === "exito" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-rose-600 hover:bg-rose-500"}`}
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

// ── Calendario del mes con los turnos del empleado (selección de días) ──────
function CalendarioTurnos({
  periodo,
  fila,
  diasSel,
  onToggle,
}: {
  periodo: string;
  fila: FilaPlanTrabajo;
  diasSel: number[];
  onToggle: (dia: number) => void;
}) {
  const { anio, mes } = parsePeriodo(periodo);
  const totalDias = new Date(anio, mes, 0).getDate();
  const primerDow = new Date(anio, mes - 1, 1).getDay(); // 0 = Domingo
  const hoy = new Date();
  const esMesActual = hoy.getFullYear() === anio && hoy.getMonth() === mes - 1;

  const celdas: (number | null)[] = [...Array(primerDow).fill(null), ...Array.from({ length: totalDias }, (_, i) => i + 1)];
  while (celdas.length % 7 !== 0) celdas.push(null);

  const conTurno = fila.asignaciones.filter((c) => getHorario(c)).length;

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {SEMANA.map((d) => (
          <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celdas.map((dia, i) => {
          if (dia === null) return <div key={`v-${i}`} />;
          const celda = (fila.asignaciones[dia - 1] ?? "").trim();
          const horario = getHorario(celda);
          const marca = !horario && esMarcaEspecial(celda);
          const seleccionado = diasSel.includes(dia);
          const esHoy = esMesActual && hoy.getDate() === dia;

          if (horario) {
            return (
              <button
                key={dia}
                type="button"
                onClick={() => onToggle(dia)}
                title={`${celda.toUpperCase()} · ${horario.entrada} – ${horario.salida} (${horario.horas} h)`}
                className={`rounded-lg border-2 px-0.5 py-1.5 text-center transition-all ${
                  seleccionado
                    ? "border-blue-600 bg-blue-600 text-white shadow-sm dark:border-blue-500 dark:bg-blue-600"
                    : "border-blue-200 bg-blue-50 text-blue-800 hover:border-blue-400 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:border-blue-600"
                } ${esHoy && !seleccionado ? "ring-2 ring-offset-1 ring-cyan-400 dark:ring-offset-slate-900" : ""}`}
              >
                <span className="block text-[13px] font-bold leading-none">{dia}</span>
                <span className={`block mt-0.5 text-[9px] font-bold leading-none ${seleccionado ? "text-blue-100" : "text-blue-600 dark:text-blue-400"}`}>{celda.toUpperCase()}</span>
              </button>
            );
          }

          return (
            <div
              key={dia}
              title={marca ? labelMarca(celda) : "Descanso"}
              className={`rounded-lg border border-transparent px-0.5 py-1.5 text-center ${
                marca
                  ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-500"
                  : "bg-slate-50 text-slate-300 dark:bg-slate-800/40 dark:text-slate-600"
              } ${esHoy ? "ring-2 ring-offset-1 ring-cyan-400 dark:ring-offset-slate-900" : ""}`}
            >
              <span className="block text-[13px] font-semibold leading-none">{dia}</span>
              <span className="block mt-0.5 text-[9px] leading-none">{marca ? celda.toUpperCase() : "—"}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        {conTurno > 0
          ? "Toca los días de turno (en azul) que cubre tu permiso. Puedes elegir varios seguidos."
          : "Este mes no tienes turnos asignados en el plan."}
      </p>
    </div>
  );
}
