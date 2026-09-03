import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { duiValido, normalizarDui } from "@/lib/dui";
import {
  CARGOS_USUARIO_SIS,
  ESPECIALIDADES_SIS,
  type CargoUsuarioSis,
} from "@/lib/solicitudesUsuarioSis";

const SOLICITUDES = "solicitudes_usuarios_sis";

const cargosValidos = new Set<string>(CARGOS_USUARIO_SIS.map((cargo) => cargo.value));
const especialidadesValidas = new Set<string>(ESPECIALIDADES_SIS);

function texto(value: unknown, max = 180) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function fechaIso(value: unknown) {
  return (value as { toDate?: () => Date } | undefined)?.toDate?.().toISOString() ?? null;
}

async function esAdmin(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return false;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return (await adminDb.collection("usuarios").doc(decoded.uid).get()).data()?.role === "admin";
  } catch {
    return false;
  }
}

// POST público: una solicitud SIS no crea un usuario en ESDOMED ni da acceso a
// información clínica. La cuenta se crea de forma externa en SIS y un admin la
// marca como completada desde la bandeja privada.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const nombre = texto(body.nombre, 120).toUpperCase();
  const dui = normalizarDui(body.dui);
  const correo = texto(body.correo, 120).toLowerCase();
  const telefono = String(body.telefono ?? "").replace(/\D/g, "").slice(0, 8);
  const cargo = texto(body.cargo, 40) as CargoUsuarioSis;
  const otroCargo = texto(body.otroCargo, 120);
  const numeroJunta = texto(body.numeroJunta, 50).toUpperCase();
  const especialidad = texto(body.especialidad, 100);
  const otraEspecialidad = texto(body.otraEspecialidad, 160);
  const esResidente = body.esResidente === "si" ? "si" : body.esResidente === "no" ? "no" : "";
  const yaTuvoUsuario = body.yaTuvoUsuario === "si" ? "si" : body.yaTuvoUsuario === "no" ? "no" : "";
  const servicio = texto(body.servicio, 160);
  const autorizadoPor = texto(body.autorizadoPor, 120).toUpperCase();

  if (nombre.length < 5) return NextResponse.json({ error: "Escribe el nombre completo." }, { status: 400 });
  if (!duiValido(dui)) return NextResponse.json({ error: "El DUI no es válido (formato 00000000-0)." }, { status: 400 });
  if (!/^\S+@\S+\.\S+$/.test(correo)) return NextResponse.json({ error: "Escribe un correo electrónico válido." }, { status: 400 });
  if (!/^\d{8}$/.test(telefono)) return NextResponse.json({ error: "El teléfono debe tener 8 dígitos." }, { status: 400 });
  if (!cargosValidos.has(cargo)) return NextResponse.json({ error: "Selecciona el cargo o función." }, { status: 400 });
  if (cargo === "otro" && otroCargo.length < 3) return NextResponse.json({ error: "Especifica el otro cargo o función." }, { status: 400 });
  if (cargo === "medico" && !numeroJunta) return NextResponse.json({ error: "El número de junta es requerido para médicos." }, { status: 400 });
  if (!especialidadesValidas.has(especialidad)) return NextResponse.json({ error: "Selecciona la especialidad solicitada." }, { status: 400 });
  if (especialidad === "Otra" && otraEspecialidad.length < 3) return NextResponse.json({ error: "Especifica la otra especialidad." }, { status: 400 });
  if (!esResidente || !yaTuvoUsuario) return NextResponse.json({ error: "Completa las preguntas de usuario previo y residencia." }, { status: 400 });
  if (!servicio) return NextResponse.json({ error: "Indica el servicio al que será asignado." }, { status: 400 });
  if (!autorizadoPor) return NextResponse.json({ error: "Indica quién autoriza la solicitud." }, { status: 400 });

  // Evita que la misma persona deje varias solicitudes abiertas. La consulta es
  // por un único campo para no depender de un índice compuesto.
  const anteriores = await adminDb.collection(SOLICITUDES).where("dui", "==", dui).limit(5).get();
  if (anteriores.docs.some((doc) => ["pendiente", "en_proceso"].includes(String(doc.data().estado)))) {
    return NextResponse.json({ error: "Ya existe una solicitud SIS en trámite con este DUI." }, { status: 409 });
  }

  await adminDb.collection(SOLICITUDES).add({
    institucion: "Hospital Nacional El Salvador",
    nombre,
    dui,
    correo,
    telefono,
    cargo,
    otroCargo: cargo === "otro" ? otroCargo : null,
    numeroJunta: numeroJunta || null,
    yaTuvoUsuario,
    especialidad,
    otraEspecialidad: especialidad === "Otra" ? otraEspecialidad : null,
    esResidente,
    servicio,
    autorizadoPor,
    estado: "pendiente",
    creadoEn: FieldValue.serverTimestamp(),
    actualizadoEn: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}

// GET privado para la bandeja de Administración.
export async function GET(req: NextRequest) {
  if (!(await esAdmin(req))) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const snap = await adminDb.collection(SOLICITUDES).orderBy("creadoEn", "desc").limit(300).get();
  const solicitudes = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      creadoEn: fechaIso(data.creadoEn),
      actualizadoEn: fechaIso(data.actualizadoEn),
      estadoActualizadoEn: fechaIso(data.estadoActualizadoEn),
    };
  });
  return NextResponse.json(solicitudes);
}
