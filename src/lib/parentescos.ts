// Lista canónica de parentescos usada en los formularios de familiares/responsables.
// Misma lista que el módulo de Fallecidos, centralizada para reutilizar.
export const PARENTESCOS = [
  "Padre", "Madre", "Hijo (a)", "Abuelo (a)", "Tío (a)", "Cuñado (a)",
  "Primo (a)", "Esposo (a)", "Nieto (a)", "Hermano (a)", "Sobrino (a)",
  "Compañero (a)", "Suegro (a)", "Otros",
] as const;

export type Parentesco = typeof PARENTESCOS[number];
