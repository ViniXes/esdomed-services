import { getSupabase } from "./supabase";
import type { CensoParaHonorarios } from "./honorarios";

export async function censosParaHonorarios(mes: string): Promise<CensoParaHonorarios[]> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error("Selecciona un mes válido.");
  const [anio, numeroMes] = mes.split("-").map(Number);
  const siguiente = numeroMes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(numeroMes + 1).padStart(2, "0")}-01`;
  const filas: CensoParaHonorarios[] = [];
  // Recuperar todos los bloques evita el límite REST de 1.000 filas por mes.
  for (let desde = 0; ; desde += 500) {
    const { data, error } = await getSupabase().from("censo_diario")
      .select("id, medico_tratante_nombre, total_cobrable_dia")
      .eq("dia_cerrado", true).gte("fecha", `${mes}-01`).lt("fecha", siguiente)
      .order("id").range(desde, desde + 499);
    if (error) throw new Error(`No se pudo consultar la participación médica: ${error.message}`);
    filas.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return filas;
}
