import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

// Revisión de digitación SIMMOW que lleva Denys en Google Sheets (pestaña
// "Historico" de "BBDD REVISIÓN 2026"): cada fila es una observación a un egreso
// digitado, con quién lo digitó. Se usa como respaldo de la evaluación del
// desempeño (factor 1, calidad). Solo se devuelven usuario, mes y categoría:
// expediente, fechas del paciente, observación y comentarios NO salen del servidor.
// Temporal: más adelante Denys lo llevará en un módulo propio de Services.
const SPREADSHEET_ID = "1sz6flEQ-iRMGOiqTXD_w137v_-AKPC6FnVtsZzFEK8k";
const GID_HISTORICO = "1145695841";

async function esAdmin(req: NextRequest): Promise<boolean> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return false;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const snap = await adminDb.collection("usuarios").doc(decoded.uid).get();
    return snap.data()?.role === "admin";
  } catch {
    return false;
  }
}

export interface IncidenciaRevision {
  usuario: string;
  mes: string; // "2026-10"
  categoria: string;
}

export async function GET(req: NextRequest) {
  if (!(await esAdmin(req))) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde") ?? ""; // "2026-07"
  const hasta = searchParams.get("hasta") ?? ""; // "2026-12"
  if (!/^\d{4}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}$/.test(hasta)) {
    return NextResponse.json({ error: "Rango inválido" }, { status: 400 });
  }

  try {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${GID_HISTORICO}`, {
      next: { revalidate: 900 },
    });
    if (!res.ok) return NextResponse.json({ error: "No se pudo leer la hoja" }, { status: 502 });
    const libro = XLSX.read(await res.text(), { type: "string", raw: true });
    const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(libro.Sheets[libro.SheetNames[0]], { defval: "" });

    const incidencias: IncidenciaRevision[] = [];
    for (const f of filas) {
      const mes = String(f["Mes"] ?? "").trim();
      const usuario = String(f["usuario"] ?? "").trim();
      if (!/^\d{4}-\d{2}$/.test(mes) || !usuario || mes < desde || mes > hasta) continue;
      incidencias.push({ usuario, mes, categoria: String(f["Categoria"] ?? "").trim() || "Sin categoría" });
    }
    return NextResponse.json({ incidencias }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo leer la hoja" }, { status: 502 });
  }
}
