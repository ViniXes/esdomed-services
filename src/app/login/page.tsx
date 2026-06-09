"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const { login, profile, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !profile) return;

    if (profile.role === "medico") router.replace("/medico");
    else if (profile.role === "psicologia") router.replace("/psicologia");
    else if (profile.role === "enfermeria") router.replace("/enfermeria");
    else if (profile.role === "rrhh") router.replace("/rrhh");
    else if (profile.role === "asistente_esdomed") router.replace("/esdomed-horarios");
    else router.replace("/dashboard");
  }, [loading, profile, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
    } catch {
      setError("Credenciales incorrectas. Verifica tu correo y contraseña.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 px-4">
      {/* Ambient glow removed for cleaner dark mode */}      <div className="w-full max-w-sm relative">
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
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading mb-1">Iniciar sesión</h1>
          <p className="text-xs text-slate-500 mb-6">Portal ESDOMED</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="usuario@hospital.com"
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
                className="w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2.5">
                <span>⚠</span> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              {submitting ? "Verificando..." : "Ingresar"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          Hospital Nacional El Salvador · ESDOMED
        </p>
      </div>
    </div>
  );
}
