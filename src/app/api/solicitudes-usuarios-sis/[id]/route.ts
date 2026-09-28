import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { type EstadoSolicitudSis } from "@/lib/solicitudesUsuarioSis";

const SOLICITUDES = "solicitudes_usuarios_sis";
const estadosValidos = new Set<EstadoSolicitudSis>(["pendiente", "en_proceso", "creado", "rechazado"]);
const cargosMedicos = new Set(["medico_interno", "medico_radiologo", "medico_licenciado"]);

async function getAdmin(req: NextRequest): Promise<{ uid: string; nombre: string } | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const data = (await adminDb.collection("usuarios").doc(decoded.uid).get()).data();
    if (data?.role !== "admin" && data?.role !== "asistente_esdomed") return null;
    return { uid: decoded.uid, nombre: String(data.nombre ?? "") };
  } catch {
    return null;
  }
}

// PATCH — registra el avance administrativo. La creación del usuario se hace
// fuera de ESDOMED, por eso aquí solo se anota el usuario SIS resultante.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin(req);
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Actualización inválida" }, { status: 400 });
  }

  const estado = String(body.estado ?? "") as EstadoSolicitudSis;
  const usuarioSis = String(body.usuarioSis ?? "").trim().slice(0, 80);
  const notaAdmin = String(body.notaAdmin ?? "").trim().slice(0, 500);
  const llavesSisEnviadas = body.llavesSisEnviadas === true;
  if (!estadosValidos.has(estado)) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });

  const { id } = await params;
  const ref = adminDb.collection(SOLICITUDES).doc(id);
  const solicitudActual = await ref.get();
  if (!solicitudActual.exists) return NextResponse.json({ error: "La solicitud ya no existe." }, { status: 404 });

  // La autoría se fija exclusivamente en la transición hacia “creado”. Así,
  // una nota o cambio posterior no puede adjudicarse la creación a otra persona.
  const datosActuales = solicitudActual.data();
  if (llavesSisEnviadas && !cargosMedicos.has(String(datosActuales?.cargo ?? ""))) {
    return NextResponse.json({ error: "El envío de llaves SIS solo aplica a solicitudes médicas." }, { status: 400 });
  }
  if (llavesSisEnviadas && estado !== "creado") {
    return NextResponse.json({ error: "Primero marca la solicitud como creada en SIS antes de confirmar el envío de llaves." }, { status: 400 });
  }
  const registrarCreadorSis =
    estado === "creado" &&
    datosActuales?.estado !== "creado" &&
    !datosActuales?.usuarioSisCreadoPorId;

  await ref.update({
    estado,
    usuarioSis: usuarioSis || null,
    notaAdmin: notaAdmin || null,
    estadoActualizadoPorId: admin.uid,
    estadoActualizadoPorNombre: admin.nombre,
    estadoActualizadoEn: FieldValue.serverTimestamp(),
    actualizadoEn: FieldValue.serverTimestamp(),
    ...(registrarCreadorSis
      ? {
          usuarioSisCreadoPorId: admin.uid,
          usuarioSisCreadoPorNombre: admin.nombre,
          usuarioSisCreadoEn: FieldValue.serverTimestamp(),
      }
      : {}),
    // Este segundo registro representa una productividad distinta a la
    // creación del usuario. Una vez guardado se conserva su responsable y
    // fecha, aunque después se actualice una nota de seguimiento.
    ...(llavesSisEnviadas && !datosActuales?.llavesSisEnviadasEn
      ? {
          llavesSisEnviadasPorId: admin.uid,
          llavesSisEnviadasPorNombre: admin.nombre,
          llavesSisEnviadasEn: FieldValue.serverTimestamp(),
        }
      : {}),
  });
  return NextResponse.json({ ok: true });
}
