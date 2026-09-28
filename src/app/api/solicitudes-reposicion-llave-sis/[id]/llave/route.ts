import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, adminStorage } from "@/lib/firebase-admin";

const SOLICITUDES = "solicitudes_reposicion_llave_sis";
const TAMANO_MAXIMO = 5 * 1024 * 1024;

type Admin = { uid: string; nombre: string };

async function administrador(req: NextRequest): Promise<Admin | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const perfil = (await adminDb.collection("usuarios").doc(decoded.uid).get()).data();
    return perfil?.role === "admin" ? { uid: decoded.uid, nombre: String(perfil.nombre ?? "") } : null;
  } catch { return null; }
}

function nombreSeguro(nombre: string) {
  const limpio = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
  return (limpio || "llave-sis").slice(0, 120);
}

function bucketPrivado() {
  const bucket = process.env.FIREBASE_STORAGE_BUCKET ?? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucket) throw new Error("Storage no está configurado.");
  return adminStorage.bucket(bucket);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await administrador(req);
  if (!admin) return NextResponse.json({ error: "Solo administración puede respaldar una llave." }, { status: 403 });
  const form = await req.formData();
  const archivo = form.get("archivo");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "Selecciona el archivo de la llave SIS." }, { status: 400 });
  if (archivo.size === 0 || archivo.size > TAMANO_MAXIMO) return NextResponse.json({ error: "El archivo debe pesar menos de 5 MB." }, { status: 400 });

  const { id } = await params;
  const ref = adminDb.collection(SOLICITUDES).doc(id);
  const actual = await ref.get();
  if (!actual.exists) return NextResponse.json({ error: "La solicitud ya no existe." }, { status: 404 });
  const datos = actual.data();
  if (!["llave_generada", "entregada"].includes(String(datos?.estado ?? ""))) {
    return NextResponse.json({ error: "Marca primero la llave como generada para adjuntar su respaldo." }, { status: 400 });
  }

  const ruta = `llaves_sis/reposiciones/${id}/${Date.now()}_${nombreSeguro(archivo.name)}`;
  const destino = bucketPrivado().file(ruta);
  await destino.save(Buffer.from(await archivo.arrayBuffer()), {
    resumable: false,
    metadata: { contentType: archivo.type || "application/octet-stream", cacheControl: "private, no-store" },
  });
  const rutaAnterior = String(datos?.llaveSisArchivoStoragePath ?? "");
  try {
    await ref.update({
      llaveSisArchivoNombre: archivo.name.slice(0, 180),
      llaveSisArchivoTamano: archivo.size,
      llaveSisArchivoTipo: archivo.type || "application/octet-stream",
      llaveSisArchivoStoragePath: ruta,
      llaveSisArchivoSubidoPorId: admin.uid,
      llaveSisArchivoSubidoPorNombre: admin.nombre,
      llaveSisArchivoSubidoEn: FieldValue.serverTimestamp(),
      actualizadoEn: FieldValue.serverTimestamp(),
    });
    await ref.collection("llave_sis_auditoria").add({ accion: rutaAnterior ? "reemplazo" : "subida", realizadoPorId: admin.uid, realizadoPorNombre: admin.nombre, realizadoEn: FieldValue.serverTimestamp() });
  } catch (error) {
    await destino.delete().catch(() => undefined);
    throw error;
  }
  if (rutaAnterior && rutaAnterior !== ruta) await bucketPrivado().file(rutaAnterior).delete().catch(() => undefined);
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await administrador(req);
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { id } = await params;
  const ref = adminDb.collection(SOLICITUDES).doc(id);
  const actual = await ref.get();
  const datos = actual.data();
  const ruta = String(datos?.llaveSisArchivoStoragePath ?? "");
  if (!actual.exists || !ruta) return NextResponse.json({ error: "No hay una llave respaldada para esta reposición." }, { status: 404 });
  const [contenido] = await bucketPrivado().file(ruta).download();
  await ref.collection("llave_sis_auditoria").add({ accion: "descarga", realizadoPorId: admin.uid, realizadoPorNombre: admin.nombre, realizadoEn: FieldValue.serverTimestamp() });
  return new NextResponse(new Uint8Array(contenido), {
    headers: {
      "Content-Type": String(datos?.llaveSisArchivoTipo ?? "application/octet-stream"),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(String(datos?.llaveSisArchivoNombre ?? "llave-sis"))}`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await administrador(req);
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { id } = await params;
  const ref = adminDb.collection(SOLICITUDES).doc(id);
  const actual = await ref.get();
  const datos = actual.data();
  const ruta = String(datos?.llaveSisArchivoStoragePath ?? "");
  if (!actual.exists || !ruta) return NextResponse.json({ error: "No hay una llave respaldada para eliminar." }, { status: 404 });
  await bucketPrivado().file(ruta).delete();
  await ref.update({
    llaveSisArchivoNombre: FieldValue.delete(), llaveSisArchivoTamano: FieldValue.delete(), llaveSisArchivoTipo: FieldValue.delete(), llaveSisArchivoStoragePath: FieldValue.delete(), llaveSisArchivoSubidoPorId: FieldValue.delete(), llaveSisArchivoSubidoPorNombre: FieldValue.delete(), llaveSisArchivoSubidoEn: FieldValue.delete(), actualizadoEn: FieldValue.serverTimestamp(),
  });
  await ref.collection("llave_sis_auditoria").add({ accion: "eliminacion", realizadoPorId: admin.uid, realizadoPorNombre: admin.nombre, realizadoEn: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true });
}
