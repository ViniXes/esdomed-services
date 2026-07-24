"use client";

import Image from "next/image";
import type { SolicitudAnexo5 } from "@/types";
import { formatearFechaGeneracionAnexo5 } from "@/lib/anexo5";

interface Props {
  data: SolicitudAnexo5;
}

export function Anexo5PrintLayout({ data }: Props) {
  return (
    <div id="anexo5-print-document" className="anexo5-doc text-black bg-white">
      {/* Encabezado exterior */}
      <div className="anexo5-header relative px-6 pt-5 pb-4">
        <div className="generation-date absolute left-6 top-8 max-w-[170px] text-left text-[10px] leading-4">
          <p className="font-bold">Fecha y hora de emisión</p>
          <p>{formatearFechaGeneracionAnexo5(data.creadoEn)}</p>
        </div>
        <div className="flex flex-col items-center text-center">
          <p className="font-bold text-[13px]">Ministerio de Salud</p>
          <p className="text-[11px]">Dirección Nacional de Hospitales</p>
          <p className="text-[11px]">Dirección Nacional de Primer Nivel de Atención</p>
          <Image
            src="/logo_minsal.png"
            alt="Ministerio de Salud"
            width={200}
            height={68}
            className="mt-2 object-contain"
          />
        </div>
      </div>

      <hr className="anexo5-rule border-black border-t-2 mx-6 mb-5" />

      <p className="text-center font-bold text-[13px] mb-6 px-4">
        Comprobante para el paciente referido en el SIS
      </p>

      {/* Cuerpo con borde */}
      <div className="anexo5-frame mx-6 mb-8 border border-black">
        {/* Encabezado interior */}
        <div className="text-center pt-5 pb-4 px-4">
          <p className="font-bold text-[13px]">Referencia en SIS</p>
          <p className="font-bold text-[13px] mt-1">Comprobante para el paciente referido</p>
        </div>

        <hr className="anexo5-rule border-black border-t-2 mx-4 mb-1" />

        {/* Filas de datos */}
        <div className="anexo5-fields">
          <div className="form-line-row patient-line-row">
            <span className="form-line-label">1. Nombre:</span>
            <span className="form-line-value">{data.nombrePaciente}</span>
            <span className="form-line-label patient-record-label">NEC:</span>
            <span className="form-line-value patient-record-value">{data.expediente ?? ""}</span>
          </div>
          <div className="form-line-row">
            <span className="form-line-label">2. Establecimiento que refiere:</span>
            <span className="form-line-value">{data.establecimientoQueRefiere}</span>
          </div>
          <div className="form-line-row">
            <span className="form-line-label">3. Teléfono del establecimiento que refiere:</span>
            <span className="form-line-value">{data.telefonoEstablecimiento}</span>
          </div>
          <div className="form-line-row">
            <span className="form-line-label">4. Médico que refiere:</span>
            <span className="form-line-value">{data.medicoRefiere}</span>
          </div>
          <div className="form-line-row">
            <span className="form-line-label">5. Especialidad del médico que refiere:</span>
            <span className="form-line-value">{data.especialidad}</span>
          </div>
          <div className="doctor-stamp-space">
            <span>Firma y sello del médico</span>
          </div>
          <div className="appointment-heading">
            Datos de la cita por RRI
          </div>
          <div className="form-line-row">
            <span className="form-line-label">6. Establecimiento al que se refiere:</span>
            <span className="form-line-value">{data.establecimientoReferencia}</span>
          </div>
          <div className="form-line-row">
            <span className="form-line-label">7. Fecha y hora de la cita:</span>
            <span className="form-line-value">{data.fechaHoraCita ?? ""}</span>
          </div>
          <div className="form-line-row">
            <span className="form-line-label">8. Médico que atenderá al paciente:</span>
            <span className="form-line-value">{data.medicoAtendera ?? ""}</span>
          </div>
          <div className="form-line-row">
            <span className="form-line-label">9. Especialidad donde será atendido:</span>
            <span className="form-line-value">{data.especialidadAtencion ?? ""}</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .anexo5-doc {
          font-family: Arial, Helvetica, sans-serif;
          max-width: 21cm;
          margin: 0 auto;
        }
        .anexo5-fields {
          padding: 6px 16px 18px;
        }
        .form-line-row {
          display: grid;
          grid-template-columns: max-content minmax(0, 1fr);
          align-items: flex-end;
          padding: 10px 0;
          column-gap: 7px;
          break-inside: avoid;
        }
        .form-line-label {
          font-weight: 700;
          font-size: 13px;
          line-height: 1.4;
        }
        .patient-line-row {
          grid-template-columns: max-content minmax(0, 1fr) max-content minmax(90px, 0.3fr);
        }
        .form-line-value {
          display: block;
          min-width: 0;
          width: 100%;
          font-size: 13px;
          min-height: 21px;
          border-bottom: 1.25px solid #000;
          padding: 0 3px 3px;
          line-height: 1.4;
        }
        .appointment-heading {
          margin-top: 8px;
          border-top: 1.25px solid #000;
          border-bottom: 1.25px solid #000;
          padding: 12px 0 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .doctor-stamp-space {
          width: 96%;
          height: 78px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          margin: 10px auto 12px;
          border: 1px dashed rgba(0, 0, 0, 0.1);
          border-radius: 2px;
        }
        .doctor-stamp-space span {
          font-size: 11px;
          font-weight: 600;
          color: rgba(0, 0, 0, 0.1);
        }
      `}</style>
    </div>
  );
}
