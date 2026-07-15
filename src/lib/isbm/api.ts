// Operaciones del módulo Convenio ISBM contra Supabase (PostgreSQL).
// Todas corren client-side con el token de Firebase; las políticas RLS
// garantizan que solo usuarios con claim isbm_rol acceden. Las escrituras
// sensibles al dinero (cierre/reapertura del día) son funciones RPC de
// Postgres para que sean atómicas — el cliente nunca calcula totales.

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getSupabase } from "./supabase";
import {
  RUBROS_EXAMENES,
  RUBROS_INTERCONSULTA,
  type AfiliacionIsbm,
  type ArancelIsbm,
  type AutorizacionConCargo,
  type CargoConArancel,
  type CargoListado,
  type CensoDiarioConRelaciones,
  type IngresoIsbm,
  type ServicioHospitalarioIsbm,
  type TabuladorRow,
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

// Catálogo completo para la administración de aranceles (incluye inactivos
// y versiones no vigentes si se pide). El "borrado" es desactivar: los cargos
// históricos referencian el arancel y nunca se elimina físicamente.
export async function listarArancelesCatalogo(incluirInactivos: boolean): Promise<ArancelIsbm[]> {
  let q = getSupabase().from("aranceles").select("*").limit(2000);
  if (!incluirInactivos) q = q.eq("activo", true);
  const { data, error } = await q.order("rubro").order("descripcion");
  lanzar("Error cargando el catálogo de aranceles", error);
  return data ?? [];
}

export interface DatosArancel {
  codigo: string;
  rubro: string;
  descripcion: string;
  precio_hnes: number;
  es_cuadro_basico: boolean;
  es_bolson: boolean;
  es_controlado: boolean;
  requiere_autorizacion: boolean;
  monto_umbral_supervisor: number | null;
  monto_umbral_gerente: number | null;
  vigente_desde: string; // "YYYY-MM-DD"
}

export async function crearArancel(d: DatosArancel): Promise<void> {
  const { error } = await getSupabase().from("aranceles").insert(d);
  lanzar("Error creando el arancel", error);
}

export async function editarArancel(id: number, d: Partial<DatosArancel>): Promise<void> {
  const { error } = await getSupabase().from("aranceles").update(d).eq("id", id);
  lanzar("Error editando el arancel", error);
}

export async function setArancelActivo(id: number, activo: boolean): Promise<void> {
  const { error } = await getSupabase().from("aranceles").update({ activo }).eq("id", id);
  lanzar(activo ? "Error reactivando el arancel" : "Error desactivando el arancel", error);
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
// Médicos del sistema (rol "medico", incluye UCI/UCIN por tipoMedico) para
// los selectores de médico tratante y visitas del censo. Solo lectura.
export interface MedicoSistema {
  nombre: string;
  tipoMedico?: string; // "uci" | "ucin" | "uci_ucin" — ausente = médico general
}

let medicosCache: MedicoSistema[] | null = null;

export async function listarMedicos(): Promise<MedicoSistema[]> {
  if (medicosCache) return medicosCache;
  const snap = await getDocs(
    query(collection(db, "usuarios"), where("role", "==", "medico"))
  );
  medicosCache = snap.docs
    .map((d) => {
      const u = d.data();
      return { nombre: (u.nombre as string) ?? "", tipoMedico: u.tipoMedico as string | undefined };
    })
    .filter((m) => m.nombre)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return medicosCache;
}

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

// Mapeo del servicio de ESDOMED (texto libre) → servicio de facturación del
// convenio. Regla confirmada por ESDOMED (2026-07-15): solo existen 3 tipos BM:
//   · "Bienestar Magisterial"            → Hospitalización General (HOSPI)
//   · todo lo que diga "Intermedios"     → Cuidados Intermedios (INTERM)
//   · todo lo que diga "Intensivos"      → UCI (el convenio distingue además
//     UCI_ECMO, pero esa la decide el técnico en el censo: ESDOMED no la separa)
// "Paliativos" se mapea de bonus; CRONICOS es reclasificación por estancia
// (>90 días), no un servicio físico de ESDOMED.
export function mapearServicioEsdomed(
  nombre: string | null | undefined,
  servicios: ServicioHospitalarioIsbm[]
): ServicioHospitalarioIsbm {
  const n = (nombre ?? "").toLowerCase();
  const codigo = n.includes("intermedi")
    ? "INTERM"
    : n.includes("intensiv") || n.includes("uci")
      ? "UCI"
      : n.includes("paliativ")
        ? "PALIT"
        : "HOSPI";
  const servicio =
    servicios.find((s) => s.codigo === codigo) ?? servicios.find((s) => s.codigo === "HOSPI");
  if (!servicio) throw new Error("Catálogo de servicios ISBM incompleto (falta HOSPI)");
  return servicio;
}

// "Abrir día" idempotente: crea el censo de la fecha para todo ingreso ISBM
// activo que aún no lo tenga. Hereda servicios/cama/médico del censo del día
// anterior si existe; si no, arranca en el servicio mapeado desde el servicio
// actual de ESDOMED (regla de los 3 tipos BM, ver mapearServicioEsdomed).
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
    // Primer día sin censo previo: el servicio sale del servicio actual de
    // ESDOMED mapeado a los 3 tipos BM (los días siguientes heredan del anterior).
    const mapeado = mapearServicioEsdomed(ing.servicio_actual, servicios);
    return {
      ingreso_id: ing.id,
      expediente: ing.expediente,
      fecha,
      servicio_fisico_id: previo?.servicio_fisico_id ?? mapeado.id,
      servicio_facturacion_id: previo?.servicio_facturacion_id ?? mapeado.id,
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

// ── Cargos ───────────────────────────────────────────────────────────────────

const redondear2 = (n: number) => Math.round(n * 100) / 100;

const restarDias = (fechaISO: string, dias: number) => {
  const d = new Date(`${fechaISO}T12:00:00`);
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
};

export async function cargosDeCenso(censoId: number): Promise<CargoConArancel[]> {
  const { data, error } = await getSupabase()
    .from("cargos_paciente_dia")
    .select("*, arancel:aranceles(*)")
    .eq("censo_id", censoId)
    .order("capturado_en");
  lanzar("Error cargando cargos del día", error);
  return (data ?? []) as unknown as CargoConArancel[];
}

export interface FiltrosCargos {
  anio: number;
  mes: number; // 1-12; 0 = todo el año
  rubro?: string;
  anulado?: boolean;
}

export async function listarCargos(f: FiltrosCargos): Promise<CargoListado[]> {
  const desde = f.mes ? `${f.anio}-${String(f.mes).padStart(2, "0")}-01` : `${f.anio}-01-01`;
  const hasta = f.mes
    ? new Date(f.anio, f.mes, 0).toISOString().slice(0, 10) // último día del mes
    : `${f.anio}-12-31`;
  let q = getSupabase()
    .from("cargos_paciente_dia")
    .select("*, arancel:aranceles(*), afiliacion:afiliaciones(paciente_nombre)")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  if (f.anulado !== undefined) q = q.eq("anulado", f.anulado);
  const { data, error } = await q.order("fecha", { ascending: false }).order("capturado_en", { ascending: false });
  lanzar("Error cargando cargos", error);
  const filas = (data ?? []) as unknown as CargoListado[];
  return f.rubro ? filas.filter((c) => c.arancel.rubro === f.rubro) : filas;
}

export interface NuevoCargoInput {
  cantidad: number;
  precioUnitario?: number; // default: precio del arancel
  comentarios?: string;
  tipoCirugia?: "AMBULATORIA" | "EMERGENCIA" | "ELECTIVA";
  especialidadInterconsulta?: string;
  tipoDocumentoRespaldo?: string;
  documentoRespaldoRef?: string;
  // "Observado" del Excel: el servicio se indicó pero aún no se confirma que
  // se realizó (ej. cultivos). Se confirma días después desde el detalle.
  pendienteRevision?: boolean;
}

const TIPO_AUTORIZACION_POR_RUBRO: Record<string, string> = {
  QUIRURGICO: "PAQUETE_QUIRURGICO",
  MEDICAMENTOS_CUADRO: "MEDICAMENTO",
  MEDICAMENTOS_ADICIONALES: "MEDICAMENTO",
  OTROS: "INTERCONSULTA",
  MISCELANEOS: "INTERCONSULTA",
  LABORATORIO_BASICO: "LABORATORIO_RADIOLOGIA",
  LABORATORIO_ADICIONAL: "LABORATORIO_RADIOLOGIA",
  LABORATORIO_BIOLOGIA_MOLECULAR: "LABORATORIO_RADIOLOGIA",
  RX_BASICO: "LABORATORIO_RADIOLOGIA",
  ESTUDIOS_NEUROFISIOLOGICOS: "LABORATORIO_RADIOLOGIA",
  BANCO_SANGRE: "LABORATORIO_RADIOLOGIA",
};

// Captura un cargo. Las validaciones aquí (tope diario, 48 h) son UX: avisan
// y ajustan el monto para que el técnico lo vea de inmediato. El recálculo
// AUTORITATIVO ocurre al cerrar el día (RPC cerrar_dia_censo).
// Devuelve los avisos generados (montos ajustados, autorización creada).
export async function crearCargo(
  censo: CensoDiarioConRelaciones,
  arancel: ArancelIsbm,
  input: NuevoCargoInput,
  actor: { uid: string; nombre: string }
): Promise<string[]> {
  if (censo.dia_cerrado) throw new Error("El día está cerrado: reábrelo para capturar cargos");
  const sb = getSupabase();
  const avisos: string[] = [];

  const precio = redondear2(input.precioUnitario ?? arancel.precio_hnes);
  const costo = redondear2(input.cantidad * precio);
  let facturable = costo;
  let motivo: string | null = null;

  // Tope diario de exámenes del servicio de facturación
  if (RUBROS_EXAMENES.includes(arancel.rubro)) {
    const delDia = await cargosDeCenso(censo.id);
    const consumido = delDia
      .filter((c) => !c.anulado && RUBROS_EXAMENES.includes(c.arancel.rubro))
      .reduce((s, c) => s + c.monto_facturable, 0);
    const disponible = redondear2(censo.servicio_facturacion.tope_diario_examenes - consumido);
    if (disponible <= 0) {
      facturable = 0;
      motivo = "EXCEDE_TOPE_DIARIO_RUBRO";
      avisos.push("Tope diario de exámenes agotado: el cargo queda NO facturable.");
    } else if (costo > disponible) {
      facturable = disponible;
      motivo = "EXCEDE_TOPE_DIARIO_RUBRO";
      avisos.push(`Solo ${disponible.toFixed(2)} del tope diario disponible: el excedente no se factura.`);
    }
  }

  // Regla 48 h: interconsulta repetida de la misma especialidad
  if (
    RUBROS_INTERCONSULTA.includes(arancel.rubro) &&
    input.especialidadInterconsulta
  ) {
    const { data: previos, error: errPrev } = await sb
      .from("cargos_paciente_dia")
      .select("id, fecha, arancel:aranceles(rubro)")
      .eq("ingreso_id", censo.ingreso_id)
      .eq("especialidad_interconsulta", input.especialidadInterconsulta)
      .eq("anulado", false)
      .gte("fecha", restarDias(censo.fecha, 2))
      .lte("fecha", censo.fecha);
    lanzar("Error validando regla de 48 h", errPrev);
    const hayPrevia = (previos ?? []).some((p) => {
      const rubro = (p as unknown as { arancel: { rubro: string } }).arancel?.rubro;
      return rubro && RUBROS_INTERCONSULTA.includes(rubro as (typeof RUBROS_INTERCONSULTA)[number]);
    });
    if (hayPrevia) {
      facturable = 0;
      motivo = "INTERCONSULTA_DENTRO_48H";
      avisos.push("Ya hay una interconsulta de esa especialidad en las últimas 48 h: NO facturable.");
    }
  }

  const { data: creado, error } = await sb
    .from("cargos_paciente_dia")
    .insert({
      censo_id: censo.id,
      ingreso_id: censo.ingreso_id,
      expediente: censo.expediente,
      fecha: censo.fecha,
      arancel_id: arancel.id,
      cantidad: input.cantidad,
      precio_unitario: precio,
      costo_total: costo,
      monto_facturable: facturable,
      motivo_no_facturable: motivo,
      comentarios: input.comentarios?.trim() || null,
      tipo_cirugia: input.tipoCirugia ?? null,
      especialidad_interconsulta: input.especialidadInterconsulta ?? null,
      tipo_documento_respaldo: input.tipoDocumentoRespaldo || null,
      documento_respaldo_ref: input.documentoRespaldoRef?.trim() || null,
      pendiente_revision: input.pendienteRevision ?? false,
      capturado_por_uid: actor.uid,
      capturado_por_nombre: actor.nombre,
    })
    .select("id")
    .single();
  lanzar("Error creando el cargo", error);

  // Autorización automática cuando el arancel la requiere
  if (arancel.requiere_autorizacion && creado) {
    const umbral = arancel.monto_umbral_supervisor;
    const nivel = umbral != null && costo > umbral ? "JEFE" : "SUPERVISOR";
    const { error: errAut } = await sb.from("autorizaciones_servicio").insert({
      cargo_id: creado.id,
      tipo: TIPO_AUTORIZACION_POR_RUBRO[arancel.rubro] ?? "OTRO",
      nivel_requerido: nivel,
      monto_solicitado: costo,
      solicitado_por_uid: actor.uid,
      solicitado_por_nombre: actor.nombre,
    });
    lanzar("Error creando la autorización", errAut);
    avisos.push(`Requiere autorización (${nivel === "JEFE" ? "Jefe" : "Supervisor"} ISBM): el día no podrá cerrarse hasta resolverla.`);
  }

  return avisos;
}

export async function obtenerAutorizacionDeCargo(cargoId: number) {
  const { data, error } = await getSupabase()
    .from("autorizaciones_servicio")
    .select("*")
    .eq("cargo_id", cargoId)
    .maybeSingle();
  lanzar("Error consultando la autorización del cargo", error);
  return data as import("./types").AutorizacionIsbm | null;
}

export interface EdicionCargo {
  cantidad: number;
  precioUnitario: number;
  comentarios?: string;
  tipoDocumentoRespaldo?: string;
  documentoRespaldoRef?: string;
  pendienteRevision: boolean; // permite marcar/quitar la observación al editar
}

// Edita cantidad/precio/documentación de un cargo (día abierto, no anulado).
// Recalcula costo y facturable; el override manual DECISION_ISBM se conserva.
// Si el cargo tiene autorización PENDIENTE se actualiza su monto/nivel; si ya
// fue resuelta, los montos no se tocan (habría que anular y recapturar).
export async function editarCargo(
  cargo: CargoConArancel,
  ed: EdicionCargo,
  actorNombre: string
): Promise<void> {
  if (cargo.anulado) throw new Error("El cargo está anulado");
  const precio = redondear2(ed.precioUnitario);
  const costo = redondear2(ed.cantidad * precio);
  if (!ed.cantidad || ed.cantidad <= 0 || precio < 0) {
    throw new Error("Cantidad y precio deben ser válidos");
  }

  const aut = await obtenerAutorizacionDeCargo(cargo.id);
  const cambiaMonto = costo !== cargo.costo_total;
  if (aut && aut.estado !== "PENDIENTE" && cambiaMonto) {
    throw new Error("La autorización de este cargo ya fue resuelta: no se puede cambiar el monto (anúlalo y captúralo de nuevo)");
  }

  const esOverride = cargo.motivo_no_facturable === "DECISION_ISBM";
  const { error } = await getSupabase()
    .from("cargos_paciente_dia")
    .update({
      cantidad: ed.cantidad,
      precio_unitario: precio,
      costo_total: costo,
      monto_facturable: esOverride ? 0 : costo, // el cierre reaplica las demás reglas
      motivo_no_facturable: esOverride ? "DECISION_ISBM" : null,
      comentarios: ed.comentarios?.trim() || null,
      tipo_documento_respaldo: ed.tipoDocumentoRespaldo || null,
      documento_respaldo_ref: ed.documentoRespaldoRef?.trim() || null,
      pendiente_revision: ed.pendienteRevision,
      modificado_por_nombre: actorNombre,
      modificado_en: new Date().toISOString(),
    })
    .eq("id", cargo.id);
  lanzar("Error editando el cargo", error);

  if (aut && aut.estado === "PENDIENTE" && cambiaMonto) {
    const umbral = cargo.arancel.monto_umbral_supervisor;
    const { error: errAut } = await getSupabase()
      .from("autorizaciones_servicio")
      .update({
        monto_solicitado: costo,
        nivel_requerido: umbral != null && costo > umbral ? "JEFE" : "SUPERVISOR",
      })
      .eq("id", aut.id);
    lanzar("Error actualizando la autorización", errAut);
  }
}

// Override manual: fuerza un cargo cobrable a NO cobrable (con justificación
// de auditoría). El recálculo del cierre respeta este override siempre.
export async function marcarNoCobrable(
  cargoId: number,
  justificacion: string,
  actorNombre: string
): Promise<void> {
  if (justificacion.trim().length < 10) {
    throw new Error("La justificación debe tener al menos 10 caracteres");
  }
  const { error } = await getSupabase()
    .from("cargos_paciente_dia")
    .update({
      monto_facturable: 0,
      motivo_no_facturable: "DECISION_ISBM",
      justificacion_no_facturable: justificacion.trim(),
      modificado_por_nombre: actorNombre,
      modificado_en: new Date().toISOString(),
    })
    .eq("id", cargoId);
  lanzar("Error marcando el cargo como no cobrable", error);
}

// Revierte el override: vuelve cobrable. Las reglas automáticas (tope, 48h,
// autorización) se reaplican de todas formas al cerrar el día.
export async function marcarCobrable(cargo: CargoConArancel, actorNombre: string): Promise<void> {
  const { error } = await getSupabase()
    .from("cargos_paciente_dia")
    .update({
      monto_facturable: cargo.costo_total,
      motivo_no_facturable: null,
      justificacion_no_facturable: null,
      modificado_por_nombre: actorNombre,
      modificado_en: new Date().toISOString(),
    })
    .eq("id", cargo.id);
  lanzar("Error marcando el cargo como cobrable", error);
}

// Confirma un cargo que estaba "en observación" (pendiente_revision): se
// verificó que el servicio SÍ se realizó. No toca montos, por eso se permite
// aunque el día ya esté cerrado. Si NO se realizó, el camino es reabrir el
// día y anular el cargo (eso sí recalcula totales).
export async function confirmarCargoObservado(cargoId: number, actorNombre: string): Promise<void> {
  const { error } = await getSupabase()
    .from("cargos_paciente_dia")
    .update({
      pendiente_revision: false,
      modificado_por_nombre: actorNombre,
      modificado_en: new Date().toISOString(),
    })
    .eq("id", cargoId)
    .eq("pendiente_revision", true);
  lanzar("Error confirmando el cargo", error);
}

// Anulación lógica: el cargo queda en cero pero visible para auditoría.
export async function anularCargo(cargoId: number, actorNombre: string): Promise<void> {
  const { error } = await getSupabase()
    .from("cargos_paciente_dia")
    .update({
      anulado: true,
      monto_facturable: 0,
      motivo_no_facturable: "ANULADO",
      modificado_por_nombre: actorNombre,
      modificado_en: new Date().toISOString(),
    })
    .eq("id", cargoId);
  lanzar("Error anulando el cargo", error);
}

// ── Autorizaciones ───────────────────────────────────────────────────────────

const AUTORIZACION_SELECT =
  "*, cargo:cargos_paciente_dia(*, arancel:aranceles(*), afiliacion:afiliaciones(paciente_nombre))";

export async function listarAutorizaciones(estado?: string): Promise<AutorizacionConCargo[]> {
  let q = getSupabase().from("autorizaciones_servicio").select(AUTORIZACION_SELECT);
  if (estado) q = q.eq("estado", estado);
  const { data, error } = await q.order("solicitado_en", { ascending: false });
  lanzar("Error cargando autorizaciones", error);
  return (data ?? []) as unknown as AutorizacionConCargo[];
}

export async function aprobarAutorizacion(
  id: number,
  actor: { uid: string; nombre: string; rol: string },
  comentario?: string
): Promise<void> {
  const { error } = await getSupabase()
    .from("autorizaciones_servicio")
    .update({
      estado: "APROBADA",
      resuelto_por_uid: actor.uid,
      resuelto_por_nombre: actor.nombre,
      resuelto_por_rol: actor.rol,
      resuelto_en: new Date().toISOString(),
      comentario: comentario?.trim() || null,
    })
    .eq("id", id)
    .eq("estado", "PENDIENTE");
  lanzar("Error aprobando la autorización", error);
}

export async function rechazarAutorizacion(
  aut: AutorizacionConCargo,
  comentario: string,
  actor: { uid: string; nombre: string; rol: string }
): Promise<void> {
  if (comentario.trim().length < 10) {
    throw new Error("El comentario del rechazo debe tener al menos 10 caracteres");
  }
  const sb = getSupabase();
  const { error } = await sb
    .from("autorizaciones_servicio")
    .update({
      estado: "RECHAZADA",
      resuelto_por_uid: actor.uid,
      resuelto_por_nombre: actor.nombre,
      resuelto_por_rol: actor.rol,
      resuelto_en: new Date().toISOString(),
      comentario: comentario.trim(),
    })
    .eq("id", aut.id)
    .eq("estado", "PENDIENTE");
  lanzar("Error rechazando la autorización", error);

  // El cargo queda no facturable de inmediato (el cierre lo confirma igual).
  const { error: errCargo } = await sb
    .from("cargos_paciente_dia")
    .update({
      monto_facturable: 0,
      motivo_no_facturable: "SIN_AUTORIZACION",
      modificado_por_nombre: actor.nombre,
      modificado_en: new Date().toISOString(),
    })
    .eq("id", aut.cargo_id);
  lanzar("Error actualizando el cargo rechazado", errCargo);
}

// ── Resumen por paciente (ficha estilo Excel del convenio) ──────────────────

export type IngresoConAfiliacion = IngresoIsbm & {
  afiliacion?: { numero_afiliacion_isbm: string | null } | null;
};

export async function obtenerIngreso(id: string): Promise<IngresoConAfiliacion | null> {
  const { data, error } = await getSupabase()
    .from("ingresos")
    .select("*, afiliacion:afiliaciones(numero_afiliacion_isbm)")
    .eq("id", id)
    .maybeSingle();
  lanzar("Error cargando el ingreso", error);
  return data as IngresoConAfiliacion | null;
}

export async function cargosDeIngreso(ingresoId: string): Promise<CargoConArancel[]> {
  const { data, error } = await getSupabase()
    .from("cargos_paciente_dia")
    .select("*, arancel:aranceles(*)")
    .eq("ingreso_id", ingresoId)
    .order("fecha")
    .order("capturado_en");
  lanzar("Error cargando los cargos del ingreso", error);
  return (data ?? []) as unknown as CargoConArancel[];
}

// ── Tabulador ────────────────────────────────────────────────────────────────

export async function consultarTabulador(): Promise<TabuladorRow[]> {
  const { data, error } = await getSupabase()
    .from("v_tabulador_ingresos")
    .select("*")
    .order("fecha_ingreso", { ascending: false });
  lanzar("Error consultando el tabulador", error);
  return (data ?? []) as TabuladorRow[];
}
