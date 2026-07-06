import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

// ─────────────────────────────────────────────────────────────────────────────
// API de integración: INGRESOS por fecha (para consumo de OTROS sistemas).
//
// Autenticación máquina-a-máquina: header `x-api-key` que debe coincidir con la
// variable de entorno INTEGRACIONES_API_KEY (configurarla en Vercel y .env.local;
// si no está definida, la API responde 503 y queda deshabilitada).
//
// Uso:
//   GET /api/integraciones/ingresos?mes=2026-07
//   GET /api/integraciones/ingresos?desde=2026-07-01&hasta=2026-07-15
//   GET /api/integraciones/ingresos?mes=2026-07&detalle=1   ← incluye pacientes (PII)
//
// Respuesta: totales del periodo + desglose por día, por servicio y por sexo.
// Cuenta INGRESOS (documentos de `pacientes` por fechaIngreso, sin importar el
// estado): un reingreso del mismo expediente cuenta dos veces, igual que el
// tabulador "Ingresados" del dashboard.
//
// Las fechas del rango se interpretan en hora de El Salvador (UTC-6, sin DST),
// que es la zona en la que la app registra los ingresos.
// ─────────────────────────────────────────────────────────────────────────────

const TZ_OFFSET = "-06:00"; // America/El_Salvador — fijo, no hay horario de verano
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MES_RE = /^\d{4}-\d{2}$/;

function autorizado(req: NextRequest): boolean | null {
  const esperado = process.env.INTEGRACIONES_API_KEY;
  if (!esperado) return null; // no configurada → API deshabilitada
  const recibido = req.headers.get("x-api-key") ?? "";
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Día local de El Salvador ("YYYY-MM-DD") de una fecha.
function diaSV(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
}

function ultimoDiaDelMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const auth = autorizado(req);
  if (auth === null) {
    return NextResponse.json({ error: "Integración no configurada (falta INTEGRACIONES_API_KEY)" }, { status: 503 });
  }
  if (!auth) {
    return NextResponse.json({ error: "API key inválida" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const mes = searchParams.get("mes");
  let desde = searchParams.get("desde");
  let hasta = searchParams.get("hasta");
  const incluirDetalle = searchParams.get("detalle") === "1";

  if (mes) {
    if (!MES_RE.test(mes)) {
      return NextResponse.json({ error: "Parámetro `mes` inválido — formato YYYY-MM" }, { status: 400 });
    }
    desde = `${mes}-01`;
    hasta = ultimoDiaDelMes(mes);
  }
  if (!desde || !hasta || !FECHA_RE.test(desde) || !FECHA_RE.test(hasta) || desde > hasta) {
    return NextResponse.json(
      { error: "Indica `mes=YYYY-MM` o un rango válido `desde=YYYY-MM-DD&hasta=YYYY-MM-DD`" },
      { status: 400 },
    );
  }

  const inicio = new Date(`${desde}T00:00:00.000${TZ_OFFSET}`);
  const fin = new Date(`${hasta}T23:59:59.999${TZ_OFFSET}`);

  const snap = await adminDb
    .collection("pacientes")
    .where("fechaIngreso", ">=", Timestamp.fromDate(inicio))
    .where("fechaIngreso", "<=", Timestamp.fromDate(fin))
    .orderBy("fechaIngreso", "asc")
    .get();

  const porDia = new Map<string, number>();
  const porServicio = new Map<string, { masculino: number; femenino: number; otro: number; total: number }>();
  const porSexo = { masculino: 0, femenino: 0, otro: 0 };
  const detalle: Record<string, unknown>[] = [];

  snap.forEach((doc) => {
    const p = doc.data();
    const fechaIngreso: Date = p.fechaIngreso.toDate();
    const dia = diaSV(fechaIngreso);
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);

    const sexo: "masculino" | "femenino" | "otro" =
      p.genero === "masculino" ? "masculino" : p.genero === "femenino" ? "femenino" : "otro";
    porSexo[sexo]++;

    const servicio = (p.servicioActual ?? "Sin servicio").trim() || "Sin servicio";
    if (!porServicio.has(servicio)) porServicio.set(servicio, { masculino: 0, femenino: 0, otro: 0, total: 0 });
    const fila = porServicio.get(servicio)!;
    fila[sexo]++;
    fila.total++;

    if (incluirDetalle) {
      detalle.push({
        expediente: p.expediente ?? null,
        paciente: `${p.nombres ?? ""} ${p.apellidos ?? ""}`.trim() || null,
        sexo,
        servicio,
        fechaIngreso: fechaIngreso.toISOString(),
        estado: p.estado ?? null,
        fechaEgreso: p.fechaEgreso ? p.fechaEgreso.toDate().toISOString() : null,
      });
    }
  });

  return NextResponse.json({
    rango: { desde, hasta, zonaHoraria: "America/El_Salvador" },
    total: snap.size,
    porSexo,
    porDia: [...porDia.entries()].sort().map(([fecha, total]) => ({ fecha, total })),
    porServicio: [...porServicio.entries()]
      .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
      .map(([servicio, filas]) => ({ servicio, ...filas })),
    ...(incluirDetalle ? { detalle } : {}),
    generadoEn: new Date().toISOString(),
  });
}
