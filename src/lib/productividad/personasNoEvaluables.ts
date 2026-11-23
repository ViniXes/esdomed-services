// Cuentas que pueden existir en ESDOMED, pero no forman parte de la evaluación
// de productividad de Operativos ni de Consulta Externa (jefatura, cuentas
// técnicas y de prueba). Se comparan por palabras del nombre, sin tildes.
const PERSONAS_NO_EVALUABLES = [
  ["admin"],
  ["alfonso", "montes", "gutierrez"],
  ["alfonso", "montes", "gutierres"],
  ["heber", "benjamin", "cardoza"],
  ["jose", "daniel", "hernandez"],
  ["vinicio", "hernandez"],
  ["vicinio", "hernandez"],
  ["juan", "marroquin"],
  ["denys", "ricardo", "alvarez"],
  ["super", "su"],
  ["supersu"],
] as const;

export function esPersonalEvaluable(nombre: string): boolean {
  const tokens = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("es-SV")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ");

  return !PERSONAS_NO_EVALUABLES.some(exclusion => exclusion.every(parte => tokens.includes(parte)));
}
