"use client";

import type { CampoSimmow, DatosSimmow } from "@/lib/simmow/types";
import {
  OPCIONES_CIRCUNSTANCIA_ALTA,
  OPCIONES_TIEMPO_INTERVALO,
  OPCIONES_TIPO_ACCIDENTE,
  OPCIONES_TIPO_AFILIACION,
  OPCIONES_TIPO_CIRUGIA,
  OPCIONES_TIPO_DOCUMENTO,
  SERVICIOS_SIMMOW,
} from "@/lib/simmow/catalogoSimmow";
import { EstablecimientoCombobox } from "./EstablecimientoCombobox";
import styles from "./FormularioRevision.module.css";

interface Props {
  datos: DatosSimmow;
  camposNoEncontrados: CampoSimmow[];
  onChange: (patch: Partial<DatosSimmow>) => void;
}

/** Réplica visual de la tabla de SIMMOW — ver FormularioRevision.module.css. */
export function FormularioRevision({ datos, camposNoEncontrados, onChange }: Props) {
  const v = (campo: CampoSimmow): string => datos[campo] ?? "";
  const marcarFaltante = (campo: CampoSimmow) =>
    camposNoEncontrados.includes(campo) ? ` ${styles.alerta}` : "";

  const set =
    (campo: CampoSimmow) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      onChange({ [campo]: e.target.value } as Partial<DatosSimmow>);
    };

  // Funciones (no componentes: nombre en minúscula, invocadas como {texto(...)})
  // para no crear componentes React dentro del render.
  const texto = (
    campo: CampoSimmow,
    className: string,
    opts?: { placeholder?: string; readOnly?: boolean }
  ) => (
    <input
      key={campo}
      className={className + marcarFaltante(campo)}
      value={v(campo)}
      placeholder={opts?.placeholder}
      readOnly={opts?.readOnly}
      onChange={set(campo)}
    />
  );

  const areaTexto = (campo: CampoSimmow, className: string) => (
    <textarea key={campo} className={className + marcarFaltante(campo)} value={v(campo)} onChange={set(campo)} />
  );

  const filaDx = (titulo: string, campoCodigo: CampoSimmow, campoTexto: CampoSimmow) => (
    <tr key={campoCodigo}>
      <td className={styles.label}>&nbsp;&nbsp;{titulo}</td>
      <td className={styles.cell}>
        &nbsp;Código:
        {texto(campoCodigo, styles.codigo)}
        &nbsp;&nbsp;
        {areaTexto(campoTexto, styles.dx)}
      </td>
    </tr>
  );

  const filaDef = (
    titulo: string,
    campoCodigo: CampoSimmow,
    campoTexto: CampoSimmow,
    campoIntervalo: CampoSimmow,
    campoTiempo: CampoSimmow
  ) => (
    <tr key={campoCodigo}>
      <td className={styles.labelDef}>&nbsp;&nbsp;{titulo}</td>
      <td className={styles.cell}>
        &nbsp;Código:
        {texto(campoCodigo, styles.codigo)}
        &nbsp;&nbsp;
        {areaTexto(campoTexto, styles.dx)}
        &nbsp;&nbsp;Intervalo
        {texto(campoIntervalo, styles.mini)}
        <select value={v(campoTiempo)} onChange={set(campoTiempo)}>
          <option value=""></option>
          {OPCIONES_TIEMPO_INTERVALO.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );

  const filaCirugia = (num: 1 | 2 | 3 | 4) => {
    const campoCodigo = `CIRUGIA_${num}_CODIGO` as CampoSimmow;
    const campoTexto = `CIRUGIA_${num}_TEXTO` as CampoSimmow;
    const campoFecha = `CIRUGIA_${num}_FECHA` as CampoSimmow;
    const campoCirujano = `CIRUGIA_${num}_CIRUJANO` as CampoSimmow;
    const campoTipo = `CIRUGIA_${num}_TIPO` as CampoSimmow;

    return (
      <tr key={campoCodigo}>
        <td className={styles.label}>&nbsp;&nbsp;Operación / Intervención Quirúrgica ({num})</td>
        <td className={styles.cell}>
          &nbsp;Código:
          {texto(campoCodigo, styles.codigo)}
          &nbsp;&nbsp;
          {areaTexto(campoTexto, styles.dx)}
          &nbsp;Fecha&nbsp;&nbsp;
          {texto(campoFecha, styles.fecha)}
          <br />
          &nbsp;Cirujano
          {texto(campoCirujano, styles.nombre)}
          &nbsp;Tipo
          <select value={v(campoTipo)} onChange={set(campoTipo)}>
            <option value=""></option>
            {OPCIONES_TIPO_CIRUGIA.map((op) => (
              <option key={op.valor} value={op.valor}>
                {op.etiqueta}
              </option>
            ))}
          </select>
        </td>
      </tr>
    );
  };

  const suspendida = datos.CIRUGIA_SUSPENDIDA_VALOR === "SI";

  return (
    <div className={styles.wrap}>
      <div className={styles.form}>
        <table className={styles.table}>
          <tbody>
            <tr>
              <td className={styles.title} colSpan={2}>
                Ingreso / Edición de Egreso
              </td>
            </tr>

            <tr>
              <td className={styles.cellAlt}>
                <b>&nbsp;&nbsp;Hospital</b>
              </td>
              <td className={styles.cell}>
                <select defaultValue="">
                  <option>Hospital Nacional San Salvador SS El Salvador</option>
                </select>
              </td>
            </tr>

            <tr>
              <td className={styles.section} colSpan={2}>
                &nbsp;&nbsp;Información del Paciente :
              </td>
            </tr>

            <tr>
              <td className={styles.label}>&nbsp;&nbsp;Documento de Identidad</td>
              <td className={styles.cell}>
                <select value={v("TIPO_DOCUMENTO_VALOR")} onChange={set("TIPO_DOCUMENTO_VALOR")}>
                  <option value=""></option>
                  {OPCIONES_TIPO_DOCUMENTO.map((op) => (
                    <option key={op.valor} value={op.valor}>
                      {op.etiqueta}
                    </option>
                  ))}
                </select>
                &nbsp;&nbsp;Número
                {texto("NUM_DOCUMENTO", styles.doc)}
                &nbsp;(sin guiones)
              </td>
            </tr>

            <tr>
              <td className={styles.label}>&nbsp;&nbsp;Afiliación</td>
              <td className={styles.cell}>
                <select value={v("TIPO_AFILIACION_VALOR")} onChange={set("TIPO_AFILIACION_VALOR")}>
                  <option value=""></option>
                  {OPCIONES_TIPO_AFILIACION.map((op) => (
                    <option key={op.valor} value={op.valor}>
                      {op.etiqueta}
                    </option>
                  ))}
                </select>
                &nbsp;&nbsp;Número
                {texto("NUM_AFILIACION", styles.doc)}
                &nbsp;(sin guiones)
              </td>
            </tr>

            <tr>
              <td className={styles.label}>
                &nbsp;<b>[ Apellidos,Nombres ] [ Exped. Clínico ]</b>
              </td>
              <td className={styles.cell}>
                {texto("APELLIDOS", styles.nombre, { readOnly: true })}
                {texto("NOMBRES", styles.nombre, { readOnly: true })}
                &nbsp;&nbsp;
                {texto("NEC", styles.exp)}
              </td>
            </tr>

            <tr>
              <td className={styles.cell} colSpan={2}>
                {texto("PRIMER_APELLIDO", styles.nombre, { placeholder: "Primer Apellido" })}
                {texto("SEGUNDO_APELLIDO", styles.nombre, { placeholder: "Segundo Apellido" })}
                {texto("TERCER_APELLIDO", styles.nombre, { placeholder: "Tercer Apellido" })}
              </td>
            </tr>

            <tr>
              <td className={styles.cell} colSpan={2}>
                {texto("PRIMER_NOMBRE", styles.nombre, { placeholder: "Primer Nombre" })}
                {texto("SEGUNDO_NOMBRE", styles.nombre, { placeholder: "Segundo Nombre" })}
                {texto("TERCER_NOMBRE", styles.nombre, { placeholder: "Tercer Nombre" })}
              </td>
            </tr>

            <tr>
              <td className={styles.label}>
                &nbsp;&nbsp;<b>Edad</b>
              </td>
              <td className={styles.cell}>
                {texto("EDAD_ANIOS", styles.mini)} años&nbsp;&nbsp;
                <input className={styles.mini} value="0" readOnly /> meses&nbsp;&nbsp;
                <input className={styles.mini} value="0" readOnly /> días&nbsp;&nbsp;
                <input className={styles.mini} value="0" readOnly /> horas&nbsp;
                <input className={styles.mini} value="0" readOnly /> minutos
              </td>
            </tr>

            <tr>
              <td className={styles.label}>
                &nbsp;&nbsp;<b>Sexo</b>
              </td>
              <td className={styles.cell}>
                {(["Masculino", "Femenino", "Intersexual"] as const).map((op) => (
                  <label key={op}>
                    <input
                      type="radio"
                      name="sexo_ui"
                      checked={v("SEXO") === op}
                      onChange={() => onChange({ SEXO: op })}
                    />{" "}
                    {op}{" "}
                  </label>
                ))}
              </td>
            </tr>

            <tr>
              <td className={styles.label}>&nbsp;&nbsp;Dirección Habitual</td>
              <td className={styles.cell}>{areaTexto("DIRECCION", styles.dir)}</td>
            </tr>

            <tr>
              <td className={styles.label}>
                &nbsp;&nbsp;<b>[ Departamento ] [ Distrito ]</b>
              </td>
              <td className={styles.cell}>
                {texto("DEPARTAMENTO", styles.nombre, { placeholder: "Departamento" })}
                {texto("DISTRITO", styles.nombre, { placeholder: "Distrito" })}
              </td>
            </tr>

            <tr>
              <td className={styles.label}>&nbsp;&nbsp;Cantón</td>
              <td className={styles.cell}>{texto("CANTON", styles.nombre)}</td>
            </tr>

            <tr>
              <td className={styles.label}>
                &nbsp;&nbsp;<b>Área</b>
              </td>
              <td className={styles.cell}>
                {(["Urbana", "Rural"] as const).map((op) => (
                  <label key={op}>
                    <input
                      type="radio"
                      name="area_ui"
                      checked={v("AREA") === op}
                      onChange={() => onChange({ AREA: op })}
                    />{" "}
                    {op === "Urbana" ? "Urbano" : "Rural"}{" "}
                  </label>
                ))}
              </td>
            </tr>

            <tr>
              <td className={styles.section} colSpan={2}>
                &nbsp;&nbsp;Información del Ingreso :
              </td>
            </tr>

            <tr>
              <td className={styles.label}>
                &nbsp;&nbsp;<b>Fecha</b>
              </td>
              <td className={styles.cell}>
                {texto("FECHA_INGRESO", styles.fecha)}
                &nbsp;&nbsp;Hora
                {texto("HORA_INGRESO", styles.mini)}
                &nbsp;&nbsp;Tipo de Accidente
                <select value={v("TIPO_ACCIDENTE_VALOR")} onChange={set("TIPO_ACCIDENTE_VALOR")}>
                  <option value=""></option>
                  {OPCIONES_TIPO_ACCIDENTE.map((op) => (
                    <option key={op.valor} value={op.valor}>
                      {op.etiqueta}
                    </option>
                  ))}
                </select>
              </td>
            </tr>

            <tr>
              <td className={styles.section} colSpan={2}>
                &nbsp;&nbsp;Información del Egreso :
              </td>
            </tr>

            {filaDx("Diagnóstico Principal", "DIAG_PRINCIPAL_CODIGO", "DIAG_PRINCIPAL_TEXTO")}
            {filaDx("Diagnóstico Complementario (1)", "DIAG_C_CODIGO", "DIAG_C_TEXTO")}
            {filaDx("Diagnóstico Complementario (2)", "DIAG_B_CODIGO", "DIAG_B_TEXTO")}
            {filaDx("Diagnóstico Complementario (3)", "DIAG_A_CODIGO", "DIAG_A_TEXTO")}
            {filaDx("Diagnóstico Complementario (4)", "DIAG_II1_CODIGO", "DIAG_II1_TEXTO")}
            {filaDx("Diagnóstico Complementario (5)", "DIAG_II2_CODIGO", "DIAG_II2_TEXTO")}

            <tr>
              <td className={styles.label}>
                &nbsp;&nbsp;Causa Externa
                <br />
                &nbsp;&nbsp;( Relacionada al Diagnóstico Principal )
              </td>
              <td className={styles.cell}>
                &nbsp;Código:
                {texto("CAUSA_EXTERNA_CODIGO", styles.codigo)}
                &nbsp;&nbsp;
                {areaTexto("CAUSA_EXTERNA_TEXTO", styles.dx)}
              </td>
            </tr>

            <tr>
              <td className={styles.label}>&nbsp;&nbsp;Discapacidad Principal</td>
              <td className={styles.cell}>
                &nbsp;Código:
                {texto("DISCAPACIDAD_PRINCIPAL_CODIGO", styles.codigo)}
                &nbsp;&nbsp;
                {areaTexto("DISCAPACIDAD_PRINCIPAL_TEXTO", styles.dx)}
              </td>
            </tr>

            {filaCirugia(1)}
            {filaCirugia(2)}
            {filaCirugia(3)}
            {filaCirugia(4)}

            <tr>
              <td className={styles.label}>
                &nbsp;&nbsp;<b>Se suspendió cirugía programada</b>
              </td>
              <td className={styles.cell}>
                <input
                  type="checkbox"
                  checked={suspendida}
                  onChange={(e) => onChange({ CIRUGIA_SUSPENDIDA_VALOR: e.target.checked ? "SI" : "" })}
                />
                &nbsp;Marcar únicamente si en el FIEH se suspendió cirugía programada.
              </td>
            </tr>

            <tr>
              <td className={styles.label}>
                &nbsp;&nbsp;<b>Condición</b>
              </td>
              <td className={styles.cell}>
                {(["VIVO", "MUERTO"] as const).map((op) => (
                  <label key={op}>
                    <input
                      type="radio"
                      name="condicion_ui"
                      checked={v("CONDICION_EGRESO") === op}
                      onChange={() => onChange({ CONDICION_EGRESO: op })}
                    />{" "}
                    {op === "VIVO" ? "Vivo" : "Muerto"}{" "}
                  </label>
                ))}
              </td>
            </tr>

            {datos.CONDICION_EGRESO === "MUERTO" && (
              <tr>
                <td colSpan={2} className={styles.cell}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      <tr>
                        <td className={styles.title} colSpan={2} style={{ background: "#c5908e" }}>
                          Del Certificado de Defunción
                          <br />
                          Obligatorio del año 2014 en adelante
                        </td>
                      </tr>
                      {filaDef(
                        "Causa (a)",
                        "CERT_CAUSA_A_CODIGO",
                        "CERT_CAUSA_A_TEXTO",
                        "CERT_CAUSA_A_INTERVALO",
                        "CERT_CAUSA_A_TIEMPO"
                      )}
                      {filaDef(
                        "Causa (b)",
                        "CERT_CAUSA_B_CODIGO",
                        "CERT_CAUSA_B_TEXTO",
                        "CERT_CAUSA_B_INTERVALO",
                        "CERT_CAUSA_B_TIEMPO"
                      )}
                      {filaDef(
                        "Causa (c)",
                        "CERT_CAUSA_C_CODIGO",
                        "CERT_CAUSA_C_TEXTO",
                        "CERT_CAUSA_C_INTERVALO",
                        "CERT_CAUSA_C_TIEMPO"
                      )}
                      {filaDef(
                        "Causa Básica (d)",
                        "CERT_CAUSA_BASICA_D_CODIGO",
                        "CERT_CAUSA_BASICA_D_TEXTO",
                        "CERT_CAUSA_BASICA_D_INTERVALO",
                        "CERT_CAUSA_BASICA_D_TIEMPO"
                      )}
                      {filaDef(
                        "Otro Estado Patológico",
                        "CERT_OTRO_ESTADO_1_CODIGO",
                        "CERT_OTRO_ESTADO_1_TEXTO",
                        "CERT_OTRO_ESTADO_1_INTERVALO",
                        "CERT_OTRO_ESTADO_1_TIEMPO"
                      )}
                      {filaDef(
                        "Otro Estado Patológico",
                        "CERT_OTRO_ESTADO_2_CODIGO",
                        "CERT_OTRO_ESTADO_2_TEXTO",
                        "CERT_OTRO_ESTADO_2_INTERVALO",
                        "CERT_OTRO_ESTADO_2_TIEMPO"
                      )}
                    </tbody>
                  </table>
                </td>
              </tr>
            )}

            <tr>
              <td className={styles.label}>
                &nbsp;&nbsp;<b>Fecha Egreso</b>
              </td>
              <td className={styles.cell}>
                {texto("FECHA_EGRESO", styles.fecha)}
                &nbsp;&nbsp;Hora
                {texto("HORA_EGRESO", styles.mini)} hrs
                {texto("MINUTO_EGRESO", styles.mini)} min
              </td>
            </tr>

            <tr>
              <td className={styles.label}>
                &nbsp;&nbsp;<b>Circunstancia</b>
              </td>
              <td className={styles.cell}>
                <select
                  className={marcarFaltante("MOTIVO_ALTA_VALOR")}
                  value={v("MOTIVO_ALTA_VALOR")}
                  onChange={set("MOTIVO_ALTA_VALOR")}
                >
                  <option value=""></option>
                  {OPCIONES_CIRCUNSTANCIA_ALTA.map((op) => (
                    <option key={op.valor} value={op.valor}>
                      {op.etiqueta}
                    </option>
                  ))}
                </select>
              </td>
            </tr>

            <tr>
              <td className={styles.label}>
                &nbsp;&nbsp;<b>Servicio Hospitalario</b>
              </td>
              <td className={styles.cell}>
                <select
                  className={marcarFaltante("SERVICIO_HOSPITALARIO_VALOR")}
                  value={v("SERVICIO_HOSPITALARIO_VALOR")}
                  onChange={set("SERVICIO_HOSPITALARIO_VALOR")}
                >
                  <option value=""></option>
                  {SERVICIOS_SIMMOW.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                &nbsp;&nbsp;Origen FIEH:
                {texto("SERVICIO_HOSPITALARIO_ORIGEN", styles.nombre, { readOnly: true })}
              </td>
            </tr>

            <tr>
              <td className={styles.label}>
                &nbsp;&nbsp;<b>Referido al Establecimiento</b>
              </td>
              <td className={styles.cell}>
                <EstablecimientoCombobox
                  value={v("REFERIDO_A_ESTABLECIMIENTO")}
                  onChange={(nombre) => onChange({ REFERIDO_A_ESTABLECIMIENTO: nombre })}
                  className={styles.referencia + marcarFaltante("REFERIDO_A_ESTABLECIMIENTO")}
                />
              </td>
            </tr>

            <tr>
              <td className={styles.label}>
                &nbsp;&nbsp;<b>Referido del Establecimiento</b>
              </td>
              <td className={styles.cell}>
                <EstablecimientoCombobox
                  value={v("REFERIDO_DEL_ESTABLECIMIENTO")}
                  onChange={(nombre) => onChange({ REFERIDO_DEL_ESTABLECIMIENTO: nombre })}
                  className={styles.referencia + marcarFaltante("REFERIDO_DEL_ESTABLECIMIENTO")}
                />
              </td>
            </tr>

            <tr>
              <td className={styles.label}>
                &nbsp;&nbsp;<b>Retorno hacia</b>
              </td>
              <td className={styles.cell}>
                <EstablecimientoCombobox
                  value={v("RETORNO_HACIA")}
                  onChange={(nombre) => onChange({ RETORNO_HACIA: nombre })}
                  className={styles.referencia + marcarFaltante("RETORNO_HACIA")}
                />
              </td>
            </tr>

            <tr>
              <td className={styles.label}>&nbsp;&nbsp;Observaciones / Recomendaciones</td>
              <td className={styles.cell}>{areaTexto("RECOMENDACIONES", styles.observacion)}</td>
            </tr>

            <tr>
              <td className={styles.label}>&nbsp;&nbsp;Médico responsable / JVPM</td>
              <td className={styles.cell}>
                {texto("MEDICO_RESPONSABLE_ALTA", styles.nombre)}
                {texto("JVPM_MEDICO_NUMERO", styles.codigo)}
              </td>
            </tr>

            <tr>
              <td className={styles.label}>&nbsp;&nbsp;ESDOMED digita / Fecha digitación</td>
              <td className={styles.cell}>
                {texto("ESDOMED_DIGITA", styles.nombre)}
                {texto("FECHA_DIGITACION", styles.fecha)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
