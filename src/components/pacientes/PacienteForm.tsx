"use client";

import { ChevronDown, IdCard, MapPin, User2, BedDouble, Stethoscope } from "lucide-react";
import type { Paciente, ResponsablePaciente, DiagnosticoCIE } from "@/types";
import { CIRCUNSTANCIA_LABEL, GENERO_LABEL } from "@/lib/pacientes/helpers";
import { useServicios } from "@/contexts/ServiciosContext";

const inputCls =
  "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed";

const selectCls =
  "w-full appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed";

const labelCls = "block text-xs font-medium text-slate-500 mb-1.5";

export type PacienteFormValue = Partial<
  Omit<Paciente, "fechaNacimiento" | "fechaIngreso" | "fechaEgreso"> & {
    fechaNacimiento?: string; // ISO yyyy-mm-dd para input[type=date]
    fechaIngreso?: string;    // ISO yyyy-mm-ddThh:mm para input[type=datetime-local]
  }
>;

interface PacienteFormProps {
  value: PacienteFormValue;
  onChange: (next: PacienteFormValue) => void;
  disabled?: boolean;
  hideIngreso?: boolean;
  /** Bloquea el campo expediente (llave de persona, no editable tras crear). */
  expedienteReadOnly?: boolean;
}

export function PacienteForm({ value, onChange, disabled, hideIngreso, expedienteReadOnly }: PacienteFormProps) {
  const set = <K extends keyof PacienteFormValue>(k: K, v: PacienteFormValue[K]) =>
    onChange({ ...value, [k]: v });

  const setResponsable = (patch: Partial<ResponsablePaciente>) =>
    onChange({
      ...value,
      responsable: { nombre: "", ...(value.responsable ?? {}), ...patch },
    });

  return (
    <div className="space-y-6">
      {/* ── Identidad ── */}
      <Seccion icon={IdCard} title="Identidad">
        <Field label="Expediente *" className="col-span-2 md:col-span-1">
          <input
            type="text"
            value={value.expediente ?? ""}
            onChange={(e) => set("expediente", e.target.value)}
            disabled={disabled || expedienteReadOnly}
            className={inputCls}
            placeholder="22-26"
          />
        </Field>
        <Field label="DUI">
          <input
            type="text"
            value={value.dui ?? ""}
            onChange={(e) => set("dui", e.target.value)}
            disabled={disabled}
            className={inputCls}
            placeholder="00000000-0"
          />
        </Field>
        <Field label="Nº de Afiliación">
          <input
            type="text"
            value={value.numeroAfiliacion ?? ""}
            onChange={(e) => set("numeroAfiliacion", e.target.value)}
            disabled={disabled}
            className={inputCls}
          />
        </Field>

        <Field label="Apellidos *" className="col-span-2 md:col-span-1">
          <input
            type="text"
            value={value.apellidos ?? ""}
            onChange={(e) => set("apellidos", e.target.value)}
            disabled={disabled}
            className={inputCls}
          />
        </Field>
        <Field label="Nombres *" className="col-span-2 md:col-span-1">
          <input
            type="text"
            value={value.nombres ?? ""}
            onChange={(e) => set("nombres", e.target.value)}
            disabled={disabled}
            className={inputCls}
          />
        </Field>

        <Field label="Fecha de nacimiento">
          <input
            type="date"
            value={value.fechaNacimiento ?? ""}
            onChange={(e) => set("fechaNacimiento", e.target.value)}
            disabled={disabled}
            className={inputCls}
          />
        </Field>
        <Field label="Género">
          <SelectWrapper>
            <select
              value={value.genero ?? ""}
              onChange={(e) => set("genero", e.target.value as Paciente["genero"])}
              disabled={disabled}
              className={selectCls}
            >
              <option value="">— Sin especificar</option>
              {(Object.keys(GENERO_LABEL) as Array<keyof typeof GENERO_LABEL>).map((k) => (
                <option key={k} value={k}>
                  {GENERO_LABEL[k]}
                </option>
              ))}
            </select>
          </SelectWrapper>
        </Field>
        <Field label="Estado familiar">
          <input
            type="text"
            value={value.estadoFamiliar ?? ""}
            onChange={(e) => set("estadoFamiliar", e.target.value)}
            disabled={disabled}
            className={inputCls}
            placeholder="Soltero(a) / Casado(a) / etc."
          />
        </Field>

        <Field label="Ocupación" className="col-span-2 md:col-span-2">
          <input
            type="text"
            value={value.ocupacion ?? ""}
            onChange={(e) => set("ocupacion", e.target.value)}
            disabled={disabled}
            className={inputCls}
          />
        </Field>
        <Field label="Nacionalidad">
          <input
            type="text"
            value={value.nacionalidad ?? ""}
            onChange={(e) => set("nacionalidad", e.target.value)}
            disabled={disabled}
            className={inputCls}
            placeholder="Salvadoreña"
          />
        </Field>
      </Seccion>

      {/* ── Domicilio ── */}
      <Seccion icon={MapPin} title="Domicilio y contacto">
        <Field label="Dirección" className="col-span-3">
          <input
            type="text"
            value={value.direccion ?? ""}
            onChange={(e) => set("direccion", e.target.value)}
            disabled={disabled}
            className={inputCls}
          />
        </Field>
        <Field label="Departamento">
          <input
            type="text"
            value={value.departamento ?? ""}
            onChange={(e) => set("departamento", e.target.value)}
            disabled={disabled}
            className={inputCls}
          />
        </Field>
        <Field label="Municipio">
          <input
            type="text"
            value={value.municipio ?? ""}
            onChange={(e) => set("municipio", e.target.value)}
            disabled={disabled}
            className={inputCls}
          />
        </Field>
        <Field label="Cantón">
          <input
            type="text"
            value={value.canton ?? ""}
            onChange={(e) => set("canton", e.target.value)}
            disabled={disabled}
            className={inputCls}
          />
        </Field>
        <Field label="Área geográfica">
          <SelectWrapper>
            <select
              value={value.area ?? ""}
              onChange={(e) => set("area", e.target.value as Paciente["area"])}
              disabled={disabled}
              className={selectCls}
            >
              <option value="">— Sin especificar</option>
              <option value="urbana">Urbana</option>
              <option value="rural">Rural</option>
            </select>
          </SelectWrapper>
        </Field>
        <Field label="Teléfono">
          <input
            type="text"
            value={value.telefono ?? ""}
            onChange={(e) => set("telefono", e.target.value)}
            disabled={disabled}
            className={inputCls}
            placeholder="0000-0000"
          />
        </Field>
        <Field label="Otros números">
          <input
            type="text"
            value={value.otrosNumeros ?? ""}
            onChange={(e) => set("otrosNumeros", e.target.value)}
            disabled={disabled}
            className={inputCls}
          />
        </Field>
      </Seccion>

      {/* ── Responsable ── */}
      <Seccion icon={User2} title="Responsable">
        <Field label="Nombre" className="col-span-2">
          <input
            type="text"
            value={value.responsable?.nombre ?? ""}
            onChange={(e) => setResponsable({ nombre: e.target.value })}
            disabled={disabled}
            className={inputCls}
          />
        </Field>
        <Field label="Parentesco">
          <input
            type="text"
            value={value.responsable?.parentesco ?? ""}
            onChange={(e) => setResponsable({ parentesco: e.target.value })}
            disabled={disabled}
            className={inputCls}
            placeholder="Hijo(a) / Esposo(a) / etc."
          />
        </Field>
        <Field label="Documento">
          <input
            type="text"
            value={value.responsable?.documento ?? ""}
            onChange={(e) => setResponsable({ documento: e.target.value })}
            disabled={disabled}
            className={inputCls}
            placeholder="DUI: 00000000-0"
          />
        </Field>
        <Field label="Teléfono">
          <input
            type="text"
            value={value.responsable?.telefono ?? ""}
            onChange={(e) => setResponsable({ telefono: e.target.value })}
            disabled={disabled}
            className={inputCls}
            placeholder="0000-0000"
          />
        </Field>
        <Field label="Dirección" className="col-span-3">
          <input
            type="text"
            value={value.responsable?.direccion ?? ""}
            onChange={(e) => setResponsable({ direccion: e.target.value })}
            disabled={disabled}
            className={inputCls}
          />
        </Field>
      </Seccion>

      {/* ── Ingreso ── */}
      {!hideIngreso && <IngresoForm value={value} onChange={onChange} disabled={disabled} />}
    </div>
  );
}

// ── Formulario de datos de ingreso (clínico, por ingreso) ───────────────────────

interface IngresoFormProps {
  value: PacienteFormValue;
  onChange: (next: PacienteFormValue) => void;
  disabled?: boolean;
}

/** Sección "Datos de ingreso" reutilizable: editor de ingreso y formulario completo. */
export function IngresoForm({ value, onChange, disabled }: IngresoFormProps) {
  const { servicios, getCamas } = useServicios();
  const set = <K extends keyof PacienteFormValue>(k: K, v: PacienteFormValue[K]) =>
    onChange({ ...value, [k]: v });

  const setDiagnostico = (patch: Partial<DiagnosticoCIE>) =>
    onChange({
      ...value,
      diagnosticoIngreso: {
        codigo: "",
        descripcion: "",
        ...(value.diagnosticoIngreso ?? {}),
        ...patch,
      },
    });

  return (
    <Seccion icon={BedDouble} title="Datos de ingreso">
      <Field label="Fecha y hora de ingreso *">
        <input
          type="datetime-local"
          value={value.fechaIngreso ?? ""}
          onChange={(e) => set("fechaIngreso", e.target.value)}
          disabled={disabled}
          className={inputCls}
        />
      </Field>
      <Field label="Circunstancia de ingreso">
        <SelectWrapper>
          <select
            value={value.circunstanciaIngreso ?? ""}
            onChange={(e) =>
              set("circunstanciaIngreso", e.target.value as Paciente["circunstanciaIngreso"])
            }
            disabled={disabled}
            className={selectCls}
          >
            <option value="">— Sin especificar</option>
            {(Object.keys(CIRCUNSTANCIA_LABEL) as Array<keyof typeof CIRCUNSTANCIA_LABEL>).map(
              (k) => (
                <option key={k} value={k}>
                  {CIRCUNSTANCIA_LABEL[k]}
                </option>
              )
            )}
          </select>
        </SelectWrapper>
      </Field>
      <Field label="Establecimiento de procedencia">
        <input
          type="text"
          value={value.establecimientoProcedencia ?? ""}
          onChange={(e) => set("establecimientoProcedencia", e.target.value)}
          disabled={disabled}
          className={inputCls}
          placeholder="Demanda espontánea / Hospital..."
        />
      </Field>

      <Field label="Servicio de ingreso *" className="col-span-2">
        <SelectWrapper>
          <select
            value={value.servicioIngreso ?? ""}
            onChange={(e) =>
              onChange({ ...value, servicioIngreso: e.target.value, camaActual: "" })
            }
            disabled={disabled}
            className={selectCls}
          >
            <option value="">— Seleccionar servicio</option>
            {servicios.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </SelectWrapper>
      </Field>
      <Field label="Cama (actual)">
        {(() => {
          const camas = value.servicioIngreso ? getCamas(value.servicioIngreso) : [];
          return camas.length > 0 ? (
            <SelectWrapper>
              <select
                value={value.camaActual ?? ""}
                onChange={(e) => set("camaActual", e.target.value)}
                disabled={disabled}
                className={selectCls}
              >
                <option value="">— Seleccionar cama</option>
                {camas.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </SelectWrapper>
          ) : (
            <input
              type="text"
              value={value.camaActual ?? ""}
              onChange={(e) => set("camaActual", e.target.value)}
              disabled={disabled || !value.servicioIngreso}
              className={inputCls}
              placeholder={!value.servicioIngreso ? "Primero selecciona el servicio" : ""}
            />
          );
        })()}
      </Field>

      <Field label="Médico que indicó el ingreso" className="col-span-3">
        <input
          type="text"
          value={value.medicoIngresoNombre ?? ""}
          onChange={(e) => set("medicoIngresoNombre", e.target.value)}
          disabled={disabled}
          className={inputCls}
          placeholder="DR. NOMBRE APELLIDOS"
        />
      </Field>

      <div className="col-span-3 pt-1">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <Stethoscope size={12} />
          Diagnóstico principal de ingreso
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Field label="CIE-10">
            <input
              type="text"
              value={value.diagnosticoIngreso?.codigo ?? ""}
              onChange={(e) => setDiagnostico({ codigo: e.target.value.toUpperCase() })}
              disabled={disabled}
              className={inputCls}
              placeholder="N18.5"
            />
          </Field>
          <Field label="Descripción" className="md:col-span-3">
            <input
              type="text"
              value={value.diagnosticoIngreso?.descripcion ?? ""}
              onChange={(e) => setDiagnostico({ descripcion: e.target.value })}
              disabled={disabled}
              className={inputCls}
              placeholder="Enfermedad renal crónica etapa 5..."
            />
          </Field>
        </div>
      </div>
    </Seccion>
  );
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function Seccion({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof IdCard;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 font-heading">
        <Icon size={15} className="text-slate-400" />
        {title}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function SelectWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <ChevronDown
        size={13}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
      />
    </div>
  );
}
