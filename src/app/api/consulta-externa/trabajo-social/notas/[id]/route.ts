import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { hoySV } from "@/lib/consultaExterna/actualizaciones";
import { COL_TS_GESTIONES, COL_TS_NOTAS, validarNota } from "@/lib/consultaExterna/trabajoSocial";
import { cuerpo, fallo, leerGestion, leerNota, ok, sesionTS } from "@/lib/consultaExterna/trabajoSocialServidor";

type Ctx = { params: Promise<{ id: string }> };
type Rechazo = { error: string; status: number };

// Una nota solo la corrige o la borra quien la escribió (o el admin). Con
// `nota` null, se borra.
async function cambiar(id: string, sesion: { uid: string; esAdmin: boolean }, nota: unknown | null): Promise<Rechazo | null> {
  const ref = adminDb.collection(COL_TS_NOTAS).doc(id);
  return adminDb.runTransaction(async (tx): Promise<Rechazo | null> => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { error: "La nota ya no existe.", status: 404 };
    const previa = leerNota(snap.id, snap.data()!);
    if (previa.autor !== sesion.uid && !sesion.esAdmin) return { error: "Solo la cambia quien la escribió.", status: 403 };
    const refG = adminDb.collection(COL_TS_GESTIONES).doc(previa.gestionId);
    const [snapG, hermanas] = await Promise.all([
      tx.get(refG),
      tx.get(adminDb.collection(COL_TS_NOTAS).where("gestionId", "==", previa.gestionId)),
    ]);
    const g = snapG.exists ? leerGestion(snapG.id, snapG.data()!) : null;
    const otras = hermanas.docs.filter((d) => d.id !== id).map((d) => String(d.data().fecha ?? ""));

    let fecha = "";
    if (nota === null) {
      if (g && !otras.length) return { error: "Es la única nota de la gestión: corríjala o borre la gestión.", status: 400 };
      tx.delete(ref);
    } else {
      const n = validarNota(nota, g?.tipo ?? "", hoySV());
      if (!n.ok) return { error: n.error, status: 400 };
      if (g && n.datos.fecha < g.fecha) return { error: "La nota no puede ser anterior a la gestión.", status: 400 };
      fecha = n.datos.fecha;
      tx.update(ref, { ...n.datos, editadoEn: FieldValue.serverTimestamp() });
    }
    if (g) {
      tx.update(refG, {
        totalNotas: otras.length + (nota === null ? 0 : 1),
        ultimaNotaFecha: [...otras, fecha].filter(Boolean).sort().pop() ?? g.fecha,
      });
    }
    return null;
  });
}

async function responder(req: NextRequest, { params }: Ctx, borrar: boolean) {
  const sesion = await sesionTS(req, "registrar");
  if (sesion instanceof NextResponse) return sesion;
  const { id } = await params;
  const nota = borrar ? null : ((await cuerpo(req)).nota ?? {});
  try {
    const r = await cambiar(id, sesion, nota);
    if (r) return fallo(r.error, r.status);
    if (borrar) return ok({ ok: true });
    const snap = await adminDb.collection(COL_TS_NOTAS).doc(id).get();
    return ok({ nota: leerNota(snap.id, snap.data()!) });
  } catch (e) {
    console.error("Trabajo Social CE: no se pudo cambiar la nota", e);
    return fallo("No se pudo guardar el cambio.", 500);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return responder(req, ctx, false);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return responder(req, ctx, true);
}
