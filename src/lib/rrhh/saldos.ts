import type {
  BolsaLicencia, CategoriaLicencia, Empleado, Licencia, UnidadLicencia,
} from "@/types";
import { CATEGORIAS, unidadBolsa } from "./catalogo";
import { formatCantidad } from "./formato";

// ── Topes legales (Ley de Servicio Civil) ────────────────────────────────────
// Jornada base de 8 horas/día.
//   Incapacidad por enfermedad (DÍAS): 15 días × años de antigüedad, máx 90.
//   Duelo / cuido de pariente (DÍAS): 20 días/año.
//   Permiso personal CON goce (HORAS): 40 h/año  (= 5 días de 8 h).
//   Permiso SIN goce (HORAS): 480 h/año  (= 60 días de 8 h).
//   Maternidad (DÍAS): 112 días por evento (16 semanas), no es bolsa anual.

export const MATERNIDAD_DIAS = 112;
const TOPE_DUELO_CUIDO = 20;          // días
const TOPE_PERSONAL_CONGOCE = 40;     // horas (5 días × 8 h)
const TOPE_PERMISO_SINGOCE = 480;     // horas (60 días × 8 h)
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

/** Tope anual de una bolsa (en su unidad: días u horas). */
export function topeBolsa(bolsa: BolsaLicencia, anios: number): number {
  switch (bolsa) {
    case "incapacidad":      return topeIncapacidad(anios);   // días
    case "duelo_cuido":      return TOPE_DUELO_CUIDO;         // días
    case "personal_congoce": return TOPE_PERSONAL_CONGOCE;    // horas
    case "permiso_singoce":  return TOPE_PERMISO_SINGOCE;     // horas
    case "maternidad":       return MATERNIDAD_DIAS;          // días
    case "ninguna":          return 0;
  }
}

// ── Días de un periodo (inclusivo: inicio y fin cuentan) ──────────────────────
// Ej: 25 de enero al 7 de febrero = 14 días.
export function diasInclusivos(inicial: Date, final: Date): number {
  const a = new Date(inicial.getFullYear(), inicial.getMonth(), inicial.getDate());
  const b = new Date(final.getFullYear(), final.getMonth(), final.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

// ── Consumo de una bolsa en un año ────────────────────────────────────────────
// La bolsa de incapacidad mide su consumo en días CON GOCE (el exceso se
// reclasifica a sin goce y no consume más). Las demás miden la cantidad total.
function cantidadComputada(lic: Pick<Licencia, "bolsa" | "cantidad" | "cantidadConGoce">): number {
  return lic.bolsa === "incapacidad" ? lic.cantidadConGoce : lic.cantidad;
}

export function consumoBolsa(
  bolsa: BolsaLicencia,
  licencias: Pick<Licencia, "bolsa" | "anio" | "cantidad" | "cantidadConGoce">[],
  anio: number,
  excluirId?: string,
): number {
  return licencias
    .filter((l) => l.bolsa === bolsa && l.anio === anio)
    .filter((l) => !excluirId || (l as Licencia).id !== excluirId)
    .reduce((sum, l) => sum + cantidadComputada(l), 0);
}

// ── Saldo por bolsa para la vista del empleado ────────────────────────────────
export interface SaldoBolsa {
  bolsa: BolsaLicencia;
  unidad: UnidadLicencia;
  tope: number;
  usado: number;
  disponible: number;
}

// Las 4 bolsas anuales que se muestran al empleado (maternidad es por evento).
const BOLSAS_ANUALES: BolsaLicencia[] = [
  "incapacidad", "duelo_cuido", "personal_congoce", "permiso_singoce",
];

/** Saldos de las bolsas anuales para un empleado en un año calendario. */
export function saldosEmpleado(
  empleado: Pick<Empleado, "fechaIngreso">,
  licencias: Pick<Licencia, "bolsa" | "anio" | "cantidad" | "cantidadConGoce">[],
  anio: number,
): SaldoBolsa[] {
  // Antigüedad al cierre del año en cuestión (31 de dic) — el derecho del año.
  const anios = antiguedadAnios(empleado.fechaIngreso, new Date(anio, 11, 31));
  return BOLSAS_ANUALES.map((bolsa) => {
    const tope = topeBolsa(bolsa, anios);
    const usado = consumoBolsa(bolsa, licencias, anio);
    return { bolsa, unidad: unidadBolsa(bolsa), tope, usado, disponible: Math.max(0, tope - usado) };
  });
}

// ── Evaluación de un registro nuevo (lógica híbrida al exceder) ───────────────
export interface EvaluacionLicencia {
  cantidad: number;
  unidad: UnidadLicencia;
  anio: number;
  bolsa: BolsaLicencia;
  descuentaSaldo: boolean;

  tope: number;
  usadoPrevio: number;
  disponiblePrevio: number;

  cantidadConGoce: number;
  cantidadSinGoce: number;

  excede: boolean;
  exceso: number;            // cantidad por encima del tope
  bloqueado: boolean;        // true → no se permite guardar (bolsas discrecionales)
  requiereJustificacion: boolean;

  mensaje: string | null;
}

/**
 * Evalúa una licencia propuesta contra los saldos del empleado.
 * Médicas → advierten y permiten (exceso → sin goce). Discrecionales → bloquean.
 * `cantidad` viene en la unidad de la bolsa (días u horas), calculada por el form.
 */
export function evaluarLicencia(params: {
  categoria: CategoriaLicencia;
  fecha: Date;               // día de referencia (fechaInicial) → año + antigüedad
  cantidad: number;          // días u horas según la bolsa
  empleado: Pick<Empleado, "fechaIngreso">;
  licenciasExistentes: Pick<Licencia, "id" | "bolsa" | "anio" | "cantidad" | "cantidadConGoce">[];
  excluirId?: string;        // al editar, no contar la licencia que se edita
}): EvaluacionLicencia {
  const { categoria, fecha, cantidad, empleado, licenciasExistentes, excluirId } = params;
  const meta = CATEGORIAS[categoria];
  const bolsa = meta.bolsa;
  const unidad = unidadBolsa(bolsa);
  const anio = fecha.getFullYear();
  const cant = Math.max(0, cantidad);

  // Categorías que no descuentan saldo (lactancia/decreto): informativas.
  if (!meta.descuentaSaldo) {
    const conGoce = meta.conGocePorDefecto;
    return {
      cantidad: cant, unidad, anio, bolsa, descuentaSaldo: false,
      tope: 0, usadoPrevio: 0, disponiblePrevio: 0,
      cantidadConGoce: conGoce ? cant : 0,
      cantidadSinGoce: conGoce ? 0 : cant,
      excede: false, exceso: 0, bloqueado: false, requiereJustificacion: false,
      mensaje: null,
    };
  }

  const anios = antiguedadAnios(empleado.fechaIngreso, fecha);
  const tope = topeBolsa(bolsa, anios);
  const usadoPrevio = consumoBolsa(bolsa, licenciasExistentes, anio, excluirId);
  const disponiblePrevio = Math.max(0, tope - usadoPrevio);
  const total = usadoPrevio + cant;
  const excede = total > tope;
  const exceso = Math.max(0, total - tope);

  if (meta.comportamiento === "advertir") {
    // Médicas: el exceso sobre el tope con goce se reclasifica a sin goce.
    const cantidadConGoce = Math.min(cant, disponiblePrevio);
    const cantidadSinGoce = cant - cantidadConGoce;
    return {
      cantidad: cant, unidad, anio, bolsa, descuentaSaldo: true,
      tope, usadoPrevio, disponiblePrevio,
      cantidadConGoce, cantidadSinGoce,
      excede, exceso, bloqueado: false, requiereJustificacion: excede,
      mensaje: excede
        ? `Excede el tope anual de ${formatCantidad(tope, unidad)} (lleva ${formatCantidad(usadoPrevio, unidad)}). ` +
          `Lo que pasa del tope (${formatCantidad(exceso, unidad)}) se registrará SIN goce de sueldo. Indica una justificación.`
        : null,
    };
  }

  // Discrecionales (duelo/cuido/personal/sin goce): se bloquea al exceder.
  const conGoce = meta.conGocePorDefecto;
  return {
    cantidad: cant, unidad, anio, bolsa, descuentaSaldo: true,
    tope, usadoPrevio, disponiblePrevio,
    cantidadConGoce: conGoce ? cant : 0,
    cantidadSinGoce: conGoce ? 0 : cant,
    excede, exceso, bloqueado: excede, requiereJustificacion: false,
    mensaje: excede
      ? `Supera el tope legal de ${formatCantidad(tope, unidad)} para esta licencia ` +
        `(lleva ${formatCantidad(usadoPrevio, unidad)}, disponible ${formatCantidad(disponiblePrevio, unidad)}). No se puede registrar.`
      : null,
  };
}
