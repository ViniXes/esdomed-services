"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, CircleCheckBig, ClipboardCheck, FilePlus, Loader2, Paperclip, Pencil, RotateCcw } from "lucide-react";
import { especialidadPorId } from "@/lib/consultaExterna/especialidades";
import { hoySV } from "@/lib/consultaExterna/actualizaciones";
import {
  labelConQuien, labelMedio, labelPaso, labelPoblacion, nombreArea, tituloGestion, validarGestion, validarNota,
  type DatosNota, type GestionTSCE,
} from "@/lib/consultaExterna/trabajoSocial";
import { BuscadorCitado, type Elegido } from "./BuscadorCitado";
import { CamposGestion, CamposNota, CamposPoblacion, ComoQueda, gestionVacia, notaVacia, type BorradorGestion } from "./Campos";
import { RUTAS_TS, mensaje, useTS } from "./contexto";
import { FilaGestion } from "./TarjetaGestion";
import { Aviso, Dialogo, Estado, Hero, Pasos, botonHeroSuave, botonPrimario, botonSecundario, botonTexto, entrada, fechaCorta } from "./ui";

// Gestión nueva, paso a paso: paciente → gestión → primera nota → confirmar.
// Solo crea la gestión con su primera nota; las notas siguientes se agregan en
// el seguimiento de esa gestión.

const PASOS = ["Paciente", "Gestión", "Primera nota", "Confirmar"];

// Lo que se va llenando se guarda en la pestaña: salir a consultar otra pantalla
// no lo borra. Solo vale el mismo día.
interface Borrador { dia: string; paso: number; elegido: Elegido; gestion: BorradorGestion; nota: DatosNota; finalizada: boolean | null }
const claveBorrador = (uid: string) => `tsce:gestion-nueva:${uid}`;

function leerBorrador(uid: string, hoy: string): Borrador | null {
  if (typeof window === "undefined") return null;
  try {
    const b = JSON.parse(window.sessionStorage.getItem(claveBorrador(uid)) ?? "null") as Borrador | null;
    return b && b.dia === hoy && b.elegido?.paciente?.clave && b.gestion && b.nota ? b : null;
  } catch {
    return null;
  }
}

function guardarBorrador(uid: string, b: Borrador | null) {
  try {
    if (b) window.sessionStorage.setItem(claveBorrador(uid), JSON.stringify(b));
    else window.sessionStorage.removeItem(claveBorrador(uid));
  } catch {
    // Sin almacenamiento (ventana privada): el asistente funciona igual.
  }
}

interface Hecha { id: string; titulo: string; paciente: string; finalizada: boolean }

const sinSuscripcion = () => () => {};

/** El borrador vive en el navegador: el asistente se dibuja ya en él, nunca en el servidor. */
export function NuevaGestion() {
  const enNavegador = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  return enNavegador ? <Asistente /> : null;
}

function Asistente() {
  const { llamar, area, uid } = useTS();
  const hoy = hoySV();
  const [inicial] = useState(() => leerBorrador(uid, hoy));
  const [paso, setPaso] = useState(inicial?.paso ?? 1);
  const [elegido, setElegido] = useState<Elegido | null>(inicial?.elegido ?? null);
  const [gestion, setGestion] = useState<BorradorGestion>(() => inicial?.gestion ?? gestionVacia());
  const [nota, setNota] = useState<DatosNota>(() => inicial?.nota ?? notaVacia(hoy));
  const [finalizada, setFinalizada] = useState<boolean | null>(inicial?.finalizada ?? null);
  const [recuperado, setRecuperado] = useState(!!inicial);
  const [abiertas, setAbiertas] = useState<{ clave: string; gestiones: GestionTSCE[] } | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [hecha, setHecha] = useState<Hecha | null>(null);
  const arriba = useRef<HTMLDivElement>(null);
  const primeraVez = useRef(true);

  // Ya registrada deja de ser borrador: si no, al volver se ofrecería registrarla otra vez.
  const yaRegistrada = !!hecha;
  useEffect(() => {
    guardarBorrador(uid, elegido && !yaRegistrada ? { dia: hoy, paso, elegido, gestion, nota, finalizada } : null);
  }, [uid, hoy, paso, elegido, gestion, nota, finalizada, yaRegistrada]);

  // Cada paso empieza arriba: en celular el anterior deja la vista a media página.
  useEffect(() => {
    if (primeraVez.current) { primeraVez.current = false; return; }
    arriba.current?.scrollIntoView({ block: "start" });
  }, [paso]);

  // Si el paciente ya tiene gestiones abiertas se le muestran: quizá lo que toca es darle seguimiento a una.
  const clave = elegido?.paciente.clave ?? "";
  useEffect(() => {
    if (!clave) return;
    let vivo = true;
    llamar<{ gestiones: GestionTSCE[] }>(`/gestiones?paciente=${encodeURIComponent(clave)}`)
      .then((r) => { if (vivo) setAbiertas({ clave, gestiones: r.gestiones.filter((g) => g.estado === "en_proceso") }); })
      .catch(() => { /* solo es una ayuda: no impide registrar */ });
    return () => { vivo = false; };
  }, [clave, llamar, vuelta]);
  const otras = abiertas && abiertas.clave === clave ? abiertas.gestiones : [];

  const tocar = () => { setError(""); setRecuperado(false); };

  const elegir = (e: Elegido | null) => {
    tocar();
    setElegido(e);
    // El área y el médico sugerido salen del paciente: con otro paciente se empieza de cero.
    setGestion(gestionVacia());
    setNota(notaVacia(hoySV()));
    setFinalizada(null);
  };

  const cambiarGestion = (g: BorradorGestion) => {
    tocar();
    // Lo que se hizo depende del tipo de gestión.
    if (g.tipo !== gestion.tipo) setNota((n) => ({ ...n, paso: "" }));
    setGestion(g);
  };

  const empezarDeNuevo = () => {
    elegir(null);
    setPaso(1);
    setHecha(null);
  };

  /** Lo que le falta a un paso, en palabras; vacío si está completo. */
  const falta = (n: number): string => {
    if (n === 1) return elegido ? "" : "Busque y elija al paciente.";
    if (n === 2) {
      const g = validarGestion(gestion);
      return g.ok ? "" : g.error;
    }
    if (n === 3) {
      const v = validarNota(nota, gestion.tipo, hoySV());
      if (!v.ok) return v.error;
      return finalizada === null ? "Indique cómo queda la gestión." : "";
    }
    return "";
  };

  const irA = (n: number) => { tocar(); setPaso(n); };

  const siguiente = () => {
    const f = falta(paso);
    if (f) { setError(f); return; }
    irA(paso + 1);
  };

  const registrar = async () => {
    // Un paso anterior pudo quedar incompleto al volver a cambiarlo.
    const pendiente = [1, 2, 3].find((n) => falta(n));
    if (pendiente) { setPaso(pendiente); setError(falta(pendiente)); return; }
    const g = validarGestion(gestion);
    const n = validarNota(nota, gestion.tipo, hoySV());
    if (!elegido || !g.ok || !n.ok) return;
    setGuardando(true);
    setError("");
    try {
      const p = elegido.paciente;
      const r = await llamar<{ id: string }>("/gestiones", "POST", {
        ...(elegido.manual ? { manual: { expediente: p.expediente, dui: p.dui, paciente: p.paciente } } : { clave: p.clave }),
        gestion: g.datos,
        nota: n.datos,
        finalizada: finalizada === true,
      });
      setHecha({ id: r.id, titulo: tituloGestion(g.datos), paciente: p.paciente, finalizada: finalizada === true });
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };

  /** Otra gestión para el mismo paciente: se conserva el paciente y lo que se marcó de él. */
  const otraDelMismo = () => {
    setGestion({ ...gestionVacia(), poblacion: gestion.poblacion });
    setNota(notaVacia(hoySV()));
    setFinalizada(null);
    setHecha(null);
    setError("");
    setPaso(2);
    setVuelta((v) => v + 1);
  };

  const p = elegido?.paciente;
  const contexto = p && (
    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
      <span className="font-semibold text-slate-700 dark:text-slate-200">{p.paciente}</span>
      {p.expediente && <span className="ml-2 font-mono text-xs font-bold text-blue-700 dark:text-cyan-300">{p.expediente}</span>}
      {paso > 2 && gestion.tipo && <> · {tituloGestion(gestion)}</>}
    </p>
  );

  return (
    <div ref={arriba} className="mx-auto max-w-5xl scroll-mt-4 space-y-5 p-4 md:p-6">
      <Hero icono={FilePlus} titulo="Nueva gestión" detalle="Trabajo Social · Consulta Externa" pie={<Pasos pasos={PASOS} actual={paso} onIr={irA} />}>
        {elegido && (
          <button type="button" onClick={empezarDeNuevo} className={botonHeroSuave}><RotateCcw size={15} aria-hidden="true" />Empezar de nuevo</button>
        )}
      </Hero>

      {recuperado && (
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100" role="status">
          Aquí sigue la gestión que estaba llenando.
        </p>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 md:p-8">
        <div key={paso} className={`space-y-6 ${entrada}`}>
          {paso === 1 && (
            <>
              <Titulo>¿De qué paciente se trata?</Titulo>
              <BuscadorCitado elegido={elegido} onElegir={elegir} />
              {elegido && otras.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/70 dark:bg-amber-950/25">
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100">
                    <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
                    {otras.length === 1 ? "Ya tiene una gestión en proceso" : `Ya tiene ${otras.length} gestiones en proceso`}
                  </p>
                  <p className="mt-0.5 pl-6 text-sm text-amber-900/85 dark:text-amber-100/80">Si es la misma, ábrala y agréguele la nota.</p>
                  <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-amber-200 bg-white dark:divide-slate-800 dark:border-amber-900/70 dark:bg-slate-900">
                    {otras.map((g) => <FilaGestion key={g.id} gestion={g} hoy={hoy} mostrarPaciente={false} />)}
                  </ul>
                </div>
              )}
              {elegido && <CamposPoblacion valor={gestion.poblacion} onChange={(poblacion) => cambiarGestion({ ...gestion, poblacion })} />}
            </>
          )}

          {paso === 2 && p && (
            <>
              <div><Titulo>¿Qué gestión se le hizo?</Titulo>{contexto}</div>
              <CamposGestion
                valor={gestion}
                onChange={cambiarGestion}
                paciente={{ especialidadId: p.especialidadId, areaCuenta: area, medicoSugerido: p.medico }}
              />
            </>
          )}

          {paso === 3 && p && (
            <>
              <div><Titulo>Primera nota</Titulo>{contexto}</div>
              <CamposNota valor={nota} onChange={(v) => { tocar(); setNota(v); }} tipo={gestion.tipo} hoy={hoy} />
              <div className="border-t border-slate-200 pt-6 dark:border-slate-800">
                <ComoQueda valor={finalizada} onChange={(v) => { tocar(); setFinalizada(v); }} />
              </div>
            </>
          )}

          {paso === 4 && p && elegido && (
            <>
              <Titulo>Revise antes de registrar</Titulo>
              <div className="overflow-hidden rounded-2xl border border-blue-200 bg-blue-50/60 dark:border-blue-900/60 dark:bg-blue-950/20">
                <Parte titulo="Paciente" onEditar={() => irA(1)}>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{p.paciente}</p>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                    {p.expediente ? <span className="font-mono font-bold">{p.expediente}</span> : "Sin expediente"}
                    {p.dui && <> · DUI <span className="font-mono">{p.dui}</span></>}
                    {p.especialidadId && <> · {especialidadPorId(p.especialidadId)?.nombre ?? p.especialidadId}</>}
                    {elegido.manual && <> · escrito a mano</>}
                    {gestion.poblacion.length > 0 && <> · {gestion.poblacion.map(labelPoblacion).join(", ")}</>}
                  </p>
                </Parte>
                <div className="grid border-t border-blue-200/70 dark:border-blue-900/50 md:grid-cols-2 md:divide-x md:divide-blue-200/70 md:dark:divide-blue-900/50">
                  <Parte titulo="La gestión" onEditar={() => irA(2)}>
                    <dl className="space-y-1.5">
                      <Dato etiqueta="Gestión" valor={tituloGestion(gestion)} />
                      {gestion.procedencia && <Dato etiqueta="Procedencia" valor={gestion.procedencia === "red" ? gestion.establecimiento : "De este hospital"} />}
                      {gestion.medico && <Dato etiqueta="Médico" valor={gestion.medico} />}
                      {gestion.area && <Dato etiqueta="Área" valor={nombreArea(gestion.area)} />}
                    </dl>
                  </Parte>
                  <div className="border-t border-blue-200/70 dark:border-blue-900/50 md:border-t-0">
                    <Parte titulo="Primera nota" onEditar={() => irA(3)}>
                      <dl className="space-y-1.5">
                        <Dato etiqueta="Fecha" valor={fechaCorta(nota.fecha)} />
                        {nota.paso && <Dato etiqueta="Se hizo" valor={labelPaso(gestion.tipo, nota.paso)} />}
                        <Dato etiqueta="Medio" valor={[labelMedio(nota.medio), nota.conQuien && `con ${labelConQuien(nota.conQuien).toLowerCase()}`].filter(Boolean).join(" ")} />
                        {nota.texto.trim() && <Dato etiqueta="Nota" valor={<span className="whitespace-pre-line">{nota.texto.trim()}</span>} />}
                      </dl>
                    </Parte>
                  </div>
                </div>
                <div className="flex items-center gap-2 border-t border-blue-200/70 px-4 py-3 text-sm text-slate-700 dark:border-blue-900/50 dark:text-slate-200">
                  La gestión queda <Estado estado={finalizada ? "finalizada" : "en_proceso"} />
                </div>
              </div>
            </>
          )}
        </div>

        {error && <div className="mt-6"><Aviso tipo="error">{error}</Aviso></div>}

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-200 pt-6 dark:border-slate-800">
          <button
            type="button"
            onClick={() => irA(paso - 1)}
            disabled={paso === 1 || guardando}
            className="flex items-center gap-2 px-2 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 disabled:invisible dark:text-slate-300 dark:hover:text-white"
          >
            <ArrowLeft size={16} aria-hidden="true" />Anterior
          </button>
          {paso < 4 ? (
            <button type="button" onClick={siguiente} className={`${botonPrimario} px-5`}>
              Siguiente<ArrowRight size={16} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" onClick={() => void registrar()} disabled={guardando} className={`${botonPrimario} px-5`}>
              {guardando ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ClipboardCheck size={16} aria-hidden="true" />}
              {guardando ? "Registrando…" : "Registrar gestión"}
            </button>
          )}
        </div>
      </div>

      {hecha && (
        <Dialogo etiqueta="Gestión registrada">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <CircleCheckBig size={28} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <p className="mt-4 font-heading text-lg font-bold text-slate-900 dark:text-slate-100">Gestión registrada</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{hecha.titulo}</p>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{hecha.paciente}</p>
          <p className="mt-2 flex justify-center"><Estado estado={hecha.finalizada ? "finalizada" : "en_proceso"} /></p>
          <div className="mt-5 space-y-2">
            <button type="button" autoFocus onClick={empezarDeNuevo} className={`${botonPrimario} w-full`}>Registrar otra gestión</button>
            <button type="button" onClick={otraDelMismo} className={`${botonSecundario} w-full`}>Otra gestión de este paciente</button>
            {/* El respaldo se anexa en la pantalla de la gestión, que ya existe. */}
            <Link prefetch={false} href={RUTAS_TS.gestion(hecha.id)} className={`${botonSecundario} w-full`}>
              <Paperclip size={15} aria-hidden="true" />Adjuntar archivos a esta gestión
            </Link>
            <Link
              prefetch={false}
              href={RUTAS_TS.seguimiento}
              className="inline-flex w-full items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Ir a seguimiento
            </Link>
          </div>
        </Dialogo>
      )}
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h2 className="font-heading text-xl font-bold text-slate-900 dark:text-slate-100 md:text-2xl">{children}</h2>;
}

/** Bloque del resumen, con la salida para corregirlo en su paso. */
function Parte({ titulo, onEditar, children }: { titulo: string; onEditar: () => void; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-800 dark:text-blue-300">{titulo}</p>
        <button type="button" onClick={onEditar} className={botonTexto}><Pencil size={12} aria-hidden="true" />Cambiar</button>
      </div>
      {children}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 pt-px text-xs font-medium text-slate-500 dark:text-slate-400">{etiqueta}</dt>
      <dd className="min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-200">{valor}</dd>
    </div>
  );
}
