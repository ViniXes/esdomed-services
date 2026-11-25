import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { COL_TS_GESTIONES } from "@/lib/consultaExterna/trabajoSocial";
import { MAX_ADJUNTOS, rutaAdjunto, seAbreEnNavegador, validarAdjunto } from "@/lib/consultaExterna/trabajoSocialAdjuntos";
import { adjuntosGuardados, bucketTS, fallo, leerGestion, ok, sesionTS } from "@/lib/consultaExterna/trabajoSocialServidor";

type Ctx = { params: Promise<{ id: string }> };
type Rechazo = { error: string; status: number };

// Adjuntos de una gestión (constancias, referencias, fotos de documentos).
// - POST  (multipart: archivo)  → lo guarda; cualquiera del equipo, en cualquier estado de la gestión
// - GET ?a=id                   → enlace firmado de 5 minutos para abrirlo; también la jefatura
// - DELETE ?a=id                → lo quita quien lo subió (o el admin)
//
// Los archivos van a una carpeta de Storage que ninguna regla abre: no se suben
// ni se leen desde el navegador. Por eso el archivo pasa por aquí, y por eso el
// tope es de 4 MB (Vercel corta las peticiones de más de 4.5 MB).

const refDe = (id: string) => adminDb.collection(COL_TS_GESTIONES).doc(id);
const idValido = (id: string) => !!id && !id.includes("/");

export async function POST(req: NextRequest, { params }: Ctx) {
  const sesion = await sesionTS(req, "registrar");
  if (sesion instanceof NextResponse) return sesion;
  const { id } = await params;
  if (!idValido(id)) return fallo("Gestión inválida.");

  let archivo: FormDataEntryValue | null;
  try {
    archivo = (await req.formData()).get("archivo");
  } catch {
    return fallo("No se recibió el archivo. Si pesa más de 4 MB, redúzcalo.");
  }
  if (!(archivo instanceof File)) return fallo("Seleccione un archivo.");
  const contenido = Buffer.from(await archivo.arrayBuffer());
  // Los primeros bytes dicen qué es de verdad: el tipo que declara el navegador no se usa.
  const v = validarAdjunto(archivo.name, contenido.length, contenido.subarray(0, 1024));
  if (!v.ok) return fallo(v.error);

  const ref = refDe(id);
  try {
    const previa = await ref.get();
    if (!previa.exists) return fallo("La gestión ya no existe.", 404);
    if (adjuntosGuardados(previa.data()).length >= MAX_ADJUNTOS) return fallo(`Una gestión admite hasta ${MAX_ADJUNTOS} adjuntos.`);

    const adjuntoId = adminDb.collection(COL_TS_GESTIONES).doc().id;
    const ruta = rutaAdjunto(id, adjuntoId, v.datos.nombre);
    const destino = bucketTS().file(ruta);
    await destino.save(contenido, { resumable: false, metadata: { contentType: v.datos.mime, cacheControl: "private, no-store" } });

    // El archivo ya está arriba: si la gestión no lo llega a anotar, se quita para no dejarlo suelto.
    let r: Rechazo | null;
    try {
      r = await adminDb.runTransaction(async (tx): Promise<Rechazo | null> => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { error: "La gestión ya no existe.", status: 404 };
        const actuales = Array.isArray(snap.data()!.adjuntos) ? snap.data()!.adjuntos : [];
        if (actuales.length >= MAX_ADJUNTOS) return { error: `Una gestión admite hasta ${MAX_ADJUNTOS} adjuntos.`, status: 400 };
        tx.update(ref, {
          adjuntos: [...actuales, {
            id: adjuntoId, nombre: v.datos.nombre, tipo: v.datos.mime, clase: v.datos.clase, tamano: contenido.length, ruta,
            subidoPor: sesion.uid, subidoPorNombre: sesion.nombre, subidoEn: Timestamp.now(),
          }],
          actualizadoPor: sesion.uid,
          actualizadoEn: FieldValue.serverTimestamp(),
        });
        return null;
      });
    } catch (e) {
      await destino.delete().catch(() => undefined);
      throw e;
    }
    if (r) {
      await destino.delete().catch(() => undefined);
      return fallo(r.error, r.status);
    }
    const snap = await ref.get();
    return ok({ gestion: leerGestion(snap.id, snap.data()!) });
  } catch (e) {
    console.error("Trabajo Social CE: no se pudo guardar el adjunto", e);
    return fallo("No se pudo subir el archivo. Intente de nuevo.", 500);
  }
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const sesion = await sesionTS(req, "consultar");
  if (sesion instanceof NextResponse) return sesion;
  const { id } = await params;
  const adjuntoId = new URL(req.url).searchParams.get("a") ?? "";
  if (!idValido(id) || !adjuntoId) return fallo("Consulta inválida.");
  try {
    const adjunto = adjuntosGuardados((await refDe(id).get()).data()).find((a) => a.id === adjuntoId);
    if (!adjunto?.ruta) return fallo("Ese adjunto ya no está.", 404);
    const nombreAscii = adjunto.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]|["\\]/g, "_");
    const [url] = await bucketTS().file(adjunto.ruta).getSignedUrl({
      action: "read",
      expires: Date.now() + 5 * 60 * 1000,
      // El tipo lo fija lo que se validó al subir; PDF e imágenes se ven en el navegador y lo demás se descarga.
      responseType: adjunto.tipo,
      responseDisposition: `${seAbreEnNavegador(adjunto.clase) ? "inline" : "attachment"}; filename="${nombreAscii}"; filename*=UTF-8''${encodeURIComponent(adjunto.nombre)}`,
    });
    return ok({ url });
  } catch (e) {
    console.error("Trabajo Social CE: no se pudo abrir el adjunto", e);
    return fallo("No se pudo abrir el archivo.", 500);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const sesion = await sesionTS(req, "registrar");
  if (sesion instanceof NextResponse) return sesion;
  const { id } = await params;
  const adjuntoId = new URL(req.url).searchParams.get("a") ?? "";
  if (!idValido(id) || !adjuntoId) return fallo("Consulta inválida.");
  const ref = refDe(id);
  try {
    let ruta = "";
    const r = await adminDb.runTransaction(async (tx): Promise<Rechazo | null> => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { error: "La gestión ya no existe.", status: 404 };
      const actuales: { id?: string; subidoPor?: string; ruta?: string }[] = Array.isArray(snap.data()!.adjuntos) ? snap.data()!.adjuntos : [];
      const adjunto = actuales.find((a) => a.id === adjuntoId);
      if (!adjunto) return { error: "Ese adjunto ya no está.", status: 404 };
      if (adjunto.subidoPor !== sesion.uid && !sesion.esAdmin) return { error: "Solo lo quita quien lo subió.", status: 403 };
      ruta = String(adjunto.ruta ?? "");
      tx.update(ref, {
        adjuntos: actuales.filter((a) => a.id !== adjuntoId),
        actualizadoPor: sesion.uid,
        actualizadoEn: FieldValue.serverTimestamp(),
      });
      return null;
    });
    if (r) return fallo(r.error, r.status);
    // La gestión ya no lo lista; si el archivo no se pudo borrar, queda inaccesible y anotado en el servidor.
    if (ruta) await bucketTS().file(ruta).delete().catch((e) => console.error("Trabajo Social CE: quedó un adjunto sin borrar", ruta, e));
    const snap = await ref.get();
    return ok({ gestion: leerGestion(snap.id, snap.data()!) });
  } catch (e) {
    console.error("Trabajo Social CE: no se pudo quitar el adjunto", e);
    return fallo("No se pudo quitar el archivo.", 500);
  }
}
