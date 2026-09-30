import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const SOLICITUDES = "solicitudes_usuarios_sis";

async function esAdministrador(req: NextRequest): Promise<boolean> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return false;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const perfil = await adminDb.collection("usuarios").doc(decoded.uid).get();
    return perfil.data()?.role === "admin";
  } catch {
    return false;
  }
}

function fechaIso(value: unknown) {
  return (value as { toDate?: () => Date } | undefined)?.toDate?.().toISOString() ?? null;
}

function mismaFecha(a: unknown, b: unknown) {
  const fechaA = fechaIso(a);
  const fechaB = fechaIso(b);
  return Boolean(fechaA && fechaB && fechaA === fechaB);
}

/**
 * Producción administrativa de usuarios SIS. Se sirve solo desde el servidor
 * para que el navegador nunca pueda consultar la bandeja completa por fuera
 * de los permisos administrativos.
 */
export async function GET(req: NextRequest) {
  if (!(await esAdministrador(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const mes = new URL(req.url).searchParams.get("mes") ?? "";
  const match = mes.match(/^(\d{4})-(\d{2})$/);
  if (!match) return NextResponse.json({ error: "Mes inválido" }, { status: 400 });

  const anio = Number(match[1]);
  const numeroMes = Number(match[2]);
  if (numeroMes < 1 || numeroMes > 12) return NextResponse.json({ error: "Mes inválido" }, { status: 400 });

  // Medianoche de El Salvador (UTC-6), para que el reporte mensual coincida
  // con el día laboral que ve el personal.
  const inicio = new Date(Date.UTC(anio, numeroMes - 1, 1, 6));
  const fin = new Date(Date.UTC(anio, numeroMes, 1, 5, 59, 59, 999));
  const [creacionesSnap, gestionesUsuariosSnap, llavesSnap, reposicionesGeneradasSnap, reposicionesEntregadasSnap, gestionesLlavesSnap] = await Promise.all([
    adminDb
      .collection(SOLICITUDES)
      .where("usuarioSisCreadoEn", ">=", inicio)
      .where("usuarioSisCreadoEn", "<=", fin)
      .get(),
    adminDb
      .collection(SOLICITUDES)
      .where("estadoActualizadoEn", ">=", inicio)
      .where("estadoActualizadoEn", "<=", fin)
      .get(),
    adminDb
      .collection(SOLICITUDES)
      .where("llavesSisEnviadasEn", ">=", inicio)
      .where("llavesSisEnviadasEn", "<=", fin)
      .get(),
    adminDb
      .collection("solicitudes_reposicion_llave_sis")
      .where("llaveGeneradaEn", ">=", inicio)
      .where("llaveGeneradaEn", "<=", fin)
      .get(),
    adminDb
      .collection("solicitudes_reposicion_llave_sis")
      .where("llaveSisEntregadaEn", ">=", inicio)
      .where("llaveSisEntregadaEn", "<=", fin)
      .get(),
    adminDb
      .collection("solicitudes_reposicion_llave_sis")
      .where("estadoActualizadoEn", ">=", inicio)
      .where("estadoActualizadoEn", "<=", fin)
      .get(),
  ]);

  const registros = creacionesSnap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        solicitante: String(data.nombre ?? ""),
        usuarioSis: String(data.usuarioSis ?? ""),
        creadoPorId: String(data.usuarioSisCreadoPorId ?? ""),
        creadoPorNombre: String(data.usuarioSisCreadoPorNombre ?? ""),
        creadoEn: fechaIso(data.usuarioSisCreadoEn),
      };
    })
    .filter((registro) => registro.creadoPorId && registro.creadoPorNombre && registro.creadoEn)
    .sort((a, b) => String(b.creadoEn).localeCompare(String(a.creadoEn)));

  const llavesEnviadasUsuarios = llavesSnap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        solicitante: String(data.nombre ?? ""),
        usuarioSis: String(data.usuarioSis ?? ""),
        enviadoPorId: String(data.llavesSisEnviadasPorId ?? ""),
        enviadoPorNombre: String(data.llavesSisEnviadasPorNombre ?? ""),
        enviadoEn: fechaIso(data.llavesSisEnviadasEn),
      };
    })
    .filter((registro) => registro.enviadoPorId && registro.enviadoPorNombre && registro.enviadoEn)
    .sort((a, b) => String(b.enviadoEn).localeCompare(String(a.enviadoEn)));

  const llavesGeneradasReposicion = reposicionesGeneradasSnap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: `generacion-${doc.id}`,
        solicitante: String(data.medicoNombre ?? ""),
        usuarioSis: "",
        enviadoPorId: String(data.llaveGeneradaPorId ?? ""),
        enviadoPorNombre: String(data.llaveGeneradaPorNombre ?? ""),
        enviadoEn: fechaIso(data.llaveGeneradaEn),
      };
    })
    .filter((registro) => registro.enviadoPorId && registro.enviadoPorNombre && registro.enviadoEn);

  const llavesEnviadasReposicion = reposicionesEntregadasSnap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: `reposicion-${doc.id}`,
        solicitante: String(data.medicoNombre ?? ""),
        usuarioSis: "",
        enviadoPorId: String(data.llaveSisEntregadaPorId ?? ""),
        enviadoPorNombre: String(data.llaveSisEntregadaPorNombre ?? ""),
        enviadoEn: fechaIso(data.llaveSisEntregadaEn),
      };
    })
    .filter((registro) => registro.enviadoPorId && registro.enviadoPorNombre && registro.enviadoEn);

  const llavesEnviadas = [...llavesEnviadasUsuarios, ...llavesEnviadasReposicion]
    .sort((a, b) => String(b.enviadoEn).localeCompare(String(a.enviadoEn)));

  const gestionesUsuarios = gestionesUsuariosSnap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: `gestion-usuario-${doc.id}`,
        solicitante: String(data.nombre ?? ""),
        usuarioSis: String(data.usuarioSis ?? ""),
        enviadoPorId: String(data.estadoActualizadoPorId ?? ""),
        enviadoPorNombre: String(data.estadoActualizadoPorNombre ?? ""),
        enviadoEn: fechaIso(data.estadoActualizadoEn),
        esCreacion: mismaFecha(data.estadoActualizadoEn, data.usuarioSisCreadoEn),
      };
    })
    // La transición a creado se contabiliza como creación, no dos veces como gestión.
    .filter((registro) => !registro.esCreacion && registro.enviadoPorId && registro.enviadoPorNombre && registro.enviadoEn);

  const gestionesLlaves = gestionesLlavesSnap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: `gestion-llave-${doc.id}`,
        solicitante: String(data.medicoNombre ?? ""),
        usuarioSis: "",
        enviadoPorId: String(data.estadoActualizadoPorId ?? ""),
        enviadoPorNombre: String(data.estadoActualizadoPorNombre ?? ""),
        enviadoEn: fechaIso(data.estadoActualizadoEn),
        esGeneracion: mismaFecha(data.estadoActualizadoEn, data.llaveGeneradaEn),
        esEntrega: mismaFecha(data.estadoActualizadoEn, data.llaveSisEntregadaEn),
      };
    })
    // Generar o entregar ya son actividades propias y no se duplican como gestión.
    .filter((registro) => !registro.esGeneracion && !registro.esEntrega && registro.enviadoPorId && registro.enviadoPorNombre && registro.enviadoEn);

  const actividades = [
    ...registros.map((registro) => ({ ...registro, tipo: "usuarios_creados", etiqueta: "Usuarios SIS creados", responsableId: registro.creadoPorId, responsableNombre: registro.creadoPorNombre, fecha: registro.creadoEn })),
    ...gestionesUsuarios.map((registro) => ({ ...registro, tipo: "usuarios_gestionados", etiqueta: "Gestiones de usuarios SIS", responsableId: registro.enviadoPorId, responsableNombre: registro.enviadoPorNombre, fecha: registro.enviadoEn })),
    ...llavesGeneradasReposicion.map((registro) => ({ ...registro, tipo: "llaves_generadas", etiqueta: "Llaves o firmas generadas", responsableId: registro.enviadoPorId, responsableNombre: registro.enviadoPorNombre, fecha: registro.enviadoEn })),
    ...llavesEnviadas.map((registro) => ({ ...registro, tipo: "llaves_entregadas", etiqueta: "Llaves o firmas entregadas", responsableId: registro.enviadoPorId, responsableNombre: registro.enviadoPorNombre, fecha: registro.enviadoEn })),
    ...gestionesLlaves.map((registro) => ({ ...registro, tipo: "llaves_gestionadas", etiqueta: "Gestiones de llaves o firmas", responsableId: registro.enviadoPorId, responsableNombre: registro.enviadoPorNombre, fecha: registro.enviadoEn })),
  ].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  return NextResponse.json({ registros, llavesEnviadas, actividades });
}
