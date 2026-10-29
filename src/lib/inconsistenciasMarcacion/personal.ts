// Fase 2: cada empleado ve SUS inconsistencias de marcación.
//
// El documento mensual (`inconsistencias_marcacion/{YYYY-MM}`) trae a todo el
// personal en un arreglo, y las reglas de Firestore no pueden dar lectura de
// solo una parte de un documento. Por eso, cuando el admin revisa un mes y lo
// PUBLICA, se escribe una copia por persona en
// `inconsistencias_marcacion_personal/{YYYY-MM}_{CODIGO}` con `empleadoId` = uid
// del usuario que tiene ese código de marcación. Sin publicar, nadie más que el
// admin ve el mes; volver a subir el PDF retira la publicación.

import {
  collection, deleteField, doc, getDocs, query, serverTimestamp, where, writeBatch, type WriteBatch,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import type {
  DiaInconsistenciaMarcacion,
  DiaReclamadoMarcacion,
  EmpleadoInconsistenciasMarcacion,
  FilaPlanTrabajo,
  ReporteInconsistenciasMarcacion,
  UserProfile,
} from "@/types";
import { normalizarCodigoMarcacion } from "@/lib/esdomed/catalogo-plan";
import { esMarcaEspecial, getHorario, labelMarca } from "@/lib/esdomed/horarios";
import { minutosDeEtiqueta, permisoDelDia } from "@/lib/esdomed/permisos-plan";
import { etiquetaIncidencia } from "./analisis";

export const COLECCION_INCONSISTENCIAS = "inconsistencias_marcacion";
export const COLECCION_INCONSISTENCIAS_PERSONAL = "inconsistencias_marcacion_personal";

/** Roles que llevan código de marcación (mismos que en /api/usuarios). */
export const ROLES_CON_CODIGO = ["esdomed", "asistente_esdomed", "admin"] as const;

export const idCopiaPersonal = (periodo: string, codigo: string) =>
  `${periodo}_${normalizarCodigoMarcacion(codigo).replace(/\//g, "-")}`;

// ─── Vincular el reporte con los usuarios ─────────────────────────────────────

type UsuarioVinculable = Pick<UserProfile, "uid" | "nombre" | "codigoMarcacion">;

export interface Vinculacion {
  vinculados: { empleado: EmpleadoInconsistenciasMarcacion; uid: string; usuarioNombre: string }[];
  /** En el reporte pero ningún usuario tiene ese código: no lo verán. */
  sinUsuario: EmpleadoInconsistenciasMarcacion[];
  /** Dos o más usuarios con el mismo código: no se publica a ninguno hasta corregirlo. */
  duplicados: { empleado: EmpleadoInconsistenciasMarcacion; usuarios: string[] }[];
}

export function vincularConUsuarios(
  reporte: Pick<ReporteInconsistenciasMarcacion, "empleados">,
  usuarios: UsuarioVinculable[],
): Vinculacion {
  const porCodigo = new Map<string, UsuarioVinculable[]>();
  for (const u of usuarios) {
    const c = normalizarCodigoMarcacion(u.codigoMarcacion);
    if (!c) continue;
    porCodigo.set(c, [...(porCodigo.get(c) ?? []), u]);
  }
  const r: Vinculacion = { vinculados: [], sinUsuario: [], duplicados: [] };
  for (const empleado of reporte.empleados) {
    const candidatos = porCodigo.get(normalizarCodigoMarcacion(empleado.codigoMarcacion)) ?? [];
    if (candidatos.length === 1) {
      r.vinculados.push({ empleado, uid: candidatos[0].uid, usuarioNombre: candidatos[0].nombre });
    } else if (candidatos.length === 0) {
      r.sinUsuario.push(empleado);
    } else {
      r.duplicados.push({ empleado, usuarios: candidatos.map((u) => u.nombre) });
    }
  }
  return r;
}

export async function cargarUsuariosConCodigo(): Promise<UsuarioVinculable[]> {
  const snap = await getDocs(query(collection(db, "usuarios"), where("role", "in", [...ROLES_CON_CODIGO])));
  return snap.docs.map((d) => {
    const u = d.data() as Partial<UserProfile>;
    return { uid: d.id, nombre: u.nombre ?? "", codigoMarcacion: u.codigoMarcacion };
  });
}

// ─── Publicar / retirar ───────────────────────────────────────────────────────

/** Agrega al lote el borrado de todas las copias del mes (las que haya). */
export async function borrarCopiasDelMes(batch: WriteBatch, periodo: string, conservar: Set<string> = new Set()) {
  const snap = await getDocs(query(collection(db, COLECCION_INCONSISTENCIAS_PERSONAL), where("periodo", "==", periodo)));
  for (const d of snap.docs) if (!conservar.has(d.id)) batch.delete(d.ref);
}

export async function publicarAlPersonal(
  reporte: ReporteInconsistenciasMarcacion,
  vinculacion: Vinculacion,
  autor: Pick<UserProfile, "uid" | "nombre">,
) {
  const batch = writeBatch(db);
  const ids = new Set<string>();
  for (const { empleado, uid } of vinculacion.vinculados) {
    const id = idCopiaPersonal(reporte.periodo, empleado.codigoMarcacion);
    ids.add(id);
    batch.set(doc(db, COLECCION_INCONSISTENCIAS_PERSONAL, id), {
      ...empleado,
      periodo: reporte.periodo,
      anio: reporte.anio,
      mes: reporte.mes,
      unidad: reporte.unidad,
      fechaImpresion: reporte.fechaImpresion,
      empleadoId: uid,
      publicadoEn: serverTimestamp(),
    });
  }
  // Al volver a publicar, se van las copias de quien ya no corresponde.
  await borrarCopiasDelMes(batch, reporte.periodo, ids);
  batch.update(doc(db, COLECCION_INCONSISTENCIAS, reporte.periodo), {
    publicacion: {
      publicadoEn: serverTimestamp(),
      publicadoPorId: autor.uid,
      publicadoPorNombre: autor.nombre,
      personas: vinculacion.vinculados.length,
      sinVincular: [...vinculacion.sinUsuario, ...vinculacion.duplicados.map((d) => d.empleado)].map((e) => e.codigoMarcacion),
    },
  });
  await batch.commit();
}

export async function retirarPublicacion(periodo: string) {
  const batch = writeBatch(db);
  await borrarCopiasDelMes(batch, periodo);
  batch.update(doc(db, COLECCION_INCONSISTENCIAS, periodo), { publicacion: deleteField() });
  await batch.commit();
}

// ─── Cruce con el plan de trabajo ─────────────────────────────────────────────

export interface ContextoPlanDia {
  /** Lo que decía el plan: "MA2 · 7:00 am – 3:00 pm", "Vacaciones", "Descanso". */
  plan: string;
  /** Si el plan sugiere que el descuento podría reclamarse, por qué (lo leen el empleado y quien revisa). */
  motivo: string | null;
}

const aMin = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Qué decía el plan de la persona el día en que inicia el turno descontado.
 * Señala como posible reclamo: marca especial (VAC, INC, PER, ASU, LIC, MAT),
 * descanso, permiso parcial aprobado u horario del reloj distinto al del plan.
 */
export function contextoPlanDia(fila: FilaPlanTrabajo | undefined, d: Pick<DiaInconsistenciaMarcacion, "fecha" | "horario">): ContextoPlanDia | null {
  if (!fila) return null;
  const dia = Number(d.fecha.slice(8, 10));
  const celda = (fila.asignaciones[dia - 1] ?? "").trim();
  if (esMarcaEspecial(celda)) {
    const label = labelMarca(celda);
    return { plan: label, motivo: `El plan marca ${label.toLowerCase()} ese día` };
  }
  if (!celda) return { plan: "Descanso", motivo: "El plan no asignaba turno ese día" };

  const h = getHorario(celda);
  const plan = h ? `${h.codigo} · ${h.entrada} – ${h.salida}` : celda;
  const permiso = permisoDelDia(fila, dia);
  if (permiso) return { plan, motivo: `Había un permiso aprobado de ${permiso.horas} h ese día` };

  // Horario con el que midió el reloj vs. el del plan.
  const [ini, fin] = d.horario.split("-").map((s) => s.trim());
  const entradaPlan = h ? minutosDeEtiqueta(h.entrada) : null;
  const salidaPlan = h ? minutosDeEtiqueta(h.salida) : null;
  if (ini && fin && entradaPlan != null && salidaPlan != null && (aMin(ini) !== entradaPlan || aMin(fin) % 1440 !== salidaPlan % 1440)) {
    return { plan, motivo: `El reloj midió con ${d.horario} y el plan decía ${h!.entrada} – ${h!.salida}` };
  }
  return { plan, motivo: null };
}

/** Lo que se copia al trámite por cada día reclamado. */
export function diaReclamado(d: DiaInconsistenciaMarcacion, contexto: ContextoPlanDia | null): DiaReclamadoMarcacion {
  return {
    fecha: d.fecha,
    horario: d.horario,
    incidencia: etiquetaIncidencia(d),
    monto: d.monto,
    plan: contexto?.plan ?? null,
    motivo: contexto?.motivo ?? null,
  };
}
