"use client";

import { useEffect, useState, type FormEvent } from "react";
import { UserRound } from "lucide-react";

// La cuenta de una estación es compartida: cada acción guarda el nombre de
// quien atiende. Se pide al entrar y se vuelve a pedir cada día (cambia el
// turno); queda en este navegador.

const clave = (uid: string) => `ce:atiende:${uid}`;

function leer(uid: string, hoy: string): string {
  try {
    const v = JSON.parse(localStorage.getItem(clave(uid)) ?? "null") as { nombre?: string; fecha?: string } | null;
    return v?.fecha === hoy && v.nombre ? v.nombre : "";
  } catch {
    return "";
  }
}

/** Nombre de quien atiende hoy en este navegador ("" si aún no lo dijo). */
export function useQuienAtiende(uid: string | undefined, hoy: string) {
  const [nombre, setNombre] = useState<string | null>(null);
  useEffect(() => {
    // Lectura post-montaje de localStorage (no existe en SSR).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNombre(uid ? leer(uid, hoy) : "");
  }, [uid, hoy]);
  const guardar = (n: string) => {
    if (!uid) return;
    try {
      localStorage.setItem(clave(uid), JSON.stringify({ nombre: n, fecha: hoy }));
    } catch {
      /* sin almacenamiento: vale para esta sesión */
    }
    setNombre(n);
  };
  return { nombre, guardar, cambiar: () => setNombre("") };
}

export function PedirQuienAtiende({ estacion, onListo }: { estacion: string; onListo: (nombre: string) => void }) {
  const [valor, setValor] = useState("");
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const n = valor.replace(/\s+/g, " ").trim();
    if (n.length >= 3) onListo(n);
  };
  return (
    <div className="mx-auto max-w-md p-4 md:p-6">
      <form onSubmit={enviar} className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-cyan-300">
          <UserRound size={20} aria-hidden="true" />
        </div>
        <h1 className="mt-4 font-heading text-lg font-bold text-slate-900 dark:text-slate-100">¿Quién atiende la estación?</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Estación {estacion}. Su nombre queda en cada llegada y llamado que registre hoy.
        </p>
        <label className="mt-5 block">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Nombre completo</span>
          <input
            autoFocus
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Ej. Ana María López"
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>
        <button
          type="submit"
          disabled={valor.trim().length < 3}
          className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-600 dark:hover:bg-cyan-500"
        >
          Comenzar
        </button>
      </form>
    </div>
  );
}
