"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BedDouble, Check, CheckCircle2, ClipboardCheck, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { afiliarPaciente, listarPacientesActivosEsdomed, type PacienteActivoEsdomed } from "@/lib/isbm/api";
import { servicioParaAfiliacion, type ServicioAfiliacion } from "@/lib/isbm/serviciosAfiliacion";
import { TIPO_BENEFICIARIO_LABEL, type TipoBeneficiarioIsbm } from "@/lib/isbm/types";
import styles from "./AfiliarPacienteWizard.module.css";

const PASOS = ["Paciente", "Afiliación", "Confirmación"];
const normalizarBusqueda = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function AfiliarPacienteWizard({ actor, yaAfiliados, onCerrar, onListo }: {
  actor: { uid: string; nombre: string };
  yaAfiliados: Set<string>;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const [paso, setPaso] = useState(0);
  const [activos, setActivos] = useState<PacienteActivoEsdomed[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [servicio, setServicio] = useState<ServicioAfiliacion | "">("");
  const [seleccionado, setSeleccionado] = useState<PacienteActivoEsdomed | null>(null);
  const [numeroAfiliacion, setNumeroAfiliacion] = useState("");
  const [tipoBeneficiario, setTipoBeneficiario] = useState<TipoBeneficiarioIsbm | "">("");
  const [observaciones, setObservaciones] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [errorCarga, setErrorCarga] = useState("");
  const [intentoCarga, setIntentoCarga] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const guardandoRef = useRef(false);
  const id = useId();

  useEffect(() => {
    let vigente = true;
    listarPacientesActivosEsdomed().then(lista => { if (vigente) setActivos(lista); })
      .catch(e => { if (vigente) setErrorCarga((e as Error).message); });
    return () => { vigente = false; };
  }, [intentoCarga]);

  useEffect(() => {
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    searchRef.current?.focus();
    const teclado = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!guardandoRef.current) onCerrar();
      }
      if (event.key !== "Tab" || !dialog) return;
      const elementos = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
        .filter(el => el.getClientRects().length > 0);
      const primero = elementos[0];
      const ultimo = elementos.at(-1);
      if (!primero || !ultimo) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === primero || !elementos.includes(document.activeElement as HTMLElement))) {
        event.preventDefault(); ultimo.focus();
      } else if (!event.shiftKey && (document.activeElement === ultimo || !elementos.includes(document.activeElement as HTMLElement))) {
        event.preventDefault(); primero.focus();
      }
    };
    document.addEventListener("keydown", teclado);
    return () => { document.removeEventListener("keydown", teclado); previo?.focus(); };
  }, [onCerrar]);

  useEffect(() => { if (paso > 0) headingRef.current?.focus(); }, [paso]);

  const elegibles = useMemo(() => (activos ?? []).filter(p => !yaAfiliados.has(p.id) && servicioParaAfiliacion(p.servicioActual)), [activos, yaAfiliados]);
  const candidatos = useMemo(() => {
    const texto = normalizarBusqueda(busqueda);
    return elegibles.filter(p => (!servicio || servicioParaAfiliacion(p.servicioActual) === servicio) &&
      (!texto || normalizarBusqueda(p.nombre).includes(texto) || normalizarBusqueda(p.expediente).includes(texto)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [elegibles, servicio, busqueda]);

  const elegir = (paciente: PacienteActivoEsdomed) => {
    if (paciente.id !== seleccionado?.id) {
      setNumeroAfiliacion(""); setTipoBeneficiario(""); setObservaciones(""); setError("");
    }
    setSeleccionado(paciente);
  };

  const guardar = async () => {
    if (!seleccionado || paso !== 2 || guardandoRef.current) return;
    guardandoRef.current = true;
    setGuardando(true); setError("");
    try {
      await afiliarPaciente(seleccionado, { numeroAfiliacion, tipoBeneficiario, observaciones }, actor);
      onListo();
    } catch (e) {
      setError((e as Error).message);
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  return (
    <div className={styles.backdrop}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-titulo`} aria-describedby={`${id}-descripcion`} className={styles.dialog}>
        <header className={styles.header}>
          <div className={styles.headerIcon}><ShieldCheck size={23} aria-hidden="true" /></div>
          <div><p className={styles.eyebrow}>CONVENIOS ISBM</p><h2 id={`${id}-titulo`}>Nueva afiliación</h2><p id={`${id}-descripcion`}>Incorpora un paciente al convenio en tres pasos.</p></div>
          <button onClick={onCerrar} disabled={guardando} className={styles.close} aria-label="Cerrar asistente de afiliación"><X size={19} /></button>
        </header>
        <ol className={styles.steps} aria-label="Progreso de afiliación">
          {PASOS.map((titulo, i) => <li key={titulo} data-active={i === paso} data-done={i < paso} aria-current={i === paso ? "step" : undefined}><span>{i < paso ? <Check size={14} aria-hidden="true" /> : i + 1}</span><p>{titulo}</p></li>)}
        </ol>
        <div className={styles.body}>
          <div className={styles.stepHeading}><p>Paso {paso + 1} de 3</p><h3 ref={headingRef} tabIndex={-1}>{["Selecciona al paciente", "Completa la afiliación", "Revisa antes de confirmar"][paso]}</h3></div>
          {paso === 0 && <>
            <p className={styles.hint}>Pacientes activos de Bienestar Magisterial, Cuidados Intensivos BM y Cuidados Intermedios BM que aún no tienen un ingreso activo en el convenio.</p>
            <div className={styles.filters}>
              <label className={styles.search}><span>Buscar paciente</span><div><Search size={17} aria-hidden="true" /><input ref={searchRef} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre o expediente…" /></div></label>
              <label><span>Servicio</span><select value={servicio} onChange={e => setServicio(e.target.value as ServicioAfiliacion | "")}><option value="">Todos los servicios BM</option><option value="bienestar">Bienestar Magisterial</option><option value="intensivos">Cuidados Intensivos BM</option><option value="intermedios">Cuidados Intermedios BM</option></select></label>
            </div>
            <div className={styles.listCaption} aria-live="polite"><span>{activos ? `${candidatos.length} pacientes disponibles` : "Cargando pacientes…"}</span>{seleccionado && <span className={styles.selectedCaption}>1 seleccionado</span>}</div>
            <div className={styles.patientList}>
              {!activos && !errorCarga && <div className={styles.empty} role="status"><span className={styles.spinner} /><p>Cargando pacientes elegibles…</p></div>}
              {errorCarga && <div className={styles.empty}><p role="alert">No pudimos cargar los pacientes.</p><p>{errorCarga}</p><button className={styles.secondary} onClick={() => { setErrorCarga(""); setIntentoCarga(v => v + 1); }}>Reintentar</button></div>}
              {activos && !candidatos.length && <div className={styles.empty}><UserRound size={28} aria-hidden="true" /><strong>{elegibles.length ? "Sin coincidencias" : "No hay pacientes disponibles"}</strong><p>{elegibles.length ? "Prueba con otro nombre, expediente o servicio." : "Los pacientes de los servicios BM ya tienen un ingreso activo en el convenio o no hay pacientes activos por afiliar."}</p></div>}
              {candidatos.map(p => <label key={p.id} className={styles.patientOption} data-selected={seleccionado?.id === p.id}><input type="radio" name={`${id}-paciente`} value={p.id} checked={seleccionado?.id === p.id} onChange={() => elegir(p)} /><span className={styles.avatar}><UserRound size={18} aria-hidden="true" /></span><span className={styles.patientInfo}><strong>{p.nombre}</strong><span>Exp. {p.expediente} · {p.servicioActual}{p.camaActual ? ` · Cama ${p.camaActual}` : ""}</span></span></label>)}
            </div>
            {seleccionado && <p className={styles.selectionSummary}>Seleccionado: <strong>{seleccionado.nombre}</strong></p>}
          </>}
          {paso === 1 && seleccionado && <>
            <PacienteSeleccionado paciente={seleccionado} />
            <p className={styles.hint}>Estos datos son opcionales. Puedes completarlos después desde Afiliaciones.</p>
            <div className={styles.fields}>
              <label><span>N° de afiliación ISBM <small>Opcional</small></span><input value={numeroAfiliacion} onChange={e => setNumeroAfiliacion(e.target.value)} placeholder="Ingresa el número de afiliación" /></label>
              <label><span>Tipo de beneficiario <small>Opcional</small></span><select value={tipoBeneficiario} onChange={e => setTipoBeneficiario(e.target.value as TipoBeneficiarioIsbm | "")}><option value="">Sin especificar</option>{(Object.keys(TIPO_BENEFICIARIO_LABEL) as TipoBeneficiarioIsbm[]).map(t => <option key={t} value={t}>{TIPO_BENEFICIARIO_LABEL[t]}</option>)}</select></label>
              <label className={styles.fullField}><span>Observaciones <small>Opcional</small></span><textarea rows={3} value={observaciones} onChange={e => setObservaciones(e.target.value)} placeholder="Información adicional de la afiliación…" /></label>
            </div>
          </>}
          {paso === 2 && seleccionado && <>
            <PacienteSeleccionado paciente={seleccionado} />
            <dl className={styles.review}><div><dt>N° de afiliación ISBM</dt><dd>{numeroAfiliacion.trim() || "Pendiente de completar"}</dd></div><div><dt>Tipo de beneficiario</dt><dd>{tipoBeneficiario ? TIPO_BENEFICIARIO_LABEL[tipoBeneficiario] : "Sin especificar"}</dd></div><div><dt>Observaciones</dt><dd>{observaciones.trim() || "Sin observaciones"}</dd></div></dl>
            <div className={styles.confirmationNote}><ClipboardCheck size={19} aria-hidden="true" /><p>Al confirmar se registrará la afiliación y el ingreso activo de este paciente en el convenio ISBM.</p></div>
          </>}
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
        <footer className={styles.footer}>
          <button onClick={onCerrar} disabled={guardando} className={styles.cancel}>Cancelar</button>
          <div>{paso > 0 && <button disabled={guardando} className={styles.secondary} onClick={() => { setPaso(v => v - 1); setError(""); }}><ArrowLeft size={15} aria-hidden="true" /> Atrás</button>}
            {paso < 2 ? <button className={styles.primary} disabled={!seleccionado || !activos || Boolean(errorCarga)} onClick={() => setPaso(v => v + 1)}>Continuar <ArrowRight size={15} aria-hidden="true" /></button> : <button className={styles.primary} disabled={guardando} onClick={guardar}>{guardando ? <span className={styles.spinner} /> : <CheckCircle2 size={16} aria-hidden="true" />}{guardando ? "Afiliando…" : "Confirmar afiliación"}</button>}
          </div>
        </footer>
      </div>
    </div>
  );
}

function PacienteSeleccionado({ paciente }: { paciente: PacienteActivoEsdomed }) {
  return <div className={styles.selectedPatient}><span className={styles.avatar}><UserRound size={21} aria-hidden="true" /></span><div><strong>{paciente.nombre}</strong><p>Exp. {paciente.expediente}</p><p className={styles.service}><BedDouble size={14} aria-hidden="true" />{paciente.servicioActual}{paciente.camaActual ? ` · Cama ${paciente.camaActual}` : ""}</p></div></div>;
}
