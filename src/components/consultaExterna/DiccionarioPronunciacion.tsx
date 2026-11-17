"use client";

import { useState } from "react";
import { AlertTriangle, BookA, Loader2, Play } from "lucide-react";
import { anunciar, textoLlamado } from "@/lib/consultaExterna/voz";
import { clavePalabra, palabraValida, type ReglaPronunciacion } from "@/lib/consultaExterna/pronunciacion";
import { guardarReglaPronunciacion, quitarReglaPronunciacion } from "@/lib/consultaExterna/pronunciacionDatos";

// Editor del diccionario de pronunciación (configuracion/pronunciacion_ce):
// "Jennifer" se lee "Yénifer". Aplica a todas las pantallas al instante; la
// pantalla sigue mostrando el nombre como está escrito.

const campo =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
const etiqueta = "text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400";
const btnSecundario =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";
const btnEnlace =
  "rounded px-1.5 py-1 text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline disabled:opacity-60 dark:text-slate-400 dark:hover:text-white";

/** Se prueba dentro de un llamado completo: el contexto cambia cómo lo dice la voz. */
const llamadoDePrueba = (nombre: string) =>
  textoLlamado({ expediente: "1234-26", paciente: `${nombre} Pérez`, destino: "Estación Cardiología" });

interface Props {
  reglas: ReglaPronunciacion[];
  voz: SpeechSynthesisVoice | null;
  velocidad: number;
  porNombre: string;
}

export function DiccionarioPronunciacion({ reglas, voz, velocidad, porNombre }: Props) {
  const [escrito, setEscrito] = useState("");
  const [leido, setLeido] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [sonando, setSonando] = useState(false);
  const [error, setError] = useState("");

  const valida = palabraValida(escrito) && leido.trim().length > 0;
  const existente = reglas.find((r) => clavePalabra(r.escrito) === clavePalabra(escrito));

  const escuchar = async (nombre: string) => {
    if (!nombre.trim() || sonando) return;
    setSonando(true);
    try {
      await anunciar(llamadoDePrueba(nombre.trim()), voz, velocidad);
    } finally {
      setSonando(false);
    }
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valida || guardando) return;
    setError("");
    setGuardando(true);
    try {
      await guardarReglaPronunciacion({ escrito: escrito.trim(), leido }, porNombre);
      setEscrito("");
      setLeido("");
    } catch (err) {
      console.error("No se pudo guardar la palabra", err);
      setError("No se pudo guardar. Revise la conexión; si persiste, pida al administrador que la agregue.");
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async (r: ReglaPronunciacion) => {
    setError("");
    setOcupada(r.escrito);
    try {
      await quitarReglaPronunciacion(r.escrito, porNombre);
    } catch (err) {
      console.error("No se pudo quitar la palabra", err);
      setError("No se pudo quitar. Revise la conexión e intente de nuevo.");
    } finally {
      setOcupada(null);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-6">
      <div className="flex items-center gap-2">
        <BookA size={18} className="text-blue-600 dark:text-cyan-300" aria-hidden="true" />
        <h2 className="font-heading text-base font-bold text-slate-900 dark:text-slate-100">Pronunciación de nombres</h2>
      </div>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Las voces naturales dicen en inglés algunos nombres de origen inglés (Kevin, Jennifer, Walter…). Escriba cómo deben sonar,
        a la española. Solo cambia lo que se lee: la pantalla sigue mostrando el nombre como está escrito. Aplica a todas las
        pantallas.
      </p>

      <form onSubmit={guardar} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block">
          <span className={etiqueta}>Se escribe</span>
          <input value={escrito} onChange={(e) => setEscrito(e.target.value.replace(/\s/g, ""))} placeholder="Jennifer" maxLength={30} autoComplete="off" className={campo} />
        </label>
        <label className="block">
          <span className={etiqueta}>Se lee como</span>
          <input value={leido} onChange={(e) => setLeido(e.target.value)} placeholder="Yénifer" maxLength={40} autoComplete="off" className={campo} />
        </label>
        <button
          type="submit"
          disabled={!valida || guardando}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-600 dark:hover:bg-cyan-500"
        >
          {guardando && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
          {existente ? "Cambiar" : "Agregar"}
        </button>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
          <button type="button" onClick={() => escuchar(escrito)} disabled={!escrito.trim() || sonando} className={btnSecundario}>
            <Play size={12} aria-hidden="true" />
            Escuchar como está escrito
          </button>
          <button type="button" onClick={() => escuchar(leido)} disabled={!leido.trim() || sonando} className={btnSecundario}>
            <Play size={12} aria-hidden="true" />
            Escuchar corregido
          </button>
          {escrito && !palabraValida(escrito) && (
            <span className="text-xs text-amber-700 dark:text-amber-300">Una sola palabra, sin números ni signos.</span>
          )}
          {existente && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Ya está en el diccionario como «{existente.leido}»: se cambiará.
            </span>
          )}
        </div>
      </form>

      {error && (
        <p className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {reglas.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Aún no hay palabras en el diccionario.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {reglas.map((r) => (
            <li key={r.escrito} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
              <p className="min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-100">
                <strong>{r.escrito}</strong>
                <span className="mx-2 text-slate-400" aria-hidden="true">→</span>
                <span className="sr-only"> se lee </span>
                {r.leido}
              </p>
              <button type="button" onClick={() => escuchar(r.leido)} disabled={sonando} className={btnSecundario}>
                <Play size={12} aria-hidden="true" />
                Escuchar
              </button>
              <button type="button" onClick={() => { setEscrito(r.escrito); setLeido(r.leido); }} className={btnEnlace}>
                Editar
              </button>
              <button type="button" onClick={() => quitar(r)} disabled={ocupada === r.escrito} className={btnEnlace}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
