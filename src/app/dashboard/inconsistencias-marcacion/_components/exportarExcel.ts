import {
  desgloseMinutos,
  TIPO_INCIDENCIA_LABEL,
  type ResumenAlcance,
} from "@/lib/inconsistenciasMarcacion/analisis";

const fechaDmy = (iso: string) => iso.split("-").reverse().join("/");

/** Excel del alcance mostrado: hoja por persona y hoja con cada día. */
export async function exportarInconsistenciasExcel(resumen: ResumenAlcance, titulo: string, nombreArchivo: string) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const aoa: (string | number)[][] = [
    ["Inconsistencias de marcación — ESDOMED"],
    [titulo],
    [],
    ["Código", "Nombre", "Plaza", "Días con incidencia", "Olvidó marcar entrada", "Olvidó marcar salida", "Sin ninguna marca", "Días con tardanza / salida temprana", "Minutos de tardanza / salida temprana", "Meses con descuento", "Total descontado ($)"],
  ];
  for (const p of resumen.personas) {
    aoa.push([
      p.codigoMarcacion,
      p.nombre,
      p.plaza,
      p.dias.length,
      p.porTipo.omision_entrada.eventos,
      p.porTipo.omision_salida.eventos,
      p.porTipo.sin_marcacion.eventos,
      p.porTipo.minutos.eventos,
      p.porTipo.minutos.minutos,
      p.meses.length,
      p.total,
    ]);
  }
  aoa.push(["", "Total", "", resumen.incidencias, "", "", "", "", "", "", resumen.total]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Por persona");

  const detalle = resumen.personas.flatMap((p) =>
    [...p.dias]
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((d) => {
        const { tarde, temprano } = desgloseMinutos(d);
        return {
          Código: p.codigoMarcacion,
          Nombre: p.nombre,
          Fecha: fechaDmy(d.fecha),
          Horario: d.horario,
          Entrada: d.entrada === "00:00" ? "Sin marca" : d.entrada,
          Salida: d.salida === "00:00" ? "Sin marca" : d.salida,
          Incidencia: TIPO_INCIDENCIA_LABEL[d.tipo],
          "Min. tarde (estimado)": tarde || "",
          "Min. salida temprana (estimado)": temprano || "",
          "Tiempo descontado (min)": d.minutos,
          "Monto ($)": d.monto,
        };
      }),
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), "Detalle por día");

  XLSX.writeFile(wb, nombreArchivo);
}
