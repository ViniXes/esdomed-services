import { valorComoTexto } from "@/lib/matrizCuidadosCriticos";

export function fechaCuidadosCriticos(value: unknown): Date | null {
  if (!value) return null;

  const timestamp = value as { toDate?: () => Date };
  if (typeof timestamp.toDate === "function") {
    const fechaTimestamp = timestamp.toDate();
    if (!Number.isNaN(fechaTimestamp.getTime())) {
      return normalizarFecha(fechaTimestamp);
    }
  }

  const texto = valorComoTexto(value).trim();
  if (!texto) return null;

  const fechaTexto = texto.split(/\s+/)[0];

  const iso = fechaTexto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return fechaDesdePartes(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const local = fechaTexto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (local) {
    const anio = normalizarAnio(Number(local[3]));
    return fechaDesdePartes(anio, Number(local[2]), Number(local[1]));
  }

  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime()) ? null : normalizarFecha(fecha);
}

function normalizarAnio(anio: number) {
  return anio < 100 ? 2000 + anio : anio;
}

function fechaDesdePartes(anio: number, mes: number, dia: number) {
  const fecha = new Date(anio, mes - 1, dia);
  if (
    fecha.getFullYear() !== anio
    || fecha.getMonth() !== mes - 1
    || fecha.getDate() !== dia
  ) {
    return null;
  }
  return fecha;
}

function normalizarFecha(fecha: Date) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}
