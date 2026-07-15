/**
 * Calendario laboral exclusivo de los planes de trabajo ESDOMED.
 *
 * Las fechas adicionales se escriben como AAAA-MM-DD. Esto permite incorporar
 * asuetos extraordinarios sin alterar perfiles de usuario ni otros módulos.
 */
export const DIAS_NO_LABORALES_ADMIN_ADICIONALES: readonly string[] = [];

const DIAS_ADICIONALES = new Set(DIAS_NO_LABORALES_ADMIN_ADICIONALES);

function fechaClave(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function domingoPascua(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anio, mes - 1, dia);
}

function diaRegresoEnero(anio: number): number {
  const fecha = new Date(anio, 0, 3);
  while (fecha.getDay() === 0 || fecha.getDay() === 6) fecha.setDate(fecha.getDate() + 1);
  return fecha.getDate();
}

/** Reglas institucionales recuperadas del sistema anterior. */
export function esAsuetoAdministrativo(anio: number, mes: number, dia: number): boolean {
  if (DIAS_ADICIONALES.has(fechaClave(anio, mes, dia))) return true;
  if ((mes === 5 && dia === 10) || (mes === 6 && dia === 17) || (mes === 9 && dia === 15) || (mes === 11 && dia === 2)) return true;
  if (mes === 8 && dia >= 1 && dia <= 6) return true;
  if (mes === 12 && dia >= 23) return true;
  if (mes === 1 && dia < diaRegresoEnero(anio)) return true;

  const pascua = domingoPascua(anio);
  const inicioSemanaSanta = new Date(pascua);
  inicioSemanaSanta.setDate(pascua.getDate() - 6);
  const finSemanaSanta = new Date(pascua);
  finSemanaSanta.setDate(pascua.getDate() - 2);
  const fecha = new Date(anio, mes - 1, dia);
  return fecha >= inicioSemanaSanta && fecha <= finSemanaSanta;
}

export function esDiaNoLaboralAdministrativo(anio: number, mes: number, dia: number): boolean {
  const fecha = new Date(anio, mes - 1, dia);
  const finDeSemana = fecha.getDay() === 0 || fecha.getDay() === 6;
  return finDeSemana || esAsuetoAdministrativo(anio, mes, dia);
}

export function primerDiaLaboralAdministrativo(anio: number, mes: number, diasMes: number): number | null {
  for (let dia = 1; dia <= diasMes; dia++) {
    if (!esDiaNoLaboralAdministrativo(anio, mes, dia)) return dia;
  }
  return null;
}
