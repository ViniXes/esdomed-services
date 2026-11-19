import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import {
  COLECCION_EXPEDIENTES_CE, MAX_FILAS_POR_CARGA, ORIGEN_PERSONA_CE, ROLES_SUBEN_EXPEDIENTES_CE,
  emparejarCreador, sanearFilaRecibida, type ExpedienteCreado,
} from "@/lib/consultaExterna/expedientesCreados";

// Carga del reporte SIS "Expedientes creados" (solo Consulta Externa).
//
// - Productividad: un documento por expediente en consulta_externa_expedientes_creados
//   (id = expediente). Se crea una sola vez: subir el mismo reporte o un rango que
//   se traslapa no cuenta doble. Se acredita a quien creó el expediente en el SIS,
//   no a quien sube el archivo.
// - Padrón: personas/{expediente} se crea SOLO si no existe, con los datos tal
//   cual vienen del SIS. Nunca se pisa una persona que ya está (ESDOMED la pudo
//   completar con el reporte de ingresados). A una existente solo se le agrega el
//   nombre de la madre si no lo tenía.
// - No crea ingresos, pre-ingresos ni atenciones de emergencia.
//
// Todo pasa por el servidor (Admin SDK), así no hay que abrir reglas al navegador.

const LOTE = 100;
const YA_EXISTE = 6; // gRPC ALREADY_EXISTS

/** Medianoche de El Salvador (UTC-6) del día YYYY-MM-DD. */
function medianocheSV(iso: string): Timestamp | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return Timestamp.fromDate(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 6)));
}

function porLotes<T>(items: T[], n = LOTE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

async function leerExistentes(refs: DocumentReference[]) {
  const mapa = new Map<string, FirebaseFirestore.DocumentData | null>();
  for (const lote of porLotes(refs, 300)) {
    const snaps = await adminDb.getAll(...lote);
    snaps.forEach((s) => mapa.set(s.id, s.exists ? s.data() ?? {} : null));
  }
  return mapa;
}

/** Crea cada documento solo si no existe. Devuelve los ids que sí se crearon. */
async function crearSiNoExiste(items: { ref: DocumentReference; data: Record<string, unknown> }[]) {
  const creados = new Set<string>();
  for (const lote of porLotes(items)) {
    const res = await Promise.allSettled(lote.map((i) => i.ref.create(i.data)));
    res.forEach((r, idx) => {
      if (r.status === "fulfilled") creados.add(lote[idx].ref.id);
      else if ((r.reason as { code?: number })?.code !== YA_EXISTE) throw r.reason;
    });
  }
  return creados;
}

export async function POST(req: NextRequest) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(authorization.slice(7), true)).uid;
  } catch {
    return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  }

  let cuerpo: { filas?: unknown; confirmar?: unknown; archivo?: unknown };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  if (!Array.isArray(cuerpo.filas) || cuerpo.filas.length === 0) {
    return NextResponse.json({ error: "El reporte no trae expedientes de Consulta Externa." }, { status: 400 });
  }
  if (cuerpo.filas.length > MAX_FILAS_POR_CARGA) {
    return NextResponse.json({ error: `Son demasiadas filas para una sola carga (máximo ${MAX_FILAS_POR_CARGA}). Divide el rango de fechas.` }, { status: 400 });
  }
  const confirmar = cuerpo.confirmar === true;
  const archivo = String(cuerpo.archivo ?? "").slice(0, 200);

  try {
    const perfilSnap = await adminDb.collection("usuarios").doc(uid).get();
    const perfil = perfilSnap.data();
    if (!perfil || perfil.activo === false || !ROLES_SUBEN_EXPEDIENTES_CE.includes(perfil.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Filas válidas, sin repetir expediente.
    const filas: ExpedienteCreado[] = [];
    const vistos = new Set<string>();
    let descartadas = 0;
    for (const v of cuerpo.filas) {
      const f = sanearFilaRecibida(v);
      if (!f) { descartadas++; continue; }
      if (vistos.has(f.expediente)) continue;
      vistos.add(f.expediente);
      filas.push(f);
    }

    // Roster de usuarios (vigentes y de baja: un expediente viejo puede ser de alguien que ya no está).
    const usuariosSnap = await adminDb.collection("usuarios").select("nombre").get();
    const usuarios = usuariosSnap.docs
      .map((d) => ({ uid: d.id, nombre: String(d.data().nombre ?? "") }))
      .filter((u) => u.nombre);

    const personasRefs = filas.map((f) => adminDb.collection("personas").doc(f.expediente));
    const registroRefs = filas.map((f) => adminDb.collection(COLECCION_EXPEDIENTES_CE).doc(f.expediente));
    const [personas, registros] = await Promise.all([leerExistentes(personasRefs), leerExistentes(registroRefs)]);

    const porCreador = new Map<string, { creadoPor: string; usuario: string | null; nuevos: number; yaRegistrados: number }>();
    const detalle = filas.map((f) => {
      const usuario = emparejarCreador(f.creadoPor, usuarios);
      const persona = personas.get(f.expediente);
      const registrado = registros.get(f.expediente) != null;
      const fila = porCreador.get(f.creadoPor) ?? { creadoPor: f.creadoPor, usuario: usuario?.nombre ?? null, nuevos: 0, yaRegistrados: 0 };
      if (registrado) fila.yaRegistrados++; else fila.nuevos++;
      porCreador.set(f.creadoPor, fila);
      return {
        expediente: f.expediente,
        nombre: f.nombreCompleto,
        creadoPor: f.creadoPor,
        usuario: usuario?.nombre ?? null,
        fechaCreacion: f.fechaCreacion,
        personaNueva: persona == null,
        agregaMadre: persona != null && !persona.nombreMadre && Boolean(f.nombreMadre),
        productividadNueva: !registrado,
        _usuarioUid: usuario?.uid ?? null,
        _fila: f,
      };
    });

    const resumen = {
      expedientes: filas.length,
      descartadas,
      personasNuevas: detalle.filter((d) => d.personaNueva).length,
      personasExistentes: detalle.filter((d) => !d.personaNueva).length,
      productividadNueva: detalle.filter((d) => d.productividadNueva).length,
      productividadYaRegistrada: detalle.filter((d) => !d.productividadNueva).length,
      creadoresSinUsuario: Array.from(porCreador.values()).filter((c) => !c.usuario).map((c) => c.creadoPor),
      porCreador: Array.from(porCreador.values()).sort((a, b) => b.nuevos + b.yaRegistrados - (a.nuevos + a.yaRegistrados)),
      fechas: filas.length ? [filas.reduce((a, f) => (f.fechaCreacion < a ? f.fechaCreacion : a), filas[0].fechaCreacion), filas.reduce((a, f) => (f.fechaCreacion > a ? f.fechaCreacion : a), filas[0].fechaCreacion)] : [],
    };
    const detallePublico = detalle.map(({ _usuarioUid, _fila, ...d }) => d); // eslint-disable-line @typescript-eslint/no-unused-vars

    if (!confirmar) {
      return NextResponse.json({ vistaPrevia: true, resumen, detalle: detallePublico });
    }

    const ahora = FieldValue.serverTimestamp();
    const cargadoPorNombre = String(perfil.nombre ?? "");

    // 1. Padrón: solo personas nuevas (create falla si otra carga la creó entre tanto).
    const personasCreadas = await crearSiNoExiste(
      detalle.filter((d) => d.personaNueva).map((d) => {
        const f = d._fila;
        const nacimiento = medianocheSV(f.fechaNacimiento);
        return {
          ref: adminDb.collection("personas").doc(f.expediente),
          data: {
            expediente: f.expediente,
            apellidos: f.apellidos,
            nombres: f.nombres,
            genero: f.genero,
            fechaNacimiento: nacimiento,
            ...(f.nombreMadre ? { nombreMadre: f.nombreMadre } : {}),
            origen: ORIGEN_PERSONA_CE,
            creadoEn: ahora,
            actualizadoEn: ahora,
            actualizadoPor: uid,
          },
        };
      }),
    );

    // 2. Nombre de la madre en personas que ya estaban y no lo tenían (solo ese campo).
    let madresAgregadas = 0;
    for (const lote of porLotes(detalle.filter((d) => d.agregaMadre), 400)) {
      const batch = adminDb.batch();
      lote.forEach((d) => batch.set(adminDb.collection("personas").doc(d.expediente), { nombreMadre: d._fila.nombreMadre }, { merge: true }));
      await batch.commit();
      madresAgregadas += lote.length;
    }

    // 3. Productividad: un registro por expediente, una sola vez.
    const registrosCreados = await crearSiNoExiste(
      detalle.filter((d) => d.productividadNueva).map((d) => {
        const f = d._fila;
        return {
          ref: adminDb.collection(COLECCION_EXPEDIENTES_CE).doc(f.expediente),
          data: {
            expediente: f.expediente,
            pacienteNombre: f.nombreCompleto,
            creadoPorSis: f.creadoPor,
            creadoPorUid: d._usuarioUid,
            creadoPorNombre: d.usuario,
            fechaCreacion: f.fechaCreacion,
            fechaCreacionEn: medianocheSV(f.fechaCreacion),
            area: f.area,
            personaNueva: personasCreadas.has(f.expediente),
            cargadoPor: uid,
            cargadoPorNombre,
            cargadoEn: ahora,
            archivo,
          },
        };
      }),
    );

    // configuracion/* es de lectura pública: solo la hora y el rango, sin nombres.
    await adminDb.collection("configuracion").doc("sincronizacion_expedientes_ce").set({
      sincronizadoEn: ahora,
      fechas: resumen.fechas,
    });

    return NextResponse.json({
      vistaPrevia: false,
      resumen,
      guardado: {
        personasCreadas: personasCreadas.size,
        madresAgregadas,
        productividadRegistrada: registrosCreados.size,
      },
    });
  } catch (error) {
    console.error("No se pudo procesar el reporte de expedientes creados", error);
    return NextResponse.json({ error: "No se pudo procesar el reporte. Intenta de nuevo: lo ya guardado no se duplica." }, { status: 500 });
  }
}

/**
 * Lista de expedientes creados en Consulta Externa entre dos fechas de creación
 * (YYYY-MM-DD, máximo 93 días). La ven los mismos que suben el reporte.
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { uid } = await adminAuth.verifyIdToken(token);
    const perfil = (await adminDb.collection("usuarios").doc(uid).get()).data();
    if (!perfil || perfil.activo === false || !ROLES_SUBEN_EXPEDIENTES_CE.includes(perfil.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const desde = params.get("desde") ?? "";
  const hasta = params.get("hasta") ?? "";
  const iniTs = medianocheSV(desde);
  const finTs = medianocheSV(hasta);
  if (!iniTs || !finTs || desde > hasta) return NextResponse.json({ error: "Rango de fechas inválido." }, { status: 400 });
  if ((finTs.toMillis() - iniTs.toMillis()) / 86400000 > 93) {
    return NextResponse.json({ error: "Elige un rango de hasta 3 meses." }, { status: 400 });
  }

  try {
    const snap = await adminDb
      .collection(COLECCION_EXPEDIENTES_CE)
      .where("fechaCreacion", ">=", desde)
      .where("fechaCreacion", "<=", hasta)
      .get();
    const registros = snap.docs.map((d) => {
      const x = d.data();
      return {
        expediente: d.id,
        pacienteNombre: String(x.pacienteNombre ?? ""),
        creadoPor: (x.creadoPorNombre as string | null) ?? String(x.creadoPorSis ?? ""),
        fechaCreacion: String(x.fechaCreacion ?? ""),
        personaNueva: x.personaNueva === true,
      };
    });
    return NextResponse.json({ registros }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("No se pudo leer la lista de expedientes creados", error);
    return NextResponse.json({ error: "No se pudo cargar la lista." }, { status: 500 });
  }
}
