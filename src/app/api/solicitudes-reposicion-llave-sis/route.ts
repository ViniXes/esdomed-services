import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const SOLICITUDES = "solicitudes_reposicion_llave_sis";

type Sesion = { uid: string; role: string; nombre: string; jvpm: string; servicios: string[] };

async function sesion(req: NextRequest): Promise<Sesion | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const perfil = (await adminDb.collection("usuarios").doc(decoded.uid).get()).data();
    if (!perfil) return null;
    const servicios = Array.isArray(perfil.servicios)
      ? perfil.servicios.map((item: unknown) => String(item).trim()).filter(Boolean)
      : perfil.servicio ? [String(perfil.servicio).trim()] : [];
    return { uid: decoded.uid, role: String(perfil.role ?? ""), nombre: String(perfil.nombre ?? ""), jvpm: String(perfil.jvpm ?? ""), servicios };
  } catch { return null; }
}

function fechaIso(value: unknown) {
  return (value as { toDate?: () => Date } | undefined)?.toDate?.().toISOString() ?? null;
}

// Una reposición se solicita desde el propio portal médico. No se solicita ni
// registra contraseña: esta se ingresa directamente en Firma Digital.
export async function POST(req: NextRequest) {
  const actor = await sesion(req);
  if (!actor || actor.role !== "medico") return NextResponse.json({ error: "Solo los médicos pueden solicitar una reposición de llave." }, { status: 403 });

  const abiertas = await adminDb.collection(SOLICITUDES).where("medicoId", "==", actor.uid).limit(20).get();
  if (abiertas.docs.some((doc) => ["pendiente", "en_proceso", "llave_generada"].includes(String(doc.data().estado)))) {
    return NextResponse.json({ error: "Ya tienes una reposición de llave SIS en trámite." }, { status: 409 });
  }

  await adminDb.collection(SOLICITUDES).add({
    medicoId: actor.uid,
    medicoNombre: actor.nombre,
    medicoJvpm: actor.jvpm || null,
    medicoServicios: actor.servicios,
    tipo: "reposicion",
    estado: "pendiente",
    creadoEn: FieldValue.serverTimestamp(),
    actualizadoEn: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ ok: true });
}

// El médico solamente consulta sus propios pedidos y no recibe notas internas
// ni datos del archivo. Administración ve toda la bandeja.
export async function GET(req: NextRequest) {
  const actor = await sesion(req);
  if (!actor || (actor.role !== "medico" && actor.role !== "admin")) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const resumen = new URL(req.url).searchParams.get("resumen") === "pendientes";
  const snap = actor.role === "admin"
    ? await adminDb.collection(SOLICITUDES).orderBy("creadoEn", "desc").limit(300).get()
    : await adminDb.collection(SOLICITUDES).where("medicoId", "==", actor.uid).limit(100).get();

  if (resumen && actor.role === "admin") {
    const pendientes = snap.docs.filter((doc) => String(doc.data().estado ?? "") === "pendiente");
    return NextResponse.json({
      pendientes: pendientes.length,
      solicitudes: pendientes.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          nombre: String(data.medicoNombre ?? ""),
          servicio: Array.isArray(data.medicoServicios) ? data.medicoServicios.map((item: unknown) => String(item)).join(" / ") : "",
          tipo: "reposicion_llave",
        };
      }),
    });
  }

  const solicitudes = snap.docs.map((doc) => {
    const data = doc.data();
    if (actor.role === "medico") {
      return { id: doc.id, tipo: "reposicion", estado: String(data.estado ?? "pendiente"), creadoEn: fechaIso(data.creadoEn), actualizadoEn: fechaIso(data.actualizadoEn) };
    }
    const {
      llaveSisArchivoStoragePath: _ruta,
      llaveSisArchivoTipo: _tipo,
      ...datos
    } = data;
    return {
      id: doc.id,
      ...datos,
      llaveSisArchivoNombre: _ruta ? String(datos.llaveSisArchivoNombre ?? "") || null : null,
      llaveSisArchivoTamano: _ruta ? Number(datos.llaveSisArchivoTamano ?? 0) || null : null,
      llaveSisArchivoSubidoEn: fechaIso(datos.llaveSisArchivoSubidoEn),
      creadoEn: fechaIso(data.creadoEn),
      actualizadoEn: fechaIso(data.actualizadoEn),
      llaveGeneradaEn: fechaIso(data.llaveGeneradaEn),
      llaveSisEntregadaEn: fechaIso(data.llaveSisEntregadaEn),
    };
  }).sort((a, b) => String(b.creadoEn ?? "").localeCompare(String(a.creadoEn ?? "")));

  return NextResponse.json(solicitudes);
}
