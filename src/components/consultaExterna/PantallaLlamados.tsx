"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Megaphone, Volume2, VolumeX, WifiOff } from "lucide-react";
import { alCambiarVoces, anunciar, esperarVoces, textoLlamado, tocarAviso } from "@/lib/consultaExterna/voz";
import { escucharLlamados } from "@/lib/consultaExterna/estacionDatos";
import { agregarLlamado, MAX_LLAMADOS_PANTALLA, type LlamadoPantalla } from "@/lib/consultaExterna/circuito";
import { hoyLocalISO } from "@/lib/esdomed/expedientesProgramados";

// Pantalla de llamados (TV de la sala de espera). La página que la monta va
// fuera del layout del subsistema para ocupar la pantalla completa, sin menú.
// Es un letrero: usa el degradado institucional de los heros y se ve igual en
// modo claro y oscuro.
//
// Escucha un solo documento (consulta_externa_llamados/{hoy}) y anuncia solo
// los llamados nuevos. La voz se activa por equipo (queda en este navegador):
// dos pantallas que se oyen desde el mismo lugar harían eco. Con ?demo=1 no
// lee Firestore y ofrece "Simular llamado" para probar el diseño y la voz.

const EJEMPLOS: { codigo: string; destino: string }[] = [
  { codigo: "HE-12", destino: "Consultorio 2 de Hematología" },
  { codigo: "CA-07", destino: "Consultorio 3 de Cardiología" },
  { codigo: "IN-04", destino: "Consultorio 1 de Infectología" },
  { codigo: "ON-09", destino: "Consultorio 1 de Oncología" },
  { codigo: "HE-03", destino: "Consultorio 4 de Hematología" },
  { codigo: "CV-02", destino: "Consultorio 1 de Cirugía Cardiovascular" },
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
    cola.current = cola.current.then(async () => {
      await tocarAviso();
      await anunciar(textoLlamado(l.codigo, l.destino), vozRef.current);
    });
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
    const nuevo: LlamadoPantalla = { id: `demo-${ms}`, citaId: `demo-${ejemplo.codigo}`, codigo: ejemplo.codigo, destino: ejemplo.destino, estacionId: "cardiologia", enMs: ms };
    setLlamados((prev) => agregarLlamado(prev, nuevo, MAX_LLAMADOS_PANTALLA));
    destellar();
    anunciarEnCola(nuevo);
  };

  const alternarVoz = () => {
    const nueva = !voz;
    setVoz(nueva);
    setSonidoListo(true); // el clic ya habilita el sonido en el navegador
    try { localStorage.setItem(CLAVE_VOZ, nueva ? "1" : "0"); } catch { /* sin almacenamiento */ }
  };

  const [actual, ...anteriores] = llamados;

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] text-white">
      {/* Encabezado */}
      <header className="flex items-center justify-between gap-6 border-b border-white/10 px-[3vw] py-[2vh]">
        <div className="flex items-center gap-[1.5vw]">
          <Image src="/logo_hnes_sidebar.png" alt="Hospital Nacional El Salvador" width={160} height={160} className="h-[7vh] w-auto object-contain" priority />
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
              <p className="text-[clamp(1rem,1.6vw,2rem)] font-semibold uppercase tracking-[0.25em] text-cyan-100/80">Turno</p>
              <p className="font-heading text-[clamp(5rem,13vw,16rem)] font-extrabold leading-none tracking-tight tabular-nums">
                {actual.codigo}
              </p>
              <p className="mt-[3vh] max-w-[90%] text-[clamp(1.5rem,3.2vw,4rem)] font-semibold leading-tight">{actual.destino}</p>
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
                <li key={l.id} className="flex items-center justify-between gap-4 rounded-[1vw] bg-white/[0.07] px-[1.5vw] py-[1.6vh]">
                  <span className="font-heading text-[clamp(1.5rem,2.6vw,3rem)] font-bold tabular-nums">{l.codigo}</span>
                  <span className="min-w-0 flex-1 text-right text-[clamp(0.9rem,1.3vw,1.6rem)] leading-tight text-cyan-50/85">
                    {l.destino}
                    <span className="block text-[0.8em] text-cyan-100/50">{horaCorta(l.enMs)}</span>
                  </span>
                </li>
              ))
            )}
          </ol>
        </section>
      </main>

      <footer className="flex items-center justify-between gap-4 border-t border-white/10 px-[3vw] py-[1.6vh]">
        <p className="text-[clamp(0.9rem,1.3vw,1.6rem)] text-cyan-50/80">Tenga a mano su carné de citas y esté atento a su código.</p>
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
          onClick={() => { setSonidoListo(true); void tocarAviso(); }}
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
