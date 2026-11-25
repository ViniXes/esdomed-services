import { randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import {
  COL_PARTICIPANTES_EVALUACION, DOC_ESTADO_EVALUACION, EVALUACION_EN_LINEA, MS_GRACIA_ENTREGA, MS_PARA_INICIAR,
  esElegibleEvaluacion, estadoDeParticipante, finDeEvaluacion, idParticipante,
  type FilaPanelEvaluacion, type MiEvaluacion,
} from "@/lib/evaluacionEnLinea";
import { CLAVES_EVALUACION, NUMEROS_CLAVE, calificar } from "@/lib/evaluacionEnLineaClaves";
import { filaDe, filasDelPlan, guardarEnFicha, type DatosHoja } from "@/lib/evaluacionEnLineaServidor";
import { ordenGrupo } from "@/lib/esdomed/plan";
import type { UserProfile } from "@/types";

// Evaluación en línea (ver src/lib/evaluacionEnLinea.ts).
//
// - GET → mi evaluación. La primera vez que una persona elegible la consulta con
//   la evaluación abierta se le asigna una clave al azar. Tiene 5 minutos para
//   prepararse (no puede iniciarla antes) y luego 15 para responder, entre cuando
//   entre. Las preguntas solo vienen si ya la inició (sin respuestas).
// - GET ?panel=1 (admin) → personal elegible con su estado, clave y nota.
// - POST { accion: "iniciar" } · { accion: "guardar", respuestas } (cada clic: lo
//   marcado queda en el servidor) · { accion: "entregar", respuestas }.
//   Pasados sus 15 minutos (más 1 min de margen) se entrega sola con lo último
//   guardado, al consultarla ella o el panel.
// - POST (admin) { accion: "abrir" | "cerrar" } · { accion: "reabrir", uid }
//   (tiempo de nuevo, 5 + 15, a quien no entró) · { accion: "ficha", uid } (reintentar el PDF).
//
// Sin reglas: el navegador no lee ni escribe los participantes. El estado
// abierta/cerrada va en configuracion/evaluacion_en_linea (lectura pública).

const SIN_CACHE = { "Cache-Control": "private, no-store" };
type Perfil = UserProfile & { uid: string };

interface Participante {
  uid: string;
  nombre: string;
  grupo: string;
  evaluacionId: string;
  clave: number;
  vistaEn: Timestamp;
  iniciadaEn?: Timestamp | null;
  entregadaEn?: Timestamp | null;
  respuestas?: number[];
  /** Lo marcado mientras responde (−1 = sin responder). */
  guardadas?: number[];
  autoEntregada?: boolean;
  puntaje?: number;
  total?: number;
  enFicha?: boolean;
}

/** Respuestas válidas para la clave: lo que no es 0–2 cuenta como sin responder (−1). */
const normalizar = (valor: unknown, n: number): number[] => {
  const arr = Array.isArray(valor) ? valor : [];
  return Array.from({ length: n }, (_, i) => {
    const r = Number(arr[i]);
    return Number.isInteger(r) && r >= 0 && r <= 2 ? r : -1;
  });
};
const finDe = (p: Participante) => finDeEvaluacion({ vistaEnMs: ms(p.vistaEn), iniciadaEnMs: ms(p.iniciadaEn) });
const seAcaboElTiempo = (p: Participante, ahora: number) =>
  Boolean(p.iniciadaEn && !p.entregadaEn && ahora > finDe(p) + MS_GRACIA_ENTREGA);

const ms = (t?: Timestamp | null) => (t ? t.toMillis() : null);
const refEstado = () => adminDb.collection(DOC_ESTADO_EVALUACION.coleccion).doc(DOC_ESTADO_EVALUACION.id);
const refParticipante = (uid: string) => adminDb.collection(COL_PARTICIPANTES_EVALUACION).doc(idParticipante(uid));
const json = (cuerpo: unknown, status = 200) => NextResponse.json(cuerpo, { status, headers: SIN_CACHE });

async function autenticar(req: NextRequest): Promise<Perfil | NextResponse> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "No autorizado" }, 401);
  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(token)).uid;
  } catch {
    return json({ error: "Sesión inválida" }, 401);
  }
  const perfil = (await adminDb.collection("usuarios").doc(uid).get()).data() as UserProfile | undefined;
  if (!perfil || perfil.activo === false) return json({ error: "No autorizado" }, 403);
  return { ...perfil, uid };
}

function respuestaDe(p: Participante, activa: boolean, ahora: number): MiEvaluacion {
  const datos = { vistaEnMs: ms(p.vistaEn), iniciadaEnMs: ms(p.iniciadaEn), entregadaEnMs: ms(p.entregadaEn) };
  const estado = estadoDeParticipante(datos, ahora);
  return {
    activa,
    elegible: true,
    ahoraMs: ahora,
    estado,
    clave: p.clave,
    limiteMs: (datos.vistaEnMs ?? ahora) + MS_PARA_INICIAR,
    finMs: estado === "en_curso" || estado === "por_iniciar" ? finDe(p) : undefined,
    guardadas: estado === "en_curso" ? p.guardadas : undefined,
    preguntas: estado === "en_curso" ? CLAVES_EVALUACION[p.clave].preguntas : undefined,
    puntaje: estado === "entregada" ? (p.puntaje ?? null) : undefined,
    total: CLAVES_EVALUACION[p.clave].correctas.length,
    entregadaEnMs: datos.entregadaEnMs,
  };
}

const datosHoja = (p: Participante): DatosHoja => ({
  nombre: p.nombre,
  grupo: p.grupo,
  clave: p.clave,
  respuestas: p.respuestas ?? [],
  puntaje: p.puntaje ?? 0,
  total: p.total ?? CLAVES_EVALUACION[p.clave].correctas.length,
  iniciadaEnMs: ms(p.iniciadaEn) ?? ms(p.entregadaEn) ?? Date.now(),
  entregadaEnMs: ms(p.entregadaEn) ?? Date.now(),
});

/**
 * Si se le acabaron los 15 minutos sin entregar (cerró la página, se fue la
 * red…), se entrega con lo último guardado y se califica. Devuelve el
 * participante al día.
 */
async function cerrarSiVencio(uid: string, p: Participante): Promise<Participante> {
  if (!seAcaboElTiempo(p, Date.now())) return p;
  const r = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(refParticipante(uid));
    const actual = snap.data() as Participante;
    if (!seAcaboElTiempo(actual, Date.now())) return { p: actual, nueva: false };
    const respuestas = normalizar(actual.guardadas, CLAVES_EVALUACION[actual.clave].correctas.length);
    const { puntaje, total } = calificar(actual.clave, respuestas);
    const entregadaEn = Timestamp.fromMillis(finDe(actual));
    tx.update(snap.ref, { respuestas, puntaje, total, entregadaEn, autoEntregada: true });
    return { p: { ...actual, respuestas, puntaje, total, entregadaEn, autoEntregada: true }, nueva: true };
  });
  if (r.nueva) await alFicha(uid, r.p);
  return r.p;
}

/** El PDF a la ficha va aparte: si falla, la nota ya quedó y el admin lo reintenta desde el panel. */
async function alFicha(uid: string, p: Participante) {
  try {
    await guardarEnFicha(uid, datosHoja(p));
    await refParticipante(uid).update({ enFicha: true });
    p.enFicha = true;
  } catch (e) {
    console.error("evaluacion-en-linea ficha", e);
  }
}

async function panel(): Promise<NextResponse> {
  const ahora = Date.now();
  const [estado, usuarios, plan, participantes] = await Promise.all([
    refEstado().get(),
    adminDb.collection("usuarios").where("role", "in", ["esdomed", "asistente_esdomed"]).get(),
    filasDelPlan(),
    adminDb.collection(COL_PARTICIPANTES_EVALUACION).where("evaluacionId", "==", EVALUACION_EN_LINEA.id).get(),
  ]);
  const porUid = new Map(participantes.docs.map((d) => [String(d.data().uid), d.data() as Participante]));
  for (const [uid, p] of porUid) if (seAcaboElTiempo(p, ahora)) porUid.set(uid, await cerrarSiVencio(uid, p));
  const filas: FilaPanelEvaluacion[] = [];
  const vistos = new Set<string>();
  const agregar = (uid: string, nombre: string, grupo: string) => {
    vistos.add(uid);
    const p = porUid.get(uid);
    const total = p ? CLAVES_EVALUACION[p.clave].correctas.length : 10;
    filas.push({
      uid,
      nombre: p?.nombre || nombre,
      grupo: p?.grupo || grupo,
      estado: p ? estadoDeParticipante({ vistaEnMs: ms(p.vistaEn), iniciadaEnMs: ms(p.iniciadaEn), entregadaEnMs: ms(p.entregadaEn) }, ahora) : "sin_abrir",
      clave: p?.clave ?? null,
      vistaEnMs: ms(p?.vistaEn),
      iniciadaEnMs: ms(p?.iniciadaEn),
      entregadaEnMs: ms(p?.entregadaEn),
      puntaje: p?.entregadaEn ? (p.puntaje ?? null) : null,
      total,
      enFicha: Boolean(p?.enFicha),
    });
  };
  for (const d of usuarios.docs) {
    const u = { ...(d.data() as UserProfile), uid: d.id };
    const fila = filaDe(plan, u.uid, u.codigoMarcacion);
    if (!esElegibleEvaluacion(u)) continue;
    agregar(u.uid, u.nombre, fila?.grupo ?? "");
  }
  // Quien la hizo y ya no calza (p. ej. cambió de jornada después) igual sale.
  for (const [uid, p] of porUid) if (!vistos.has(uid)) agregar(uid, p.nombre, p.grupo);
  filas.sort((a, b) => ordenGrupo(a.grupo) - ordenGrupo(b.grupo) || a.grupo.localeCompare(b.grupo) || a.nombre.localeCompare(b.nombre));
  const e = estado.data() ?? {};
  return json({
    activa: e.activa === true,
    abiertaEnMs: ms(e.abiertaEn as Timestamp | undefined),
    cerradaEnMs: ms(e.cerradaEn as Timestamp | undefined),
    filas,
    ahoraMs: ahora,
  });
}

export async function GET(req: NextRequest) {
  const yo = await autenticar(req).catch(() => json({ error: "No autorizado" }, 401));
  if (yo instanceof NextResponse) return yo;
  try {
    if (req.nextUrl.searchParams.get("panel") === "1") {
      if (yo.role !== "admin") return json({ error: "No autorizado" }, 403);
      return await panel();
    }
    const ahora = Date.now();
    const [estado, existente] = await Promise.all([refEstado().get(), refParticipante(yo.uid).get()]);
    const activa = estado.data()?.activa === true;
    if (existente.exists) {
      const p = await cerrarSiVencio(yo.uid, existente.data() as Participante);
      return json(respuestaDe(p, activa, Date.now()));
    }
    if (!activa) return json({ activa, elegible: false, ahoraMs: ahora } satisfies MiEvaluacion);

    const plan = await filasDelPlan();
    const fila = filaDe(plan, yo.uid, yo.codigoMarcacion);
    if (!esElegibleEvaluacion(yo)) return json({ activa, elegible: false, ahoraMs: ahora } satisfies MiEvaluacion);

    // Primera vez: clave al azar y arrancan sus 5 minutos. create() falla si otra
    // pestaña se adelantó; entonces se devuelve lo que esa guardó.
    const nuevo: Participante = {
      uid: yo.uid,
      nombre: yo.nombre,
      grupo: fila?.grupo ?? "",
      evaluacionId: EVALUACION_EN_LINEA.id,
      clave: NUMEROS_CLAVE[randomInt(NUMEROS_CLAVE.length)],
      vistaEn: Timestamp.fromMillis(ahora),
      iniciadaEn: null,
      entregadaEn: null,
    };
    try {
      await refParticipante(yo.uid).create(nuevo);
      return json(respuestaDe(nuevo, activa, ahora));
    } catch {
      const otra = await refParticipante(yo.uid).get();
      return json(respuestaDe(otra.data() as Participante, activa, Date.now()));
    }
  } catch (e) {
    console.error("evaluacion-en-linea GET", e);
    return json({ error: "No se pudo cargar la evaluación." }, 500);
  }
}

class Rechazo extends Error {
  constructor(message: string, public status = 409) {
    super(message);
  }
}

export async function POST(req: NextRequest) {
  const yo = await autenticar(req).catch(() => json({ error: "No autorizado" }, 401));
  if (yo instanceof NextResponse) return yo;
  let cuerpo: { accion?: string; respuestas?: unknown; uid?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: "Solicitud inválida" }, 400);
  }
  const accion = cuerpo.accion;
  try {
    // ── Acciones del admin ───────────────────────────────────────────────
    if (accion === "abrir" || accion === "cerrar" || accion === "reabrir" || accion === "ficha") {
      if (yo.role !== "admin") return json({ error: "No autorizado" }, 403);
      if (accion === "abrir" || accion === "cerrar") {
        await refEstado().set(
          accion === "abrir"
            ? { activa: true, evaluacionId: EVALUACION_EN_LINEA.id, abiertaEn: FieldValue.serverTimestamp(), abiertaPorNombre: yo.nombre }
            : { activa: false, cerradaEn: FieldValue.serverTimestamp(), cerradaPorNombre: yo.nombre },
          { merge: true },
        );
        return json({ ok: true });
      }
      const uid = String(cuerpo.uid ?? "");
      if (!uid) return json({ error: "Falta la persona." }, 400);
      if (accion === "reabrir") {
        await adminDb.runTransaction(async (tx) => {
          const snap = await tx.get(refParticipante(uid));
          const p = snap.data() as Participante | undefined;
          if (!p) throw new Rechazo("Esa persona aún no ha abierto la evaluación.");
          if (p.iniciadaEn || p.entregadaEn) throw new Rechazo("Ya la inició: no hace falta darle más tiempo.");
          tx.update(snap.ref, { vistaEn: Timestamp.now(), tiempoExtraPorNombre: yo.nombre });
        });
        return json({ ok: true });
      }
      const p = (await refParticipante(uid).get()).data() as Participante | undefined;
      if (!p?.entregadaEn) return json({ error: "Aún no la ha entregado." }, 409);
      await guardarEnFicha(uid, datosHoja(p));
      await refParticipante(uid).update({ enFicha: true });
      return json({ ok: true });
    }

    // ── Acciones de quien hace la evaluación ─────────────────────────────
    if (accion === "iniciar") {
      const activa = (await refEstado().get()).data()?.activa === true;
      const p = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(refParticipante(yo.uid));
        const p = snap.data() as Participante | undefined;
        if (!p) throw new Rechazo("No tienes una evaluación asignada.", 403);
        const estado = estadoDeParticipante({ vistaEnMs: ms(p.vistaEn), iniciadaEnMs: ms(p.iniciadaEn), entregadaEnMs: ms(p.entregadaEn) }, Date.now());
        if (estado === "en_curso") return p; // otra pestaña ya la inició
        if (estado === "entregada") throw new Rechazo("Ya entregaste tu evaluación.");
        if (estado === "vencida") throw new Rechazo("Se acabaron tus 15 minutos sin que entraras a la prueba. Avisa a tu jefatura.");
        if (!activa) throw new Rechazo("La evaluación ya se cerró.");
        // 5 minutos de preparación: antes no se puede iniciar (2 s de tolerancia por el reloj).
        if (Date.now() < (ms(p.vistaEn) ?? 0) + MS_PARA_INICIAR - 2000) throw new Rechazo("Tu prueba aún no se habilita: termina de prepararte.");
        const iniciadaEn = Timestamp.now();
        tx.update(snap.ref, { iniciadaEn });
        return { ...p, iniciadaEn };
      });
      return json(respuestaDe(p, activa, Date.now()));
    }

    if (accion === "guardar") {
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(refParticipante(yo.uid));
        const p = snap.data() as Participante | undefined;
        if (!p?.iniciadaEn || p.entregadaEn) throw new Rechazo("La evaluación no está en curso.");
        if (Date.now() > finDe(p) + MS_GRACIA_ENTREGA) throw new Rechazo("Se acabó el tiempo.");
        tx.update(snap.ref, { guardadas: normalizar(cuerpo.respuestas, CLAVES_EVALUACION[p.clave].correctas.length) });
      });
      return json({ ok: true });
    }

    if (accion === "entregar") {
      const resultado = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(refParticipante(yo.uid));
        const p = snap.data() as Participante | undefined;
        if (!p) throw new Rechazo("No tienes una evaluación asignada.", 403);
        if (p.entregadaEn) return { p, nueva: false };
        if (!p.iniciadaEn) throw new Rechazo("Primero hay que iniciar la evaluación.");
        const n = CLAVES_EVALUACION[p.clave].correctas.length;
        // Dentro del tiempo (o del minuto de margen) vale lo que manda; después,
        // solo lo que alcanzó a guardar antes de que se acabara.
        const tarde = Date.now() > finDe(p) + MS_GRACIA_ENTREGA;
        const respuestas = normalizar(tarde ? p.guardadas : cuerpo.respuestas, n);
        const { puntaje, total } = calificar(p.clave, respuestas);
        const entregadaEn = tarde ? Timestamp.fromMillis(finDe(p)) : Timestamp.now();
        const cambios = { respuestas, puntaje, total, entregadaEn, ...(tarde ? { autoEntregada: true } : {}) };
        tx.update(snap.ref, cambios);
        return { p: { ...p, ...cambios }, nueva: true };
      });
      if (resultado.nueva) await alFicha(yo.uid, resultado.p);
      const activa = (await refEstado().get()).data()?.activa === true;
      return json(respuestaDe(resultado.p, activa, Date.now()));
    }

    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    if (e instanceof Rechazo) return json({ error: e.message }, e.status);
    console.error("evaluacion-en-linea POST", e);
    return json({ error: "No se pudo completar. Intenta de nuevo." }, 500);
  }
}
