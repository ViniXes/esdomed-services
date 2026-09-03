// Catálogos visibles en la solicitud pública de usuarios SIS. Se mantienen en
// un solo lugar para que el formulario y la validación del servidor siempre
// acepten las mismas opciones. "Otro" permite atender una especialidad nueva
// sin obligar a la persona a escoger una incorrecta.

export const CARGOS_USUARIO_SIS = [
  { value: "medico", label: "Médico" },
  { value: "licenciado", label: "Licenciado(a)" },
  { value: "enfermeria", label: "Personal de Enfermería" },
  { value: "tecnico", label: "Técnico(a)" },
  { value: "administrativo", label: "Personal administrativo" },
  { value: "otro", label: "Otro" },
] as const;

export type CargoUsuarioSis = (typeof CARGOS_USUARIO_SIS)[number]["value"];

export const ESPECIALIDADES_SIS = [
  "Medicina general - Hospitalización",
  "Anestesiología",
  "Cardiología",
  "Cirugía general",
  "Cirugía maxilofacial",
  "Cirugía pediátrica",
  "Cirugía plástica",
  "Dermatología",
  "Emergencia",
  "Endocrinología",
  "Gastroenterología",
  "Ginecología y obstetricia",
  "Medicina interna",
  "Nefrología",
  "Neonatología",
  "Neumología",
  "Neurocirugía",
  "Neurología",
  "Nutrición",
  "Oftalmología",
  "Oncología",
  "Ortopedia y traumatología",
  "Otorrinolaringología",
  "Pediatría",
  "Psiquiatría",
  "Radiología",
  "Rehabilitación",
  "UCI / Cuidados críticos",
  "Urología",
  "Otra",
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
