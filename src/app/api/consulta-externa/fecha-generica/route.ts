import { NextRequest, NextResponse } from "next/server";
import { FieldPath } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { veFechaGenericaCE } from "@/lib/accesoConsultaExterna";
import { hoySV } from "@/lib/consultaExterna/actualizaciones";
import {
  COLECCION_FECHA_GENERICA, DOC_FECHA_GENERICA, armarListaFG, normalizarExpedienteFG, validarUnificacion,
  type CitaSinDui, type EntradaReporteFG, type MarcaFG,
} from "@/lib/consultaExterna/fechaGenerica";
import type { UserProfile } from "@/types";

// PROVISIONAL. Pacientes sin DUI en el SIS (la mayoría con fecha de nacimiento
// genérica 10/10/2000). Ver src/lib/consultaExterna/fechaGenerica.ts.
//
// - GET → la lista: pacientes de las citas cargadas sin DUI (consulta_externa_citas)
//   más los del reporte del SIS, con lo marcado en services. Los que ya aparecen
//   con DUI en el Catálogo de tarjetas salen como "con_dui".
// - POST { expediente, estado: "corregido" | "unificado" | "pendiente", unificadoCon? }
//   → marca lo hecho en el SIS. No cuenta como actualización para la
//   productividad (decisión del usuario).
//
// Sin reglas: el navegador no lee ni escribe la colección. El reporte del SIS se
// carga con scripts/cargar-fecha-generica.mjs.

const SIN_CACHE = { "Cache-Control": "private, no-store" };
const COL_CITAS = "consulta_externa_citas";
const COL_TARJETAS = "consulta_externa_tarjetas";

async function autenticar(req: NextRequest): Promise<{ uid: string; nombre: string } | NextResponse> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  }
  const perfil = (await adminDb.collection("usuarios").doc(uid).get()).data() as UserProfile | undefined;
  if (!perfil || perfil.activo === false || !veFechaGenericaCE(perfil)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  return { uid, nombre: String(perfil.nombre ?? "") };
}

const refLista = () => adminDb.collection(COLECCION_FECHA_GENERICA).doc(DOC_FECHA_GENERICA);

export async function GET(req: NextRequest) {
  const quien = await autenticar(req).catch(() => NextResponse.json({ error: "No autorizado" }, { status: 401 }));
  if (quien instanceof NextResponse) return quien;
  try {
    const [lista, sinDui, tarjetas] = await Promise.all([
      refLista().get(),
      // Solo las citas sin DUI: pocas, y la consulta es de un solo campo (sin índice compuesto).
      adminDb.collection(COL_CITAS).where("dui", "==", "")
        .select("expediente", "paciente", "fecha", "especialidad", "especialidadId", "medico", "estado").get(),
      adminDb.collection(COL_TARJETAS).get(),
    ]);
    const citasSinDui: CitaSinDui[] = sinDui.docs.map((d) => {
      const x = d.data();
      return {
        expediente: String(x.expediente ?? ""),
        paciente: String(x.paciente ?? ""),
        fecha: String(x.fecha ?? ""),
        especialidad: String(x.especialidad ?? ""),
        especialidadId: String(x.especialidadId ?? ""),
        medico: String(x.medico ?? ""),
        estado: String(x.estado ?? ""),
      };
    });
    const conDui = new Set<string>();
    for (const t of tarjetas.docs) for (const exp of Object.keys(t.data().pacientes ?? {})) conDui.add(exp);
    const datos = lista.data() ?? {};
    const pacientes = armarListaFG({
      citasSinDui,
      conDui,
      reporte: (datos.reporte ?? {}) as Record<string, EntradaReporteFG>,
      marcas: (datos.marcas ?? {}) as Record<string, MarcaFG>,
    });
    return NextResponse.json(
      { hoy: hoySV(), pacientes, reporteCargadoEn: datos.reporteCargadoEn?.toMillis?.() ?? null, fuenteReporte: String(datos.fuenteReporte ?? "") },
      { headers: SIN_CACHE },
    );
  } catch (error) {
    console.error("No se pudo leer la lista de fecha genérica", error);
    return NextResponse.json({ error: "No se pudo cargar la lista." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const quien = await autenticar(req).catch(() => NextResponse.json({ error: "No autorizado" }, { status: 401 }));
  if (quien instanceof NextResponse) return quien;
  let cuerpo: { expediente?: unknown; estado?: unknown; unificadoCon?: unknown };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const expediente = normalizarExpedienteFG(cuerpo.expediente);
  const estado = String(cuerpo.estado ?? "") as MarcaFG["estado"];
  if (!/^\d{1,7}-\d{2}$/.test(expediente)) return NextResponse.json({ error: "Expediente inválido." }, { status: 400 });
  if (!["corregido", "unificado", "pendiente"].includes(estado)) return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  const marca: MarcaFG = { estado };
  if (estado === "unificado") {
    const problema = validarUnificacion(expediente, String(cuerpo.unificadoCon ?? ""));
    if (problema) return NextResponse.json({ error: problema }, { status: 400 });
    marca.unificadoCon = normalizarExpedienteFG(cuerpo.unificadoCon);
  }
  if (estado !== "pendiente") marca.resuelto = { porNombre: quien.nombre, por: quien.uid, en: Date.now(), origen: "services" };

  try {
    // Solo pacientes de la lista: con una cita sin DUI o en el reporte del SIS.
    const [lista, citas] = await Promise.all([
      refLista().get(),
      adminDb.collection(COL_CITAS).where("expediente", "==", expediente).select("dui").get(),
    ]);
    const enReporte = !!lista.data()?.reporte?.[expediente];
    if (!enReporte && !citas.docs.some((d) => !d.data().dui)) {
      return NextResponse.json({ error: "Ese expediente no está en la lista." }, { status: 404 });
    }
    // Solo se escribe la marca de este paciente: otra persona puede estar marcando otro.
    if (lista.exists) await refLista().update(new FieldPath("marcas", expediente), marca);
    else await refLista().set({ marcas: { [expediente]: marca } }, { merge: true });
    return NextResponse.json({ expediente, marca }, { headers: SIN_CACHE });
  } catch (error) {
    console.error("No se pudo marcar el paciente de fecha genérica", error);
    return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  }
}
