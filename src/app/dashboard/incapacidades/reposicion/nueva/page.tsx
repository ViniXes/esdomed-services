"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDoc, collection, getDocs, query, Timestamp, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useServicios } from "@/contexts/ServiciosContext";
import {
  ArrowLeft, Upload, FileClock, AlertTriangle, Lock, User2, BedDouble, Stethoscope,
  UserCheck, Send, Info, CheckCircle2, PenLine, FileText, X, Search,
} from "lucide-react";
import { DateField } from "@/components/ui/DateField";
import type { CondicionEgresoIncapacidad, Genero, SolicitudIncapacidad } from "@/types";
import { extraerDocumento } from "@/lib/simmow/pdfEngine";
import { esFieh } from "@/lib/simmow/fiehExtractor";
import { resolverServicioCanonico } from "@/lib/servicios";
import { formatFecha, nombreCompleto } from "@/lib/pacientes/helpers";
import {
  altaAntesDelIngreso, calcularDiasHospitalizacion, mapIncapacidadData, parseDateInput,
} from "@/lib/incapacidades/helpers";
import {
  ESTADO_INCAPACIDAD_LABEL, FECHA_APERTURA_APP, cargarMedicosAsignables, egresoPosteriorApertura,
  prefillDesdeFieh, sugerirMedicoPorJvpm, type MedicoAsignable, type PrefillReposicion,
} from "@/lib/incapacidades/reposicion";

const inputCls =
  "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm";
const labelCls = "block text-xs font-medium text-slate-500 mb-1.5";
const textareaCls = `${inputCls} min-h-[80px] resize-y`;

type Modo = "pdf" | "manual";

interface Form {
  expediente: string;
  apellidos: string;
  nombres: string;
  genero: Genero | "";
  dui: string;
  pasaporte: string;
  numeroAfiliacion: string;
  direccion: string;
  departamento: string;
  municipio: string;
  fechaIngreso: string;   // YYYY-MM-DD
  fechaEgreso: string;    // YYYY-MM-DD
  servicio: string;       // nombre del catálogo vivo
  condicion: CondicionEgresoIncapacidad;
  diagnostico: string;
  recomendaciones: string;
}

const FORM_VACIO: Form = {
  expediente: "", apellidos: "", nombres: "", genero: "",
  dui: "", pasaporte: "", numeroAfiliacion: "",
  direccion: "", departamento: "", municipio: "",
  fechaIngreso: "", fechaEgreso: "",
  servicio: "", condicion: "vivo",
  diagnostico: "", recomendaciones: "",
};

const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Solo claves con valor (Firestore no acepta undefined; lo vacío no aporta). */
function soloDefinidos(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (typeof v === "string" && !v.trim()) return;
    out[k] = typeof v === "string" ? v.trim() : v;
  });
  return out;
}

/**
 * Carga de una reposición de incapacidad (ESDOMED): se sube el FIEH del SIS,
 * se revisa lo extraído (ingreso bloqueado, egreso editable), se elige el
 * médico que la completará y se envía a su bandeja.
 */
export default function NuevaReposicionPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { servicios } = useServicios();

  // Paso 1: FIEH
  const [modo, setModo] = useState<Modo | null>(null);
  const [archivoNombre, setArchivoNombre] = useState("");
  const [prefill, setPrefill] = useState<PrefillReposicion | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Formulario
  const [form, setForm] = useState<Form>(FORM_VACIO);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((prev) => ({ ...prev, [k]: v }));
  const [servicioNoResuelto, setServicioNoResuelto] = useState<string | null>(null);

  // Médico
  const [medicos, setMedicos] = useState<MedicoAsignable[]>([]);
  const [cargandoMedicos, setCargandoMedicos] = useState(true);
  const [filtroMedico, setFiltroMedico] = useState("");
  // Selección explícita de ESDOMED; vacía = se usa el sugerido por JVPM (si lo hay).
  const [medicoId, setMedicoId] = useState("");

  const [duplicados, setDuplicados] = useState<SolicitudIncapacidad[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Médicos vigentes (una lectura).
  useEffect(() => {
    let activo = true;
    cargarMedicosAsignables()
      .then((m) => { if (activo) setMedicos(m); })
      .catch(() => { /* el select queda vacío y se avisa abajo */ })
      .finally(() => { if (activo) setCargandoMedicos(false); });
    return () => { activo = false; };
  }, []);

  // Sugerencia por JVPM del FIEH (derivada, sin estado propio).
  const sugerido = useMemo(
    () => (prefill ? sugerirMedicoPorJvpm(medicos, prefill.jvpm) : null),
    [prefill, medicos],
  );

  // Aviso de incapacidades ya existentes para ese expediente (con retardo).
  useEffect(() => {
    const exp = form.expediente.trim();
    let activo = true;
    const t = window.setTimeout(async () => {
      if (exp.length < 3) { if (activo) setDuplicados([]); return; }
      try {
        const snap = await getDocs(query(collection(db, "incapacidades"), where("pacienteExpediente", "==", exp)));
        if (activo) {
          setDuplicados(snap.docs.map((d) => mapIncapacidadData(d.id, d.data()))
            .sort((a, b) => b.creadoEn.getTime() - a.creadoEn.getTime()));
        }
      } catch { /* el aviso no es crítico */ }
    }, exp.length < 3 ? 0 : 500);
    return () => { activo = false; window.clearTimeout(t); };
  }, [form.expediente]);

  const limpiarTodo = () => {
    setPrefill(null); setArchivoNombre(""); setServicioNoResuelto(null);
    setMedicoId(""); setForm({ ...FORM_VACIO });
    setErrorPdf(null); setError(null);
  };

  const procesarArchivo = async (file: File) => {
    setErrorPdf(null);
    setProcesando(true);
    try {
      const doc = await extraerDocumento(file);
      if (!esFieh(doc.textoCompleto)) {
        setErrorPdf(
          doc.textoCompleto.trim().length < 100
            ? "El PDF parece un escaneo (imagen) sin texto digital. Solo se puede leer el FIEH generado por el SIS; si solo tiene el escaneo, use la carga a mano."
            : "El PDF no parece ser un FIEH (Formulario de Ingreso y Egreso Hospitalario).",
        );
        return;
      }
      const p = prefillDesdeFieh(doc);
      const canonico = resolverServicioCanonico(p.servicioCrudo, servicios);
      limpiarTodo();
      setServicioNoResuelto(p.servicioCrudo && !canonico ? p.servicioCrudo : null);
      setPrefill(p);
      setArchivoNombre(file.name);
      setModo("pdf");
      setForm({
        expediente: p.expediente,
        apellidos: p.apellidos,
        nombres: p.nombres,
        genero: p.genero,
        dui: p.dui,
        pasaporte: p.pasaporte,
        numeroAfiliacion: p.numeroAfiliacion,
        direccion: p.direccion,
        departamento: p.departamento,
        municipio: p.municipio,
        fechaIngreso: p.fechaIngreso ? toDateInput(p.fechaIngreso) : "",
        fechaEgreso: p.fechaEgreso ? toDateInput(p.fechaEgreso) : "",
        servicio: canonico ?? "",
        condicion: p.condicion || "vivo",
        diagnostico: p.diagnostico,
        recomendaciones: p.recomendaciones,
      });
    } catch (e) {
      setErrorPdf(e instanceof Error ? e.message : "No se pudo leer el PDF.");
    } finally {
      setProcesando(false);
    }
  };

  const elegirArchivo = (files: FileList | null) => {
    const f = files?.[0];
    if (f) procesarArchivo(f);
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    if (procesando) return;
    const pdf = Array.from(e.dataTransfer.files).find(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (pdf) procesarArchivo(pdf);
    else setErrorPdf("Suelte un archivo PDF.");
  };

  const cargarManual = () => { limpiarTodo(); setModo("manual"); };
  const reiniciar = () => { limpiarTodo(); setModo(null); };

  // Derivados de fechas
  const fIng = form.fechaIngreso ? parseDateInput(form.fechaIngreso) : null;
  const fEgr = form.fechaEgreso ? parseDateInput(form.fechaEgreso) : null;
  const egresoAntesIngreso = !!fIng && !!fEgr && altaAntesDelIngreso(fEgr, fIng);
  const estancia = fIng && fEgr && !egresoAntesIngreso ? calcularDiasHospitalizacion(fIng, fEgr) : null;
  const egresoReciente = !!fEgr && egresoPosteriorApertura(fEgr);
  // La fecha de ingreso que trae el FIEH no se toca aquí (si hay que corregirla,
  // se hace después desde el detalle, con aclaración).
  const ingresoBloqueado = modo === "pdf" && !!prefill?.fechaIngreso;

  const medicosFiltrados = useMemo(() => {
    const t = filtroMedico.trim().toLowerCase();
    if (!t) return medicos;
    return medicos.filter((m) =>
      m.nombre.toLowerCase().includes(t) ||
      (m.jvpm ?? "").toLowerCase().includes(t) ||
      (m.servicio ?? "").toLowerCase().includes(t),
    );
  }, [medicos, filtroMedico]);
  // Sin elección explícita, vale el sugerido por JVPM.
  const medicoIdEfectivo = medicoId || (sugerido?.uid ?? "");
  const medicoElegido = medicos.find((m) => m.uid === medicoIdEfectivo) ?? null;
  // El elegido siempre aparece en el select aunque el filtro lo deje fuera.
  const opcionesMedico = medicoElegido && !medicosFiltrados.some((m) => m.uid === medicoIdEfectivo)
    ? [medicoElegido, ...medicosFiltrados]
    : medicosFiltrados;

  const guardar = async () => {
    if (!user || !profile || !modo) return;
    if (!form.expediente.trim()) { setError("El expediente es obligatorio."); return; }
    if (!form.apellidos.trim() || !form.nombres.trim()) { setError("Apellidos y nombres del paciente son obligatorios."); return; }
    if (!fIng) { setError("Falta la fecha de ingreso."); return; }
    if (!fEgr) { setError("Falta la fecha de egreso."); return; }
    if (egresoAntesIngreso) { setError("La fecha de egreso no puede ser anterior a la de ingreso."); return; }
    if (!form.servicio) { setError("Elija el servicio hospitalario del catálogo."); return; }
    if (!medicoElegido) { setError("Elija el médico que completará la incapacidad."); return; }

    setError(null);
    setGuardando(true);
    try {
      const estanciaDias = calcularDiasHospitalizacion(fIng, fEgr);
      const paciente = { apellidos: form.apellidos.trim(), nombres: form.nombres.trim() };

      const datosConstancia = soloDefinidos({
        apellidos: paciente.apellidos,
        nombres: paciente.nombres,
        genero: form.genero || undefined,
        dui: form.dui,
        numeroAfiliacion: form.numeroAfiliacion,
        direccion: form.direccion,
        departamento: form.departamento,
        municipio: form.municipio,
      });

      const reposicion = soloDefinidos({
        creadaPorId: user.uid,
        creadaPorNombre: profile.nombre,
        asignadaEn: Timestamp.now(),
        cargaManual: modo === "manual",
        archivoNombre,
        // Ingreso según el FIEH (digital o físico): es el "original" que se
        // conserva aunque ESDOMED lo corrija después desde el detalle.
        fiehFechaIngreso: Timestamp.fromDate(fIng),
        fiehFechaEgreso: Timestamp.fromDate(prefill?.fechaEgreso ?? fEgr),
        fiehServicio: prefill?.servicioCrudo,
        fiehMedicoAlta: prefill?.medicoAlta,
        fiehJvpm: prefill?.jvpm,
      });

      const docData: Record<string, unknown> = {
        origen: "reposicion",
        estado: "pendiente_medico",
        // El médico asignado es el dueño: firma la constancia y la completa desde su bandeja.
        medicoId: medicoElegido.uid,
        medicoNombre: medicoElegido.nombre,
        medicoServicio: form.servicio,
        pacienteExpediente: form.expediente.trim(),
        pacienteNombre: nombreCompleto(paciente),
        servicioPaciente: form.servicio,
        // Sin días adicionales todavía: el período arranca en el ingreso y, por
        // ahora, termina en el egreso. El médico lo redefine al completar.
        fechaAlta: Timestamp.fromDate(fEgr),
        fechaDesde: Timestamp.fromDate(fIng),
        fechaHasta: Timestamp.fromDate(fEgr),
        diasIncapacidad: estanciaDias,
        diagnosticoEgreso: form.diagnostico.trim(),
        tratamientoAlta: "",
        condicionEgreso: form.condicion,
        datosConstancia,
        reposicion,
        creadoEn: Timestamp.now(),
      };
      if (medicoElegido.jvpm) docData.medicoJvpm = medicoElegido.jvpm;
      if (form.dui.trim()) docData.pacienteDui = form.dui.trim();
      if (form.genero) docData.pacienteGenero = form.genero;
      if (form.pasaporte.trim()) docData.pasaporte = form.pasaporte.trim();
      if (form.recomendaciones.trim()) docData.recomendaciones = form.recomendaciones.trim();

      await addDoc(collection(db, "incapacidades"), docData);
      router.push("/dashboard/incapacidades/reposicion");
    } catch (e) {
      setError(`Error al guardar: ${e instanceof Error ? e.message : "desconocido"}`);
      setGuardando(false);
    }
  };

  const mostrarFormulario = modo !== null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          prefetch={false}
          href="/dashboard/incapacidades/reposicion"
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors flex-shrink-0"
          aria-label="Volver"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-slate-400 font-medium uppercase tracking-widest">Reposición de incapacidad</p>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 font-heading">Nueva reposición</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Para egresos anteriores al {formatFecha(FECHA_APERTURA_APP)}, que no existen en la app. Suba el FIEH del SIS,
            revise lo leído y asigne el médico que completará la incapacidad.
          </p>
        </div>
      </div>

      {/* 1. FIEH */}
      <Card icon={FileText} title="1. FIEH (Formulario de Ingreso y Egreso Hospitalario)">
        {modo === null && (
          <div className="space-y-3">
            <div
              onDragOver={(e) => { e.preventDefault(); if (!procesando) setArrastrando(true); }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={soltar}
              onClick={() => { if (!procesando) inputRef.current?.click(); }}
              className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-8 cursor-pointer transition-colors ${
                arrastrando
                  ? "border-blue-400 bg-blue-50 dark:bg-blue-950/40"
                  : "border-slate-300 dark:border-slate-700 hover:border-blue-400"
              } ${procesando ? "opacity-60 cursor-wait" : ""}`}
            >
              <Upload size={22} className="text-blue-600 dark:text-blue-400" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {procesando ? "Leyendo el FIEH…" : "Arrastre el FIEH en PDF o haga clic para elegirlo"}
              </p>
              <p className="text-xs text-slate-500">Solo el PDF generado por el SIS (con texto), no fotocopias ni escaneos.</p>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => { elegirArchivo(e.target.files); e.target.value = ""; }}
              />
            </div>
            {errorPdf && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{errorPdf}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              <span className="text-[11px] uppercase tracking-widest text-slate-400">o</span>
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>
            <button
              onClick={cargarManual}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <PenLine size={14} />
              Cargar a mano (solo tengo el escaneo o la hoja física)
            </button>
          </div>
        )}

        {modo === "pdf" && prefill && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-900 rounded-xl px-4 py-3">
              <CheckCircle2 size={16} className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm flex-1 min-w-0">
                <p className="font-semibold text-green-700 dark:text-green-400">FIEH leído</p>
                <p className="text-xs text-green-700/80 dark:text-green-500 mt-0.5 truncate">{archivoNombre}</p>
                {(prefill.medicoAlta || prefill.jvpm) && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5">
                    Médico responsable del alta según el FIEH: <span className="font-medium">{prefill.medicoAlta || "—"}</span>
                    {prefill.jvpm && <span className="font-mono"> · JVPM {prefill.jvpm}</span>}
                  </p>
                )}
              </div>
              <button
                onClick={reiniciar}
                className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors flex-shrink-0"
              >
                <X size={12} /> Cambiar
              </button>
            </div>
            {prefill.advertencias.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle size={12} /> Revise a mano
                </p>
                <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-1 list-disc pl-4">
                  {prefill.advertencias.map((a) => <li key={a}>{a}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {modo === "manual" && (
          <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3">
            <PenLine size={16} className="text-slate-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm flex-1">
              <p className="font-semibold text-slate-700 dark:text-slate-200">Carga a mano</p>
              <p className="text-xs text-slate-500 mt-0.5">Todos los datos se escriben desde el FIEH físico o el escaneo, incluida la fecha de ingreso.</p>
            </div>
            <button
              onClick={reiniciar}
              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors flex-shrink-0"
            >
              <Upload size={12} /> Subir FIEH
            </button>
          </div>
        )}
      </Card>

      {mostrarFormulario && (
        <>
          {/* 2. Paciente */}
          <Card icon={User2} title="2. Paciente">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Expediente *</label>
                <input type="text" value={form.expediente} onChange={(e) => set("expediente", e.target.value)} className={`${inputCls} font-mono`} placeholder="Ej. 123-25" />
              </div>
              <div>
                <label className={labelCls}>Apellidos *</label>
                <input type="text" value={form.apellidos} onChange={(e) => set("apellidos", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Nombres *</label>
                <input type="text" value={form.nombres} onChange={(e) => set("nombres", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Sexo</label>
                <select value={form.genero} onChange={(e) => set("genero", e.target.value as Genero | "")} className={inputCls}>
                  <option value="">— Sin especificar</option>
                  <option value="masculino">Masculino</option>
                  <option value="femenino">Femenino</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>DUI</label>
                <input type="text" value={form.dui} onChange={(e) => set("dui", e.target.value)} className={`${inputCls} font-mono`} placeholder="########-#" />
              </div>
              <div>
                <label className={labelCls}>Nº de afiliación</label>
                <input type="text" value={form.numeroAfiliacion} onChange={(e) => set("numeroAfiliacion", e.target.value)} className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className={labelCls}>Pasaporte</label>
                <input type="text" value={form.pasaporte} onChange={(e) => set("pasaporte", e.target.value)} className={`${inputCls} font-mono`} />
              </div>
              <div className="sm:col-span-2 md:col-span-2">
                <label className={labelCls}>Dirección</label>
                <input type="text" value={form.direccion} onChange={(e) => set("direccion", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Departamento</label>
                <input type="text" value={form.departamento} onChange={(e) => set("departamento", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Municipio</label>
                <input type="text" value={form.municipio} onChange={(e) => set("municipio", e.target.value)} className={inputCls} />
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              Estos datos viven solo en esta constancia; no se crea el paciente en el padrón. Ocupación, teléfono y patrono
              se completan al imprimir, como en emergencia.
            </p>

            {duplicados.length > 0 && (
              <div className="mt-4 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle size={12} /> Este expediente ya tiene {duplicados.length === 1 ? "una incapacidad" : `${duplicados.length} incapacidades`} en la app
                </p>
                <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  {duplicados.slice(0, 5).map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-x-2">
                      <span>Alta {formatFecha(d.fechaAlta)} · {d.diasIncapacidad} días · Dr. {d.medicoNombre} · {ESTADO_INCAPACIDAD_LABEL[d.estado] ?? d.estado}</span>
                      <Link prefetch={false} href={`/dashboard/incapacidades/${d.id}`} target="_blank" className="text-blue-700 dark:text-blue-300 hover:underline font-medium">
                        Abrir
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-1.5">
                  Verifique que no sea el mismo egreso antes de continuar.
                </p>
              </div>
            )}
          </Card>

          {/* 3. Hospitalización */}
          <Card icon={BedDouble} title="3. Hospitalización">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Fecha de ingreso *</label>
                {ingresoBloqueado && fIng ? (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-sm text-slate-800 dark:text-slate-200">
                    <Lock size={13} className="text-slate-400 flex-shrink-0" />
                    {formatFecha(fIng)}
                  </div>
                ) : (
                  <DateField value={form.fechaIngreso} onChange={(v) => set("fechaIngreso", v)} ariaLabel="Fecha de ingreso" placeholder="Fecha de ingreso" fromYear={2015} />
                )}
                <p className="text-[11px] text-slate-400 mt-1">
                  {ingresoBloqueado
                    ? "Tomada del FIEH. Si hiciera falta corregirla, se hace después desde el detalle, con aclaración."
                    : modo === "pdf"
                      ? "El FIEH no la traía legible: indíquela a mano."
                      : "Según el FIEH físico."}
                </p>
              </div>
              <div>
                <label className={labelCls}>Fecha de egreso *</label>
                <DateField value={form.fechaEgreso} onChange={(v) => set("fechaEgreso", v)} ariaLabel="Fecha de egreso" placeholder="Fecha de egreso" fromYear={2015} />
                {egresoAntesIngreso && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">No puede ser anterior a la fecha de ingreso.</p>
                )}
                {prefill?.fechaEgreso && fEgr && toDateInput(prefill.fechaEgreso) !== form.fechaEgreso && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">El FIEH decía {formatFecha(prefill.fechaEgreso)}.</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Condición de egreso</label>
                <select value={form.condicion} onChange={(e) => set("condicion", e.target.value as CondicionEgresoIncapacidad)} className={inputCls}>
                  <option value="vivo">Vivo</option>
                  <option value="muerto">Muerto</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Servicio hospitalario *</label>
                <select value={form.servicio} onChange={(e) => set("servicio", e.target.value)} className={inputCls}>
                  <option value="">— Elija el servicio</option>
                  {servicios.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {servicioNoResuelto && !form.servicio && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                    El FIEH dice “{servicioNoResuelto}” y no coincide con el catálogo. Elija el equivalente.
                  </p>
                )}
                {prefill?.servicioCrudo && form.servicio && (
                  <p className="text-[11px] text-slate-400 mt-1">Según el FIEH: {prefill.servicioCrudo}</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Días de hospitalización</label>
                <div className="rounded-lg border border-blue-100 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-3 py-2 text-sm">
                  <span className="font-bold text-slate-900 dark:text-slate-100">{estancia ?? "—"}</span>
                  {estancia !== null && <span className="text-xs text-slate-500 ml-1">{estancia === 1 ? "día" : "días"} (ingreso y egreso cuentan)</span>}
                </div>
              </div>
            </div>

            {egresoReciente && (
              <div className="mt-3 flex items-start gap-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                <Info size={13} className="mt-0.5 flex-shrink-0" />
                <span>
                  Este egreso es del {formatFecha(FECHA_APERTURA_APP)} o posterior, cuando ESDOMED Services ya estaba en uso.
                  Normalmente el médico la solicita por la vía habitual; continúe solo si corresponde una reposición.
                </span>
              </div>
            )}
          </Card>

          {/* 4. Datos clínicos sugeridos */}
          <Card icon={Stethoscope} title="4. Datos clínicos sugeridos">
            <p className="text-xs text-slate-500 mb-3">
              Se toman del FIEH como punto de partida. El médico asignado los revisa y agrega los días adicionales,
              el tratamiento al alta y el seguimiento.
            </p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Diagnóstico de egreso</label>
                <textarea value={form.diagnostico} onChange={(e) => set("diagnostico", e.target.value)} className={textareaCls} placeholder="Diagnóstico principal según el FIEH…" />
              </div>
              <div>
                <label className={labelCls}>Recomendaciones</label>
                <textarea value={form.recomendaciones} onChange={(e) => set("recomendaciones", e.target.value)} className={textareaCls} />
              </div>
            </div>
          </Card>

          {/* 5. Médico */}
          <Card icon={UserCheck} title="5. Médico que completará la incapacidad">
            {sugerido && (
              <div className="mb-3 flex items-start gap-2 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-900 rounded-lg px-3 py-2 text-xs text-green-800 dark:text-green-300">
                <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0" />
                <span>
                  El JVPM del FIEH coincide con el usuario <span className="font-semibold">{sugerido.nombre}</span>. Quedó seleccionado; puede cambiarlo.
                </span>
              </div>
            )}
            {prefill && !sugerido && prefill.medicoAlta && (
              <div className="mb-3 flex items-start gap-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                <Info size={13} className="mt-0.5 flex-shrink-0" />
                <span>
                  El FIEH indica como responsable del alta a <span className="font-semibold">{prefill.medicoAlta}</span>
                  {prefill.jvpm && <> (JVPM {prefill.jvpm})</>}, pero no coincide con ningún usuario por JVPM. Elija a quién asignarla.
                </span>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Buscar médico</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={filtroMedico}
                    onChange={(e) => setFiltroMedico(e.target.value)}
                    placeholder="Nombre, JVPM o servicio…"
                    className={`${inputCls} pl-9`}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Médico asignado *</label>
                <select value={medicoIdEfectivo} onChange={(e) => setMedicoId(e.target.value)} className={inputCls} disabled={cargandoMedicos}>
                  <option value="">{cargandoMedicos ? "Cargando médicos…" : `— Elija (${opcionesMedico.length})`}</option>
                  {opcionesMedico.map((m) => (
                    <option key={m.uid} value={m.uid}>
                      {m.nombre}{m.jvpm ? ` · JVPM ${m.jvpm}` : ""}{m.servicio ? ` · ${m.servicio}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {!cargandoMedicos && medicos.length === 0 && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-2">No se pudo cargar la lista de médicos.</p>
            )}
            {medicoElegido && (
              <p className="mt-3 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-800">
                La reposición aparecerá en la bandeja de <span className="font-semibold">Dr. {medicoElegido.nombre}</span>
                {medicoElegido.jvpm && <> (JVPM {medicoElegido.jvpm})</>}, que la firmará al completarla.
              </p>
            )}
          </Card>

          {/* Footer */}
          <div>
            {error && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400 mb-3">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
              <Link
                prefetch={false}
                href="/dashboard/incapacidades/reposicion"
                className="flex items-center justify-center px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Cancelar
              </Link>
              <button
                onClick={guardar}
                disabled={guardando || cargandoMedicos}
                className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl disabled:opacity-50 transition-colors shadow-sm"
              >
                <Send size={14} />
                {guardando ? "Enviando…" : "Asignar y enviar al médico"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Card({
  icon: Icon, title, children,
}: {
  icon: typeof FileClock; title: string; children: React.ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 font-heading">
        <Icon size={15} className="text-slate-400" />
        {title}
      </h3>
      {children}
    </section>
  );
}
