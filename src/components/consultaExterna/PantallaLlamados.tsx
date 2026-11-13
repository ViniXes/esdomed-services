"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Megaphone, Volume2 } from "lucide-react";
import { alCambiarVoces, anunciar, esperarVoces, textoLlamado, tocarAviso } from "@/lib/consultaExterna/voz";

// Pantalla de llamados (TV de la sala de espera). La página que la monta va
// fuera del layout del subsistema para ocupar la pantalla completa, sin menú.
// Es un letrero: usa el degradado institucional de los heros y se ve igual en
// modo claro y oscuro.
//
// Por ahora funciona en MODO DE PRUEBA: "Simular llamado" genera llamados de
// ejemplo para escuchar la voz y ver el diseño en la TV. Cuando exista la
// estación, escuchará un único documento con los últimos llamados.

interface Llamado {
  id: number;
  codigo: string;
  destino: string;
  hora: string;
}

const EJEMPLOS: { codigo: string; destino: string }[] = [
  { codigo: "HE-12", destino: "Preconsulta de Hematología" },
  { codigo: "CA-07", destino: "Consultorio 3 de Cardiología" },
  { codigo: "IN-04", destino: "Preconsulta de Infectología" },
  { codigo: "ON-09", destino: "Consultorio 1 de Oncología" },
  { codigo: "HE-03", destino: "Consultorio 4 de Hematología" },
  { codigo: "CA-15", destino: "Preconsulta de Cardiología" },
];

const MAX_HISTORIAL = 6;

function horaCorta(d: Date) {
  return d.toLocaleTimeString("es-SV", { hour: "numeric", minute: "2-digit" });
}

export function PantallaLlamados() {
  const [ahora, setAhora] = useState<Date | null>(null);
  const [llamados, setLlamados] = useState<Llamado[]>([]);
  const [destello, setDestello] = useState(false);
  const voz = useRef<SpeechSynthesisVoice | null>(null);
  const siguiente = useRef(0);
  // Cola de anuncios: si llegan dos llamados juntos, se leen uno tras otro.
  const cola = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const tick = () => setAhora(new Date());
    tick();
    const t = setInterval(tick, 1000);
    const elegir = (v: SpeechSynthesisVoice[]) => { voz.current = v[0] ?? null; };
    esperarVoces().then(elegir);
    const dejar = alCambiarVoces(elegir);
    return () => { clearInterval(t); dejar(); };
  }, []);

  const anunciarEnCola = (l: Llamado) => {
    cola.current = cola.current.then(async () => {
      await tocarAviso();
      await anunciar(textoLlamado(l.codigo, l.destino), voz.current);
    });
  };

  const simular = () => {
    const ejemplo = EJEMPLOS[siguiente.current % EJEMPLOS.length];
    siguiente.current += 1;
    const nuevo: Llamado = { id: Date.now(), ...ejemplo, hora: horaCorta(new Date()) };
    setLlamados((prev) => [nuevo, ...prev].slice(0, MAX_HISTORIAL + 1));
    setDestello(true);
    setTimeout(() => setDestello(false), 2400);
    anunciarEnCola(nuevo);
  };

  const [actual, ...anteriores] = llamados;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] text-white">
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
              anteriores.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-4 rounded-[1vw] bg-white/[0.07] px-[1.5vw] py-[1.6vh]">
                  <span className="font-heading text-[clamp(1.5rem,2.6vw,3rem)] font-bold tabular-nums">{l.codigo}</span>
                  <span className="min-w-0 flex-1 text-right text-[clamp(0.9rem,1.3vw,1.6rem)] leading-tight text-cyan-50/85">
                    {l.destino}
                    <span className="block text-[0.8em] text-cyan-100/50">{l.hora}</span>
                  </span>
                </li>
              ))
            )}
          </ol>
        </section>
      </main>

      <footer className="flex items-center justify-between gap-4 border-t border-white/10 px-[3vw] py-[1.6vh]">
        <p className="text-[clamp(0.9rem,1.3vw,1.6rem)] text-cyan-50/80">Tenga a mano su carné de citas y esté atento a su código.</p>
        {/* Modo de prueba: el clic también habilita el sonido en el navegador. */}
        <button
          type="button"
          onClick={simular}
          className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20"
        >
          <Volume2 size={16} aria-hidden="true" />
          Simular llamado (prueba)
        </button>
      </footer>
    </div>
  );
}
