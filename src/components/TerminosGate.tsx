"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { ShieldCheck, LogOut } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  TERMINOS_VERSION,
  TERMINOS_FECHA,
  TERMINOS_INTRO,
  TERMINOS_SECCIONES,
} from "@/lib/terminos";

// Pantalla bloqueante que exige aceptar los términos y condiciones vigentes antes
// de operar el sistema. Se monta una sola vez (dentro del AuthProvider) y cubre
// todas las áreas autenticadas. No aparece en /login ni mientras carga la sesión.
export function TerminosGate() {
  const { user, profile, loading, logout } = useAuth();
  const pathname = usePathname();

  const [marcada, setMarcada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Permite cerrar la pantalla en esta sesión tras aceptar, sin esperar a que el
  // perfil se recargue desde Firestore.
  const [aceptadoEnSesion, setAceptadoEnSesion] = useState(false);

  // Al cambiar de usuario, reinicia el estado local.
  useEffect(() => {
    setMarcada(false);
    setError(null);
    setAceptadoEnSesion(false);
  }, [user?.uid]);

  const yaAcepto = profile?.terminosAceptados?.version === TERMINOS_VERSION;

  const debeMostrar =
    !loading &&
    !!user &&
    !!profile &&
    !yaAcepto &&
    !aceptadoEnSesion &&
    pathname !== "/login";

  if (!debeMostrar) return null;

  const aceptar = async () => {
    if (!user || !marcada || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      await updateDoc(doc(db, "usuarios", user.uid), {
        terminosAceptados: { version: TERMINOS_VERSION, fecha: serverTimestamp() },
      });
      setAceptadoEnSesion(true);
    } catch {
      setError("No se pudo registrar la aceptación. Intente de nuevo.");
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Encabezado */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start gap-3">
          <div className="shrink-0 mt-0.5 p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 dark:text-slate-100 font-heading text-lg">
              Términos y condiciones de uso
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Versión {TERMINOS_VERSION} · Vigente desde el {TERMINOS_FECHA}
            </p>
          </div>
        </div>

        {/* Cuerpo desplazable */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm text-slate-700 dark:text-slate-300">
          <p className="text-slate-600 dark:text-slate-400">{TERMINOS_INTRO}</p>
          {TERMINOS_SECCIONES.map((s) => (
            <section key={s.titulo} className="space-y-1.5">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">{s.titulo}</h3>
              {s.parrafos.map((p, i) => (
                <p key={i} className="leading-relaxed text-slate-600 dark:text-slate-400">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>

        {/* Pie con aceptación */}
        <div className="p-5 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={marcada}
              onChange={(e) => setMarcada(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              He leído y acepto los términos y condiciones de uso, y me comprometo a guardar la
              confidencialidad de la información a la que tenga acceso.
            </span>
          </label>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => logout()}
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              <LogOut size={15} />
              Salir
            </button>
            <button
              type="button"
              disabled={!marcada || guardando}
              onClick={aceptar}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {guardando ? "Guardando…" : "Aceptar y continuar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
