import { NOMBRES_MES } from "@/lib/esdomed/plan";
import type { Quincena } from "@/lib/esdomed/vacaciones";

// Lectura del Excel de programación de vacaciones que arma la jefatura
// (Mes | Quincena | Desde | Hasta | Nombre completo 1 | Nombre completo 2) y
// emparejamiento de los nombres escritos a mano con los usuarios del sistema.

export interface FilaExcelVacaciones {
  mes: number;
  quincena: Quincena;
  nombre: string; // tal como viene en el Excel
}

export interface LecturaExcelVacaciones {
  filas: FilaExcelVacaciones[];
  anioDelArchivo: number | null; // "Programación de vacaciones 2027" en el título
  error?: string;
}

/** minúsculas, sin tildes ni espacios dobles */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const MESES_NORM = NOMBRES_MES.map(normalizarTexto);

function mesDesdeCelda(valor: string): number | null {
  const t = normalizarTexto(valor);
  const idx = MESES_NORM.indexOf(t);
  if (idx >= 0) return idx + 1;
  const n = Number(t);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

function quincenaDesdeCelda(valor: string): Quincena | null {
  const t = normalizarTexto(valor).replace(/\.$/, "");
  if (["primera", "1", "1ra", "1a", "i"].includes(t)) return 1;
  if (["segunda", "2", "2da", "2a", "ii"].includes(t)) return 2;
  return null;
}

/** Filas de la primera hoja (sheet_to_json con header: 1). */
export function leerExcelVacaciones(filas: unknown[][]): LecturaExcelVacaciones {
  const texto = (v: unknown) => String(v ?? "").trim();

  let anioDelArchivo: number | null = null;
  const idxEncabezado = filas.findIndex((fila) => fila.some((c) => normalizarTexto(texto(c)) === "quincena"));
  for (const fila of filas.slice(0, Math.max(idxEncabezado, 1))) {
    const m = fila.map(texto).join(" ").match(/\b(20\d{2})\b/);
    if (m) { anioDelArchivo = Number(m[1]); break; }
  }
  if (idxEncabezado === -1) {
    return { filas: [], anioDelArchivo, error: "No se encontró la fila de encabezados (Mes, Quincena, Nombre completo…)." };
  }

  const encabezado = filas[idxEncabezado].map((c) => normalizarTexto(texto(c)));
  const colMes = encabezado.indexOf("mes");
  const colQuincena = encabezado.indexOf("quincena");
  const colsNombre = encabezado.flatMap((h, i) => (h.startsWith("nombre") ? [i] : []));
  if (colMes === -1 || colsNombre.length === 0) {
    return { filas: [], anioDelArchivo, error: "El encabezado debe tener las columnas Mes, Quincena y al menos una de Nombre." };
  }

  const resultado: FilaExcelVacaciones[] = [];
  for (const fila of filas.slice(idxEncabezado + 1)) {
    const mes = mesDesdeCelda(texto(fila[colMes]));
    const quincena = quincenaDesdeCelda(texto(fila[colQuincena]));
    if (!mes || !quincena) continue;
    for (const col of colsNombre) {
      const nombre = texto(fila[col]).replace(/\s+/g, " ");
      // La fila de Semana Santa trae un rótulo en lugar de nombres.
      if (!nombre || /sin vacaciones|semana santa/i.test(nombre)) continue;
      resultado.push({ mes, quincena, nombre });
    }
  }
  return { filas: resultado, anioDelArchivo };
}

const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y"]);
const tokens = (nombre: string) => normalizarTexto(nombre).split(" ").filter((t) => t && !PARTICULAS.has(t));

export type TipoCoincidencia = "exacta" | "sugerida" | "ninguna";

/**
 * Busca a la persona del Excel entre los usuarios. Exacta = mismo nombre
 * (sin importar tildes ni mayúsculas). Sugerida = un solo usuario cuyo nombre
 * contiene todas las palabras del Excel o al revés ("Diego Ivan Lopez" →
 * "Diego Iván López Hernández"), o el único que comparte más de una palabra.
 * Todo lo que no sea exacto se le pide confirmar al admin.
 */
export function emparejarNombre(
  nombre: string,
  usuarios: { uid: string; nombre: string }[],
): { uid: string; tipo: TipoCoincidencia } {
  const objetivo = normalizarTexto(nombre);
  const exacta = usuarios.filter((u) => normalizarTexto(u.nombre) === objetivo);
  if (exacta.length === 1) return { uid: exacta[0].uid, tipo: "exacta" };

  const delExcel = tokens(nombre);
  const contiene = (a: string[], b: string[]) => a.length > 0 && a.every((t) => b.includes(t));
  const subconjunto = usuarios.filter((u) => {
    const delUsuario = tokens(u.nombre);
    return contiene(delExcel, delUsuario) || contiene(delUsuario, delExcel);
  });
  if (subconjunto.length === 1) return { uid: subconjunto[0].uid, tipo: "sugerida" };

  const puntaje = usuarios
    .map((u) => ({ uid: u.uid, n: tokens(u.nombre).filter((t) => delExcel.includes(t)).length }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.n - a.n);
  if (puntaje.length > 0 && (puntaje.length === 1 || puntaje[0].n > puntaje[1].n)) {
    return { uid: puntaje[0].uid, tipo: "sugerida" };
  }
  return { uid: "", tipo: "ninguna" };
}
