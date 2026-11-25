import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { hoySV } from "@/lib/consultaExterna/actualizaciones";
import { COL_TS_GESTIONES, COL_TS_NOTAS, validarNota } from "@/lib/consultaExterna/trabajoSocial";
import { cuerpo, fallo, leerGestion, leerNota, ok, sesionTS, traer } from "@/lib/consultaExterna/trabajoSocialServidor";

type Rechazo = { error: string; status: number };

// - GET ?gestion=id → notas de una gestión
// - POST { gestionId, nota, finalizar? } → nota nueva, de cualquiera del equipo (la firma quien la
//   escribe). Con `finalizar`, la misma transacción cierra la gestión: la última nota suele ser el cierre.
export async function GET(req: NextRequest) {
  const sesion = await sesionTS(req, "consultar");
  if (sesion instanceof NextResponse) return sesion;
  const id = new URL(req.url).searchParams.get("gestion") ?? "";
  if (!id) return fallo("Consulta inválida.");
  try {
    return ok({ notas: await traer(adminDb.collection(COL_TS_NOTAS).where("gestionId", "==", id), leerNota) });
  } catch (e) {
    console.error("Trabajo Social CE: no se pudieron leer las notas", e);
    return fallo("No se pudieron leer las notas.", 500);
  }
}

export async function POST(req: NextRequest) {
  const sesion = await sesionTS(req, "registrar");
  if (sesion instanceof NextResponse) return sesion;
  const datos = await cuerpo(req);
  const gestionId = String(datos.gestionId ?? "");
  if (!gestionId || gestionId.includes("/")) return fallo("Gestión inválida.");
  const finalizar = datos.finalizar === true;
  const refG = adminDb.collection(COL_TS_GESTIONES).doc(gestionId);
  const refN = adminDb.collection(COL_TS_NOTAS).doc();
  try {
    const r = await adminDb.runTransaction(async (tx): Promise<Rechazo | null> => {
      const snap = await tx.get(refG);
      if (!snap.exists) return { error: "La gestión ya no existe.", status: 404 };
      const g = leerGestion(snap.id, snap.data()!);
      if (g.estado !== "en_proceso") return { error: "La gestión está cerrada. Reábrala para agregar notas.", status: 409 };
      const n = validarNota(datos.nota, g.tipo, hoySV());
      if (!n.ok) return { error: n.error, status: 400 };
      if (n.datos.fecha < g.fecha) return { error: "La nota no puede ser anterior a la gestión.", status: 400 };
      tx.create(refN, {
        ...n.datos, gestionId, clave: g.clave, autor: sesion.uid, autorNombre: sesion.nombre, creadoEn: FieldValue.serverTimestamp(),
      });
      const ultimaNotaFecha = n.datos.fecha > g.ultimaNotaFecha ? n.datos.fecha : g.ultimaNotaFecha;
      tx.update(refG, {
        totalNotas: FieldValue.increment(1),
        ultimaNotaFecha,
        // Se cierra con la fecha de su última nota, como al registrarla ya finalizada.
        ...(finalizar ? {
          estado: "finalizada",
          motivoNoProcede: "",
          fechaCierre: ultimaNotaFecha,
          historial: FieldValue.arrayUnion({ accion: "finalizada", en: Timestamp.now(), por: sesion.uid, porNombre: sesion.nombre }),
          actualizadoPor: sesion.uid,
          actualizadoEn: FieldValue.serverTimestamp(),
        } : {}),
      });
      return null;
    });
    if (r) return fallo(r.error, r.status);
    const [snap, snapG] = await Promise.all([refN.get(), refG.get()]);
    return ok({ nota: leerNota(snap.id, snap.data()!), gestion: leerGestion(snapG.id, snapG.data()!) });
  } catch (e) {
    console.error("Trabajo Social CE: no se pudo guardar la nota", e);
    return fallo("No se pudo guardar la nota. Lo escrito sigue en la pantalla.", 500);
  }
}
