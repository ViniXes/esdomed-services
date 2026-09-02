import { NextRequest, NextResponse } from "next/server";
import { rechazoAuth, SIN_CACHE } from "@/lib/integraciones/auth";
import {
  CACHE_TTL_MS,
  MODALIDADES_EGRESO,
  TABLEROS,
  ZONA_HORARIA,
  buscarTablero,
  cargarEgresos,
  conCache,
  contarIngresosPorMes,
  mesesDelRango,
  parsearRango,
  type DefinicionTablero,
  type EgresoTablero,
  type EstadoEgreso,
  type Rango,
} from "@/lib/integraciones/tableros";
import type { Genero } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// API de integración: TABLEROS (para consumo de OTROS sistemas, p. ej. Power BI).
//
// Autenticación máquina-a-máquina: header `x-api-key` (ver lib/integraciones/auth).
//
// Uso:
//   GET /api/integraciones/tableros/medicina-interna?anio=2026
//   GET /api/integraciones/tableros/cirugia?mes=2026-08
//   GET /api/integraciones/tableros/convenios?desde=2026-01-01&hasta=2026-06-30
//   GET /api/integraciones/tableros/apoyo-riiss?anio=2026
//   …&detalle=1   ← lista de pacientes (PII; solo tableros de egresos)
//   …&refrescar=1 ← ignora la caché en memoria (10 min)
//
// Sin parámetros de fecha responde el AÑO EN CURSO (serie de 12 meses), que es
// lo que un tablero normalmente necesita. La definición de cada tablero (grupo
// de servicios, métrica) vive en `src/lib/integraciones/tableros.ts`.
//
// Respuesta de egresos: totales (total/vivos/fallecidos), porSexo, porMes,
// porServicio, porModalidad y `filas` (tabla plana mes × servicio × sexo ×
// modalidad, pensada para cargarla directo en una herramienta de BI).
// Respuesta de ingresos (apoyo-riiss): total y porMes.
// ─────────────────────────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: SIN_CACHE });

type Sexos = Record<Genero, number>;
const sexosVacio = (): Sexos => ({ masculino: 0, femenino: 0, otro: 0 });

interface ConteoEgreso {
  total: number;
  vivos: number;
  fallecidos: number;
}
const conteoVacio = (): ConteoEgreso => ({ total: 0, vivos: 0, fallecidos: 0 });
function sumar(c: ConteoEgreso, e: EgresoTablero) {
  c.total++;
  if (e.tipo === "vivo") c.vivos++;
  else c.fallecidos++;
}

interface FilaPlana {
  mes: string;
  servicio: string;
  sexo: Genero;
  tipo: "vivo" | "fallecido";
  estado: EstadoEgreso;
  modalidad: string;
  total: number;
}

function cabecera(def: DefinicionTablero, rango: Rango) {
  return {
    tablero: def.id,
    nombre: def.nombre,
    metrica: def.metrica,
    descripcion: def.descripcion,
    rango: { desde: rango.desde, hasta: rango.hasta, zonaHoraria: ZONA_HORARIA },
  };
}

async function construirEgresos(def: DefinicionTablero, rango: Rango, conDetalle: boolean) {
  // `servicios` viene con el nombre del catálogo vivo (el que ve ESDOMED en la app).
  const { egresos, servicios, sinEstadoDeEgreso } = await cargarEgresos(rango, def.servicios, conDetalle);

  const total = conteoVacio();
  const porSexo = sexosVacio();
  // Se siembran todos los meses del rango y todos los servicios del grupo con
  // ceros para que el tablero no tenga huecos cuando un mes/servicio va en cero.
  const porMes = new Map<string, ConteoEgreso>(mesesDelRango(rango).map((m) => [m.mes, conteoVacio()]));
  const porServicio = new Map<string, ConteoEgreso & Sexos>(
    servicios.map((s) => [s, { ...conteoVacio(), ...sexosVacio() }]),
  );
  const porModalidad = new Map<EstadoEgreso, number>(
    (Object.keys(MODALIDADES_EGRESO) as EstadoEgreso[]).map((k) => [k, 0]),
  );
  const filas = new Map<string, FilaPlana>();

  for (const e of egresos) {
    sumar(total, e);
    porSexo[e.sexo]++;

    let mes = porMes.get(e.mes);
    if (!mes) porMes.set(e.mes, (mes = conteoVacio()));
    sumar(mes, e);

    let serv = porServicio.get(e.servicio);
    if (!serv) porServicio.set(e.servicio, (serv = { ...conteoVacio(), ...sexosVacio() }));
    sumar(serv, e);
    serv[e.sexo]++;

    porModalidad.set(e.estado, (porModalidad.get(e.estado) ?? 0) + 1);

    const k = `${e.mes}|${e.servicio}|${e.sexo}|${e.estado}`;
    const fila = filas.get(k);
    if (fila) fila.total++;
    else filas.set(k, { mes: e.mes, servicio: e.servicio, sexo: e.sexo, tipo: e.tipo, estado: e.estado, modalidad: e.modalidad, total: 1 });
  }

  const ordenServicio = (s: string) => {
    const i = servicios.indexOf(s);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };

  return {
    ...cabecera(def, rango),
    servicios,
    ...total,
    porSexo,
    porMes: [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, c]) => ({ mes, ...c })),
    porServicio: [...porServicio.entries()]
      .sort(([a], [b]) => ordenServicio(a) - ordenServicio(b) || a.localeCompare(b))
      .map(([servicio, c]) => ({ servicio, ...c })),
    porModalidad: [...porModalidad.entries()].map(([estado, n]) => ({
      estado,
      tipo: MODALIDADES_EGRESO[estado].tipo,
      modalidad: MODALIDADES_EGRESO[estado].etiqueta,
      total: n,
    })),
    filas: [...filas.values()].sort(
      (a, b) =>
        a.mes.localeCompare(b.mes) ||
        ordenServicio(a.servicio) - ordenServicio(b.servicio) ||
        a.servicio.localeCompare(b.servicio) ||
        a.sexo.localeCompare(b.sexo) ||
        a.estado.localeCompare(b.estado),
    ),
    ...(conDetalle
      ? {
          detalle: egresos.map((e) => ({
            expediente: e.expediente,
            paciente: e.paciente,
            sexo: e.sexo,
            servicio: e.servicio,
            tipo: e.tipo,
            estado: e.estado,
            modalidad: e.modalidad,
            fechaIngreso: e.fechaIngreso ? e.fechaIngreso.toISOString() : null,
            fechaEgreso: e.fechaEgreso.toISOString(),
            diasEstancia: e.diasEstancia,
          })),
        }
      : {}),
    ...(sinEstadoDeEgreso > 0
      ? {
          advertencias: [
            `${sinEstadoDeEgreso} registro(s) con fecha de egreso pero sin estado de egreso fueron excluidos (dato inconsistente en el censo)`,
          ],
        }
      : {}),
  };
}

async function construirIngresos(def: DefinicionTablero, rango: Rango) {
  const porMes = await contarIngresosPorMes(rango);
  return {
    ...cabecera(def, rango),
    total: porMes.reduce((acc, m) => acc + m.total, 0),
    porMes,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tablero: string }> }) {
  const rechazo = rechazoAuth(req);
  if (rechazo) return rechazo;

  const { tablero } = await params;
  const def = buscarTablero(tablero);
  if (!def) {
    return json({ error: `Tablero desconocido: "${tablero}"`, disponibles: TABLEROS.map((t) => t.id) }, 404);
  }

  const sp = req.nextUrl.searchParams;
  const parseado = parsearRango(sp);
  if ("error" in parseado) return json({ error: parseado.error }, 400);
  const { rango } = parseado;

  const conDetalle = def.metrica === "egresos" && sp.get("detalle") === "1";
  const refrescar = sp.get("refrescar") === "1";
  const clave = `${def.id}|${rango.desde}|${rango.hasta}|${conDetalle ? 1 : 0}`;

  try {
    const { valor, desdeCache } = await conCache(clave, refrescar, () =>
      def.metrica === "ingresos" ? construirIngresos(def, rango) : construirEgresos(def, rango, conDetalle),
    );
    return json({
      ...valor,
      generadoEn: new Date().toISOString(),
      cache: { estado: desdeCache ? "hit" : "miss", ttlMinutos: CACHE_TTL_MS / 60_000 },
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    console.error(`[integraciones/tableros/${def.id}]`, mensaje);
    return json({ error: "No se pudo generar el tablero", detalle: mensaje }, 500);
  }
}
