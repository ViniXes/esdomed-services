import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const SOLICITUDES = "solicitudes_usuarios_sis";

async function esAdministrador(req: NextRequest): Promise<boolean> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return false;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const perfil = await adminDb.collection("usuarios").doc(decoded.uid).get();
    return perfil.data()?.role === "admin";
  } catch {
    return false;
  }
}

function fechaIso(value: unknown) {
  return (value as { toDate?: () => Date } | undefined)?.toDate?.().toISOString() ?? null;
}

/**
 * Producción administrativa de usuarios SIS. Se sirve solo desde el servidor
 * para que el navegador nunca pueda consultar la bandeja completa por fuera
 * de los permisos administrativos.
 */
export async function GET(req: NextRequest) {
  if (!(await esAdministrador(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const mes = new URL(req.url).searchParams.get("mes") ?? "";
  const match = mes.match(/^(\d{4})-(\d{2})$/);
  if (!match) return NextResponse.json({ error: "Mes inválido" }, { status: 400 });

  const anio = Number(match[1]);
  const numeroMes = Number(match[2]);
  if (numeroMes < 1 || numeroMes > 12) return NextResponse.json({ error: "Mes inválido" }, { status: 400 });

  // Medianoche de El Salvador (UTC-6), para que el reporte mensual coincida
  // con el día laboral que ve el personal.
  const inicio = new Date(Date.UTC(anio, numeroMes - 1, 1, 6));
  const fin = new Date(Date.UTC(anio, numeroMes, 1, 5, 59, 59, 999));
  const [creacionesSnap, llavesSnap] = await Promise.all([
    adminDb
      .collection(SOLICITUDES)
      .where("usuarioSisCreadoEn", ">=", inicio)
      .where("usuarioSisCreadoEn", "<=", fin)
      .get(),
    adminDb
      .collection(SOLICITUDES)
      .where("llavesSisEnviadasEn", ">=", inicio)
      .where("llavesSisEnviadasEn", "<=", fin)
      .get(),
  ]);

  const registros = creacionesSnap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        solicitante: String(data.nombre ?? ""),
        usuarioSis: String(data.usuarioSis ?? ""),
        creadoPorId: String(data.usuarioSisCreadoPorId ?? ""),
        creadoPorNombre: String(data.usuarioSisCreadoPorNombre ?? ""),
        creadoEn: fechaIso(data.usuarioSisCreadoEn),
      };
    })
    .filter((registro) => registro.creadoPorId && registro.creadoPorNombre && registro.creadoEn)
    .sort((a, b) => String(b.creadoEn).localeCompare(String(a.creadoEn)));

  const llavesEnviadas = llavesSnap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        solicitante: String(data.nombre ?? ""),
        usuarioSis: String(data.usuarioSis ?? ""),
        enviadoPorId: String(data.llavesSisEnviadasPorId ?? ""),
        enviadoPorNombre: String(data.llavesSisEnviadasPorNombre ?? ""),
        enviadoEn: fechaIso(data.llavesSisEnviadasEn),
      };
    })
    .filter((registro) => registro.enviadoPorId && registro.enviadoPorNombre && registro.enviadoEn)
    .sort((a, b) => String(b.enviadoEn).localeCompare(String(a.enviadoEn)));

  return NextResponse.json({ registros, llavesEnviadas });
}
