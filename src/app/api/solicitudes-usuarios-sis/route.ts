import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { duiValido, normalizarDui } from "@/lib/dui";
import { SERVICIOS_HOSPITALARIOS } from "@/lib/servicios";
import {
  CARGOS_USUARIO_SIS,
  ESPECIALIDADES_SIS,
  type CargoUsuarioSis,
  TIPOS_DOCUMENTO_SIS,
  type TipoDocumentoSis,
  normalizarNombrePersona,
  JEFATURAS_AUTORIZADORAS_SIS,
} from "@/lib/solicitudesUsuarioSis";

const SOLICITUDES = "solicitudes_usuarios_sis";

const cargosValidos = new Set<string>(CARGOS_USUARIO_SIS.map((cargo) => cargo.value));
const especialidadesValidas = new Set<string>(ESPECIALIDADES_SIS);
const tiposDocumentoValidos = new Set<string>(TIPOS_DOCUMENTO_SIS.map((tipo) => tipo.value));
const jefaturasAutorizadorasValidas = new Set<string>(JEFATURAS_AUTORIZADORAS_SIS);

function texto(value: unknown, max = 180) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function fechaIso(value: unknown) {
  return (value as { toDate?: () => Date } | undefined)?.toDate?.().toISOString() ?? null;
}

// El formulario público debe obedecer el mismo catálogo vivo que usa ESDOMED.
// Si aún no existe una configuración guardada, se conserva el catálogo base
// del sistema como respaldo.
async function obtenerServiciosHabilitados() {
  const config = await adminDb.collection("configuracion").doc("servicios").get();
  const lista = config.data()?.lista;
  if (Array.isArray(lista)) {
    const servicios = lista
      .map((item) => texto((item as { nombre?: unknown })?.nombre, 160))
      .filter(Boolean);
    if (servicios.length > 0) return new Set(servicios);
  }
  return new Set<string>(SERVICIOS_HOSPITALARIOS);
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

  const nombre = normalizarNombrePersona(texto(body.nombre, 120));
  const tipoDocumento = texto(body.tipoDocumento ?? "dui", 30) as TipoDocumentoSis;
  const numeroDocumentoCrudo = texto(body.numeroDocumento ?? body.dui, 40).toUpperCase();
  const numeroDocumento = tipoDocumento === "dui" ? normalizarDui(numeroDocumentoCrudo) : numeroDocumentoCrudo;
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
  const autorizadoPor = texto(body.autorizadoPor, 120);

  if (nombre.length < 5) return NextResponse.json({ error: "Escribe el nombre completo." }, { status: 400 });
  if (!tiposDocumentoValidos.has(tipoDocumento)) return NextResponse.json({ error: "Selecciona el tipo de documento." }, { status: 400 });
  if (tipoDocumento === "dui" && !duiValido(numeroDocumento)) return NextResponse.json({ error: "El DUI debe tener 9 dígitos (formato 00000000-0)." }, { status: 400 });
  if (tipoDocumento !== "dui" && !/^[A-Z0-9][A-Z0-9 ./-]{1,39}$/.test(numeroDocumento)) {
    return NextResponse.json({ error: "Escribe un número de documento válido." }, { status: 400 });
  }
  if (!/^\S+@\S+\.\S+$/.test(correo)) return NextResponse.json({ error: "Escribe un correo electrónico válido." }, { status: 400 });
  if (!/^\d{8}$/.test(telefono)) return NextResponse.json({ error: "El teléfono debe tener 8 dígitos." }, { status: 400 });
  if (!cargosValidos.has(cargo)) return NextResponse.json({ error: "Selecciona el cargo o función." }, { status: 400 });
  if (cargo === "otro" && otroCargo.length < 3) return NextResponse.json({ error: "Especifica el otro cargo o función." }, { status: 400 });
  if (!numeroJunta) return NextResponse.json({ error: "El número de junta o registro profesional es obligatorio." }, { status: 400 });
  if (!especialidadesValidas.has(especialidad)) return NextResponse.json({ error: "Selecciona la especialidad solicitada." }, { status: 400 });
  if (especialidad === "Otra" && otraEspecialidad.length < 3) return NextResponse.json({ error: "Especifica la otra especialidad." }, { status: 400 });
  if (!esResidente || !yaTuvoUsuario) return NextResponse.json({ error: "Completa las preguntas de usuario previo y residencia." }, { status: 400 });
  if (!servicio) return NextResponse.json({ error: "Indica el servicio al que será asignado." }, { status: 400 });
  if (!(await obtenerServiciosHabilitados()).has(servicio)) {
    return NextResponse.json({ error: "Selecciona uno de los servicios habilitados en ESDOMED." }, { status: 400 });
  }
  if (!jefaturasAutorizadorasValidas.has(autorizadoPor)) {
    return NextResponse.json({ error: "Selecciona una jefatura autorizadora de la lista." }, { status: 400 });
  }

  // Evita que la misma persona deje varias solicitudes abiertas. La consulta es
  // por un único campo para no depender de un índice compuesto.
  const [porDocumento, porDuiLegacy] = await Promise.all([
    adminDb.collection(SOLICITUDES).where("numeroDocumento", "==", numeroDocumento).limit(5).get(),
    tipoDocumento === "dui"
      ? adminDb.collection(SOLICITUDES).where("dui", "==", numeroDocumento).limit(5).get()
      : Promise.resolve(null),
  ]);
  const anteriores = [...porDocumento.docs, ...(porDuiLegacy?.docs ?? [])];
  if (anteriores.some((doc) => ["pendiente", "en_proceso"].includes(String(doc.data().estado)))) {
    return NextResponse.json({ error: "Ya existe una solicitud SIS en trámite con este documento." }, { status: 409 });
  }

  await adminDb.collection(SOLICITUDES).add({
    institucion: "Hospital Nacional El Salvador",
    nombre,
    tipoDocumento,
    numeroDocumento,
    dui: tipoDocumento === "dui" ? numeroDocumento : null,
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
