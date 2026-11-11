"use client";

import Image from "next/image";
import {
  FORMATOS,
  FILAS_INCIDENTES,
  OPCIONES,
  RANGOS,
  CALIFICACIONES,
  fechaCorta,
  type EvaluacionDesempeno,
  type FactorEvaluacion,
} from "@/lib/evaluacionDesempeno";

type Datos = Pick<
  EvaluacionDesempeno,
  | "datos"
  | "respuestas"
  | "puntaje"
  | "calificacion"
  | "incidentes"
  | "observacionesIncidentes"
  | "tiempoSupervisar"
  | "comentariosEvaluador"
  | "fechaEvaluador"
  | "fechaJefeSuperior"
  | "comentariosEvaluado"
  | "fechaEvaluado"
  | "acciones"
  | "fechaAcciones"
> & {
  formato?: EvaluacionDesempeno["formato"];
  /** "YYYY-MM-DD": día en que se hizo la evaluación; va en las fechas de las firmas si no se llenaron a mano. */
  fechaEvaluacion?: string;
};

// Sin firma digital: el nombre de quien firma va sobre la línea.
const FIRMA_EVALUADOR = "Heber Benjamín Cardoza Guevara";
const FIRMA_JEFE_SUPERIOR = "Roberto Centeno Zambrano";

function Casilla({ marcada }: { marcada: boolean }) {
  return <span className="casilla">{marcada ? "X" : ""}</span>;
}

function Factor({ f, elegida }: { f: FactorEvaluacion; elegida?: string }) {
  return (
    <div className="factor">
      <div className="factor-enc">
        <p className="factor-titulo">
          {f.numero}. {f.titulo}
        </p>
        <p className="factor-def">{f.definicion}</p>
      </div>
      <div className="factor-opciones">
        {OPCIONES.map((o) => (
          <div key={o} className="opcion">
            <div className="opcion-enc">
              <span className="opcion-letra">{o}</span>
              <Casilla marcada={elegida === o} />
            </div>
            <p className="opcion-texto">{f.descriptores[o]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pie({ n }: { n: number }) {
  return <p className="pie">Pagina {n} de 4</p>;
}

/** Líneas de renglón con el texto encima (comentarios, acciones, observaciones). */
function Renglones({ texto, lineas }: { texto: string; lineas: number }) {
  return (
    <div className="renglones">
      {Array.from({ length: lineas }, (_, i) => (
        <div key={i} className="renglon" />
      ))}
      <div className="renglones-texto">{texto}</div>
    </div>
  );
}

/**
 * Réplica del Formulario de Evaluación del Desempeño del MINSAL, 4 hojas carta.
 * Debe montarse dentro de un elemento `.formato-impresion` hijo directo de <body>
 * (mismo patrón que la hoja de inconsistencia de marcación).
 */
export function EvaluacionDesempenoPrintLayout({ ev }: { ev: Datos }) {
  const d = ev.datos;
  const formato = FORMATOS[ev.formato ?? "mpe"];
  const factores = formato.factores;
  const filas = Array.from({ length: FILAS_INCIDENTES }, (_, i) => ev.incidentes[i]);

  return (
    <div className="eval-desempeno">
      {/* ─────────────── Página 1 ─────────────── */}
      <section className="hoja">
        <header className="encabezado">
          <div className="logo">
            <Image src="/logo_hnes.png" alt="Hospital Nacional El Salvador" width={1500} height={720} priority />
          </div>
          <p className="hospital">
            HOSPITAL NACIONAL
            <br />
            EL SALVADOR
          </p>
        </header>
        <div className="regla" />
        <p className="subtitulo">FORMULARIO DE EVALUACION DEL DESEMPEÑO PARA PERSONAL</p>
        <div className="titulo-fila">
          <p className="seccion seccion-i">I. DATOS GENERALES</p>
          <p className="titulo">{formato.titulo}</p>
        </div>

        <div className="datos">
          <div className="fila">
            <div className="celda" style={{ width: "57%" }}>
              <span className="et">DEPENDENCIA:</span> <span className="val">{d.dependencia}</span>
            </div>
            <div className="celda flex1">
              <span className="et">PERIODO de EVALUACION:</span> <span className="val">{d.periodo}</span>
            </div>
          </div>
          <div className="fila">
            <div className="celda centro" style={{ width: "30%" }}>
              <span className="val grande">{d.dui ? `DUI ${d.dui}` : "DUI"}</span>
            </div>
            <div className="celda flex1">
              <span className="et">NOMBRE DEL EMPLEADO:</span> <span className="val">{d.nombre}</span>
            </div>
          </div>
          <div className="fila">
            <div className="celda" style={{ width: "30%" }}>
              <span className="et">CARGO SEGUN NOMBRAMIENTO:</span>
            </div>
            <div className="celda flex1">
              <span className="val">{d.cargoNombramiento}</span>
            </div>
          </div>
          <div className="fila">
            <div className="celda" style={{ width: "30%" }}>
              <span className="et">CARGO SEGUN FUNCIONES:</span>
            </div>
            <div className="celda flex1 recorte">
              <span className="val">{d.cargoFunciones}</span>
            </div>
            <div className="celda" style={{ width: "22%" }}>
              <span className="et">A PARTIR DE:</span> <span className="val">{d.aPartirDe}</span>
            </div>
          </div>
          <div className="fila">
            <div className="celda" style={{ width: "41%" }}>
              <span className="et">FECHA DE INGRESO:</span> <span className="val val-ancho">{d.fechaIngreso}</span>
            </div>
            <div className="celda flex1">
              <span className="et">PARTIDA:</span> <span className="val val-ancho">{d.partida}</span>
              <span className="et">SUBNUMERO:</span> <span className="val val-corto">{d.subnumero}</span>
            </div>
            <div className="celda" style={{ width: "22%" }}>
              <span className="et">SUELDO:</span> <span className="val">{d.sueldo ? `$ ${d.sueldo}` : ""}</span>
            </div>
          </div>
          <div className="fila">
            <div className="celda" style={{ width: "30%" }}>
              <span className="et subrayado">NOMBRE DEL JEFE INMEDIATO:</span>
            </div>
            <div className="celda flex1">
              <span className="val">{d.jefeNombre}</span>
            </div>
          </div>
          <div className="fila">
            <div className="celda" style={{ width: "30%" }}>
              <span className="et subrayado">PUESTO:</span>
            </div>
            <div className="celda flex1">
              <span className="val">{d.jefePuesto}</span>
            </div>
          </div>
          <div className="fila unidad">
            <div className="unidad-caja" />
            <div className="unidad-texto">
              <p className="et">UNIDAD ADMINISTRATIVA: (DIRECCION, DIVISION, DEPARTAMENTO, UNIDAD, SECCION, AREA)</p>
              <p className="val">{d.unidadAdministrativa}</p>
            </div>
          </div>
        </div>

        <p className="seccion">II. EVALUACION GENERAL POR PARTE DEL JEFE INMEDIATO</p>
        <div className="factores">
          {factores.slice(0, 3).map((f) => (
            <Factor key={f.numero} f={f} elegida={ev.respuestas[f.numero]} />
          ))}
        </div>
        <Pie n={1} />
      </section>

      {/* ─────────────── Página 2 ─────────────── */}
      <section className="hoja">
        <div className="factores" style={{ marginTop: "0.25in" }}>
          {factores.slice(3).map((f) => (
            <Factor key={f.numero} f={f} elegida={ev.respuestas[f.numero]} />
          ))}
        </div>

        <div className="valoracion">
          <div className="tabla-valoracion">
            <p className="tabla-titulo">TABLA DE VALORACION</p>
            <table>
              <thead>
                <tr>
                  <th className="col-factor">FACTOR</th>
                  {OPCIONES.map((o) => (
                    <th key={o}>{o}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {factores.map((f) => (
                  <tr key={f.numero}>
                    <td className="col-factor">{f.etiquetaTabla}</td>
                    {OPCIONES.map((o) => (
                      <td key={o}>{f.puntos[o]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rangos">
            <p className="tabla-titulo">CALIFICACION POR PUNTOS Y POR RANGOS</p>
            <table>
              <tbody>
                {RANGOS.map((r) => (
                  <tr key={r.calificacion}>
                    <td className="rango-nombre">{r.calificacion}</td>
                    <td className="rango-texto">{r.texto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="puntaje">
              <span className="et">PUNTAJE:</span> <span className="val grande">{ev.calificacion ? ev.puntaje : ""}</span>
            </div>
          </div>
        </div>
        <Pie n={2} />
      </section>

      {/* ─────────────── Página 3 ─────────────── */}
      <section className="hoja">
        <div className="registro-titulo">
          <p className="subtitulo">REGISTRO INDIVIDUAL DE INCIDENTES CRITICOS DE DESEMPEÑO PARA PERSONAL</p>
          <p className="titulo">{formato.titulo}</p>
        </div>

        <table className="tabla-personas">
          <tbody>
            <tr>
              <td className="tp-et">NOMBRE DEL EMPLEADO:</td>
              <td className="tp-val">{d.nombre}</td>
            </tr>
            <tr>
              <td className="tp-et">PUESTO QUE OCUPA:</td>
              <td className="tp-val">{d.cargoNombramiento}</td>
            </tr>
          </tbody>
        </table>
        <table className="tabla-personas">
          <tbody>
            <tr>
              <td className="tp-et">NOMBRE DE JEFE INMEDIATO:</td>
              <td className="tp-val">{d.jefeNombre}</td>
            </tr>
            <tr>
              <td className="tp-et">PUESTO QUE OCUPA:</td>
              <td className="tp-val">{d.jefePuesto}</td>
            </tr>
          </tbody>
        </table>

        <div className="observan">
          <p className="observan-titulo">FACTORES QUE SE OBSERVAN:</p>
          <div className="observan-fila">
            {factores.slice(0, 4).map((f) => (
              <span key={f.numero} className="observan-caja">
                {f.etiquetaCorta}
              </span>
            ))}
          </div>
          <div className="observan-fila centrada">
            {factores.slice(4).map((f) => (
              <span key={f.numero} className="observan-caja alta">
                {f.etiquetaCorta}
              </span>
            ))}
          </div>
        </div>

        <table className="incidentes">
          <thead>
            <tr>
              <th rowSpan={2} style={{ width: "0.95in" }}>
                FECHA
              </th>
              <th rowSpan={2} style={{ width: "0.95in" }}>
                FACTOR
                <br />
                No.
              </th>
              <th className="fd" style={{ width: "0.95in" }}>
                F
              </th>
              <th rowSpan={2}>DESCRIPCION DEL EVENTO</th>
            </tr>
            <tr>
              <th className="fd">D</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((inc, i) => (
              <tr key={i}>
                <td>{inc ? fechaCorta(inc.fecha) : ""}</td>
                <td>{inc ? inc.factor : ""}</td>
                <td>{inc ? inc.tipo : ""}</td>
                <td className="desc">{inc?.descripcion ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="leyenda">
          <p>
            <strong>F</strong> <span>Incidentes Favorables</span>
          </p>
          <p>
            <strong>D</strong> <span>Incidentes Desfavorables</span>
          </p>
        </div>
        <div className="caja-obs">
          <p className="et-normal">OBSERVACIONES:</p>
          <Renglones texto={ev.observacionesIncidentes} lineas={2} />
        </div>
        <Pie n={3} />
      </section>

      {/* ─────────────── Página 4 ─────────────── */}
      <section className="hoja">
        <p className="seccion" style={{ marginTop: "0.25in" }}>
          III. RESULTADOS DE LA EVALUACION DEL DESEMPEÑO.
        </p>
        <div className="marco">
          <div className="resultados">
            <div className="res-fila">
              <div className="res-et">Tiempo de Supervisar al Evaluado:</div>
              <div className="res-val">{ev.tiempoSupervisar}</div>
            </div>
            <div className="res-bloque">
              <p>Con base en la evaluación realizada el empleado merece una calificación de:</p>
              <div className="calificaciones">
                {CALIFICACIONES.map((c) => (
                  <span key={c} className="calif">
                    {c} <Casilla marcada={ev.calificacion === c} />
                  </span>
                ))}
              </div>
            </div>
            <div className="res-coment">
              <p className="res-coment-et">Comentarios:</p>
              <Renglones texto={ev.comentariosEvaluador} lineas={1} />
            </div>
          </div>

          <div className="firmas">
            <div className="firma-fila">
              <div className="firma-linea">
                <span className="fecha-val firma-nombre">{FIRMA_EVALUADOR}</span>
                Firma del Evaluador
              </div>
              <div className="sello">SELLO</div>
              <div className="firma-linea fecha">
                <span className="fecha-val">{fechaCorta(ev.fechaEvaluador || ev.fechaEvaluacion || "")}</span>
                Fecha
              </div>
            </div>
            <div className="firma-fila">
              <div className="firma-linea">
                <span className="fecha-val firma-nombre">{FIRMA_JEFE_SUPERIOR}</span>
                Firma Jefe Inmediato Superior
              </div>
              <div className="sello">SELLO</div>
              <div className="firma-linea fecha">
                <span className="fecha-val">{fechaCorta(ev.fechaJefeSuperior || ev.fechaEvaluacion || "")}</span>
                Fecha
              </div>
            </div>
          </div>

          <p className="seccion">IV. COMUNICACION DE LA CALIFICACION AL EVALUADO.</p>
          <div className="comunicacion">
            <p className="renglon-texto">Hago constar que he leido la presente evaluación y calificación del desempeño y me doy por enterado del</p>
            <p className="renglon-texto">contenido de la misma.</p>
            <p className="renglon-texto">Comentarios:</p>
            <Renglones texto={ev.comentariosEvaluado} lineas={1} />
            <div className="firma-fila normal">
              <div className="firma-linea">Firma del Evaluado</div>
              <div className="sello">SELLO</div>
              <div className="firma-linea fecha">
                <span className="fecha-val">{fechaCorta(ev.fechaEvaluado)}</span>
                Fecha
              </div>
            </div>
          </div>

          <p className="acciones-titulo">
            ACCIONES ACORDADAS CON EL EMPLEADO PARA MEJORAR SU DESEMPEÑO EN EL PROXIMO PERIODO A EVALUAR, U OTRAS OBSERVACIONES.
          </p>
          <div className="acciones">
            <Renglones texto={ev.acciones} lineas={7} />
            <div className="firma-fila normal">
              <div className="firma-linea">Firma del Evaluado</div>
              <div className="sello">SELLO</div>
              <div className="firma-linea fecha">
                <span className="fecha-val">{fechaCorta(ev.fechaAcciones)}</span>
                Fecha
              </div>
            </div>
          </div>
        </div>
        <Pie n={4} />
      </section>

      <style jsx global>{`
        .eval-desempeno {
          color: #000;
          font-family: "Myriad Pro Cond", "Myriad Pro", "Arial Narrow", "Roboto Condensed", Arial, sans-serif;
          font-stretch: condensed;
          font-size: 9pt;
          line-height: 1.15;
        }
        .eval-desempeno p {
          margin: 0;
        }
        .eval-desempeno .hoja {
          position: relative;
          box-sizing: border-box;
          width: 8.5in;
          height: 11in;
          padding: 0.3in 0.4in 0.5in;
          margin: 0 auto 0.3in;
          background: #fff;
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.18);
          overflow: hidden;
        }
        .eval-desempeno .val {
          font-family: Arial, Helvetica, sans-serif;
          font-stretch: normal;
          font-size: 10pt;
        }
        .eval-desempeno .val.grande {
          font-size: 12pt;
        }
        .eval-desempeno .et {
          font-size: 8.5pt;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .eval-desempeno .subrayado {
          font-weight: 700;
          text-decoration: underline;
        }

        /* Encabezado */
        .eval-desempeno .encabezado {
          display: flex;
          align-items: center;
          gap: 0.3in;
        }
        .eval-desempeno .logo {
          width: 1.3in;
          flex-shrink: 0;
        }
        .eval-desempeno .logo img {
          width: 100%;
          height: auto;
          filter: brightness(0.35);
        }
        .eval-desempeno .hospital {
          flex: 1;
          text-align: center;
          font-family: Arial, Helvetica, sans-serif;
          font-stretch: normal;
          font-size: 20pt;
          line-height: 1.1;
          padding-right: 1in;
        }
        .eval-desempeno .regla {
          border-top: 1.5px solid #000;
          margin: 0.05in 0 0.05in;
        }
        .eval-desempeno .subtitulo {
          text-align: center;
          font-size: 12.5pt;
        }
        .eval-desempeno .titulo-fila {
          display: flex;
          align-items: flex-end;
          gap: 0.1in;
          margin-bottom: 0.03in;
        }
        .eval-desempeno .titulo {
          text-align: center;
          font-size: 19pt;
          font-weight: 800;
          line-height: 1.1;
        }
        .eval-desempeno .titulo-fila .titulo {
          flex: 1;
          padding-right: 0.35in;
        }
        .eval-desempeno .seccion {
          font-weight: 700;
          font-size: 9.5pt;
          margin: 0.05in 0 0.02in;
        }
        .eval-desempeno .seccion-i {
          flex-shrink: 0;
          margin: 0;
          white-space: nowrap;
        }

        /* Datos generales */
        .eval-desempeno .datos {
          border: 1px solid #000;
        }
        .eval-desempeno .fila {
          display: flex;
          border-bottom: 1px solid #000;
        }
        .eval-desempeno .fila:last-child {
          border-bottom: 0;
        }
        .eval-desempeno .celda {
          box-sizing: border-box;
          padding: 0.02in 0.07in;
          min-height: 0.26in;
          display: flex;
          align-items: center;
          gap: 0.06in;
          border-right: 1px solid #000;
          overflow: hidden;
        }
        .eval-desempeno .celda:last-child {
          border-right: 0;
        }
        .eval-desempeno .flex1 {
          flex: 1;
          min-width: 0;
        }
        .eval-desempeno .centro {
          justify-content: center;
        }
        .eval-desempeno .val-ancho {
          display: inline-block;
          min-width: 0.9in;
          text-align: center;
        }
        .eval-desempeno .val-corto {
          display: inline-block;
          min-width: 0.4in;
          text-align: center;
        }
        .eval-desempeno .unidad {
          min-height: 0.6in;
          padding: 0.06in 0.08in;
          gap: 0.15in;
        }
        .eval-desempeno .unidad-caja {
          width: 1.4in;
          height: 0.45in;
          border: 1px solid #000;
          flex-shrink: 0;
          align-self: flex-end;
        }
        .eval-desempeno .unidad-texto {
          flex: 1;
          text-align: center;
        }

        /* Factores */
        .eval-desempeno .factores {
          border: 1px solid #000;
        }
        .eval-desempeno .factor + .factor {
          border-top: 1.5px solid #000;
        }
        .eval-desempeno .factor-enc {
          padding: 0.02in 0.07in 0.03in;
          border-bottom: 1px solid #000;
        }
        .eval-desempeno .factor-titulo {
          font-weight: 700;
          font-size: 11pt;
          letter-spacing: 0.14em;
        }
        .eval-desempeno .factor-def {
          font-weight: 700;
          font-size: 10pt;
        }
        .eval-desempeno .factor-opciones {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
        }
        .eval-desempeno .opcion {
          padding: 0.02in 0.05in 0.04in;
          border-right: 1px solid #000;
        }
        .eval-desempeno .opcion:last-child {
          border-right: 0;
        }
        .eval-desempeno .opcion-enc {
          position: relative;
          height: 0.25in;
          text-align: center;
        }
        .eval-desempeno .opcion-letra {
          font-weight: 700;
          font-size: 11pt;
        }
        .eval-desempeno .opcion-enc .casilla {
          position: absolute;
          right: 0;
          top: 0.02in;
        }
        .eval-desempeno .opcion-texto {
          font-size: 9.4pt;
          line-height: 1.18;
          white-space: pre-line;
        }
        .eval-desempeno .casilla {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 0.38in;
          height: 0.22in;
          border: 1px solid #000;
          font-family: Arial, Helvetica, sans-serif;
          font-weight: 700;
          font-size: 12pt;
          vertical-align: middle;
        }

        /* Tabla de valoración */
        .eval-desempeno .valoracion {
          display: flex;
          justify-content: space-between;
          gap: 0.3in;
          margin-top: 0.08in;
        }
        .eval-desempeno .tabla-titulo {
          text-align: center;
          font-weight: 700;
          font-size: 11pt;
          letter-spacing: 0.12em;
          margin-bottom: 0.03in;
        }
        .eval-desempeno .rangos .tabla-titulo {
          letter-spacing: 0;
        }
        .eval-desempeno table {
          border-collapse: collapse;
        }
        .eval-desempeno .tabla-valoracion td,
        .eval-desempeno .tabla-valoracion th {
          border: 1px solid #000;
          padding: 0.02in 0.06in;
          text-align: center;
          width: 0.42in;
          font-size: 10pt;
        }
        .eval-desempeno .tabla-valoracion th {
          font-weight: 700;
        }
        .eval-desempeno .tabla-valoracion .col-factor {
          text-align: left;
          width: 2.5in;
        }
        .eval-desempeno .tabla-valoracion th.col-factor {
          text-align: center;
          letter-spacing: 0.1em;
        }
        .eval-desempeno .rangos {
          width: 3.2in;
        }
        .eval-desempeno .rangos table {
          width: 100%;
        }
        .eval-desempeno .rangos td {
          border: 1px solid #000;
          padding: 0.02in 0.08in;
        }
        .eval-desempeno .rango-nombre {
          font-weight: 700;
          width: 45%;
        }
        .eval-desempeno .rango-texto {
          font-family: Arial, Helvetica, sans-serif;
          font-stretch: normal;
        }
        .eval-desempeno .puntaje {
          margin: 0.35in auto 0;
          width: 2.1in;
          border: 1px solid #000;
          padding: 0.02in 0.06in;
          display: flex;
          align-items: center;
          gap: 0.3in;
          font-weight: 700;
        }

        /* Página 3 */
        .eval-desempeno .registro-titulo {
          border: 1.5px solid #000;
          padding: 0.06in;
          margin: 0.15in 0 0.12in;
        }
        .eval-desempeno .registro-titulo .subtitulo {
          font-size: 13pt;
        }
        .eval-desempeno .tabla-personas {
          width: 100%;
          border: 2px solid #000;
          margin-bottom: 0.08in;
          font-family: Arial, Helvetica, sans-serif;
          font-stretch: normal;
        }
        .eval-desempeno .tabla-personas td {
          border: 1px solid #000;
          padding: 0.05in 0.08in;
          font-size: 10.5pt;
        }
        .eval-desempeno .tp-et {
          width: 36%;
        }
        .eval-desempeno .tp-val {
          font-size: 11pt;
        }
        .eval-desempeno .observan {
          border: 2px double #000;
          padding: 0.04in 0.06in 0.1in;
          margin-bottom: 0.12in;
        }
        .eval-desempeno .observan-titulo {
          text-align: center;
          font-family: Arial, Helvetica, sans-serif;
          font-stretch: normal;
          font-size: 12pt;
          margin-bottom: 0.04in;
        }
        .eval-desempeno .observan-fila {
          display: flex;
          gap: 0.1in;
          justify-content: space-between;
        }
        .eval-desempeno .observan-fila.centrada {
          justify-content: center;
          gap: 0.2in;
          margin-top: 0.1in;
        }
        .eval-desempeno .observan-caja {
          border: 3px double #000;
          padding: 0.03in 0.06in;
          font-size: 10.5pt;
          font-stretch: normal;
          font-family: Calibri, Carlito, Arial, sans-serif;
        }
        .eval-desempeno .observan-caja.alta {
          width: 2in;
          min-height: 0.45in;
        }
        .eval-desempeno .incidentes {
          width: 100%;
          border: 1px solid #000;
          font-family: Arial, Helvetica, sans-serif;
          font-stretch: normal;
        }
        .eval-desempeno .incidentes th {
          border: 1px solid #000;
          font-weight: 400;
          font-size: 10.5pt;
          padding: 0.04in;
        }
        .eval-desempeno .incidentes td {
          border-left: 1px solid #000;
          border-right: 1px solid #000;
          border-bottom: 1px dotted #555;
          height: 0.31in;
          text-align: center;
          font-size: 9.5pt;
          padding: 0 0.04in;
        }
        .eval-desempeno .incidentes td.desc {
          text-align: left;
        }
        .eval-desempeno .leyenda {
          margin: 0.06in 0 0.12in;
          font-size: 10pt;
        }
        .eval-desempeno .leyenda strong {
          display: inline-block;
          width: 0.35in;
        }
        .eval-desempeno .leyenda span {
          font-weight: 700;
        }
        .eval-desempeno .caja-obs {
          border: 1px solid #555;
          padding: 0.03in 0.05in;
        }
        .eval-desempeno .et-normal {
          font-family: Arial, Helvetica, sans-serif;
          font-stretch: normal;
          font-size: 10.5pt;
        }
        .eval-desempeno .renglones {
          font-family: Arial, Helvetica, sans-serif;
          font-stretch: normal;
          font-size: 10pt;
          position: relative;
        }
        .eval-desempeno .renglon {
          height: 0.27in;
          border-bottom: 1px solid #999;
        }
        .eval-desempeno .renglon:nth-last-child(2) {
          border-bottom: 0;
        }
        .eval-desempeno .renglones-texto {
          position: absolute;
          inset: 0;
          padding: 0.03in 0.08in 0;
          line-height: 0.27in;
          white-space: pre-wrap;
          overflow: hidden;
        }

        /* Página 4 */
        .eval-desempeno .marco {
          border: 2px solid #000;
          padding: 0.05in;
        }
        .eval-desempeno .resultados {
          border: 1px solid #000;
          font-family: Calibri, Carlito, Arial, sans-serif;
          font-stretch: normal;
          font-size: 12pt;
        }
        .eval-desempeno .res-fila {
          display: flex;
          border-bottom: 1px solid #000;
        }
        .eval-desempeno .res-et {
          width: 35%;
          padding: 0.06in 0.12in;
          border-right: 1px solid #000;
        }
        .eval-desempeno .res-val {
          flex: 1;
          padding: 0.06in 0.12in;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 11pt;
        }
        .eval-desempeno .res-bloque {
          padding: 0.08in 0.12in 0.12in;
          border-bottom: 1px solid #000;
        }
        .eval-desempeno .calificaciones {
          display: flex;
          justify-content: space-around;
          margin-top: 0.12in;
        }
        .eval-desempeno .calif {
          display: inline-flex;
          align-items: center;
          gap: 0.15in;
        }
        .eval-desempeno .res-coment-et {
          padding: 0.05in 0.12in;
          border-bottom: 1px solid #000;
        }
        .eval-desempeno .firmas {
          border: 1px solid #000;
          margin-top: 0.08in;
          padding: 0.04in 0.3in;
        }
        .eval-desempeno .firma-fila {
          display: flex;
          align-items: flex-end;
          gap: 0.15in;
          padding: 0.04in 0;
        }
        .eval-desempeno .firma-linea {
          flex: 1;
          border-top: 1px solid #000;
          text-align: center;
          font-weight: 700;
          font-size: 10.5pt;
          padding-top: 0.02in;
          margin-bottom: 0.28in;
          position: relative;
        }
        .eval-desempeno .firma-fila.normal .firma-linea {
          font-weight: 400;
          font-family: Calibri, Carlito, Arial, sans-serif;
          font-stretch: normal;
          font-size: 12pt;
        }
        .eval-desempeno .fecha-val {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 100%;
          font-family: Arial, Helvetica, sans-serif;
          font-weight: 400;
          font-size: 12pt;
          padding-bottom: 0.03in;
        }
        .eval-desempeno .firma-nombre {
          font-size: 11pt;
          white-space: nowrap;
        }
        .eval-desempeno .sello {
          width: 1.05in;
          height: 0.7in;
          border: 1px solid #888;
          border-radius: 0.1in;
          display: flex;
          align-items: center;
          justify-content: center;
          letter-spacing: 0.2em;
          color: #444;
          font-weight: 700;
          flex-shrink: 0;
        }
        .eval-desempeno .comunicacion,
        .eval-desempeno .acciones {
          border: 1px solid #000;
        }
        .eval-desempeno .renglon-texto {
          font-family: Calibri, Carlito, Arial, sans-serif;
          font-stretch: normal;
          font-size: 11pt;
          padding: 0.03in 0.12in;
          border-bottom: 1px solid #000;
        }
        .eval-desempeno .comunicacion .firma-fila,
        .eval-desempeno .acciones .firma-fila {
          padding: 0.08in 0.6in 0;
          border-top: 1px solid #000;
        }
        .eval-desempeno .acciones-titulo {
          border: 1px solid #000;
          border-bottom: 0;
          font-weight: 700;
          font-size: 10pt;
          padding: 0.05in 0.06in;
          margin-top: 0.06in;
        }
        .eval-desempeno .pie {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0.22in;
          text-align: center;
          font-weight: 700;
          font-size: 10pt;
        }

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
          .eval-desempeno .hoja {
            margin: 0;
            box-shadow: none;
            break-after: page;
            page-break-after: always;
          }
          .eval-desempeno .hoja:last-child {
            break-after: auto;
            page-break-after: auto;
          }
        }
      `}</style>
    </div>
  );
}
