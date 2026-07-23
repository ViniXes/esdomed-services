"use client";

import Image from "next/image";
import type { Paciente, SolicitudIncapacidad } from "@/types";
import {
  formatFechaConstancia,
  formatFechaConstanciaCorta,
  numeroALetras,
} from "@/lib/incapacidades/helpers";

interface Props {
  incapacidad: SolicitudIncapacidad;
  paciente: Paciente;
}

/**
 * Replica el layout de la constancia de hospitalización/incapacidad del
 * Ministerio de Salud. Diseñado para imprimir en tamaño carta.
 *
 * Para impresión: usa Tailwind `print:` utilities y CSS @media print
 * inyectado en el wrapper.
 */
export function ConstanciaPrintLayout({ incapacidad, paciente }: Props) {
  const sexoMasc = paciente.genero === "masculino";
  const sexoFem  = paciente.genero === "femenino";
  // Teléfonos del paciente; si no tiene ninguno, usar el del responsable.
  const telPaciente = [paciente.telefono, paciente.otrosNumeros].filter(Boolean).join(" / ");
  const telResponsable = paciente.responsable?.telefono;
  const telefonos =
    telPaciente ||
    (telResponsable
      ? `${telResponsable} (${paciente.responsable?.parentesco || "responsable"})`
      : "");
  const fechaExp = incapacidad.fechaExpedicion ?? incapacidad.emitidaEn ?? new Date();

  return (
    <div className="constancia text-black bg-white">
      {/* ── Header con logo + título ── */}
      <div className="flex flex-col items-center mb-4 px-4 pt-4">
        <Image
          src="/logo_minsal.png"
          alt="Ministerio de Salud"
          width={260}
          height={90}
          className="object-contain"
          priority
        />
        <h1 className="mt-2 text-center text-[13px] font-bold uppercase tracking-wide">
          Constancia de Hospitalización e Incapacidad
        </h1>
      </div>

      <table className="constancia-table w-full border-collapse text-[10px]">
        <tbody>
          {/* Nombre + Expediente del paciente */}
          <tr>
            <td className="label w-[140px]"><strong>Nombre:</strong></td>
            <td colSpan={4} className="value text-[11px]">{paciente.apellidos} {paciente.nombres}</td>
            <td className="value text-right font-bold text-[11px] w-[110px]">
              {paciente.expediente}
            </td>
          </tr>
          {/* Separador */}
          <tr><td colSpan={6} className="h-1 border-0" /></tr>

          {/* Documentos de identidad */}
          <tr>
            <td rowSpan={5} className="label align-top"><strong>Documentos de Identidad:</strong></td>
            <td className="sublabel"><strong>DUI:</strong></td>
            <td colSpan={4} className="value">{paciente.dui ?? ""}</td>
          </tr>
          <tr>
            <td className="sublabel"><strong>Número de Afiliación:</strong></td>
            <td colSpan={4} className="value">{paciente.numeroAfiliacion ?? ""}</td>
          </tr>
          <tr>
            <td className="sublabel"><strong>Pasaporte:</strong></td>
            <td colSpan={4} className="value">{incapacidad.pasaporte ?? ""}</td>
          </tr>
          <tr>
            <td className="sublabel"><strong>Partida de Nacimiento:</strong></td>
            <td colSpan={4} className="value">{incapacidad.partidaNacimiento ?? ""}</td>
          </tr>
          <tr>
            <td className="sublabel"><strong>Otro:</strong></td>
            <td colSpan={4} className="value">{incapacidad.otroDocumento ?? ""}</td>
          </tr>

          {/* Sexo + Teléfonos */}
          <tr>
            <td rowSpan={2} className="label"><strong>Sexo:</strong></td>
            <td className="sublabel"><strong>Masculino:</strong></td>
            <td className="value text-center w-[40px]">{sexoMasc ? "☑" : "☐"}</td>
            <td rowSpan={2} className="sublabel align-middle"><strong>Teléfonos:</strong></td>
            <td colSpan={2} className="value">{telefonos}</td>
          </tr>
          <tr>
            <td className="sublabel"><strong>Femenino:</strong></td>
            <td className="value text-center">{sexoFem ? "☑" : "☐"}</td>
            <td colSpan={2} className="value" />
          </tr>

          {/* Correo */}
          <tr>
            <td className="label"><strong>Correo Electrónico:</strong></td>
            <td colSpan={5} className="value">{incapacidad.correoElectronico ?? ""}</td>
          </tr>

          {/* Domicilio */}
          <tr>
            <td className="label"><strong>Domicilio:</strong></td>
            <td colSpan={5} className="value">{paciente.direccion ?? ""}</td>
          </tr>

          {/* Departamento + Municipio */}
          <tr>
            <td className="label"><strong>Departamento:</strong></td>
            <td colSpan={2} className="value">{paciente.departamento ?? ""}</td>
            <td className="sublabel"><strong>Municipio:</strong></td>
            <td colSpan={2} className="value">{paciente.municipio ?? ""}</td>
          </tr>

          {/* Ocupación */}
          <tr>
            <td className="label"><strong>Ocupación:</strong></td>
            <td colSpan={5} className="value">{paciente.ocupacion ?? ""}</td>
          </tr>

          {/* Nombre del Patrono */}
          <tr>
            <td className="label"><strong>Nombre del Patrono:</strong></td>
            <td colSpan={5} className="value">{incapacidad.nombrePatrono ?? ""}</td>
          </tr>

          {/* Fecha de Ingreso + Fecha de Alta */}
          <tr>
            <td className="label"><strong>Fecha de Ingreso:</strong></td>
            <td colSpan={2} className="value text-center">{formatFechaConstanciaCorta(incapacidad.fechaIngresoCorregida ?? paciente.fechaIngreso)}</td>
            <td className="sublabel"><strong>Fecha de Alta:</strong></td>
            <td colSpan={2} className="value text-center">{formatFechaConstanciaCorta(incapacidad.fechaAlta)}</td>
          </tr>

          {/* Periodo de Incapacidad: Desde / N° Días / Número */}
          <tr>
            <td rowSpan={2} className="label align-middle"><strong>Periodo de Incapacidad:</strong></td>
            <td className="sublabel"><strong>Desde:</strong></td>
            <td className="value text-center">{formatFechaConstanciaCorta(incapacidad.fechaDesde)}</td>
            <td rowSpan={2} className="sublabel align-middle"><strong>N° De Días:</strong></td>
            <td colSpan={2} className="value text-center">
              <div className="font-bold text-[11px]">{incapacidad.diasIncapacidad}</div>
              <div className="text-[8px] text-slate-600">Número</div>
            </td>
          </tr>
          <tr>
            <td className="sublabel"><strong>Hasta:</strong></td>
            <td className="value text-center">{formatFechaConstanciaCorta(incapacidad.fechaHasta)}</td>
            <td colSpan={2} className="value text-center">
              <div className="italic">{numeroALetras(incapacidad.diasIncapacidad)}</div>
              <div className="text-[8px] text-slate-600 font-bold">Numero en letras</div>
            </td>
          </tr>

          {/* Sello / Firma — espacio vacío grande, etiqueta al fondo */}
          <tr>
            <td colSpan={3} className="value sello-firma-cell">
              <div className="sello-firma-label">SELLO DEL MEDICO</div>
            </td>
            <td colSpan={3} className="value sello-firma-cell">
              <div className="sello-firma-label">FIRMA DEL MEDICO RESPONSABLE</div>
            </td>
          </tr>

          {/* Condición de Egreso */}
          <tr>
            <td className="label"><strong>Condición de Egreso:</strong></td>
            <td colSpan={5} className="value uppercase">{incapacidad.condicionEgreso === "muerto" ? "MUERTO" : "VIVO"}</td>
          </tr>

          {/* Diagnóstico de Egreso */}
          <tr>
            <td className="label align-top"><strong>Diagnóstico de Egreso:</strong></td>
            <td colSpan={5} className="value text-center px-3 py-2">{incapacidad.diagnosticoEgreso}</td>
          </tr>

          {/* Fecha de Expedición */}
          <tr>
            <td className="label"><strong>Fecha de Expedición:</strong></td>
            <td colSpan={5} className="value">{formatFechaConstancia(fechaExp)}</td>
          </tr>

          {/* Institución Provicional */}
          <tr>
            <td rowSpan={2} className="label align-middle"><strong>Institución Provicional:</strong></td>
            {(["CRECER", "CONFIA", "INPEP", "IPSFA", "ISSS"] as const).map((inst) => (
              <td key={inst} className="value text-center font-bold text-[10px]" colSpan={inst === "ISSS" ? 1 : 1}>
                {inst}
              </td>
            ))}
          </tr>
          <tr>
            {(["CRECER", "CONFIA", "INPEP", "IPSFA", "ISSS"] as const).map((inst) => (
              <td key={inst} className="value text-center text-[12px]">
                {incapacidad.institucionProvisional === inst ? "☑" : "☐"}
              </td>
            ))}
          </tr>

          {/* Banco a depositar */}
          <tr>
            <td rowSpan={2} className="label align-middle"><strong>BANCO A DEPOSITAR:</strong></td>
            <td colSpan={4} className="value text-center font-bold">Promerica</td>
            <td className="value text-center text-[12px]">
              {incapacidad.bancoDeposito === "Promerica" ? "☑" : "☐"}
            </td>
          </tr>
          <tr>
            <td colSpan={4} className="value text-center font-bold">Atlantida</td>
            <td className="value text-center text-[12px]">
              {incapacidad.bancoDeposito === "Atlantida" ? "☑" : "☐"}
            </td>
          </tr>

          {/* Tratamiento de Alta */}
          <tr>
            <td className="label align-top"><strong>Tratamiento de Alta:</strong></td>
            <td colSpan={5} className="value text-center px-3 py-2 whitespace-pre-wrap">
              {incapacidad.tratamientoAlta}
            </td>
          </tr>

          {/* Recomendaciones */}
          <tr>
            <td className="label align-top h-[60px]"><strong>Recomendaciones:</strong></td>
            <td colSpan={5} className="value px-3 py-2 whitespace-pre-wrap">
              {incapacidad.recomendaciones ?? ""}
            </td>
          </tr>

          {/* Seguimiento */}
          <tr>
            <td className="label align-top"><strong>Seguimiento:</strong></td>
            <td colSpan={5} className="value px-3 py-2 italic">
              (Establecimiento, Monitoreotelefonico, Otros)
            </td>
          </tr>
          <tr>
            <td colSpan={6} className="value h-[30px] px-3 whitespace-pre-wrap">
              {incapacidad.seguimiento ?? ""}
            </td>
          </tr>

          {/* Uso exclusivo subsidios */}
          <tr>
            <td colSpan={6} className="value text-center font-bold text-[10px] py-1.5">
              Uso exclusivo sección de subsidios
            </td>
          </tr>
        </tbody>
      </table>

      {/* CSS para constancia y print */}
      <style jsx>{`
        .constancia {
          font-family: Arial, Helvetica, sans-serif;
          max-width: 21cm;
          margin: 0 auto;
          padding: 0 1cm;
        }
        .constancia-table td {
          border: 1px solid #000;
          padding: 4px 6px;
          vertical-align: middle;
        }
        .constancia-table td.label {
          background: #f5f5f5;
          font-weight: 600;
        }
        .constancia-table td.sublabel {
          background: #fafafa;
          font-weight: 600;
        }
        .constancia-table td.value {
          background: white;
        }
        .constancia-table td.sello-firma-cell {
          height: 90px;
          vertical-align: bottom;
          padding: 0 6px 3px;
        }
        .sello-firma-label {
          font-size: 9px;
          font-weight: 600;
          text-align: center;
          line-height: 1;
        }

        @media print {
          @page {
            size: letter;
            margin: 1cm 0.6cm;
          }
          .constancia {
            padding: 0;
          }
          .constancia-table {
            page-break-inside: avoid;
          }
          .constancia-table tr {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
