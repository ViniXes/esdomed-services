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
