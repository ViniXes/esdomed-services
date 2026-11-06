"use client";

// Piezas de formulario compartidas por los dos censos de emergencia
// (demanda espontánea y referidos). Filosofía: todo lo posible se elige
// con chips/selects — el texto libre es la excepción, no la regla.

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CheckCircle2, ChevronDown, Clock, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { CIE10Combobox } from "@/components/ui/CIE10Combobox";
import type { DiagnosticoCIE, EstadoRegistroCenso, TipoEvaluadorEmergencia } from "@/types";
import { TIPO_EVALUADOR_LABEL, claveCatalogo, type CatalogoPersonal } from "@/lib/emergencia/censos";
import type { AgregarAlCatalogo } from "@/lib/emergencia/catalogoPersonal";

export const inputCls =
  "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm disabled:opacity-50";

export const labelCls = "block text-xs font-medium text-slate-500 mb-1.5";

export function Field({ label, required, children, className = "" }: {
  label: string; required?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label className={labelCls}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

// ── Estado de digitación (derivado al guardar) ───────────────────────────────

export function EstadoRegistroBadge({ estado, faltantes }: {
  estado: EstadoRegistroCenso;
  faltantes?: string[];
}) {
  if (estado === "cerrado") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900 whitespace-nowrap">
        <CheckCircle2 size={11} /> Terminado
      </span>
    );
  }
  return (
    <span
      title={faltantes?.length ? `Falta: ${faltantes.join(", ")}` : undefined}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900 whitespace-nowrap cursor-help"
    >
      <Clock size={11} /> Falta por cerrar
    </span>
  );
}

// Resumen en vivo para el pie del formulario: qué falta para cerrar.
export function FaltantesHint({ faltantes }: { faltantes: string[] }) {
  if (faltantes.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 size={13} /> Registro completo — se guardará como <strong>Terminado</strong>.
      </p>
    );
  }
  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
      <Clock size={13} className="mt-0.5 shrink-0" />
      <span>
        Se guardará como <strong>Falta por cerrar</strong> — pendiente: {faltantes.join(", ")}.
      </span>
    </p>
  );
}

// ── Chips de selección única ─────────────────────────────────────────────────

export function ChipSelect<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; chip?: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const activo = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              activo
                ? o.chip ?? "bg-blue-800 text-white border-blue-800 dark:bg-blue-700 dark:border-blue-700 shadow-sm shadow-blue-900/20"
                : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Sí / No como par de chips.
export function SiNoChips({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <ChipSelect
      options={[{ value: "si", label: "Sí" }, { value: "no", label: "No" }]}
      value={value ? "si" : "no"}
      onChange={(v) => onChange(v === "si")}
    />
  );
}

// ── Chips multiselección (procedimientos) ────────────────────────────────────

export function ChipMulti({ options, value, onChange }: {
  options: readonly string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (o: string) =>
    onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange([])}
        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
          value.length === 0
            ? "bg-slate-700 dark:bg-slate-600 text-white border-slate-700 dark:border-slate-600"
            : "bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
        }`}
      >
        Ninguno
      </button>
      {options.map((o) => {
        const activo = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              activo
                ? "bg-blue-800 text-white border-blue-800 dark:bg-blue-700 dark:border-blue-700 shadow-sm shadow-blue-900/20"
                : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

// ── Select nativo con catálogo ───────────────────────────────────────────────

export function SelectCatalogo({ options, value, onChange, placeholder = "— Seleccionar" }: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} cursor-pointer appearance-none`}>
      <option value="">{placeholder}</option>
      {/* Un valor ya guardado sigue visible aunque no esté (o aún no cargue) en el catálogo. */}
      {value && !options.includes(value) && <option value={value}>{value}</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ── Personal que atiende: buscador sobre el catálogo vivo ────────────────────
// Busca por partes del nombre sin importar tildes ni el orden ("gomez cor").
// Lo que no está en el catálogo se agrega desde aquí y queda para todos; el tipo
// se elige al agregar y después se deriva con tipoEvaluador(). Abierto = con foco.
// La lista va en portal porque Seccion recorta su contenido (overflow-hidden).

export const TIPOS_EVALUADOR = ["staff", "medico_general", "especialidad"] as const;

const TITULO_GRUPO: Record<TipoEvaluadorEmergencia, string> = {
  staff: "Staff de emergencia",
  medico_general: "Médicos generales",
  especialidad: "Especialidades",
};

const MIN_LETRAS_AGREGAR = 3;
const LISTA_ALTO_MAX = 320;
const LISTA_ALTO_MIN = 220;
const LISTA_ANCHO_MIN = 300;
const MARGEN = 8;

type PosicionLista = { left: number; width: number; maxHeight: number; top?: number; bottom?: number };

// visualViewport descuenta el teclado en pantalla de los celulares.
function posicionLista(input: HTMLElement): PosicionLista {
  const r = input.getBoundingClientRect();
  const altoVisible = window.visualViewport?.height ?? window.innerHeight;
  const width = Math.min(Math.max(r.width, LISTA_ANCHO_MIN), window.innerWidth - MARGEN * 2);
  const left = Math.max(MARGEN, Math.min(r.left, window.innerWidth - width - MARGEN));
  const abajo = altoVisible - r.bottom - MARGEN * 2;
  const arriba = r.top - MARGEN * 2;
  if (abajo >= LISTA_ALTO_MIN || abajo >= arriba) {
    return { left, width, top: r.bottom + 6, maxHeight: Math.min(LISTA_ALTO_MAX, abajo) };
  }
  return { left, width, bottom: window.innerHeight - r.top + 6, maxHeight: Math.min(LISTA_ALTO_MAX, arriba) };
}

export function BuscadorPersonal({
  value, onChange, catalogo, tipos, onAgregar, excluir = [],
  placeholder = "Buscar nombre o especialidad…", ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  catalogo: CatalogoPersonal;
  tipos: readonly TipoEvaluadorEmergencia[]; // grupos que ofrece el campo, en orden
  onAgregar: AgregarAlCatalogo;
  excluir?: readonly string[];
  placeholder?: string;
  ariaLabel: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [cursor, setCursor] = useState(-1);
  const [posicion, setPosicion] = useState<PosicionLista | null>(null);
  const [agregando, setAgregando] = useState<TipoEvaluadorEmergencia | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const idLista = useId();

  const clave = claveCatalogo(busqueda);
  const partes = clave.split("_").filter(Boolean);
  const coincide = (o: string) => partes.every((p) => claveCatalogo(o).includes(p));
  const grupos = tipos
    .map((tipo) => ({
      tipo,
      opciones: catalogo[tipo].map((o) => o.toUpperCase()).filter((o) => !excluir.includes(o) && coincide(o)),
    }))
    .filter((g) => g.opciones.length > 0);
  const opciones = grupos.flatMap((g) => g.opciones);
  const activo = Math.min(cursor, opciones.length - 1);

  const yaExiste = TIPOS_EVALUADOR.some((t) => catalogo[t].some((o) => claveCatalogo(o) === clave));
  // Lo que coincide en una lista que este campo no ofrece: sin esto, escribir un
  // apellido de staff en "del turno" invitaría a agregar a esa persona otra vez.
  const enOtraLista = clave
    ? TIPOS_EVALUADOR.filter((t) => !tipos.includes(t)).flatMap((t) => catalogo[t].filter(coincide))
    : [];
  const puedeAgregar = clave.length >= MIN_LETRAS_AGREGAR && !yaExiste && enOtraLista.length === 0;

  useEffect(() => {
    if (!abierto) return;
    const mover = (e: Event) => {
      if (listaRef.current?.contains(e.target as Node)) return;
      if (inputRef.current) setPosicion(posicionLista(inputRef.current));
    };
    const tocarFuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!inputRef.current?.contains(t) && !listaRef.current?.contains(t)) inputRef.current?.blur();
    };
    window.addEventListener("scroll", mover, true);
    window.addEventListener("resize", mover);
    window.visualViewport?.addEventListener("resize", mover);
    document.addEventListener("pointerdown", tocarFuera);
    return () => {
      window.removeEventListener("scroll", mover, true);
      window.removeEventListener("resize", mover);
      window.visualViewport?.removeEventListener("resize", mover);
      document.removeEventListener("pointerdown", tocarFuera);
    };
  }, [abierto]);

  useEffect(() => {
    if (activo >= 0) listaRef.current?.querySelector('[data-activo="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activo]);

  const abrir = (e: React.FocusEvent<HTMLInputElement>) => {
    setPosicion(posicionLista(e.currentTarget));
    setBusqueda("");
    setCursor(-1);
    setError(null);
    setAbierto(true);
  };

  const elegir = (nombre: string) => {
    onChange(nombre);
    inputRef.current?.blur();
  };

  const agregar = async (tipo: TipoEvaluadorEmergencia) => {
    setAgregando(tipo);
    setError(null);
    try {
      elegir((await onAgregar(tipo, busqueda)).toUpperCase());
    } catch (e) {
      setError(`No se pudo agregar: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setAgregando(null);
    }
  };

  const teclas = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor(Math.min(activo + 1, opciones.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor(Math.max(activo - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (opciones[activo]) elegir(opciones[activo]);
    } else if (e.key === "Escape") {
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={abierto && activo >= 0 ? `${idLista}-${activo}` : undefined}
        autoComplete="off"
        title={value || undefined}
        value={abierto ? busqueda : value}
        placeholder={(abierto && value) || placeholder}
        onChange={(e) => { setBusqueda(e.target.value); setCursor(e.target.value.trim() ? 0 : -1); }}
        onFocus={abrir}
        onBlur={() => setAbierto(false)}
        onKeyDown={teclas}
        className={`${inputCls} pl-9 pr-8 truncate`}
      />
      {value ? (
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onChange(""); setBusqueda(""); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          aria-label={`Quitar ${value}`}
        >
          <X size={13} />
        </button>
      ) : (
        <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      )}

      {abierto && posicion && createPortal(
        <div
          ref={listaRef}
          style={{ position: "fixed", ...posicion }}
          onMouseDown={(e) => e.preventDefault()} // el foco se queda en el input
          className="z-[80] flex flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl"
        >
          <div id={idLista} role="listbox" aria-label={ariaLabel} className="min-h-0 flex-1 overflow-y-auto py-1">
            {grupos.map((g) => (
              <div key={g.tipo} role="group" aria-label={TITULO_GRUPO[g.tipo]}>
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {TITULO_GRUPO[g.tipo]}
                </p>
                {g.opciones.map((o) => {
                  const i = opciones.indexOf(o);
                  return (
                    <button
                      key={o}
                      id={`${idLista}-${i}`}
                      type="button"
                      role="option"
                      aria-selected={o === value}
                      data-activo={i === activo}
                      tabIndex={-1}
                      onClick={() => elegir(o)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-800 dark:text-slate-200 transition-colors ${
                        i === activo ? "bg-blue-50 dark:bg-blue-900/30" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span className="min-w-0">{o}</span>
                      {o === value && <Check size={14} className="shrink-0 text-blue-700 dark:text-cyan-300" />}
                    </button>
                  );
                })}
              </div>
            ))}
            {opciones.length === 0 && (
              <p className="px-3 py-3 text-xs text-slate-500">
                {enOtraLista.length > 0
                  ? `Está en otra lista y no se puede elegir en este campo: ${enOtraLista.join(", ")}.`
                  : yaExiste ? "Ya está agregado." : "Sin coincidencias."}
              </p>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
            {puedeAgregar ? (
              <>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Agregar <strong className="font-semibold break-words">{busqueda.trim().toUpperCase()}</strong> para todos como:
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {tipos.map((tipo) => (
                    <button
                      key={tipo}
                      type="button"
                      tabIndex={-1}
                      disabled={agregando !== null}
                      onClick={() => agregar(tipo)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                      {agregando === tipo ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                      {TIPO_EVALUADOR_LABEL[tipo]}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[11px] text-slate-500">¿No aparece? Escriba el nombre completo o la especialidad para agregarlo.</p>
            )}
            {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// Chip que separa visualmente quién atendió: staff, médico general o especialidad.
const ESTILO_EVALUADOR: Record<TipoEvaluadorEmergencia, { etiqueta: string; cls: string }> = {
  staff: {
    etiqueta: "Staff",
    cls: "bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-900",
  },
  medico_general: {
    etiqueta: "Méd. general",
    cls: "bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-900",
  },
  especialidad: {
    etiqueta: "Especialidad",
    cls: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  },
};

export function EvaluadorBadge({ tipo }: { tipo: TipoEvaluadorEmergencia | null | undefined }) {
  if (!tipo) return null;
  const { etiqueta, cls } = ESTILO_EVALUADOR[tipo];
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${cls}`}>
      {etiqueta}
    </span>
  );
}

// ── Diagnósticos CIE-10 (uno principal + agregables) ─────────────────────────

export function DiagnosticosEditor({ value, onChange }: {
  value: DiagnosticoCIE[];
  onChange: (v: DiagnosticoCIE[]) => void;
}) {
  const lista = value.length ? value : [{ codigo: "", descripcion: "" }];
  const set = (idx: number, d: DiagnosticoCIE) => onChange(lista.map((x, i) => (i === idx ? d : x)));
  const quitar = (idx: number) => onChange(lista.filter((_, i) => i !== idx));
  return (
    <div className="space-y-2">
      {lista.map((d, idx) => (
        <div key={idx} className="flex gap-2 items-start">
          <div className="flex-1 min-w-0">
            <CIE10Combobox value={d} onChange={(v) => set(idx, v)} />
          </div>
          {lista.length > 1 && (
            <button
              type="button"
              onClick={() => quitar(idx)}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors flex-shrink-0 mt-0.5"
              aria-label="Quitar diagnóstico"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...lista, { codigo: "", descripcion: "" }])}
        className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 font-medium"
      >
        <Plus size={12} /> Agregar otro diagnóstico
      </button>
    </div>
  );
}

// ── Médicos generales del turno: N nombres del catálogo ──────────────────────
// Se agregan uno a uno desde el buscador (que solo ofrece los que faltan) y
// quedan como chips removibles. Los nombres fuera de catálogo (registros
// viejos en texto libre) también se muestran para poder quitarlos.

export function MedicosGeneralesPicker({ value, onChange, catalogo, onAgregar }: {
  value: string[];
  onChange: (v: string[]) => void;
  catalogo: CatalogoPersonal;
  onAgregar: AgregarAlCatalogo;
}) {
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((m) => (
            <span
              key={m}
              className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg text-xs font-medium bg-cyan-50 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-900"
            >
              {m}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== m))}
                className="p-0.5 rounded text-cyan-600 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900 transition-colors"
                aria-label={`Quitar ${m}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <BuscadorPersonal
        value=""
        onChange={(m) => onChange([...value, m])}
        catalogo={catalogo}
        tipos={["medico_general", "especialidad"]}
        onAgregar={onAgregar}
        excluir={value}
        placeholder="Agregar médico general o especialidad…"
        ariaLabel="Agregar médico general o especialidad del turno"
      />
    </div>
  );
}
