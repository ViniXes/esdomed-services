"use client";

// Piezas de página compartidas por los dos censos de emergencia (demanda
// espontánea y referidos): sección institucional navy/dorado, botón primario,
// notas médicas con estampa de fecha y las dos secciones idénticas de ambos
// formularios (Momento de la atención e Identificación del paciente).

import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import type { Genero, TurnoEmergencia } from "@/types";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { TURNOS } from "@/lib/emergencia/censos";
import { ChipSelect, Field, inputCls } from "@/components/emergencia/censoUi";

export const pad = (n: number) => String(n).padStart(2, "0");
export const toDtLocal = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const BOTON_PRIMARIO =
  "flex items-center gap-2 text-sm font-semibold text-white bg-[#1c1e4d] hover:bg-[#29337c] dark:bg-[var(--color-institutional-navy)] dark:hover:bg-blue-800 ring-1 ring-[#c9a892]/40 rounded-xl disabled:opacity-50 transition-colors";

// ── Sección institucional: cabecera navy con número y acento dorado ──────────

export function Seccion({ num, titulo, icon: Icon, children }: {
  num: string;
  titulo: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-2.5 bg-[#1c1e4d] dark:bg-[var(--color-institutional-navy)] border-b-2 border-[#c9a892]">
        <span className="font-mono text-[11px] font-bold text-[#c9a892]">{num}</span>
        <Icon size={15} className="text-[#c9a892]" />
        <h2 className="text-[13px] font-bold text-white uppercase tracking-widest font-heading">
          {titulo}
        </h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

// ── Notas médicas (varias, con estampa de fecha al agregarlas) ───────────────

export type NotaLocal = { texto: string; fecha: string }; // fecha en ISO

export const formatNotaFecha = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function NotasEditor({ notas, onChange, draft, onDraftChange, placeholder }: {
  notas: NotaLocal[];
  onChange: (v: NotaLocal[]) => void;
  draft: string;                      // texto aún no agregado (lo guarda la página al enviar)
  onDraftChange: (v: string) => void;
  placeholder?: string;
}) {
  const agregar = () => {
    const texto = draft.trim().toUpperCase();
    if (!texto) return;
    onChange([...notas, { texto, fecha: new Date().toISOString() }]);
    onDraftChange("");
  };
  return (
    <>
      {notas.length > 0 && (
        <div className="space-y-2">
          {notas.map((n, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800/60 border-l-4 border-[#c9a892] rounded-r-xl px-3.5 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-mono font-semibold text-[#1c1e4d] dark:text-[#c9a892]">
                  {formatNotaFecha(n.fecha)}
                </p>
                <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words mt-0.5">
                  {n.texto}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onChange(notas.filter((_, i) => i !== idx))}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors flex-shrink-0"
                aria-label="Quitar nota"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <Field label="Nota médica (cada nota se guarda con su fecha y hora)">
        <div className="flex flex-col sm:flex-row gap-2">
          <textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value.toUpperCase())}
            rows={2}
            className={`${inputCls} resize-none flex-1`}
            placeholder={placeholder ?? "ALTA CON MEDICAMENTO / INGRESO A CAMA..."}
          />
          <button
            type="button"
            onClick={agregar}
            disabled={!draft.trim()}
            className={`${BOTON_PRIMARIO} px-4 py-2 self-start whitespace-nowrap`}
          >
            <Plus size={14} /> Agregar nota
          </button>
        </div>
      </Field>
    </>
  );
}

// ── 01 · Momento de la atención ──────────────────────────────────────────────

export function CamposMomento({ fechaHora, turno, onFechaHora, onTurno }: {
  fechaHora: string;
  turno: TurnoEmergencia;
  onFechaHora: (v: string) => void;
  onTurno: (v: TurnoEmergencia) => void;
}) {
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
      <Field label="Fecha y hora" required>
        <DateTimeField value={fechaHora} onChange={onFechaHora} maxDate={new Date()} />
      </Field>
      <Field label="Turno" required>
        <ChipSelect options={TURNOS} value={turno} onChange={onTurno} />
      </Field>
    </div>
  );
}

// ── 02 · Identificación del paciente ─────────────────────────────────────────

export function CamposIdentidad({
  expediente, nombre, edad, genero,
  onExpediente, onNombre, onEdad, onGenero,
  prellenar, buscandoId, fuentePrellenado,
}: {
  expediente: string;
  nombre: string;
  edad: string;
  genero: Genero | null;
  onExpediente: (v: string) => void;
  onNombre: (v: string) => void;
  onEdad: (v: string) => void;
  onGenero: (v: Genero) => void;
  prellenar: () => void;
  buscandoId: boolean;
  fuentePrellenado: string | null;
}) {
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,0.5fr)_minmax(0,0.5fr)] gap-4">
      <Field label="Expediente" required>
        <div className="flex gap-2">
          <input
            type="text"
            value={expediente}
            onChange={(e) => onExpediente(e.target.value.trim())}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), prellenar())}
            onBlur={() => { if (!nombre) prellenar(); }}
            placeholder="1234-26"
            className={inputCls}
          />
          <button
            type="button"
            onClick={prellenar}
            disabled={buscandoId || !expediente.trim()}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {buscandoId ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Buscar
          </button>
        </div>
        {fuentePrellenado && <p className="text-[11px] text-slate-400 mt-1">{fuentePrellenado}</p>}
      </Field>
      <Field label="Nombre del paciente" required>
        <input type="text" value={nombre} onChange={(e) => onNombre(e.target.value.toUpperCase())} className={inputCls} />
      </Field>
      <Field label="Edad (años)">
        <input type="number" min={0} max={120} value={edad} onChange={(e) => onEdad(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Sexo" required>
        <ChipSelect
          options={[{ value: "masculino", label: "M" }, { value: "femenino", label: "F" }]}
          value={genero}
          onChange={onGenero}
        />
      </Field>
    </div>
  );
}
