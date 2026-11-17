"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Megaphone, Volume2, VolumeX, WifiOff } from "lucide-react";
import { alCambiarVoces, anunciarLlamado, esperarVoces, prepararSonido, textoLlamado } from "@/lib/consultaExterna/voz";
import { escucharLlamados } from "@/lib/consultaExterna/estacionDatos";
import { agregarLlamado, destinoEstacion, MAX_LLAMADOS_PANTALLA, tituloLlamado, type LlamadoPantalla } from "@/lib/consultaExterna/circuito";
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
// traen código, se siguen viendo con su código.
//
// Escucha un solo documento (consulta_externa_llamados/{hoy}) y anuncia solo
// los llamados nuevos. La voz se activa por equipo (queda en este navegador):
// dos pantallas que se oyen desde el mismo lugar harían eco. Con ?demo=1 no
// lee Firestore y ofrece "Simular llamado" para probar el diseño y la voz.

// Datos inventados, solo para el modo de prueba.
const EJEMPLOS: { expediente: string; paciente: string; estacionId: EstacionCEId }[] = [
  { expediente: "11431-26", paciente: "María Pilar López Gonzales", estacionId: "hematologia" },
  { expediente: "2087-19", paciente: "José Antonio Martínez de León", estacionId: "cardiologia" },
  { expediente: "45210-24", paciente: "Ana Gabriela Rivas Hernández", estacionId: "infectologia" },
  { expediente: "907-21", paciente: "Carlos Ernesto Pineda Flores", estacionId: "oncologia" },
  { expediente: "33018-25", paciente: "Rosa Elena Cruz Ventura", estacionId: "hematologia" },
  { expediente: "1502-26", paciente: "Juan Francisco Alvarado Mejía", estacionId: "cardiologia" },
];

const CLAVE_VOZ = "ce:pantalla:voz";
/** Un llamado más viejo que esto no se anuncia (p. ej. la pantalla estuvo sin red). */
const ANUNCIAR_HASTA_MS = 2 * 60_000;

function horaCorta(ms: number) {
  return new Date(ms).toLocaleTimeString("es-SV", { hour: "numeric", minute: "2-digit" });
}

export function PantallaLlamados({ demo = false }: { demo?: boolean }) {
  const [ahora, setAhora] = useState<number | null>(null);
  const [fecha, setFecha] = useState(() => hoyLocalISO());
  const [llamados, setLlamados] = useState<LlamadoPantalla[]>([]);
  const [destello, setDestello] = useState(false);
  const [sinConexion, setSinConexion] = useState(false);
  const [voz, setVoz] = useState(false);
  const [sonidoListo, setSonidoListo] = useState(false);

  const vozRef = useRef<SpeechSynthesisVoice | null>(null);
  const hablar = useRef(false);
  const vistos = useRef<Set<string> | null>(null);
  const siguiente = useRef(0);
  // Cola de anuncios: si llegan dos llamados juntos, se leen uno tras otro.
  const cola = useRef<Promise<void>>(Promise.resolve());
  const destelloT = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    hablar.current = voz && sonidoListo;
  }, [voz, sonidoListo]);

  // Reloj, cambio de día y voces.
  useEffect(() => {
    try {
      // Preferencia de este equipo (no existe en SSR).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVoz(localStorage.getItem(CLAVE_VOZ) === "1");
    } catch { /* sin almacenamiento: sin voz */ }
    const tick = () => {
      setAhora(Date.now());
      const hoy = hoyLocalISO();
      setFecha((f) => (f === hoy ? f : hoy));
    };
    tick();
    const t = setInterval(tick, 1000);
    const elegir = (v: SpeechSynthesisVoice[]) => { vozRef.current = v[0] ?? null; };
    esperarVoces().then(elegir);
    const dejar = alCambiarVoces(elegir);
    return () => { clearInterval(t); dejar(); };
  }, []);

  const anunciarEnCola = (l: LlamadoPantalla) => {
    if (!hablar.current) return;
    cola.current = cola.current.then(() => anunciarLlamado(textoLlamado(l), vozRef.current));
  };

  const destellar = () => {
    setDestello(true);
    if (destelloT.current) clearTimeout(destelloT.current);
    destelloT.current = setTimeout(() => setDestello(false), 2400);
  };

  // Llamados reales: un solo documento por día.
  useEffect(() => {
    if (demo) return;
    vistos.current = null;
    return escucharLlamados(
      fecha,
      (ultimos) => {
        setSinConexion(false);
        setLlamados(ultimos);
        // Al abrir la pantalla, lo que ya estaba no se anuncia.
        if (vistos.current === null) {
          vistos.current = new Set(ultimos.map((l) => l.id));
          return;
        }
        const nuevos = ultimos.filter((l) => !vistos.current!.has(l.id)).reverse();
        nuevos.forEach((l) => vistos.current!.add(l.id));
        if (!nuevos.length) return;
        destellar();
        nuevos.filter((l) => Date.now() - l.enMs < ANUNCIAR_HASTA_MS).forEach(anunciarEnCola);
      },
      (e) => {
        console.error("Pantalla sin acceso a los llamados", e);
        setSinConexion(true);
      },
    );
  }, [demo, fecha]);

  const simular = () => {
    setSonidoListo(true);
    hablar.current = voz;
    const ejemplo = EJEMPLOS[siguiente.current % EJEMPLOS.length];
    siguiente.current += 1;
    const ms = Date.now();
    const nuevo: LlamadoPantalla = {
      id: `demo-${ms}`,
      citaId: `demo-${ejemplo.expediente}`,
      expediente: ejemplo.expediente,
      paciente: ejemplo.paciente,
      destino: destinoEstacion(ejemplo.estacionId),
      estacionId: ejemplo.estacionId,
      enMs: ms,
    };
    setLlamados((prev) => agregarLlamado(prev, nuevo, MAX_LLAMADOS_PANTALLA));
    destellar();
    anunciarEnCola(nuevo);
  };

  // Dentro del clic: habilita el audio y despierta la voz ("Sonido activado"),
  // así el primer llamado real sale sin demora. Va por la cola para no
  // encimarse con un anuncio.
  const activarSonido = () => {
    setSonidoListo(true);
    cola.current = cola.current.then(() => prepararSonido(vozRef.current));
  };

  const alternarVoz = () => {
    const nueva = !voz;
    setVoz(nueva);
    if (nueva) activarSonido();
    else setSonidoListo(true); // el clic ya habilita el sonido en el navegador
    try { localStorage.setItem(CLAVE_VOZ, nueva ? "1" : "0"); } catch { /* sin almacenamiento */ }
  };

  const [actual, ...anteriores] = llamados;

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
              <p className="text-[clamp(1rem,1.6vw,2rem)] font-semibold uppercase tracking-[0.25em] text-cyan-100/80">
                {actual.expediente ? "Expediente" : "Turno"}
              </p>
              {actual.expediente && (
                <p className="font-heading text-[clamp(2.5rem,5.5vw,7rem)] font-bold leading-none tracking-tight">
                  {actual.expediente}
                </p>
              )}
              <p className="mt-[2.5vh] line-clamp-3 max-w-[92%] font-heading text-[clamp(2.5rem,5.6vw,7.5rem)] font-extrabold leading-[1.05] tracking-tight [text-wrap:balance]">
                {tituloLlamado(actual)}
              </p>
              <div className="mt-[4vh] rounded-[1.2vw] bg-white/10 px-[2.5vw] py-[1.6vh]">
                <p className="text-[clamp(0.9rem,1.3vw,1.6rem)] font-semibold uppercase tracking-[0.25em] text-cyan-100/80">Acercarse a</p>
                <p className="font-heading text-[clamp(1.6rem,3.2vw,4rem)] font-bold leading-tight">{actual.destino}</p>
              </div>
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
            onClick={alternarVoz}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-cyan-50/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            {voz ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
            {voz ? "Voz activada" : "Sin voz"}
          </button>
        </div>
      </footer>

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
