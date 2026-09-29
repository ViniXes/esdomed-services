// Detección de ingresos repetidos en el Control de ingresos de ESDOMED.
//
// Se resuelve contra la lista que la página ya tiene cargada (vista en vivo
// de ayer + hoy, más los históricos si se consultaron): 0 lecturas extra.
// El mismo expediente registrado el MISMO DÍA o dentro de las ÚLTIMAS 12
// HORAS se trata como posible duplicado; solo se guarda si el personal
// confirma que el paciente de verdad llegó de nuevo (reingreso).
// La ventana de 12 h cubre el cambio de día en el turno de noche
// (23:50 → 00:10), que el día calendario solo no detectaría.

export const VENTANA_REINGRESO_MS = 12 * 60 * 60 * 1000;

// Clave de comparación: sin espacios, en mayúsculas y sin ceros a la
// izquierda en el correlativo, para que "0123-26" y "123-26" coincidan.
export function claveExpediente(expediente: string): string {
  const limpio = expediente.trim().toUpperCase().replace(/\s+/g, "");
  const m = /^(\d+)-(\d{2})$/.exec(limpio);
  return m ? `${parseInt(m[1], 10)}-${m[2]}` : limpio;
}

export function fechaDeRegistro(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  const conToDate = ts as { toDate?: () => Date };
  return typeof conToDate.toDate === "function" ? conToDate.toDate() : null;
}

const mismoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

type RegistroIngreso = { id?: string; expediente: string; creadoEn: unknown };

// Registros del mismo expediente cercanos a `referencia` (ahora, al crear;
// la fecha del registro, al editar), del más reciente al más antiguo.
export function ingresosRepetidos<T extends RegistroIngreso>(
  lista: T[],
  expediente: string,
  referencia: Date,
  excluirId?: string,
): T[] {
  const clave = claveExpediente(expediente);
  if (!clave) return [];
  const vistos = new Set<string>();
  const repetidos: { registro: T; fecha: Date }[] = [];
  for (const registro of lista) {
    if (!registro.id || registro.id === excluirId || vistos.has(registro.id)) continue;
    if (claveExpediente(registro.expediente ?? "") !== clave) continue;
    const fecha = fechaDeRegistro(registro.creadoEn);
    if (!fecha) continue;
    if (mismoDia(fecha, referencia) || Math.abs(referencia.getTime() - fecha.getTime()) <= VENTANA_REINGRESO_MS) {
      vistos.add(registro.id);
      repetidos.push({ registro, fecha });
    }
  }
  return repetidos.sort((a, b) => b.fecha.getTime() - a.fecha.getTime()).map(r => r.registro);
}
