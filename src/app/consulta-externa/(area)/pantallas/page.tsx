"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Play, Tv, Volume2 } from "lucide-react";
import { alCambiarVoces, anunciarLlamado, esperarVoces, textoLlamado, vozDisponible } from "@/lib/consultaExterna/voz";

const TEXTO_EJEMPLO = textoLlamado("HE-12", "consultorio 4 de Hematología");

export default function PantallasPage() {
  const [voces, setVoces] = useState<SpeechSynthesisVoice[]>([]);
  const [cargando, setCargando] = useState(true);
  const [vozNombre, setVozNombre] = useState("");
  const [texto, setTexto] = useState(TEXTO_EJEMPLO);
  const [velocidad, setVelocidad] = useState(0.9);
  const [sonando, setSonando] = useState(false);

  useEffect(() => {
    let vivo = true;
    // Conserva la voz elegida si sigue en la lista; si no, la más recomendable.
    const actualizar = (v: SpeechSynthesisVoice[]) => {
      if (!vivo) return;
      setVoces(v);
      setVozNombre((previa) => (v.some((x) => x.name === previa) ? previa : v[0]?.name ?? ""));
      setCargando(false);
    };
    esperarVoces().then(actualizar);
    const dejar = alCambiarVoces(actualizar);
    return () => { vivo = false; dejar(); };
  }, []);

  const probar = async () => {
    setSonando(true);
    try {
      await anunciarLlamado(texto, voces.find((v) => v.name === vozNombre) ?? null, velocidad);
    } finally {
      setSonando(false);
    }
  };

  const sinVoz = !cargando && (!vozDisponible() || voces.length === 0);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-900">
          <Tv size={17} className="text-blue-600 dark:text-cyan-300" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Pantallas de llamados</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Todas las pantallas muestran todos los llamados de la consulta</p>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-6">
        <h2 className="font-heading text-base font-bold text-slate-900 dark:text-slate-100">Abrir una pantalla</h2>
        <ol className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <li>1. En la computadora conectada a la TV, inicie sesión y abra la pantalla; póngala en pantalla completa con F11.</li>
          <li>
            2. La voz se activa <strong>en cada equipo</strong> con el botón discreto «Sin voz / Voz activada» al pie de la pantalla, y
            queda guardada en ese navegador. Actívela en una sola pantalla por zona: dos que se oyen desde el mismo lugar hacen eco.
          </li>
          <li>3. Con la voz activada, el navegador pide un toque en la pantalla cada vez que se abre.</li>
        </ol>
        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href="/consulta-externa/pantalla"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 dark:bg-cyan-600 dark:hover:bg-cyan-500"
          >
            <ExternalLink size={16} aria-hidden="true" />
            Abrir la pantalla
          </a>
          <a
            href="/consulta-externa/pantalla?demo=1"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ExternalLink size={16} aria-hidden="true" />
            Modo de prueba (llamados simulados)
          </a>
        </div>
      </section>

      <section>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-6">
          <div className="flex items-center gap-2">
            <Volume2 size={18} className="text-blue-600 dark:text-cyan-300" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold text-slate-900 dark:text-slate-100">Prueba de voz en este equipo</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Escuche cómo sonará un llamado con las voces que trae esta computadora. Haga la prueba en la que irá conectada a la TV.
          </p>

          {cargando ? (
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Buscando voces en español…</p>
          ) : sinVoz ? (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Este navegador no tiene voces en español. Pruebe con Microsoft Edge en Windows, que trae voces naturales en español.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Voz</span>
                <select
                  value={vozNombre}
                  onChange={(e) => setVozNombre(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {voces.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.lang}){v.localService ? "" : " · en línea"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block md:w-48">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Velocidad · {velocidad.toFixed(2)}
                </span>
                <input
                  type="range"
                  min={0.6}
                  max={1.2}
                  step={0.05}
                  value={velocidad}
                  onChange={(e) => setVelocidad(Number(e.target.value))}
                  className="mt-3 w-full accent-blue-600 dark:accent-cyan-400"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Texto del llamado</span>
                <input
                  type="text"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={probar}
                  disabled={sonando || !texto.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-600 dark:hover:bg-cyan-500"
                >
                  <Play size={16} aria-hidden="true" />
                  {sonando ? "Sonando…" : "Probar llamado"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
