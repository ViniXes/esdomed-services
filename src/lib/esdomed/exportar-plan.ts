// Exporta un plan de trabajo a Excel (.xlsx) con el mismo formato que la hoja
// oficial que se imprime (ver PlanPrintLayout). El archivo es editable para que
// el jefe pueda ajustarlo e imprimirlo desde Excel.
//
// Nota: la versión community de SheetJS no aplica estilos de celda (bordes,
// colores, fuentes). Generamos una cuadrícula limpia con anchos de columna y
// celdas combinadas; el formato visual se deja a Excel.

import * as XLSX from "xlsx";
import type { PlanTrabajo } from "@/types";
import { getHorario, totalHorasFila } from "./horarios";
import { diasDelMesArray, inicialesDeMes, compararFilasPlan, NOMBRES_MES } from "./plan";

export type TipoPlan = "institucional" | "manpower";

// Solo necesitamos estos campos para construir la hoja.
type PlanExportable = Pick<PlanTrabajo, "anio" | "mes" | "numeroHoras" | "filas">;

const esMPW = (codigo: string | undefined) => !!codigo?.toUpperCase().includes("MPW");

/** Aplica el filtro institucional/manpower y ordena igual que la impresión. */
function filasOrdenadas(plan: PlanExportable, tipo: TipoPlan) {
  const filas = plan.filas.filter((f) =>
    tipo === "institucional" ? !esMPW(f.codigoMarcacion) : esMPW(f.codigoMarcacion),
  );
  return [...filas].sort(compararFilasPlan);
}

/** Construye y descarga el .xlsx del plan para el tipo indicado. */
export function exportarPlanExcel(plan: PlanExportable, tipo: TipoPlan) {
  const dias = diasDelMesArray(plan.anio, plan.mes);
  const iniciales = inicialesDeMes(plan.anio, plan.mes);
  const filas = filasOrdenadas(plan, tipo);

  const lastCol = 3 + dias.length; // CÓDIGO, NOMBRE, PUESTO + días + HRS (índice 0-based)
  const tipoLabel = tipo === "institucional" ? "Institucional" : "Manpower";

  const aoa: (string | number)[][] = [];
  const merges: XLSX.Range[] = [];

  // ── Encabezado ────────────────────────────────────────────────────────────
  aoa.push(["HOSPITAL NACIONAL EL SALVADOR"]);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } });
  aoa.push(["PLAN DE TRABAJO MENSUAL"]);
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } });
  aoa.push([`DEPARTAMENTO: ESDOMED  —  ${tipoLabel}`]);
  merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: lastCol } });
  aoa.push([
    `MES: ${NOMBRES_MES[plan.mes - 1]}`,
    `AÑO: ${plan.anio}`,
    `NÚMERO DE HORAS: ${plan.numeroHoras || "—"}`,
  ]);
  aoa.push([]); // separador

  // ── Cuadrícula: fila de iniciales + fila de encabezados ─────────────────────
  const rowIniciales: (string | number)[] = ["", "", ""];
  iniciales.forEach((ini) => rowIniciales.push(ini));
  rowIniciales.push("");
  aoa.push(rowIniciales);

  const rowHead: (string | number)[] = ["CÓDIGO", "NOMBRE COMPLETO", "PUESTO"];
  dias.forEach((d) => rowHead.push(d));
  rowHead.push("HRS");
  aoa.push(rowHead);

  // ── Filas de personal ───────────────────────────────────────────────────────
  const codigosPresentes = new Set<string>();
  filas.forEach((f) => {
    const row: (string | number)[] = [f.codigoMarcacion || "", f.nombre || "", f.puesto || ""];
    dias.forEach((_, i) => {
      const celda = (f.asignaciones[i] ?? "").trim().toUpperCase();
      if (celda) codigosPresentes.add(celda);
      row.push(celda);
    });
    row.push(totalHorasFila(f.asignaciones));
    aoa.push(row);
  });

  // ── Leyenda de códigos de horario utilizados ───────────────────────────────
  const horariosUsados = Array.from(codigosPresentes)
    .map((c) => getHorario(c))
    .filter((h): h is NonNullable<typeof h> => h !== undefined)
    .sort((a, b) => a.codigo.localeCompare(b.codigo));

  if (horariosUsados.length > 0) {
    aoa.push([]);
    aoa.push(["CÓDIGOS DE HORARIO UTILIZADOS EN ESTE PLAN"]);
    merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: 3 } });
    aoa.push(["CÓDIGO", "HORARIO (ENTRADA - SALIDA)", "", "HORAS"]);
    merges.push({ s: { r: aoa.length - 1, c: 1 }, e: { r: aoa.length - 1, c: 2 } });
    horariosUsados.forEach((h) => {
      aoa.push([h.codigo, `${h.entrada} - ${h.salida}`, "", h.horas]);
      merges.push({ s: { r: aoa.length - 1, c: 1 }, e: { r: aoa.length - 1, c: 2 } });
    });
  }

  // ── Firmas ─────────────────────────────────────────────────────────────────
  aoa.push([]);
  aoa.push([]);
  aoa.push(["ELABORADO POR:", "", "", "REVISADO POR:"]);

  // ── Hoja ─────────────────────────────────────────────────────────────────
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = merges;
  ws["!cols"] = [
    { wch: 9 },  // CÓDIGO
    { wch: 30 }, // NOMBRE COMPLETO
    { wch: 24 }, // PUESTO
    ...dias.map(() => ({ wch: 4 })), // días
    { wch: 6 },  // HRS
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tipoLabel.slice(0, 31));

  const periodo = `${plan.anio}-${String(plan.mes).padStart(2, "0")}`;
  XLSX.writeFile(wb, `Plan_${tipoLabel}_${periodo}.xlsx`);
}
