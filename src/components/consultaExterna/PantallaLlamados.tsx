"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Megaphone, Play, Volume2, VolumeX, WifiOff, X } from "lucide-react";
import {
  alCambiarVoces,
  anunciarLlamado,
  CLAVE_VOZ_PANTALLA,
  duracionLlamadoMs,
  elegirVoz,
  esperarVoces,
  nombreCortoVoz,
  pausa,
  prepararSonido,
  textoLlamado,
} from "@/lib/consultaExterna/voz";
import { aplicarPronunciacion, type ReglaPronunciacion } from "@/lib/consultaExterna/pronunciacion";
import { escucharPronunciacion } from "@/lib/consultaExterna/pronunciacionDatos";
import { escucharLlamados } from "@/lib/consultaExterna/estacionDatos";
import { useAuth } from "@/contexts/AuthContext";
import {
  agregarLlamado,
  crearMensajePantalla,
  destinoConsultorioDe,
  destinoDelLlamado,
  destinoEstacion,
  destinoSignosVitales,
  DESTINO_TRABAJO_SOCIAL,
  MAX_LLAMADOS_PANTALLA,
  quitadoDeLaLista,
  tituloLlamado,
  type LlamadoPantalla,
} from "@/lib/consultaExterna/circuito";
import type { EstacionCEId } from "@/lib/consultaExterna/especialidades";
import { hoyLocalISO } from "@/lib/esdomed/expedientesProgramados";

// Pantalla de llamados (TV de la sala de espera). La página que la monta va
// fuera del layout del subsistema para ocupar la pantalla completa, sin menú.
// Es un letrero: usa el degradado institucional de los heros y se ve igual en
// modo claro y oscuro.
//
// Cada llamado muestra expediente y nombre del paciente y la estación a la que
// debe acercarse (decisión del usuario, 2026-11-17; antes era un código y el
// consultorio, para no mostrar nombres). Los llamados anteriores, que solo
// traen código, se siguen viendo con su código. Los de Mensajes a pantalla
// (2026-11-18) son texto libre: "Texto libre" (y los mensajes viejos) no
// llevan destino y, sin él, no se muestra el recuadro "Acercarse a".
//
// Escucha un solo documento (consulta_externa_llamados/{hoy}) y anuncia solo
// los llamados nuevos, por turnos (pedido del usuario, 2026-11-19): si llega
// uno mientras se lee otro, espera en cola y la sección principal no cambia
// hasta que termine la lectura; mientras espera tampoco sale en "Últimos
// llamados". Sin voz, cada turno dura lo que tardaría leerse
// (duracionLlamadoMs), así dos pantallas de la misma sala cambian juntas. Lo
// que se quita de la pantalla (Quitar, Limpiar, Volver a llamar) deja la cola
// y, si se estaba leyendo, se calla. La voz se activa y se elige por equipo, desde el botón
// del pie (queda en este navegador): dos pantallas que se oyen desde el mismo
// lugar harían eco. Antes de leer, cada llamado pasa por el diccionario de
// pronunciación (configuracion/pronunciacion_ce), para que los nombres de
// origen inglés no se lean en inglés. Con ?demo=1 no escucha los llamados y
// ofrece "Simular llamado" para probar el diseño y la voz.

// Datos inventados, solo para el modo de prueba. Cubren los llamados de la
// estación (a la estación, a un consultorio elegido, solo por nombre) y los
// mensajes (a signos vitales, a un consultorio, a Trabajo Social y texto libre).
type Ejemplo =
  | { expediente?: string; paciente: string; estacionId: EstacionCEId; consultorio?: string }
  | { mensaje: string; destino: string };
const EJEMPLOS: Ejemplo[] = [
  { expediente: "11431-26", paciente: "María Pilar López Gonzales", estacionId: "hematologia" },
  { mensaje: "Rosa Elena Cruz Ventura", destino: destinoSignosVitales("hematologia") },
  { expediente: "45210-24", paciente: "Ana Gabriela Rivas Hernández", estacionId: "infectologia", consultorio: "Infectologia - 2" },
  { mensaje: "Carlos Ernesto Pineda Flores", destino: destinoConsultorioDe("oncologia", "2") },
  { paciente: "José Antonio Martínez de León", estacionId: "cardiologia" },
  { mensaje: "Luis Alberto Gómez Portillo", destino: DESTINO_TRABAJO_SOCIAL },
  { mensaje: "Familiares de Juan Francisco Alvarado Mejía, favor pasar a enfermería", destino: "" },
];

/** Un ejemplo del modo de prueba, como llegaría en la lista de las pantallas. */
function llamadoDeEjemplo(ejemplo: Ejemplo, ms: number): LlamadoPantalla {
  if ("mensaje" in ejemplo) {
    return { ...crearMensajePantalla({ texto: ejemplo.mensaje, destino: ejemplo.destino, porNombre: "Prueba" }, ms), id: `demo-${ms}` };
  }
  return {
    id: `demo-${ms}`,
    citaId: `demo-${ejemplo.expediente ?? ejemplo.paciente}`,
    ...(ejemplo.expediente ? { expediente: ejemplo.expediente } : {}),
    paciente: ejemplo.paciente,
    destino: destinoDelLlamado(ejemplo.estacionId, ejemplo.consultorio),
    estacionId: ejemplo.estacionId,
    enMs: ms,
  };
}

/**
 * Tamaño del texto grande según su largo: un nombre se ve enorme; un mensaje
 * de 80 letras baja de tamaño para caber completo sin cortarse.
 */
function tamanoTitulo(titulo: string): string {
  if (titulo.length <= 34) return "line-clamp-3 text-[clamp(2.5rem,5.6vw,7.5rem)]";
  if (titulo.length <= 56) return "line-clamp-3 text-[clamp(2.1rem,4.4vw,5.75rem)]";
  return "line-clamp-4 text-[clamp(1.8rem,3.5vw,4.5rem)]";
}

const CLAVE_VOZ = "ce:pantalla:voz";
/** Un llamado más viejo que esto no se anuncia (p. ej. la pantalla estuvo sin red). */
const ANUNCIAR_HASTA_MS = 2 * 60_000;
/** Ningún llamado se queda en grande menos que esto, aunque la voz falle. */
const MIN_TURNO_MS = 6000;

function horaCorta(ms: number) {
  return new Date(ms).toLocaleTimeString("es-SV", { hour: "numeric", minute: "2-digit" });
}

export function PantallaLlamados({ demo = false }: { demo?: boolean }) {
  const { profile, logout } = useAuth();
  const [ahora, setAhora] = useState<number | null>(null);
  const [fecha, setFecha] = useState(() => hoyLocalISO());
  const [llamados, setLlamados] = useState<LlamadoPantalla[]>([]);
  const [destello, setDestello] = useState(false);
  const [sinConexion, setSinConexion] = useState(false);
  const [voz, setVoz] = useState(false);
  const [sonidoListo, setSonidoListo] = useState(false);
  const [voces, setVoces] = useState<SpeechSynthesisVoice[]>([]);
  const [vocesListas, setVocesListas] = useState(false);
  const [vozNombre, setVozNombre] = useState("");
  const [panelVoz, setPanelVoz] = useState(false);

  // El llamado en grande. Null: el más reciente de la lista (al abrir la pantalla).
  const [principal, setPrincipal] = useState<LlamadoPantalla | null>(null);
  // Los que esperan su turno: no se muestran todavía.
  const [esperando, setEsperando] = useState<ReadonlySet<string>>(() => new Set());

  const vozRef = useRef<SpeechSynthesisVoice | null>(null);
  const reglasRef = useRef<ReglaPronunciacion[]>([]);
  const hablar = useRef(false);
  const vistos = useRef<Set<string> | null>(null);
  const siguiente = useRef(0);
  // Todo lo que suena va en fila (llamados, "Probar", "Sonido activado"), para no encimarse.
  const sonido = useRef<Promise<void>>(Promise.resolve());
  // Turnos de la sección principal: los que esperan, en orden de llegada, y el que está en curso.
  const cola = useRef<LlamadoPantalla[]>([]);
  const turno = useRef<{ id: string; ctrl: AbortController } | null>(null);
  const principalRef = useRef<LlamadoPantalla | null>(null);
  const listaRef = useRef<LlamadoPantalla[]>([]);
  // Al terminar un turno se pasa al siguiente (ref: la función no puede llamarse a sí misma en el hook).
  const avanzarRef = useRef<() => void>(() => {});
  const destelloT = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    hablar.current = voz && sonidoListo;
  }, [voz, sonidoListo]);

  // La voz guardada en este equipo, o la más recomendable (nunca una que no sea en español).
  const vozActual = elegirVoz(voces, vozNombre);
  useEffect(() => {
    vozRef.current = vozActual;
  }, [vozActual]);

  // Diccionario de pronunciación: un documento que casi nunca cambia.
  useEffect(() => escucharPronunciacion((reglas) => { reglasRef.current = reglas; }), []);

  // Reloj, cambio de día y voces.
  useEffect(() => {
    try {
      // Preferencia de este equipo (no existe en SSR).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVoz(localStorage.getItem(CLAVE_VOZ) === "1");
      setVozNombre(localStorage.getItem(CLAVE_VOZ_PANTALLA) ?? "");
    } catch { /* sin almacenamiento: sin voz */ }
    const tick = () => {
      setAhora(Date.now());
      const hoy = hoyLocalISO();
      setFecha((f) => (f === hoy ? f : hoy));
    };
    tick();
    const t = setInterval(tick, 1000);
    const recibir = (v: SpeechSynthesisVoice[]) => {
      setVoces(v);
      setVocesListas(true);
    };
    esperarVoces().then(recibir);
    const dejar = alCambiarVoces(recibir);
    return () => { clearInterval(t); dejar(); };
  }, []);

  // Todo lo de abajo usa solo refs y setters: estable, el efecto de los
  // llamados no se reinicia por ello.
  const enSonido = useCallback((fn: () => Promise<void>) => {
    const trabajo = sonido.current.then(fn).catch((e) => console.error("Pantalla: falló un anuncio", e));
    sonido.current = trabajo;
    return trabajo;
  }, []);

  const destellar = useCallback(() => {
    setDestello(true);
    if (destelloT.current) clearTimeout(destelloT.current);
    destelloT.current = setTimeout(() => setDestello(false), 2400);
  }, []);

  const mostrar = useCallback((l: LlamadoPantalla | null) => {
    principalRef.current = l;
    setPrincipal(l);
  }, []);

  // Un turno: el llamado queda en grande mientras se lee (o, sin voz, lo que
  // tardaría leerse). El tope evita que una voz trabada congele la pantalla.
  const correrTurno = useCallback(
    async (l: LlamadoPantalla, ctrl: AbortController) => {
      const texto = aplicarPronunciacion(textoLlamado(l), reglasRef.current);
      const duracion = duracionLlamadoMs(texto);
      const lectura = hablar.current
        ? enSonido(() => anunciarLlamado(texto, vozRef.current, undefined, ctrl.signal))
        : pausa(duracion, ctrl.signal);
      // Si la voz falla al instante, el llamado igual se alcanza a leer en pantalla.
      const conMinimo = Promise.all([lectura, pausa(MIN_TURNO_MS, ctrl.signal)]);
      await Promise.race([conMinimo, pausa(duracion * 2 + 15_000, ctrl.signal)]);
      ctrl.abort(); // si ganó el tope, calla la voz; si no, solo limpia el temporizador
    },
    [enSonido],
  );

  const avanzar = useCallback(() => {
    if (turno.current) return;
    const l = cola.current.shift();
    setEsperando(new Set(cola.current.map((c) => c.id)));
    if (!l) return;
    const ctrl = new AbortController();
    turno.current = { id: l.id, ctrl };
    mostrar(l);
    destellar();
    void correrTurno(l, ctrl).finally(() => {
      // Si lo cortaron (lo quitaron de la pantalla), quien lo cortó ya siguió con el próximo.
      if (turno.current?.ctrl !== ctrl) return;
      turno.current = null;
      avanzarRef.current();
    });
  }, [correrTurno, destellar, mostrar]);
  useEffect(() => {
    avanzarRef.current = avanzar;
  }, [avanzar]);

  // La lista de la pantalla cambió: `nuevos` son los que deben esperar su turno.
  const recibir = useCallback(
    (ultimos: LlamadoPantalla[], nuevos: LlamadoPantalla[]) => {
      listaRef.current = ultimos;
      cola.current = cola.current.filter((l) => !quitadoDeLaLista(l, ultimos));
      const p = principalRef.current;
      if (p && quitadoDeLaLista(p, ultimos)) {
        if (turno.current?.id === p.id) {
          turno.current.ctrl.abort();
          turno.current = null;
        }
        mostrar(null);
      }
      cola.current.push(...nuevos);
      setLlamados(ultimos);
      setEsperando(new Set(cola.current.map((c) => c.id)));
      avanzar();
    },
    [avanzar, mostrar],
  );

  // Llamados reales: un solo documento por día.
  useEffect(() => {
    if (demo) return;
    vistos.current = null;
    const dejar = escucharLlamados(
      fecha,
      (ultimos) => {
        setSinConexion(false);
        // Al abrir la pantalla (o al cambiar de día), lo que ya estaba no se anuncia.
        if (vistos.current === null) {
          vistos.current = new Set(ultimos.map((l) => l.id));
          recibir(ultimos, []);
          return;
        }
        const nuevos = ultimos.filter((l) => !vistos.current!.has(l.id)).reverse();
        nuevos.forEach((l) => vistos.current!.add(l.id));
        // Uno viejo (la pantalla estuvo sin red) no hace turno: entra directo a la lista.
        recibir(ultimos, nuevos.filter((l) => Date.now() - l.enMs < ANUNCIAR_HASTA_MS));
      },
      (e) => {
        console.error("Pantalla sin acceso a los llamados", e);
        setSinConexion(true);
      },
    );
    return () => {
      dejar();
      // Lo del día anterior (o de una pantalla que se cierra) no sigue sonando.
      turno.current?.ctrl.abort();
      turno.current = null;
      cola.current = [];
    };
  }, [demo, fecha, recibir]);

  const simular = () => {
    setSonidoListo(true);
    hablar.current = voz;
    const ejemplo = EJEMPLOS[siguiente.current % EJEMPLOS.length];
    siguiente.current += 1;
    const nuevo = llamadoDeEjemplo(ejemplo, Date.now());
    recibir(agregarLlamado(listaRef.current, nuevo, MAX_LLAMADOS_PANTALLA), [nuevo]);
  };

  // Dentro del clic: habilita el audio y despierta la voz ("Sonido activado"),
  // así el primer llamado real sale sin demora. Va en la fila del sonido para
  // no encimarse con un anuncio.
  const activarSonido = () => {
    setSonidoListo(true);
    void enSonido(() => prepararSonido(vozRef.current));
  };

  const alternarVoz = () => {
    const nueva = !voz;
    setVoz(nueva);
    if (nueva) activarSonido();
    else setSonidoListo(true); // el clic ya habilita el sonido en el navegador
    try { localStorage.setItem(CLAVE_VOZ, nueva ? "1" : "0"); } catch { /* sin almacenamiento */ }
  };

  const cambiarVoz = (nombre: string) => {
    setVozNombre(nombre);
    try { localStorage.setItem(CLAVE_VOZ_PANTALLA, nombre); } catch { /* sin almacenamiento */ }
  };

  // Lee un llamado de ejemplo con la voz elegida (el clic también habilita el
  // sonido). No cambia lo que muestra la pantalla.
  const probarVoz = () => {
    setSonidoListo(true);
    const texto = textoLlamado({ expediente: "11431-26", paciente: "María Pilar López Gonzales", destino: destinoEstacion("hematologia") });
    void enSonido(() => anunciarLlamado(aplicarPronunciacion(texto, reglasRef.current), vozRef.current));
  };

  // Lo que espera turno no se ve todavía, ni en grande ni en "Últimos llamados".
  const visibles = llamados.filter((l) => !esperando.has(l.id));
  const actual = principal ?? visibles[0];
  const anteriores = visibles.filter((l) => l.id !== actual?.id);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] text-white">
      {/* Encabezado */}
      <header className="flex items-center justify-between gap-6 border-b border-white/10 px-[3vw] py-[2vh]">
        <div className="flex items-center gap-[2vw]">
          {/* Logo de trazo grueso en blanco sólido: el de trazo fino casi no
              se leía sobre el degradado desde lejos. */}
          <Image src="/logo_hnes.png" alt="Hospital Nacional El Salvador" width={1500} height={720} className="h-[10vh] w-auto object-contain brightness-0 invert" priority />
          <span className="h-[7vh] w-px bg-white/25" aria-hidden="true" />
          <div>
            <p className="font-heading text-[clamp(1.25rem,2.2vw,2.5rem)] font-bold leading-tight">Consulta Externa</p>
            <p className="text-[clamp(0.8rem,1.1vw,1.25rem)] uppercase tracking-[0.2em] text-cyan-100/70">Llamados</p>
          </div>
        </div>
        <p className="font-heading text-[clamp(1.75rem,3.6vw,4rem)] font-bold tabular-nums">
          {ahora ? horaCorta(ahora) : ""}
        </p>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-[2vw] px-[3vw] py-[3vh] lg:grid-cols-[1.7fr_1fr]">
        {/* Llamado actual */}
        <section
          className={`flex min-h-0 flex-col items-center justify-center rounded-[2vw] border text-center transition-colors duration-700 ${
            destello ? "border-cyan-200/70 bg-white/20" : "border-white/15 bg-white/[0.07]"
          }`}
          aria-live="polite"
        >
          {actual ? (
            <>
              {/* Sin expediente (llamado manual solo por nombre) no lleva etiqueta; "Turno" es de los llamados viejos por código. */}
              {(actual.expediente || !actual.paciente) && (
                <p className="text-[clamp(1rem,1.6vw,2rem)] font-semibold uppercase tracking-[0.25em] text-cyan-100/80">
                  {actual.expediente ? "Expediente" : "Turno"}
                </p>
              )}
              {actual.expediente && (
                <p className="font-heading text-[clamp(2.5rem,5.5vw,7rem)] font-bold leading-none tracking-tight">
                  {actual.expediente}
                </p>
              )}
              <p
                className={`mt-[2.5vh] max-w-[92%] font-heading font-extrabold leading-[1.05] tracking-tight [text-wrap:balance] ${tamanoTitulo(
                  tituloLlamado(actual),
                )}`}
              >
                {tituloLlamado(actual)}
              </p>
              {/* Un mensaje puede ir sin destino: entonces solo se muestra el texto. */}
              {actual.destino && (
                <div className="mt-[4vh] rounded-[1.2vw] bg-white/10 px-[2.5vw] py-[1.6vh]">
                  <p className="text-[clamp(0.9rem,1.3vw,1.6rem)] font-semibold uppercase tracking-[0.25em] text-cyan-100/80">Acercarse a</p>
                  <p className="font-heading text-[clamp(1.6rem,3.2vw,4rem)] font-bold leading-tight">{actual.destino}</p>
                </div>
              )}
            </>
          ) : (
            <>
              <Megaphone className="h-[10vh] w-[10vh] text-cyan-100/40" strokeWidth={1.4} aria-hidden="true" />
              <p className="mt-[2vh] text-[clamp(1.5rem,2.6vw,3rem)] font-semibold text-cyan-50/70">Esperando llamados</p>
            </>
          )}
        </section>

        {/* Últimos llamados */}
        <section className="hidden min-h-0 flex-col lg:flex">
          <h2 className="mb-[1.5vh] text-[clamp(0.9rem,1.2vw,1.5rem)] font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
            Últimos llamados
          </h2>
          <ol className="flex min-h-0 flex-1 flex-col gap-[1.2vh]">
            {anteriores.length === 0 ? (
              <li className="rounded-[1vw] border border-dashed border-white/15 px-[1.5vw] py-[2vh] text-[clamp(0.9rem,1.2vw,1.5rem)] text-cyan-50/50">
                Aún no hay llamados anteriores
              </li>
            ) : (
              anteriores.slice(0, 6).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-4 rounded-[1vw] bg-white/[0.07] px-[1.5vw] py-[1.4vh]">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-heading text-[clamp(1.1rem,1.8vw,2.2rem)] font-bold leading-tight">{tituloLlamado(l)}</p>
                    {l.expediente && (
                      <p className="mt-[0.4vh] text-[clamp(0.85rem,1.2vw,1.5rem)] text-cyan-50/80">Exp. {l.expediente}</p>
                    )}
                  </div>
                  <p className="max-w-[45%] flex-shrink-0 text-right text-[clamp(0.85rem,1.2vw,1.5rem)] leading-tight text-cyan-50/85">
                    {l.destino}
                    <span className="block text-[0.8em] text-cyan-100/50">{horaCorta(l.enMs)}</span>
                  </p>
                </li>
              ))
            )}
          </ol>
        </section>
      </main>

      <footer className="flex items-center justify-between gap-4 border-t border-white/10 px-[3vw] py-[1.6vh]">
        <p className="text-[clamp(0.9rem,1.3vw,1.6rem)] text-cyan-50/80">Tenga a mano su carné de citas y esté atento a su número de expediente y su nombre.</p>
        <div className="flex flex-shrink-0 items-center gap-2">
          {sinConexion && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-amber-200">
              <WifiOff size={14} aria-hidden="true" />
              Sin conexión
            </span>
          )}
          {demo && (
            <button type="button" onClick={simular} className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/20">
              <Megaphone size={14} aria-hidden="true" />
              Simular llamado
            </button>
          )}
          {/* Discreto a propósito: se configura una vez por equipo. */}
          <button
            type="button"
            onClick={() => setPanelVoz((p) => !p)}
            aria-expanded={panelVoz}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10 hover:text-white ${
              voz && vocesListas && !vozActual ? "text-amber-200" : "text-cyan-50/60"
            }`}
          >
            {voz ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
            {!voz ? "Sin voz" : vozActual ? `Voz: ${nombreCortoVoz(vozActual.name)}` : vocesListas ? "Sin voz en español" : "Voz activada"}
          </button>
        </div>
      </footer>

      {panelVoz && (
        <div
          role="dialog"
          aria-label="Voz de esta pantalla"
          className="absolute bottom-[calc(3.2vh+2rem)] right-[3vw] z-10 w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-[#0d2739]/95 p-4 text-sm shadow-2xl backdrop-blur"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="font-heading text-base font-bold">Voz de esta pantalla</p>
            <button type="button" onClick={() => setPanelVoz(false)} className="rounded-lg p-1.5 text-cyan-50/70 hover:bg-white/10 hover:text-white" aria-label="Cerrar">
              <X size={16} />
            </button>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" checked={voz} onChange={alternarVoz} className="h-4 w-4 accent-cyan-400" />
            Leer los llamados en voz alta
          </label>
          <p className="mt-1 text-xs text-cyan-50/60">
            Actívela en una sola pantalla por zona: dos que se oyen desde el mismo lugar hacen eco.
          </p>
          {voces.length === 0 ? (
            <p className={`mt-3 text-xs ${vocesListas ? "text-amber-200" : "text-cyan-50/60"}`}>
              {vocesListas
                ? "Este navegador no tiene voces en español: el llamado saldría en inglés. Abra la pantalla en Microsoft Edge."
                : "Buscando voces…"}
            </p>
          ) : (
            <div className="mt-3 flex items-end gap-2">
              <label className="block min-w-0 flex-1">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-cyan-100/70">Voz</span>
                <select
                  value={vozActual?.name ?? ""}
                  onChange={(e) => cambiarVoz(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/20 bg-[#0d2739] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-300"
                >
                  {voces.map((v) => (
                    <option key={v.name} value={v.name}>
                      {nombreCortoVoz(v.name)}{v.localService ? "" : " · en línea"}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={probarVoz}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold transition-colors hover:bg-white/20"
              >
                <Play size={14} aria-hidden="true" />
                Probar
              </button>
            </div>
          )}
          <p className="mt-3 text-xs text-cyan-50/60">
            Si un nombre se oye en inglés, agréguelo al diccionario de pronunciación en Consulta Externa → Pantallas.
          </p>
          {/* Para saber con qué cuenta quedó la TV (debe ser la de pantalla, no una personal). */}
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-xs text-cyan-50/60">
            <span className="min-w-0 truncate">Sesión: {profile?.nombre ?? "—"}</span>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex-shrink-0 rounded px-1.5 py-1 font-medium text-cyan-50/70 underline-offset-2 hover:text-white hover:underline"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      )}

      {/* El navegador no deja sonar nada hasta el primer toque en la página. */}
      {voz && !sonidoListo && (
        <button
          type="button"
          onClick={activarSonido}
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0d2739]/85 text-center backdrop-blur-sm"
        >
          <Volume2 className="h-[12vh] w-[12vh] text-cyan-200" strokeWidth={1.5} aria-hidden="true" />
          <span className="font-heading text-[clamp(1.5rem,3vw,3.5rem)] font-bold">Toque la pantalla para activar el sonido</span>
          <span className="text-[clamp(0.9rem,1.4vw,1.6rem)] text-cyan-50/70">El navegador lo pide una vez cada vez que se abre la pantalla.</span>
        </button>
      )}
    </div>
  );
}
