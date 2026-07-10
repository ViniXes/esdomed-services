// ============================================================================
// Términos y condiciones de uso del portal ESDOMED Services
// ----------------------------------------------------------------------------
// Acuerdo de uso aceptable y confidencialidad que TODO usuario interno debe
// aceptar antes de operar el sistema. Está fundamentado en la legislación
// salvadoreña aplicable:
//   • Ley de Protección de Datos Personales (Decreto Legislativo n.° 144).
//   • Ley de Ciberseguridad y Seguridad de la Información (Decreto Legislativo n.° 143).
//   • Norma Técnica del Expediente Clínico (Acuerdo Ejecutivo n.° 1616).
//   • Ley de Deberes y Derechos de los Pacientes y Prestadores de Servicios de Salud.
//
// IMPORTANTE: cuando se modifique el contenido de los términos, súbase también
// TERMINOS_VERSION. La fecha de la versión solicitará de nuevo la aceptación a
// todos los usuarios la próxima vez que ingresen.
// ============================================================================

/** Versión vigente. Al cambiarla, se vuelve a pedir la aceptación a todos. */
export const TERMINOS_VERSION = "1.1";

/** Fecha de entrada en vigencia de la versión vigente (solo informativa). */
export const TERMINOS_FECHA = "10 de julio de 2026";

export interface SeccionTerminos {
  titulo: string;
  parrafos: string[];
}

export const TERMINOS_INTRO =
  "ESDOMED Services es un portal operativo interno de uso exclusivo del personal autorizado del hospital. " +
  "A través de él se tratan datos personales y datos personales sensibles relativos a la salud de los pacientes, " +
  "por lo que su uso está sujeto al deber de confidencialidad y al secreto profesional. Lea y acepte las siguientes " +
  "condiciones antes de continuar.";

export const TERMINOS_SECCIONES: SeccionTerminos[] = [
  {
    titulo: "1. Objeto y aceptación",
    parrafos: [
      "Estos términos regulan el acceso y uso del portal por parte de todo el personal operativo y administrativo del " +
        "hospital que haga uso del sistema, sin distinción de área, unidad o cargo. Al marcar la casilla de aceptación e " +
        "ingresar al sistema, usted declara haber leído, comprendido y aceptado estas condiciones en su totalidad.",
      "Si no está de acuerdo con estos términos, no debe utilizar el sistema.",
    ],
  },
  {
    titulo: "2. Naturaleza de la información tratada",
    parrafos: [
      "El sistema almacena y procesa datos personales y datos personales sensibles —en particular, datos relativos a la " +
        "salud física y mental de los pacientes—, los cuales gozan de especial protección conforme a la Ley de Protección " +
        "de Datos Personales. Su tratamiento se realiza únicamente para los fines asistenciales, estadísticos y de gestión " +
        "documental propios del servicio de Estadística y Documentos Médicos.",
      "Toda información a la que usted acceda en el sistema pertenece al titular de los datos (el paciente) y a la " +
        "institución; en ningún caso le pertenece a usted ni puede disponer de ella para fines distintos a los de su cargo.",
    ],
  },
  {
    titulo: "3. Marco legal aplicable",
    parrafos: [
      "El uso del sistema se rige por la Ley de Protección de Datos Personales (D.L. n.° 144), la Ley de Ciberseguridad y " +
        "Seguridad de la Información (D.L. n.° 143), la Norma Técnica del Expediente Clínico, la Ley de Deberes y Derechos de " +
        "los Pacientes y Prestadores de Servicios de Salud, y demás normativa institucional aplicable.",
      "El tratamiento de datos relativos a la salud se ampara en la prestación de asistencia sanitaria y la gestión de " +
        "servicios de salud, y se efectúa por personal sujeto al secreto profesional o a una obligación equivalente de " +
        "confidencialidad.",
    ],
  },
  {
    titulo: "4. Deber de confidencialidad y secreto profesional",
    parrafos: [
      "Usted se obliga a guardar absoluta confidencialidad sobre toda la información a la que tenga acceso, durante y " +
        "después de su relación laboral o de servicio con la institución.",
      "Queda prohibido revelar, comentar, copiar, imprimir, fotografiar, capturar pantalla, descargar, transferir o " +
        "divulgar por cualquier medio —físico o electrónico— información de pacientes o del sistema a personas no " +
        "autorizadas o para fines ajenos a los del servicio.",
    ],
  },
  {
    titulo: "5. Uso conforme a los principios de finalidad y minimización",
    parrafos: [
      "Solo debe consultar y tratar los datos estrictamente necesarios para cumplir las funciones de su cargo. Está " +
        "prohibido acceder a expedientes o información de pacientes por curiosidad, interés personal o cualquier motivo no " +
        "relacionado con sus responsabilidades.",
      "El tratamiento debe limitarse a la finalidad para la cual la información fue recolectada; cualquier uso distinto " +
        "requiere autorización conforme a la ley.",
    ],
  },
  {
    titulo: "6. Credenciales y responsabilidad de la cuenta",
    parrafos: [
      "Sus credenciales de acceso son personales e intransferibles. No debe compartir su usuario y contraseña, ni permitir " +
        "que terceros operen bajo su sesión. Usted es responsable de toda actividad realizada con su cuenta.",
      "En las cuentas compartidas (por ejemplo, cuentas genéricas de enfermería por servicio) es obligatorio registrar el " +
        "nombre real de la persona que realiza cada acción.",
      "Debe cerrar su sesión al alejarse del equipo y notificar de inmediato cualquier uso indebido o sospecha de acceso no " +
        "autorizado a su cuenta.",
    ],
  },
  {
    titulo: "7. Seguridad de la información e incidentes",
    parrafos: [
      "Debe utilizar el sistema desde equipos y redes confiables y adoptar las medidas de seguridad razonables para " +
        "proteger la información, en cumplimiento de los principios de confidencialidad, integridad y disponibilidad.",
      "Si tiene conocimiento de una vulneración de seguridad (pérdida, alteración, acceso ilegítimo o uso no autorizado de " +
        "datos), debe reportarlo de inmediato al responsable institucional. La ley exige notificar dichas vulneraciones a la " +
        "autoridad competente en un plazo máximo de setenta y dos horas.",
    ],
  },
  {
    titulo: "8. Trazabilidad y auditoría",
    parrafos: [
      "Las acciones realizadas en el sistema (consultas, registros, modificaciones y confirmaciones) pueden quedar " +
        "registradas con fines de auditoría, seguridad y trazabilidad. Al usar el sistema, usted reconoce y acepta dicho " +
        "registro.",
    ],
  },
  {
    titulo: "9. Derechos de los titulares de los datos",
    parrafos: [
      "Los pacientes, como titulares de sus datos, tienen los derechos de Acceso, Rectificación, Cancelación, Oposición, " +
        "Portabilidad, Olvido y Limitación (ARCO-POL). Cualquier solicitud de un titular sobre sus datos debe canalizarse al " +
        "delegado de protección de datos u oficial de información de la institución, sin atenderse de manera informal.",
    ],
  },
  {
    titulo: "10. Responsabilidad por incumplimiento",
    parrafos: [
      "El uso indebido de la información o del sistema, así como el incumplimiento de estas condiciones, puede dar lugar a " +
        "responsabilidad administrativa, civil y penal, incluyendo las sanciones previstas en la Ley de Protección de Datos " +
        "Personales, la Ley de Ciberseguridad y Seguridad de la Información y la Ley Especial contra los Delitos Informáticos " +
        "y Conexos, sin perjuicio de las medidas disciplinarias internas que correspondan.",
    ],
  },
  {
    titulo: "11. Vigencia y modificaciones",
    parrafos: [
      "La institución podrá actualizar estos términos cuando sea necesario. Cuando ello ocurra, se solicitará nuevamente su " +
        "aceptación al ingresar. El uso continuado del sistema implica la aceptación de la versión vigente.",
    ],
  },
];
