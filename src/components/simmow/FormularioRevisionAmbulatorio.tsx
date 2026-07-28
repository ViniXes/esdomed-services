"use client";

import { ArrowLeft } from "lucide-react";
import { MedicoCombobox } from "./MedicoCombobox";
import type { DatosSimmowAmbulatorio } from "@/lib/simmow/ambulatorioTypes";
import styles from "./FormularioRevision.module.css";

interface Props {
  datos: DatosSimmowAmbulatorio;
  onChange: (patch: Partial<DatosSimmowAmbulatorio>) => void;
  onVolver: () => void;
}

// Listas de opciones reales de SIMMOW (verificadas en vivo contra el
// formulario real de Ingreso/Edición Consulta Curativa).
const OP_TIPO_ATENCION = ["Cuidados Paliativos", "Rehabilitacion"];
const OP_ESPECIALIDAD = ["Emergencia", "Seleccion"];
const OP_DISCAPACIDAD = ["1 - Fisica", "2 - Auditiva", "3 - Visual", "4 - Mental", "5 - Mas de una", "6 - Intelectual"];
const OP_VIOLENCIA_TIPO = ["1 - Fisica", "2 - Psicologica", "3 - Sexual", "4 - Mas de Una"];
const OP_VIOLENCIA_CONDICION = [
  "1-NNA Situac Calle",
  "2-NNA Trabajo Infantil",
  "3-Trata Personas",
  "4-Explotacion Sexual",
  "5-Desp. Forzado",
];
const OP_VIOLENCIA_AMBITO = ["1 - Intrafamiliar", "2 - Comunidad", "3 - Educativo", "4 - Laboral"];
const OP_PROC_SALUD_MENTAL = [
  "1-Prueba Psicosometrica",
  "2-Psicoterapia Individual",
  "3-Intervención en Crisis",
  "4-Primeros Aux. Psicologicos",
  "5-Int. Breve Cesación Tabaco",
];
const OP_DERECHOHABIENTE_OTROS = [
  "3 - Veterano de Guerra",
  "4 - Cotizante ISBM",
  "5 - Beneficiario ISBM",
  "6 - Cotizante IPSFA",
  "7 - Beneficiario IPSFA",
  "8 - Beneficiario VG",
];
const OP_VICTIMA_DH = ["1-Sentencia CIDH", "2-Mozote", "3-Decreto 204"];
const OP_PRIVADO_LIBERTAD = [
  "1-Centro penal",
  "2-Centro intermedio",
  "3-Bartolina",
  "4-Centro Integracion Social",
  "5-Primera infancia (CDI)",
  "6-Primera infancia (CBI)",
  "7-Acogimiento emergencia e institucional",
];

/**
 * Réplica visual exacta de la tabla real de SIMMOW "Ingreso/Edición Consulta
 * Curativa / Atención Preventiva" (colores, columnas y combinación de filas
 * extraídos en vivo de la página real) — mismo criterio que FormularioRevision
 * del flujo hospitalario: el personal compara campo por campo contra la
 * pantalla real, así que el orden/posición visual debe coincidir, no solo los
 * colores generales. No incluye las secciones de odontología/planificación
 * familiar/nutrición/tamizaje de cáncer (fuera del alcance de este flujo).
 */
export function FormularioRevisionAmbulatorio({ datos, onChange, onVolver }: Props) {
  const v = (campo: keyof DatosSimmowAmbulatorio): string => String(datos[campo] ?? "");
  const set =
    (campo: keyof DatosSimmowAmbulatorio) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      onChange({ [campo]: e.target.value } as Partial<DatosSimmowAmbulatorio>);
    };

  const texto = (campo: keyof DatosSimmowAmbulatorio, className: string) => (
    <input key={campo} className={className} value={v(campo)} onChange={set(campo)} />
  );

  const areaTexto = (campo: keyof DatosSimmowAmbulatorio, className: string) => (
    <textarea key={campo} className={className} value={v(campo)} onChange={set(campo)} />
  );

  const selectOp = (campo: keyof DatosSimmowAmbulatorio, opciones: string[]) => (
    <select key={campo} value={v(campo)} onChange={set(campo)}>
      <option value=""></option>
      {opciones.map((op) => (
        <option key={op} value={op}>
          {op}
        </option>
      ))}
    </select>
  );

  const radioGrupo = (
    campo: keyof DatosSimmowAmbulatorio,
    opciones: { valor: string; etiqueta: string }[],
    nombreGrupo: string
  ) =>
    opciones.map((op) => (
      <label key={op.valor}>
        <input
          type="radio"
          name={nombreGrupo}
          checked={v(campo) === op.valor}
          onChange={() => onChange({ [campo]: op.valor } as Partial<DatosSimmowAmbulatorio>)}
        />{" "}
        {op.etiqueta}{" "}
      </label>
    ));

  const checkbox = (campo: keyof DatosSimmowAmbulatorio, etiqueta: string) => (
    <label>
      <input
        type="checkbox"
        checked={!!datos[campo]}
        onChange={(e) => onChange({ [campo]: e.target.checked } as Partial<DatosSimmowAmbulatorio>)}
      />{" "}
      {etiqueta}
    </label>
  );

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
                  {texto("amenorreaSemanas", styles.mini)}&nbsp;Semanas
                </td>
              </tr>

              <tr>
                <td className={styles.label}></td>
                <td className={styles.cell}>
                  Modalidad {texto("modalidadValor", styles.mini)}
                  <br />
                  Fecha{" "}
                  <input
                    className={styles.fecha}
                    value={v("fecha")}
                    readOnly
                    title="La fecha se confirma una sola vez para todo el lote, en la pantalla de carga."
                  />
                  <br />
                  Semana Epidemiológica{" "}
                  <input
                    className={styles.mini}
                    value={v("semanaEpidemiologica")}
                    readOnly
                    title="Se calcula sola a partir de la fecha confirmada (calendario epidemiológico MMWR/CDC)."
                  />
                  <br />
                  {checkbox("soloPreventivo", "Solo Preventivo")}
                  <br />
                  Tipo Atención {selectOp("tipoAtencionValor", OP_TIPO_ATENCION)}
                </td>
                <td className={styles.labelDer}>&nbsp;&nbsp;Diagnóstico Principal</td>
                <td className={styles.cell}>
                  {radioGrupo(
                    "dptconValor",
                    [
                      { valor: "1", etiqueta: "Primera vez" },
                      { valor: "2", etiqueta: "Subsecuente" },
                    ],
                    "dptcon_ui"
                  )}
                  {checkbox("dpstMarcado", "Sospecha?")}
                  <br />
                  Especialista{" "}
                  {radioGrupo(
                    "especialistaValor",
                    [
                      { valor: "0", etiqueta: "N/A" },
                      { valor: "1", etiqueta: "1a. Vez" },
                      { valor: "2", etiqueta: "Subsecuente" },
                    ],
                    "especialista_ui"
                  )}
                  <br />
                  &nbsp;Código:
                  {texto("diagPrincipalCodigo", styles.codigo)}
                  &nbsp;&nbsp;
                  {areaTexto("diagPrincipalTexto", styles.dx)}
                </td>
              </tr>

              <tr>
                <td className={styles.labelKhaki}></td>
                <td className={styles.cell}>
                  <b>Servicio: Emergencia</b>
                  <br />
                  <b>Recurso: Médico</b>
                  <br />
                  <b>MINSAL</b>
                </td>
                <td className={styles.labelDer}>&nbsp;&nbsp;Diagnóstico Secundario</td>
                <td className={styles.cell}>
                  {radioGrupo(
                    "dstconValor",
                    [
                      { valor: "1", etiqueta: "Primera vez" },
                      { valor: "2", etiqueta: "Subsecuente" },
                    ],
                    "dstcon_ui"
                  )}
                  <br />
                  &nbsp;Código:
                  {texto("diagSecundarioCodigo", styles.codigo)}
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
                  {texto("causaExternaCodigo", styles.codigo)}
                  &nbsp;&nbsp;
                  {areaTexto("causaExternaTexto", styles.dx)}
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Especialidad</td>
                <td className={styles.cell}>{selectOp("especialidadValor", OP_ESPECIALIDAD)}</td>
              </tr>

              <tr>
                <td className={styles.label}></td>
                <td className={styles.cell}>
                  Expediente Clínico {texto("expediente", styles.exp)}
                  <br />
                  DUI {texto("dui", styles.doc)} (sin guion)
                  <br />
                  {checkbox("escuelaPromotora", "Escuela Promotora de la Salud")}
                </td>
                <td className={styles.labelDer}></td>
                <td className={styles.cell}>
                  Discapacidad {selectOp("discapacidadValor", OP_DISCAPACIDAD)}
                  <br />
                  Violencia — Tipo {selectOp("violenciaTipoValor", OP_VIOLENCIA_TIPO)}
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
                <td className={styles.cell}>{texto("paciente", styles.dir)}</td>
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
                  {texto("numeroAfiliacion", styles.doc)}
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Edad</td>
                <td className={styles.cell}>
                  {texto("edadAnios", styles.mini)} años&nbsp;&nbsp;
                  <input className={styles.mini} value={v("edadMeses")} readOnly /> meses&nbsp;&nbsp;
                  <input className={styles.mini} value={v("edadDias")} readOnly /> días
                </td>
                <td className={styles.cellWhite}>
                  {radioGrupo(
                    "tipoIsssValor",
                    [
                      { valor: "1", etiqueta: "Cotizante" },
                      { valor: "2", etiqueta: "Beneficiario" },
                    ],
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
                  Derechohabiente Otros {selectOp("derechohabienteOtrosValor", OP_DERECHOHABIENTE_OTROS)} N°
                  {texto("derechohabienteOtrosNumero", styles.doc)}
                  <br />
                  {checkbox("victimaDH", "Víctima DH")} {selectOp("victimaDHValor", OP_VICTIMA_DH)}
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Departamento</td>
                <td className={styles.cell}>{texto("departamento", styles.nombre)}</td>
                <td className={styles.labelDer}>&nbsp;&nbsp;Referido De / Interconsulta De</td>
                <td className={styles.cell}>
                  {radioGrupo(
                    "refdeValor",
                    [
                      { valor: "1", etiqueta: "Sin Ref" },
                      { valor: "2", etiqueta: "Priv" },
                      { valor: "3", etiqueta: "Establec" },
                      { valor: "4", etiqueta: "Interconsulta" },
                    ],
                    "refde_ui"
                  )}
                  <br />
                  Establecimiento {texto("establecimientoReferidoCodigo", styles.codigo)}
                  <br />
                  <span style={{ fontSize: "7pt", color: "#555" }}>
                    {v("establecimientoReferidoTexto") || "(sin referido)"}
                  </span>
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Distrito</td>
                <td className={styles.cell}>{texto("municipio", styles.nombre)}</td>
                <td className={styles.labelDer} rowSpan={2}>
                  &nbsp;&nbsp;Referido A / Interconsulta A
                </td>
                <td className={styles.cell} rowSpan={2}>
                  {radioGrupo(
                    "refAValor",
                    [
                      { valor: "1", etiqueta: "Sin Ref" },
                      { valor: "2", etiqueta: "Priv" },
                      { valor: "3", etiqueta: "Establec" },
                      { valor: "4", etiqueta: "Interconsulta" },
                    ],
                    "refa_ui"
                  )}
                  <br />
                  Establecimiento {texto("refAEstablecimientoCodigo", styles.codigo)}
                  <br />
                  {checkbox("referidoAFisioterapia", "Referido A Fisioterapia")}
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
                  {texto("ucsf", styles.mini)}
                  {texto("ucsfNombre", styles.nombre)}
                </td>
                <td className={styles.labelDer}>&nbsp;&nbsp;Privado de Libertad</td>
                <td className={styles.cell}>{selectOp("privadoLibertadTexto", OP_PRIVADO_LIBERTAD)}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ color: "#ffffff", fontSize: "7pt", marginTop: 10, opacity: 0.8 }}>
            Los campos sin dato de origen en los reportes del SIS quedan vacíos — complételos aquí mismo si aplican
            y se incluirán en el código generado.
          </p>
        </div>
      </div>
    </div>
  );
}
