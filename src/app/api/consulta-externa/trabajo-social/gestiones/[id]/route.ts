import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { hoySV } from "@/lib/consultaExterna/actualizaciones";
import { COL_TS_GESTIONES, COL_TS_NOTAS, esAutomatica, validarGestion, validarMotivo } from "@/lib/consultaExterna/trabajoSocial";
import {
  borrarAdjuntosDe, cambioIndice, cuerpo, fallo, leerGestion, leerNota, ok, olvidarPacientes, sesionTS, traer,
} from "@/lib/consultaExterna/trabajoSocialServidor";

type Ctx = { params: Promise<{ id: string }> };
type Rechazo = { error: string; status: number };

// - GET → la gestión con sus notas (pantalla de seguimiento)
// - PATCH { accion: "finalizar" | "no_procede" (con motivo) | "reabrir" } → cualquiera del equipo
// - PATCH { accion: "corregir", gestion }                                 → quien la registró (o admin)
// - DELETE → quien la registró, el mismo día y si nadie más le puso notas; el admin, siempre
export async function GET(req: NextRequest, { params }: Ctx) {
  const sesion = await sesionTS(req, "consultar");
  if (sesion instanceof NextResponse) return sesion;
  const { id } = await params;
  try {
    const [snap, notas] = await Promise.all([
      adminDb.collection(COL_TS_GESTIONES).doc(id).get(),
      traer(adminDb.collection(COL_TS_NOTAS).where("gestionId", "==", id), leerNota),
    ]);
    if (!snap.exists) return fallo("La gestión ya no existe.", 404);
    return ok({ hoy: hoySV(), gestion: leerGestion(snap.id, snap.data()!), notas });
  } catch (e) {
    console.error("Trabajo Social CE: no se pudo leer la gestión", e);
    return fallo("No se pudo leer la gestión.", 500);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const sesion = await sesionTS(req, "registrar");
  if (sesion instanceof NextResponse) return sesion;
  const { id } = await params;
  const datos = await cuerpo(req);
  const accion = String(datos.accion ?? "");
  const ref = adminDb.collection(COL_TS_GESTIONES).doc(id);

  const motivo = accion === "no_procede" ? validarMotivo(datos.motivo) : null;
  if (motivo && !motivo.ok) return fallo(motivo.error);
  const corregida = accion === "corregir" ? validarGestion(datos.gestion) : null;
  if (corregida && !corregida.ok) return fallo(corregida.error);

  try {
    const r = await adminDb.runTransaction(async (tx): Promise<Rechazo | null> => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { error: "La gestión ya no existe.", status: 404 };
      const g = leerGestion(snap.id, snap.data()!);
      const firma = { actualizadoPor: sesion.uid, actualizadoEn: FieldValue.serverTimestamp() };
      const paso = (hecho: string, extra: object = {}) =>
        FieldValue.arrayUnion({ accion: hecho, en: Timestamp.now(), por: sesion.uid, porNombre: sesion.nombre, ...extra });

      if (accion === "finalizar" || accion === "no_procede") {
        if (g.estado !== "en_proceso") return { error: "Esta gestión ya estaba cerrada. Actualice la lista.", status: 409 };
        const estado = accion === "finalizar" ? "finalizada" : "no_procede";
        const texto = motivo?.ok ? motivo.datos : "";
        tx.update(ref, {
          estado, motivoNoProcede: texto, fechaCierre: hoySV(), historial: paso(estado, texto ? { motivo: texto } : {}), ...firma,
        });
      } else if (accion === "reabrir") {
        if (g.estado === "en_proceso") return { error: "Esta gestión ya está en proceso.", status: 409 };
        tx.update(ref, { estado: "en_proceso", motivoNoProcede: "", fechaCierre: "", historial: paso("reabierta"), ...firma });
      } else if (accion === "corregir" && corregida?.ok) {
        if (g.creadoPor !== sesion.uid && !sesion.esAdmin) return { error: "Solo la corrige quien la registró.", status: 403 };
        if (esAutomatica(g.tipo)) return { error: "Esta gestión la registró el Directorio: lo que se corrige es la ficha del paciente.", status: 400 };
        tx.update(ref, { ...corregida.datos, ...firma });
      } else {
        return { error: "Acción inválida.", status: 400 };
      }
      return null;
    });
    if (r) return fallo(r.error, r.status);
    const snap = await ref.get();
    return ok({ gestion: leerGestion(snap.id, snap.data()!) });
  } catch (e) {
    console.error("Trabajo Social CE: no se pudo actualizar la gestión", e);
    return fallo("No se pudo guardar el cambio.", 500);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const sesion = await sesionTS(req, "registrar");
  if (sesion instanceof NextResponse) return sesion;
  const { id } = await params;
  const ref = adminDb.collection(COL_TS_GESTIONES).doc(id);
  try {
    const r = await adminDb.runTransaction(async (tx): Promise<Rechazo | null> => {
      const [snap, suyas] = await Promise.all([tx.get(ref), tx.get(adminDb.collection(COL_TS_NOTAS).where("gestionId", "==", id))]);
      if (!snap.exists) return { error: "La gestión ya no existe.", status: 404 };
      const g = leerGestion(snap.id, snap.data()!);
      if (!sesion.esAdmin) {
        if (g.creadoPor !== sesion.uid) return { error: "Solo la borra quien la registró.", status: 403 };
        if (hoySV(new Date(g.creadoEnMs)) !== hoySV()) {
          return { error: "Solo se borra el mismo día. Si no corresponde, ciérrela como «No procede» con su motivo.", status: 403 };
        }
        if (suyas.docs.some((n) => n.data().autor !== sesion.uid)) return { error: "Otra persona ya le puso notas: no se puede borrar.", status: 403 };
      }
      suyas.docs.forEach((n) => tx.delete(n.ref));
      tx.delete(ref);
      const indice = cambioIndice(g.clave, -1);
      tx.set(indice.ref, indice.datos, { merge: true });
      return null;
    });
    if (r) return fallo(r.error, r.status);
    olvidarPacientes();
    // La gestión ya no existe: si sus archivos no se pudieron quitar, que quede en el registro del servidor.
    await borrarAdjuntosDe(id).catch((e) => console.error("Trabajo Social CE: quedaron adjuntos sin borrar de la gestión", id, e));
    return ok({ ok: true });
  } catch (e) {
    console.error("Trabajo Social CE: no se pudo borrar la gestión", e);
    return fallo("No se pudo borrar.", 500);
  }
}
