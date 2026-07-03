"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import { es } from "react-day-picker/locale";
import { Calendar, Clock, X } from "lucide-react";
import "react-day-picker/style.css";

interface DateTimeFieldProps {
  /** Valor en formato "YYYY-MM-DDTHH:mm" (o "" si vacío). */
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
  /** Días anteriores a esta fecha se deshabilitan en el calendario. */
  minDate?: Date;
  /** Días posteriores a esta fecha se deshabilitan en el calendario. */
  maxDate?: Date;
}

const pad = (n: number) => String(n).padStart(2, "0");

// "YYYY-MM-DDTHH:mm" → Date local (evita el corrimiento UTC en UTC-6).
function valueToDate(v: string): Date | undefined {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return undefined;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return isNaN(d.getTime()) ? undefined : d;
}
function dateToValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatear(d?: Date): string {
  if (!d) return "";
  const fecha = d.toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });
  return `${fecha} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Estimaciones de tamaño solo para el primer cuadro antes de medir el real.
const POP_W = 300;
const POP_H = 470;
const MARGEN = 8;

export function DateTimeField({
  value, onChange, placeholder = "Seleccionar fecha y hora", ariaLabel, clearable, disabled, className = "",
  fromYear = 2020, toYear, minDate, maxDate,
}: DateTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const mmRef = useRef<HTMLInputElement>(null);
  const selected = valueToDate(value);
  const hoy = new Date();

  // Segmentos de hora como texto mientras se edita; se confirman a `value` en
  // cada cambio válido y se normalizan (relleno con cero) al perder el foco.
  const [hh, setHh] = useState("");
  const [mm, setMm] = useState("");

  const base = () => selected ?? new Date();
  const hhNum = () => { const n = parseInt(hh, 10); return isNaN(n) ? base().getHours() : Math.min(23, n); };
  const mmNum = () => { const n = parseInt(mm, 10); return isNaN(n) ? base().getMinutes() : Math.min(59, n); };

  const commit = (dia: Date, h: number, m: number) =>
    onChange(dateToValue(new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h, m)));

  const abrirCerrar = () => {
    if (!open) {
      const b = selected ?? new Date();
      setHh(pad(b.getHours()));
      setMm(pad(b.getMinutes()));
    }
    setOpen((o) => !o);
  };

  const editarHora = (seg: "h" | "m", raw: string) => {
    const digitos = raw.replace(/\D/g, "").slice(-2);
    if (seg === "h") {
      setHh(digitos);
      if (!digitos) return;
      commit(base(), Math.min(23, parseInt(digitos, 10)), mmNum());
      // Con 2 dígitos (o un primer dígito que ya no admite decenas) pasa a minutos.
      if (digitos.length === 2 || parseInt(digitos, 10) >= 3) mmRef.current?.select();
    } else {
      setMm(digitos);
      if (!digitos) return;
      commit(base(), hhNum(), Math.min(59, parseInt(digitos, 10)));
    }
  };

  const pasoHora = (seg: "h" | "m", delta: number) => {
    let h = hhNum(), m = mmNum();
    if (seg === "h") h = (h + delta + 24) % 24; else m = (m + delta + 60) % 60;
    setHh(pad(h));
    setMm(pad(m));
    commit(base(), h, m);
  };

  const teclaHora = (seg: "h" | "m") => (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") { e.preventDefault(); pasoHora(seg, +1); }
    if (e.key === "ArrowDown") { e.preventDefault(); pasoHora(seg, -1); }
  };

  const ahora = () => {
    const n = new Date();
    setHh(pad(n.getHours()));
    setMm(pad(n.getMinutes()));
    onChange(dateToValue(n));
  };

  // Posiciona el popover (fixed) usando el tamaño REAL del panel (si ya está
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
    // Segundo pase tras pintar: ya se puede medir el tamaño real del panel.
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

  const deshabilitados = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  const segCls =
    "w-14 text-center text-lg font-semibold tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors";

  const fechaLarga = selected
    ? selected.toLocaleDateString("es-SV", { weekday: "long", day: "numeric", month: "long" })
    : "";

  return (
    <div ref={triggerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={abrirCerrar}
        aria-label={ariaLabel ?? placeholder}
        className="flex items-center gap-2 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-2 py-2 text-sm text-left text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm hover:border-slate-300 dark:hover:border-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Calendar size={15} className="text-slate-400 shrink-0" />
        <span className={`flex-1 truncate tabular-nums ${selected ? "" : "text-slate-400"}`}>
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
            disabled={deshabilitados.length ? deshabilitados : undefined}
            onSelect={(d) => { if (d) commit(d, hhNum(), mmNum()); }}
          />

          {/* Hora (formato 24 h) */}
          <div className="flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 mt-1 pt-2.5 px-1">
            <Clock size={14} className="text-slate-400 shrink-0" />
            <input
              type="text"
              inputMode="numeric"
              value={hh}
              onChange={(e) => editarHora("h", e.target.value)}
              onKeyDown={teclaHora("h")}
              onFocus={(e) => e.target.select()}
              onBlur={() => setHh(pad(hhNum()))}
              aria-label="Hora (0 a 23)"
              className={segCls}
            />
            <span className="text-lg font-semibold text-slate-400 select-none">:</span>
            <input
              ref={mmRef}
              type="text"
              inputMode="numeric"
              value={mm}
              onChange={(e) => editarHora("m", e.target.value)}
              onKeyDown={teclaHora("m")}
              onFocus={(e) => e.target.select()}
              onBlur={() => setMm(pad(mmNum()))}
              aria-label="Minutos (0 a 59)"
              className={segCls}
            />
            <button
              type="button"
              onClick={ahora}
              className="ml-auto text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              Ahora
            </button>
          </div>

          {/* Resumen en palabras: hace visible el año antes de confirmar. */}
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 mt-2.5 pt-2.5 px-1 pb-1">
            {selected ? (
              <p className="text-xs text-slate-500 leading-snug first-letter:uppercase">
                {fechaLarga} de{" "}
                <span className="font-bold text-slate-800 dark:text-slate-100">{selected.getFullYear()}</span>
                {" · "}
                <span className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                  {pad(selected.getHours())}:{pad(selected.getMinutes())}
                </span>
              </p>
            ) : (
              <p className="text-xs text-slate-400">Selecciona un día y la hora.</p>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              Listo
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
