"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import { es } from "react-day-picker/locale";
import { Calendar, X } from "lucide-react";
import "react-day-picker/style.css";

interface DateFieldProps {
  /** Valor en formato "YYYY-MM-DD" (o "" si vacío). */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** Permite limpiar la fecha desde el propio campo. */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  /** Año mínimo seleccionable en el desplegable (por defecto 2020). */
  fromYear?: number;
  /** Año máximo seleccionable (por defecto el año próximo). */
  toYear?: number;
  /** Si se da, bloquea los días posteriores a esta fecha (ej. no permitir futuro). */
  maxDate?: Date;
}

// "YYYY-MM-DD" → Date local a medianoche (evita el corrimiento UTC en UTC-6).
function valueToDate(v: string): Date | undefined {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function dateToValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function formatear(d?: Date): string {
  if (!d) return "";
  return d.toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });
}

// Estimaciones de tamaño solo para el primer cuadro antes de medir el real.
const POP_W = 300;
const POP_H = 360;
const MARGEN = 8;

export function DateField({
  value, onChange, placeholder = "Seleccionar fecha", ariaLabel, clearable, disabled, className = "",
  fromYear = 2020, toYear, maxDate,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const selected = valueToDate(value);
  const hoy = new Date();

  // Posiciona el popover (fixed) usando el tamaño REAL del calendario (si ya está
  // montado) para no recortar la última columna ni salirse de la pantalla.
  const reposicionar = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const popW = popRef.current?.offsetWidth || POP_W;
    const popH = popRef.current?.offsetHeight || POP_H;
    const hayEspacioAbajo = window.innerHeight - r.bottom >= popH + MARGEN;
    const top = hayEspacioAbajo || r.top < popH + MARGEN ? r.bottom + 6 : r.top - popH - 6;
    let left = r.left;
    if (left + popW > window.innerWidth - MARGEN) left = window.innerWidth - popW - MARGEN;
    setCoords({ top: Math.max(MARGEN, top), left: Math.max(MARGEN, left) });
  }, []);

  // Primer posicionamiento (estimado) al abrir.
  useLayoutEffect(() => {
    if (open) reposicionar();
  }, [open, reposicionar]);

  useEffect(() => {
    if (!open) return;
    // Segundo pase tras pintar: ya se puede medir el ancho real del calendario.
    const raf = requestAnimationFrame(reposicionar);
    const onMove = () => reposicionar();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, reposicionar]);

  return (
    <div ref={triggerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel ?? placeholder}
        className="flex items-center gap-2 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-2 py-2 text-sm text-left text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm hover:border-slate-300 dark:hover:border-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Calendar size={15} className="text-slate-400 shrink-0" />
        <span className={`flex-1 truncate ${selected ? "" : "text-slate-400"}`}>
          {selected ? formatear(selected) : placeholder}
        </span>
        {clearable && value && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Limpiar fecha"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X size={13} />
          </span>
        )}
      </button>

      {open && coords && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          style={{
            position: "fixed",
            top: coords.top,
            left: coords.left,
            width: "max-content",
            maxWidth: "calc(100vw - 16px)",
          }}
          className="z-[80] rdp-tailwind bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl text-slate-900 dark:text-slate-100 p-2"
        >
          <DayPicker
            mode="single"
            locale={es}
            selected={selected}
            defaultMonth={selected ?? hoy}
            captionLayout="dropdown"
            startMonth={new Date(fromYear, 0)}
            endMonth={new Date(toYear ?? hoy.getFullYear() + 1, 11)}
            disabled={maxDate ? { after: maxDate } : undefined}
            onSelect={(d) => { onChange(d ? dateToValue(d) : ""); setOpen(false); }}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
