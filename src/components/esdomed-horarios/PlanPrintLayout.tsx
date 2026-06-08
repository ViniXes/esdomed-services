"use client";

import { Fragment } from "react";
import type { PlanTrabajo } from "@/types";
import { totalHorasFila } from "@/lib/esdomed/horarios";
import { diasDelMesArray, inicialesDeMes, ordenGrupo } from "@/lib/esdomed/plan";

interface Props {
  plan: PlanTrabajo;
}

/**
 * Replica el formato oficial del rol de turnos ESDOMED (hoja del Excel que se
 * presenta a RH). Cuadrícula: una fila por empleado, una columna por día del
 * mes con su código de horario. Diseñado para imprimir en horizontal (oficio/
 * carta apaisado).
 */
export function PlanPrintLayout({ plan }: Props) {
  const dias = diasDelMesArray(plan.anio, plan.mes);
  const iniciales = inicialesDeMes(plan.anio, plan.mes);
  const colSpanTotal = dias.length + 4; // código + nombre + puesto + días + total

  // Ordenadas por grupo y nombre, para subtotalizar por grupo en el PDF.
  const filas = [...plan.filas].sort(
    (a, b) => ordenGrupo(a.grupo) - ordenGrupo(b.grupo) || a.nombre.localeCompare(b.nombre),
  );

  return (
    <div className="plan-print text-black bg-white">
      {/* Encabezado */}
      <div className="px-2 pt-2">
        <p className="text-[13px] font-bold">ESDOMED</p>
        <p className="text-[10px]">
          <span className="font-bold">NÚMERO DE HORAS: </span>
          {plan.numeroHoras || "—"}
        </p>
      </div>

      <table className="plan-table w-full border-collapse text-[8px] mt-1">
        <thead>
          {/* Fila de mes/año + iniciales de día */}
          <tr>
            <td className="border border-black px-1 py-0.5 font-bold text-[9px]" colSpan={1}>
              MES: {plan.mes}
            </td>
            <td className="border border-black px-1 py-0.5 font-bold text-[9px]" colSpan={2}>
              AÑO: {plan.anio}
            </td>
            {dias.map((d, i) => {
              const finde = iniciales[i] === "S" || iniciales[i] === "D";
              return (
                <td key={`ini-${d}`} className={`border border-black text-center font-bold ${finde ? "bg-gray-200" : ""}`}>
                  {iniciales[i]}
                </td>
              );
            })}
            <td className="border border-black" />
          </tr>
          {/* Fila de encabezados de columna */}
          <tr className="bg-gray-100">
            <th className="border border-black px-1 py-0.5 text-left w-[70px]">CÓDIGO DE MARCACIÓN</th>
            <th className="border border-black px-1 py-0.5 text-left w-[150px]">NOMBRE COMPLETO</th>
            <th className="border border-black px-1 py-0.5 text-left w-[120px]">PUESTO</th>
            {dias.map((d, i) => {
              const finde = iniciales[i] === "S" || iniciales[i] === "D";
              return (
                <th key={`num-${d}`} className={`border border-black text-center w-[14px] ${finde ? "bg-gray-200" : ""}`}>
                  {d}
                </th>
              );
            })}
            <th className="border border-black px-0.5 text-center">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {(() => {
            let grupoPrev: string | null = "__init__";
            return filas.map((fila, idx) => {
              const total = totalHorasFila(fila.asignaciones);
              const grupoActual = fila.grupo?.trim() || "";
              const mostrarHeader = grupoActual !== grupoPrev;
              grupoPrev = grupoActual;
              return (
                <Fragment key={fila.uid || fila.codigoMarcacion || idx}>
                  {mostrarHeader && (
                    <tr>
                      <td colSpan={colSpanTotal} className="border border-black bg-gray-200 px-1 py-0.5 font-bold text-[8px] uppercase tracking-wide">
                        {grupoActual || "Sin grupo"}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="border border-black px-1 py-0.5 font-medium">{fila.codigoMarcacion}</td>
                    <td className="border border-black px-1 py-0.5">{fila.nombre}</td>
                    <td className="border border-black px-1 py-0.5 text-[7px] leading-tight">{fila.puesto}</td>
                    {dias.map((d, i) => {
                      const celda = (fila.asignaciones[i] ?? "").trim().toUpperCase();
                      const finde = iniciales[i] === "S" || iniciales[i] === "D";
                      return (
                        <td key={`${idx}-${d}`} className={`border border-black text-center ${finde ? "bg-gray-100" : ""}`}>
                          {celda}
                        </td>
                      );
                    })}
                    <td className="border border-black text-center font-bold tabular-nums">{total}</td>
                  </tr>
                </Fragment>
              );
            });
          })()}
        </tbody>
      </table>

      <p className="px-2 pt-2 text-[7px] text-gray-500">
        Generado desde el Portal ESDOMED · {plan.filas.length} empleados
      </p>
    </div>
  );
}
