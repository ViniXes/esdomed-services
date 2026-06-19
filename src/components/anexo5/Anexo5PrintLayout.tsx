"use client";

import Image from "next/image";
import type { SolicitudAnexo5 } from "@/types";

interface Props {
  data: SolicitudAnexo5;
}

export function Anexo5PrintLayout({ data }: Props) {
  return (
    <div className="anexo5-doc text-black bg-white">
      {/* Encabezado exterior */}
      <div className="flex justify-center pt-6 pb-3">
        <Image
          src="/logo_minsal.png"
          alt="Ministerio de Salud"
          width={240}
          height={80}
          className="object-contain"
          priority
        />
      </div>
      <div className="text-center pb-5">
        <p className="font-bold text-[13px]">Ministerio de Salud</p>
        <p className="text-[11px]">Dirección Nacional de Hospitales</p>
        <p className="text-[11px]">Dirección Nacional de Primer Nivel de Atención</p>
      </div>

      <hr className="border-black border-t-2 mx-6 mb-5" />

      <p className="text-center font-bold text-[13px] mb-6 px-4">
        Comprobante para el paciente referido en el SIS
      </p>

      {/* Cuerpo con borde */}
      <div className="mx-6 mb-8 border border-black">
        {/* Encabezado interior */}
        <div className="text-center pt-6 pb-5 px-4">
          <div className="flex justify-center mb-4">
            <Image
              src="/logo_minsal.png"
              alt="Ministerio de Salud"
              width={200}
              height={68}
              className="object-contain"
            />
          </div>
          <p className="font-bold text-[13px]">Referencia en SIS</p>
          <p className="font-bold text-[13px] mt-1">Comprobante para el paciente referido</p>
        </div>

        <hr className="border-black border-t-2 mx-4 mb-1" />

        {/* Filas de datos */}
        <div className="anexo5-fields">
          <div className="field-row">
            <span className="field-label">Fecha</span>
            <span className="field-value">{data.fecha ?? ""}</span>
          </div>
          <div className="field-row">
            <span className="field-label">1. Nombre</span>
            <span className="field-value">{data.nombrePaciente}</span>
          </div>
          <div className="field-row">
            <span className="field-label">2. Referido de</span>
            <span className="field-value">{data.referidoDe}</span>
          </div>
          <div className="field-row">
            <span className="field-label">3. Establecimiento de referencia</span>
            <span className="field-value">{data.establecimientoReferencia}</span>
          </div>
          <div className="field-row">
            <span className="field-label">4. Fecha y hora de la cita</span>
            <span className="field-value">{data.fechaHoraCita ?? ""}</span>
          </div>
          <div className="field-row">
            <span className="field-label">5. Especialidad</span>
            <span className="field-value">{data.especialidad}</span>
          </div>
          <div className="field-row">
            <span className="field-label">6. Médico</span>
            <span className="field-value">{data.medicoRefiere}</span>
          </div>
          <div className="field-row">
            <span className="field-label">7. Establecimiento que refiere :</span>
            <span className="field-value">{data.establecimientoQueRefiere}</span>
          </div>
          {/* Teléfono + Sello */}
          <div className="phone-sello-row">
            <div className="phone-section">
              <span className="font-bold text-[11px]">Teléfono del establecimiento que refiere:</span>
              <span className="phone-value">{data.telefonoEstablecimiento}</span>
            </div>
            <div className="sello-section">
              <div className="sello-space" />
              <span className="font-bold text-[11px]">Sello</span>
            </div>
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
          padding: 4px 16px 16px;
        }
        .field-row {
          display: flex;
          align-items: flex-start;
          border-bottom: 1px solid #000;
          padding: 10px 0;
          gap: 8px;
        }
        .field-label {
          font-weight: 700;
          font-size: 11px;
          width: 38%;
          flex-shrink: 0;
          line-height: 1.4;
        }
        .field-value {
          font-size: 11px;
          flex: 1;
          line-height: 1.4;
        }
        .phone-sello-row {
          display: flex;
          align-items: flex-end;
          padding-top: 24px;
          padding-bottom: 8px;
          gap: 16px;
        }
        .phone-section {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .phone-value {
          font-size: 11px;
          border-bottom: 1px solid #000;
          padding-bottom: 4px;
          display: block;
        }
        .sello-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          min-width: 130px;
        }
        .sello-space {
          width: 100%;
          height: 50px;
          border-bottom: 1px solid #000;
          margin-bottom: 4px;
        }
        @media print {
          @page {
            size: letter;
            margin: 1cm 0.6cm;
          }
          .anexo5-doc {
            padding: 0;
          }
        }
      `}</style>
    </div>
  );
}
