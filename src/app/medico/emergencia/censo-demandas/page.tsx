"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addDoc, collection, doc, getDocs, orderBy, query, Timestamp, updateDoc, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  ClipboardList, Download, Loader2, Pencil, Plus, RefreshCw, Search, AlertTriangle, X,
} from "lucide-react";
import type { CensoDemandaEspontanea, DestinoEmergencia, Genero, TriageEmergencia, TurnoEmergencia } from "@/types";
import { DateField } from "@/components/ui/DateField";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { toDate } from "@/lib/pacientes/helpers";
import { ESTABLECIMIENTOS } from "@/lib/establecimientos";
import {
  DEPENDENCIAS_HES, DESTINOS, DESTINO_LABEL, ESPECIALIDADES_EMERGENCIA, HOSPITALES_REFERENCIA,
  PROCEDIMIENTOS, SERVICIOS_INGRESO, STAFF_EMERGENCIA, TRIAGES, TRIAGE_LABEL, TURNOS, TURNO_LABEL,
  diagnosticosACelda, procsACelda, siNo, turnoSegunHora,
} from "@/lib/emergencia/censos";
import { buscarIdentidadPaciente } from "@/lib/emergencia/prefillCenso";
import {
  ChipMulti, ChipSelect, DiagnosticosEditor, EstadoRegistroBadge, FaltantesHint, Field,
  SelectCatalogo, SiNoChips, StaffInput, inputCls,
} from "@/components/emergencia/censoUi";

const pad = (n: number) => String(n).padStart(2, "0");
const toDia = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toDtLocal = (d: Date) =>
  `${toDia(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const LS_MEDICOS_GENERALES = "censoEmergencia:medicosGenerales";

// Estado inicial del formulario (una atención nueva "ahora").
function formVacio(medicosGenerales: string) {
  const ahora = new Date();
  return {
    fechaHora: toDtLocal(ahora),
    turno: turnoSegunHora(ahora) as TurnoEmergencia,
    expediente: "",
    nombre: "",
    edad: "",
    genero: null as Genero | null,
    triage: null as TriageEmergencia | null,
    condicion: "vivo" as "vivo" | "fallecido",
    diagnosticos: [] as { codigo: string; descripcion: string }[],
    especialidad: "",
    traeReferencia: false,
    lugarReferencia: "",
    destino: null as DestinoEmergencia | null,
    servicioIngresar: "",
    centroRefiere: "",
    staffEvalua: "",
    reevaluacion: "",
    ventilacionMecanica: false,
    aseguradoIsss: false,
    empleadoHes: false,
    dependencia: "",
    procedimientosMaxima: [] as string[],
    procedimientosUE: [] as string[],
    plan: "",
    medicosGenerales,
  };
}
type FormState = ReturnType<typeof formVacio>;

// Qué falta para que el registro quede "Terminado". Guardar con faltantes es
// válido: el registro queda "Falta por cerrar" y se completa después.
function camposFaltantes(f: FormState): string[] {
  const dx = f.diagnosticos.filter((d) => d.codigo.trim() || d.descripcion.trim());
  const faltan: string[] = [];
  if (!f.nombre.trim()) faltan.push("nombre");
  if (!f.genero) faltan.push("sexo");
  if (!f.triage) faltan.push("triage");
  if (dx.length === 0) faltan.push("diagnóstico");
  if (!f.especialidad) faltan.push("especialidad");
  if (!f.destino) faltan.push("destino");
  if (f.destino === "ingreso" && !f.servicioIngresar) faltan.push("servicio a ingresar");
  if (f.destino === "referencia" && !f.centroRefiere.trim()) faltan.push("centro al que refiere");
  if (f.traeReferencia && !f.lugarReferencia) faltan.push("lugar de referencia");
  if (f.empleadoHes && !f.dependencia) faltan.push("dependencia");
  if (!f.staffEvalua.trim()) faltan.push("staff que evalúa");
  return faltan;
}

export default function CensoDemandasPage() {
  const { profile } = useAuth();

  // ── Lista del día ──
  const [dia, setDia] = useState(() => toDia(new Date()));
  const [registros, setRegistros] = useState<CensoDemandaEspontanea[]>([]);
  const [cargando, setCargando] = useState(false);

  // ── Formulario ──
  const [showForm, setShowForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() =>
    formVacio(typeof window !== "undefined" ? localStorage.getItem(LS_MEDICOS_GENERALES) ?? "" : ""),
  );
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const [guardando, setGuardando] = useState(false);
  const [buscandoId, setBuscandoId] = useState(false);
  const [fuentePrellenado, setFuentePrellenado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [mesExport, setMesExport] = useState(() => toDia(new Date()).slice(0, 7));

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const desde = new Date(dia + "T00:00:00");
      const hasta = new Date(dia + "T23:59:59");
      const snap = await getDocs(query(
        collection(db, "censo_demanda_espontanea"),
        where("fecha", ">=", Timestamp.fromDate(desde)),
        where("fecha", "<=", Timestamp.fromDate(hasta)),
        orderBy("fecha", "desc"),
      ));
      setRegistros(snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, ...data, fecha: toDate(data.fecha) ?? new Date() } as CensoDemandaEspontanea;
      }));
    } catch (e) {
      setError(`No se pudo cargar el censo: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setCargando(false);
    }
  }, [dia]);

  useEffect(() => {
    const t = setTimeout(() => { cargar(); }, 0);
    return () => clearTimeout(t);
  }, [cargar]);

  // ── Prellenado de identidad (solo datos personales) ──
  const prellenar = async () => {
    if (!form.expediente.trim()) return;
    setBuscandoId(true);
    setFuentePrellenado(null);
    const id = await buscarIdentidadPaciente(form.expediente);
    setForm((f) => ({
      ...f,
      nombre: id.nombre ?? f.nombre,
      edad: id.edad !== undefined ? String(id.edad) : f.edad,
      genero: id.genero ?? f.genero,
    }));
    setFuentePrellenado(
      id.fuentes.length
        ? `Identidad cargada de: ${id.fuentes.join(" + ")}`
        : "Sin datos previos — completa nombre, edad y sexo manualmente.",
    );
    setBuscandoId(false);
  };

  const nuevo = () => {
    setEditandoId(null);
    setForm(formVacio(localStorage.getItem(LS_MEDICOS_GENERALES) ?? ""));
    setFuentePrellenado(null);
    setError(null);
    setShowForm(true);
  };

  const editar = (r: CensoDemandaEspontanea) => {
    setEditandoId(r.id!);
    setForm({
      fechaHora: toDtLocal(r.fecha),
      turno: r.turno,
      expediente: r.expediente,
      nombre: r.pacienteNombre,
      edad: r.edad !== undefined && r.edad !== null ? String(r.edad) : "",
      genero: r.genero,
      triage: r.triage,
      condicion: r.condicion,
      diagnosticos: r.diagnosticos ?? [],
      especialidad: r.especialidad ?? "",
      traeReferencia: r.traeReferencia,
      lugarReferencia: r.lugarReferencia ?? "",
      destino: r.destino,
      servicioIngresar: r.servicioIngresar ?? "",
      centroRefiere: r.centroRefiere ?? "",
      staffEvalua: r.staffEvalua,
      reevaluacion: r.reevaluacion ?? "",
      ventilacionMecanica: r.ventilacionMecanica,
      aseguradoIsss: r.aseguradoIsss,
      empleadoHes: r.empleadoHes,
      dependencia: r.dependencia ?? "",
      procedimientosMaxima: r.procedimientosMaxima ?? [],
      procedimientosUE: r.procedimientosUE ?? [],
      plan: r.plan ?? "",
      medicosGenerales: r.medicosGenerales ?? "",
    });
    setFuentePrellenado(null);
    setError(null);
    setShowForm(true);
  };

  const guardar = async () => {
    if (!profile) return;
    const dx = form.diagnosticos.filter((d) => d.codigo.trim() || d.descripcion.trim());
    // Lo único bloqueante es el expediente (identifica el registro); lo demás
    // puede quedar pendiente y el registro se guarda como "Falta por cerrar".
    if (!form.expediente.trim()) return setError("El expediente es obligatorio.");
    const faltan = camposFaltantes(form);

    setError(null);
    setGuardando(true);
    try {
      const fecha = new Date(form.fechaHora);
      localStorage.setItem(LS_MEDICOS_GENERALES, form.medicosGenerales.trim());

      // Derivado: ¿el mismo expediente consultó en las 48 h previas?
      const previos = await getDocs(query(
        collection(db, "censo_demanda_espontanea"),
        where("expediente", "==", form.expediente.trim()),
      ));
      const hace48h = fecha.getTime() - 48 * 60 * 60 * 1000;
      const consulta48h = previos.docs.some((d) => {
        if (d.id === editandoId) return false;
        const t = toDate(d.data().fecha)?.getTime() ?? 0;
        return t >= hace48h && t < fecha.getTime();
      });

      const datos: Record<string, unknown> = {
        estadoRegistro: faltan.length ? "abierto" : "cerrado",
        camposFaltantes: faltan,
        fecha: Timestamp.fromDate(fecha),
        turno: form.turno,
        expediente: form.expediente.trim(),
        pacienteNombre: form.nombre.trim().toUpperCase(),
        edad: form.edad.trim() ? Number(form.edad) : null,
        genero: form.genero,
        triage: form.triage,
        condicion: form.condicion,
        diagnosticos: dx.map((d) => ({ codigo: d.codigo.trim().toUpperCase(), descripcion: d.descripcion.trim() })),
        especialidad: form.especialidad,
        traeReferencia: form.traeReferencia,
        lugarReferencia: form.traeReferencia ? form.lugarReferencia : null,
        destino: form.destino,
        servicioIngresar: form.destino === "ingreso" ? form.servicioIngresar : null,
        centroRefiere: form.destino === "referencia" ? form.centroRefiere.trim() : null,
        staffEvalua: form.staffEvalua.trim(),
        reevaluacion: form.reevaluacion.trim() || null,
        ventilacionMecanica: form.ventilacionMecanica,
        consulta48h,
        aseguradoIsss: form.aseguradoIsss,
        empleadoHes: form.empleadoHes,
        dependencia: form.empleadoHes ? form.dependencia : null,
        procedimientosMaxima: form.procedimientosMaxima,
        procedimientosUE: form.procedimientosUE,
        plan: form.plan.trim() || null,
        medicosGenerales: form.medicosGenerales.trim() || null,
        actualizadoEn: Timestamp.now(),
      };

      if (editandoId) {
        await updateDoc(doc(db, "censo_demanda_espontanea", editandoId), datos);
      } else {
        await addDoc(collection(db, "censo_demanda_espontanea"), {
          ...datos,
          creadoEn: Timestamp.now(),
          creadoPorId: profile.uid,
          creadoPorNombre: profile.nombre,
        });
      }
      setShowForm(false);
      setEditandoId(null);
      if (toDia(fecha) !== dia) setDia(toDia(fecha)); else cargar();
    } catch (e) {
      setError(`Error al guardar: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setGuardando(false);
    }
  };

  // ── Export mensual con las columnas EXACTAS del libro de Excel ──
  const exportar = async () => {
    setExportando(true);
    setError(null);
    try {
      const [anio, mes] = mesExport.split("-").map(Number);
      const desde = new Date(anio, mes - 1, 1);
      const hasta = new Date(anio, mes, 0, 23, 59, 59);
      const snap = await getDocs(query(
        collection(db, "censo_demanda_espontanea"),
        where("fecha", ">=", Timestamp.fromDate(desde)),
        where("fecha", "<=", Timestamp.fromDate(hasta)),
        orderBy("fecha", "asc"),
      ));
      if (snap.empty) { setError(`No hay registros en ${mesExport}.`); return; }

      const XLSX = await import("xlsx");
      const filas = snap.docs.map((d) => {
        const r = d.data();
        const f = toDate(r.fecha) ?? new Date();
        return {
          "FECHA": `${pad(f.getDate())}/${pad(f.getMonth() + 1)}/${f.getFullYear()}`,
          "HORARIO": TURNO_LABEL[r.turno as TurnoEmergencia] ?? "",
          "NOMBRE DE PACIENTE": r.pacienteNombre,
          "# DE REGISTRO": r.expediente,
          "EDAD": r.edad ?? "",
          "TRIAGE": TRIAGE_LABEL[r.triage as TriageEmergencia] ?? "",
          "SEXO: M / F": r.genero === "masculino" ? "M" : r.genero === "femenino" ? "F" : "",
          "CONDICION DE PACIENTE": r.condicion === "vivo" ? "Vivo" : "Fallecido",
          "IMPRESION DIAGNOSTICA": diagnosticosACelda(r.diagnosticos ?? []),
          "ESPECIALIDAD": (r.especialidad ?? "").toUpperCase(),
          "TRAE REFERENCIA": r.traeReferencia ? "Sí" : "No",
          "LUGAR DE REFERENCIA": r.lugarReferencia ?? "",
          "DESTINO DE PACIENTE": DESTINO_LABEL[r.destino as DestinoEmergencia] ?? "",
          "SERVICIO A INGRESAR": r.servicioIngresar ?? "",
          "STAFF QUE EVALUA": r.staffEvalua,
          "REEVALUACION MEDICA": r.reevaluacion ?? "NO APLICA",
          "VENTILACION MECANICA": r.ventilacionMecanica ? "Sí" : "No",
          "MEDICO GENERAL QUE ASISTE EN LA ATENCION": r.medicosGenerales ?? "",
          "CENTRO DE SALUD AL QUE REFIERE": r.centroRefiere ?? "",
          "CONSULTA NUEVAMENTE EN < 48H": siNo(!!r.consulta48h),
          "ASEGURADO ISSS": siNo(!!r.aseguradoIsss),
          "EMPLEADO DE HES": siNo(!!r.empleadoHes),
          "DEPENDENCIA": r.dependencia ?? "",
          "PROCEDIMIENTOS EN MAXIMA": procsACelda(r.procedimientosMaxima ?? []),
          "PROCEDIMIENTO EN U/E": procsACelda(r.procedimientosUE ?? []),
          "PLAN / OBSERVACIONES": r.plan ?? "",
        };
      });
      const wb = XLSX.utils.book_new();
      const nombreHoja = desde.toLocaleDateString("es-SV", { month: "long" }).toUpperCase() + ` ${anio}`;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), nombreHoja);
      XLSX.writeFile(wb, `demandas_espontaneas_${mesExport}.xlsx`);
    } catch (e) {
      setError(`No se pudo exportar: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-50 dark:bg-orange-950 rounded-xl flex items-center justify-center border border-orange-200 dark:border-orange-900">
            <ClipboardList size={17} className="text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Censo de demanda espontánea</h1>
            <p className="text-xs text-slate-500">Unidad de Emergencia · un registro por atención</p>
          </div>
        </div>
        <button
          onClick={() => (showForm ? setShowForm(false) : nuevo())}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          {showForm ? <><X size={15} /> Cancelar</> : <><Plus size={15} /> Nuevo registro</>}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Formulario ── */}
      {showForm && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
            {editandoId ? "Editar registro" : "Nueva atención"}
          </p>

          {/* Atención */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Fecha y hora de la atención" required>
              <DateTimeField value={form.fechaHora} onChange={(v) => set("fechaHora", v)} maxDate={new Date()} />
            </Field>
            <Field label="Turno" required>
              <ChipSelect options={TURNOS} value={form.turno} onChange={(v) => set("turno", v)} />
            </Field>
          </div>

          {/* Identidad */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Paciente</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Expediente" required>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.expediente}
                    onChange={(e) => set("expediente", e.target.value.trim())}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), prellenar())}
                    onBlur={() => { if (!form.nombre) prellenar(); }}
                    placeholder="1234-26"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={prellenar}
                    disabled={buscandoId || !form.expediente.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {buscandoId ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    Buscar
                  </button>
                </div>
                {fuentePrellenado && <p className="text-[11px] text-slate-400 mt-1">{fuentePrellenado}</p>}
              </Field>
              <Field label="Nombre del paciente" required>
                <input type="text" value={form.nombre} onChange={(e) => set("nombre", e.target.value.toUpperCase())} className={inputCls} />
              </Field>
              <Field label="Edad (años)">
                <input type="number" min={0} max={120} value={form.edad} onChange={(e) => set("edad", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Sexo" required>
                <ChipSelect
                  options={[{ value: "masculino", label: "M" }, { value: "femenino", label: "F" }]}
                  value={form.genero}
                  onChange={(v) => set("genero", v)}
                />
              </Field>
            </div>
          </div>

          {/* Evaluación */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Evaluación</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Triage" required>
                <ChipSelect options={TRIAGES} value={form.triage} onChange={(v) => set("triage", v)} />
              </Field>
              <Field label="Condición del paciente" required>
                <ChipSelect
                  options={[{ value: "vivo", label: "Vivo" }, { value: "fallecido", label: "Fallecido" }]}
                  value={form.condicion}
                  onChange={(v) => set("condicion", v)}
                />
              </Field>
            </div>
            <Field label="Impresión diagnóstica (CIE-10)" required>
              <DiagnosticosEditor value={form.diagnosticos} onChange={(v) => set("diagnosticos", v)} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Especialidad que evalúa" required>
                <SelectCatalogo options={ESPECIALIDADES_EMERGENCIA} value={form.especialidad} onChange={(v) => set("especialidad", v)} />
              </Field>
              <Field label="Ventilación mecánica" required>
                <SiNoChips value={form.ventilacionMecanica} onChange={(v) => set("ventilacionMecanica", v)} />
              </Field>
            </div>
          </div>

          {/* Referencia y destino */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Referencia y destino</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="¿Trae referencia?" required>
                <SiNoChips value={form.traeReferencia} onChange={(v) => set("traeReferencia", v)} />
              </Field>
              {form.traeReferencia && (
                <Field label="Lugar de referencia" required>
                  <SelectCatalogo options={HOSPITALES_REFERENCIA} value={form.lugarReferencia} onChange={(v) => set("lugarReferencia", v)} />
                </Field>
              )}
            </div>
            <Field label="Destino del paciente" required>
              <ChipSelect options={DESTINOS} value={form.destino} onChange={(v) => set("destino", v)} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              {form.destino === "ingreso" && (
                <Field label="Servicio a ingresar" required>
                  <SelectCatalogo options={SERVICIOS_INGRESO} value={form.servicioIngresar} onChange={(v) => set("servicioIngresar", v)} />
                </Field>
              )}
              {form.destino === "referencia" && (
                <Field label="Centro de salud al que refiere" required>
                  <input
                    type="text"
                    list="centros-refiere"
                    value={form.centroRefiere}
                    onChange={(e) => set("centroRefiere", e.target.value.toUpperCase())}
                    placeholder="UCSF / hospital destino"
                    className={inputCls}
                  />
                  <datalist id="centros-refiere">
                    {ESTABLECIMIENTOS.map((e) => <option key={e} value={e.toUpperCase()} />)}
                  </datalist>
                </Field>
              )}
            </div>
          </div>

          {/* Médicos */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Médicos</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Staff que evalúa" required>
                <StaffInput id="staff-demandas" value={form.staffEvalua} onChange={(v) => set("staffEvalua", v)} staff={STAFF_EMERGENCIA} />
              </Field>
              <Field label="Reevaluación médica (vacío = no aplica)">
                <StaffInput id="reeval-demandas" value={form.reevaluacion} onChange={(v) => set("reevaluacion", v)} staff={STAFF_EMERGENCIA} />
              </Field>
            </div>
            <Field label="Médicos generales del turno (se recuerda entre registros)">
              <input
                type="text"
                value={form.medicosGenerales}
                onChange={(e) => set("medicosGenerales", e.target.value.toUpperCase())}
                placeholder="DRA. PÉREZ // DR. GÓMEZ // DRA. LÓPEZ"
                className={inputCls}
              />
            </Field>
          </div>

          {/* Administrativo */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Administrativo</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Asegurado ISSS" required>
                <SiNoChips value={form.aseguradoIsss} onChange={(v) => set("aseguradoIsss", v)} />
              </Field>
              <Field label="Empleado de HES" required>
                <SiNoChips value={form.empleadoHes} onChange={(v) => set("empleadoHes", v)} />
              </Field>
              {form.empleadoHes && (
                <Field label="Dependencia" required>
                  <SelectCatalogo options={DEPENDENCIAS_HES} value={form.dependencia} onChange={(v) => set("dependencia", v)} />
                </Field>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              &ldquo;Consulta nuevamente en &lt; 48 h&rdquo; se calcula automáticamente buscando el expediente en el censo.
            </p>
          </div>

          {/* Procedimientos */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Procedimientos</p>
            <Field label="En Máxima">
              <ChipMulti options={PROCEDIMIENTOS} value={form.procedimientosMaxima} onChange={(v) => set("procedimientosMaxima", v)} />
            </Field>
            <Field label="En Unidad de Emergencia">
              <ChipMulti options={PROCEDIMIENTOS} value={form.procedimientosUE} onChange={(v) => set("procedimientosUE", v)} />
            </Field>
            <Field label="Plan / observaciones">
              <textarea
                value={form.plan}
                onChange={(e) => set("plan", e.target.value.toUpperCase())}
                rows={2}
                className={`${inputCls} resize-none`}
                placeholder="ALTA CON MEDICAMENTO / INGRESO A CAMA..."
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <FaltantesHint faltantes={camposFaltantes(form)} />
            <div className="flex items-center gap-3 ml-auto">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={guardando}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors"
              >
                {guardando ? <Loader2 size={15} className="animate-spin" /> : null}
                {guardando ? "Guardando..." : editandoId ? "Guardar cambios" : "Registrar atención"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Día + export ── */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Día</span>
          <DateField value={dia} onChange={setDia} ariaLabel="Día del censo" />
        </div>
        <button
          onClick={cargar}
          disabled={cargando}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={cargando ? "animate-spin" : ""} />
          Actualizar
        </button>
        <div className="ml-auto flex items-center gap-2">
          <input type="month" value={mesExport} onChange={(e) => setMesExport(e.target.value)} className={`${inputCls} w-40`} />
          <button
            onClick={exportar}
            disabled={exportando}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
          >
            <Download size={14} />
            {exportando ? "Generando..." : "Exportar mes"}
          </button>
        </div>
      </div>

      {/* ── Lista del día ── */}
      {cargando ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : registros.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-14 text-center">
          <ClipboardList size={26} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">Sin registros para este día.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">
              {registros.length} atención{registros.length === 1 ? "" : "es"} el {dia.split("-").reverse().join("/")}
            </p>
            {registros.some((r) => r.estadoRegistro !== "cerrado") && (
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-2 py-0.5 rounded-full">
                {registros.filter((r) => r.estadoRegistro !== "cerrado").length} por cerrar
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  {["Hora / Turno", "Expediente", "Paciente", "Triage", "Diagnóstico", "Destino", "Estado", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {registros.map((r) => {
                  const t = TRIAGES.find((x) => x.value === r.triage);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                        {`${pad(r.fecha.getHours())}:${pad(r.fecha.getMinutes())}`}
                        <span className="block text-[10px] text-slate-400">{TURNO_LABEL[r.turno]}</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-700 dark:text-slate-300">{r.expediente}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{r.pacienteNombre || "—"}</p>
                        <p className="text-xs text-slate-500">
                          {r.edad !== null && r.edad !== undefined ? `${r.edad} años · ` : ""}
                          {r.genero === "masculino" ? "M" : r.genero === "femenino" ? "F" : "—"}
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        {t ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${t.chip}`}>
                            {t.label}
                          </span>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400 max-w-[220px] truncate">
                        {(r.diagnosticos ?? []).map((d) => d.descripcion).join(" // ") || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {r.destino ? DESTINO_LABEL[r.destino] : "—"}
                        {r.consulta48h && <span className="block text-[10px] text-amber-600 dark:text-amber-400 font-medium">&lt; 48 h</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <EstadoRegistroBadge estado={r.estadoRegistro ?? "cerrado"} faltantes={r.camposFaltantes} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => editar(r)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                          aria-label="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
