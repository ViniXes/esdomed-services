"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Clock, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// Logo de trazabilidad (public/1c-trazabilidad-*.svg) inline para poder
// pintarlo según el contexto: la línea y los nodos toman currentColor y el
// anillo central lleva el acento que se le pase.
function MarcaTrazabilidad({ className, ring = "#2b8ca8" }: { className?: string; ring?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <line x1="22" y1="76" x2="78" y2="24" stroke="currentColor" strokeWidth="7" />
      <circle cx="22" cy="76" r="13" fill="currentColor" />
      <circle cx="50" cy="50" r="13" fill="none" stroke={ring} strokeWidth="7" />
      <circle cx="78" cy="24" r="13" fill="currentColor" />
    </svg>
  );
}

export default function LoginPage() {
  const { login, profile, loading } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [avisoInactividad, setAvisoInactividad] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Aviso de sesión cerrada por inactividad (marca dejada por AuthContext).
  useEffect(() => {
    try {
      if (sessionStorage.getItem("esdomed:session_expired") === "inactividad") {
        // Lectura post-montaje de una API del navegador (hidratación-safe); el aviso
        // se fija aquí a propósito.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAvisoInactividad(true);
        sessionStorage.removeItem("esdomed:session_expired");
      }
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (loading || !profile) return;

    if (profile.role === "medico") router.replace("/medico");
    else if (profile.role === "psicologia") router.replace("/psicologia");
    else if (profile.role === "comite_lesiones") router.replace("/comite-lesiones");
    else if (profile.role === "enfermeria") router.replace("/enfermeria");
    else if (profile.role === "rrhh") router.replace("/rrhh");
    else if (profile.role === "transporte" || profile.role === "motorista") router.replace("/transporte");
    else if (profile.role === "isbm_tecnico" || profile.role === "isbm_supervisor" || profile.role === "isbm_jefe") router.replace("/isbm");
    else router.replace("/dashboard");
  }, [loading, profile, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setAvisoInactividad(false);
    setSubmitting(true);
    try {
      await login(identifier, password);
    } catch {
      setError("Credenciales incorrectas. Verifica tu usuario/correo y contraseña.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-100 dark:bg-slate-950 px-4">
      {/* Ambiente institucional: un resplandor suave del acento y el logo de
          trazabilidad como marca de agua en la esquina (decorativo, no compite
          con el formulario). */}
      <div className="pointer-events-none absolute -top-28 -left-28 h-80 w-80 rounded-full bg-cyan-600/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-blue-800/10 blur-3xl dark:bg-cyan-500/5" />
      <MarcaTrazabilidad
        className="pointer-events-none select-none absolute -bottom-14 -right-14 h-72 w-72 text-[#1a4e70] opacity-[0.07] dark:text-cyan-200 dark:opacity-[0.05]"
      />
      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/logo_hnes.png"
            alt="Hospital Nacional El Salvador"
            width={130}
            height={65}
            className="object-contain dark:brightness-0 dark:invert dark:opacity-90"
            priority
          />
          <div className="mt-4 flex items-center gap-2">
            <div className="h-px w-8 bg-slate-300 dark:bg-slate-700" />
            <p className="text-[11px] text-slate-500 uppercase tracking-widest">Servicios Operativos</p>
            <div className="h-px w-8 bg-slate-300 dark:bg-slate-700" />
          </div>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl shadow-black/10 dark:shadow-black/40 p-7">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1a4e70] to-[#2b8ca8] shadow-sm shadow-cyan-950/25">
              <MarcaTrazabilidad className="h-6 w-6 text-white" ring="#4fc3dd" />
            </span>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading leading-tight">Iniciar sesión</h1>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">Portal ESDOMED</p>
            </div>
          </div>

          {avisoInactividad && (
            <div className="mb-4 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 rounded-xl px-3 py-2.5">
              <Clock size={15} className="mt-0.5 flex-shrink-0" />
              <span>Tu sesión se cerró por inactividad. Por seguridad, vuelve a iniciar sesión.</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                Usuario o correo
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                className="w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent transition"
                placeholder="tu usuario o correo"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent transition"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2.5">
                <AlertTriangle size={15} className="flex-shrink-0" /> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-800 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold shadow-sm shadow-blue-900/20 disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              {submitting ? "Verificando..." : "Ingresar"}
            </button>
          </form>

          <p className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
            ¿Eres médico y no tienes cuenta?{" "}
            <Link prefetch={false} href="/registro-medico" className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
              Regístrate aquí
            </Link>
          </p>
          <p className="mt-3 text-center text-xs text-slate-500">
            ¿Necesitas un usuario SIS?{" "}
            <Link prefetch={false} href="/solicitud-usuario-sis" className="font-medium text-cyan-700 hover:underline dark:text-cyan-300">
              Solicítalo aquí
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          Hospital Nacional El Salvador · ESDOMED
        </p>
      </div>
    </div>
  );
}
