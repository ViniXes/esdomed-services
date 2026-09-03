"use client";

import { useEffect } from "react";
import { X, Info, History, LifeBuoy, Phone, Mail } from "lucide-react";
import {
  ACERCA_NOMBRE,
  ACERCA_FECHA_LANZAMIENTO,
  ACERCA_DESCRIPCION,
  ACERCA_ORIGEN,
  ACERCA_SOPORTE_TELEFONO,
  ACERCA_SOPORTE_CORREOS,
  ACERCA_SOPORTE_EXTENSIONES,
} from "@/lib/acercaDe";

// Logo de trazabilidad (public/1c-trazabilidad-1tinta.svg) inline, en una
// sola tinta: toma currentColor para poder pintarlo sobre el hero.
function MarcaTrazabilidad({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <line x1="22" y1="76" x2="78" y2="24" stroke="currentColor" strokeWidth="7" />
      <circle cx="22" cy="76" r="13" fill="currentColor" />
      <circle cx="50" cy="50" r="13" fill="none" stroke="currentColor" strokeWidth="7" />
      <circle cx="78" cy="24" r="13" fill="currentColor" />
    </svg>
  );
}

function Seccion({ icon: Icon, titulo, children }: { icon: typeof Info; titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-blue-900 dark:text-cyan-300/90">
        <Icon size={13} strokeWidth={2.25} className="text-cyan-700 dark:text-cyan-300" />
        {titulo}
      </h3>
      {children}
    </section>
  );
}

const CONTACT_CARD =
  "flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm transition-colors hover:border-cyan-600/40 hover:bg-blue-50/70 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-cyan-500/40 dark:hover:bg-slate-800";
const CONTACT_ICON =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-cyan-300";

/**
 * Ventana "Acerca de" de la plataforma. La abre el enlace discreto al pie del
 * panel lateral, disponible para cualquier rol autenticado.
 */
export function AcercaDeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="acerca-de-titulo"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero institucional */}
        <div className="relative overflow-hidden bg-gradient-to-r from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] px-6 py-6 text-white">
          <MarcaTrazabilidad className="pointer-events-none absolute -bottom-10 -right-8 h-40 w-40 text-white opacity-10" />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
          <div className="relative flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <MarcaTrazabilidad className="h-9 w-9 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan-100/80">
                Hospital Nacional El Salvador · ESDOMED
              </p>
              <h2 id="acerca-de-titulo" className="font-heading text-xl font-bold leading-tight">
                {ACERCA_NOMBRE}
              </h2>
              <p className="mt-0.5 text-xs text-cyan-50/85">
                En funciones desde el {ACERCA_FECHA_LANZAMIENTO}
              </p>
            </div>
          </div>
        </div>

        {/* Cuerpo desplazable */}
        <div className="space-y-5 overflow-y-auto px-6 py-5 text-sm text-slate-700 dark:text-slate-300">
          <Seccion icon={Info} titulo="Qué es">
            {ACERCA_DESCRIPCION.map((p, i) => (
              <p key={i} className="leading-relaxed text-slate-600 dark:text-slate-400">
                {p}
              </p>
            ))}
          </Seccion>

          <Seccion icon={History} titulo="De dónde viene">
            <p className="leading-relaxed text-slate-600 dark:text-slate-400">{ACERCA_ORIGEN}</p>
          </Seccion>

          <Seccion icon={LifeBuoy} titulo="Soporte">
            <div className="space-y-2">
              <a href={`tel:${ACERCA_SOPORTE_TELEFONO.tel}`} className={CONTACT_CARD}>
                <span className={CONTACT_ICON}>
                  <Phone size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-900 dark:text-slate-100">
                    {ACERCA_SOPORTE_TELEFONO.nombre}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {ACERCA_SOPORTE_TELEFONO.cargo}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-blue-800 dark:text-cyan-300">
                  {ACERCA_SOPORTE_TELEFONO.telefono}
                </span>
              </a>

              {ACERCA_SOPORTE_CORREOS.map((correo) => (
                <a key={correo} href={`mailto:${correo}`} className={CONTACT_CARD}>
                  <span className={CONTACT_ICON}>
                    <Mail size={15} />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-200">
                    {correo}
                  </span>
                </a>
              ))}

              <p className="px-1 pt-1 text-xs text-slate-500 dark:text-slate-400">
                Extensiones internas de ESDOMED:{" "}
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                  {ACERCA_SOPORTE_EXTENSIONES.join(" · ")}
                </span>
              </p>
            </div>
          </Seccion>
        </div>

        {/* Pie */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-3 dark:border-slate-800">
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Estadística y Documentos Médicos · HNES
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
