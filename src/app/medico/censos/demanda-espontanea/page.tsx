"use client";

// Censo de demanda espontánea — página de registro.
// Se llega desde el botón "+" de la cola de expedientes. Un registro por
// atención; guardar con campos pendientes es válido (queda "Falta por cerrar").
// Diseño institucional HNES: hero con el degradado único y secciones numeradas.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addDoc, collection, deleteField, doc, getDoc, getDocs, query, Timestamp, updateDoc, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, Clock, IdCard, Loader2,
  NotebookPen, Plus, Stethoscope, Syringe, Users,
} from "lucide-react";
import type { DestinoEmergencia, Genero, TriageEmergencia, TurnoEmergencia } from "@/types";
import { toDate } from "@/lib/pacientes/helpers";
import { ESTABLECIMIENTOS } from "@/lib/establecimientos";
import { SERVICIOS_HOSPITALARIOS } from "@/lib/servicios";
import {
  DEPENDENCIAS_HES, DESTINOS, ESPECIALIDADES_EMERGENCIA, HOSPITALES_REFERENCIA,
  MEDICOS_GENERALES_EMERGENCIA, PROCEDIMIENTOS, STAFF_EMERGENCIA,
  TRIAGES, medicosGeneralesLista, procedimientosUnificados, tipoEvaluador, turnoSegunHora,
} from "@/lib/emergencia/censos";
import { buscarIdentidadPaciente, leerPrefillCola } from "@/lib/emergencia/prefillCenso";
import {
  ChipMulti, ChipSelect, DiagnosticosEditor, EvaluadorBadge, EvaluadorSelect,
  FaltantesHint, Field, MedicosGeneralesPicker, SelectCatalogo, SiNoChips, inputCls,
} from "@/components/emergencia/censoUi";
import {
  BOTON_PRIMARIO, CamposIdentidad, CamposMomento, NotaLocal, NotasEditor, Seccion,
  guardarMedicosGenerales, leerMedicosGeneralesGuardados, toDtLocal,
} from "@/components/emergencia/censoSecciones";

// Estado inicial del formulario (una atención nueva "ahora").
function formVacio(medicosGenerales: string[]) {
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
    procedimientosUE: [] as string[],
    notas: [] as NotaLocal[],
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

export default function CensoDemandaEspontaneaPage() {
  const { profile } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState<FormState>(() => formVacio(leerMedicosGeneralesGuardados()));
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const [editandoId, setEditandoId] = useState<string | null>(null);
  // Registro de control_ingresos al que se vincula esta atención (diferencia
  // censos cuando el paciente consulta varias veces). null = digitado directo.
  const [controlIngresoId, setControlIngresoId] = useState<string | null>(null);
  const [nuevaNota, setNuevaNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [buscandoId, setBuscandoId] = useState(false);
  const [fuentePrellenado, setFuentePrellenado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<{ expediente: string; cerrado: boolean } | null>(null);

  // Datos que vienen del botón "+" de la cola de expedientes. El momento de la
  // atención hereda la fecha/hora en que ESDOMED registró el expediente (mismo
  // registro del que salen nombre, edad y sexo) y el turno se sugiere según esa
  // hora. Se lee después de montar para no desalinear la hidratación; todo
  // sigue siendo editable.
  useEffect(() => {
    // Modo edición: ?editar=<id> (desde el libro de consulta de censos).
    const editar = new URLSearchParams(window.location.search).get("editar");
    if (editar) {
      (async () => {
        try {
          const snap = await getDoc(doc(db, "censo_demanda_espontanea", editar));
          if (!snap.exists()) { setError("No se encontró el registro a editar."); return; }
          const r = snap.data();
          const fecha = toDate(r.fecha) ?? new Date();
          const generales = medicosGeneralesLista(r.medicosGenerales);
          setEditandoId(editar);
          setControlIngresoId(typeof r.controlIngresoId === "string" ? r.controlIngresoId : null);
          setForm((f) => ({
            ...f,
            fechaHora: toDtLocal(fecha),
            turno: r.turno ?? f.turno,
            expediente: r.expediente ?? "",
            nombre: r.pacienteNombre ?? "",
            edad: r.edad !== undefined && r.edad !== null ? String(r.edad) : "",
            genero: r.genero ?? null,
            triage: r.triage ?? null,
            condicion: r.condicion ?? "vivo",
            diagnosticos: r.diagnosticos ?? [],
            especialidad: r.especialidad ?? "",
            traeReferencia: !!r.traeReferencia,
            lugarReferencia: r.lugarReferencia ?? "",
            destino: r.destino ?? null,
            servicioIngresar: r.servicioIngresar ?? "",
            centroRefiere: r.centroRefiere ?? "",
            staffEvalua: r.staffEvalua ?? "",
            reevaluacion: r.reevaluacion ?? "",
            ventilacionMecanica: !!r.ventilacionMecanica,
            aseguradoIsss: !!r.aseguradoIsss,
            empleadoHes: !!r.empleadoHes,
            dependencia: r.dependencia ?? "",
            procedimientosUE: procedimientosUnificados(r),
            notas: ((r.notas ?? []) as { texto: string; fecha: unknown }[])
              .map((n) => ({ texto: n.texto, fecha: (toDate(n.fecha) ?? new Date()).toISOString() })),
            medicosGenerales: generales.length ? generales : f.medicosGenerales,
          }));
        } catch (e) {
          setError(`No se pudo cargar el registro: ${e instanceof Error ? e.message : "error"}`);
        }
      })();
      return;
    }
    const p = leerPrefillCola();
    if (!p) return;
    setControlIngresoId(p.controlIngresoId ?? null);
    setForm((f) => ({
      ...f,
      expediente: p.expediente,
      nombre: p.nombre ?? f.nombre,
      edad: p.edad ?? f.edad,
      genero: p.genero ?? f.genero,
      fechaHora: p.fechaRegistro ? toDtLocal(p.fechaRegistro) : f.fechaHora,
      turno: p.fechaRegistro ? turnoSegunHora(p.fechaRegistro) : f.turno,
    }));
    setFuentePrellenado(
      p.fechaRegistro
        ? "Identidad y fecha/hora cargadas de la cola de expedientes."
        : "Identidad cargada de la cola de expedientes.",
    );
  }, []);

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

  const guardar = async () => {
    if (!profile) return;
    const dx = form.diagnosticos.filter((d) => d.codigo.trim() || d.descripcion.trim());
    // Lo único bloqueante es el expediente (identifica el registro); lo demás
    // puede quedar pendiente y el registro se guarda como "Falta por cerrar".
    if (!form.expediente.trim()) return setError("El expediente es obligatorio.");
    const faltan = camposFaltantes(form);

    // Si quedó texto escrito sin "Agregar", se agrega solo para no perderlo.
    const notas = [...form.notas];
    if (nuevaNota.trim()) notas.push({ texto: nuevaNota.trim().toUpperCase(), fecha: new Date().toISOString() });

    setError(null);
    setGuardando(true);
    try {
      const fecha = new Date(form.fechaHora);
      guardarMedicosGenerales(form.medicosGenerales);

      // Una misma ATENCIÓN no puede estar en los dos censos. Si ambos registros
      // tienen vínculo con la cola se compara el vínculo exacto (el paciente
      // puede consultar varias veces); sin vínculo se compara por mismo día.
      const mismoDia = (d?: Date) =>
        !!d && d.getFullYear() === fecha.getFullYear() && d.getMonth() === fecha.getMonth() && d.getDate() === fecha.getDate();
      const enReferidos = await getDocs(query(
        collection(db, "censo_referidos"),
        where("expediente", "==", form.expediente.trim()),
      ));
      const conflicto = enReferidos.docs.some((d) => {
        const otro = d.data();
        const otroCi = typeof otro.controlIngresoId === "string" && otro.controlIngresoId ? otro.controlIngresoId : null;
        if (controlIngresoId && otroCi) return otroCi === controlIngresoId;
        return mismoDia(toDate(otro.fecha));
      });
      if (conflicto) {
        setError("Esta atención ya está registrada en el censo de REFERIDOS; un paciente no puede estar en ambos censos por la misma atención.");
        setGuardando(false);
        return;
      }

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

      const datos = {
        estadoRegistro: faltan.length ? "abierto" : "cerrado",
        camposFaltantes: faltan,
        fecha: Timestamp.fromDate(fecha),
        turno: form.turno,
        expediente: form.expediente.trim(),
        pacienteNombre: form.nombre.trim().toUpperCase(),
        edad: form.edad.trim() ? Number(form.edad) : null,
        genero: form.genero,
        controlIngresoId,
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
        evaluadoPor: tipoEvaluador(form.staffEvalua.trim()),
        reevaluacion: form.reevaluacion.trim() || null,
        ventilacionMecanica: form.ventilacionMecanica,
        consulta48h,
        aseguradoIsss: form.aseguradoIsss,
        empleadoHes: form.empleadoHes,
        dependencia: form.empleadoHes ? form.dependencia : null,
        procedimientosUE: form.procedimientosUE,
        notas: notas.map((n) => ({ texto: n.texto, fecha: Timestamp.fromDate(new Date(n.fecha)) })),
        medicosGenerales: form.medicosGenerales,
      };

      if (editandoId) {
        await updateDoc(doc(db, "censo_demanda_espontanea", editandoId), {
          ...datos,
          procedimientosMaxima: deleteField(), // campo retirado: ya va fundido en procedimientosUE
          actualizadoEn: Timestamp.now(),
        });
      } else {
        await addDoc(collection(db, "censo_demanda_espontanea"), {
          ...datos,
          creadoEn: Timestamp.now(),
          creadoPorId: profile.uid,
          creadoPorNombre: profile.nombre,
        });
      }

      setGuardado({ expediente: form.expediente.trim(), cerrado: faltan.length === 0 });
    } catch (e) {
      setError(`Error al guardar: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setGuardando(false);
    }
  };

  const registrarOtra = () => {
    setForm(formVacio(leerMedicosGeneralesGuardados()));
    setControlIngresoId(null);
    setNuevaNota("");
    setFuentePrellenado(null);
    setError(null);
    setGuardado(null);
    window.scrollTo({ top: 0 });
  };

  // ── Pantalla de éxito ──
  if (guardado) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-4 mt-8">
          <div className="w-14 h-14 mx-auto bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 rounded-2xl flex items-center justify-center">
            <CheckCircle2 size={26} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">
              {editandoId ? "Cambios guardados en el censo" : "Atención registrada en el censo"}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Expediente <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{guardado.expediente}</span>
              {" — "}
              {guardado.cerrado
                ? "el registro quedó Terminado."
                : "el registro quedó Falta por cerrar; se puede completar después."}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {editandoId ? (
              <button onClick={() => router.push("/medico/censos")} className={`${BOTON_PRIMARIO} px-4 py-2`}>
                <ArrowLeft size={15} /> Volver al libro de censos
              </button>
            ) : (
              <button onClick={registrarOtra} className={`${BOTON_PRIMARIO} px-4 py-2`}>
                <Plus size={15} /> Registrar otra atención
              </button>
            )}
            <button
              onClick={() => router.push("/medico/cola-expedientes")}
              className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft size={14} /> Volver a la cola
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">

      {/* Hero institucional */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] px-5 py-5 shadow-lg shadow-cyan-950/15 md:px-7 md:py-6">
        <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full border border-white/10" />
        <div className="absolute bottom-[-5.5rem] right-16 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
              <ClipboardList size={24} className="text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-white md:text-2xl font-heading">Censo de demanda espontánea</h1>
                {editandoId && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-amber-300/60">
                    Editando registro
                  </span>
                )}
              </div>
              <p className="mt-1 max-w-xl text-sm text-cyan-50/90">Unidad de Emergencia · un registro por atención. Puede guardar con campos pendientes y completarlo después.</p>
            </div>
          </div>
          <Link
            href={editandoId ? "/medico/censos" : "/medico/cola-expedientes"}
            className="inline-flex items-center justify-center gap-1.5 self-start rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/25 transition-colors hover:bg-white/20"
          >
            <ArrowLeft size={16} /> {editandoId ? "Libro de censos" : "Cola de expedientes"}
          </Link>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 01 · Momento de la atención */}
      <Seccion num="01" titulo="Momento de la atención" icon={Clock}>
        <CamposMomento
          fechaHora={form.fechaHora}
          turno={form.turno}
          onFechaHora={(v) => set("fechaHora", v)}
          onTurno={(v) => set("turno", v)}
        />
      </Seccion>

      {/* 02 · Identificación del paciente */}
      <Seccion num="02" titulo="Identificación del paciente" icon={IdCard}>
        <CamposIdentidad
          expediente={form.expediente}
          nombre={form.nombre}
          edad={form.edad}
          genero={form.genero}
          onExpediente={(v) => set("expediente", v)}
          onNombre={(v) => set("nombre", v)}
          onEdad={(v) => set("edad", v)}
          onGenero={(v) => set("genero", v)}
          prellenar={prellenar}
          buscandoId={buscandoId}
          fuentePrellenado={fuentePrellenado}
        />
      </Seccion>

      {/* 03 · Evaluación médica */}
      <Seccion num="03" titulo="Evaluación médica" icon={Stethoscope}>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <Field label="Condición del paciente" required>
            <ChipSelect
              options={[{ value: "vivo", label: "Vivo" }, { value: "fallecido", label: "Fallecido" }]}
              value={form.condicion}
              onChange={(v) => set("condicion", v)}
            />
          </Field>
          <Field label="Triage" required>
            <ChipSelect options={TRIAGES} value={form.triage} onChange={(v) => set("triage", v)} />
          </Field>
          <Field label="Especialidad que requiere" required>
            <SelectCatalogo options={ESPECIALIDADES_EMERGENCIA} value={form.especialidad} onChange={(v) => set("especialidad", v)} />
          </Field>
        </div>

        <Field label="Impresión diagnóstica (CIE-10)" required className="xl:max-w-3xl">
          <DiagnosticosEditor value={form.diagnosticos} onChange={(v) => set("diagnosticos", v)} />
        </Field>

        <div className="border-t border-slate-100 dark:border-slate-800 pt-4 grid sm:grid-cols-2 xl:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)_minmax(0,2fr)] gap-4">
          <Field label="¿Trae referencia?" required>
            <SiNoChips value={form.traeReferencia} onChange={(v) => set("traeReferencia", v)} />
          </Field>
          {form.traeReferencia && (
            <Field label="Lugar de la referencia" required>
              <SelectCatalogo options={HOSPITALES_REFERENCIA} value={form.lugarReferencia} onChange={(v) => set("lugarReferencia", v)} />
            </Field>
          )}
        </div>

        <Field label="Destino del paciente" required>
          <ChipSelect options={DESTINOS} value={form.destino} onChange={(v) => set("destino", v)} />
        </Field>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {form.destino === "ingreso" && (
            <Field label="Servicio a ingresar" required>
              <SelectCatalogo options={SERVICIOS_HOSPITALARIOS} value={form.servicioIngresar} onChange={(v) => set("servicioIngresar", v)} />
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

        <div className="border-t border-slate-100 dark:border-slate-800 pt-4 grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <Field label="Ventilación mecánica" required>
            <SiNoChips value={form.ventilacionMecanica} onChange={(v) => set("ventilacionMecanica", v)} />
          </Field>
          <Field label="Consulta nuevamente en < 48 h">
            <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 leading-snug">
              Se calcula automáticamente al guardar
            </div>
          </Field>
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
      </Seccion>

      {/* 04 · Procedimientos */}
      <Seccion num="04" titulo="Procedimientos" icon={Syringe}>
        <Field label="Procedimientos en Unidad de Emergencia">
          <ChipMulti options={PROCEDIMIENTOS} value={form.procedimientosUE} onChange={(v) => set("procedimientosUE", v)} />
        </Field>
      </Seccion>

      {/* 05 · Personal médico que atiende */}
      <Seccion num="05" titulo="Personal médico que atiende" icon={Users}>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <Field label="Staff que evalúa" required>
            <EvaluadorSelect
              value={form.staffEvalua}
              onChange={(v) => set("staffEvalua", v)}
              staff={STAFF_EMERGENCIA}
              generales={MEDICOS_GENERALES_EMERGENCIA}
            />
            {form.staffEvalua && (
              <div className="mt-1.5"><EvaluadorBadge tipo={tipoEvaluador(form.staffEvalua)} /></div>
            )}
          </Field>
          <Field label="Staff que reevalúa">
            <EvaluadorSelect
              value={form.reevaluacion}
              onChange={(v) => set("reevaluacion", v)}
              staff={STAFF_EMERGENCIA}
              generales={MEDICOS_GENERALES_EMERGENCIA}
              placeholder="— No aplica"
            />
          </Field>
          <Field label="Médicos generales del turno (se recuerdan entre registros)" className="sm:col-span-2 xl:col-span-1">
            <MedicosGeneralesPicker
              value={form.medicosGenerales}
              onChange={(v) => set("medicosGenerales", v)}
              catalogo={MEDICOS_GENERALES_EMERGENCIA}
            />
          </Field>
        </div>
      </Seccion>

      {/* 06 · Plan y observaciones */}
      <Seccion num="06" titulo="Plan y observaciones" icon={NotebookPen}>
        <NotasEditor
          notas={form.notas}
          onChange={(v) => set("notas", v)}
          draft={nuevaNota}
          onDraftChange={setNuevaNota}
        />
      </Seccion>

      {/* Pie: estado + acciones */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <FaltantesHint faltantes={camposFaltantes(form)} />
        <div className="flex items-center gap-3 ml-auto">
          <Link
            href={editandoId ? "/medico/censos" : "/medico/cola-expedientes"}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Cancelar
          </Link>
          <button onClick={guardar} disabled={guardando} className={`${BOTON_PRIMARIO} px-5 py-2`}>
            {guardando ? <Loader2 size={15} className="animate-spin" /> : null}
            {guardando ? "Guardando..." : editandoId ? "Guardar cambios" : "Registrar atención"}
          </button>
        </div>
      </div>
    </div>
  );
}
