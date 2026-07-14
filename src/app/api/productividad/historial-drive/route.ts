import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

async function getCallerRole(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const snap = await adminDb.collection("usuarios").doc(decoded.uid).get();
    return snap.data()?.role ?? null;
  } catch {
    return null;
  }
}

// Historial de carpetas creadas, actualizaciones y consentimientos informados: se
// lleva manualmente en Google Sheets (no en el sistema). Solo se usan fecha y
// responsable (columnas A y C); ningun otro dato de la hoja (nombre de paciente,
// expediente, observaciones) se lee ni se expone.
const SPREADSHEET_ID = "1kLr1YSeK5Xk9cGjrlcR2u4CKhgeRS4Z0LnhKp3GHsSk";

const GIDS: Record<string, string> = {
  carpetas: "44016251",
  actualizaciones: "0",
  consentimientos: "262490202",
};

interface RegistroDrive {
  nombre: string;
  fecha: string;
}

function csvUrl(gid: string) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
}

function parseFechaSheet(texto: string): Date | null {
  const match = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, d, m, y, h = "0", min = "0", s = "0"] = match;
  const fecha = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s));
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export async function GET(req: NextRequest) {
  if ((await getCallerRole(req)) !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const hoja = searchParams.get("hoja") ?? "";
  const mes = searchParams.get("mes") ?? "";

  const gid = GIDS[hoja];
  if (!gid) return NextResponse.json({ error: "Hoja invalida" }, { status: 400 });

  const [anioStr, mesStr] = mes.split("-");
  const anio = Number(anioStr);
  const mesNumero = Number(mesStr);
  if (!anio || !mesNumero) return NextResponse.json({ error: "Mes invalido" }, { status: 400 });

  const inicio = new Date(anio, mesNumero - 1, 1);
  const fin = new Date(anio, mesNumero, 0, 23, 59, 59, 999);

  try {
    const respuesta = await fetch(csvUrl(gid), { next: { revalidate: 900 } });
    if (!respuesta.ok) return NextResponse.json({ error: "No se pudo leer la hoja" }, { status: 502 });
    const texto = await respuesta.text();

    const libro = XLSX.read(texto, { type: "string", raw: true });
    const hojaDatos = libro.Sheets[libro.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json<(string | number)[]>(hojaDatos, { header: 1 });

    const registros: RegistroDrive[] = [];
    for (const fila of filas.slice(1)) {
      const fecha = parseFechaSheet(String(fila[0] ?? ""));
      const nombre = String(fila[2] ?? "").trim();
      if (!fecha || !nombre) continue;
      if (fecha < inicio || fecha > fin) continue;
      registros.push({ nombre, fecha: fecha.toISOString() });
    }

    return NextResponse.json({ registros });
  } catch {
    return NextResponse.json({ error: "No se pudo leer la hoja" }, { status: 502 });
  }
}
