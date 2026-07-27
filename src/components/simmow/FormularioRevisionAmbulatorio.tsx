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

/**
 * Réplica visual de la tabla de SIMMOW — reutiliza el mismo CSS module que
 * el flujo hospitalario (FormularioRevision.module.css) para que el personal
 * se ubique con los mismos colores/orden que ve en la pantalla real de
 * "Ingreso/Edición Consulta Curativa" al momento de revisar antes de copiar.
 * Solo cubre los campos que este flujo autollena — el resto del formulario
 * real (odontología, planificación familiar, etc.) no aplica aquí.
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

  return (
    <div>
      <button
        onClick={onVolver}
        className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white mb-3"
      >
        <ArrowLeft size={14} /> Volver a la lista
      </button>

      <div className={styles.wrap}>
        <div className={styles.form}>
          <table className={styles.table}>
            <tbody>
              <tr>
                <td className={styles.title} colSpan={2}>
                  Ingreso / Edición Consulta Curativa / Atención Preventiva
                </td>
              </tr>

              <tr>
                <td className={styles.cellAlt}>
                  <b>&nbsp;&nbsp;Establecimiento</b>
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
                <td className={styles.label}>&nbsp;&nbsp;Expediente Clínico</td>
                <td className={styles.cell}>
                  {texto("expediente", styles.exp)}
                  &nbsp;&nbsp;DUI
                  {texto("dui", styles.doc)}
                  &nbsp;(sin guion)
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Nombre del Paciente</td>
                <td className={styles.cell}>{texto("paciente", styles.dir)}</td>
              </tr>

              <tr>
                <td className={styles.label}>
                  &nbsp;&nbsp;<b>Sexo</b>
                </td>
                <td className={styles.cell}>
                  {(
                    [
                      { valor: "1", etiqueta: "Masculino" },
                      { valor: "2", etiqueta: "Femenino" },
                      { valor: "3", etiqueta: "Intersexual" },
                    ] as const
                  ).map((op) => (
                    <label key={op.valor}>
                      <input
                        type="radio"
                        name="sexo_ui"
                        checked={v("sexoValor") === op.valor}
                        onChange={() => onChange({ sexoValor: op.valor })}
                      />{" "}
                      {op.etiqueta}{" "}
                    </label>
                  ))}
                </td>
              </tr>

              <tr>
                <td className={styles.label}>
                  &nbsp;&nbsp;<b>Edad</b>
                </td>
                <td className={styles.cell}>
                  {texto("edadAnios", styles.mini)} años&nbsp;&nbsp;
                  <input className={styles.mini} value={v("edadMeses")} readOnly /> meses&nbsp;&nbsp;
                  <input className={styles.mini} value={v("edadDias")} readOnly /> días
                  <span style={{ marginLeft: 8, fontSize: "7pt", color: "#555" }}>
                    (solo años se digita en SIMMOW)
                  </span>
                </td>
              </tr>

              <tr>
                <td className={styles.label}>
                  &nbsp;&nbsp;<b>Fecha</b>
                </td>
                <td className={styles.cell}>{texto("fecha", styles.fecha)}</td>
              </tr>

              <tr>
                <td className={styles.label}>
                  &nbsp;&nbsp;<b>[ Departamento ] [ Distrito ]</b>
                </td>
                <td className={styles.cell}>
                  {texto("departamento", styles.nombre)}
                  {texto("municipio", styles.nombre)}
                </td>
              </tr>

              <tr>
                <td className={styles.label}>
                  &nbsp;&nbsp;<b>Área</b>
                </td>
                <td className={styles.cell}>
                  {(
                    [
                      { valor: "1", etiqueta: "Urbana" },
                      { valor: "2", etiqueta: "Rural" },
                    ] as const
                  ).map((op) => (
                    <label key={op.valor}>
                      <input
                        type="radio"
                        name="area_ui"
                        checked={v("areaValor") === op.valor}
                        onChange={() => onChange({ areaValor: op.valor })}
                      />{" "}
                      {op.etiqueta}{" "}
                    </label>
                  ))}
                </td>
              </tr>

              <tr>
                <td className={styles.section} colSpan={2}>
                  &nbsp;&nbsp;Diagnósticos :
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Diagnóstico Principal</td>
                <td className={styles.cell}>
                  &nbsp;Código:
                  {texto("diagPrincipalCodigo", styles.codigo)}
                  &nbsp;&nbsp;
                  {areaTexto("diagPrincipalTexto", styles.dx)}
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Diagnóstico Secundario</td>
                <td className={styles.cell}>
                  &nbsp;Código:
                  {texto("diagSecundarioCodigo", styles.codigo)}
                  &nbsp;&nbsp;
                  {areaTexto("diagSecundarioTexto", styles.dx)}
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Causa Externa de Morbilidad</td>
                <td className={styles.cell}>
                  &nbsp;Código:
                  {texto("causaExternaCodigo", styles.codigo)}
                  &nbsp;&nbsp;
                  {areaTexto("causaExternaTexto", styles.dx)}
                </td>
              </tr>

              <tr>
                <td className={styles.section} colSpan={2}>
                  &nbsp;&nbsp;Recurso y Referencias :
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Código Recurso (Médico)</td>
                <td className={styles.cell}>
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
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Ingreso Hospitalario</td>
                <td className={styles.cell}>
                  <label>
                    <input
                      type="checkbox"
                      checked={datos.ingresoHospitalario}
                      onChange={(e) => onChange({ ingresoHospitalario: e.target.checked })}
                    />{" "}
                    Marcar si ingresó
                  </label>
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Afiliación ISSS</td>
                <td className={styles.cell}>
                  <label>
                    <input
                      type="checkbox"
                      checked={datos.isss}
                      onChange={(e) => onChange({ isss: e.target.checked })}
                    />{" "}
                    ISSS
                  </label>
                  &nbsp;&nbsp;
                  {(
                    [
                      { valor: "1", etiqueta: "Cotizante" },
                      { valor: "2", etiqueta: "Beneficiario" },
                    ] as const
                  ).map((op) => (
                    <label key={op.valor}>
                      <input
                        type="radio"
                        name="tipoisss_ui"
                        checked={v("tipoIsssValor") === op.valor}
                        onChange={() => onChange({ tipoIsssValor: op.valor })}
                      />{" "}
                      {op.etiqueta}{" "}
                    </label>
                  ))}
                  &nbsp;&nbsp;N° de Afiliación
                  {texto("numeroAfiliacion", styles.doc)}
                </td>
              </tr>

              <tr>
                <td className={styles.label}>
                  &nbsp;&nbsp;Referido De / Interconsulta De
                  <br />
                  &nbsp;&nbsp;Establecimiento (texto original)
                </td>
                <td className={styles.cell}>
                  {texto("establecimientoReferidoTexto", styles.referencia)}
                  <br />
                  &nbsp;Código SIMMOW:
                  {texto("establecimientoReferidoCodigo", styles.codigo)}
                </td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Personas Privadas de Libertad</td>
                <td className={styles.cell}>{texto("privadoLibertadTexto", styles.nombre)}</td>
              </tr>

              <tr>
                <td className={styles.label}>&nbsp;&nbsp;Amenorrea</td>
                <td className={styles.cell}>{texto("amenorreaSemanas", styles.mini)} semanas</td>
              </tr>
            </tbody>
          </table>

          <p style={{ color: "#ffffff", fontSize: "7pt", marginTop: 10, opacity: 0.8 }}>
            Modalidad, Tipo Atención, Especialidad, Discapacidad, Violencia, Escuela Promotora, Procedimiento Salud
            Mental, Derechohabiente Otros, Víctima DH, Referido A y UCSF/UCSFE no tienen dato de origen en los
            reportes del SIS — complételos manualmente en SIMMOW si aplican.
          </p>
        </div>
      </div>
    </div>
  );
}
