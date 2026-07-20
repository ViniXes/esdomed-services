// Reglas de negocio ligadas a la condición de egreso. Port de
// `aplicarReglasCondicionEgreso_` de la herramienta original de Apps Script.

import type { DatosSimmow } from "./types";

/**
 * VIVO siempre lleva RECOMENDACIONES="CONTROL" (la circunstancia de alta se
 * conserva tal cual se detectó). MUERTO no lleva circunstancia ni
 * observación de control: ambos campos se limpian.
 */
export function aplicarReglasCondicionEgreso(datos: DatosSimmow): DatosSimmow {
  if (datos.CONDICION_EGRESO === "VIVO") {
    datos.RECOMENDACIONES = "CONTROL";
    return datos;
  }

  if (datos.CONDICION_EGRESO === "MUERTO") {
    datos.MOTIVO_ALTA_VALOR = "";
    datos.RECOMENDACIONES = "";
    return datos;
  }

  return datos;
}
