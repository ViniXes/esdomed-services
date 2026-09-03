// ============================================================================
// "Acerca de" ESDOMED Services — texto institucional y datos de soporte.
// ----------------------------------------------------------------------------
// Se muestra a TODOS los usuarios autenticados, sin importar el rol, desde el
// enlace discreto al pie del panel lateral (Sidebar → AcercaDeModal).
// Cualquier cambio de redacción o de contacto se hace aquí, no en el
// componente.
// ============================================================================

export const ACERCA_NOMBRE = "ESDOMED Services";

/** Fecha en que la plataforma entró en funciones (solo informativa). */
export const ACERCA_FECHA_LANZAMIENTO = "23 de junio de 2026";

/** Qué es la herramienta y a quién sirve. */
export const ACERCA_DESCRIPCION: string[] = [
  "ESDOMED Services es la herramienta institucional del servicio de Estadística y Documentos Médicos (ESDOMED) del Hospital Nacional El Salvador. Entró en funciones el 23 de junio de 2026 para apoyar los procedimientos operativos y administrativos entre ESDOMED y las demás áreas del hospital.",
  "Conecta a ESDOMED con el cuerpo médico, Enfermería, Trabajo Social, Psicología, Recursos Humanos, Transporte, Convenios y otras unidades, con el propósito de consolidar en un solo lugar todos los servicios que ESDOMED ofrece a las diferentes áreas del HNES.",
];

/** Por qué existe. */
export const ACERCA_ORIGEN =
  "La plataforma nació ante la necesidad de unificar los canales de comunicación que antes estaban dispersos en formularios de Google Forms, hojas de cálculo de Google Sheets y automatizaciones con Apps Script. Hoy esos flujos conviven aquí, con trazabilidad y un solo punto de contacto.";

export interface ContactoTelefonico {
  nombre: string;
  cargo: string;
  /** Número tal como se muestra. */
  telefono: string;
  /** Número en formato E.164 para el enlace tel:. */
  tel: string;
}

export const ACERCA_SOPORTE_TELEFONO: ContactoTelefonico = {
  nombre: "Ing. Benjamín Cardoza",
  cargo: "Jefe de ESDOMED",
  telefono: "+503 6010-6477",
  tel: "+50360106477",
};

/** Correos de soporte técnico de la plataforma. */
export const ACERCA_SOPORTE_CORREOS: string[] = [
  "vinicio.hernandez@salud.gob.sv",
  "alfonso.montes@salud.gob.sv",
];

/** Extensiones internas de ESDOMED (las mismas del globo de soporte). */
export const ACERCA_SOPORTE_EXTENSIONES: string[] = ["2162", "2163"];
