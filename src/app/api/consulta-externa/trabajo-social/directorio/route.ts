import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { hoySV } from "@/lib/consultaExterna/actualizaciones";
import {
  COL_TS_GESTIONES, COL_TS_NOTAS, TIPO_ACTUALIZACION_DATOS, areaSugerida, validarPacienteManual,
} from "@/lib/consultaExterna/trabajoSocial";
import {
  COL_TS_DIRECTORIO, camposCambiados, idDirectorio, textoActualizacion, validarFicha,
} from "@/lib/consultaExterna/trabajoSocialDirectorio";
import {
  cambioFicha, cambioIndice, cuerpo, fallo, fichaPorClave, idGestionDirectorio, leerFicha, ok, olvidarPacientes, pacientePorClave,
  resolverPaciente, sesionTS,
} from "@/lib/consultaExterna/trabajoSocialServidor";

/** Qué pasó con la productividad: gestión nueva, la misma de hoy, o nada porque no cambió ningún dato. */
type Cuenta = "nueva" | "misma" | "sin_cambios";
type Resultado = { error: string; status: number } | { cuenta: Cuenta };

// Directorio de Trabajo Social de Consulta Externa: los datos personales y de
// contacto que completan las trabajadoras. Solo quien registra: la jefatura no
// lo consulta.
// - GET ?clave=              → el paciente (del índice) y su ficha, si ya tiene
// - PUT { clave | manual, ficha } → crea o corrige la ficha
// La clave va en la consulta y no en la ruta: puede traer comas o espacios.
//
// Completar o corregir datos es trabajo: cada guardado que cambia algo deja una
// gestión «Actualización de datos del paciente», ya finalizada, con una nota que
// dice qué se tocó (pedido del usuario, 2026-11-25). Una por persona, paciente y
// día: guardar otra vez el mismo día suma a esa nota, no cuenta doble.
export async function GET(req: NextRequest) {
  const sesion = await sesionTS(req, "registrar");
  if (sesion instanceof NextResponse) return sesion;
  const clave = (new URL(req.url).searchParams.get("clave") ?? "").trim();
  if (!clave) return fallo("Consulta inválida.");
  try {
    const [paciente, ficha] = await Promise.all([pacientePorClave(clave), fichaPorClave(clave)]);
    if (!paciente) return fallo("Ese paciente no está en el directorio.", 404);
    return ok({ hoy: hoySV(), paciente, ficha });
  } catch (e) {
    console.error("Trabajo Social CE: no se pudo leer la ficha", e);
    return fallo("No se pudo leer la ficha del paciente.", 500);
  }
}

export async function PUT(req: NextRequest) {
  const sesion = await sesionTS(req, "registrar");
  if (sesion instanceof NextResponse) return sesion;
  const datos = await cuerpo(req);
  const manual = datos.manual ? validarPacienteManual(datos.manual) : null;
  if (manual && !manual.ok) return fallo(manual.error);

  try {
    const resuelto = await resolverPaciente(String(datos.clave ?? ""), manual?.ok ? manual.datos : null);
    if (!resuelto) return fallo("Elija el paciente de la lista o escríbalo a mano.");
    const { paciente, nuevoManual } = resuelto;
    const hoy = hoySV();
    const ref = adminDb.collection(COL_TS_DIRECTORIO).doc(idDirectorio(paciente.clave));
    const idGestion = idGestionDirectorio(hoy, sesion.uid, paciente.clave);
    const refG = adminDb.collection(COL_TS_GESTIONES).doc(idGestion);
    const refN = adminDb.collection(COL_TS_NOTAS).doc(idGestion);

    const r = await adminDb.runTransaction(async (tx): Promise<Resultado> => {
      const [snap, snapG, snapN] = await tx.getAll(ref, refG, refN);
      const previa = snap.exists ? leerFicha(snap.data()!) : null;
      // La ficha guardada decide desde cuándo cuenta la edad anotada, no el navegador.
      const v = validarFicha(datos.ficha, hoy, { previa, duiDeCita: paciente.dui });
      if (!v.ok) return { error: v.error, status: 400 };
      const cambios = camposCambiados(previa, v.datos, paciente.dui);
      // Guardar sin tocar nada no escribe ni cuenta.
      if (!cambios.length) return { cuenta: "sin_cambios" };

      tx.set(ref, {
        ...v.datos,
        // Copia de quién es, para leer la colección sin el índice.
        clave: paciente.clave,
        expediente: paciente.expediente,
        dui: paciente.dui,
        paciente: paciente.paciente,
        actualizadoPor: sesion.uid,
        actualizadoPorNombre: sesion.nombre,
        actualizadoEn: FieldValue.serverTimestamp(),
        ...(snap.exists ? {} : { creadoPor: sesion.uid, creadoPorNombre: sesion.nombre, creadoEn: FieldValue.serverTimestamp() }),
      }, { merge: true });
      const indice = cambioFicha(paciente.clave, v.datos.telefono, nuevoManual);
      tx.set(indice.ref, indice.datos, { merge: true });

      if (snapG.exists) {
        // Ya contó hoy: la nota suma lo nuevo. Si la borraron o la convirtieron en otra cosa, se deja como está.
        const g = snapG.data()!;
        if (g.tipo === TIPO_ACTUALIZACION_DATOS) {
          const campos = [...new Set([...((g.directorio?.campos ?? []) as string[]), ...cambios])];
          tx.update(refG, { "directorio.campos": campos });
          if (snapN.exists) tx.update(refN, { texto: textoActualizacion(campos, g.directorio?.primera === true) });
        }
        return { cuenta: "misma" };
      }

      const primera = !previa;
      tx.create(refG, {
        tipo: TIPO_ACTUALIZACION_DATOS,
        detalle: "",
        area: areaSugerida(TIPO_ACTUALIZACION_DATOS, paciente.especialidadId, sesion.area),
        procedencia: "",
        establecimiento: "",
        medico: "",
        poblacion: [],
        clave: paciente.clave,
        expediente: paciente.expediente,
        dui: paciente.dui,
        paciente: paciente.paciente,
        especialidadId: paciente.especialidadId,
        origen: paciente.manual ? "manual" : "cita",
        estado: "finalizada",
        motivoNoProcede: "",
        fecha: hoy,
        fechaCierre: hoy,
        creadoPor: sesion.uid,
        creadoPorNombre: sesion.nombre,
        creadoEn: FieldValue.serverTimestamp(),
        totalNotas: 1,
        ultimaNotaFecha: hoy,
        historial: [],
        // Qué se tocó; `primera` distingue completar la ficha de corregirla.
        directorio: { campos: cambios, primera },
      });
      // Sin medio ni interlocutor: el directorio no pregunta cómo se obtuvo el dato.
      tx.create(refN, {
        fecha: hoy,
        paso: "",
        conQuien: "",
        medio: "",
        texto: textoActualizacion(cambios, primera),
        gestionId: idGestion,
        clave: paciente.clave,
        autor: sesion.uid,
        autorNombre: sesion.nombre,
        creadoEn: FieldValue.serverTimestamp(),
      });
      const contador = cambioIndice(paciente.clave, 1);
      tx.set(contador.ref, contador.datos, { merge: true });
      return { cuenta: "nueva" };
    });
    if ("error" in r) return fallo(r.error, r.status);
    if (r.cuenta !== "sin_cambios") olvidarPacientes();
    const [guardado, ficha] = await Promise.all([pacientePorClave(paciente.clave), fichaPorClave(paciente.clave)]);
    return ok({ hoy, paciente: guardado ?? paciente, ficha, cuenta: r.cuenta, gestionId: r.cuenta === "sin_cambios" ? "" : idGestion });
  } catch (e) {
    console.error("Trabajo Social CE: no se pudo guardar la ficha", e);
    return fallo("No se pudo guardar. Lo escrito sigue en la pantalla.", 500);
  }
}
