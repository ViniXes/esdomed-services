import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const PENDIENTES = "registros_medicos_pendientes";

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

// GET — listar las solicitudes de autoregistro de médicos pendientes. Solo admin.
export async function GET(req: NextRequest) {
  if ((await getCallerRole(req)) !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const snap = await adminDb.collection(PENDIENTES).orderBy("creadoEn", "asc").get();
  const pendientes = snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      ...data,
      creadoEn: data.creadoEn?.toDate?.()?.toISOString() ?? null,
    };
  });
  return NextResponse.json(pendientes);
}
