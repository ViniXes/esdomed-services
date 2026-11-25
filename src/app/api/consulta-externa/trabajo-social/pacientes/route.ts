import { NextRequest, NextResponse } from "next/server";
import { buscarPacientes, fallo, leerPacientes, ok, sesionTS } from "@/lib/consultaExterna/trabajoSocialServidor";

// Pacientes para Trabajo Social de Consulta Externa.
// - GET ?q=texto     → citados (cualquier especialidad) por expediente, DUI o nombre
// - GET ?bitacora=1  → los que ya tienen gestiones, con la más reciente primero
// - GET ?directorio=1 → los que ya tienen ficha en el directorio, la más reciente primero
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const bitacora = params.get("bitacora") === "1";
  const sesion = await sesionTS(req, bitacora ? "consultar" : "registrar");
  if (sesion instanceof NextResponse) return sesion;
  try {
    if (params.get("directorio") === "1") {
      const pacientes = (await leerPacientes(true))
        .filter((p) => (p.fichaMs ?? 0) > 0)
        .sort((a, b) => (b.fichaMs ?? 0) - (a.fichaMs ?? 0));
      return ok({ pacientes });
    }
    if (bitacora) {
      const pacientes = (await leerPacientes(true))
        .filter((p) => (p.gestiones ?? 0) > 0)
        .sort((a, b) => (b.ultimaGestionMs ?? 0) - (a.ultimaGestionMs ?? 0));
      return ok({ pacientes });
    }
    const q = (params.get("q") ?? "").trim().slice(0, 80);
    return ok({ pacientes: q.length < 2 ? [] : await buscarPacientes(q) });
  } catch (e) {
    console.error("Trabajo Social CE: no se pudo buscar pacientes", e);
    return fallo("No se pudo buscar. Intente de nuevo.", 500);
  }
}
