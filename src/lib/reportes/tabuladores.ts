// Tabuladores de ESDOMED (Reportes → Tabuladores): pivote servicio × columna,
// compartido entre la página y su PDF institucional.

import type { EstadoPaciente, Genero, Paciente } from "@/types";
import { claveServicio } from "@/lib/servicios";

export interface ColDef { key: string; label: string }
export interface FilaPivote { servicio: string; cols: Record<string, number>; total: number }
export interface Pivote { filas: FilaPivote[]; totCols: Record<string, number>; totalGeneral: number }

// Modalidades de egreso vivo (cualquiera cuenta como "egreso vivo").
export const MODALIDADES_VIVO: { key: EstadoPaciente; label: string }[] = [
  { key: "alta_vivo",       label: "Domicilio" },
  { key: "alta_voluntaria", label: "Voluntaria / Exigida" },
  { key: "referido",        label: "Traslado a otro hospital" },
  { key: "fuga",            label: "Fuga" },
  { key: "in_extremis",     label: "In extremis" },
];
export const ESTADOS_VIVO = MODALIDADES_VIVO.map((m) => m.key);

export const generoDe = (g?: Genero): "masculino" | "femenino" | "otro" =>
  g === "masculino" ? "masculino" : g === "femenino" ? "femenino" : "otro";

export const sexoCols = (items: Paciente[]): ColDef[] => {
  const base: ColDef[] = [{ key: "masculino", label: "Masculino" }, { key: "femenino", label: "Femenino" }];
  return items.some((p) => generoDe(p.genero) === "otro") ? [...base, { key: "otro", label: "Otro" }] : base;
};

export const servicioDe = (p: Paciente) => (p.servicioActual || "Sin servicio").trim();

/** Agrupa por servicio comparando por clave (caja, tildes y espacios no parten
 *  un servicio en dos filas); la fila muestra el primer nombre visto. */
export function pivotar(items: Paciente[], columnas: ColDef[], clasificar: (p: Paciente) => string): Pivote {
  const filas = new Map<string, FilaPivote>();
  const totCols: Record<string, number> = {};
  columnas.forEach((c) => { totCols[c.key] = 0; });
  let totalGeneral = 0;
  for (const p of items) {
    const s = servicioDe(p);
    const k = claveServicio(s);
    if (!filas.has(k)) {
      const cols: Record<string, number> = {};
      columnas.forEach((c) => { cols[c.key] = 0; });
      filas.set(k, { servicio: s, cols, total: 0 });
    }
    const f = filas.get(k)!;
    const c = clasificar(p);
    if (c in f.cols) { f.cols[c]++; totCols[c] = (totCols[c] ?? 0) + 1; }
    f.total++; totalGeneral++;
  }
  const lista = Array.from(filas.values()).sort((a, b) => b.total - a.total || a.servicio.localeCompare(b.servicio));
  return { filas: lista, totCols, totalGeneral };
}

/** Bienestar Magisterial agrupa su servicio de encamados, la UCI BM y la UCIN BM
 *  ("Unidad de Cuidados Intensivos/Intermedios Adultos BM", o sus siglas). El resto
 *  son Servicios de Hospitalización MINSAL. Se decide por clave para que ninguna
 *  variante de escritura se cuele al grupo equivocado. */
export function esServicioBM(servicio: string): boolean {
  const tokens = claveServicio(servicio).split(" ");
  return tokens.includes("bm") || tokens.includes("magisterial");
}
