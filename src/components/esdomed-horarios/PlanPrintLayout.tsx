"use client";

import { Fragment } from "react";
import type { PlanTrabajo } from "@/types";
import { getHorario, totalHorasFila } from "@/lib/esdomed/horarios";
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
  const filas = [...plan.filas].sort((a, b) => {
    const isJefeA = a.nombre.toLowerCase().includes("benjamin") && a.nombre.toLowerCase().includes("cardoza");
    const isJefeB = b.nombre.toLowerCase().includes("benjamin") && b.nombre.toLowerCase().includes("cardoza");

    const grupoDiff = ordenGrupo(a.grupo) - ordenGrupo(b.grupo);
    if (grupoDiff !== 0) return grupoDiff;

    if (isJefeA && !isJefeB) return -1;
    if (!isJefeA && isJefeB) return 1;

    return a.nombre.localeCompare(b.nombre);
  });

  const filasInstitucional = filas.filter(f => !f.codigoMarcacion?.toUpperCase().includes("MPW"));
  const filasManpower = filas.filter(f => f.codigoMarcacion?.toUpperCase().includes("MPW"));

  const renderTable = (datos: typeof filas) => {
    if (datos.length === 0) return null;
    return (
      <div className="mb-8 break-inside-avoid">
        {/* Encabezado Principal */}
        <div className="px-2 pt-2 mb-2 text-center">
          <h1 className="text-[14px] font-black uppercase tracking-wide">Hospital Nacional El Salvador</h1>
          <h2 className="text-[12px] font-bold uppercase text-gray-700">Plan de Trabajo Mensual</h2>
        </div>

        <div className="px-2 flex justify-between items-end">
          <div>
            <p className="text-[11px] font-bold">DEPARTAMENTO: ESDOMED</p>
            <p className="text-[9px]">
              <span className="font-bold">NÚMERO DE HORAS: </span>
              {plan.numeroHoras || "—"}
            </p>
          </div>
        </div>

        <table className="plan-table w-full border-collapse text-[8px] mt-1 table-fixed">
          <thead>
            {/* Fila de mes/año + iniciales de día */}
            <tr>
              <td className="border border-black px-1 py-0.5 font-bold text-[9px] w-[50px]" colSpan={1}>
                MES: {plan.mes}
              </td>
              <td className="border border-black px-1 py-0.5 font-bold text-[9px]" colSpan={2}>
                AÑO: {plan.anio}
              </td>
              {dias.map((d, i) => {
                const finde = iniciales[i] === "S" || iniciales[i] === "D";
                return (
                  <td key={`ini-${d}`} className={`border border-black text-center font-bold w-[12px] ${finde ? "bg-gray-200" : ""}`}>
                    {iniciales[i]}
                  </td>
                );
              })}
              <td className="border border-black w-[15px]" />
            </tr>
            {/* Fila de encabezados de columna */}
            <tr className="bg-gray-100">
              <th className="border border-black px-1 py-0.5 text-left w-[50px]">CÓDIGO</th>
              <th className="border border-black px-1 py-0.5 text-left w-[130px]">NOMBRE COMPLETO</th>
              <th className="border border-black px-1 py-0.5 text-left w-[100px]">PUESTO</th>
              {dias.map((d, i) => {
                const finde = iniciales[i] === "S" || iniciales[i] === "D";
                return (
                  <th key={`num-${d}`} className={`border border-black text-center w-[12px] ${finde ? "bg-gray-200" : ""}`}>
                    {d}
                  </th>
                );
              })}
              <th className="border border-black px-0.5 text-center w-[15px]">HRS</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let grupoPrev: string | null = "__init__";
              return datos.map((fila, idx) => {
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
                      <td className="border border-black px-1 py-0.5 font-medium whitespace-nowrap overflow-hidden text-ellipsis">{fila.codigoMarcacion}</td>
                      <td className="border border-black px-1 py-0.5 whitespace-nowrap overflow-hidden text-ellipsis">{fila.nombre}</td>
                      <td className="border border-black px-1 py-0.5 text-[7px] leading-tight whitespace-nowrap overflow-hidden text-ellipsis">{fila.puesto}</td>
                      {dias.map((d, i) => {
                        const celda = (fila.asignaciones[i] ?? "").trim().toUpperCase();
                        const finde = iniciales[i] === "S" || iniciales[i] === "D";
                        return (
                          <td key={`${idx}-${d}`} className={`border border-black text-center ${finde ? "bg-gray-100" : ""}`}>
                            {celda}
                          </td>
                        );
                      })}
                      <td className="border border-black text-center font-bold tabular-nums bg-gray-50">{total}</td>
                    </tr>
                  </Fragment>
                );
              });
            })()}
          </tbody>
        </table>
      </div>
    );
  };

  // Obtener horarios únicos presentes en el plan
  const codigosPresentes = new Set<string>();
  filas.forEach(f => {
    f.asignaciones.forEach(c => {
      const val = c?.trim().toUpperCase();
      if (val) codigosPresentes.add(val);
    });
  });

  const horariosUsados = Array.from(codigosPresentes)
    .map(c => getHorario(c))
    .filter((h): h is NonNullable<typeof h> => h !== undefined)
    .sort((a, b) => a.codigo.localeCompare(b.codigo));

  return (
    <div className="plan-print text-black bg-white">
      {renderTable(filasInstitucional)}
      
      {filasManpower.length > 0 && (
        <div style={{ pageBreakBefore: "always" }}>
          {renderTable(filasManpower)}
        </div>
      )}
      
      {/* Cuadro de horarios presentes */}
      {horariosUsados.length > 0 && (
        <div className="mt-6 px-2 break-inside-avoid">
          <p className="text-[9px] font-bold mb-1 uppercase">Códigos de Horario Utilizados en este plan:</p>
          <table className="border-collapse text-[8px] w-auto">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-black px-2 py-0.5 text-left">CÓDIGO</th>
                <th className="border border-black px-2 py-0.5 text-left">HORARIO (ENTRADA - SALIDA)</th>
                <th className="border border-black px-2 py-0.5 text-center">HORAS</th>
              </tr>
            </thead>
            <tbody>
              {horariosUsados.map(h => (
                <tr key={h.codigo}>
                  <td className="border border-black px-2 py-0.5 font-bold">{h.codigo}</td>
                  <td className="border border-black px-2 py-0.5">{h.entrada} - {h.salida}</td>
                  <td className="border border-black px-2 py-0.5 text-center">{h.horas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Espacios de firma al final del documento */}
      <div className="mt-16 flex justify-around items-center px-10 text-[10px] break-inside-avoid">
        <div className="flex flex-col items-center">
          <div className="w-48 border-b border-black mb-1"></div>
          <span className="font-bold uppercase">Elaborado por:</span>
        </div>
        <div className="flex flex-col items-center">
          <div className="w-48 border-b border-black mb-1"></div>
          <span className="font-bold uppercase">Revisado Por:</span>
        </div>
      </div>

      <p className="px-2 pt-6 pb-2 text-[7px] text-gray-500 text-center">
        Generado desde el Portal ESDOMED · {plan.filas.length} empleados en total
      </p>
    </div>
  );
}
