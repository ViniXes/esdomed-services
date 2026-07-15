// Operaciones del módulo Convenio ISBM contra Supabase (PostgreSQL).
// Todas corren client-side con el token de Firebase; las políticas RLS
// garantizan que solo usuarios con claim isbm_rol acceden. Las escrituras
// sensibles al dinero (cierre/reapertura del día) son funciones RPC de
// Postgres para que sean atómicas — el cliente nunca calcula totales.

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getSupabase } from "./supabase";
import type {
  AfiliacionIsbm,
  ArancelIsbm,
  CensoDiarioConRelaciones,
  IngresoIsbm,
  ServicioHospitalarioIsbm,
} from "./types";

// Embeds del censo: dos FKs a servicios_hospitalarios se desambiguan por columna.
const CENSO_SELECT =
  "*, ingreso:ingresos(*), servicio_fisico:servicios_hospitalarios!servicio_fisico_id(*), servicio_facturacion:servicios_hospitalarios!servicio_facturacion_id(*)";

function lanzar(contexto: string, error: { message: string } | null): void {
  if (error) throw new Error(`${contexto}: ${error.message}`);
}

// ── Catálogos ────────────────────────────────────────────────────────────────

let serviciosCache: ServicioHospitalarioIsbm[] | null = null;

export async function listarServicios(): Promise<ServicioHospitalarioIsbm[]> {
  if (serviciosCache) return serviciosCache;
  const { data, error } = await getSupabase()
    .from("servicios_hospitalarios")
    .select("*")
    .eq("activo", true)
    .order("id");
  lanzar("Error cargando servicios", error);
  serviciosCache = data ?? [];
  return serviciosCache;
}

export async function buscarAranceles(termino: string, rubro?: string): Promise<ArancelIsbm[]> {
  let q = getSupabase()
    .from("aranceles")
    .select("*")
    .eq("activo", true)
    .is("vigente_hasta", null)
    .limit(40);
  if (rubro) q = q.eq("rubro", rubro);
  if (termino.trim()) q = q.ilike("descripcion", `%${termino.trim()}%`);
  const { data, error } = await q.order("descripcion");
  lanzar("Error buscando aranceles", error);
  return data ?? [];
}

// ── Afiliaciones ─────────────────────────────────────────────────────────────

export async function listarAfiliaciones(): Promise<AfiliacionIsbm[]> {
  const { data, error } = await getSupabase()
    .from("afiliaciones")
    .select("*")
    .order("created_at", { ascending: false });
  lanzar("Error cargando afiliaciones", error);
  return data ?? [];
}

// Paciente ACTIVO de la plataforma ESDOMED (Firestore) candidato a afiliarse.
export interface PacienteActivoEsdomed {
  id: string; // doc id en pacientes/{id} — será el id del ingreso ISBM
  expediente: string;
  nombre: string; // "apellidos, nombres"
  genero: "masculino" | "femenino" | "otro";
  fechaNacimiento: Date | null;
  dui: string | null;
  fechaIngreso: Date;
  servicioActual: string;
  camaActual: string | null;
  medicoNombre: string | null;
}

// Lee los pacientes activos de ESDOMED para el buscador de afiliación.
// Solo LECTURA de Firestore — el módulo ISBM nunca escribe en el padrón.
export async function listarPacientesActivosEsdomed(): Promise<PacienteActivoEsdomed[]> {
  const snap = await getDocs(
    query(collection(db, "pacientes"), where("estado", "==", "activo"))
  );
  return snap.docs.map((d) => {
    const p = d.data();
    return {
      id: d.id,
      expediente: (p.expediente as string) ?? "",
      nombre: `${p.apellidos ?? ""}, ${p.nombres ?? ""}`.replace(/^, /, ""),
      genero: (p.genero as PacienteActivoEsdomed["genero"]) ?? "otro",
      fechaNacimiento: p.fechaNacimiento?.toDate?.() ?? null,
      dui: (p.dui as string) ?? null,
      fechaIngreso: p.fechaIngreso?.toDate?.() ?? new Date(),
      servicioActual: (p.servicioActual as string) ?? "",
      camaActual: (p.camaActual as string) ?? null,
      medicoNombre: (p.medicoIngresoNombre as string) ?? null,
    };
  });
}

// Fecha local (El Salvador) → "YYYY-MM-DD". No usar toISOString: convierte a
// UTC y corre un día las fechas con hora nocturna.
const aFechaSql = (d: Date | null) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : null;

export const hoyISO = () => aFechaSql(new Date()) as string;

// Afilia a un paciente activo: upsert de la afiliación (por expediente) +
// alta del ingreso ISBM (id = doc id del ingreso ESDOMED). Idempotente.
export async function afiliarPaciente(
  p: PacienteActivoEsdomed,
  datos: {
    numeroAfiliacion?: string;
    tipoBeneficiario?: string;
    observaciones?: string;
  },
  actor: { uid: string; nombre: string }
): Promise<void> {
  const sb = getSupabase();

  const { error: errAf } = await sb.from("afiliaciones").upsert(
    {
      expediente: p.expediente,
      paciente_nombre: p.nombre,
      fecha_nacimiento: aFechaSql(p.fechaNacimiento),
      genero: p.genero,
      dui: p.dui,
      numero_afiliacion_isbm: datos.numeroAfiliacion?.trim() || null,
      tipo_beneficiario: datos.tipoBeneficiario || null,
      observaciones: datos.observaciones?.trim() || null,
      activo: true,
      creado_por_uid: actor.uid,
      creado_por_nombre: actor.nombre,
      actualizado_por_nombre: actor.nombre,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "expediente" }
  );
  lanzar("Error guardando afiliación", errAf);

  const { error: errIng } = await sb.from("ingresos").upsert(
    {
      id: p.id,
      expediente: p.expediente,
      paciente_nombre: p.nombre,
      fecha_ingreso: aFechaSql(p.fechaIngreso),
      servicio_actual: p.servicioActual,
      cama_actual: p.camaActual,
      medico_tratante_nombre: p.medicoNombre,
      creado_por_uid: actor.uid,
      creado_por_nombre: actor.nombre,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
  lanzar("Error creando el ingreso ISBM", errIng);
}

export async function actualizarAfiliacion(
  expediente: string,
  datos: Partial<Pick<AfiliacionIsbm, "numero_afiliacion_isbm" | "tipo_beneficiario" | "observaciones" | "activo">>,
  actorNombre: string
): Promise<void> {
  const { error } = await getSupabase()
    .from("afiliaciones")
    .update({ ...datos, actualizado_por_nombre: actorNombre, updated_at: new Date().toISOString() })
    .eq("expediente", expediente);
  lanzar("Error actualizando afiliación", error);
}

// ── Ingresos ─────────────────────────────────────────────────────────────────

export async function listarIngresosActivos(): Promise<IngresoIsbm[]> {
  const { data, error } = await getSupabase()
    .from("ingresos")
    .select("*")
    .eq("condicion_egreso", "PENDIENTE")
    .order("fecha_ingreso");
  lanzar("Error cargando ingresos", error);
  return data ?? [];
}

// Registra el egreso de la cobertura ISBM (cuando el paciente egresa en la
// plataforma). No borra nada: los censos y cargos quedan para facturación.
export async function registrarEgresoIngreso(
  ingresoId: string,
  fechaEgreso: string, // "YYYY-MM-DD"
  condicion: "MEJORADO" | "FALLECIDO" | "TRASLADO" | "ALTA_VOLUNTARIA"
): Promise<void> {
  const { error } = await getSupabase()
    .from("ingresos")
    .update({
      fecha_egreso: fechaEgreso,
      condicion_egreso: condicion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ingresoId);
  lanzar("Error registrando egreso", error);
}

// ── Censo diario ─────────────────────────────────────────────────────────────

export async function censosDeFecha(fecha: string): Promise<CensoDiarioConRelaciones[]> {
  const { data, error } = await getSupabase()
    .from("censo_diario")
    .select(CENSO_SELECT)
    .eq("fecha", fecha)
    .order("id");
  lanzar("Error cargando el censo", error);
  return (data ?? []) as unknown as CensoDiarioConRelaciones[];
}

export async function censosDeIngreso(ingresoId: string): Promise<CensoDiarioConRelaciones[]> {
  const { data, error } = await getSupabase()
    .from("censo_diario")
    .select(CENSO_SELECT)
    .eq("ingreso_id", ingresoId)
    .order("fecha");
  lanzar("Error cargando censos del ingreso", error);
  return (data ?? []) as unknown as CensoDiarioConRelaciones[];
}

// "Abrir día" idempotente: crea el censo de la fecha para todo ingreso ISBM
// activo que aún no lo tenga. Hereda servicios/cama/médico del censo del día
// anterior si existe; si no, arranca en Hospitalización General (HOSPI).
// El UNIQUE (ingreso_id, fecha) + ignoreDuplicates hace imposible duplicar.
export async function abrirDia(
  fecha: string,
  actor: { uid: string; nombre: string }
): Promise<number> {
  const sb = getSupabase();
  const [activos, existentes, servicios] = await Promise.all([
    listarIngresosActivos(),
    sb.from("censo_diario").select("ingreso_id").eq("fecha", fecha),
    listarServicios(),
  ]);
  lanzar("Error consultando censos existentes", existentes.error);

  // Sin censos para ingresos que empezaron después de la fecha o ya egresaron antes.
  const cubiertos = new Set((existentes.data ?? []).map((c) => c.ingreso_id));
  const pendientes = activos.filter(
    (i) => !cubiertos.has(i.id) && i.fecha_ingreso <= fecha
  );
  if (!pendientes.length) return 0;

  const hospi = servicios.find((s) => s.codigo === "HOSPI");
  if (!hospi) throw new Error("No se encontró el servicio HOSPI en el catálogo");

  const ayer = new Date(`${fecha}T12:00:00`);
  ayer.setDate(ayer.getDate() - 1);
  const fechaAyer = ayer.toISOString().slice(0, 10);
  const { data: censosAyer } = await sb
    .from("censo_diario")
    .select("ingreso_id, servicio_fisico_id, servicio_facturacion_id, cama, medico_tratante_nombre")
    .eq("fecha", fechaAyer);
  const porIngresoAyer = new Map((censosAyer ?? []).map((c) => [c.ingreso_id, c]));

  const filas = pendientes.map((ing) => {
    const previo = porIngresoAyer.get(ing.id);
    return {
      ingreso_id: ing.id,
      expediente: ing.expediente,
      fecha,
      servicio_fisico_id: previo?.servicio_fisico_id ?? hospi.id,
      servicio_facturacion_id: previo?.servicio_facturacion_id ?? hospi.id,
      cama: previo?.cama ?? ing.cama_actual,
      medico_tratante_nombre: previo?.medico_tratante_nombre ?? ing.medico_tratante_nombre,
      registrado_por_uid: actor.uid,
      registrado_por_nombre: actor.nombre,
    };
  });

  const { error } = await sb
    .from("censo_diario")
    .upsert(filas, { onConflict: "ingreso_id,fecha", ignoreDuplicates: true });
  lanzar("Error abriendo el día", error);
  return filas.length;
}

export async function registrarVisita(
  censoId: number,
  turno: "am" | "pm",
  medico: string,
  hora: string // "HH:MM"
): Promise<void> {
  const campos =
    turno === "am"
      ? { visita_am_registrada: true, visita_am_medico: medico, visita_am_hora: hora }
      : { visita_pm_registrada: true, visita_pm_medico: medico, visita_pm_hora: hora };
  const { error } = await getSupabase()
    .from("censo_diario")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("id", censoId)
    .eq("dia_cerrado", false);
  lanzar("Error registrando la visita", error);
}

export async function actualizarServiciosCenso(
  censoId: number,
  datos: {
    servicio_fisico_id: number;
    servicio_facturacion_id: number;
    motivo_diferencia_servicio: string | null;
    cama: string | null;
    medico_tratante_nombre: string | null;
  }
): Promise<void> {
  const { error } = await getSupabase()
    .from("censo_diario")
    .update({ ...datos, updated_at: new Date().toISOString() })
    .eq("id", censoId)
    .eq("dia_cerrado", false);
  lanzar("Error actualizando el censo", error);
}

// Cierre / reapertura — RPCs atómicas en Postgres (supabase/isbm_rpc.sql).
// El cierre genera el cargo día-cama del servicio de facturación y congela
// el snapshot de totales del día. Reabrir permite corregir y volver a cerrar.

export async function cerrarDia(censoId: number, actorNombre: string): Promise<void> {
  const { error } = await getSupabase().rpc("cerrar_dia_censo", {
    p_censo_id: censoId,
    p_nombre: actorNombre,
  });
  lanzar("Error cerrando el día", error);
}

export async function reabrirDia(censoId: number, actorNombre: string): Promise<void> {
  const { error } = await getSupabase().rpc("reabrir_dia_censo", {
    p_censo_id: censoId,
    p_nombre: actorNombre,
  });
  lanzar("Error reabriendo el día", error);
}
