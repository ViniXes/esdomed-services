"use client";

import Image from "next/image";
import type { DatosFormato, FechaFormato, JefeFormato } from "@/lib/inconsistenciasMarcacion/formato";

export interface PersonaFormato {
  nombre: string;
  cargo: string;
  codigo: string;
}

interface Props {
  dias: DatosFormato[];
  empleado: PersonaFormato;
  jefe: JefeFormato;
  emision: FechaFormato;
}

/** Línea del formato con su valor encima. */
function Campo({ valor, ancho }: { valor: string | number; ancho: string }) {
  return (
    <span className="campo" style={{ minWidth: ancho }}>
      {valor}
    </span>
  );
}

function LugarYFecha({ fecha }: { fecha: FechaFormato }) {
  return (
    <p className="lugar">
      San Salvador, <Campo valor={fecha.dia} ancho="1.5cm" /> de <Campo valor={fecha.mes} ancho="2.6cm" /> de 20
      <Campo valor={String(fecha.anio).slice(2)} ancho="0.9cm" />
    </p>
  );
}

function Rotulo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rotulo">
      <span className="rotulo-etiqueta">{etiqueta}</span>
      <span className="rotulo-valor">{valor}</span>
    </div>
  );
}

/**
 * Réplica del formato de inconsistencia de marcación, una hoja carta por día.
 * El texto es el del formato oficial tal cual, con sus erratas: es un documento
 * de RRHH y aquí solo se llenan sus blancos. Debe montarse dentro de un
 * elemento `.formato-impresion` hijo directo de <body>.
 */
export function FormatoInconsistenciaPrintLayout({ dias, empleado, jefe, emision }: Props) {
  return (
    <div className="formato-inconsistencia">
      {dias.map((d, i) => (
        <section key={i} className="hoja">
          <header className="encabezado">
            <div className="marca">
              <div className="escudo">
                <Image src="/logo_minsal.png" alt="Gobierno de El Salvador" width={324} height={155} priority />
              </div>
              <p className="hospital">
                HOSPITAL
                <br />
                NACIONAL
                <br />
                EL SALVADOR
              </p>
            </div>
            <LugarYFecha fecha={emision} />
          </header>

          <div className="destinatario">
            <p>
              <strong>Nombre del jefe:</strong> <Campo valor={jefe.nombre} ancho="8cm" />
            </p>
            <p>
              <strong>Cargo:</strong> <Campo valor={jefe.cargo} ancho="8cm" />
            </p>
          </div>

          <p className="cuerpo">
            De la manera más atenta y de conformidad con lo dispuesto en el artículo 60 del Reglamento Interno de la Unidad y Departamentos de
            Recursos Humanos del Ministerio de Salud, el cual puntualiza sobre la forma de proceder ante la falta de registro de asistencia del
            personal, al respecto tengo a bien informarle que por un acto involuntario de mi persona no registre la hora de
            <Campo valor={d.marca} ancho="2cm" />, la cual fue: <Campo valor={d.horaOmitida} ancho="1.9cm" /> <strong>del día</strong>{" "}
            <Campo valor={d.fechaOmitida.dia} ancho="1.4cm" /> <strong>de</strong> <Campo valor={d.fechaOmitida.mes} ancho="2cm" /> del corriente
            año, habiendo cumplido con mi turno programado en Plan de Trabajo de: <Campo valor={d.entrada} ancho="1.9cm" />{" "}
            <strong>del día</strong> <Campo valor={d.desde.dia} ancho="1.4cm" /> <strong>de</strong> <Campo valor={d.desde.mes} ancho="2cm" /> a las{" "}
            <Campo valor={d.salida} ancho="1.9cm" /> del día <Campo valor={d.hasta.dia} ancho="1.4cm" /> de{" "}
            <Campo valor={d.hasta.mes} ancho="2cm" /> <strong>del corriente año.</strong> Por lo agradezco se considere la presente, para los
            efectos legales consiguientes, e interponga sus oficios ante la jefa del Departamento de Recursos Humanos de éste Hospital, a fin que
            no se me efectué descuento por lo expuesto anteriormente.
          </p>

          <div className="firmas">
            <div className="firma-celda">
              <div className="firma-linea">Firma</div>
              <Rotulo etiqueta="Empleado:" valor={empleado.nombre} />
              <Rotulo etiqueta="Cargo:" valor={empleado.cargo} />
              <Rotulo etiqueta="Código empleado:" valor={empleado.codigo} />
            </div>
            <div className="firma-celda">
              <p className="vobo">Vo. Bo.</p>
              <div className="firma-linea">Firma, Sello</div>
              <Rotulo etiqueta="Nombre del jefe:" valor={jefe.nombre} />
              <Rotulo etiqueta="Cargo:" valor={jefe.cargo} />
            </div>
          </div>

          <h2 className="banda">NOTIFICACION A RECURSOS HUMANOS</h2>

          <div className="notificacion-encabezado">
            <p>
              Licda. Sandra Lissette Fuentes Quijano
              <br />
              Jefe Departamento de Recursos Humanos,
              <br />
              Hospital Nacional El Salvador.
            </p>
            <LugarYFecha fecha={emision} />
          </div>

          <p className="cuerpo">
            En atención a solicitud y expuesto anteriormente por: <span className="campo campo-corrido">{empleado.nombre}</span>, tengo a bien dar fe que cumplió con
            el turno indicado; por lo que solicito la consideración de la presente a efectos que no se le efectué descuento ya que la justificación
            expuesta por el referido empleado, cumple las condiciones expresadas en el artículo 60 del referido Reglamento.
          </p>

          <p className="cierre">Sin más sobre el particular,</p>
          <p className="cierre">Atentamente,</p>

          <div className="firma-final">
            <div className="firma-linea">Firma, Sello</div>
            <Rotulo etiqueta="Nombre del jefe:" valor={jefe.nombre} />
            <Rotulo etiqueta="Cargo:" valor={jefe.cargo} />
          </div>
        </section>
      ))}

      <style jsx global>{`
        .formato-inconsistencia {
          color: #000;
          font-family: Calibri, Carlito, Arial, Helvetica, sans-serif;
          font-size: 11pt;
          line-height: 1.25;
        }
        .formato-inconsistencia p {
          margin: 0;
        }
        .formato-inconsistencia .hoja {
          box-sizing: border-box;
          width: 21.59cm;
          min-height: 27.94cm;
          padding: 1.1cm 1.7cm 0.8cm;
          background: #fff;
        }
        .formato-inconsistencia .encabezado {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          margin-bottom: 0.55cm;
        }
        .formato-inconsistencia .marca {
          display: flex;
          align-items: center;
          gap: 0.2cm;
          margin-left: 0.5cm;
        }
        /* Del logo del Ministerio solo se usa el escudo y su filete vertical. */
        .formato-inconsistencia .escudo {
          width: 2.51cm;
          height: 2.5cm;
          overflow: hidden;
        }
        .formato-inconsistencia .escudo img {
          display: block;
          width: auto;
          max-width: none;
          height: 2.5cm;
        }
        .formato-inconsistencia .hospital {
          font-family: "Times New Roman", Times, serif;
          font-size: 11pt;
          line-height: 1.15;
        }
        .formato-inconsistencia .campo {
          display: inline-block;
          padding: 0 0.1cm;
          border-bottom: 1px solid #000;
          font-weight: 700;
          line-height: 1.05;
          text-align: center;
          vertical-align: baseline;
        }
        /* Un nombre largo se parte como el texto; en bloque estiraría la línea anterior. */
        .formato-inconsistencia .campo-corrido {
          display: inline;
        }
        .formato-inconsistencia .lugar {
          white-space: nowrap;
        }
        .formato-inconsistencia .destinatario {
          display: grid;
          gap: 0.2cm;
          margin-bottom: 0.5cm;
        }
        .formato-inconsistencia .cuerpo {
          line-height: 1.36;
          text-align: justify;
        }
        .formato-inconsistencia .firmas {
          display: grid;
          grid-template-columns: 1fr 1fr;
          margin: 0.15cm -0.25cm 0.4cm;
          border: 1.5px solid #000;
        }
        .formato-inconsistencia .firma-celda {
          display: flex;
          flex-direction: column;
          gap: 0.15cm;
          min-height: 4.2cm;
          padding: 0.2cm 0.4cm 0.3cm;
        }
        .formato-inconsistencia .firma-celda + .firma-celda {
          border-left: 1.5px solid #000;
        }
        .formato-inconsistencia .vobo {
          position: absolute;
        }
        .formato-inconsistencia .firma-linea {
          margin-top: 1.2cm;
          border-top: 1px solid #000;
          font-size: 10.5pt;
          text-align: center;
        }
        .formato-inconsistencia .rotulo {
          display: flex;
          align-items: flex-end;
          gap: 0.15cm;
          min-height: 0.6cm;
        }
        .formato-inconsistencia .rotulo-etiqueta {
          flex-shrink: 0;
          font-weight: 600;
        }
        .formato-inconsistencia .rotulo-valor {
          flex: 1;
          min-width: 0;
          min-height: 1.15em;
          border-bottom: 1px solid #000;
          font-size: 10pt;
          font-weight: 700;
          line-height: 1.1;
          text-align: center;
        }
        .formato-inconsistencia .banda {
          margin: 0 0 0.4cm;
          padding: 0.05cm;
          background: #6b6b6b;
          color: #fff;
          font-size: 12pt;
          font-weight: 700;
          text-align: center;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .formato-inconsistencia .notificacion-encabezado {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.5cm;
          margin-bottom: 0.45cm;
        }
        .formato-inconsistencia .cierre {
          margin-top: 0.35cm;
        }
        .formato-inconsistencia .firma-final {
          display: flex;
          flex-direction: column;
          gap: 0.15cm;
          width: 10cm;
          margin: -0.3cm 0 0 auto;
        }

        @media screen {
          .formato-inconsistencia {
            display: grid;
            gap: 0.6cm;
          }
          .formato-inconsistencia .hoja {
            box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
          }
        }

        /* Solo quedan las hojas: el layout del dashboard (h-screen, overflow
           hidden) recortaría todo lo que pase de la primera. */
        @media print {
          @page {
            size: letter;
            margin: 0;
          }
          body > *:not(.formato-impresion) {
            display: none !important;
          }
          html,
          body {
            height: auto !important;
            overflow: visible !important;
            background: #fff !important;
          }
          .formato-inconsistencia .hoja {
            min-height: 0;
          }
          .formato-inconsistencia .hoja + .hoja {
            break-before: page;
          }
        }
      `}</style>
    </div>
  );
}
