// Catálogo de tarjetas de Consulta Externa (pedido del usuario, 2026-11-19).
//
// Un paciente que en la Programación de citas del SIS ya trae DUI es porque se
// le hizo tarjeta. El catálogo reúne a todos los que han aparecido con DUI en
// cualquier agenda cargada, sin importar la fecha: uno por expediente, con su
// DUI, su nombre, la primera y la última cita cargada y sus especialidades.
//
// Se guarda repartido en FRAGMENTOS_TARJETAS documentos
// (consulta_externa_tarjetas/{f00…f19}), cada uno con un mapa
// expediente → entrada. Así abrir el catálogo cuesta a lo más 20 lecturas,
// aunque tenga miles de pacientes, y se busca en el navegador por cualquier
// parte del nombre. Cada documento aguanta unos 5,000 pacientes antes del
// límite de 1 MiB de Firestore (medido con los datos reales): de sobra.
//
// Puro (sin Firestore): la prueba es scripts/test-consulta-externa.mjs, y el
// script de reconstrucción usa las mismas funciones.

import { coincideCita } from "./busqueda";

export const FRAGMENTOS_TARJETAS = 20;

export interface EntradaTarjeta {
  /** Tal como viene del SIS ("00418860-6"). */
  dui: string;
  /** Como lo escribe el SIS: "Apellidos, Nombres". */
  paciente: string;
  /** Primera y última fecha con cita cargada ("YYYY-MM-DD"). */
  primera: string;
  ultima: string;
  /** Especialidades en las que ha tenido cita cargada (ids del catálogo). */
  especialidades: string[];
}

export type TarjetaCE = EntradaTarjeta & { expediente: string };

/** Lo que hace falta de una cita para el catálogo. */
export interface CitaParaTarjeta {
  fecha: string;
  expediente: string;
  dui: string;
  paciente: string;
  especialidadId: string;
}

/**
 * Documento del fragmento de un expediente: "11431-26" → "f11" (el número sin
 * el año, módulo 20). Un expediente siempre cae en el mismo documento.
 */
export function fragmentoTarjeta(expediente: string): string {
  const numero = String(expediente ?? "").split("-")[0].replace(/\D/g, "");
  const n = numero ? Number(numero.slice(-6)) : 0;
  return `f${String(n % FRAGMENTOS_TARJETAS).padStart(2, "0")}`;
}

/**
 * Suma una cita a la entrada del paciente. Idempotente: volver a sumar la
 * misma cita (otra carga del mismo archivo) no cambia nada. Manda lo de la
 * cita más reciente: si el SIS corrigió el nombre o el DUI, queda el nuevo.
 */
export function fusionarTarjeta(previa: EntradaTarjeta | undefined, cita: CitaParaTarjeta): EntradaTarjeta {
  const dui = String(cita.dui ?? "").trim();
  const paciente = String(cita.paciente ?? "").replace(/\s+/g, " ").trim();
  if (!previa) {
    return { dui, paciente, primera: cita.fecha, ultima: cita.fecha, especialidades: cita.especialidadId ? [cita.especialidadId] : [] };
  }
  const masReciente = cita.fecha >= previa.ultima;
  return {
    dui: (masReciente && dui) || previa.dui || dui,
    paciente: (masReciente && paciente) || previa.paciente || paciente,
    primera: cita.fecha < previa.primera ? cita.fecha : previa.primera,
    ultima: masReciente ? cita.fecha : previa.ultima,
    especialidades:
      cita.especialidadId && !previa.especialidades.includes(cita.especialidadId)
        ? [...previa.especialidades, cita.especialidadId]
        : previa.especialidades,
  };
}

const igual = (a: EntradaTarjeta | undefined, b: EntradaTarjeta) =>
  !!a &&
  a.dui === b.dui &&
  a.paciente === b.paciente &&
  a.primera === b.primera &&
  a.ultima === b.ultima &&
  a.especialidades.length === b.especialidades.length &&
  a.especialidades.every((e, i) => e === b.especialidades[i]);

/** Fragmentos que tocan estas citas (solo las que traen DUI). */
export function fragmentosDeCitas(citas: CitaParaTarjeta[]): string[] {
  return [...new Set(citas.filter((c) => c.dui && c.expediente).map((c) => fragmentoTarjeta(c.expediente)))].sort();
}

/**
 * Lo que cambia en cada fragmento al sumar estas citas: solo las entradas
 * nuevas o distintas (las citas sin DUI no entran). `actuales` devuelve el
 * mapa guardado de un fragmento.
 */
export function cambiosTarjetas(
  citas: CitaParaTarjeta[],
  actuales: (fragmento: string) => Record<string, EntradaTarjeta> | undefined,
): { cambios: Map<string, Record<string, EntradaTarjeta>>; nuevas: number } {
  const trabajo = new Map<string, Record<string, EntradaTarjeta>>();
  let nuevas = 0;
  for (const c of citas) {
    if (!c.dui || !c.expediente) continue;
    const f = fragmentoTarjeta(c.expediente);
    const guardadas = actuales(f) ?? {};
    const deEste = trabajo.get(f) ?? {};
    const previa = deEste[c.expediente] ?? guardadas[c.expediente];
    if (!previa) nuevas += 1;
    deEste[c.expediente] = fusionarTarjeta(previa, c);
    trabajo.set(f, deEste);
  }

  const cambios = new Map<string, Record<string, EntradaTarjeta>>();
  for (const [f, entradas] of trabajo) {
    const guardadas = actuales(f) ?? {};
    const distintas = Object.fromEntries(Object.entries(entradas).filter(([exp, e]) => !igual(guardadas[exp], e)));
    if (Object.keys(distintas).length) cambios.set(f, distintas);
  }
  return { cambios, nuevas };
}

/** Los mapas de los fragmentos, como lista. */
export function aplanarTarjetas(mapas: Record<string, EntradaTarjeta>[]): TarjetaCE[] {
  return mapas.flatMap((m) => Object.entries(m ?? {}).map(([expediente, e]) => ({ ...e, expediente })));
}

const claveOrden = (t: string) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type OrdenTarjetas = "nombre" | "reciente";

/**
 * Busca por expediente, DUI o cualquier parte del nombre (sin tildes), igual
 * que la búsqueda de la estación. Sin consulta, todas. Orden por apellido o
 * por la última cita cargada (la más reciente arriba).
 */
export function filtrarTarjetas(
  tarjetas: TarjetaCE[],
  consulta: string,
  opciones: { especialidadId?: string; orden?: OrdenTarjetas } = {},
): TarjetaCE[] {
  const q = String(consulta ?? "").trim();
  const lista = tarjetas.filter(
    (t) =>
      (!opciones.especialidadId || t.especialidades.includes(opciones.especialidadId)) &&
      (q.length < 2 || coincideCita({ codigo: "", expediente: t.expediente, dui: t.dui, paciente: t.paciente }, q)),
  );
  const porNombre = (a: TarjetaCE, b: TarjetaCE) => claveOrden(a.paciente).localeCompare(claveOrden(b.paciente), "es");
  return lista.sort(
    opciones.orden === "reciente" ? (a, b) => b.ultima.localeCompare(a.ultima) || porNombre(a, b) : porNombre,
  );
}
