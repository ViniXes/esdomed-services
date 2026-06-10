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

  // Obtener horarios únicos presentes en TODO el plan para mostrar la leyenda unificada
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

  const renderTable = (datos: typeof filas) => {
    if (datos.length === 0) return null;
    return (
      <div className="flex flex-col min-h-[95vh] justify-between break-inside-avoid">
        <div>
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

          <table className="plan-table w-full border-collapse text-[8px] mt-2">
            <thead>
              {/* Fila de mes/año + iniciales de día */}
              <tr>
                <td className="border border-black px-1 py-0.5 font-bold text-[9px] w-[40px] whitespace-nowrap" colSpan={1}>
                  MES: {plan.mes}
                </td>
                <td className="border border-black px-1 py-0.5 font-bold text-[9px]" colSpan={2}>
                  AÑO: {plan.anio}
                </td>
                {dias.map((d, i) => {
                  const finde = iniciales[i] === "S" || iniciales[i] === "D";
                  return (
                    <td key={`ini-${d}`} className={`border border-black text-center font-bold min-w-[18px] ${finde ? "bg-gray-200" : ""}`}>
                      {iniciales[i]}
                    </td>
                  );
                })}
              <td className="border border-black w-[20px]" />
            </tr>
            {/* Fila de encabezados de columna */}
            <tr className="bg-gray-100">
              <th className="border border-black px-1 py-0.5 text-left w-[40px] whitespace-nowrap">CÓDIGO</th>
              <th className="border border-black px-1 py-0.5 text-left w-[120px] whitespace-nowrap">NOMBRE COMPLETO</th>
              <th className="border border-black px-1 py-0.5 text-left w-[70px] whitespace-nowrap">PUESTO</th>
                {dias.map((d, i) => {
                  const finde = iniciales[i] === "S" || iniciales[i] === "D";
                  return (
                    <th key={`num-${d}`} className={`border border-black text-center min-w-[18px] ${finde ? "bg-gray-200" : ""}`}>
                      {d}
                    </th>
                  );
                })}
                <th className="border border-black px-0.5 text-center w-[20px]">HRS</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((fila, idx) => {
                const total = totalHorasFila(fila.asignaciones);
                return (
                  <tr key={fila.uid || fila.codigoMarcacion || idx}>
                    <td className="border border-black px-1 py-0.5 font-medium whitespace-nowrap max-w-[40px] overflow-hidden text-ellipsis">{fila.codigoMarcacion}</td>
                    <td className="border border-black px-1 py-0.5 whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis" title={fila.nombre}>{fila.nombre}</td>
                    <td className="border border-black px-1 py-0.5 text-[7px] leading-tight whitespace-nowrap max-w-[70px] overflow-hidden text-ellipsis" title={fila.puesto}>{fila.puesto}</td>
                    {dias.map((d, i) => {
                      const celda = (fila.asignaciones[i] ?? "").trim().toUpperCase();
                      const finde = iniciales[i] === "S" || iniciales[i] === "D";
                      return (
                        <td key={`${idx}-${d}`} className={`border border-black text-center font-bold ${finde ? "bg-gray-100" : ""}`}>
                          {celda}
                        </td>
                      );
                    })}
                    <td className="border border-black text-center font-bold tabular-nums bg-gray-50">{total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div>
          {/* Cuadro de horarios presentes */}
          {horariosUsados.length > 0 && (
            <div className="mt-1 px-2 break-inside-avoid">
              <p className="text-[9px] font-bold mb-0.5 uppercase">Códigos de Horario Utilizados en este plan:</p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <table className="border-collapse text-[8px] w-auto">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-black px-2 py-0.5 text-left">CÓDIGO</th>
                      <th className="border border-black px-2 py-0.5 text-left">HORARIO (ENTRADA - SALIDA)</th>
                      <th className="border border-black px-2 py-0.5 text-center">HORAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Dividimos la leyenda en dos columnas si hay muchos códigos para ahorrar espacio vertical */}
                    {horariosUsados.slice(0, Math.ceil(horariosUsados.length / 2)).map(h => (
                      <tr key={h.codigo}>
                        <td className="border border-black px-2 py-0.5 font-bold">{h.codigo}</td>
                        <td className="border border-black px-2 py-0.5">{h.entrada} - {h.salida}</td>
                        <td className="border border-black px-2 py-0.5 text-center">{h.horas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {horariosUsados.length > 1 && (
                  <table className="border-collapse text-[8px] w-auto">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-black px-2 py-0.5 text-left">CÓDIGO</th>
                        <th className="border border-black px-2 py-0.5 text-left">HORARIO (ENTRADA - SALIDA)</th>
                        <th className="border border-black px-2 py-0.5 text-center">HORAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {horariosUsados.slice(Math.ceil(horariosUsados.length / 2)).map(h => (
                        <tr key={h.codigo}>
                          <td className="border border-black px-2 py-0.5 font-bold">{h.codigo}</td>
                          <td className="border border-black px-2 py-0.5">{h.entrada} - {h.salida}</td>
                          <td className="border border-black px-2 py-0.5 text-center">{h.horas}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Espacios de firma al final de cada página */}
          <div className="mt-10 flex justify-around items-center px-10 text-[10px] break-inside-avoid">
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
            Generado desde el Portal ESDOMED · Plan de Trabajo de {datos.length} empleados
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="plan-print text-black bg-white">
      {renderTable(filas)}
    </div>
  );
}
