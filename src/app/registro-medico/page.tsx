"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { useServicios } from "@/contexts/ServiciosContext";
import { normalizarDui } from "@/lib/dui";

const inputCls =
  "w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition";
const labelCls = "block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide";

export default function RegistroMedicoPage() {
  const { servicios } = useServicios();

  const [nombre, setNombre] = useState("");
  const [dui, setDui] = useState("");
  const [jvpm, setJvpm] = useState("");
  const [serviciosSel, setServiciosSel] = useState<string[]>([]);
  const [serviciosOpen, setServiciosOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [exito, setExito] = useState(false);

  const toggleServicio = (servicio: string) =>
    setServiciosSel((prev) =>
      prev.includes(servicio) ? prev.filter((s) => s !== servicio) : [...prev, servicio]
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (serviciosSel.length === 0) {
      setError("Selecciona al menos un servicio.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/registro-medico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          dui,
          jvpm,
          servicios: serviciosSel,
          password,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo completar el registro.");
      }
      setExito(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 px-4 py-10">
      <div className="w-full max-w-4xl">
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
            <p className="text-[11px] text-slate-500 uppercase tracking-widest">Registro de médicos</p>
            <div className="h-px w-8 bg-slate-300 dark:bg-slate-700" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl shadow-black/10 dark:shadow-black/40 p-7 sm:p-8">
          {exito ? (
            <div className="text-center max-w-sm mx-auto">
              <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-3" />
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading mb-2">
                Registro enviado
              </h1>
              <p className="text-sm text-slate-500 mb-6">
                Tu cuenta quedó <strong>pendiente de aprobación</strong>. Una vez que el personal de
                ESDOMED la apruebe, podrás iniciar sesión con tu JVPM como usuario y la contraseña que
                elegiste.
              </p>
              <Link
                href="/login"
                className="inline-block w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
              >
                Ir a iniciar sesión
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading mb-1">
                Crear cuenta de médico
              </h1>
              <p className="text-xs text-slate-500 mb-6">
                Tu cuenta debe ser aprobada por ESDOMED antes de poder ingresar.
              </p>

              <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                <div className="sm:col-span-2 lg:col-span-6">
                  <label className={labelCls}>Nombre completo</label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value.toUpperCase())}
                    required
                    autoComplete="name"
                    className={inputCls}
                    placeholder="NOMBRE COMPLETO"
                  />
                </div>

                <div className="lg:col-span-3">
                  <label className={labelCls}>DUI</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={dui}
                    onChange={(e) => setDui(normalizarDui(e.target.value))}
                    required
                    className={inputCls}
                    placeholder="00000000-0"
                  />
                </div>

                <div className="lg:col-span-3">
                  <label className={labelCls}>JVPM (será tu usuario)</label>
                  <input
                    type="text"
                    value={jvpm}
                    onChange={(e) => setJvpm(e.target.value)}
                    required
                    autoCapitalize="none"
                    spellCheck={false}
                    className={inputCls}
                    placeholder="Ej: 12345"
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-6">
                  <label className={labelCls}>Servicios a los que estás asignado</label>
                  <button
                    type="button"
                    onClick={() => setServiciosOpen((o) => !o)}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    <span className="truncate text-left">
                      {serviciosSel.length === 0
                        ? "Seleccionar servicios..."
                        : `${serviciosSel.length} seleccionado${serviciosSel.length !== 1 ? "s" : ""}`}
                    </span>
                    <ChevronDown
                      size={15}
                      className={`flex-shrink-0 ml-2 transition-transform ${serviciosOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {serviciosOpen && (
                    <div className="mt-1 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 max-h-52 overflow-y-auto shadow-lg">
                      {servicios.map((servicio) => (
                        <label
                          key={servicio}
                          className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer text-sm text-slate-800 dark:text-slate-200"
                        >
                          <input
                            type="checkbox"
                            checked={serviciosSel.includes(servicio)}
                            onChange={() => toggleServicio(servicio)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 accent-blue-600"
                          />
                          {servicio}
                        </label>
                      ))}
                    </div>
                  )}
                  {serviciosSel.length > 0 && (
                    <p className="mt-1.5 text-[11px] text-slate-400">{serviciosSel.join(", ")}</p>
                  )}
                </div>

                <div className="lg:col-span-3">
                  <label className={labelCls}>Contraseña</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className={inputCls}
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>

                <div className="lg:col-span-3">
                  <label className={labelCls}>Repetir contraseña</label>
                  <input
                    type="password"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className={inputCls}
                    placeholder="Repite la contraseña"
                  />
                </div>

                {error && (
                  <div className="sm:col-span-2 lg:col-span-6 flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2.5">
                    <AlertTriangle size={15} className="flex-shrink-0" /> {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="sm:col-span-2 lg:col-span-6 w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  {submitting ? "Enviando..." : "Registrarme"}
                </button>

                <p className="sm:col-span-2 lg:col-span-6 text-center text-xs text-slate-500">
                  ¿Ya tienes cuenta?{" "}
                  <Link href="/login" className="text-blue-600 dark:text-blue-400 hover:underline">
                    Iniciar sesión
                  </Link>
                </p>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          Hospital Nacional El Salvador · ESDOMED
        </p>
      </div>
    </div>
  );
}
