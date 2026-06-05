"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Info, Save, Table2 } from "lucide-react";
import {
  aplicarCalculosBasicos,
  camposBloqueadosPorPaciente,
  datosAutomaticosPaciente,
  gruposMatrizPorTipo,
  valorComoTexto,
  type CampoMatrizCuidadosCriticos,
  type DatosMatrizCuidadosCriticos,
} from "@/lib/matrizCuidadosCriticos";
import type { Paciente, TipoMedicoCuidadosCriticos } from "@/types";
import { LienzoMatrizCuidadosCriticos } from "./LienzoMatrizCuidadosCriticos";

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

export function FichaMatrizCuidadosCriticos({ paciente, tipo, servicioEstancia, numeroEstancia, datosGuardados, saving, onSave }: Props) {
  const grupos = useMemo(() => gruposMatrizPorTipo(tipo), [tipo]);
  const [paso, setPaso] = useState(0);
  const [datos, setDatos] = useState<DatosMatrizCuidadosCriticos>(() => ({ ...datosGuardados, ...datosAutomaticosPaciente(paciente) }));
  const [message, setMessage] = useState("");
  const [mostrarLienzo, setMostrarLienzo] = useState(false);
  const datosCalculados = aplicarCalculosBasicos({ ...datos, ...datosAutomaticosPaciente(paciente) });
  const camposBloqueados = camposBloqueadosPorPaciente(paciente);

  const grupo = grupos[paso];
  const todosLosCampos = grupos.flatMap(item => item.campos);
  const completados = todosLosCampos.filter(campo => valorComoTexto(datosCalculados[campo.key]).trim() !== "").length;
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
            Estancia {numeroEstancia}: {paciente.apellidos}, {paciente.nombres}
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
        </div>
      </header>

      <div className="grid gap-2 md:grid-cols-4">
        {grupos.map((item, index) => {
          const completosGrupo = item.campos.filter(campo => valorComoTexto(datosCalculados[campo.key]).trim() !== "").length;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setPaso(index);
                setMostrarLienzo(false);
              }}
              className={`rounded-xl border p-3 text-left transition-colors ${paso === index && !mostrarLienzo ? "border-blue-500 bg-blue-50 dark:border-blue-700 dark:bg-blue-950" : "border-slate-200 hover:border-blue-300 dark:border-slate-700"}`}
            >
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{item.titulo}</span>
              <span className="mt-1 block text-xs text-slate-500">{completosGrupo}/{item.campos.length} completados</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setMostrarLienzo(value => !value)}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300"
      >
        <Table2 size={16} />
        {mostrarLienzo ? "Volver al formulario" : "Revisar lienzo completo"}
      </button>

      {mostrarLienzo ? (
        <div className="space-y-3">
          <div className="flex gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
            <Info size={16} className="mt-0.5 shrink-0" />
            Esta vista conserva el orden y los nombres de la matriz compartida. Desplázate horizontalmente para revisarla.
          </div>
          <LienzoMatrizCuidadosCriticos tipo={tipo} datos={datosCalculados} />
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
            <h3 className="font-bold text-slate-900 dark:text-slate-100">{grupo.titulo}</h3>
            <p className="mt-1 text-sm text-slate-500">{grupo.descripcion}</p>
            <p className="mt-2 flex items-start gap-2 text-xs text-slate-500">
              <Info size={14} className="mt-0.5 shrink-0 text-blue-500" />
              Registra únicamente información comprobada. Deja vacío lo que todavía no corresponda o no esté confirmado.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {grupo.campos.map(campo => (
              <CampoMatriz
                key={campo.key}
                campo={campo}
                valor={datosCalculados[campo.key]}
                bloqueado={camposBloqueados.has(campo.key)}
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
      )}
    </section>
  );
}

function CampoMatriz({ campo, valor, bloqueado, onChange }: { campo: CampoMatrizCuidadosCriticos; valor: unknown; bloqueado?: boolean; onChange: (value: string) => void }) {
  const text = valorComoTexto(valor);
  const automatico = campo.automatico || bloqueado;
  return (
    <label className={campo.tipo === "textarea" ? "md:col-span-2 xl:col-span-3" : ""}>
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
        {campo.label}
        {automatico && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800">AUTOMÁTICO</span>}
      </span>
      {campo.tipo === "textarea" ? (
        <textarea rows={2} value={text} disabled={automatico} onChange={event => onChange(event.target.value)} className={inputCls} />
      ) : campo.tipo === "yesno" ? (
        <select value={text} disabled={automatico} onChange={event => onChange(event.target.value)} className={inputCls}>
          <option value="">Pendiente / no registrado</option>
          <option value="SI">SI</option>
          <option value="NO">NO</option>
        </select>
      ) : campo.tipo === "select" ? (
        <select value={text} onChange={event => onChange(event.target.value)} disabled={automatico} className={inputCls}>
          <option value="">Seleccione...</option>
          {campo.opciones?.map(opcion => <option key={opcion} value={opcion}>{opcion}</option>)}
        </select>
      ) : (
        <input
          type={campo.tipo}
          min={campo.tipo === "number" ? 0 : undefined}
          step={campo.tipo === "number" ? "any" : undefined}
          value={text}
          disabled={automatico}
          onChange={event => onChange(event.target.value)}
          className={inputCls}
        />
      )}
    </label>
  );
}
