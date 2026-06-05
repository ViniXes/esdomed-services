import type { BolsaLicencia, CategoriaLicencia, Empleado, Licencia } from "@/types";
import { CATEGORIAS } from "./catalogo";

// ── Topes legales (Ley de Servicio Civil) ────────────────────────────────────
// Verificados contra la hoja TIEMPO ACUMULADO del Excel de RRHH:
//   incapacidad por enfermedad (con goce): 15 días × años de antigüedad, máx 90.
//   duelo / cuido de pariente: 20 días/año.   permiso personal + sin goce: 60.
//   maternidad: 112 días por evento (16 semanas), no es bolsa anual.

export const MATERNIDAD_DIAS = 112;
const TOPE_DUELO_CUIDO = 20;
const TOPE_PERSONAL_SINGOCE = 60;
const INCAPACIDAD_POR_ANIO = 15;
const INCAPACIDAD_MAX = 90;

/** Años completos de servicio a una fecha de referencia. */
export function antiguedadAnios(fechaIngreso?: Date | null, ref: Date = new Date()): number {
  if (!fechaIngreso) return 0;
  let a = ref.getFullYear() - fechaIngreso.getFullYear();
  const m = ref.getMonth() - fechaIngreso.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < fechaIngreso.getDate())) a--;
  return Math.max(0, a);
}

/** Tope anual de la bolsa de incapacidad según antigüedad (15×años, máx 90). */
export function topeIncapacidad(anios: number): number {
  // Primer año de servicio ya da derecho a 15 días.
  return Math.min(INCAPACIDAD_MAX, INCAPACIDAD_POR_ANIO * Math.max(1, anios));
}

/** Tope anual de una bolsa. Para incapacidad depende de la antigüedad. */
export function topeBolsa(bolsa: BolsaLicencia, anios: number): number {
  switch (bolsa) {
    case "incapacidad":      return topeIncapacidad(anios);
    case "duelo_cuido":      return TOPE_DUELO_CUIDO;
    case "personal_singoce": return TOPE_PERSONAL_SINGOCE;
    case "maternidad":       return MATERNIDAD_DIAS;
    case "ninguna":          return 0;
  }
}

// ── Días de un periodo (inclusivo: inicio y fin cuentan) ──────────────────────
// Ej: 25 de enero al 7 de febrero = 14 días (confirmado en el Excel).
export function diasInclusivos(inicial: Date, final: Date): number {
  const a = new Date(inicial.getFullYear(), inicial.getMonth(), inicial.getDate());
  const b = new Date(final.getFullYear(), final.getMonth(), final.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

// ── Consumo de una bolsa en un año ────────────────────────────────────────────
// La bolsa de incapacidad mide días CON GOCE (el exceso se reclasifica a sin
// goce y no consume más). Las demás bolsas miden el total de días.
function diasComputados(lic: Pick<Licencia, "bolsa" | "dias" | "diasConGoce">): number {
  return lic.bolsa === "incapacidad" ? lic.diasConGoce : lic.dias;
}

export function consumoBolsa(
  bolsa: BolsaLicencia,
  licencias: Pick<Licencia, "bolsa" | "anio" | "dias" | "diasConGoce">[],
  anio: number,
  excluirId?: string,
): number {
  return licencias
    .filter((l) => l.bolsa === bolsa && l.anio === anio)
    .filter((l) => !excluirId || (l as Licencia).id !== excluirId)
    .reduce((sum, l) => sum + diasComputados(l), 0);
}

// ── Saldo por bolsa para la vista del empleado ────────────────────────────────
export interface SaldoBolsa {
  bolsa: BolsaLicencia;
  tope: number;
  usado: number;
  disponible: number;
}

/** Saldos de las 3 bolsas anuales para un empleado en un año calendario. */
export function saldosEmpleado(
  empleado: Pick<Empleado, "fechaIngreso">,
  licencias: Pick<Licencia, "bolsa" | "anio" | "dias" | "diasConGoce">[],
  anio: number,
): SaldoBolsa[] {
  // Antigüedad al cierre del año en cuestión (31 de dic) — el derecho del año.
  const anios = antiguedadAnios(empleado.fechaIngreso, new Date(anio, 11, 31));
  const bolsas: BolsaLicencia[] = ["incapacidad", "duelo_cuido", "personal_singoce"];
  return bolsas.map((bolsa) => {
    const tope = topeBolsa(bolsa, anios);
    const usado = consumoBolsa(bolsa, licencias, anio);
    return { bolsa, tope, usado, disponible: Math.max(0, tope - usado) };
  });
}

// ── Evaluación de un registro nuevo (lógica híbrida al exceder) ───────────────
export interface EvaluacionLicencia {
  dias: number;
  anio: number;
  bolsa: BolsaLicencia;
  descuentaSaldo: boolean;

  tope: number;
  usadoPrevio: number;
  disponiblePrevio: number;

  diasConGoce: number;
  diasSinGoce: number;

  excede: boolean;
  exceso: number;            // días por encima del tope
  bloqueado: boolean;        // true → no se permite guardar (bolsas discrecionales)
  requiereJustificacion: boolean;

  mensaje: string | null;    // texto para mostrar en la UI
}

/**
 * Evalúa una licencia propuesta contra los saldos del empleado.
 * Médicas → advierten y permiten (exceso → sin goce). Discrecionales → bloquean.
 */
export function evaluarLicencia(params: {
  categoria: CategoriaLicencia;
  fechaInicial: Date;
  fechaFinal: Date;
  empleado: Pick<Empleado, "fechaIngreso">;
  licenciasExistentes: Pick<Licencia, "id" | "bolsa" | "anio" | "dias" | "diasConGoce">[];
  excluirId?: string;        // al editar, no contar la licencia que se edita
}): EvaluacionLicencia {
  const { categoria, fechaInicial, fechaFinal, empleado, licenciasExistentes, excluirId } = params;
  const meta = CATEGORIAS[categoria];
  const bolsa = meta.bolsa;
  const dias = Math.max(0, diasInclusivos(fechaInicial, fechaFinal));
  const anio = fechaInicial.getFullYear();

  // Categorías que no descuentan saldo (lactancia/decreto): informativas.
  if (!meta.descuentaSaldo) {
    const conGoce = meta.conGocePorDefecto;
    return {
      dias, anio, bolsa, descuentaSaldo: false,
      tope: 0, usadoPrevio: 0, disponiblePrevio: 0,
      diasConGoce: conGoce ? dias : 0,
      diasSinGoce: conGoce ? 0 : dias,
      excede: false, exceso: 0, bloqueado: false, requiereJustificacion: false,
      mensaje: null,
    };
  }

  const anios = antiguedadAnios(empleado.fechaIngreso, fechaInicial);
  const tope = topeBolsa(bolsa, anios);
  const usadoPrevio = consumoBolsa(bolsa, licenciasExistentes, anio, excluirId);
  const disponiblePrevio = Math.max(0, tope - usadoPrevio);
  const total = usadoPrevio + dias;
  const excede = total > tope;
  const exceso = Math.max(0, total - tope);

  if (meta.comportamiento === "advertir") {
    // Médicas: el exceso sobre el tope con goce se reclasifica a sin goce.
    const diasConGoce = Math.min(dias, disponiblePrevio);
    const diasSinGoce = dias - diasConGoce;
    return {
      dias, anio, bolsa, descuentaSaldo: true,
      tope, usadoPrevio, disponiblePrevio,
      diasConGoce, diasSinGoce,
      excede, exceso, bloqueado: false, requiereJustificacion: excede,
      mensaje: excede
        ? `Excede el tope anual de ${tope} días (lleva ${usadoPrevio}). Los ${exceso} día(s) sobre el tope se registrarán SIN goce de sueldo. Indica una justificación.`
        : null,
    };
  }

  // Discrecionales (duelo/cuido/personal/sin goce): se bloquea al exceder.
  const conGoce = meta.conGocePorDefecto;
  return {
    dias, anio, bolsa, descuentaSaldo: true,
    tope, usadoPrevio, disponiblePrevio,
    diasConGoce: conGoce ? dias : 0,
    diasSinGoce: conGoce ? 0 : dias,
    excede, exceso, bloqueado: excede, requiereJustificacion: false,
    mensaje: excede
      ? `Supera el tope legal de ${tope} días para esta licencia (lleva ${usadoPrevio}, disponible ${disponiblePrevio}). No se puede registrar.`
      : null,
  };
}
