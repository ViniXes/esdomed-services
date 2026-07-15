import type { FilaPlanTrabajo } from "@/types";
import { getHorario } from "@/lib/esdomed/horarios";

/**
 * Clasificación usada únicamente por el módulo de planes de trabajo.
 *
 * No modifica el rol ni la naturaleza del usuario en el resto del sistema. La
 * llave es el código de marcación porque es el dato estable que ya vincula a la
 * persona con su fila del plan.
 */
export type TipoJornadaPlan = "Administrativo" | "Operativo";

export interface ConfigPersonalPlan {
  codigoMarcacion: string;
  tipoJornada: TipoJornadaPlan;
  grupoPredeterminado?: string;
}

const CODIGOS_ADMINISTRATIVOS_LEGACY = [
  "C-043",
  "H-063",
  "M-164",
  "A-206",
  "R-189",
  "H-048",
  "M-269",
] as const;

export const CATALOGO_PERSONAL_PLAN: readonly ConfigPersonalPlan[] =
  CODIGOS_ADMINISTRATIVOS_LEGACY.map((codigoMarcacion) => ({
    codigoMarcacion,
    tipoJornada: "Administrativo",
    grupoPredeterminado: "Administrativo",
  }));

const CATALOGO_POR_CODIGO = new Map(
  CATALOGO_PERSONAL_PLAN.map((item) => [item.codigoMarcacion, item]),
);

export function normalizarCodigoMarcacion(codigo?: string | null): string {
  return (codigo ?? "").trim().toUpperCase();
}

export function configPersonalPlan(codigo?: string | null): ConfigPersonalPlan | undefined {
  return CATALOGO_POR_CODIGO.get(normalizarCodigoMarcacion(codigo));
}

export function esAdministrativoPlan(
  persona: Pick<FilaPlanTrabajo, "codigoMarcacion" | "grupo" | "tipoJornada">,
): boolean {
  if (persona.tipoJornada === "Administrativo") return true;
  if (configPersonalPlan(persona.codigoMarcacion)?.tipoJornada === "Administrativo") return true;
  return (persona.grupo ?? "").trim().toLowerCase() === "administrativo";
}

/** Aplica al snapshot del plan la clasificación propia de este módulo. */
export function normalizarMetadatosFilaPlan(fila: FilaPlanTrabajo): FilaPlanTrabajo {
  const config = configPersonalPlan(fila.codigoMarcacion);
  const administrativa = config?.tipoJornada === "Administrativo" || esAdministrativoPlan(fila);
  return {
    ...fila,
    codigoMarcacion: normalizarCodigoMarcacion(fila.codigoMarcacion),
    tipoJornada: administrativa ? "Administrativo" : "Operativo",
    grupo: administrativa
      ? "Administrativo"
      : (fila.grupo?.trim() || config?.grupoPredeterminado || ""),
  };
}

/**
 * Recupera el código administrativo habitual de una fila histórica. Se elige
 * el más usado y, en caso de empate, el último que aparece en el mes.
 */
export function codigoAdministrativoHabitual(asignaciones: string[]): string {
  const conteos = new Map<string, { cantidad: number; ultimoIndice: number }>();
  asignaciones.forEach((valor, indice) => {
    const codigo = valor.trim().toUpperCase();
    const horario = getHorario(codigo);
    if (!horario || (horario.tipo !== "Administrativo" && horario.tipo !== "Medico Administrativo")) return;
    const actual = conteos.get(codigo) ?? { cantidad: 0, ultimoIndice: -1 };
    conteos.set(codigo, { cantidad: actual.cantidad + 1, ultimoIndice: indice });
  });

  return [...conteos.entries()]
    .sort((a, b) => b[1].cantidad - a[1].cantidad || b[1].ultimoIndice - a[1].ultimoIndice)[0]?.[0] ?? "";
}
