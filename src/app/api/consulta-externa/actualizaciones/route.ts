import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import {
  COLECCION_EXPEDIENTES_CE, ROLES_SUBEN_EXPEDIENTES_CE, normalizarExpediente,
} from "@/lib/consultaExterna/expedientesCreados";
import {
  COLECCION_ACTUALIZACIONES_CE, COLECCION_ACTUALIZACIONES_DIA_CE, TOPE_ACTUALIZACIONES_DIA,
  esFechaISO, hoySV, idActualizacion, idContadorDia, sanearTipos, unirPool, type PacientePool,
} from "@/lib/consultaExterna/actualizaciones";

// Registro de actualizaciones de datos que las digitadoras de Consulta Externa
// hacen en el SIS (documento de identificación, responsable). Services solo
// guarda que se hizo, para su productividad: no cambia datos del paciente.
//
// - GET ?fecha=YYYY-MM-DD → pacientes de ese día (citados en consulta_externa_citas
//   + expedientes creados ese día) y lo que yo registré hoy, con el tope.
// - GET ?expediente=X → busca el paciente en el padrón (o en sus citas).
// - POST { expediente, nombre, tipos } → registra hoy (tope de 100 por persona y día,
//   en una transacción; el mismo paciente el mismo día no cuenta dos veces).
// - DELETE ?expediente=X → deshace un registro de hoy.
//
// Las colecciones no tienen reglas: el navegador no las lee ni escribe.

async function autenticar(req: NextRequest): Promise<{ uid: string; nombre: string } | NextResponse> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  }
  const perfil = (await adminDb.collection("usuarios").doc(uid).get()).data();
  if (!perfil || perfil.activo === false || !ROLES_SUBEN_EXPEDIENTES_CE.includes(perfil.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  return { uid, nombre: String(perfil.nombre ?? "") };
}

const SIN_CACHE = { "Cache-Control": "private, no-store" };

function nombreDePersona(p: FirebaseFirestore.DocumentData): string {
  const ap = String(p.apellidos ?? "").trim();
  const no = String(p.nombres ?? "").trim();
  return ap && no ? `${ap}, ${no}` : ap || no;
}

async function misDeHoy(uid: string, hoy: string) {
  // Solo igualdad por fecha (índice simple) y se filtra por persona en memoria.
  const snap = await adminDb.collection(COLECCION_ACTUALIZACIONES_CE).where("fecha", "==", hoy).get();
  return snap.docs
    .map((d) => d.data())
    .filter((x) => x.hechoPor === uid)
    .map((x) => ({
      expediente: String(x.expediente ?? ""),
      pacienteNombre: String(x.pacienteNombre ?? ""),
      tipos: sanearTipos(x.tipos),
      hechoEn: x.hechoEn?.toMillis?.() ?? null,
    }))
    .sort((a, b) => (b.hechoEn ?? 0) - (a.hechoEn ?? 0));
}

export async function GET(req: NextRequest) {
  const quien = await autenticar(req).catch(() => NextResponse.json({ error: "No autorizado" }, { status: 401 }));
  if (quien instanceof NextResponse) return quien;
  const params = new URL(req.url).searchParams;
  const hoy = hoySV();

  try {
    const expedienteBuscado = normalizarExpediente(params.get("expediente") ?? "");
    if (expedienteBuscado) {
      if (expedienteBuscado.includes("/") || expedienteBuscado.length > 30) {
        return NextResponse.json({ error: "Expediente inválido." }, { status: 400 });
      }
      const persona = await adminDb.collection("personas").doc(expedienteBuscado).get();
      let nombre = persona.exists ? nombreDePersona(persona.data() ?? {}) : "";
      let origen = persona.exists ? "Padrón" : "";
      if (!nombre) {
        const cita = await adminDb.collection("consulta_externa_citas").where("expediente", "==", expedienteBuscado).limit(1).get();
        if (!cita.empty) { nombre = String(cita.docs[0].data().paciente ?? ""); origen = "Citas"; }
      }
      return NextResponse.json(
        { paciente: nombre ? { expediente: expedienteBuscado, nombre, origen } : null },
        { headers: SIN_CACHE },
      );
    }

    const fecha = params.get("fecha") ?? "";
    if (!esFechaISO(fecha)) return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });
    const [citasSnap, creadosSnap, mias, contador] = await Promise.all([
      adminDb.collection("consulta_externa_citas").where("fecha", "==", fecha).get(),
      adminDb.collection(COLECCION_EXPEDIENTES_CE).where("fechaCreacion", "==", fecha).get(),
      misDeHoy(quien.uid, hoy),
      adminDb.collection(COLECCION_ACTUALIZACIONES_DIA_CE).doc(idContadorDia(hoy, quien.uid)).get(),
    ]);
    const citados: PacientePool[] = citasSnap.docs
      .map((d) => d.data())
      .filter((x) => x.expediente)
      .map((x) => ({
        expediente: String(x.expediente),
        nombre: String(x.paciente ?? ""),
        origen: `Cita ${String(x.especialidad ?? "").trim()}`.trim(),
      }));
    const creados: PacientePool[] = creadosSnap.docs.map((d) => ({
      expediente: d.id,
      nombre: String(d.data().pacienteNombre ?? ""),
      origen: "Expediente creado",
    }));
    return NextResponse.json(
      {
        hoy,
        pacientes: unirPool(citados, creados),
        mias,
        usadas: Number(contador.data()?.total ?? 0),
        tope: TOPE_ACTUALIZACIONES_DIA,
      },
      { headers: SIN_CACHE },
    );
  } catch (error) {
    console.error("No se pudieron leer las actualizaciones de Consulta Externa", error);
    return NextResponse.json({ error: "No se pudo cargar la lista." }, { status: 500 });
  }
}

class TopeAlcanzado extends Error {}

export async function POST(req: NextRequest) {
  const quien = await autenticar(req).catch(() => NextResponse.json({ error: "No autorizado" }, { status: 401 }));
  if (quien instanceof NextResponse) return quien;
  let cuerpo: { expediente?: unknown; nombre?: unknown; tipos?: unknown };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const expediente = normalizarExpediente(cuerpo.expediente);
  const nombre = String(cuerpo.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const tipos = sanearTipos(cuerpo.tipos);
  if (!expediente || expediente.includes("/") || expediente.length > 30) {
    return NextResponse.json({ error: "Expediente inválido." }, { status: 400 });
  }
  if (tipos.length === 0) return NextResponse.json({ error: "Marca qué datos se actualizaron." }, { status: 400 });

  const hoy = hoySV();
  const refAct = adminDb.collection(COLECCION_ACTUALIZACIONES_CE).doc(idActualizacion(hoy, quien.uid, expediente));
  const refDia = adminDb.collection(COLECCION_ACTUALIZACIONES_DIA_CE).doc(idContadorDia(hoy, quien.uid));
  try {
    const resultado = await adminDb.runTransaction(async (tx) => {
      const [act, dia] = await Promise.all([tx.get(refAct), tx.get(refDia)]);
      const usadas = Number(dia.data()?.total ?? 0);
      if (act.exists) {
        // Mismo paciente, mismo día: se corrigen los tipos, no cuenta otra vez.
        tx.update(refAct, { tipos, pacienteNombre: nombre || act.data()?.pacienteNombre || "", editadoEn: FieldValue.serverTimestamp() });
        return { usadas, nueva: false };
      }
      if (usadas >= TOPE_ACTUALIZACIONES_DIA) throw new TopeAlcanzado();
      tx.create(refAct, {
        expediente,
        pacienteNombre: nombre,
        tipos,
        fecha: hoy,
        hechoPor: quien.uid,
        hechoPorNombre: quien.nombre,
        hechoEn: FieldValue.serverTimestamp(),
      });
      tx.set(refDia, { fecha: hoy, uid: quien.uid, total: usadas + 1, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
      return { usadas: usadas + 1, nueva: true };
    });
    return NextResponse.json({ ...resultado, tope: TOPE_ACTUALIZACIONES_DIA }, { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof TopeAlcanzado) {
      return NextResponse.json(
        { error: `Llegaste al máximo de ${TOPE_ACTUALIZACIONES_DIA} actualizaciones por día.` },
        { status: 429 },
      );
    }
    console.error("No se pudo registrar la actualización", error);
    return NextResponse.json({ error: "No se pudo registrar la actualización." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const quien = await autenticar(req).catch(() => NextResponse.json({ error: "No autorizado" }, { status: 401 }));
  if (quien instanceof NextResponse) return quien;
  const expediente = normalizarExpediente(new URL(req.url).searchParams.get("expediente") ?? "");
  if (!expediente || expediente.includes("/")) return NextResponse.json({ error: "Expediente inválido." }, { status: 400 });
  const hoy = hoySV();
  const refAct = adminDb.collection(COLECCION_ACTUALIZACIONES_CE).doc(idActualizacion(hoy, quien.uid, expediente));
  const refDia = adminDb.collection(COLECCION_ACTUALIZACIONES_DIA_CE).doc(idContadorDia(hoy, quien.uid));
  try {
    const usadas = await adminDb.runTransaction(async (tx) => {
      const [act, dia] = await Promise.all([tx.get(refAct), tx.get(refDia)]);
      const total = Number(dia.data()?.total ?? 0);
      if (!act.exists) return total;
      tx.delete(refAct);
      const nuevo = Math.max(0, total - 1);
      tx.set(refDia, { fecha: hoy, uid: quien.uid, total: nuevo, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
      return nuevo;
    });
    return NextResponse.json({ usadas, tope: TOPE_ACTUALIZACIONES_DIA }, { headers: SIN_CACHE });
  } catch (error) {
    console.error("No se pudo deshacer la actualización", error);
    return NextResponse.json({ error: "No se pudo deshacer." }, { status: 500 });
  }
}
