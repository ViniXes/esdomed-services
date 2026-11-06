"use client";

import { ArrowLeft } from "lucide-react";
import { MedicoCombobox } from "./MedicoCombobox";
import type { DatosSimmowConsultaExterna } from "@/lib/simmow/consultaExternaTypes";
import {
  OP_CONTROL,
  OP_DEPARTAMENTO,
  OP_DERECHOHABIENTE_OTROS,
  OP_DETECCION_CANCER,
  OP_DISCAPACIDAD,
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
  OP_TABAQUISMO,
  OP_TALLA_EDAD,
  OP_TIPO_ISSS,
  OP_VICTIMA_DH,
  OP_VIOLENCIA_AMBITO,
  OP_VIOLENCIA_CONDICION,
  type OpcionSimmow,
} from "@/lib/simmow/consultaExternaOpciones";
import styles from "./FormularioRevision.module.css";

interface Props {
  datos: DatosSimmowConsultaExterna;
  /** Semana epidemiológica calculada a partir de la fecha ("" si la fecha no es válida). */
  semana: string;
  onChange: (patch: Partial<DatosSimmowConsultaExterna>) => void;
  onVolver: () => void;
}

type CampoTexto = {
  [K in keyof DatosSimmowConsultaExterna]: DatosSimmowConsultaExterna[K] extends string ? K : never;
}[keyof DatosSimmowConsultaExterna];
type CampoBool = {
  [K in keyof DatosSimmowConsultaExterna]: DatosSimmowConsultaExterna[K] extends boolean ? K : never;
}[keyof DatosSimmowConsultaExterna];

const RADIO_REFERENCIA: OpcionSimmow[] = [
  { valor: "1", etiqueta: "Sin Ref" },
  { valor: "2", etiqueta: "Priv" },
  { valor: "3", etiqueta: "Establec" },
  { valor: "4", etiqueta: "Interconsulta" },
];

/**
 * Réplica visual de la tabla real de SIMMOW "Ingreso/Edición Consulta Curativa /
 * Atención Preventiva" para Consulta Externa (colores, filas y combinación de
 * celdas leídos en vivo de conrec.php) — mismo criterio que
 * FormularioRevisionAmbulatorio: el personal compara campo por campo contra la
 * pantalla real. A diferencia de Ambulatoria, incluye la sección de Atención
 * Preventiva (la que el censo sí llena). Los campos sin dato de origen se
 * muestran deshabilitados.
 */
export function FormularioRevisionConsultaExterna({ datos, semana, onChange, onVolver }: Props) {
  const v = (campo: CampoTexto): string => datos[campo];
  const set =
    (campo: CampoTexto) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      onChange({ [campo]: e.target.value } as Partial<DatosSimmowConsultaExterna>);
    };

  const texto = (campo: CampoTexto, className: string, maxLength?: number) => (
    <input key={campo} className={className} value={v(campo)} maxLength={maxLength} onChange={set(campo)} />
  );

  const areaTexto = (campo: CampoTexto, className: string) => (
    <textarea key={campo} className={className} value={v(campo)} onChange={set(campo)} />
  );

  // Select con el value numérico de SIMMOW; si el reporte trajo un valor que no es opción, se muestra para poder corregirlo.
  const selectOp = (campo: CampoTexto, opciones: OpcionSimmow[], className?: string) => {
    const actual = v(campo);
    const conocida = !actual || opciones.some((o) => o.valor === actual);
    return (
      <select key={campo} className={className} value={actual} onChange={set(campo)}>
        <option value=""></option>
        {!conocida && <option value={actual}>{actual} (no es opción de SIMMOW)</option>}
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    );
  };

  const selectVacio = (titulo = "(sin dato de origen)") => (
    <select disabled title={titulo}>
      <option value=""></option>
    </select>
  );

  const radioGrupo = (campo: CampoTexto, opciones: OpcionSimmow[], nombreGrupo: string) =>
    opciones.map((op) => (
      <label key={op.valor}>
        <input
          type="radio"
          name={nombreGrupo}
          checked={v(campo) === op.valor}
          onChange={() => onChange({ [campo]: op.valor } as Partial<DatosSimmowConsultaExterna>)}
        />{" "}
        {op.etiqueta}{" "}
      </label>
    ));

  const checkbox = (campo: CampoBool, etiqueta: string) => (
    <label>
      <input
        type="checkbox"
        checked={datos[campo]}
        onChange={(e) => onChange({ [campo]: e.target.checked } as Partial<DatosSimmowConsultaExterna>)}
      />{" "}
      {etiqueta}
    </label>
  );

  const checkboxVacio = (etiqueta: string) => (
    <label>
      <input type="checkbox" disabled title="(sin dato de origen)" /> {etiqueta}
    </label>
  );

  const TIPO_CONSULTA: OpcionSimmow[] = [
    { valor: "1", etiqueta: "Primera vez" },
    { valor: "2", etiqueta: "Subsecuente" },
  ];
  const ESPECIALISTA: OpcionSimmow[] = [
    { valor: "0", etiqueta: "N/A" },
    { valor: "1", etiqueta: "1a. Vez" },
    { valor: "2", etiqueta: "Subsecuente" },
  ];

  return (
    <div>
      <button onClick={onVolver} className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white mb-3">
        <ArrowLeft size={14} /> Volver a la lista
      </button>

      <div className={styles.wrap}>
        <div className={styles.form}>
          <table className={styles.table}>
            <tbody>
              <tr>
                <td className={styles.title} colSpan={4}>
                  Ingreso / Edición Consulta Curativa / Atención Preventiva
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Establecimiento</td>
                <td className={styles.cell}>
                  <select defaultValue="">
                    <option>Hospital Nacional San Salvador SS El Salvador</option>
                  </select>
                </td>
                <td className={styles.labelDer}>&nbsp;&nbsp;Amenorrea</td>
                <td className={styles.cell}>
                  {texto("amenorreaSemanas", styles.mini, 2)}&nbsp;Semanas
                </td>
              </tr>

              <tr>
                <td className={styles.label}></td>
                <td className={styles.cell}>
                  Modalidad {selectVacio("La modalidad no se coloca en Consulta Externa.")}
                  <br />
                  Fecha{" "}
                  <input
                    className={styles.fecha}
                    value={v("fecha")}
                    maxLength={10}
                    onChange={set("fecha")}
                    title="Sale del encabezado del censo (DD/MM/AAAA). Corríjala aquí si el censo trae un rango."
                  />
                  <br />
                  Semana Epidemiológica{" "}
                  <input
                    className={styles.mini}
                    value={semana}
                    readOnly
                    title="Se calcula sola a partir de la fecha (calendario epidemiológico MMWR/CDC)."
                  />
                  <br />
                  {checkboxVacio("Solo Preventivo")}
                  <br />
                  Tipo Atención {selectVacio()}
                </td>
                <td className={styles.labelDer}>&nbsp;&nbsp;Diagnóstico Principal</td>
                <td className={styles.cell}>
                  {radioGrupo("dptconValor", TIPO_CONSULTA, "dptcon_ui")}
                  {checkbox("dpstMarcado", "Sospecha?")}
                  <br />
                  Especialista {radioGrupo("especialistaValor", ESPECIALISTA, "especialista_ui")}
                  <br />
                  &nbsp;Código:
                  {texto("diagPrincipalCodigo", styles.codigo, 5)}
                  &nbsp;&nbsp;
                  {areaTexto("diagPrincipalTexto", styles.dx)}
                </td>
              </tr>

              <tr>
                <td className={styles.labelKhaki}></td>
                <td className={styles.cell}>
                  <b>Servicio: Consulta Externa</b>
                  <br />
                  <b>Recurso: Médico</b>
                  <br />
                  <b>MINSAL</b>
                </td>
                <td className={styles.labelDer}>&nbsp;&nbsp;Diagnóstico Secundario</td>
                <td className={styles.cell}>
                  {radioGrupo("dstconValor", TIPO_CONSULTA, "dstcon_ui")}
                  <br />
                  &nbsp;Código:
                  {texto("diagSecundarioCodigo", styles.codigo, 5)}
                  &nbsp;&nbsp;
                  {areaTexto("diagSecundarioTexto", styles.dx)}
                </td>
              </tr>

              <tr>
                <td className={styles.labelKhaki}>&nbsp;&nbsp;Código Recurso</td>
                <td className={styles.cell} colSpan={1}>
                  <MedicoCombobox
                    nombre={v("medicoNombre")}
                    codigo={v("medicoCodigoSimmow")}
                    codigoClassName={styles.codigo}
                    nombreClassName={styles.nombre}
                    onChange={(nombreNuevo, codigoNuevo) =>
                      onChange({ medicoNombre: nombreNuevo, medicoCodigoSimmow: codigoNuevo })
                    }
                  />
                </td>
                <td className={styles.labelDer} rowSpan={2}>
                  &nbsp;&nbsp;Causa Externa de Morbilidad
                </td>
                <td className={styles.cell} rowSpan={2}>
                  &nbsp;Código:
                  {texto("causaExternaCodigo", styles.codigo, 5)}
                  &nbsp;&nbsp;
                  {areaTexto("causaExternaTexto", styles.dx)}
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Especialidad</td>
                <td className={styles.cell}>
                  <input
                    className={styles.nombre}
                    value={v("especialidadTexto")}
                    readOnly
                    title="Especialidad tal cual la trae el censo. Aún no tiene equivalencia en el select de SIMMOW: no se envía."
                  />
                </td>
              </tr>

              <tr>
                <td className={styles.label}></td>
                <td className={styles.cell}>
                  Expediente Clínico {texto("expediente", styles.exp)}
                  <br />
                  DUI {texto("dui", styles.doc)} (sin guion)
                  <br />
                  {checkboxVacio("Escuela Promotora de la Salud")}
                </td>
                <td className={styles.labelDer}></td>
                <td className={styles.cell}>
                  Discapacidad {selectOp("discapacidadValor", OP_DISCAPACIDAD)}
                  <br />
                  Violencia — Tipo {selectVacio()}
                  <br />
                  Condición {selectOp("violenciaCondicionValor", OP_VIOLENCIA_CONDICION)}
                  <br />
                  Ámbito {selectOp("violenciaAmbitoValor", OP_VIOLENCIA_AMBITO)}
                  <br />
                  Procedimiento Salud Mental {selectOp("procSaludMentalValor", OP_PROC_SALUD_MENTAL)}
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Nombre del Paciente</td>
                <td className={styles.cell}>{texto("paciente", styles.dir, 40)}</td>
                <td className={styles.labelDer}>&nbsp;&nbsp;Ingreso Hospitalario</td>
                <td className={styles.cell}>{checkbox("ingresoHospitalario", "")}</td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Sexo</td>
                <td className={styles.cell}>
                  {radioGrupo(
                    "sexoValor",
                    [
                      { valor: "1", etiqueta: "Masculino" },
                      { valor: "2", etiqueta: "Femenino" },
                      { valor: "3", etiqueta: "Intersexual" },
                    ],
                    "sexo_ui"
                  )}
                </td>
                <td className={styles.labelDer} rowSpan={2}>
                  &nbsp;&nbsp;Afiliación ISSS
                </td>
                <td className={styles.cell}>
                  {checkbox("isss", "")}&nbsp;N° de Afiliación:
                  {texto("numeroAfiliacion", styles.doc, 12)}
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Edad</td>
                <td className={styles.cell}>
                  {texto("edadAnios", styles.mini)} años&nbsp;&nbsp;
                  {texto("edadMeses", styles.mini)} meses&nbsp;&nbsp;
                  {texto("edadDias", styles.mini)} días
                  <br />
                  <span style={{ fontSize: "7pt", color: "#555" }}>
                    SIMMOW solo admite un tramo: se digita años; si es 0, meses; si es 0, días.
                  </span>
                </td>
                <td className={styles.cellWhite}>
                  {radioGrupo(
                    "tipoIsssValor",
                    OP_TIPO_ISSS.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta.replace(/^\d+ - /, "") })),
                    "tipoisss_ui"
                  )}
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Dirección</td>
                <td className={styles.cell}>
                  <textarea className={styles.dir} value="" readOnly placeholder="(sin dato de origen)" />
                </td>
                <td className={styles.cellWhite} colSpan={2}>
                  <table className={styles.subTable}>
                    <tbody>
                      <tr>
                        <td className={styles.subLabel}>
                          &nbsp;Derechohabiente
                          <br />
                          &nbsp;Otros
                        </td>
                        <td className={styles.subCell}>
                          {selectOp("derechohabienteOtrosValor", OP_DERECHOHABIENTE_OTROS)} N°{" "}
                          {texto("derechohabienteOtrosNumero", styles.doc, 12)}
                        </td>
                      </tr>
                      <tr>
                        <td className={styles.subLabel}>&nbsp;Víctima DH</td>
                        <td className={styles.subCell}>
                          {selectOp("victimaDHValor", OP_VICTIMA_DH)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Departamento</td>
                <td className={styles.cell}>{selectOp("departamentoValor", OP_DEPARTAMENTO, styles.nombre)}</td>
                <td className={styles.labelDer}>&nbsp;&nbsp;Referido De / Interconsulta De</td>
                <td className={styles.cell}>
                  {radioGrupo("refDeValor", RADIO_REFERENCIA, "refde_ui")}
                  <br />
                  Establecimiento {texto("refDeEstablecimientoCodigo", styles.codigo, 4)}
                  <br />
                  <span style={{ fontSize: "7pt", color: "#555" }}>{v("refDeTexto") || "(sin referido)"}</span>
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Distrito</td>
                <td className={styles.cell}>{texto("municipio", styles.nombre)}</td>
                <td className={styles.labelDer} rowSpan={2}>
                  &nbsp;&nbsp;Referido A / Interconsulta A
                </td>
                <td className={styles.cell} rowSpan={2}>
                  {radioGrupo("refAValor", RADIO_REFERENCIA, "refa_ui")}
                  <br />
                  Establecimiento {texto("refAEstablecimientoCodigo", styles.codigo, 4)}
                  <br />
                  <span style={{ fontSize: "7pt", color: "#555" }}>{v("refATexto") || "(sin referido)"}</span>
                  <br />
                  {checkboxVacio("Referido A Fisioterapia")}
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Área</td>
                <td className={styles.cell}>
                  {radioGrupo(
                    "areaValor",
                    [
                      { valor: "1", etiqueta: "Urbana" },
                      { valor: "2", etiqueta: "Rural" },
                    ],
                    "area_ui"
                  )}
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;UCSF / UCSFE</td>
                <td className={styles.cell}>
                  <input className={styles.mini} value="" readOnly />
                  <input className={styles.nombre} value="" readOnly placeholder="(sin dato de origen)" />
                </td>
                <td className={styles.labelDer}>&nbsp;&nbsp;Privado de Libertad</td>
                <td className={styles.cell}>{selectOp("privadoLibertadValor", OP_PRIVADO_LIBERTAD)}</td>
              </tr>

              {/* ── Atención Preventiva ─────────────────────────────────────── */}
              <tr>
                <td className={styles.section} colSpan={4}></td>
              </tr>

              <tr>
                <td className={styles.labelTan}>&nbsp;&nbsp;Tabaquismo</td>
                <td className={styles.cellTan}>{selectOp("tabaquismoValor", OP_TABAQUISMO)}</td>
                <td className={styles.section} colSpan={2}></td>
              </tr>

              <tr>
                <td className={styles.labelTan}>&nbsp;&nbsp;Inscripcion</td>
                <td className={styles.cellTan}>{selectOp("inscripcionValor", OP_INSCRIPCION, styles.ancho)}</td>
                <td className={styles.cellBeige} colSpan={2}>
                  <b>&nbsp;&nbsp;Planificación Familiar ( Método Temporal )</b>
                </td>
              </tr>

              <tr>
                <td className={styles.labelTan}>&nbsp;&nbsp;Control</td>
                <td className={styles.cellTan}>{selectOp("controlValor", OP_CONTROL, styles.ancho)}</td>
                <td className={styles.labelBeige}>&nbsp;&nbsp;Inscripción / Control</td>
                <td className={styles.cellBeige}>{selectOp("pfInscripcionControlValor", OP_PF_IN_CON)}</td>
              </tr>

              <tr>
                <td className={styles.labelTan}>&nbsp;&nbsp;Evaluacion Desarrollo Infantil</td>
                <td className={styles.cellTan}>
                  {selectOp("evaluacionInfantilValor", OP_EVALUACION_INFANTIL)}
                  &nbsp;&nbsp;Perimetro Cefalico {texto("perimetroCefalico", styles.mini, 5)}
                </td>
                <td className={styles.section} colSpan={2}></td>
              </tr>

              <tr>
                <td className={styles.labelTan}>&nbsp;&nbsp;Grupo Dispensarial</td>
                <td className={styles.cellTan}>
                  {selectVacio()} Tipo {selectVacio()}
                </td>
                <td className={styles.labelBeige}>&nbsp;&nbsp;Método</td>
                <td className={styles.cellBeige}>{selectOp("pfMetodoValor", OP_PF_METODO)}</td>
              </tr>

              <tr>
                <td className={styles.labelNut}>&nbsp;&nbsp;Estado Nutricional</td>
                <td className={styles.cellAlt}>{selectVacio()} 2009-2012</td>
                <td className={styles.labelBeige}>&nbsp;&nbsp;Usuaria Activa</td>
                <td className={styles.cellBeige}>{selectOp("pfUsuariaValor", OP_PF_METODO)}</td>
              </tr>

              <tr>
                <td className={styles.labelNut}>&nbsp;&nbsp;Peso - Edad</td>
                <td className={styles.cellAlt}>{selectOp("pesoEdadValor", OP_PESO_EDAD)}</td>
                <td className={styles.cellBeige}></td>
                <td className={styles.cellBeige}></td>
              </tr>

              <tr>
                <td className={styles.labelNut}>&nbsp;&nbsp;Longitud/Talla - Edad</td>
                <td className={styles.cellAlt}>{selectOp("tallaEdadValor", OP_TALLA_EDAD)}</td>
                <td className={styles.cellBeige}></td>
                <td className={styles.cellBeige}></td>
              </tr>

              <tr>
                <td className={styles.labelNut}>&nbsp;&nbsp;Peso - Talla</td>
                <td className={styles.cellAlt}>{selectOp("pesoTallaValor", OP_PESO_TALLA)}</td>
                <td className={styles.cellBeige}></td>
                <td className={styles.cellBeige}></td>
              </tr>

              <tr>
                <td className={styles.labelNut}>&nbsp;&nbsp;Masa Corporal</td>
                <td className={styles.cellAlt}>{selectOp("imcValor", OP_IMC)}</td>
                <td className={styles.cellBeige}></td>
                <td className={styles.cellBeige}></td>
              </tr>

              <tr>
                <td className={styles.labelTan}>&nbsp;&nbsp;Lactancia Materna</td>
                <td className={styles.cellTan}>{selectOp("lactanciaValor", OP_LACTANCIA, styles.ancho)}</td>
                <td className={styles.cellBeige} colSpan={2}>
                  <b>&nbsp;&nbsp;Planificación Familiar ( Método Permanente )</b>
                </td>
              </tr>

              <tr>
                <td className={styles.cellCancer} colSpan={2}>
                  <b>&nbsp;&nbsp;Detección Precoz del Cáncer</b>
                </td>
                <td className={styles.labelBeige}>&nbsp;&nbsp;Control</td>
                <td className={styles.cellBeige}>{selectVacio()} 2009-2012</td>
              </tr>

              <tr>
                <td className={styles.labelCancer}>&nbsp;&nbsp;Examen Clínico</td>
                <td className={styles.cellCancer}>
                  {selectOp("deteccionCancerValor", OP_DETECCION_CANCER, styles.ancho)}
                  <br />
                  {checkboxVacio("Examen de Mama")}
                </td>
                <td className={styles.labelBeige}>&nbsp;&nbsp;Técnica</td>
                <td className={styles.cellBeige}>{selectVacio()} 2009-2012</td>
              </tr>

              <tr>
                <td className={styles.section} colSpan={4}></td>
              </tr>
            </tbody>
          </table>

          <p style={{ color: "#ffffff", fontSize: "7pt", marginTop: 10, opacity: 0.8 }}>
            Los campos sin dato de origen en los reportes del SIS quedan vacíos (los deshabilitados no se envían a SIMMOW).
            Complete aquí mismo los que sí se pueden editar y se incluirán en el código generado.
          </p>
        </div>
      </div>
    </div>
  );
}
