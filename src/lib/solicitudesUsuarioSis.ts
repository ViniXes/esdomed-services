// Catálogos visibles en la solicitud pública de usuarios SIS. Se mantienen en
// un solo lugar para que el formulario y la validación del servidor siempre
// acepten las mismas opciones literales que SIS.

export const CARGOS_USUARIO_SIS = [
  { value: "patologia", label: "Patología" },
  { value: "promotor_salud", label: "Promotor de Salud" },
  { value: "enfermera", label: "Enfermera" },
  { value: "tecnico_licenciado_rayos_x", label: "Técnico/Licenciado de Rayos X" },
  { value: "medico_interno", label: "Médico Interno" },
  { value: "medico_radiologo", label: "Médico Radiólogo" },
  { value: "medico_licenciado", label: "Médico o Licenciado" },
  { value: "trabajo_social", label: "Trabajo Social" },
  { value: "teleoperador", label: "Teleoperador" },
] as const;

export type CargoUsuarioSis = (typeof CARGOS_USUARIO_SIS)[number]["value"];

// Opciones que SIS muestra al crear el empleado. El número de documento es
// obligatorio siempre; solo el DUI usa el formato salvadoreño de 9 dígitos.
export const TIPOS_DOCUMENTO_SIS = [
  { value: "dui", label: "DUI" },
  { value: "pasaporte", label: "Pasaporte" },
  { value: "carne_residencia", label: "Carné de Residencia" },
] as const;

export type TipoDocumentoSis = (typeof TIPOS_DOCUMENTO_SIS)[number]["value"];

const PARTICULAS_NOMBRE = new Set(["de", "del", "la", "las", "los", "y", "da", "das", "do", "dos", "van", "von"]);
const NUMEROS_ROMANOS = new Set(["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]);

// Ajusta solo el uso de mayúsculas/minúsculas para que el formulario sea
// legible. No corrige ortografía ni cambia las palabras, tildes, guiones o
// apóstrofes que haya escrito la persona.
export function normalizarNombrePersona(valor: unknown): string {
  let esPrimeraPalabra = true;
  return String(valor ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .split(/([\s'-]+)/u)
    .map((fragmento) => {
      if (!fragmento || /^[\s'-]+$/u.test(fragmento)) return fragmento;
      const minuscula = fragmento.toLocaleLowerCase("es-SV");
      const resultado = NUMEROS_ROMANOS.has(minuscula)
        ? minuscula.toUpperCase()
        : !esPrimeraPalabra && PARTICULAS_NOMBRE.has(minuscula)
          ? minuscula
          : `${minuscula.charAt(0).toLocaleUpperCase("es-SV")}${minuscula.slice(1)}`;
      esPrimeraPalabra = false;
      return resultado;
    })
    .join("");
}

// Jefaturas autorizadoras vigentes para la creación de usuarios SIS.
// Para agregar una nueva persona basta con incorporarla a esta lista.
export const JEFATURAS_AUTORIZADORAS_SIS = [
  "Rudy Armando Bonilla Carranza",
  "Werner Stanley Posada Soriano",
  "Francisco Alexander Ruiz Zelaya",
  "Josue Mauricio Delgado Ramirez",
  "Nataly Raquel Varela Ramos",
  "Carlos Eduardo Calderón Ávalos",
  "Jesica Mariadela Salguero Romero",
  "Patricia Gloria Estrella Cabrera Romero",
  "Maria Jose Coto Silezar",
  "William Francisco Huezo Vasquez",
  "Maria Fernanda Cruz Zelaya",
  "Laura Estela Miranda Iraheta",
  "Rosa Carolina Beltran Henriquez",
] as const;

export const ESPECIALIDADES_SIS = [
  "Referido Externo-Referido-MINSAL",
  "Vacunación-Servicios de Apoyo-MINSAL",
  "Alimentación y Dieta-Servicios de Apoyo-MINSAL",
  "Imagenología-Servicios de Apoyo-MINSAL",
  "Clinica de Empleados-Servicios de Apoyo-MINSAL",
  "Laboratorio Clínico-Servicios de Apoyo-MINSAL",
  "Banco sangre-Servicios de Apoyo-MINSAL",
  "Medicina Interna-Hospitalización-MINSAL",
  "Radiología-Consulta Externa-MINSAL",
  "Fisioterapia-Consulta Externa-MINSAL",
  "Nutrición-Hospitalización-MINSAL",
  "Ginecología-Hospitalización-MINSAL",
  "Psicología-Hospitalización-MINSAL",
  "Endocrinología-Hospitalización-MINSAL",
  "Cirugía General-Emergencia-MINSAL",
  "Medicina Interna-Emergencia-MINSAL",
  "Adulto Mayor-Consulta Externa-MINSAL",
  "Neumología-Hospitalización-MINSAL",
  "Reumatología-Hospitalización-MINSAL",
  "Ortopedia-Hospitalización-MINSAL",
  "Cirugía Plástica-Hospitalización-MINSAL",
  "Cirugía de Tórax-Hospitalización-MINSAL",
  "Cirugía Vascular-Hospitalización-MINSAL",
  "Hematología-Hospitalización-MINSAL",
  "Medicina Familiar-Hospitalización-MINSAL",
  "Terapia Respiratoria-Servicios de Apoyo-MINSAL",
  "Coloproctología-Hospitalización-MINSAL",
  "Cardiología-Hospitalización-MINSAL",
  "Neurocirugía-Hospitalización-MINSAL",
  "Otorrinolaringología-Hospitalización-MINSAL",
  "Medicina Intensiva-Hospitalización-MINSAL",
  "Infectología-Hospitalización-MINSAL",
  "Cirugía General-Hospitalización-MINSAL",
  "Neurología-Hospitalización-MINSAL",
  "Gastroenterología-Hospitalización-MINSAL",
  "Fisioterapia-Hospitalización-MINSAL",
  "Terapia Respiratoria-Hospitalización-MINSAL",
  "Oncología-Hospitalización-MINSAL",
  "Dolor y Cuidados Paliativos-Hospitalización-MINSAL",
  "Cumplimiento de Medicamentos -Hospital de Día-MINSAL",
  "Nefrología -Hospital de Día-MINSAL",
  "Oncología -Hospital de Día-MINSAL",
  "Medicina General-Hospitalización-MINSAL",
  "Psiquiatría-Hospitalización-MINSAL",
  "Cirugía-Hospitalización-MINSAL",
  "Clinica de Atencion Integral-Consulta Externa-MINSAL",
  "Cirugía Cardiovascular-Hospitalización-MINSAL",
  "Anestesiología-Hospitalización-MINSAL",
  "Otras Atenciones Consulta Externa Médica-Consulta Externa-MINSAL",
  "Nefrología-Hospitalización-MINSAL",
  "Gastroenterología-BM-Hospitalización-MINSAL",
  "Medicina Interna-BM-Hospitalización-MINSAL",
  "Cirugía-BM-Hospitalización-MINSAL",
  "Psiquiatría-BM-Hospitalización-MINSAL",
  "Ginecología-BM-Hospitalización-MINSAL",
  "Endocrinología-BM-Hospitalización-MINSAL",
  "Nutrición-BM-Hospitalización-MINSAL",
  "Psicología-BM-Hospitalización-MINSAL",
  "Neurología-BM-Hospitalización-MINSAL",
  "Cardiología-BM-Hospitalización-MINSAL",
  "Neumología-BM-Hospitalización-MINSAL",
  "Hematología-BM-Hospitalización-MINSAL",
  "Anestesiología-BM-Hospitalización-MINSAL",
  "Ortopedia-BM-Hospitalización-MINSAL",
  "Neurocirugía-BM-Hospitalización-MINSAL",
  "Cirugía Plástica-BM-Hospitalización-MINSAL",
  "Cirugía de Tórax-BM-Hospitalización-MINSAL",
  "Obstetricia-BM-Hospitalización-MINSAL",
  "Reumatología-BM-Hospitalización-MINSAL",
  "Cirugía Vascular-BM-Hospitalización-MINSAL",
  "Cirugía Endoscópica-BM-Hospitalización-MINSAL",
  "Dolor y Cuidados Paliativos-BM-Hospitalización-MINSAL",
  "Radiología-BM-Hospitalización-MINSAL",
  "Unidad de Cuidados Intensivos-BM-Hospitalización-MINSAL",
  "Infectología-BM-Hospitalización-MINSAL",
  "Coloproctología-BM-Hospitalización-MINSAL",
  "Otorrinolaringología-BM-Hospitalización-MINSAL",
  "Salas de Parto-BM-Hospitalización-MINSAL",
  "Urología-BM-Hospitalización-MINSAL",
  "Cardiología intervencionista-BM-Hospitalización-MINSAL",
  "Mastologia-BM-Hospitalización-MINSAL",
  "Radiología intervencionista-BM-Hospitalización-MINSAL",
  "Neurocirugía intervencionista-BM-Hospitalización-MINSAL",
  "Cirugía Cardiovascular-BM-Hospitalización-MINSAL",
  "Medicina General-BM-Hospitalización-MINSAL",
  "Nefrología-BM-Hospitalización-MINSAL",
  "Oncología-BM-Hospitalización-MINSAL",
  "Medicina Intensiva-BM-Hospitalización-MINSAL",
  "Fisioterapia-BM-Hospitalización-MINSAL",
] as const;

export const RESPUESTAS_SI_NO = [
  { value: "si", label: "Sí" },
  { value: "no", label: "No" },
] as const;

export type EstadoSolicitudSis = "pendiente" | "en_proceso" | "creado" | "rechazado";

export const ESTADO_SOLICITUD_SIS_LABEL: Record<EstadoSolicitudSis, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  creado: "Creado en SIS",
  rechazado: "Rechazado",
};
