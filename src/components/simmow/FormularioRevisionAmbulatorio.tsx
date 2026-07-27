"use client";

import { ArrowLeft } from "lucide-react";
import { MedicoCombobox } from "./MedicoCombobox";
import type { DatosSimmowAmbulatorio } from "@/lib/simmow/ambulatorioTypes";

interface Props {
  datos: DatosSimmowAmbulatorio;
  onChange: (patch: Partial<DatosSimmowAmbulatorio>) => void;
  onVolver: () => void;
}

const input =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm";
const label = "text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block";

function Campo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <span className={label}>{titulo}</span>
      {children}
    </div>
  );
}

/**
 * Revisión simple tipo tarjeta de un paciente de Atención Ambulatoria antes
 * de generar el código — no es la réplica visual exacta del formulario real
 * de SIMMOW (esa réplica sí aplica al flujo hospitalario, que es una sola
 * tabla compleja; acá son pocos campos sueltos).
 */
export function FormularioRevisionAmbulatorio({ datos, onChange, onVolver }: Props) {
  const v = (campo: keyof DatosSimmowAmbulatorio) => String(datos[campo] ?? "");
  const set = (campo: keyof DatosSimmowAmbulatorio) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => onChange({ [campo]: e.target.value } as Partial<DatosSimmowAmbulatorio>);

  return (
    <div className="space-y-4">
      <button
        onClick={onVolver}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        <ArrowLeft size={14} /> Volver a la lista
      </button>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Campo titulo="Expediente Clínico">
            <input className={input} value={v("expediente")} onChange={set("expediente")} />
          </Campo>
          <Campo titulo="DUI">
            <input className={input} value={v("dui")} onChange={set("dui")} />
          </Campo>
          <Campo titulo="Fecha">
            <input className={input} value={v("fecha")} onChange={set("fecha")} placeholder="DD/MM/AAAA" />
          </Campo>
        </div>

        <Campo titulo="Nombre del Paciente">
          <input className={input} value={v("paciente")} onChange={set("paciente")} />
        </Campo>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Campo titulo="Sexo">
            <select className={input} value={v("sexoValor")} onChange={set("sexoValor")}>
              <option value="">—</option>
              <option value="1">Masculino</option>
              <option value="2">Femenino</option>
              <option value="3">Intersexual</option>
            </select>
          </Campo>
          <Campo titulo="Edad (años)">
            <input className={input} value={v("edadAnios")} onChange={set("edadAnios")} />
          </Campo>
          <Campo titulo="Meses">
            <input className={input} value={v("edadMeses")} onChange={set("edadMeses")} />
          </Campo>
          <Campo titulo="Días">
            <input className={input} value={v("edadDias")} onChange={set("edadDias")} />
          </Campo>
          <Campo titulo="Área">
            <select className={input} value={v("areaValor")} onChange={set("areaValor")}>
              <option value="">—</option>
              <option value="1">Urbana</option>
              <option value="2">Rural</option>
            </select>
          </Campo>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo titulo="Departamento">
            <input className={input} value={v("departamento")} onChange={set("departamento")} />
          </Campo>
          <Campo titulo="Municipio / Distrito">
            <input className={input} value={v("municipio")} onChange={set("municipio")} />
          </Campo>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr] gap-2 items-start">
            <Campo titulo="Cód. CIE-10 (Dx Principal)">
              <input className={input} value={v("diagPrincipalCodigo")} onChange={set("diagPrincipalCodigo")} />
            </Campo>
            <Campo titulo="Diagnóstico Principal">
              <textarea className={input} rows={2} value={v("diagPrincipalTexto")} onChange={set("diagPrincipalTexto")} />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr] gap-2 items-start">
            <Campo titulo="Cód. CIE-10 (Dx Secundario)">
              <input className={input} value={v("diagSecundarioCodigo")} onChange={set("diagSecundarioCodigo")} />
            </Campo>
            <Campo titulo="Diagnóstico Secundario">
              <textarea className={input} rows={2} value={v("diagSecundarioTexto")} onChange={set("diagSecundarioTexto")} />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr] gap-2 items-start">
            <Campo titulo="Cód. CIE-10 (Causa Externa)">
              <input className={input} value={v("causaExternaCodigo")} onChange={set("causaExternaCodigo")} />
            </Campo>
            <Campo titulo="Causa Externa de Morbilidad">
              <textarea className={input} rows={2} value={v("causaExternaTexto")} onChange={set("causaExternaTexto")} />
            </Campo>
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
          <Campo titulo="Médico (Código Recurso)">
            <div className="flex gap-2">
              <MedicoCombobox
                nombre={v("medicoNombre")}
                codigo={v("medicoCodigoSimmow")}
                codigoClassName={input + " w-28 flex-shrink-0"}
                nombreClassName={input}
                onChange={(nombreNuevo, codigoNuevo) =>
                  onChange({ medicoNombre: nombreNuevo, medicoCodigoSimmow: codigoNuevo })
                }
              />
            </div>
          </Campo>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={datos.ingresoHospitalario}
              onChange={(e) => onChange({ ingresoHospitalario: e.target.checked })}
            />
            Ingreso Hospitalario
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={datos.isss} onChange={(e) => onChange({ isss: e.target.checked })} />
            Afiliación ISSS
          </label>
          {datos.isss && (
            <Campo titulo="Tipo / N° de afiliación">
              <div className="flex gap-2">
                <select className={input} value={v("tipoIsssValor")} onChange={set("tipoIsssValor")}>
                  <option value="">—</option>
                  <option value="1">Cotizante</option>
                  <option value="2">Beneficiario</option>
                </select>
                <input className={input} value={v("numeroAfiliacion")} onChange={set("numeroAfiliacion")} />
              </div>
            </Campo>
          )}
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-2">
          <Campo titulo="Referido De / Interconsulta De (texto original del SIS)">
            <input className={input} value={v("establecimientoReferidoTexto")} readOnly />
          </Campo>
          <Campo titulo="Código de establecimiento en SIMMOW (Referido De)">
            <input className={input} value={v("establecimientoReferidoCodigo")} onChange={set("establecimientoReferidoCodigo")} />
          </Campo>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo titulo="Personas privadas de libertad">
            <input className={input} value={v("privadoLibertadTexto")} onChange={set("privadoLibertadTexto")} />
          </Campo>
          <Campo titulo="Semana de amenorrea">
            <input className={input} value={v("amenorreaSemanas")} onChange={set("amenorreaSemanas")} />
          </Campo>
        </div>

        <p className="text-xs text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
          Modalidad, Tipo Atención, Especialidad, Discapacidad, Violencia, Escuela Promotora, Procedimiento Salud
          Mental, Derechohabiente Otros, Víctima DH, Referido A y UCSF/UCSFE no tienen dato de origen en los reportes
          del SIS — complételos manualmente en SIMMOW si aplican.
        </p>
      </div>
    </div>
  );
}
