"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Save, Search, X } from "lucide-react";
import { catalogoCriticoPorCampo } from "@/lib/catalogosCuidadosCriticos";
import { serviciosPorTipoMedico } from "@/lib/cuidadosCriticos";
import {
  aplicarCalculosBasicos,
  aplicarValoresPorDefectoMatriz,
  camposBloqueadosPorPaciente,
  datosAutomaticosPaciente,
  gruposMatrizPorTipo,
  VALOR_NO_REGISTRADO,
  valorComoTexto,
  type CampoMatrizCuidadosCriticos,
  type DatosMatrizCuidadosCriticos,
} from "@/lib/matrizCuidadosCriticos";
import { CIE10Combobox } from "@/components/ui/CIE10Combobox";
import type { DiagnosticoCIE, Paciente, TipoMedicoCuidadosCriticos } from "@/types";

interface Props {
  paciente: Paciente;
  tipo: TipoMedicoCuidadosCriticos;
  servicioEstancia: string;
  numeroEstancia: number;
  datosGuardados?: DatosMatrizCuidadosCriticos;
  saving: boolean;
  onSave: (datos: DatosMatrizCuidadosCriticos) => Promise<void>;
}

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-800";
const CIE10_TEXT_SEPARATOR = " - ";

function diagnosticoDesdeTexto(value: string): DiagnosticoCIE {
  const text = value.trim();
  const match = text.match(/^([A-Z][0-9][0-9](?:\.[A-Z0-9]+)?)\s+-\s+(.+)$/i);
  if (!match) return { codigo: "", descripcion: text };
  return { codigo: match[1].toUpperCase(), descripcion: match[2].trim() };
}

function textoDesdeDiagnostico(value: DiagnosticoCIE) {
  const codigo = value.codigo.trim();
  const descripcion = value.descripcion.trim();
  if (codigo && descripcion) return `${codigo}${CIE10_TEXT_SEPARATOR}${descripcion}`;
  return descripcion;
}

export function FichaMatrizCuidadosCriticos({ paciente, tipo, servicioEstancia, numeroEstancia, datosGuardados, saving, onSave }: Props) {
  const grupos = useMemo(() => gruposMatrizPorTipo(tipo), [tipo]);
  const datosAutomaticos = useMemo(() => datosAutomaticosPaciente(paciente), [paciente]);
  const [paso, setPaso] = useState(0);
  const [datos, setDatos] = useState<DatosMatrizCuidadosCriticos>(() => ({ ...datosAutomaticos, ...datosGuardados }));
  const [message, setMessage] = useState("");
  const datosCalculados = aplicarCalculosBasicos({ ...datosAutomaticos, ...datos });
  const datosParaPorcentaje = datosGuardados ? aplicarValoresPorDefectoMatriz(datosCalculados, tipo) : datosCalculados;
  const camposBloqueados = camposBloqueadosPorPaciente(paciente);

  const grupo = grupos[paso];
  const todosLosCampos = grupos.flatMap(item => item.campos);
  const campoCompleto = (campo: CampoMatrizCuidadosCriticos) => {
    const valor = valorComoTexto(datosParaPorcentaje[campo.key]).trim();
    if (valor) return true;
    const alta = valorComoTexto(datosParaPorcentaje.alta).trim();
    return alta !== "FALLECIDO" && (campo.key === "fecha_de_muerte" || campo.key === "muerte_48_horas");
  };
  const camposPendientes = todosLosCampos.filter(campo => !campoCompleto(campo));
  const completados = todosLosCampos.length - camposPendientes.length;
  const porcentaje = Math.round((completados / todosLosCampos.length) * 100);

  const guardar = async () => {
    setMessage("");
    try {
      await onSave(datosCalculados);
      setMessage(`Parte ${paso + 1} guardada correctamente.`);
    } catch {
      // La pantalla principal muestra el motivo específico del error.
    }
  };

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold font-heading text-slate-900 dark:text-slate-100">
            Registro {numeroEstancia}: {paciente.apellidos}, {paciente.nombres}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Exp. {paciente.expediente} · {servicioEstancia} · Cama {paciente.camaActual || "—"}
          </p>
        </div>
        <div className="min-w-48">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Campos completados</span>
            <span>{completados}/{todosLosCampos.length} ({porcentaje}%)</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${porcentaje}%` }} />
          </div>
          {camposPendientes.length > 0 && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Falta revisar: {camposPendientes.slice(0, 3).map(campo => campo.label).join(", ")}
              {camposPendientes.length > 3 ? ` y ${camposPendientes.length - 3} mas` : ""}.
            </p>
          )}
        </div>
      </header>

      <div className="grid gap-2 md:grid-cols-4">
        {grupos.map((item, index) => {
          const completosGrupo = item.campos.filter(campoCompleto).length;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setPaso(index)}
              className={`rounded-xl border p-3 text-left transition-colors ${paso === index ? "border-blue-500 bg-blue-50 dark:border-blue-700 dark:bg-blue-950" : "border-slate-200 hover:border-blue-300 dark:border-slate-700"}`}
            >
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{item.titulo}</span>
              <span className="mt-1 block text-xs text-slate-500">{completosGrupo}/{item.campos.length} completados</span>
            </button>
          );
        })}
      </div>

      <>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{grupo.titulo}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{grupo.descripcion}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {grupo.campos.map(campo => (
              <CampoMatriz
                key={campo.key}
                campo={campo}
                tipoMedico={tipo}
                valor={datosCalculados[campo.key]}
                bloqueado={camposBloqueados.has(campo.key)}
                destacarEgreso={Boolean(datosGuardados)}
                onChange={value => setDatos(actual => ({ ...actual, [campo.key]: value }))}
              />
            ))}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
            <button
              type="button"
              disabled={paso === 0}
              onClick={() => setPaso(actual => actual - 1)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            >
              <ChevronLeft size={16} /> Parte anterior
            </button>
            <div className="flex flex-wrap items-center gap-3">
              {message && <span className="inline-flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400"><CheckCircle2 size={16} />{message}</span>}
              <button
                type="button"
                onClick={guardar}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                <Save size={16} /> {saving ? "Guardando..." : "Guardar esta parte"}
              </button>
              <button
                type="button"
                disabled={paso === grupos.length - 1}
                onClick={() => setPaso(actual => actual + 1)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
              >
                Parte siguiente <ChevronRight size={16} />
              </button>
            </div>
          </footer>
        </>
    </section>
  );
}

function normalizarBusquedaCatalogo(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function CampoMatriz({ campo, tipoMedico, valor, bloqueado, destacarEgreso, onChange }: { campo: CampoMatrizCuidadosCriticos; tipoMedico: TipoMedicoCuidadosCriticos; valor: unknown; bloqueado?: boolean; destacarEgreso?: boolean; onChange: (value: string) => void }) {
  const text = valorComoTexto(valor);
  const [editandoNumero, setEditandoNumero] = useState(false);
  const esNumero = campo.tipo === "number";
  const campoEgreso = destacarEgreso && (campo.key === "fecha_egreso_del_servicio" || campo.key === "alta");
  const inputValue = esNumero && (!text || text === VALOR_NO_REGISTRADO)
    ? editandoNumero ? "" : "0"
    : text === VALOR_NO_REGISTRADO && (campo.tipo === "date" || campo.tipo === "time")
      ? ""
      : text;
  const selectValue = text || VALOR_NO_REGISTRADO;
  const automatico = campo.automatico || bloqueado;
  return (
    <label className={`${campo.tipo === "textarea" ? "md:col-span-2 xl:col-span-3" : ""} ${campoEgreso ? "rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-2 dark:border-emerald-900/60 dark:bg-emerald-950/20" : ""}`}>
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
        {campo.label}
        {automatico && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800">AUTOMÁTICO</span>}
      </span>
      {campo.tipo === "cie10" ? (
        <CIE10Combobox
          value={diagnosticoDesdeTexto(text)}
          disabled={automatico}
          placeholder="Buscar diagnóstico CIE-10 por nombre o código..."
          onChange={diagnostico => onChange(textoDesdeDiagnostico(diagnostico))}
        />
      ) : campo.tipo === "servicioCritico" ? (
        <ServicioCriticoCombobox
          value={text}
          tipoMedico={tipoMedico}
          disabled={automatico}
          onChange={onChange}
        />
      ) : campo.tipo === "catalogoCritico" ? (
        <OpcionesCriticasCombobox
          value={text}
          opciones={catalogoCriticoPorCampo(campo.key)}
          disabled={automatico}
          placeholder="Escribe o elige una opcion..."
          onChange={onChange}
        />
      ) : campo.tipo === "textarea" ? (
        <textarea rows={2} value={text} disabled={automatico} onChange={event => onChange(event.target.value)} className={inputCls} />
      ) : campo.tipo === "yesno" ? (
        <select value={selectValue} disabled={automatico} onChange={event => onChange(event.target.value)} className={inputCls}>
          <option value={VALOR_NO_REGISTRADO} disabled hidden>{VALOR_NO_REGISTRADO}</option>
          <option value="SI">SI</option>
          <option value="NO">NO</option>
        </select>
      ) : campo.tipo === "select" ? (
        <select value={selectValue} onChange={event => onChange(event.target.value)} disabled={automatico} className={inputCls}>
          <option value={VALOR_NO_REGISTRADO}>{VALOR_NO_REGISTRADO}</option>
          {campo.opciones?.map(opcion => <option key={opcion} value={opcion}>{opcion}</option>)}
        </select>
      ) : (
        <input
          type={esNumero ? "text" : campo.tipo}
          inputMode={esNumero ? "decimal" : undefined}
          min={esNumero ? 0 : undefined}
          step={esNumero ? "any" : undefined}
          value={inputValue}
          disabled={automatico}
          onFocus={event => {
            if (!esNumero) return;
            setEditandoNumero(true);
            event.currentTarget.select();
          }}
          onBlur={event => {
            if (!esNumero) return;
            setEditandoNumero(false);
            if (!event.currentTarget.value.trim()) onChange("0");
          }}
          onChange={event => {
            if (!esNumero) {
              onChange(event.target.value);
              return;
            }
            const value = event.target.value.replace(",", ".");
            if (/^\d*\.?\d*$/.test(value)) onChange(value);
          }}
          className={inputCls}
        />
      )}
    </label>
  );
}

function ServicioCriticoCombobox({
  value,
  tipoMedico,
  disabled,
  onChange,
}: {
  value: string;
  tipoMedico: TipoMedicoCuidadosCriticos;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const opciones = useMemo(() => serviciosPorTipoMedico(tipoMedico), [tipoMedico]);

  return (
    <OpcionesCriticasCombobox
      value={value}
      opciones={opciones}
      disabled={disabled}
      placeholder="Escribe o elige la unidad UCI / UCIN..."
      emptyText={`Sin coincidencias. Elige una unidad asignada a ${tipoMedico === "uci" ? "Medico UCI" : "Medico UCIN"}.`}
      onChange={onChange}
    />
  );
}

function OpcionesCriticasCombobox({
  value,
  opciones,
  disabled,
  placeholder,
  emptyText = "Sin coincidencias.",
  onChange,
}: {
  value: string;
  opciones: string[];
  disabled?: boolean;
  placeholder: string;
  emptyText?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);
  const term = value === VALOR_NO_REGISTRADO ? "" : normalizarBusquedaCatalogo(value);
  const resultados = term
    ? opciones.filter(opcion => normalizarBusquedaCatalogo(opcion).includes(term))
    : opciones;
  const hasValue = Boolean(value);

  useEffect(() => {
    if (!open) return;
    const activeOption = listRef.current?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`);
    activeOption?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const seleccionar = (opcion: string) => {
    onChange(opcion);
    setOpen(false);
  };

  const moverSeleccion = (direccion: 1 | -1) => {
    if (resultados.length === 0) return;
    setActiveIndex(index => (index + direccion + resultados.length) % resultados.length);
  };

  return (
    <div className="relative">
      <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => {
          setActiveIndex(0);
          setOpen(true);
        }}
        onChange={event => {
          onChange(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={event => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            moverSeleccion(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            moverSeleccion(-1);
          } else if (event.key === "Enter" && open && resultados[activeIndex]) {
            event.preventDefault();
            seleccionar(resultados[activeIndex]);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          }
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className={`${inputCls} pl-9 ${hasValue && !disabled ? "pr-9" : ""}`}
      />
      {hasValue && !disabled && (
        <button
          type="button"
          onMouseDown={event => {
            event.preventDefault();
            onChange("");
            setActiveIndex(0);
            setOpen(true);
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          aria-label="Limpiar campo"
        >
          <X size={13} />
        </button>
      )}
      {open && !disabled && (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          {resultados.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-400">{emptyText}</div>
          ) : (
            <ul ref={listRef} className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {resultados.map((opcion, index) => (
                <li key={opcion}>
                  <button
                    type="button"
                    data-option-index={index}
                    onMouseDown={() => seleccionar(opcion)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`w-full px-3 py-2.5 text-left text-sm leading-snug text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800 ${
                      index === activeIndex ? "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200" : ""
                    }`}
                  >
                    {opcion}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
