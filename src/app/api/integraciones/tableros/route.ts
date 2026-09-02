import { NextRequest, NextResponse } from "next/server";
import { rechazoAuth, SIN_CACHE } from "@/lib/integraciones/auth";
import { CACHE_TTL_MS, MAX_DIAS_RANGO, TABLEROS, ZONA_HORARIA } from "@/lib/integraciones/tableros";

// GET /api/integraciones/tableros — índice autodescriptivo: qué tableros hay,
// qué servicios abarca cada uno y cómo consultarlos. Es lo que se le entrega
// al equipo del sistema consumidor.
export async function GET(req: NextRequest) {
  const rechazo = rechazoAuth(req);
  if (rechazo) return rechazo;

  const base = "/api/integraciones/tableros";
  return NextResponse.json(
    {
      tableros: TABLEROS.map((t) => ({
        id: t.id,
        nombre: t.nombre,
        metrica: t.metrica,
        descripcion: t.descripcion,
        servicios: t.servicios,
        url: `${base}/${t.id}`,
      })),
      parametros: {
        anio: "YYYY — serie mensual del año (por defecto: año en curso)",
        mes: "YYYY-MM — un solo mes",
        desde_hasta: `YYYY-MM-DD — rango libre, máximo ${MAX_DIAS_RANGO} días`,
        detalle: "1 — incluye la lista de pacientes (solo tableros de egresos; contiene datos personales)",
        refrescar: `1 — ignora la caché en memoria (${CACHE_TTL_MS / 60_000} min)`,
      },
      autenticacion: "Header `x-api-key: <llave>` (o `Authorization: Bearer <llave>`)",
      zonaHoraria: ZONA_HORARIA,
      ejemplos: [
        `${base}/medicina-interna?anio=2026`,
        `${base}/cirugia?mes=2026-08`,
        `${base}/convenios?desde=2026-01-01&hasta=2026-06-30&detalle=1`,
        `${base}/apoyo-riiss?anio=2026`,
      ],
    },
    { headers: SIN_CACHE },
  );
}
