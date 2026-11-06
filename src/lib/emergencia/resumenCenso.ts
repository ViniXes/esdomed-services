// ─────────────────────────────────────────────────────────────────────────────
// Resumen mensual de los censos de emergencia: cálculo puro, sin Firestore.
//
// El tablero no lee los censos (unos 1,500 documentos al mes): lee un documento
// de contadores por mes y por censo. Cada registro aporta sus contadores con
// contribucion(); al editar se resta lo que aportaba y se suma lo nuevo
// (deltaResumen), y construirResumen() rehace un mes completo desde los censos.
//
// El tablero arranca en MES_INICIO_RESUMEN: lo anterior fueron pruebas, con
// otros campos, y no cuenta. Toda variable nueva del formulario se agrega aquí.
// ─────────────────────────────────────────────────────────────────────────────

import type { ConteosCenso, ResumenCensoMes, TipoCenso } from "@/types";

export const MES_INICIO_RESUMEN = "2026-11";
export const SIN_DATO = "sin_dato";
export const NO_APLICA = "no_aplica";
export const GRUPOS_EDAD = ["0-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60+"] as const;
export const FALLECE_EN_EMERGENCIA = "Fallece en emergencia";

const ZONA = "America/El_Salvador";

type Registro = Record<string, unknown>;
type Par = readonly [dimension: string, clave: string];

export interface Contribucion {
  mes: string;
  pares: Par[];
}

export type DeltaMes = Pick<ResumenCensoMes, "total" | "conteos">;

/** Día calendario en hora de El Salvador, "YYYY-MM-DD". */
export const diaDe = (fecha: Date) => fecha.toLocaleDateString("en-CA", { timeZone: ZONA });

/** Primer instante de un mes en hora de El Salvador (UTC-6, sin horario de verano). */
export const inicioDeMes = (mes: string) => new Date(`${mes}-01T00:00:00-06:00`);

export function mesSiguiente(mes: string): string {
  const [anio, m] = mes.split("-").map(Number);
  return m === 12 ? `${anio + 1}-01` : `${anio}-${String(m + 1).padStart(2, "0")}`;
}

export function mesAnterior(mes: string): string {
  const [anio, m] = mes.split("-").map(Number);
  return m === 1 ? `${anio - 1}-12` : `${anio}-${String(m - 1).padStart(2, "0")}`;
}

/** Meses desde MES_INICIO_RESUMEN hasta `hasta`, del más reciente al más antiguo. */
export function mesesDelTablero(hasta: string): string[] {
  const meses: string[] = [];
  for (let m = MES_INICIO_RESUMEN; m <= hasta; m = mesSiguiente(m)) meses.unshift(m);
  return meses;
}

function aFecha(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const posible = v as { toDate?: () => Date } | null | undefined;
  return typeof posible?.toDate === "function" ? posible.toDate() : null;
}

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const valorO = (v: unknown, otro = SIN_DATO) => texto(v) || otro;
const siNo = (v: unknown) => (v ? "si" : "no");
const lista = (v: unknown) =>
  Array.isArray(v) ? Array.from(new Set(v.map(texto).filter(Boolean))) : [];

function grupoEdad(edad: unknown): string {
  if (typeof edad !== "number" || !Number.isFinite(edad) || edad < 0) return SIN_DATO;
  return edad >= 60 ? "60+" : `${Math.floor(edad / 10) * 10}-${Math.floor(edad / 10) * 10 + 9}`;
}

function diagnosticos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const etiquetas = v.map((d: { codigo?: unknown; descripcion?: unknown }) =>
    [texto(d?.codigo), texto(d?.descripcion)].filter(Boolean).join(" · "));
  return Array.from(new Set(etiquetas.filter(Boolean)));
}

function paresComunes(r: Registro): Par[] {
  const genero = valorO(r.genero);
  const dx = diagnosticos(r.diagnosticos);
  const procedimientos = lista(r.procedimientosUE);
  const staff = texto(r.staffEvalua);
  return [
    ["estado", r.estadoRegistro === "cerrado" ? "cerrado" : "abierto"],
    ["turno", valorO(r.turno)],
    ["sexo", genero],
    ["edadSexo", `${grupoEdad(r.edad)}|${genero}`],
    ["evaluadoPor", valorO(r.evaluadoPor)],
    // Separados porque una persona se puede ocultar y una especialidad no.
    [r.evaluadoPor === "especialidad" ? "evaluaEspecialidad" : "evaluaPersona", staff || SIN_DATO],
    ["reevaluacion", valorO(r.reevaluacion, NO_APLICA)],
    ...lista(r.medicosGenerales).map((m): Par => ["medicosTurno", m]),
    ...(dx.length ? dx : [SIN_DATO]).map((d): Par => ["diagnostico", d]),
    ...(procedimientos.length ? procedimientos : ["ninguno"]).map((p): Par => ["procedimiento", p]),
    ...lista(r.camposFaltantes).map((c): Par => ["faltante", c]),
  ];
}

function paresDemanda(r: Registro): Par[] {
  const pares: Par[] = [
    ["triage", valorO(r.triage)],
    ["condicion", valorO(r.condicion)],
    ["especialidad", valorO(r.especialidad)],
    ["traeReferencia", siNo(r.traeReferencia)],
    ["destino", valorO(r.destino)],
    ["ventilacion", siNo(r.ventilacionMecanica)],
    ["consulta48h", siNo(r.consulta48h)],
    ["isss", siNo(r.aseguradoIsss)],
    ["empleadoHes", siNo(r.empleadoHes)],
  ];
  if (r.traeReferencia) pares.push(["lugarReferencia", valorO(r.lugarReferencia)]);
  if (r.destino === "ingreso") pares.push(["servicioIngresar", valorO(r.servicioIngresar)]);
  if (r.destino === "referencia") pares.push(["centroRefiere", valorO(r.centroRefiere)]);
  if (r.empleadoHes) pares.push(["dependencia", valorO(r.dependencia)]);
  return pares;
}

function paresReferido(r: Registro): Par[] {
  const pares: Par[] = [
    ["hospitalReferencia", valorO(r.hospitalReferencia)],
    ["clasificacionSis", valorO(r.clasificacionSis)],
    ["condicion", valorO(r.condicion)],
    ["dispositivoO2", valorO(r.dispositivoO2)],
    ["discrepancia", valorO(r.discrepanciaDiagnostico)],
    ["modificacion", valorO(r.modificacionServicio)],
    ["servicioIngreso", valorO(r.servicioIngreso)],
    ["tiempoPermanencia", valorO(r.tiempoPermanencia)],
  ];
  if (texto(r.tiempoPermanencia).startsWith(">")) pares.push(["razonDemora", valorO(r.razonDemora)]);
  return pares;
}

/** Lo que un registro aporta al resumen; null si es anterior al arranque del tablero. */
export function contribucion(
  tipo: TipoCenso,
  r: Registro,
  desde: string = MES_INICIO_RESUMEN,
): Contribucion | null {
  const fecha = aFecha(r.fecha);
  if (!fecha) return null;
  const dia = diaDe(fecha);
  const mes = dia.slice(0, 7);
  if (mes < desde) return null;
  return {
    mes,
    pares: [
      ["dia", dia.slice(8)],
      ...paresComunes(r),
      ...(tipo === "demanda" ? paresDemanda(r) : paresReferido(r)),
    ],
  };
}

function aplicar(destino: DeltaMes, c: Contribucion, signo: 1 | -1) {
  destino.total += signo;
  for (const [dimension, clave] of c.pares) {
    const conteo = (destino.conteos[dimension] ??= {});
    conteo[clave] = (conteo[clave] ?? 0) + signo;
  }
}

/** Qué cambia en cada mes al pasar de `anterior` a `nuevo`. Solo trae lo que cambió. */
export function deltaResumen(
  tipo: TipoCenso,
  anterior: Registro | null,
  nuevo: Registro,
): Record<string, DeltaMes> {
  const porMes: Record<string, DeltaMes> = {};
  const cambio = (c: Contribucion | null, signo: 1 | -1) => {
    if (c) aplicar((porMes[c.mes] ??= { total: 0, conteos: {} }), c, signo);
  };
  cambio(anterior ? contribucion(tipo, anterior) : null, -1);
  cambio(contribucion(tipo, nuevo), 1);

  for (const [mes, delta] of Object.entries(porMes)) {
    for (const [dimension, conteo] of Object.entries(delta.conteos)) {
      for (const [clave, n] of Object.entries(conteo)) if (n === 0) delete conteo[clave];
      if (Object.keys(conteo).length === 0) delete delta.conteos[dimension];
    }
    if (delta.total === 0 && Object.keys(delta.conteos).length === 0) delete porMes[mes];
  }
  return porMes;
}

/** Rehace los contadores de un mes desde sus registros. */
export function construirResumen(tipo: TipoCenso, mes: string, registros: Registro[]): ResumenCensoMes {
  const resumen: ResumenCensoMes = { tipo, mes, total: 0, conteos: {} };
  for (const r of registros) {
    const c = contribucion(tipo, r, mes);
    if (c?.mes === mes) aplicar(resumen, c, 1);
  }
  return resumen;
}

/** Suma varios meses; lo que quedó en cero tras editar registros se descarta. */
export function sumarResumenes(resumenes: Pick<ResumenCensoMes, "total" | "conteos">[]): DeltaMes {
  const suma: DeltaMes = { total: 0, conteos: {} };
  for (const r of resumenes) {
    suma.total += r.total ?? 0;
    for (const [dimension, conteo] of Object.entries(r.conteos ?? {})) {
      const destino = (suma.conteos[dimension] ??= {});
      for (const [clave, n] of Object.entries(conteo)) destino[clave] = (destino[clave] ?? 0) + n;
    }
  }
  for (const [dimension, conteo] of Object.entries(suma.conteos)) {
    for (const [clave, n] of Object.entries(conteo)) if (n <= 0) delete conteo[clave];
    if (Object.keys(conteo).length === 0) delete suma.conteos[dimension];
  }
  return suma;
}

const diasDelMes = (mes: string) => {
  const [anio, m] = mes.split("-").map(Number);
  return new Date(anio, m, 0).getDate();
};

/** Atenciones por día de un mes; si es el mes en curso, llega hasta `hoy`. */
export function serieDiaria(conteos: ConteosCenso, mes: string, hoy: string) {
  const ultimo = hoy.startsWith(mes) ? Number(hoy.slice(8)) : diasDelMes(mes);
  return Array.from({ length: ultimo }, (_, i) => {
    const dia = String(i + 1).padStart(2, "0");
    return { etiqueta: dia, valor: conteos.dia?.[dia] ?? 0 };
  });
}

const hastaElDia = (r: ResumenCensoMes | undefined, dia: number) =>
  Object.entries(r?.conteos.dia ?? {}).reduce((s, [d, n]) => (Number(d) <= dia ? s + n : s), 0);

/**
 * Compara con el mes anterior. Un mes en curso se compara contra los mismos días
 * del anterior: contra el mes completo siempre parecería una caída.
 */
export function comparacionMensual(resumenes: ResumenCensoMes[], mes: string, hoy: string) {
  const mesPrevio = mesAnterior(mes);
  if (mesPrevio < MES_INICIO_RESUMEN) return null;
  const actual = resumenes.find((r) => r.mes === mes);
  const previo = resumenes.find((r) => r.mes === mesPrevio);
  const enCurso = hoy.startsWith(mes);
  const dia = enCurso ? Number(hoy.slice(8)) : 31;
  const base = enCurso ? hastaElDia(previo, dia) : previo?.total ?? 0;
  if (!base) return null;
  const valor = enCurso ? hastaElDia(actual, dia) : actual?.total ?? 0;
  return { mesPrevio, enCurso, cambioPct: Math.round(((valor - base) / base) * 100) };
}
