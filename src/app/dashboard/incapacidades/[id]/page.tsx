"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, onSnapshot, Timestamp, updateDoc, deleteDoc } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft, CheckCircle2, Clock, FileText, Printer, AlertTriangle,
  User2, Stethoscope, Trash2, Pencil, FileClock, UserCheck, Search, CalendarClock,
} from "lucide-react";
import { DateField } from "@/components/ui/DateField";
import type {
  BancoDeposito, InstitucionProvisional, Paciente, SolicitudIncapacidad,
} from "@/types";
import {
  calcularEdad, formatDuracion, formatFecha, formatFechaHora, nombreCompleto, toDate,
} from "@/lib/pacientes/helpers";
import {
  aMedianocheLocal, altaAntesDelIngreso, calcularPeriodoIncapacidad, diaSiguiente, diasAdicionalesGuardados,
  formatFechaConstanciaCorta, numeroALetras, pacienteDesdeIncapacidad, parseDateInput, mapIncapacidadData,
  recibidaEnEsdomed,
} from "@/lib/incapacidades/helpers";
import {
  cargarIncapacidadesDelExpediente, continuacionParaFirestore, incapacidadVigenteEn, vigenteDeContinuacion,
} from "@/lib/incapacidades/continuacion";
import { cargarMedicosAsignables, type MedicoAsignable } from "@/lib/incapacidades/reposicion";

const INSTITUCIONES: InstitucionProvisional[] = ["CRECER", "CONFIA", "INPEP", "IPSFA", "ISSS"];
const BANCOS: BancoDeposito[] = ["Promerica", "Atlantida"];

export default function IncapacidadDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { profile } = useAuth();

  const [incapacidad, setIncapacidad] = useState<SolicitudIncapacidad | null>(null);
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [loading, setLoading] = useState(true);

  const [institucion, setInstitucion] = useState<InstitucionProvisional | "">("");
  const [banco, setBanco] = useState<BancoDeposito | "">("");
  const [emitiendo, setEmitiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  // Corrección ESDOMED de la fecha de ingreso (solo afecta esta incapacidad).
  const [editandoIngreso, setEditandoIngreso] = useState(false);
  const [fechaIngresoEdit, setFechaIngresoEdit] = useState("");
  const [aclaracionIngreso, setAclaracionIngreso] = useState("");
  const [guardandoIngreso, setGuardandoIngreso] = useState(false);

  // Corrección ESDOMED de los días que otorgó el médico (solo esta incapacidad).
  const [editandoDias, setEditandoDias] = useState(false);
  const [diasEdit, setDiasEdit] = useState("");
  const [aclaracionDias, setAclaracionDias] = useState("");
  const [guardandoDias, setGuardandoDias] = useState(false);

  // Continuación: la incapacidad inicia al terminar otra vigente del paciente
  // (sin traslape). previasExp = todas las del expediente, para detectarla.
  const [previasExp, setPreviasExp] = useState<SolicitudIncapacidad[] | null>(null);
  const [editandoCont, setEditandoCont] = useState(false);
  const [contOrigen, setContOrigen] = useState<"sistema" | "manual">("sistema");
  const [contFechaManual, setContFechaManual] = useState("");
  const [aclaracionCont, setAclaracionCont] = useState("");
  const [guardandoCont, setGuardandoCont] = useState(false);

  // Reposición: reasignar el médico que debe completarla (mientras siga con él).
  const [reasignando, setReasignando] = useState(false);
  const [medicos, setMedicos] = useState<MedicoAsignable[] | null>(null);
  const [filtroMedico, setFiltroMedico] = useState("");
  const [medicoNuevoId, setMedicoNuevoId] = useState("");
  const [guardandoReasignacion, setGuardandoReasignacion] = useState(false);

  const esEsdomed = profile?.role === "esdomed" || profile?.role === "asistente_esdomed" || profile?.role === "admin";
  const puedeEliminar = esEsdomed;

  // Suscripción a la incapacidad
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "incapacidades", id), (snap) => {
      if (!snap.exists()) {
        setIncapacidad(null);
        setLoading(false);
        return;
      }
      const inc = mapIncapacidadData(snap.id, snap.data());
      setIncapacidad(inc);
      setInstitucion(inc.institucionProvisional ?? "");
      setBanco(inc.bancoDeposito ?? "");
    });
    return unsub;
  }, [id]);

  // Cargar paciente cuando tenemos la incapacidad
  useEffect(() => {
    if (!incapacidad) return;
    const pid = incapacidad.pacienteId;
    let cancelado = false;
    (async () => {
      let real: Paciente | null = null;
      if (pid) {
        const snap = await getDoc(doc(db, "pacientes", pid));
        if (snap.exists()) {
          const data = snap.data();
          real = {
            id: snap.id,
            ...data,
            fechaIngreso: toDate(data.fechaIngreso) ?? new Date(),
            fechaEgreso: toDate(data.fechaEgreso),
            fechaNacimiento: toDate(data.fechaNacimiento),
            creadoEn: toDate(data.creadoEn) ?? new Date(),
          } as Paciente;
        }
      }
      if (!cancelado) {
        // Sin ingreso (emergencia) → respaldo desde el snapshot de la incapacidad.
        setPaciente(real ?? pacienteDesdeIncapacidad(incapacidad));
        setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [incapacidad]);

  // Incapacidades del mismo expediente (una consulta al abrir; pocas por paciente).
  const expedienteInc = incapacidad?.pacienteExpediente;
  useEffect(() => {
    if (!expedienteInc) return;
    let cancelado = false;
    cargarIncapacidadesDelExpediente(expedienteInc)
      .then((lista) => { if (!cancelado) setPreviasExp(lista); })
      .catch(() => { if (!cancelado) setPreviasExp([]); });
    return () => { cancelado = true; };
  }, [expedienteInc]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-10">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!incapacidad) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-sm text-slate-500">Solicitud no encontrada.</p>
        <Link prefetch={false} href="/dashboard/incapacidades" className="text-sm text-blue-600 hover:underline">
          ← Volver
        </Link>
      </div>
    );
  }

  // Desglose de días: los "adicionales" son los que el médico otorga post-alta
  // (fechaAlta → fechaHasta, o desde el fin de la anterior si es continuación).
  // No se guardan aparte; se derivan comparando solo el día calendario. El
  // resto del total corresponde a la hospitalización.
  const diasAdicionales = diasAdicionalesGuardados(incapacidad);
  const diasHospitalizacion = Math.max(0, incapacidad.diasIncapacidad - diasAdicionales);

  // En emergencia no hay estancia: los días son solo los prescritos y no
  // dependen de la fecha de ingreso, así que la corrección no recalcula nada.
  const esEmergenciaInc = incapacidad.origen === "emergencia";

  // Días que otorgó el médico: los adicionales post-alta en hospitalización;
  // en emergencia el total prescrito. Es el número que ESDOMED puede corregir.
  const diasMedicoActuales = esEmergenciaInc ? incapacidad.diasIncapacidad : diasAdicionales;

  // ── Continuación de una incapacidad vigente ──
  const ingresoInc = incapacidad.fechaIngresoCorregida ?? paciente?.fechaIngreso;
  const inicioInc = esEmergenciaInc ? incapacidad.fechaAlta : ingresoInc;
  const vigenteGuardada = incapacidad.continuaDe ? vigenteDeContinuacion(incapacidad.continuaDe, previasExp ?? []) : null;
  const vigenteDetectada = !incapacidad.continuaDe && previasExp && inicioInc
    ? incapacidadVigenteEn(previasExp, inicioInc, {
        id: incapacidad.id,
        pacienteId: incapacidad.pacienteId,
        atencionEmergenciaId: incapacidad.atencionEmergenciaId,
      })
    : null;

  /** Período con o sin continuación, conservando los días que otorgó el médico. */
  const periodoCon = (hastaAnterior: Date | null | undefined, fechaIngreso: Date | undefined = ingresoInc) =>
    calcularPeriodoIncapacidad({
      fechaIngreso: esEmergenciaInc ? undefined : fechaIngreso,
      fechaAlta: incapacidad.fechaAlta,
      dias: diasMedicoActuales,
      emergencia: esEmergenciaInc,
      hastaAnterior,
    });

  const emitir = async () => {
    if (!profile || !incapacidad.id) return;
    setError(null);
    setEmitiendo(true);
    try {
      const ahora = Timestamp.now();
      const update: Record<string, unknown> = {
        estado: "emitida" as const,
        emitidaPor: profile.uid,
        emitidaPorNombre: profile.nombre,
        emitidaEn: ahora,
        fechaExpedicion: ahora,
      };
      if (institucion) update.institucionProvisional = institucion;
      if (banco) update.bancoDeposito = banco;
      await updateDoc(doc(db, "incapacidades", incapacidad.id), update);
    } catch (e) {
      setError(`Error al emitir: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setEmitiendo(false);
    }
  };

  const guardarSubsidios = async () => {
    if (!incapacidad.id) return;
    setError(null);
    const update: Record<string, unknown> = {};
    update.institucionProvisional = institucion || null;
    update.bancoDeposito = banco || null;
    await updateDoc(doc(db, "incapacidades", incapacidad.id), update);
  };

  const abrirImprimir = () => {
    window.open(`/dashboard/incapacidades/${incapacidad.id}/imprimir`, "_blank");
  };

  // ── Corrección de fecha de ingreso (ESDOMED) ──
  const aYMD = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const abrirEditarIngreso = () => {
    const base = incapacidad.fechaIngresoCorregida ?? paciente?.fechaIngreso;
    setFechaIngresoEdit(base ? aYMD(base) : "");
    setAclaracionIngreso(incapacidad.fechaIngresoAclaracion ?? "");
    setEditandoIngreso(true);
  };

  const guardarFechaIngreso = async () => {
    if (!incapacidad.id || !profile || !fechaIngresoEdit || !aclaracionIngreso.trim()) return;
    const nuevaFecha = new Date(fechaIngresoEdit + "T00:00:00");
    if (!esEmergenciaInc && altaAntesDelIngreso(incapacidad.fechaAlta, nuevaFecha)) {
      setError("La fecha de ingreso corregida no puede ser posterior a la fecha de alta.");
      return;
    }
    setError(null);
    setGuardandoIngreso(true);
    try {
      const update: Record<string, unknown> = {
        fechaIngresoCorregida: Timestamp.fromDate(nuevaFecha),
        fechaIngresoCorregidaPor: profile.nombre,
        fechaIngresoCorregidaEn: Timestamp.now(),
        fechaIngresoAclaracion: aclaracionIngreso.trim(),
      };
      // Hospitalización: la estancia depende del ingreso → se recalculan el total
      // de días y fechaDesde (= ingreso), igual que al crearla el médico. Los días
      // adicionales post-alta y fechaHasta no cambian.
      if (!esEmergenciaInc) {
        const p = periodoCon(incapacidad.continuaDe?.hastaAnterior, nuevaFecha);
        update.diasIncapacidad = p.total;
        update.fechaDesde = Timestamp.fromDate(p.desde);
        update.fechaHasta = Timestamp.fromDate(p.hasta);
      }
      await updateDoc(doc(db, "incapacidades", incapacidad.id), update);
      setEditandoIngreso(false);
    } catch (e) {
      setError(`Error al corregir la fecha: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setGuardandoIngreso(false);
    }
  };

  const quitarCorreccionIngreso = async () => {
    if (!incapacidad.id) return;
    setError(null);
    setGuardandoIngreso(true);
    try {
      const update: Record<string, unknown> = {
        fechaIngresoCorregida: null,
        fechaIngresoCorregidaPor: null,
        fechaIngresoCorregidaEn: null,
        fechaIngresoAclaracion: null,
      };
      // Restaurar el cálculo original con la fecha de ingreso del paciente.
      if (!esEmergenciaInc && paciente && !altaAntesDelIngreso(incapacidad.fechaAlta, paciente.fechaIngreso)) {
        const p = periodoCon(incapacidad.continuaDe?.hastaAnterior, paciente.fechaIngreso);
        update.diasIncapacidad = p.total;
        update.fechaDesde = Timestamp.fromDate(p.desde);
        update.fechaHasta = Timestamp.fromDate(p.hasta);
      }
      await updateDoc(doc(db, "incapacidades", incapacidad.id), update);
      setEditandoIngreso(false);
    } catch (e) {
      setError(`Error al quitar la corrección: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setGuardandoIngreso(false);
    }
  };

  // ── Corrección de días del médico (ESDOMED) ──
  const abrirEditarDias = () => {
    setDiasEdit(String(diasMedicoActuales));
    setAclaracionDias(incapacidad.diasAclaracion ?? "");
    setEditandoDias(true);
  };

  const guardarDias = async () => {
    if (!incapacidad.id || !profile || diasEdit === "" || !aclaracionDias.trim()) return;
    const nuevos = Number(diasEdit);
    if (!Number.isInteger(nuevos) || nuevos < (esEmergenciaInc ? 1 : 0)) return;
    setError(null);
    setGuardandoDias(true);
    try {
      // El total y fechaHasta se ajustan por la diferencia de días; la parte de
      // hospitalización (derivada de ingreso→alta) queda intacta.
      const delta = nuevos - diasMedicoActuales;
      const nuevaHasta = new Date(incapacidad.fechaHasta);
      nuevaHasta.setDate(nuevaHasta.getDate() + delta);
      const update: Record<string, unknown> = {
        diasIncapacidad: incapacidad.diasIncapacidad + delta,
        fechaHasta: Timestamp.fromDate(nuevaHasta),
        diasCorregidosPor: profile.nombre,
        diasCorregidosEn: Timestamp.now(),
        diasAclaracion: aclaracionDias.trim(),
      };
      // El valor original del médico se conserva desde la primera corrección.
      if (incapacidad.diasMedicoOriginal == null) update.diasMedicoOriginal = diasMedicoActuales;
      await updateDoc(doc(db, "incapacidades", incapacidad.id), update);
      setEditandoDias(false);
    } catch (e) {
      setError(`Error al corregir los días: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setGuardandoDias(false);
    }
  };

  const quitarCorreccionDias = async () => {
    if (!incapacidad.id || incapacidad.diasMedicoOriginal == null) return;
    setError(null);
    setGuardandoDias(true);
    try {
      const delta = incapacidad.diasMedicoOriginal - diasMedicoActuales;
      const nuevaHasta = new Date(incapacidad.fechaHasta);
      nuevaHasta.setDate(nuevaHasta.getDate() + delta);
      await updateDoc(doc(db, "incapacidades", incapacidad.id), {
        diasIncapacidad: incapacidad.diasIncapacidad + delta,
        fechaHasta: Timestamp.fromDate(nuevaHasta),
        diasMedicoOriginal: null,
        diasCorregidosPor: null,
        diasCorregidosEn: null,
        diasAclaracion: null,
      });
      setEditandoDias(false);
    } catch (e) {
      setError(`Error al quitar la corrección: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setGuardandoDias(false);
    }
  };

  // ── Continuación (ESDOMED) ──
  const abrirEditarContinuacion = () => {
    const c = incapacidad.continuaDe;
    const desdeSistema = c ? !!c.incapacidadAnteriorId : !!vigenteDetectada;
    setContOrigen(desdeSistema ? "sistema" : "manual");
    setContFechaManual(c && !c.incapacidadAnteriorId ? aYMD(c.hastaAnterior) : "");
    setAclaracionCont(c?.aclaracion ?? "");
    setEditandoCont(true);
  };

  const vigenteSistema = vigenteGuardada?.id ? vigenteGuardada : vigenteDetectada;
  const hastaContEdit = contOrigen === "sistema"
    ? vigenteSistema?.hasta ?? null
    : contFechaManual ? parseDateInput(contFechaManual) : null;
  // Si la anterior terminó antes de que empezara esta, no hay traslape que evitar.
  const contSinTraslape = !!hastaContEdit && !!inicioInc &&
    aMedianocheLocal(hastaContEdit).getTime() < aMedianocheLocal(inicioInc).getTime();
  const contPreview = editandoCont && hastaContEdit && !contSinTraslape ? periodoCon(hastaContEdit) : null;

  const guardarContinuacion = async () => {
    if (!incapacidad.id || !profile || !hastaContEdit || contSinTraslape || !aclaracionCont.trim()) return;
    setError(null);
    setGuardandoCont(true);
    try {
      const p = periodoCon(hastaContEdit);
      const anterior = contOrigen === "sistema" && vigenteSistema ? vigenteSistema : { hasta: hastaContEdit };
      await updateDoc(doc(db, "incapacidades", incapacidad.id), {
        diasIncapacidad: p.total,
        fechaDesde: Timestamp.fromDate(p.desde),
        fechaHasta: Timestamp.fromDate(p.hasta),
        continuaDe: continuacionParaFirestore(anterior, profile.nombre, aclaracionCont),
      });
      setEditandoCont(false);
    } catch (e) {
      setError(`Error al aplicar la continuación: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setGuardandoCont(false);
    }
  };

  const quitarContinuacion = async () => {
    if (!incapacidad.id || !incapacidad.continuaDe) return;
    setError(null);
    setGuardandoCont(true);
    try {
      const p = periodoCon(null);
      await updateDoc(doc(db, "incapacidades", incapacidad.id), {
        diasIncapacidad: p.total,
        fechaDesde: Timestamp.fromDate(p.desde),
        fechaHasta: Timestamp.fromDate(p.hasta),
        continuaDe: null,
      });
      setEditandoCont(false);
    } catch (e) {
      setError(`Error al quitar la continuación: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setGuardandoCont(false);
    }
  };

  const eliminar = async () => {
    if (!incapacidad.id) return;
    setEliminando(true);
    setError(null);
    try {
      await deleteDoc(doc(db, "incapacidades", incapacidad.id));
      router.push(incapacidad.origen === "reposicion" ? "/dashboard/incapacidades/reposicion" : "/dashboard/incapacidades");
    } catch (e) {
      setError(`Error al eliminar: ${e instanceof Error ? e.message : "desconocido"}`);
      setEliminando(false);
    }
  };

  const yaEmitida = incapacidad.estado === "emitida";

  // Reposición (egreso anterior a la app): mientras esté "pendiente_medico" la
  // tiene el médico asignado; no se emite ni se imprime hasta que la complete.
  const esReposicion = incapacidad.origen === "reposicion";
  const conElMedico = incapacidad.estado === "pendiente_medico";
  const rutaVolver = esReposicion ? "/dashboard/incapacidades/reposicion" : "/dashboard/incapacidades";

  const abrirReasignar = async () => {
    setMedicoNuevoId("");
    setFiltroMedico("");
    setReasignando(true);
    if (medicos === null) {
      try { setMedicos(await cargarMedicosAsignables()); } catch { setMedicos([]); }
    }
  };

  const guardarReasignacion = async () => {
    if (!incapacidad.id || !profile || !medicoNuevoId) return;
    const m = (medicos ?? []).find((x) => x.uid === medicoNuevoId);
    if (!m) return;
    setError(null);
    setGuardandoReasignacion(true);
    try {
      await updateDoc(doc(db, "incapacidades", incapacidad.id), {
        medicoId: m.uid,
        medicoNombre: m.nombre,
        medicoJvpm: m.jvpm ?? null,
        "reposicion.asignadaEn": Timestamp.now(),
        "reposicion.asignadaPorNombre": profile.nombre,
      });
      setReasignando(false);
    } catch (e) {
      setError(`Error al reasignar: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setGuardandoReasignacion(false);
    }
  };

  const medicosFiltrados = (() => {
    const t = filtroMedico.trim().toLowerCase();
    const lista = medicos ?? [];
    if (!t) return lista;
    return lista.filter((m) =>
      m.nombre.toLowerCase().includes(t) || (m.jvpm ?? "").toLowerCase().includes(t) || (m.servicio ?? "").toLowerCase().includes(t),
    );
  })();

  // Validación en vivo de la fecha corregida: la estancia no puede ser negativa.
  const fechaIngresoEditInvalida = !esEmergenciaInc && editandoIngreso && !!fechaIngresoEdit &&
    altaAntesDelIngreso(incapacidad.fechaAlta, new Date(fechaIngresoEdit + "T00:00:00"));

  // Validación en vivo de los días corregidos + vista previa del resultado.
  const diasEditNum = Number(diasEdit);
  const diasEditInvalido = editandoDias && diasEdit !== "" &&
    (!Number.isInteger(diasEditNum) || diasEditNum < (esEmergenciaInc ? 1 : 0));
  const diasEditDelta = diasEditNum - diasMedicoActuales;
  const hastaPreview = (() => {
    if (!editandoDias || diasEdit === "" || diasEditInvalido || diasEditDelta === 0) return null;
    const d = new Date(incapacidad.fechaHasta);
    d.setDate(d.getDate() + diasEditDelta);
    return d;
  })();

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => router.push(rutaVolver)}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors flex-shrink-0"
          aria-label="Volver"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[11px] text-slate-400 font-medium uppercase tracking-widest">
              {esReposicion ? "Reposición de incapacidad" : "Solicitud de incapacidad"}
            </p>
            {yaEmitida ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 px-2 py-0.5 rounded-full">
                <CheckCircle2 size={10} /> Emitida
              </span>
            ) : conElMedico ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-2 py-0.5 rounded-full">
                <Stethoscope size={10} /> Con el médico
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-2 py-0.5 rounded-full">
                <Clock size={10} /> Pendiente de emitir
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            {incapacidad.pacienteNombre}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Exp. <span className="font-mono">{incapacidad.pacienteExpediente}</span>
            {" · "}{incapacidad.servicioPaciente}
            {incapacidad.camaPaciente && ` · Cama ${incapacidad.camaPaciente}`}
          </p>
          {/* Hora exacta de envío: para auditar cuándo llegó a ESDOMED. */}
          <p className="inline-flex items-center gap-1 text-xs text-slate-500 mt-1">
            <Clock size={11} className="text-slate-400 flex-shrink-0" />
            {esReposicion
              ? incapacidad.reposicion?.completadaEn
                ? `Completada por el médico el ${formatFechaHora(incapacidad.reposicion.completadaEn)}`
                : `Cargada por ESDOMED el ${formatFechaHora(incapacidad.creadoEn)}`
              : `Enviada por el médico el ${formatFechaHora(incapacidad.creadoEn)}`}
          </p>
        </div>
        {!conElMedico && (
          <button
            onClick={abrirImprimir}
            className="flex items-center gap-1.5 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex-shrink-0"
          >
            <Printer size={14} />
            Imprimir constancia
          </button>
        )}
      </div>

      {/* Reposición: trazabilidad de la carga y del médico asignado */}
      {esReposicion && (
        <Card icon={FileClock} title="Reposición (egreso anterior a la app)">
          <div className="grid md:grid-cols-2 gap-3 gap-x-6">
            <Row
              label="Cargada por"
              value={incapacidad.reposicion
                ? `${incapacidad.reposicion.creadaPorNombre} · ${formatFechaHora(incapacidad.creadoEn)}`
                : formatFechaHora(incapacidad.creadoEn)}
            />
            <Row
              label="Fuente"
              value={incapacidad.reposicion?.cargaManual
                ? "Carga a mano (sin PDF digital)"
                : `FIEH${incapacidad.reposicion?.archivoNombre ? ` · ${incapacidad.reposicion.archivoNombre}` : ""}`}
            />
            {incapacidad.reposicion?.fiehFechaIngreso && (
              <Row label="Ingreso (FIEH)" value={formatFecha(incapacidad.reposicion.fiehFechaIngreso)} />
            )}
            {incapacidad.reposicion?.fiehFechaEgreso && (
              <Row label="Egreso (FIEH)" value={formatFecha(incapacidad.reposicion.fiehFechaEgreso)} />
            )}
            {incapacidad.reposicion?.fiehServicio && (
              <Row label="Servicio (FIEH)" value={incapacidad.reposicion.fiehServicio} />
            )}
            {incapacidad.reposicion?.fiehMedicoAlta && (
              <Row
                label="Médico del alta (FIEH)"
                value={`${incapacidad.reposicion.fiehMedicoAlta}${incapacidad.reposicion.fiehJvpm ? ` · JVPM ${incapacidad.reposicion.fiehJvpm}` : ""}`}
              />
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="text-sm">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Médico asignado</p>
                <p className="font-medium text-slate-800 dark:text-slate-200">
                  Dr. {incapacidad.medicoNombre}
                  {incapacidad.medicoJvpm && <span className="text-xs text-slate-500 font-mono ml-2">JVPM {incapacidad.medicoJvpm}</span>}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {incapacidad.reposicion?.completadaEn
                    ? `Completó los datos clínicos el ${formatFechaHora(incapacidad.reposicion.completadaEn)}.`
                    : incapacidad.reposicion
                      ? `Asignada el ${formatFechaHora(incapacidad.reposicion.asignadaEn)}${incapacidad.reposicion.asignadaPorNombre ? ` por ${incapacidad.reposicion.asignadaPorNombre}` : ""}. Aún no la completa.`
                      : ""}
                </p>
              </div>
              {esEsdomed && conElMedico && !reasignando && (
                <button
                  onClick={abrirReasignar}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <UserCheck size={12} /> Reasignar médico
                </button>
              )}
            </div>

            {reasignando && (
              <div className="mt-3 space-y-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={filtroMedico}
                      onChange={(e) => setFiltroMedico(e.target.value)}
                      placeholder="Buscar por nombre, JVPM o servicio…"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <select
                    value={medicoNuevoId}
                    onChange={(e) => setMedicoNuevoId(e.target.value)}
                    disabled={medicos === null}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">{medicos === null ? "Cargando médicos…" : "— Elija el nuevo médico"}</option>
                    {medicosFiltrados.filter((m) => m.uid !== incapacidad.medicoId).map((m) => (
                      <option key={m.uid} value={m.uid}>
                        {m.nombre}{m.jvpm ? ` · JVPM ${m.jvpm}` : ""}{m.servicio ? ` · ${m.servicio}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[11px] text-slate-400">
                  La reposición desaparece de la bandeja del médico actual y aparece en la del nuevo.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={guardarReasignacion}
                    disabled={guardandoReasignacion || !medicoNuevoId}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {guardandoReasignacion ? "Guardando..." : "Reasignar"}
                  </button>
                  <button
                    onClick={() => setReasignando(false)}
                    disabled={guardandoReasignacion}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {yaEmitida && (
        <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-900 rounded-xl px-4 py-3 flex items-center gap-3">
          <CheckCircle2 size={16} className="text-green-600 dark:text-green-400 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-green-700 dark:text-green-400">
              Emitida por {incapacidad.emitidaPorNombre}
            </p>
            <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">
              {incapacidad.emitidaEn && formatFechaHora(incapacidad.emitidaEn)}
              {incapacidad.emitidaEn &&
                ` · ${formatDuracion(incapacidad.emitidaEn.getTime() - recibidaEnEsdomed(incapacidad).getTime())} después de recibirla`}
            </p>
          </div>
        </div>
      )}

      {/* Datos del paciente */}
      <Card icon={User2} title="Paciente">
        {paciente ? (
          <div className="grid md:grid-cols-2 gap-3 gap-x-6">
            <Row label="Nombre" value={nombreCompleto(paciente)} />
            <Row label="Expediente" value={paciente.expediente} mono />
            <Row label="DUI" value={paciente.dui} mono />
            <Row label="Nº Afiliación" value={paciente.numeroAfiliacion} mono />
            <Row label="Edad" value={calcularEdad(paciente.fechaNacimiento) !== null ? `${calcularEdad(paciente.fechaNacimiento)} años` : undefined} />
            <Row label="Género" value={paciente.genero === "masculino" ? "Masculino" : paciente.genero === "femenino" ? "Femenino" : "Otro"} />
            <Row
              label="Teléfono"
              value={
                paciente.telefono || paciente.otrosNumeros ||
                (paciente.responsable?.telefono
                  ? `${paciente.responsable.telefono} (${paciente.responsable.parentesco || "responsable"})`
                  : undefined)
              }
              mono
            />
            <Row label="Ocupación" value={paciente.ocupacion} />
            <Row label="Departamento" value={paciente.departamento} />
            <Row label="Municipio" value={paciente.municipio} />
            <Row label="Dirección" value={paciente.direccion} />
            {/* Fecha de ingreso: ESDOMED puede corregirla (solo para esta
                incapacidad y su constancia; no modifica el expediente). */}
            <div className="flex gap-3 text-sm">
              <span className="text-slate-500 text-xs pt-0.5 font-medium w-32 flex-shrink-0">Fecha ingreso</span>
              <div className="flex-1 min-w-0">
                {!editandoIngreso ? (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-slate-800 dark:text-slate-200">
                        {formatFecha(incapacidad.fechaIngresoCorregida ?? paciente.fechaIngreso)}
                      </span>
                      {esEsdomed && (
                        <button
                          onClick={abrirEditarIngreso}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <Pencil size={10} /> Corregir
                        </button>
                      )}
                    </div>
                    {incapacidad.fechaIngresoCorregida && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                        Corregida por {incapacidad.fechaIngresoCorregidaPor ?? "ESDOMED"}
                        {" · "}original: {formatFecha(paciente.fechaIngreso)}
                      </p>
                    )}
                    {incapacidad.fechaIngresoCorregida && incapacidad.fechaIngresoAclaracion && (
                      <p className="mt-1.5 text-[11px] text-slate-700 dark:text-slate-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg px-2.5 py-1.5">
                        <span className="font-semibold">Aclaración:</span> {incapacidad.fechaIngresoAclaracion}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <DateField
                      value={fechaIngresoEdit}
                      onChange={setFechaIngresoEdit}
                      ariaLabel="Fecha de ingreso corregida"
                    />
                    {fechaIngresoEditInvalida && (
                      <p className="text-[11px] text-red-600 dark:text-red-400">
                        No puede ser posterior a la fecha de alta ({formatFecha(incapacidad.fechaAlta)}).
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400">
                      {esEmergenciaInc
                        ? "Solo cambia la fecha impresa en la constancia; los días prescritos no varían."
                        : "Al guardar se recalculan los días de hospitalización y el total de días; los días adicionales que otorgó el médico se conservan."}
                    </p>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Aclaración de la corrección <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        value={aclaracionIngreso}
                        onChange={e => setAclaracionIngreso(e.target.value)}
                        rows={2}
                        placeholder="Ej. La fecha enviada por el médico no coincide con el ingreso registrado en SIS..."
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={guardarFechaIngreso}
                        disabled={guardandoIngreso || !fechaIngresoEdit || !aclaracionIngreso.trim() || fechaIngresoEditInvalida}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {guardandoIngreso ? "Guardando..." : "Guardar"}
                      </button>
                      <button
                        onClick={() => setEditandoIngreso(false)}
                        disabled={guardandoIngreso}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      {incapacidad.fechaIngresoCorregida && (
                        <button
                          onClick={quitarCorreccionIngreso}
                          disabled={guardandoIngreso}
                          className="px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950 rounded-lg transition-colors disabled:opacity-50"
                        >
                          Quitar corrección
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-amber-600 dark:text-amber-400 italic">
            Paciente no encontrado en BD (puede haberse borrado). La constancia mostrará solo el nombre snapshot.
          </p>
        )}
      </Card>

      {/* Datos clínicos */}
      <Card icon={Stethoscope} title="Datos de la incapacidad">
        <div className="grid md:grid-cols-3 gap-3 gap-x-6">
          <Row label={esReposicion ? "Médico asignado" : "Médico"} value={`Dr. ${incapacidad.medicoNombre}`} />
          <Row label="JVPM" value={incapacidad.medicoJvpm} mono />
          <Row label="Servicio" value={incapacidad.medicoServicio} />

          <Row label="Fecha de alta" value={formatFecha(incapacidad.fechaAlta)} />
          <Row label="Total días" value={`${incapacidad.diasIncapacidad} (${numeroALetras(incapacidad.diasIncapacidad)})`} />
          <Row label="Condición egreso" value={incapacidad.condicionEgreso === "muerto" ? "Muerto" : "Vivo"} />

          <Row label="Días hospitalización" value={`${diasHospitalizacion} ${diasHospitalizacion === 1 ? "día" : "días"}`} />
          <Row label="Días adicionales (médico)" value={`${diasAdicionales} ${diasAdicionales === 1 ? "día" : "días"}`} />
          <div />

          <Row label="Desde" value={formatFechaConstanciaCorta(incapacidad.fechaDesde)} mono />
          <Row label="Hasta" value={formatFechaConstanciaCorta(incapacidad.fechaHasta)} mono />
          <div />
        </div>
        <p className="mt-3 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-800">
          <span className="font-semibold text-slate-700 dark:text-slate-300">{incapacidad.diasIncapacidad} días en total</span>
          {" = "}{diasHospitalizacion} de hospitalización + <span className="font-semibold text-slate-700 dark:text-slate-300">{diasAdicionales} adicionales</span> que otorgó el médico.
          {incapacidad.continuaDe && !esEmergenciaInc && diasHospitalizacion === 0 && " La estancia ya la cubría la incapacidad anterior."}
          {esEsdomed && !editandoDias && (
            <button
              onClick={abrirEditarDias}
              className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline align-baseline"
            >
              <Pencil size={10} /> Corregir días
            </button>
          )}
          {esEsdomed && !editandoCont && !incapacidad.continuaDe && !vigenteDetectada && (
            <button
              onClick={abrirEditarContinuacion}
              className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline align-baseline"
            >
              <CalendarClock size={10} /> Inicia al terminar otra incapacidad
            </button>
          )}
        </p>

        {/* Traslape detectado con otra incapacidad del expediente */}
        {vigenteDetectada && !editandoCont && (
          <div className="mt-2 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900 dark:bg-amber-950/40">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1 text-xs text-amber-800 dark:text-amber-300">
              <p className="font-semibold">
                Se traslapa con otra incapacidad del paciente: del {formatFechaConstanciaCorta(vigenteDetectada.desde ?? vigenteDetectada.hasta)} al {formatFechaConstanciaCorta(vigenteDetectada.hasta)}
              </p>
              <p className="mt-0.5 text-amber-700 dark:text-amber-400">
                {vigenteDetectada.medicoNombre && <>Dr. {vigenteDetectada.medicoNombre} · {vigenteDetectada.dias} días. </>}
                El patrono puede rechazar esta constancia por estar dentro del período de la anterior.
              </p>
              {esEsdomed && (
                <button
                  onClick={abrirEditarContinuacion}
                  className="mt-1.5 inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline dark:text-blue-300"
                >
                  <CalendarClock size={12} /> Iniciar el {formatFechaConstanciaCorta(diaSiguiente(vigenteDetectada.hasta))}, al terminar la anterior
                </button>
              )}
            </div>
          </div>
        )}

        {/* Continuación vigente (no se imprime: la constancia solo lleva las fechas) */}
        {incapacidad.continuaDe && vigenteGuardada && !editandoCont && (
          <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-[11px] text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
            <p className="flex items-center gap-1.5 font-semibold text-blue-800 dark:text-blue-300">
              <CalendarClock size={12} />
              Continúa la incapacidad {vigenteGuardada.desde ? `del ${formatFechaConstanciaCorta(vigenteGuardada.desde)} al` : "que terminaba el"} {formatFechaConstanciaCorta(vigenteGuardada.hasta)}
              {vigenteGuardada.medicoNombre && <span className="font-normal"> · Dr. {vigenteGuardada.medicoNombre}</span>}
            </p>
            <p className="mt-0.5">
              Inicia el {formatFechaConstanciaCorta(incapacidad.fechaDesde)} para no traslaparse. Aplicada por {incapacidad.continuaDe.aplicadaPor || "—"} el {formatFecha(incapacidad.continuaDe.aplicadaEn)}.
              {vigenteGuardada.id && aMedianocheLocal(vigenteGuardada.hasta).getTime() !== aMedianocheLocal(incapacidad.continuaDe.hastaAnterior).getTime() && (
                <span className="text-amber-700 dark:text-amber-400"> La anterior ahora termina el {formatFechaConstanciaCorta(vigenteGuardada.hasta)}: vuelve a aplicarla para recalcular.</span>
              )}
            </p>
            {incapacidad.continuaDe.aclaracion && (
              <p className="mt-1"><span className="font-semibold">Aclaración:</span> {incapacidad.continuaDe.aclaracion}</p>
            )}
            {esEsdomed && (
              <div className="mt-1.5 flex flex-wrap gap-3">
                <button onClick={abrirEditarContinuacion} className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400">
                  <Pencil size={10} /> Cambiar
                </button>
                <button
                  onClick={quitarContinuacion}
                  disabled={guardandoCont}
                  className="font-medium text-amber-700 hover:underline disabled:opacity-50 dark:text-amber-400"
                >
                  Quitar continuación
                </button>
              </div>
            )}
          </div>
        )}

        {/* Editor de continuación (ESDOMED) */}
        {editandoCont && (
          <div className="mt-2 space-y-2.5 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-3 dark:border-amber-900 dark:bg-amber-950/30">
            <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
              Iniciar esta incapacidad al terminar otra que seguía vigente
            </p>
            {vigenteSistema && (
              <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="radio"
                  name="cont-origen"
                  checked={contOrigen === "sistema"}
                  onChange={() => setContOrigen("sistema")}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-blue-600"
                />
                <span>
                  La del sistema: del {formatFechaConstanciaCorta(vigenteSistema.desde ?? vigenteSistema.hasta)} al {formatFechaConstanciaCorta(vigenteSistema.hasta)}
                  {vigenteSistema.medicoNombre && <> · Dr. {vigenteSistema.medicoNombre}</>}
                </span>
              </label>
            )}
            <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
              {vigenteSistema && (
                <input
                  type="radio"
                  name="cont-origen"
                  checked={contOrigen === "manual"}
                  onChange={() => setContOrigen("manual")}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-blue-600"
                />
              )}
              <span>Otra constancia que no está en el sistema (de otro establecimiento o anterior a la app)</span>
            </label>
            {contOrigen === "manual" && (
              <div className="max-w-xs">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  La incapacidad anterior terminaba el <span className="text-rose-500">*</span>
                </label>
                <DateField value={contFechaManual} onChange={setContFechaManual} ariaLabel="Fin de la incapacidad anterior" />
              </div>
            )}
            {contSinTraslape && (
              <p className="text-[11px] text-red-600 dark:text-red-400">
                Esa incapacidad terminó antes {esEmergenciaInc ? "del inicio" : "del ingreso"} ({inicioInc && formatFecha(inicioInc)}): no hay traslape que evitar.
              </p>
            )}
            {contPreview && (
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                Quedará: del <span className="font-semibold">{formatFechaConstanciaCorta(contPreview.desde)}</span> al{" "}
                <span className="font-semibold">{formatFechaConstanciaCorta(contPreview.hasta)}</span>,{" "}
                <span className="font-semibold">{contPreview.total} días</span>
                {!esEmergenciaInc && contPreview.diasHospitalizacion === 0
                  ? ` (los ${diasMedicoActuales} que otorgó el médico; la estancia ya la cubría la anterior).`
                  : "."}
                {" "}Fecha de ingreso y de alta se imprimen sin cambios.
              </p>
            )}
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Aclaración <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={aclaracionCont}
                onChange={e => setAclaracionCont(e.target.value)}
                rows={2}
                placeholder="Ej. El patrono no aceptó la constancia porque estaba dentro del período de la incapacidad anterior..."
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={guardarContinuacion}
                disabled={guardandoCont || !hastaContEdit || contSinTraslape || !aclaracionCont.trim()}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50"
              >
                {guardandoCont ? "Guardando..." : "Aplicar"}
              </button>
              <button
                onClick={() => setEditandoCont(false)}
                disabled={guardandoCont}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Corrección de días vigente (badge + aclaración, no se imprime) */}
        {incapacidad.diasMedicoOriginal != null && !editandoDias && (
          <div className="mt-2 text-[11px] text-slate-700 dark:text-slate-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg px-2.5 py-1.5">
            <p className="font-semibold text-amber-700 dark:text-amber-400">
              Días corregidos por {incapacidad.diasCorregidosPor ?? "ESDOMED"}
              {" · "}el médico otorgó {incapacidad.diasMedicoOriginal} {incapacidad.diasMedicoOriginal === 1 ? "día" : "días"}
              {esEmergenciaInc ? "" : " adicionales"}.
            </p>
            {incapacidad.diasAclaracion && (
              <p className="mt-1"><span className="font-semibold">Aclaración:</span> {incapacidad.diasAclaracion}</p>
            )}
          </div>
        )}

        {/* Editor de corrección de días (ESDOMED) */}
        {editandoDias && (
          <div className="mt-2 space-y-2 bg-amber-50/50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-3">
            <label className="block text-[11px] font-medium text-slate-500">
              {esEmergenciaInc ? "Días de incapacidad prescritos" : "Días adicionales otorgados por el médico"}{" "}
              <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              min={esEmergenciaInc ? 1 : 0}
              step={1}
              value={diasEdit}
              onChange={e => setDiasEdit(e.target.value)}
              className="w-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {diasEditInvalido && (
              <p className="text-[11px] text-red-600 dark:text-red-400">
                Debe ser un número entero de {esEmergenciaInc ? 1 : 0} o más.
              </p>
            )}
            <p className="text-[11px] text-slate-400">
              {esEmergenciaInc
                ? "Al guardar se recalculan el total de días y la fecha “Hasta” de la constancia."
                : "Al guardar se recalculan el total de días y la fecha “Hasta”; los días de hospitalización no cambian (salen de las fechas de ingreso y alta)."}
            </p>
            {hastaPreview && (
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                Quedará: <span className="font-semibold">{incapacidad.diasIncapacidad + diasEditDelta} días en total</span>
                {", hasta el "}{formatFecha(hastaPreview)}.
              </p>
            )}
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Aclaración de la corrección <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={aclaracionDias}
                onChange={e => setAclaracionDias(e.target.value)}
                rows={2}
                placeholder="Ej. Los días otorgados no coinciden con lo indicado por el servicio..."
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={guardarDias}
                disabled={guardandoDias || diasEdit === "" || !aclaracionDias.trim() || diasEditInvalido}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50"
              >
                {guardandoDias ? "Guardando..." : "Guardar"}
              </button>
              <button
                onClick={() => setEditandoDias(false)}
                disabled={guardandoDias}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              {incapacidad.diasMedicoOriginal != null && (
                <button
                  onClick={quitarCorreccionDias}
                  disabled={guardandoDias}
                  className="px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950 rounded-lg transition-colors disabled:opacity-50"
                >
                  Quitar corrección
                </button>
              )}
            </div>
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          {conElMedico && (
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
              Días adicionales, tratamiento y seguimiento los completará el médico asignado. El diagnóstico y las
              recomendaciones de abajo son la sugerencia tomada del FIEH.
            </p>
          )}
          <BlockRow label="Diagnóstico de egreso" value={incapacidad.diagnosticoEgreso || "—"} />
          <BlockRow label="Tratamiento al alta" value={incapacidad.tratamientoAlta || "—"} />
          {incapacidad.recomendaciones && <BlockRow label="Recomendaciones" value={incapacidad.recomendaciones} />}
          {incapacidad.seguimiento && <BlockRow label="Seguimiento" value={incapacidad.seguimiento} />}
        </div>
      </Card>

      {/* Subsidios */}
      <Card icon={FileText} title="Datos administrativos (ESDOMED)">
        <p className="text-xs text-slate-500 mb-3">
          Estos campos los marca ESDOMED antes de imprimir la constancia. Son opcionales y aparecerán como checkboxes en el PDF.
        </p>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Institución Provicional</p>
          <div className="flex flex-wrap gap-2">
            {INSTITUCIONES.map((inst) => (
              <button
                key={inst}
                onClick={() => setInstitucion(inst === institucion ? "" : inst)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  institucion === inst
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {inst}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Banco a depositar</p>
          <div className="flex flex-wrap gap-2">
            {BANCOS.map((b) => (
              <button
                key={b}
                onClick={() => setBanco(b === banco ? "" : b)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  banco === b
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {yaEmitida && (institucion !== (incapacidad.institucionProvisional ?? "") || banco !== (incapacidad.bancoDeposito ?? "")) && (
          <button
            onClick={guardarSubsidios}
            className="mt-4 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Guardar cambios en subsidios
          </button>
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
        {conElMedico ? (
          <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3">
            <Stethoscope size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-amber-700 dark:text-amber-400">
                Esperando al Dr. {incapacidad.medicoNombre}
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                Cuando complete los datos clínicos desde su bandeja de reposición, esta incapacidad pasará a
                “Pendiente de emitir” y podrá emitirse e imprimirse aquí.
              </p>
            </div>
          </div>
        ) : !yaEmitida ? (
          <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
            <button
              onClick={abrirImprimir}
              className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <Printer size={14} />
              Vista previa / Imprimir
            </button>
            <button
              onClick={emitir}
              disabled={emitiendo}
              className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-green-700 hover:bg-green-600 rounded-xl disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 size={14} />
              {emitiendo ? "Emitiendo..." : "Marcar como emitida"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500 text-center italic">
            La constancia ya fue emitida. Podés reimprimirla cuando lo necesites.
          </p>
        )}
      </div>

      {/* Eliminar solicitud (ESDOMED/admin) */}
      {puedeEliminar && (
        <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
          {confirmandoEliminar ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <span className="text-xs text-slate-600 dark:text-slate-400">
                {yaEmitida
                  ? "Esta incapacidad ya fue emitida. ¿Eliminarla de todos modos? No se puede deshacer."
                  : "¿Eliminar esta solicitud? Esta acción no se puede deshacer."}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={eliminar}
                  disabled={eliminando}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50"
                >
                  {eliminando ? "Eliminando..." : "Sí, eliminar"}
                </button>
                <button
                  onClick={() => setConfirmandoEliminar(false)}
                  disabled={eliminando}
                  className="px-4 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmandoEliminar(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
            >
              <Trash2 size={13} />
              Eliminar solicitud
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers UI ──────────────────────────────────────────────────────────────

function Card({
  icon: Icon, title, children,
}: {
  icon: typeof User2; title: string; children: React.ReactNode;
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

function Row({ label, value, mono }: { label: string; value?: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-slate-500 text-xs pt-0.5 font-medium w-32 flex-shrink-0">{label}</span>
      <span className={`text-slate-800 dark:text-slate-200 flex-1 min-w-0 break-words ${mono ? "font-mono text-xs" : ""}`}>
        {value || <span className="text-slate-400 italic text-xs">—</span>}
      </span>
    </div>
  );
}

function BlockRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">{label}</p>
      <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-800">
        {value}
      </p>
    </div>
  );
}
