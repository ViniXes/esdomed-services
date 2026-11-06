"use client";

import { ArrowLeft } from "lucide-react";
import { MedicoCombobox } from "./MedicoCombobox";
import type { DatosSimmowConsultaExterna } from "@/lib/simmow/consultaExternaTypes";
import { campoEdadSimmow } from "@/lib/simmow/consultaExternaGeneradorScript";
import {
  OP_AREA,
  OP_CONTROL,
  OP_DEPARTAMENTO,
  OP_DERECHOHABIENTE_OTROS,
  OP_DETECCION_CANCER,
  OP_DISCAPACIDAD,
  OP_ESPECIALISTA,
  OP_EVALUACION_INFANTIL,
  OP_IMC,
  OP_INSCRIPCION,
  OP_LACTANCIA,
  OP_PESO_EDAD,
  OP_PESO_TALLA,
  OP_PF_IN_CON,
  OP_PF_METODO,
  OP_PRIVADO_LIBERTAD,
  OP_PROC_SALUD_MENTAL,
  OP_REF_RADIO,
  OP_SEXO,
  OP_TABAQUISMO,
  OP_TALLA_EDAD,
  OP_TIPO_CONSULTA,
  OP_TIPO_ISSS,
  OP_VICTIMA_DH,
  OP_VIOLENCIA_AMBITO,
  OP_VIOLENCIA_CONDICION,
  type OpcionSimmow,
} from "@/lib/simmow/consultaExternaOpciones";

interface Props {
  datos: DatosSimmowConsultaExterna;
  onChange: (patch: Partial<DatosSimmowConsultaExterna>) => void;
  onVolver: () => void;
}

const INPUT =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-800 dark:text-slate-100";

type CampoTexto = {
  [K in keyof DatosSimmowConsultaExterna]: DatosSimmowConsultaExterna[K] extends string ? K : never;
}[keyof DatosSimmowConsultaExterna];
type CampoBool = {
  [K in keyof DatosSimmowConsultaExterna]: DatosSimmowConsultaExterna[K] extends boolean ? K : never;
}[keyof DatosSimmowConsultaExterna];

function Seccion({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-1">{titulo}</h3>
      {nota && <p className="text-xs text-slate-500 mb-3">{nota}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">{children}</div>
    </section>
  );
}

function Campo({ etiqueta, ancho, children }: { etiqueta: string; ancho?: "doble" | "triple"; children: React.ReactNode }) {
  const span = ancho === "triple" ? "lg:col-span-3 sm:col-span-2" : ancho === "doble" ? "sm:col-span-2" : "";
  return (
    <label className={`block ${span}`}>
      <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{etiqueta}</span>
      {children}
    </label>
  );
}

/**
 * Formulario de revisión de Consulta Externa. Agrupa los campos por sección del
 * formulario de SIMMOW (conrec.php) y deja corregir cualquier dato antes de
 * copiar el código. Los selects usan las opciones reales de SIMMOW: su value es
 * el mismo número que trae el censo.
 */
export function FormularioRevisionConsultaExterna({ datos, onChange, onVolver }: Props) {
  const texto = (campo: CampoTexto, etiqueta: string, ancho?: "doble" | "triple", maxLength?: number) => (
    <Campo etiqueta={etiqueta} ancho={ancho}>
      <input
        className={INPUT}
        value={datos[campo]}
        maxLength={maxLength}
        onChange={(e) => onChange({ [campo]: e.target.value } as Partial<DatosSimmowConsultaExterna>)}
      />
    </Campo>
  );

  const select = (campo: CampoTexto, etiqueta: string, opciones: OpcionSimmow[], ancho?: "doble" | "triple") => {
    const actual = datos[campo];
    const conocida = !actual || opciones.some((o) => o.valor === actual);
    return (
      <Campo etiqueta={etiqueta} ancho={ancho}>
        <select
          className={INPUT}
          value={actual}
          onChange={(e) => onChange({ [campo]: e.target.value } as Partial<DatosSimmowConsultaExterna>)}
        >
          <option value=""></option>
          {!conocida && <option value={actual}>{actual} (no es opción de SIMMOW)</option>}
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </Campo>
    );
  };

  const casilla = (campo: CampoBool, etiqueta: string) => (
    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 pt-5">
      <input
        type="checkbox"
        checked={datos[campo]}
        onChange={(e) => onChange({ [campo]: e.target.checked } as Partial<DatosSimmowConsultaExterna>)}
      />
      {etiqueta}
    </label>
  );

  const edadSimmow = campoEdadSimmow(datos);
  const etiquetaEdad = { edad: "años", meses: "meses", dias: "días" }[edadSimmow.campo];

  return (
    <div className="space-y-4">
      <button
        onClick={onVolver}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
      >
        <ArrowLeft size={14} /> Volver a la lista
      </button>

      <Seccion titulo="Consulta">
        {texto("fecha", "Fecha (DD/MM/AAAA)", undefined, 10)}
        {texto("expediente", "Expediente")}
        <Campo etiqueta="Especialidad del reporte (solo referencia)">
          <input className={`${INPUT} opacity-70`} value={datos.especialidadTexto} readOnly />
        </Campo>
        <Campo etiqueta="Médico (código y nombre de SIMMOW)" ancho="triple">
          <MedicoCombobox
            nombre={datos.medicoNombre}
            codigo={datos.medicoCodigoSimmow}
            onChange={(nombre, codigo) => onChange({ medicoNombre: nombre, medicoCodigoSimmow: codigo })}
            codigoClassName={`${INPUT} !w-28`}
            nombreClassName={INPUT}
          />
        </Campo>
      </Seccion>

      <Seccion titulo="Paciente">
        {texto("paciente", "Nombre (máx. 40)", "doble", 40)}
        {texto("dui", "DUI")}
        {select("sexoValor", "Sexo", OP_SEXO)}
        {texto("edadAnios", "Edad — años")}
        {texto("edadMeses", "Edad — meses")}
        {texto("edadDias", "Edad — días")}
        <p className="sm:col-span-2 lg:col-span-3 text-xs text-slate-500 -mt-1">
          SIMMOW solo admite un tramo de edad: se digitará{" "}
          <b>
            {edadSimmow.valor ? `${edadSimmow.valor} ${etiquetaEdad}` : "nada (queda en 0)"}
          </b>
          .
        </p>
        {select("departamentoValor", "Departamento", OP_DEPARTAMENTO)}
        {texto("municipio", "Municipio (texto del reporte, con sufijo de departamento)")}
        {select("areaValor", "Área", OP_AREA)}
      </Seccion>

      <Seccion titulo="Diagnóstico">
        {select("dptconValor", "Tipo de consulta (Dx principal)", OP_TIPO_CONSULTA)}
        {select("especialistaValor", "Consulta de especialista", OP_ESPECIALISTA)}
        {casilla("dpstMarcado", "Sospecha")}
        {texto("diagPrincipalCodigo", "Dx principal — CIE-10", undefined, 5)}
        {texto("diagPrincipalTexto", "Dx principal — descripción", "doble")}
        {select("dstconValor", "Tipo de consulta (Dx secundario)", OP_TIPO_CONSULTA)}
        {texto("diagSecundarioCodigo", "Dx secundario — CIE-10", undefined, 5)}
        {texto("diagSecundarioTexto", "Dx secundario — descripción")}
        {texto("causaExternaCodigo", "Causa externa — CIE-10", undefined, 5)}
        {texto("causaExternaTexto", "Causa externa — descripción", "doble")}
      </Seccion>

      <Seccion titulo="Atención preventiva" nota="Solo se llena lo que trae el censo.">
        {select("tabaquismoValor", "Tabaquismo", OP_TABAQUISMO)}
        {select("inscripcionValor", "Inscripción", OP_INSCRIPCION)}
        {select("controlValor", "Control subsecuente", OP_CONTROL)}
        {select("evaluacionInfantilValor", "Evaluación del desarrollo infantil", OP_EVALUACION_INFANTIL)}
        {texto("perimetroCefalico", "Perímetro cefálico", undefined, 5)}
        {select("pesoEdadValor", "Peso / edad", OP_PESO_EDAD)}
        {select("tallaEdadValor", "Longitud o talla / edad", OP_TALLA_EDAD)}
        {select("pesoTallaValor", "Peso / talla", OP_PESO_TALLA)}
        {select("imcValor", "Índice de masa corporal", OP_IMC)}
        {select("lactanciaValor", "Lactancia materna", OP_LACTANCIA)}
        {select("pfInscripcionControlValor", "Planificación familiar — inscripción/control", OP_PF_IN_CON)}
        {select("pfMetodoValor", "Planificación familiar — método", OP_PF_METODO)}
        {select("pfUsuariaValor", "Usuaria activa", OP_PF_METODO)}
        {select("deteccionCancerValor", "Detección precoz del cáncer", OP_DETECCION_CANCER, "doble")}
        {texto("amenorreaSemanas", "Semanas de amenorrea", undefined, 2)}
      </Seccion>

      <Seccion titulo="Otros">
        {select("discapacidadValor", "Tipo de discapacidad", OP_DISCAPACIDAD)}
        {select("violenciaCondicionValor", "Violencia — condición", OP_VIOLENCIA_CONDICION)}
        {select("violenciaAmbitoValor", "Violencia — ámbito", OP_VIOLENCIA_AMBITO)}
        {select("procSaludMentalValor", "Procedimiento de salud mental", OP_PROC_SALUD_MENTAL)}
        {casilla("ingresoHospitalario", "Ingreso hospitalario")}
      </Seccion>

      <Seccion titulo="Referencia / interconsulta" nota="El tipo (referencia o interconsulta) se muestra como dato del reporte; SIMMOW solo registra los establecimientos.">
        <Campo etiqueta="Tipo en el reporte">
          <input
            className={`${INPUT} opacity-70`}
            value={datos.refTipoValor === "1" ? "Referencia" : datos.refTipoValor === "2" ? "Interconsulta" : ""}
            readOnly
          />
        </Campo>
        {texto("refDeTexto", "Referido DE (texto del reporte)", "doble")}
        {select("refDeValor", "Referido DE — tipo", OP_REF_RADIO)}
        {texto("refDeEstablecimientoCodigo", "Referido DE — código SIMMOW", undefined, 4)}
        {texto("refATexto", "Referido A (texto del reporte)", "doble")}
        {select("refAValor", "Referido A — tipo", OP_REF_RADIO)}
        {texto("refAEstablecimientoCodigo", "Referido A — código SIMMOW", undefined, 4)}
      </Seccion>

      <Seccion titulo="Afiliación">
        {casilla("isss", "Afiliado ISSS")}
        {select("tipoIsssValor", "Tipo ISSS", OP_TIPO_ISSS)}
        {texto("numeroAfiliacion", "N° de afiliación ISSS", undefined, 12)}
        {select("derechohabienteOtrosValor", "Otros derechohabientes", OP_DERECHOHABIENTE_OTROS)}
        {texto("derechohabienteOtrosNumero", "N° otros derechohabientes", undefined, 12)}
        {select("victimaDHValor", "Víctima de violaciones a DD. HH.", OP_VICTIMA_DH)}
        {select("privadoLibertadValor", "Persona privada de libertad", OP_PRIVADO_LIBERTAD, "doble")}
      </Seccion>
    </div>
  );
}
