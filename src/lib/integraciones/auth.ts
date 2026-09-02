import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Autenticación máquina-a-máquina de las APIs de integración
// (`/api/integraciones/*`, consumidas por OTROS sistemas, no por la app).
//
// La llave se envía en el header `x-api-key` (o `Authorization: Bearer <llave>`)
// y debe coincidir con la variable de entorno INTEGRACIONES_API_KEY (Vercel y
// .env.local). Si la variable no está definida, la API responde 503 y queda
// deshabilitada: nunca se sirve nada sin llave configurada.
// ─────────────────────────────────────────────────────────────────────────────

export type ResultadoAuth = "ok" | "sin_configurar" | "invalida";

/** Cabeceras para que ni el CDN ni el cliente cacheen respuestas autenticadas. */
export const SIN_CACHE = { "Cache-Control": "private, no-store" } as const;

function llaveRecibida(req: NextRequest): string {
  const directa = req.headers.get("x-api-key");
  if (directa) return directa.trim();
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? m[1].trim() : "";
}

export function verificarApiKey(req: NextRequest): ResultadoAuth {
  const esperado = process.env.INTEGRACIONES_API_KEY;
  if (!esperado) return "sin_configurar";
  const a = Buffer.from(llaveRecibida(req));
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "invalida";
}

/** Respuesta de rechazo lista para devolver, o `null` si la petición está autorizada. */
export function rechazoAuth(req: NextRequest): NextResponse | null {
  const r = verificarApiKey(req);
  if (r === "ok") return null;
  if (r === "sin_configurar") {
    return NextResponse.json(
      { error: "Integración no configurada (falta INTEGRACIONES_API_KEY)" },
      { status: 503, headers: SIN_CACHE },
    );
  }
  return NextResponse.json({ error: "API key inválida" }, { status: 401, headers: SIN_CACHE });
}
