"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, DoorOpen, Loader2, LogOut, Megaphone, RotateCcw, Send, Stethoscope, X } from "lucide-react";
import {
  destinoConsultorioDe,
  destinoSignosVitales,
  MAX_MENSAJE_PANTALLA,
  nombreParaLlamado,
  textoParaPantalla,
  type LlamadoPantalla,
} from "@/lib/consultaExterna/circuito";
import { ESPECIALIDADES_CE, especialidadPorId } from "@/lib/consultaExterna/especialidades";
import { buscarCitas } from "@/lib/consultaExterna/busqueda";
import { leerCitasDelDia, publicarMensajePantalla, quitarLlamadoDePantalla } from "@/lib/consultaExterna/estacionDatos";
import type { CitaCEConId } from "@/lib/consultaExterna/tipos";
import { hoyLocalISO } from "@/lib/esdomed/expedientesProgramados";

// Mensajes a pantalla (pedido del usuario, 2026-11-18). Es la única página de
// la cuenta general "speaker" (rol mensajes_ce), que comparten todas las
// estaciones y se usa sobre todo desde el celular.
//
// Un solo cuadro, con forma de TV: lo que se ve es lo que saldrá en pantalla.
// Al escribir un expediente o un nombre aparecen los pacientes de la agenda
// del día (la carga ESDOMED); al elegir uno, el mensaje lleva su expediente y
// su nombre. Quien no está citado se escribe a mano, como texto libre. Abajo,
// si hace falta, se marca a dónde ir: toma de signos vitales o un consultorio,
// los dos con su especialidad.
//
// La agenda se lee una vez, al empezar a escribir, y se renueva cada 10
// minutos. Lo enviado hoy queda en este equipo (localStorage) para repetirlo,
// corregirlo o quitarlo de las pantallas.

type Indicacion = "" | "signos" | "consultorio";

interface Eleccion {
  indicacion: Indicacion;
  especialidadId: string;
  numero: string;
}

/** Paciente elegido de la agenda del día. */
interface PacienteAgenda {
  expediente: string;
  nombre: string;
}

type Enviado = LlamadoPantalla & { fecha: string; eleccion: Eleccion; quitado?: boolean };

const SIN_ELECCION: Eleccion = { indicacion: "", especialidadId: "", numero: "" };
/** Especialidad y consultorio de la última vez: cada equipo suele estar en la misma área. */
const CLAVE_CONSULTORIO = "ce:mensajes:consultorio";
const claveEnviados = (fecha: string) => `ce:mensajes:enviados:${fecha}`;
const MAX_ENVIADOS = 12;
const MAX_SUGERENCIAS = 5;
/** La agenda puede recibir una segunda carga en el día: se vuelve a leer pasado este tiempo. */
const AGENDA_VIGENTE_MS = 10 * 60_000;
const REINTENTO_AGENDA_MS = 60_000;

function leerJSON<T>(clave: string, porDefecto: T): T {
  try {
    const v = localStorage.getItem(clave);
    return v ? (JSON.parse(v) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function guardarJSON(clave: string, valor: unknown) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ }
}

function destinoDe(e: Eleccion): string {
  if (e.indicacion === "signos") return destinoSignosVitales(e.especialidadId);
  if (e.indicacion === "consultorio") return destinoConsultorioDe(e.especialidadId, e.numero);
  return "";
}

const horaCorta = (ms: number) => new Date(ms).toLocaleTimeString("es-SV", { hour: "numeric", minute: "2-digit" });

// Controles táctiles: respuesta al presionar, sin retraso ni selección del texto al mantener.
const tactil = "touch-manipulation select-none transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]";
const rotulo = "mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

interface Props {
  /** Nombre de la sesión; queda en cada mensaje. */
  porNombre: string;
  /** Quien tiene otras páginas (admin, estación) vuelve al subsistema. */
  regreso?: { href: string; label: string };
  /** Solo la cuenta de mensajes, que no tiene otra página. */
  onSalir?: () => void;
  /** De dónde salen las citas del día (se reemplaza en la prueba visual, sin Firestore). */
  leerAgenda?: (fechaISO: string) => Promise<CitaCEConId[]>;
}

export function MensajesPantalla({ porNombre, regreso, onSalir, leerAgenda = leerCitasDelDia }: Props) {
  const [texto, setTexto] = useState("");
  const [paciente, setPaciente] = useState<PacienteAgenda | null>(null);
  const [eleccion, setEleccion] = useState<Eleccion>(SIN_ELECCION);
  const [otroNumero, setOtroNumero] = useState(false);
  const [agenda, setAgenda] = useState<{ citas: CitaCEConId[]; ms: number; fallo?: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviadoOk, setEnviadoOk] = useState(false);
  const [error, setError] = useState("");
  const [fechaLista, setFechaLista] = useState("");
  const [enviados, setEnviados] = useState<Enviado[]>([]);
  const [ocupado, setOcupado] = useState("");
  const [repetido, setRepetido] = useState("");
  const [errorLista, setErrorLista] = useState("");
  const refTexto = useRef<HTMLTextAreaElement>(null);
  const leyendoAgenda = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // localStorage no existe en el servidor: se lee al montar.
    const hoy = hoyLocalISO();
    const ultimo = leerJSON<Partial<Eleccion>>(CLAVE_CONSULTORIO, {});
    /* eslint-disable react-hooks/set-state-in-effect */
    setFechaLista(hoy);
    setEnviados(leerJSON<Enviado[]>(claveEnviados(hoy), []));
    if (ultimo.especialidadId && especialidadPorId(ultimo.especialidadId)) {
      setEleccion((e) => ({ ...e, especialidadId: ultimo.especialidadId!, numero: ultimo.numero ?? "" }));
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    const pendientes = timers.current;
    return () => pendientes.forEach(clearTimeout);
  }, []);

  // La agenda del día se lee al empezar a escribir (no al abrir: así no se
  // gastan lecturas en un equipo que solo se dejó abierto).
  const consulta = texto.trim();
  useEffect(() => {
    if (paciente || consulta.length < 2 || leyendoAgenda.current) return;
    if (agenda && Date.now() - agenda.ms < (agenda.fallo ? REINTENTO_AGENDA_MS : AGENDA_VIGENTE_MS)) return;
    leyendoAgenda.current = true;
    leerAgenda(hoyLocalISO())
      .then((citas) => setAgenda({ citas, ms: Date.now() }))
      .catch((e) => {
        console.error("No se pudo leer la agenda del día para buscar pacientes", e);
        setAgenda({ citas: [], ms: Date.now(), fallo: true });
      })
      .finally(() => {
        leyendoAgenda.current = false;
      });
  }, [consulta, paciente, agenda, leerAgenda]);

  // El cuadro crece con el texto (sin barra de desplazamiento).
  useLayoutEffect(() => {
    const el = refTexto.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [texto]);

  const despues = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const cambiarEnviados = (cambiar: (prev: Enviado[]) => Enviado[]) =>
    setEnviados((prev) => {
      const lista = cambiar(prev).slice(0, MAX_ENVIADOS);
      if (fechaLista) guardarJSON(claveEnviados(fechaLista), lista);
      return lista;
    });

  const esp = especialidadPorId(eleccion.especialidadId);
  const destino = destinoDe(eleccion);
  const enPantalla = textoParaPantalla(texto);
  // Todo en mayúsculas o minúsculas se muestra con mayúscula inicial: se avisa cómo saldrá.
  const cambiaAlMostrar = enPantalla !== "" && enPantalla !== texto.replace(/\s+/g, " ").trim();
  // Signos vitales y consultorio piden la especialidad (y el consultorio, su número).
  const faltaDestino = eleccion.indicacion !== "" && !destino;
  const listo = enPantalla.length >= 2 && !faltaDestino;
  const restantes = MAX_MENSAJE_PANTALLA - texto.length;

  const sugerencias = !paciente && agenda && consulta.length >= 2 ? buscarCitas(agenda.citas, consulta, MAX_SUGERENCIAS) : [];
  const pareceExpediente = /^[\d\s-]{3,}$/.test(consulta);
  const sinEnAgenda = !paciente && !!agenda && !agenda.fallo && pareceExpediente && sugerencias.length === 0;

  const cambiarTexto = (valor: string) => {
    setError("");
    setTexto(valor);
    if (!valor.trim()) setPaciente(null);
  };

  const elegirPaciente = (c: CitaCEConId) => {
    const nombre = nombreParaLlamado(c.paciente);
    setPaciente({ expediente: c.expediente, nombre });
    setTexto(nombre);
    setError("");
    // Su especialidad queda lista para signos vitales o consultorio.
    setOtroNumero(false);
    setEleccion((e) => ({ ...e, especialidadId: c.especialidadId, numero: e.especialidadId === c.especialidadId ? e.numero : "" }));
  };

  const marcar = (indicacion: Indicacion) => {
    setError("");
    setEleccion((e) => ({ ...e, indicacion: e.indicacion === indicacion ? "" : indicacion }));
  };

  const elegirEspecialidad = (id: string) => {
    setOtroNumero(false);
    setEleccion((e) => ({ ...e, especialidadId: id, numero: e.especialidadId === id ? e.numero : "" }));
  };

  const elegirNumero = (n: string) => {
    setOtroNumero(false);
    setEleccion((e) => ({ ...e, numero: n }));
  };

  const publicar = async (textoEnviar: string, eleccionEnviar: Eleccion, expediente?: string) => {
    const fecha = hoyLocalISO();
    const l = await publicarMensajePantalla(fecha, { texto: textoEnviar, destino: destinoDe(eleccionEnviar), expediente }, porNombre);
    if (eleccionEnviar.indicacion !== "") {
      guardarJSON(CLAVE_CONSULTORIO, { especialidadId: eleccionEnviar.especialidadId, numero: eleccionEnviar.numero });
    }
    const nuevo: Enviado = { ...l, fecha, eleccion: eleccionEnviar };
    if (fecha !== fechaLista) {
      // Pasó la medianoche con la página abierta: la lista de ayer ya no aplica.
      setFechaLista(fecha);
      setEnviados([nuevo]);
      guardarJSON(claveEnviados(fecha), [nuevo]);
    } else {
      cambiarEnviados((prev) => [nuevo, ...prev.filter((r) => r.citaId !== l.citaId)]);
    }
    return l;
  };

  const enviar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!listo || enviando) return;
    setError("");
    setEnviando(true);
    try {
      await publicar(texto, eleccion, paciente?.expediente);
      setTexto("");
      setPaciente(null);
      setEnviadoOk(true);
      despues(1800, () => setEnviadoOk(false));
      refTexto.current?.focus();
    } catch (err) {
      console.error("No se pudo enviar el mensaje a las pantallas", err);
      setError("No se envió. Revise la conexión e intente de nuevo; el mensaje sigue escrito.");
    } finally {
      setEnviando(false);
    }
  };

  const repetir = async (r: Enviado) => {
    setErrorLista("");
    setOcupado(r.citaId);
    try {
      const l = await publicar(r.paciente ?? "", r.eleccion, r.expediente);
      setRepetido(l.citaId);
      despues(1600, () => setRepetido((id) => (id === l.citaId ? "" : id)));
    } catch (err) {
      console.error("No se pudo repetir el mensaje", err);
      setErrorLista("No se pudo repetir. Revise la conexión e intente de nuevo.");
    } finally {
      setOcupado("");
    }
  };

  const quitar = async (r: Enviado) => {
    setErrorLista("");
    setOcupado(r.citaId);
    try {
      await quitarLlamadoDePantalla(r.fecha, r.citaId);
      cambiarEnviados((prev) => prev.map((x) => (x.citaId === r.citaId ? { ...x, quitado: true } : x)));
    } catch (err) {
      console.error("No se pudo quitar el mensaje de las pantallas", err);
      setErrorLista("No se pudo quitar de la pantalla. Revise la conexión e intente de nuevo.");
    } finally {
      setOcupado("");
    }
  };

  // Lleva un mensaje enviado al cuadro, para corregirlo o mandarlo a otro lugar.
  const corregir = (r: Enviado) => {
    setTexto(r.paciente ?? "");
    setPaciente(r.expediente ? { expediente: r.expediente, nombre: r.paciente ?? "" } : null);
    setEleccion(r.eleccion ?? SIN_ELECCION);
    setOtroNumero(!!r.eleccion?.numero && Number(r.eleccion.numero) > (especialidadPorId(r.eleccion.especialidadId)?.consultorios ?? 0));
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    refTexto.current?.focus({ preventScroll: true });
  };

  const numeros = esp ? Array.from({ length: esp.consultorios }, (_, i) => String(i + 1)) : [];
  const numeroEnLista = numeros.includes(eleccion.numero);
  const mostrarOtro = otroNumero || (eleccion.numero !== "" && !numeroEnLista);

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-[var(--color-institutional-dark)]">
      <header className="pt-safe sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-3 px-4">
          {regreso ? (
            <Link
              href={regreso.href}
              aria-label={`Volver a ${regreso.label}`}
              className={`-ml-2 flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${tactil}`}
            >
              <ArrowLeft size={20} />
            </Link>
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white dark:bg-cyan-600" aria-hidden="true">
              <Megaphone size={18} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-base font-bold leading-tight text-slate-900 dark:text-white">Mensajes a pantalla</h1>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">Consulta Externa</p>
          </div>
          {onSalir && (
            <button
              type="button"
              onClick={onSalir}
              className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${tactil}`}
            >
              <LogOut size={16} aria-hidden="true" />
              Salir
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))] pt-4 sm:pt-8">
        <form onSubmit={enviar}>
          {/* La "TV": se escribe directo en ella. */}
          <div className="relative rounded-3xl bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] px-5 pb-5 pt-4 text-white shadow-lg shadow-slate-900/10 ring-cyan-300/60 transition-shadow focus-within:ring-4 sm:px-7 sm:pb-7 sm:pt-6">
            <label htmlFor="mensaje-pantalla" className="block pr-10 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100/75">
              Lo que dirá la pantalla
            </label>
            {paciente && (
              <div className="mt-2 flex items-center gap-2">
                <p className="font-heading text-lg font-bold tabular-nums leading-none tracking-tight text-cyan-50 sm:text-xl">
                  <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100/75">Expediente</span>
                  {paciente.expediente}
                </p>
                <button
                  type="button"
                  onClick={() => setPaciente(null)}
                  aria-label="Quitar el expediente (dejar solo el texto)"
                  title="Quitar el expediente"
                  className={`flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-cyan-50 hover:bg-white/20 ${tactil}`}
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <textarea
              id="mensaje-pantalla"
              ref={refTexto}
              value={texto}
              onChange={(e) => cambiarTexto(e.target.value.replace(/[\r\n]+/g, " "))}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                e.preventDefault();
                // Con un expediente escrito, Enter elige al paciente de la agenda; si no, envía.
                if (pareceExpediente && sugerencias.length > 0) elegirPaciente(sugerencias[0]);
                else void enviar();
              }}
              rows={1}
              maxLength={MAX_MENSAJE_PANTALLA}
              placeholder="Expediente, nombre o mensaje"
              autoFocus
              autoCapitalize="words"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="send"
              aria-describedby="ayuda-mensaje"
              className="mt-2 block min-h-[2.6em] w-full resize-none overflow-hidden bg-transparent font-heading text-[1.75rem] font-extrabold leading-[1.15] tracking-tight text-white placeholder:font-bold placeholder:text-cyan-50/40 focus:outline-none sm:text-4xl"
            />
            {texto && (
              <button
                type="button"
                onClick={() => {
                  cambiarTexto("");
                  refTexto.current?.focus();
                }}
                aria-label="Borrar el mensaje"
                className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-cyan-50 hover:bg-white/20 ${tactil}`}
              >
                <X size={18} />
              </button>
            )}

            {destino && (
              <div className="mt-4 inline-block max-w-full rounded-2xl bg-white/10 px-4 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-100/80">Acercarse a</p>
                <p className="font-heading text-lg font-bold leading-tight sm:text-xl">{destino}</p>
              </div>
            )}

            {(cambiaAlMostrar || restantes <= 20) && (
              <div className="mt-3 flex items-end justify-between gap-3 text-xs">
                <p className="min-w-0 text-cyan-50/75">{cambiaAlMostrar && <>Saldrá así: «{enPantalla}»</>}</p>
                {restantes <= 20 && (
                  <p className={`flex-shrink-0 tabular-nums ${restantes <= 0 ? "font-semibold text-amber-200" : "text-cyan-50/60"}`}>
                    {texto.length}/{MAX_MENSAJE_PANTALLA}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Pacientes de la agenda de hoy que calzan con lo escrito. */}
          <div id="ayuda-mensaje" aria-live="polite">
            {sugerencias.length > 0 && (
              <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <p className="px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  En la agenda de hoy
                </p>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sugerencias.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => elegirPaciente(c)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 touch-manipulation dark:hover:bg-slate-800/60 dark:active:bg-slate-800"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-slate-900 dark:text-white">
                            {nombreParaLlamado(c.paciente)}
                          </span>
                          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                            Exp. <span className="font-mono">{c.expediente}</span> · {especialidadPorId(c.especialidadId)?.nombre ?? c.especialidad}
                            {c.medico ? ` · ${c.medico}` : ""}
                          </span>
                        </span>
                        <span className="flex-shrink-0 text-sm font-semibold text-blue-700 dark:text-cyan-300">Usar</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {sinEnAgenda && (
              <p className="mt-2 px-1 text-sm text-slate-500 dark:text-slate-400">
                {agenda?.citas.length
                  ? "Ese expediente no está en la agenda de hoy. Escriba el nombre del paciente."
                  : "La agenda de hoy aún no está cargada. Escriba el nombre del paciente."}
              </p>
            )}
          </div>

          {/* A dónde ir (opcional) */}
          <fieldset className="mt-5">
            <legend className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              ¿A dónde debe ir? <span className="font-normal text-slate-400 dark:text-slate-500">(opcional)</span>
            </legend>
            <div className="grid grid-cols-2 gap-2.5">
              <OpcionDestino
                activo={eleccion.indicacion === "signos"}
                onClick={() => marcar("signos")}
                icon={Stethoscope}
                titulo="Signos vitales"
                detalle="Toma de signos"
              />
              <OpcionDestino
                activo={eleccion.indicacion === "consultorio"}
                onClick={() => marcar("consultorio")}
                icon={DoorOpen}
                titulo="Consultorio"
                detalle="De especialidad"
              />
            </div>

            {eleccion.indicacion !== "" && (
              <div className="mt-2.5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className={rotulo}>{eleccion.indicacion === "signos" ? "Signos vitales de" : "Especialidad"}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ESPECIALIDADES_CE.map((e) => {
                    const activa = e.id === eleccion.especialidadId;
                    return (
                      <button
                        key={e.id}
                        type="button"
                        aria-pressed={activa}
                        onClick={() => elegirEspecialidad(e.id)}
                        className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-medium leading-tight ${tactil} ${
                          activa
                            ? "border-cyan-600 bg-cyan-600 text-white dark:border-cyan-500 dark:bg-cyan-600"
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600"
                        }`}
                      >
                        {e.nombre}
                      </button>
                    );
                  })}
                </div>

                {esp && eleccion.indicacion === "consultorio" && (
                  <>
                    <p className={`${rotulo} mt-4`}>Consultorio de {esp.nombre}</p>
                    <div className="flex flex-wrap gap-2">
                      {numeros.map((n) => {
                        const activo = !mostrarOtro && eleccion.numero === n;
                        return (
                          <button
                            key={n}
                            type="button"
                            aria-pressed={activo}
                            aria-label={`Consultorio ${n}`}
                            onClick={() => elegirNumero(n)}
                            className={`h-12 w-12 rounded-xl border text-lg font-bold tabular-nums ${tactil} ${
                              activo
                                ? "border-cyan-600 bg-cyan-600 text-white dark:border-cyan-500"
                                : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-600"
                            }`}
                          >
                            {n}
                          </button>
                        );
                      })}
                      {mostrarOtro ? (
                        <input
                          value={numeroEnLista ? "" : eleccion.numero}
                          onChange={(e) => setEleccion((x) => ({ ...x, numero: e.target.value.slice(0, 6) }))}
                          inputMode="numeric"
                          autoFocus={otroNumero && !eleccion.numero}
                          placeholder="Nº"
                          aria-label="Número de consultorio"
                          enterKeyHint="done"
                          className="h-12 w-20 rounded-xl border border-cyan-600 bg-white text-center text-lg font-bold text-slate-900 placeholder:font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:bg-slate-800 dark:text-white"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setOtroNumero(true);
                            setEleccion((x) => ({ ...x, numero: "" }));
                          }}
                          className={`h-12 rounded-xl border border-dashed border-slate-300 px-4 text-sm font-medium text-slate-600 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 ${tactil}`}
                        >
                          Otro
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </fieldset>

          <button
            type="submit"
            disabled={!listo || enviando}
            className={`mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-bold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none ${tactil} ${
              enviadoOk ? "bg-emerald-600 dark:bg-emerald-600" : "bg-blue-600 hover:bg-blue-700 dark:bg-cyan-600 dark:hover:bg-cyan-500"
            }`}
          >
            {enviando ? (
              <Loader2 size={20} className="animate-spin" aria-hidden="true" />
            ) : enviadoOk ? (
              <Check size={20} strokeWidth={2.75} aria-hidden="true" />
            ) : (
              <Send size={19} aria-hidden="true" />
            )}
            {enviando ? "Enviando…" : enviadoOk ? "Enviado a las pantallas" : "Enviar a pantalla"}
          </button>
          <p className="sr-only" aria-live="polite">{enviadoOk ? "Mensaje enviado a las pantallas" : ""}</p>

          {faltaDestino && texto.trim() !== "" && (
            <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
              {!esp
                ? eleccion.indicacion === "signos"
                  ? "Elija la especialidad."
                  : "Elija la especialidad y el consultorio."
                : "Elija el número del consultorio."}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
        </form>

        {enviados.length > 0 && (
          <section className="mt-10" aria-labelledby="enviados-titulo">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 id="enviados-titulo" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Enviados hoy
              </h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">Toque uno para corregirlo</p>
            </div>
            {errorLista && (
              <p role="alert" className="mb-2 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                {errorLista}
              </p>
            )}
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {enviados.map((r) => {
                const enCurso = ocupado === r.citaId;
                return (
                  <li key={r.citaId} className="flex items-center gap-1 py-1.5 pl-1.5 pr-1.5">
                    <button
                      type="button"
                      onClick={() => corregir(r)}
                      className="min-w-0 flex-1 rounded-xl px-2.5 py-1.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 touch-manipulation"
                    >
                      <span
                        className={`block truncate text-[15px] font-semibold ${
                          r.quitado ? "text-slate-400 line-through dark:text-slate-500" : "text-slate-900 dark:text-white"
                        }`}
                      >
                        {r.paciente}
                      </span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {horaCorta(r.enMs)}
                        {r.expediente ? ` · Exp. ${r.expediente}` : ""} ·{" "}
                        {r.quitado ? "Quitado de la pantalla" : r.destino || "Solo el mensaje"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void repetir(r)}
                      disabled={enCurso}
                      className={`inline-flex h-10 flex-shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold disabled:opacity-60 ${tactil} ${
                        repetido === r.citaId
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-blue-700 hover:bg-blue-50 dark:text-cyan-300 dark:hover:bg-cyan-950/50"
                      }`}
                    >
                      {enCurso ? (
                        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      ) : repetido === r.citaId ? (
                        <Check size={16} strokeWidth={2.75} aria-hidden="true" />
                      ) : (
                        <RotateCcw size={16} aria-hidden="true" />
                      )}
                      {repetido === r.citaId ? "Enviado" : "Repetir"}
                    </button>
                    {/* Quitado: un hueco del mismo ancho, para que "Repetir" no se corra. */}
                    {r.quitado ? (
                      <span className="w-10 flex-shrink-0" aria-hidden="true" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => void quitar(r)}
                        disabled={enCurso}
                        aria-label={`Quitar «${r.paciente}» de las pantallas`}
                        title="Quitar de las pantallas"
                        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-60 dark:text-slate-500 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 ${tactil}`}
                      >
                        <X size={18} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function OpcionDestino({
  activo,
  onClick,
  icon: Icon,
  titulo,
  detalle,
}: {
  activo: boolean;
  onClick: () => void;
  icon: typeof Stethoscope;
  titulo: string;
  detalle: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      // En celulares angostos (< 380 px) el ícono va arriba, para que el título no se parta.
      className={`flex min-h-[4.25rem] flex-col items-start gap-2 rounded-2xl border px-3 py-3 text-left min-[380px]:flex-row min-[380px]:items-center min-[380px]:gap-3 ${tactil} ${
        activo
          ? "border-cyan-600 bg-cyan-50 ring-1 ring-cyan-600 dark:border-cyan-500 dark:bg-cyan-950/50 dark:ring-cyan-500"
          : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
      }`}
    >
      <span
        className={`relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-colors ${
          activo ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        }`}
      >
        <Icon size={20} aria-hidden="true" />
        {/* Marcado: palomita en la esquina del ícono (no tapa el texto en el celular). */}
        {activo && (
          <span
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-700 text-white ring-2 ring-cyan-50 dark:bg-blue-500 dark:ring-slate-900"
            aria-hidden="true"
          >
            <Check size={12} strokeWidth={3.25} />
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight text-slate-900 dark:text-white">{titulo}</span>
        <span className="block text-xs leading-tight text-slate-500 dark:text-slate-400">{detalle}</span>
      </span>
    </button>
  );
}
