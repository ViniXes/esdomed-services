"use client";

import { IsbmStats, IsbmFilter, isbmStyles as ui } from "../_components/IsbmUi";

import { IsbmPageHeading } from "../_components/IsbmPageHeading";

import { useCallback, useEffect, useMemo, useState, useRef, useId } from "react";
import { CalendarCheck, Lock, LockOpen, Pencil, Stethoscope, Users, CircleDollarSign, Search, ChevronRight, ChevronLeft, ArrowLeft, CheckCircle2, AlertTriangle, ClipboardCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { DateField } from "@/components/ui/DateField";
import styles from "./censo.module.css";
import { CargosDelDia, type ResumenCargos } from "@/components/isbm/CargosDelDia";
import {
  abrirDia,
  actualizarServiciosCenso,
  cerrarDia,
  censosDeFecha,
  censoPorId,
  hoyISO,
  listarMedicos,
  listarServicios,
  reabrirDia,
  registrarVisita,
  type MedicoSistema,
} from "@/lib/isbm/api";
import {
  estadoCenso,
  formatoDolares,
  type CensoDiarioConRelaciones,
  type EstadoCenso,
  type ServicioHospitalarioIsbm,
} from "@/lib/isbm/types";

const ESTADO_UI: Record<EstadoCenso, { label: string; clases: string; punto: string }> = {
  VERDE:    { label: "Cerrado · visitas completas", clases: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900", punto: "bg-emerald-500" },
  AMARILLO: { label: "Abierto · falta visita PM",   clases: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900",             punto: "bg-amber-500" },
  AZUL:     { label: "Abierto · sin visitas",       clases: "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900",                   punto: "bg-blue-500" },
  ROJO:     { label: "Cerrado · sin visitas completas", clases: "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900",                     punto: "bg-red-500" },
};

const horaAhora = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const formatoHora = (h: string | null) => (h ? h.slice(0, 5) : null);

function presentacion(c: CensoDiarioConRelaciones) {
  const est = ESTADO_UI[estadoCenso(c)];
  if (c.dia_cerrado) return est;
  if (c.visita_am_registrada && c.visita_pm_registrada) return { ...ESTADO_UI.VERDE, label: "Visitas completas · por cerrar" };
  if (c.visita_pm_registrada) return { ...ESTADO_UI.AMARILLO, label: "Abierto · falta visita AM" };
  return est;
}

export default function CensoDiarioPage() {
  const { profile } = useAuth();
  const [fecha, setFecha] = useState(hoyISO());
  const [busqueda, setBusqueda] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [censos, setCensos] = useState<CensoDiarioConRelaciones[]>([]);
  const [servicios, setServicios] = useState<ServicioHospitalarioIsbm[]>([]);
  const [medicos, setMedicos] = useState<MedicoSistema[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const fechaActual = useRef(fecha);
  useEffect(() => { fechaActual.current = fecha; }, [fecha]);
  const uid = profile?.uid;
  const nombre = profile?.nombre;

  useEffect(() => {
    if (!uid) return;
    let vigente = true;
    const t = setTimeout(async () => {
      try {
        const [cats, meds] = await Promise.all([listarServicios(), listarMedicos()]);
        if (vigente) { setServicios(cats); setMedicos(meds); }
      } catch (e) { if (vigente) setError((e as Error).message); }
    }, 0);
    return () => { vigente = false; clearTimeout(t); };
  }, [uid]);

  useEffect(() => {
    if (!uid || !nombre) return;
    let vigente = true;
    const t = setTimeout(async () => {
      setCargando(true); setError("");
      try {
        if (fecha <= hoyISO()) await abrirDia(fecha, { uid, nombre });
        const lista = await censosDeFecha(fecha);
        if (vigente) { setCensos(lista); setDetalleId(null); }
      } catch (e) { if (vigente) setError((e as Error).message); }
      finally { if (vigente) setCargando(false); }
    }, 0);
    return () => { vigente = false; clearTimeout(t); };
  }, [fecha, uid, nombre]);

  const actualizar = useCallback(async (id: number) => {
    const actualizado = await censoPorId(id);
    if (actualizado.fecha === fechaActual.current) setCensos(lista => lista.map(c => c.id === id ? actualizado : c));
  }, []);
  const resumen = useMemo(() => {
    const cerrados = censos.filter(c => c.dia_cerrado);
    return { total: censos.length, cerrados: cerrados.length, cobrable: cerrados.reduce((s,c) => s + (c.total_cobrable_dia ?? 0), 0) };
  }, [censos]);
  const visibles = censos.filter(c => {
    const texto = busqueda.trim().toLowerCase();
    return (!estadoFiltro || (estadoFiltro === "cerrado" ? c.dia_cerrado : !c.dia_cerrado)) && (!texto || `${c.ingreso.paciente_nombre} ${c.expediente} ${c.servicio_facturacion.nombre}`.toLowerCase().includes(texto));
  });
  const detalle = censos.find(c => c.id === detalleId);
  const indice = visibles.findIndex(c => c.id === detalleId);

  return <div className={`${ui.page} p-4 md:p-6 max-w-[1500px] mx-auto space-y-5`}>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <IsbmPageHeading title="Censo diario" description="Selecciona un paciente y completa su día, paso a paso." icon={CalendarCheck} />
      <div className="w-full sm:w-44"><IsbmFilter label="Fecha del censo"><DateField disabled={bloqueado} value={fecha} onChange={v => { if (v) { setDetalleId(null); setCargando(true); setFecha(v); } }} ariaLabel="Fecha del censo" /></IsbmFilter></div>
    </div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
    <IsbmStats items={[
      { label: "Pacientes en censo", value: cargando ? "—" : resumen.total, detail: "Ingresos de la fecha seleccionada", icon: Users },
      { label: "Días por cerrar", value: cargando ? "—" : resumen.total - resumen.cerrados, detail: resumen.cerrados + " días cerrados", icon: LockOpen, tone: "warning" },
      { label: "Cobrable del día", value: cargando ? "—" : formatoDolares(resumen.cobrable), detail: "Solo incluye días cerrados", icon: CircleDollarSign, tone: "success" },
    ]} />
    <div className={styles.workspace} data-detail={Boolean(detalle)}>
      <aside className={styles.patients} aria-label="Pacientes del censo">
        <div className={styles.patientControls}>
        <div className="flex justify-between items-center"><h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Pacientes del día</h2><span className="text-xs text-slate-500">{visibles.length} de {censos.length}</span></div>
        <div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input disabled={bloqueado} aria-label="Buscar paciente en censo" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre, expediente o servicio" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /></div>
        <select disabled={bloqueado} aria-label="Estado del censo" value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><option value="">Todos los estados</option><option value="abierto">Por cerrar</option><option value="cerrado">Cerrados</option></select>
        </div>
        <div className={styles.patientList} role="region" aria-label="Tarjetas de pacientes" tabIndex={0}>
        {cargando ? <p role="status" className="p-8 text-center text-sm text-slate-500">Cargando pacientes…</p> : visibles.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">{censos.length ? "No hay coincidencias con los filtros." : "No hay pacientes ISBM en esta fecha."}{fecha > hoyISO() && " Las fechas futuras no se abren."}</p> : visibles.map(c => {
          const est = presentacion(c);
          return <button key={c.id} disabled={bloqueado} aria-current={detalleId === c.id} onClick={() => setDetalleId(c.id)} className={styles.patient}>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-5">{c.ingreso.paciente_nombre}</p>
            <p className="text-xs text-slate-500 mt-1">Exp. {c.expediente}{c.cama ? ` · cama ${c.cama}` : ""}</p>
            <p className="text-xs text-slate-500 mt-1">{c.servicio_facturacion.nombre}</p>
            <div className="mt-3 flex items-center gap-2"><VisitaChip turno="AM" registrada={c.visita_am_registrada} hora={formatoHora(c.visita_am_hora)} /><VisitaChip turno="PM" registrada={c.visita_pm_registrada} hora={formatoHora(c.visita_pm_hora)} /><ChevronRight size={15} className="ml-auto text-slate-400" /></div>
            <p className="flex items-center gap-1.5 mt-3 text-[11px] text-slate-500"><span className={`w-1.5 h-1.5 rounded-full ${est.punto}`} />{est.label}</p>
          </button>;
        })}
        </div>
      </aside>
      {detalle && profile && !cargando ? <DetalleCenso key={detalle.id} censo={detalle} servicios={servicios} medicos={medicos} actor={{uid:profile.uid,nombre:profile.nombre}} onCerrar={() => setDetalleId(null)} onCambio={() => actualizar(detalle.id)} onBloqueo={setBloqueado} anterior={indice > 0 ? () => setDetalleId(visibles[indice - 1].id) : undefined} siguiente={indice >= 0 && indice < visibles.length-1 ? () => setDetalleId(visibles[indice + 1].id) : undefined} posicion={indice >= 0 ? `${indice+1} de ${visibles.length}` : "Fuera del filtro"} /> : <div className={`${styles.panel} min-h-96 flex flex-col items-center justify-center p-8 text-center`}><div className="rounded-2xl bg-blue-50 p-4 text-blue-600 dark:bg-blue-950"><ClipboardCheck size={30} /></div><h2 className="mt-5 text-lg font-semibold text-slate-900 dark:text-slate-100">Selecciona un paciente</h2><p className="mt-2 text-sm text-slate-500 max-w-xs">Revisa sus visitas, ajusta los servicios y captura los cargos sin salir del censo.</p></div>}
    </div>
  </div>;
}

function VisitaChip({ turno, registrada, hora }: { turno: string; registrada: boolean; hora: string | null }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border ${
        registrada
          ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900"
          : "text-slate-400 bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700"
      }`}
    >
      <Stethoscope size={11} />
      {turno}{registrada && hora ? ` ${hora}` : ""}
    </span>
  );
}

function DetalleCenso({
  censo, servicios, medicos: catalogoMedicos, actor, onCerrar, onCambio, onBloqueo, anterior, siguiente, posicion,
}: {
  censo: CensoDiarioConRelaciones;
  servicios: ServicioHospitalarioIsbm[];
  medicos: MedicoSistema[];
  actor: { uid: string; nombre: string };
  onCerrar: () => void;
  onCambio: () => Promise<void>;
  onBloqueo: (v: boolean) => void;
  anterior?: () => void;
  siguiente?: () => void;
  posicion: string;
}) {
  const medicos = censo.medico_tratante_nombre && !catalogoMedicos.some(m => m.nombre === censo.medico_tratante_nombre) ? [{ nombre: censo.medico_tratante_nombre }, ...catalogoMedicos] : catalogoMedicos;
  const [seccion, setSeccion] = useState("visitas");
  const [cargosActivos, setCargosActivos] = useState(false);
  const [resumenCargos, setResumenCargos] = useState<ResumenCargos | null>(null);
  const [cargosRevision, setCargosRevision] = useState(0);
  const guardando = useRef(false);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [editandoServicios, setEditandoServicios] = useState(false);

  // Formulario de visita (AM o PM según cuál falte / elija)
  const [visitaTurno, setVisitaTurno] = useState<"am" | "pm" | null>(null);
  const [visitaMedico, setVisitaMedico] = useState(censo.medico_tratante_nombre ?? "");
  const [visitaHora, setVisitaHora] = useState(horaAhora());

  // Formulario de servicios
  const [fisicoId, setFisicoId] = useState(censo.servicio_fisico_id);
  const [facturacionId, setFacturacionId] = useState(censo.servicio_facturacion_id);
  const [motivo, setMotivo] = useState(censo.motivo_diferencia_servicio ?? "");
  const [cama, setCama] = useState(censo.cama ?? "");
  const [medicoTratante, setMedicoTratante] = useState(censo.medico_tratante_nombre ?? "");

  const ejecutar = async (accion: () => Promise<void>) => {
    if (guardando.current) return;
    guardando.current = true;
    setOcupado(true);
    setError("");
    try {
      await accion();
      await onCambio();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      guardando.current = false;
      setOcupado(false);
    }
  };

  const guardarVisita = () => {
    if (!visitaTurno) return;
    if (!visitaMedico.trim() || !medicos.some(m => m.nombre === visitaMedico.trim())) { setError("Selecciona de la lista el médico que pasó la visita."); return; }
    ejecutar(async () => {
      await registrarVisita(censo.id, visitaTurno, visitaMedico.trim(), visitaHora);
      setVisitaTurno(null);
    });
  };

  const guardarServicios = () => {
    if (medicoTratante.trim() && !medicos.some(m => m.nombre === medicoTratante.trim())) { setError("Selecciona de la lista el médico tratante."); return; }
    if (fisicoId !== facturacionId && !motivo.trim()) {
      setError("El motivo es obligatorio cuando el servicio físico y el de facturación difieren.");
      return;
    }
    ejecutar(async () => {
      await actualizarServiciosCenso(censo.id, {
        servicio_fisico_id: fisicoId,
        servicio_facturacion_id: facturacionId,
        motivo_diferencia_servicio: fisicoId !== facturacionId ? motivo.trim() : null,
        cama: cama.trim() || null,
        medico_tratante_nombre: medicoTratante.trim() || null,
      });
      setEditandoServicios(false);
    });
  };

  const confirmarCierre = () => ejecutar(async () => {
    await cerrarDia(censo.id, actor.nombre);
    setCargosRevision(v => v + 1);
  });

  const confirmarReapertura = () => {
    if (!window.confirm("Reabrir el día permite corregir visitas y cargos; al volver a cerrarlo se recalcula todo. ¿Continuar?")) return;
    ejecutar(async () => {
      await reabrirDia(censo.id, actor.nombre);
      setCargosRevision(v => v + 1);
    });
  };

  const bloqueado = ocupado || editandoServicios || visitaTurno !== null || cargosActivos;
  useEffect(() => { onBloqueo(bloqueado); return () => onBloqueo(false); }, [bloqueado, onBloqueo]);
  const est = presentacion(censo);
  const visitas = Number(censo.visita_am_registrada) + Number(censo.visita_pm_registrada);
  return <section className={styles.panel} aria-label="Detalle del paciente">
    <header className={styles.header}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <button disabled={bloqueado} onClick={onCerrar} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 disabled:opacity-40"><ArrowLeft size={15} /> Volver a pacientes</button>
        <div className="flex items-center gap-3 text-xs text-slate-500"><button onClick={anterior} disabled={!anterior || bloqueado} aria-label="Paciente anterior" className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30"><ChevronLeft size={16} /></button><span>{posicion}</span><button onClick={siguiente} disabled={!siguiente || bloqueado} aria-label="Paciente siguiente" className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30"><ChevronRight size={16} /></button></div>
      </div>
      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">{censo.ingreso.paciente_nombre}</h2>
      <p className="text-xs text-slate-500 mt-1">Exp. {censo.expediente} · {censo.fecha}{censo.cama ? ` · cama ${censo.cama}` : ""}</p>
      <span className={`inline-block mt-3 text-[11px] font-medium border rounded-full px-2.5 py-1 ${est.clases}`}>{est.label}</span>
    </header>
    <nav className={styles.sections} aria-label="Secciones del censo">
      {[["visitas",`Visitas ${visitas}/2`],["servicios","Servicios"],["cargos","Cargos"],["cierre",censo.dia_cerrado ? "Día cerrado" : "Revisar y cerrar"]].map(([id,label]) => <button key={id} aria-current={seccion === id} disabled={bloqueado && seccion !== id} onClick={() => { setSeccion(id); setError(""); }}>{label}</button>)}
    </nav>
    <div className={styles.content}>
      {bloqueado && <p role="status" className="text-xs text-blue-700 dark:text-blue-300 mb-4">{ocupado ? "Guardando cambios…" : "Guarda o cancela la captura antes de cambiar de paciente o sección."}</p>}
      <div hidden={seccion !== "servicios"}>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Ubicación y facturación</h3><p className="text-xs text-slate-500 mb-5">Verifica el servicio, la cama y el médico tratante del día.</p>
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Servicios del día</p>
            {!censo.dia_cerrado && !editandoServicios && (
              <button
                onClick={() => { setFisicoId(censo.servicio_fisico_id); setFacturacionId(censo.servicio_facturacion_id); setMotivo(censo.motivo_diferencia_servicio ?? ""); setCama(censo.cama ?? ""); setMedicoTratante(censo.medico_tratante_nombre ?? ""); setEditandoServicios(true); setError(""); }}
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Pencil size={12} /> Editar
              </button>
            )}
          </div>

          {!editandoServicios ? (
            <div className="text-sm text-slate-700 dark:text-slate-300 space-y-0.5">
              <p><span className="text-slate-400">Físico:</span> {censo.servicio_fisico.nombre}</p>
              <p>
                <span className="text-slate-400">Facturación:</span> {censo.servicio_facturacion.nombre}
                {" "}<span className="text-slate-400">({formatoDolares(censo.servicio_facturacion.precio_dia_cama)}/día)</span>
              </p>
              {censo.motivo_diferencia_servicio && (
                <p className="text-xs text-amber-700 dark:text-amber-300">Motivo de diferencia: {censo.motivo_diferencia_servicio}</p>
              )}
              <p>
                <span className="text-slate-400">Cama:</span> {censo.cama ?? "—"}
                {" · "}<span className="text-slate-400">Médico tratante:</span> {censo.medico_tratante_nombre ?? "—"}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="grid sm:grid-cols-2 gap-3">
                <SelectServicio label="Servicio físico" valor={fisicoId} servicios={servicios} onChange={setFisicoId} />
                <SelectServicio label="Facturación" valor={facturacionId} servicios={servicios} onChange={setFacturacionId} />
              </div>
              {fisicoId !== facturacionId && (
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  aria-label="Motivo de la diferencia" placeholder="Motivo de la diferencia (obligatorio)"
                  className="w-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  value={cama}
                  onChange={(e) => setCama(e.target.value)}
                  aria-label="Cama" placeholder="Cama"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <SelectMedico
                  valor={medicoTratante}
                  medicos={medicos}
                  placeholder="Médico tratante"
                  onChange={setMedicoTratante}
                />
              </div>
              <div className="flex gap-2">
                <button
                  disabled={ocupado} onClick={() => setEditandoServicios(false)}
                  className="flex-1 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardarServicios}
                  disabled={ocupado}
                  className="flex-1 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors"
                >
                  Guardar
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
      <div hidden={seccion !== "visitas"}>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Visitas médicas</h3><p className="text-xs text-slate-500 mb-5">Registra el médico y la hora de cada turno.</p>
        <div className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          {(["am", "pm"] as const).map((turno) => {
            const registrada = turno === "am" ? censo.visita_am_registrada : censo.visita_pm_registrada;
            const medico = turno === "am" ? censo.visita_am_medico : censo.visita_pm_medico;
            const hora = formatoHora(turno === "am" ? censo.visita_am_hora : censo.visita_pm_hora);
            return (
              <div key={turno} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                  Visita {turno.toUpperCase()}
                </p>
                {registrada ? (
                  <div className="text-sm text-slate-700 dark:text-slate-300">
                    <p className="font-medium text-emerald-700 dark:text-emerald-300">Registrada · {hora}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{medico}</p>
                  </div>
                ) : censo.dia_cerrado ? (
                  <p className="text-xs text-slate-400">Sin registrar (día cerrado)</p>
                ) : (
                  <button
                    disabled={visitaTurno !== null || ocupado}
                    aria-label={`Registrar visita ${turno.toUpperCase()}`}
                    onClick={() => { setVisitaMedico(censo.medico_tratante_nombre ?? ""); setVisitaTurno(turno); setVisitaHora(horaAhora()); setError(""); }}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Registrar visita
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {visitaTurno && (
          <div className="border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/40 rounded-xl p-3 mb-3 space-y-2">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
              Registrar visita {visitaTurno.toUpperCase()}
            </p>
            <SelectMedico
              valor={visitaMedico}
              medicos={medicos}
              placeholder="Médico que pasó visita"
              autoFocus
              onChange={setVisitaMedico}
            />
            <input
              aria-label="Hora de la visita"
              type="time"
              value={visitaHora}
              onChange={(e) => setVisitaHora(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button
                disabled={ocupado} onClick={() => setVisitaTurno(null)}
                className="flex-1 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={guardarVisita}
                disabled={ocupado}
                className="flex-1 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors"
              >
                Guardar visita
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
      <div hidden={seccion !== "cargos"}>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Servicios y cargos</h3><p className="text-xs text-slate-500 mb-5">Captura el arancel y revisa el respaldo de cada servicio.</p>
        <CargosDelDia censo={censo} actor={actor} revision={cargosRevision} onActividad={setCargosActivos} onResumen={setResumenCargos} />
      </div>
      {seccion === "cierre" && <div className="space-y-4">
        <div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{censo.dia_cerrado ? "Resumen del día cerrado" : "Revisión antes del cierre"}</h3><p className="mt-1 text-xs text-slate-500">{censo.dia_cerrado ? `Cerrado por ${censo.cerrado_por_nombre}.` : "Verifica las visitas, los cargos y el servicio de facturación."}</p></div>
        <div className={`flex gap-3 rounded-xl border p-4 ${visitas === 2 ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950 text-amber-800 dark:text-amber-300"}`}>
          {visitas === 2 ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}<div><p className="text-sm font-semibold">{visitas === 2 ? "Visitas AM y PM completas" : `${2-visitas} visita${visitas === 0 ? "s" : ""} pendiente${visitas === 0 ? "s" : ""}`}</p><p className="text-xs mt-1">{visitas === 2 ? "Ambos turnos están registrados." : "Si cierras ahora, el día quedará en rojo por visitas incompletas."}</p></div>
        </div>
        <dl className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700 text-sm">
          <div className="p-4"><dt className="text-xs text-slate-500">Servicio de facturación</dt><dd className="font-medium text-slate-800 dark:text-slate-200 mt-1">{censo.servicio_facturacion.nombre}</dd></div>
          <div className="p-4 flex justify-between gap-3"><dt className="text-slate-500">Tarifa día-cama</dt><dd className="font-semibold text-slate-800 dark:text-slate-200">{formatoDolares(censo.servicio_facturacion.precio_dia_cama)}</dd></div>
          <div className="p-4 flex justify-between gap-3"><dt className="text-slate-500">Cargos registrados</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{resumenCargos ? resumenCargos.cantidad : "Consultando…"}</dd></div>
          <div className="p-4 flex justify-between gap-3"><dt className="text-slate-500">{censo.dia_cerrado ? "Total servicio cerrado" : "Total servicio registrado"}</dt><dd className="font-semibold text-slate-800 dark:text-slate-200">{censo.dia_cerrado ? formatoDolares(censo.total_servicio_dia) : resumenCargos ? formatoDolares(resumenCargos.servicio) : "—"}</dd></div>
          <div className="p-4 flex justify-between gap-3"><dt className="text-slate-500">{censo.dia_cerrado ? "Cobrable del día" : "Cobrable registrado antes del cierre"}</dt><dd className="font-bold text-emerald-700 dark:text-emerald-300">{censo.dia_cerrado ? formatoDolares(censo.total_cobrable_dia) : resumenCargos ? formatoDolares(resumenCargos.cobrable) : "—"}</dd></div>
        </dl>
        {resumenCargos && resumenCargos.observados > 0 && <p className="rounded-xl bg-orange-50 p-3 text-xs text-orange-800 dark:bg-orange-950 dark:text-orange-300">Hay {resumenCargos.observados} cargo(s) en observación. Revisa si los servicios se realizaron.</p>}
        {!censo.dia_cerrado && <p className="text-xs leading-5 text-slate-500">El cierre genera o actualiza el día-cama, aplica las reglas del convenio y congela los totales. Los montos registrados pueden cambiar al aplicar esas reglas.</p>}
        <div className="flex flex-wrap justify-end gap-2 pt-2"><button disabled={ocupado} onClick={() => setSeccion("visitas")} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">Volver a revisar</button><button disabled={ocupado || (!censo.dia_cerrado && !resumenCargos)} onClick={censo.dia_cerrado ? confirmarReapertura : confirmarCierre} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">{censo.dia_cerrado ? <LockOpen size={16} /> : <Lock size={16} />}{ocupado ? "Procesando…" : censo.dia_cerrado ? "Reabrir día" : visitas < 2 ? "Cerrar con visitas pendientes" : "Confirmar cierre del día"}</button></div>
      </div>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
    </div>
  </section>;
}

function SelectMedico({ valor, medicos, placeholder, autoFocus, onChange }: { valor: string; medicos: MedicoSistema[]; placeholder: string; autoFocus?: boolean; onChange: (v: string) => void }) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const filtrados = medicos.filter(m => m.nombre.toLowerCase().includes(valor.toLowerCase())).slice(0,30);
  const elegir = (nombre: string) => { onChange(nombre); setAbierto(false); };
  return <div className="relative"><label className="block text-xs text-slate-500 mb-1.5" htmlFor={id}>{placeholder}</label><input id={id} role="combobox" aria-expanded={abierto} aria-controls={`${id}-lista`} aria-autocomplete="list" aria-activedescendant={abierto && filtrados[activo] ? `${id}-${activo}` : undefined} value={valor} autoFocus={autoFocus} onChange={e => { onChange(e.target.value); setActivo(0); setAbierto(true); }} onBlur={() => { setTimeout(() => setAbierto(false), 150); }} onKeyDown={e => {
    if (e.key === "Escape") { setAbierto(false); e.preventDefault(); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setAbierto(true); setActivo(v => Math.max(0,Math.min(filtrados.length-1,v + (e.key === "ArrowDown" ? 1 : -1)))); }
    if (e.key === "Enter" && abierto && filtrados[activo]) { e.preventDefault(); elegir(filtrados[activo].nombre); }
  }} placeholder="Escribe para buscar un médico…" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
  {abierto && <div id={`${id}-lista`} role="listbox" aria-label={placeholder} className="mt-2 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:bg-slate-900 dark:border-slate-700">{filtrados.length ? filtrados.map((m,i) => <button type="button" id={`${id}-${i}`} key={m.nombre} role="option" aria-selected={activo === i} onMouseDown={e => e.preventDefault()} onClick={() => elegir(m.nombre)} className={`w-full text-left p-3 text-xs text-slate-700 dark:text-slate-200 ${activo === i ? "bg-blue-50 dark:bg-blue-950" : ""}`}>{m.nombre}{m.tipoMedico ? ` · ${m.tipoMedico.replace("_","/").toUpperCase()}` : ""}</button>) : <p className="p-3 text-xs text-slate-500">Sin coincidencias. Busca y selecciona un médico de la lista.</p>}</div>}</div>;
}

function SelectServicio({
  label, valor, servicios, onChange,
}: {
  label: string;
  valor: number;
  servicios: ServicioHospitalarioIsbm[];
  onChange: (id: number) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-500 mb-1">{label}</label>
      <select
        aria-label={label}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {servicios.map((s) => (
          <option key={s.id} value={s.id}>{s.nombre}</option>
        ))}
      </select>
    </div>
  );
}
