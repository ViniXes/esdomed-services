"use client";

// Censo de referidos — página de registro.
// Se llega desde el botón "+" de la cola de expedientes. Un registro por
// paciente referido de otro establecimiento; guardar con campos pendientes es
// válido (queda "Falta por cerrar").
// Diseño institucional HNES: hero con el degradado único y secciones numeradas.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, deleteField, doc, getDoc, getDocs, query, Timestamp, where, type DocumentData } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertTriangle, ArrowLeft, Building2, CheckCircle2, Clock, IdCard, Loader2,
  NotebookPen, Pencil, Plus, Stethoscope, Syringe, Timer, Users,
} from "lucide-react";
import type { Genero, TurnoEmergencia } from "@/types";
import { toDate } from "@/lib/pacientes/helpers";
import { SERVICIOS_HOSPITALARIOS } from "@/lib/servicios";
import {
  DESENLACES_SIN_INGRESO, DISPOSITIVOS_O2, HOSPITALES_REFERENCIA, PROCEDIMIENTOS, RAZONES_DEMORA,
  TIEMPOS_PERMANENCIA, clasificacionSis, medicosGeneralesLista, procedimientosUnificados,
  tipoEvaluador, turnoSegunHora, unirFormularios,
} from "@/lib/emergencia/censos";
import { useCatalogoPersonal } from "@/lib/emergencia/catalogoPersonal";
import {
  CensoYaRegistrado, buscarCensoDeAtencion, guardarCenso, versionCenso, type CensoGuardado,
} from "@/lib/emergencia/resumenCensoDatos";
import { buscarIdentidadPaciente, leerPrefillCola } from "@/lib/emergencia/prefillCenso";
import {
  ChipMulti, ChipSelect, DiagnosticosEditor,
  FaltantesHint, Field, SelectCatalogo, SiNoChips, inputCls,
} from "@/components/emergencia/censoUi";
import {
  AvisoCenso, AvisoCensoExistente, BOTON_PRIMARIO, BOTON_SECUNDARIO, CamposIdentidad, CamposMomento,
  CamposPersonal, NotaLocal, NotasEditor, Seccion, guardarMedicosGenerales,
  leerMedicosGeneralesGuardados, mensajeErrorCenso, toDtLocal,
} from "@/components/emergencia/censoSecciones";

const TRES_ESTADOS = [
  { value: "si", label: "Sí" },
  { value: "no", label: "No" },
  { value: "no_aplica", label: "No aplica" },
] as { value: "si" | "no" | "no_aplica"; label: string }[];

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
    hospitalReferencia: "",
    referenciaSis: true,
    condicion: null as "estable" | "inestable" | null,
    dispositivoO2: "No",
    diagnosticos: [] as { codigo: string; descripcion: string }[],
    discrepanciaDiagnostico: "no" as "si" | "no" | "no_aplica",
    modificacionServicio: "no" as "si" | "no" | "no_aplica",
    servicioIngreso: "",
    staffEvalua: "",
    reevaluacion: "",
    tiempoPermanencia: "",
    razonDemora: "",
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
  if (!f.hospitalReferencia) faltan.push("hospital de referencia");
  if (!f.condicion) faltan.push("condición");
  if (dx.length === 0) faltan.push("diagnóstico");
  if (!f.servicioIngreso) faltan.push("servicio de ingreso");
  if (!f.staffEvalua.trim()) faltan.push("staff que evalúa");
  if (!f.tiempoPermanencia) faltan.push("tiempo de permanencia");
  if (f.tiempoPermanencia.startsWith(">") && !f.razonDemora) faltan.push("razón de demora");
  return faltan;
}

// Un censo guardado, con la forma del formulario, para seguir editándolo.
function formDesdeRegistro(r: DocumentData, f: FormState): FormState {
  const generales = medicosGeneralesLista(r.medicosGenerales);
  return {
    ...f,
    fechaHora: toDtLocal(toDate(r.fecha) ?? new Date()),
    turno: r.turno ?? f.turno,
    expediente: r.expediente ?? "",
    nombre: r.pacienteNombre ?? "",
    edad: r.edad !== undefined && r.edad !== null ? String(r.edad) : "",
    genero: r.genero ?? null,
    hospitalReferencia: r.hospitalReferencia ?? "",
    referenciaSis: r.referenciaSis !== false,
    condicion: r.condicion ?? null,
    dispositivoO2: r.dispositivoO2 ?? "No",
    diagnosticos: r.diagnosticos ?? [],
    discrepanciaDiagnostico: r.discrepanciaDiagnostico ?? "no",
    modificacionServicio: r.modificacionServicio ?? "no",
    servicioIngreso: r.servicioIngreso ?? "",
    staffEvalua: r.staffEvalua ?? "",
    reevaluacion: r.reevaluacion ?? "",
    tiempoPermanencia: r.tiempoPermanencia ?? "",
    razonDemora: r.razonDemora ?? "",
    procedimientosUE: procedimientosUnificados(r),
    notas: ((r.notas ?? []) as { texto: string; fecha: unknown }[])
      .map((n) => ({ texto: n.texto, fecha: (toDate(n.fecha) ?? new Date()).toISOString() })),
    medicosGenerales: generales.length ? generales : f.medicosGenerales,
  };
}

export default function CensoReferidosPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const { catalogo, agregar: agregarAlCatalogo } = useCatalogoPersonal();

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
  const [guardado, setGuardado] = useState<{ id: string; version: number; expediente: string; cerrado: boolean } | null>(null);
  // Versión abierta para editar: si otra persona la cambia, guardar no la pisa.
  const [versionLeida, setVersionLeida] = useState<number>();
  const [existente, setExistente] = useState<CensoGuardado | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const abrirRegistro = useCallback((id: string, r: DocumentData) => {
    setEditandoId(id);
    setVersionLeida(versionCenso(r));
    setControlIngresoId(typeof r.controlIngresoId === "string" ? r.controlIngresoId : null);
    setFuentePrellenado(null);
    setForm((f) => formDesdeRegistro(r, f));
  }, []);

  // Derivados en vivo
  const clasifSis = form.hospitalReferencia ? clasificacionSis(form.hospitalReferencia, form.referenciaSis) : null;
  const requiereRazonDemora = form.tiempoPermanencia.startsWith(">");

  // Datos que vienen del botón "+" de la cola de expedientes (identidad y
  // fecha/hora del registro de ESDOMED). Todo sigue siendo editable.
  useEffect(() => {
    // Modo edición: ?editar=<id> (desde el libro de consulta de censos).
    const editar = new URLSearchParams(window.location.search).get("editar");
    if (editar) {
      (async () => {
        try {
          const snap = await getDoc(doc(db, "censo_referidos", editar));
          if (!snap.exists()) { setError("No se encontró el registro a editar."); return; }
          abrirRegistro(editar, snap.data());
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
    // El enlace pudo reabrirse (recargar, "atrás", otra pestaña) con el censo ya
    // guardado: se continúa ese registro. Si esto falla, guardar lo comprueba.
    if (!p.controlIngresoId) return;
    buscarCensoDeAtencion(p.controlIngresoId).then((c) => {
      if (c?.tipo === "referidos") {
        abrirRegistro(c.id, c.registro);
        setAviso(`Esta atención ya tenía censo, registrado por ${c.registro.creadoPorNombre}. Se abrió para completarlo; no se creará otro.`);
      } else if (c) {
        setExistente(c);
      }
    }).catch(() => {});
  }, [abrirRegistro]);

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

  // Si quedó texto escrito sin "Agregar", se agrega solo para no perderlo.
  const notasConBorrador = () => nuevaNota.trim()
    ? [...form.notas, { texto: nuevaNota.trim().toUpperCase(), fecha: new Date().toISOString() }]
    : form.notas;

  const guardar = async () => {
    if (!profile) return;
    const dx = form.diagnosticos.filter((d) => d.codigo.trim() || d.descripcion.trim());
    // Lo único bloqueante es el expediente (identifica el registro); lo demás
    // puede quedar pendiente y el registro se guarda como "Falta por cerrar".
    if (!form.expediente.trim()) return setError("El expediente es obligatorio.");
    const faltan = camposFaltantes(form);

    const notas = notasConBorrador();

    setError(null);
    setExistente(null);
    setGuardando(true);
    try {
      const fecha = new Date(form.fechaHora);
      guardarMedicosGenerales(form.medicosGenerales);

      // Una misma ATENCIÓN no puede estar en los dos censos. Si ambos registros
      // tienen vínculo con la cola se compara el vínculo exacto (el paciente
      // puede consultar varias veces); sin vínculo se compara por mismo día.
      const mismoDia = (d?: Date) =>
        !!d && d.getFullYear() === fecha.getFullYear() && d.getMonth() === fecha.getMonth() && d.getDate() === fecha.getDate();
      const enDemanda = await getDocs(query(
        collection(db, "censo_demanda_espontanea"),
        where("expediente", "==", form.expediente.trim()),
      ));
      const conflicto = enDemanda.docs.find((d) => {
        const otro = d.data();
        const otroCi = typeof otro.controlIngresoId === "string" && otro.controlIngresoId ? otro.controlIngresoId : null;
        if (controlIngresoId && otroCi) return otroCi === controlIngresoId;
        return mismoDia(toDate(otro.fecha));
      });
      if (conflicto) {
        setExistente({ tipo: "demanda", id: conflicto.id, registro: conflicto.data() });
        setGuardando(false);
        return;
      }

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
        hospitalReferencia: form.hospitalReferencia,
        referenciaSis: form.referenciaSis,
        clasificacionSis: clasifSis,
        condicion: form.condicion,
        dispositivoO2: form.dispositivoO2,
        diagnosticos: dx.map((d) => ({ codigo: d.codigo.trim().toUpperCase(), descripcion: d.descripcion.trim() })),
        discrepanciaDiagnostico: form.discrepanciaDiagnostico,
        modificacionServicio: form.modificacionServicio,
        servicioIngreso: form.servicioIngreso,
        staffEvalua: form.staffEvalua.trim(),
        evaluadoPor: tipoEvaluador(form.staffEvalua.trim(), catalogo),
        reevaluacion: form.reevaluacion.trim() || null,
        tiempoPermanencia: form.tiempoPermanencia,
        razonDemora: requiereRazonDemora ? form.razonDemora : null,
        procedimientosUE: form.procedimientosUE,
        notas: notas.map((n) => ({ texto: n.texto, fecha: Timestamp.fromDate(new Date(n.fecha)) })),
        medicosGenerales: form.medicosGenerales,
      };

      const { id, version } = await guardarCenso("referidos", editandoId, datos, editandoId
        ? {
            // campos retirados: ya van fundidos en procedimientosUE
            procedimientosMaxima: deleteField(),
            otrosProcedimientos: deleteField(),
            actualizadoEn: Timestamp.now(),
          }
        : {
            creadoEn: Timestamp.now(),
            creadoPorId: profile.uid,
            creadoPorNombre: profile.nombre,
          }, versionLeida);

      setForm((f) => ({ ...f, notas }));
      setNuevaNota("");
      setAviso(null);
      setGuardado({ id, version, expediente: form.expediente.trim(), cerrado: faltan.length === 0 });
    } catch (e) {
      if (e instanceof CensoYaRegistrado) setExistente(e.existente);
      else setError(mensajeErrorCenso(e));
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
    setAviso(null);
    setExistente(null);
    setVersionLeida(undefined);
    setGuardado(null);
    window.scrollTo({ top: 0 });
  };

  const seguirEditando = () => {
    if (!guardado) return;
    setEditandoId(guardado.id);
    setVersionLeida(guardado.version);
    setGuardado(null);
  };

  // Otra persona guardó primero: su registro se abre con lo escrito aquí encima,
  // para revisarlo y guardarlo sin que nadie pierda nada.
  const unirConExistente = () => {
    if (!existente) return;
    const escrito = { ...form, notas: notasConBorrador() };
    abrirRegistro(existente.id, existente.registro);
    setForm((f) => unirFormularios(f, escrito, formVacio([])));
    setNuevaNota("");
    setExistente(null);
    setAviso("Lo escrito se unió con el registro guardado. Revise y presione Guardar cambios.");
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
              {editandoId ? "Cambios guardados en el censo" : "Referido registrado en el censo"}
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
                <Plus size={15} /> Registrar otro referido
              </button>
            )}
            <button onClick={seguirEditando} className={BOTON_SECUNDARIO}>
              <Pencil size={14} /> Seguir editando
            </button>
            <button onClick={() => router.push("/medico/cola-expedientes")} className={BOTON_SECUNDARIO}>
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
              <Building2 size={24} className="text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-white md:text-2xl font-heading">Censo de referidos</h1>
                {editandoId && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-amber-300/60">
                    Editando registro
                  </span>
                )}
              </div>
              <p className="mt-1 max-w-xl text-sm text-cyan-50/90">Unidad de Emergencia · un registro por paciente referido de otro establecimiento. Puede guardar con campos pendientes y completarlo después.</p>
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

      {existente && (
        <AvisoCensoExistente existente={existente} tipoActual="referidos" editando={!!editandoId} onUnir={unirConExistente} />
      )}
      {aviso && <AvisoCenso>{aviso}</AvisoCenso>}

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

      {/* 03 · Referencia */}
      <Seccion num="03" titulo="Referencia" icon={Building2}>
        <div className="grid sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)_minmax(0,1fr)] gap-4">
          <Field label="Hospital de referencia" required>
            <SelectCatalogo options={HOSPITALES_REFERENCIA} value={form.hospitalReferencia} onChange={(v) => set("hospitalReferencia", v)} />
          </Field>
          <Field label="¿Referencia registrada en SIS?" required>
            <SiNoChips value={form.referenciaSis} onChange={(v) => set("referenciaSis", v)} />
          </Field>
          <Field label="Referencia en SIS (no modificar)">
            {clasifSis ? (
              <div className="inline-flex px-3 py-2 rounded-lg bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-900 text-xs font-mono font-semibold text-cyan-800 dark:text-cyan-300">
                {clasifSis}
              </div>
            ) : (
              <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 leading-snug">
                Se deriva del hospital y la casilla del SIS
              </div>
            )}
          </Field>
        </div>
      </Seccion>

      {/* 04 · Evaluación médica */}
      <Seccion num="04" titulo="Evaluación médica" icon={Stethoscope}>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Condición del paciente" required>
            <ChipSelect
              options={[
                { value: "estable", label: "Estable" },
                { value: "inestable", label: "Inestable", chip: "bg-red-600 text-white border-red-600" },
              ]}
              value={form.condicion}
              onChange={(v) => set("condicion", v)}
            />
          </Field>
          <Field label="Dispositivo de oxígeno al ingreso" required>
            <ChipSelect
              options={DISPOSITIVOS_O2.map((d) => ({ value: d, label: d }))}
              value={form.dispositivoO2}
              onChange={(v) => set("dispositivoO2", v)}
            />
          </Field>
        </div>

        <Field label="Diagnóstico (CIE-10)" required className="xl:max-w-3xl">
          <DiagnosticosEditor value={form.diagnosticos} onChange={(v) => set("diagnosticos", v)} />
        </Field>

        <div className="border-t border-slate-100 dark:border-slate-800 pt-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <Field label="¿Discrepancia en el diagnóstico del referido?" required>
            <ChipSelect options={TRES_ESTADOS} value={form.discrepanciaDiagnostico} onChange={(v) => set("discrepanciaDiagnostico", v)} />
          </Field>
          <Field label="¿Se modificó el servicio a ingresar?" required>
            <ChipSelect options={TRES_ESTADOS} value={form.modificacionServicio} onChange={(v) => set("modificacionServicio", v)} />
          </Field>
          <Field label="Servicio de ingreso / desenlace" required>
            <select
              value={form.servicioIngreso}
              onChange={(e) => set("servicioIngreso", e.target.value)}
              className={`${inputCls} cursor-pointer appearance-none`}
            >
              <option value="">— Seleccionar</option>
              <optgroup label="Servicios del hospital">
                {SERVICIOS_HOSPITALARIOS.map((s) => <option key={s} value={s}>{s}</option>)}
              </optgroup>
              <optgroup label="Desenlace sin ingreso">
                {DESENLACES_SIN_INGRESO.map((s) => <option key={s} value={s}>{s}</option>)}
              </optgroup>
            </select>
          </Field>
        </div>
      </Seccion>

      {/* 05 · Permanencia en admisión */}
      <Seccion num="05" titulo="Permanencia en admisión" icon={Timer}>
        <div className="grid sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
          <Field label="Tiempo total en Admisión previo al ingreso al servicio" required>
            <ChipSelect
              options={TIEMPOS_PERMANENCIA.map((t) => ({ value: t, label: t }))}
              value={form.tiempoPermanencia}
              onChange={(v) => set("tiempoPermanencia", v)}
            />
          </Field>
          {requiereRazonDemora && (
            <Field label="Razón de demora del traslado al servicio" required>
              <SelectCatalogo options={RAZONES_DEMORA} value={form.razonDemora} onChange={(v) => set("razonDemora", v)} />
            </Field>
          )}
        </div>
      </Seccion>

      {/* 06 · Procedimientos */}
      <Seccion num="06" titulo="Procedimientos" icon={Syringe}>
        <Field label="Procedimientos en Unidad de Emergencia">
          <ChipMulti options={PROCEDIMIENTOS} value={form.procedimientosUE} onChange={(v) => set("procedimientosUE", v)} />
        </Field>
      </Seccion>

      {/* 07 · Personal médico que atiende */}
      <Seccion num="07" titulo="Personal médico que atiende" icon={Users}>
        <CamposPersonal
          staffEvalua={form.staffEvalua}
          reevaluacion={form.reevaluacion}
          medicosGenerales={form.medicosGenerales}
          onStaffEvalua={(v) => set("staffEvalua", v)}
          onReevaluacion={(v) => set("reevaluacion", v)}
          onMedicosGenerales={(v) => set("medicosGenerales", v)}
          catalogo={catalogo}
          onAgregar={agregarAlCatalogo}
          etiquetaReevaluacion="Reevaluación médica"
        />
      </Seccion>

      {/* 08 · Observaciones */}
      <Seccion num="08" titulo="Observaciones" icon={NotebookPen}>
        <NotasEditor
          notas={form.notas}
          onChange={(v) => set("notas", v)}
          draft={nuevaNota}
          onDraftChange={setNuevaNota}
          placeholder="INGRESO A CAMA 31 MM1..."
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
            {guardando ? "Guardando..." : editandoId ? "Guardar cambios" : "Registrar referido"}
          </button>
        </div>
      </div>
    </div>
  );
}
