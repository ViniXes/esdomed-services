// ─────────────────────────────────────────────────────────────────────────────
// Establecimientos de los censos de emergencia
//
// Los usan tres campos: "Lugar de la referencia" y "Centro de salud al que
// refiere" (demanda espontánea) y "Hospital de referencia" (referidos).
//
// El catálogo completo es el de SIMMOW (lib/simmow/establecimientosSimmow.json:
// 1743 establecimientos con su código: hospitales nacionales, ISSS, UCSF,
// privados, Militar…). Encima van los FRECUENTES con el nombre corto que el
// censo usa desde el principio. Elegir uno guarda ese nombre corto y su fila de
// SIMMOW no se repite en el buscador, para que el tablero no parta un mismo
// hospital en dos barras. Lo demás se guarda con el nombre de SIMMOW tal cual.
//
// DoctorSV va siempre primero (pedido de emergencia): no es hospital ni unidad
// de salud, pero refiere pacientes a diario.
//
// Sin imports de valor: scripts/test-establecimientos-censo.mjs lo transpila suelto.
// ─────────────────────────────────────────────────────────────────────────────

import type { ClasificacionSisReferido } from "@/types";
import type { EstablecimientoSimmow } from "@/lib/simmow/establecimientos";

export type GrupoEstablecimiento = "telemedicina" | "minsal" | "isss" | "otros";

export interface EstablecimientoCenso {
  nombre: string;            // lo que se guarda en el censo
  grupo: GrupoEstablecimiento;
  simmow?: string;           // código en el catálogo de SIMMOW
  alias: readonly string[];  // primero el nombre en SIMMOW; luego otras formas en que quedó escrito
  nota?: string;             // segunda línea en el buscador (si no, el nombre en SIMMOW)
}

/** Segunda línea del buscador: la nota, o el nombre en SIMMOW si dice algo más que el corto. */
export function detalleEstablecimiento(e: EstablecimientoCenso): string | undefined {
  if (e.nota) return e.nota;
  const simmow = e.alias[0];
  return simmow && claveEstablecimiento(simmow) !== claveEstablecimiento(e.nombre) ? simmow : undefined;
}

export const DOCTOR_SV = "DoctorSV";
export const HN_SAN_RAFAEL = "HN San Rafael";
export const OTRO_ESTABLECIMIENTO = "Otro";

export const GRUPOS_ESTABLECIMIENTO: { grupo: GrupoEstablecimiento; titulo: string }[] = [
  { grupo: "telemedicina", titulo: "Telemedicina" },
  { grupo: "minsal", titulo: "Hospitales nacionales" },
  { grupo: "isss", titulo: "ISSS" },
  { grupo: "otros", titulo: "Otros" },
];

// Los alias largos de la red nacional e ISSS son los de lib/establecimientos.ts:
// "Centro de salud al que refiere" los ofrecía como sugerencia de texto libre.
export const ESTABLECIMIENTOS_FRECUENTES: readonly EstablecimientoCenso[] = [
  { nombre: DOCTOR_SV, grupo: "telemedicina", simmow: "2658", alias: ["Telemedicina Doctorsv", "Doctor SV"] },

  { nombre: HN_SAN_RAFAEL, grupo: "minsal", simmow: "163", alias: ["Hospital Nacional Santa Tecla LL \"San Rafael\"", "Hospital Nacional San Rafael – Santa Tecla"] },
  { nombre: "HN Zacamil", grupo: "minsal", simmow: "589", alias: ["Hospital Nacional Mejicanos SS (Zacamil) \"Dr. Juan José Fernández\"", "Hospital Nacional Zacamil Dr. Juan José Fernández"] },
  { nombre: "HN Rosales", grupo: "minsal", simmow: "1", alias: ["Hospital Nacional San Salvador SS \"Rosales\"", "Hospital Nacional Rosales"] },
  { nombre: "HN Cojutepeque", grupo: "minsal", simmow: "207", alias: ["Hospital Nacional Cojutepeque CU \"Nuestra Sra. de Fátima\"", "Hospital Nacional Nuestra Señora de Fátima – Cojutepeque"] },
  { nombre: "HN Saldaña", grupo: "minsal", simmow: "552", alias: ["Hospital Nacional Panchimalco SS Neumológico \"Dr. José A. Saldaña\"", "Hospital Nacional Neumológico y de Medicina Familiar Dr. José Antonio Saldaña"] },
  { nombre: "HN Sonsonate", grupo: "minsal", simmow: "78", alias: ["Hospital Nacional Sonsonate SO \"Dr. Jorge Mazzini Villacorta\"", "Hospital Nacional Sonsonate Dr. Jorge Mazzini Villacorta"] },
  { nombre: "HN Chalatenango", grupo: "minsal", simmow: "106", alias: ["Hospital Nacional Chalatenango CH \"Dr. Luis Edmundo Vásquez\"", "Hospital Nacional Chalatenango Dr. Luis Edmundo Vásquez"] },
  { nombre: "HN San Miguel", grupo: "minsal", simmow: "385", alias: ["Hospital Nacional San Miguel SM \"San Juan de Dios\"", "Hospital Nacional San Juan de Dios – San Miguel"] },
  { nombre: "HN San Vicente", grupo: "minsal", simmow: "314", alias: ["Hospital Nacional San Vicente SV \"Santa Gertrudis\"", "Hospital Nacional Santa Gertrudis – San Vicente"] },
  { nombre: "HN Santa Ana", grupo: "minsal", simmow: "32", alias: ["Hospital Nacional Santa Ana SA \"San Juan de Dios\"", "Hospital Nacional San Juan de Dios - Santa Ana"] },
  { nombre: "HN Molina (Soyapango)", grupo: "minsal", simmow: "569", alias: ["Hospital Nacional Soyapango SS \"Dr. José Molina Martínez\"", "Hospital Nacional Psiquiátrico Dr. José Molina Martínez"] },
  { nombre: "HN Ahuachapán", grupo: "minsal", simmow: "5", alias: ["Hospital Nacional Ahuachapán AH \"Francisco Menéndez\"", "Hospital Nacional Ahuachapán – Dr. Francisco Menéndez"] },
  { nombre: "HN San Bartolo", grupo: "minsal", simmow: "575", alias: ["Hospital Nacional Ilopango SS \"Enf. Angélica Vidal de Najarro\"", "Hospital Nacional General de Ilopango Enf. Angélica Vidal de Najarro", "HN Ilopango"] },
  { nombre: "HN Zacatecoluca", grupo: "minsal", simmow: "228", alias: ["Hospital Nacional Zacatecoluca LP \"Santa Teresa\"", "Hospital Nacional Santa Teresa – Zacatecoluca"] },
  { nombre: "HN Chalchuapa", grupo: "minsal", simmow: "72", alias: ["Hospital Nacional Chalchuapa SA", "Hospital Nacional de Chalchuapa"] },
  { nombre: "HN Suchitoto", grupo: "minsal", simmow: "603", alias: ["Hospital Nacional Suchitoto CU"] },
  { nombre: "HN Nueva Concepción", grupo: "minsal", simmow: "144", alias: ["Hospital Nacional Nueva Concepción CH", "Hospital Nacional Nueva Concepción – Chalatenango"] },
  { nombre: "HN Santa Rosa de Lima", grupo: "minsal", simmow: "509", alias: ["Hospital Nacional Santa Rosa de Lima LU", "Hospital Nacional Santa Rosa de Lima – La Unión"] },
  { nombre: "HN Sensuntepeque", grupo: "minsal", simmow: "276", alias: ["Hospital Nacional Sensuntepeque CA", "Hospital Nacional de Sensuntepeque – San Jerónimo Emiliani"] },
  { nombre: "HN Ilobasco", grupo: "minsal", simmow: "299", alias: ["Hospital Nacional Ilobasco CA \"Dr. José L. Saca\"", "Hospital Nacional de Ilobasco Dr. José Luis Saca"] },
  { nombre: "HN Jiquilisco", grupo: "minsal", simmow: "372", alias: ["Hospital Nacional Jiquilisco US", "Hospital Nacional Jiquilisco – Usulután"] },
  { nombre: "HN Usulután", grupo: "minsal", simmow: "334", alias: ["Hospital Nacional Usulután US \"San Pedro\"", "Hospital Nacional San Pedro – Usulután"] },
  { nombre: "HNN Benjamín Bloom", grupo: "minsal", simmow: "2", alias: ["Hospital Nacional San Salvador SS \"Benjamin Bloom\"", "Hospital Nacional de Niños Benjamín Bloom"] },
  { nombre: "HN de la Mujer", grupo: "minsal", simmow: "3", alias: ["Hospital Nacional San Salvador SS de la Mujer", "Hospital Nacional de la Mujer Dra. María Isabel Rodríguez"] },
  // Los que la lista corta no tenía (2026-11-14), para completar la red nacional.
  { nombre: "HN Metapán", grupo: "minsal", simmow: "63", alias: ["Hospital Nacional Metapán SA", "Hospital Nacional Metapán Dr. Arturo Morales"] },
  { nombre: "HN La Unión", grupo: "minsal", simmow: "481", alias: ["Hospital Nacional La Unión LU", "Hospital Nacional de La Unión"] },
  { nombre: "HN San Francisco Gotera", grupo: "minsal", simmow: "443", alias: ["Hospital Nacional San Francisco Gotera MO", "Hospital Nacional de San Francisco Gotera"] },
  { nombre: "HN Santiago de María", grupo: "minsal", simmow: "356", alias: ["Hospital Nacional Santiago de María US", "Hospital Nacional Jorge Mena – Santiago de María"] },
  { nombre: "HN Ciudad Barrios", grupo: "minsal", simmow: "423", alias: ["Hospital Nacional Ciudad Barrios SM \"Mons. Oscar Arnulfo Romero\""] },
  { nombre: "HN Nueva Guadalupe", grupo: "minsal", simmow: "435", alias: ["Hospital Nacional Nueva Guadalupe SM", "Hospital Nacional de Nueva Guadalupe"] },

  { nombre: "ISSS General", grupo: "isss", simmow: "754", alias: ["Hospital ISSS San Salvador SS General", "Hospital General – ISSS"] },
  { nombre: "ISSS Médico Quirúrgico y Oncológico", grupo: "isss", simmow: "751", alias: ["Hospital ISSS San Salvador SS Médico Quirúrgico y Oncología", "Hospital Médico Quirúrgico y Oncológico – ISSS"] },
  { nombre: "ISSS 1° de Mayo (Materno Infantil)", grupo: "isss", simmow: "749", alias: ["Hospital ISSS San Salvador SS 1º de Mayo", "Hospital Materno Infantil 1.º de Mayo – ISSS"] },
  { nombre: "ISSS Amatepec", grupo: "isss", simmow: "752", alias: ["Hospital ISSS Soyapango SS Amatepec", "Hospital Amatepec – ISSS"] },
  { nombre: "ISSS Policlínico Arce", grupo: "isss", simmow: "1972", alias: ["Hospital ISSS Policlinico San Salvador SS Arce", "Hospital Policlínico Arce – ISSS"] },
  { nombre: "ISSS Policlínico Zacamil", grupo: "isss", simmow: "1965", alias: ["Hospital ISSS Policlinico Mejicanos SS Zacamil", "Hospital Policlínico Zacamil – ISSS"] },
  { nombre: "ISSS Policlínico Roma", grupo: "isss", simmow: "753", alias: ["Hospital ISSS Policlinico San Salvador SS Roma", "Hospital Policlínico Roma – ISSS"] },
  { nombre: "ISSS Policlínico Planes de Renderos", grupo: "isss", simmow: "750", alias: ["Hospital ISSS Policlinico San Salvador SS Planes de Renderos", "Hospital Policlínico Planes de Renderos – ISSS"] },
  { nombre: "ISSS Regional San Miguel", grupo: "isss", simmow: "748", alias: ["Hospital ISSS Regional San Miguel SM", "Hospital Regional de San Miguel – ISSS"] },
  { nombre: "ISSS Regional Santa Ana", grupo: "isss", simmow: "746", alias: ["Hospital ISSS Regional Santa Ana SA", "Hospital Regional de Santa Ana – ISSS"] },
  { nombre: "ISSS Regional Sonsonate", grupo: "isss", simmow: "747", alias: ["Hospital ISSS Regional Sonsonate SO", "Hospital Regional de Sonsonate – ISSS"] },
  { nombre: "ISSS La Ceiba", grupo: "isss", simmow: "2327", alias: ["Hospital ISSS San Salvador Hospital La Ceiba"] },

  { nombre: "Hospital Militar", grupo: "otros", simmow: "797", alias: ["Hospital Militar San Salvador SS"] },
  { nombre: "Hospital Central", grupo: "otros", simmow: "2145", alias: ["Hospital Privado San Salvador SS Central"] },
  { nombre: "Hospital privado", grupo: "otros", simmow: "2021", alias: ["Hospital Privado"], nota: "Sin especificar cuál; si lo sabe, escriba su nombre" },
  { nombre: OTRO_ESTABLECIMIENTO, grupo: "otros", alias: [], nota: "No está en el catálogo" },
];

// El propio Hospital Nacional El Salvador: nadie llega referido de aquí ni se refiere aquí.
const EXCLUIDOS_SIMMOW = new Set(["2317"]);

const CODIGOS_FRECUENTES = new Set(
  ESTABLECIMIENTOS_FRECUENTES.flatMap((e) => (e.simmow ? [e.simmow] : [])),
);

/** Llave de comparación: ignora mayúsculas, tildes, comillas y signos. */
export function claveEstablecimiento(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const FRECUENTE_POR_CLAVE = new Map<string, EstablecimientoCenso>();
for (const e of ESTABLECIMIENTOS_FRECUENTES) {
  for (const n of [e.nombre, ...e.alias]) FRECUENTE_POR_CLAVE.set(claveEstablecimiento(n), e);
}

const textoDe = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function establecimientoFrecuente(valor: unknown): EstablecimientoCenso | undefined {
  const t = textoDe(valor);
  return t ? FRECUENTE_POR_CLAVE.get(claveEstablecimiento(t)) : undefined;
}

/**
 * Nombre con que se guarda y se cuenta: el corto si es un frecuente (escrito de
 * cualquier forma: "HOSPITAL NACIONAL ROSALES", el nombre de SIMMOW…); si no, el
 * valor tal cual.
 */
export function nombreEstablecimiento(valor: unknown): string {
  return establecimientoFrecuente(valor)?.nombre ?? textoDe(valor);
}

/** Junta en una barra las formas de escribir un mismo establecimiento (registros viejos). */
export function agruparEstablecimientos(conteo: Record<string, number> = {}): Record<string, number> {
  const unido: Record<string, number> = {};
  for (const [nombre, valor] of Object.entries(conteo)) {
    const n = nombreEstablecimiento(nombre) || nombre;
    unido[n] = (unido[n] ?? 0) + valor;
  }
  return unido;
}

// Deriva la columna-fórmula "REFERENCIA EN SIS (no modificar)" del censo de referidos.
export function clasificacionSis(hospital: string, referenciaSis: boolean): ClasificacionSisReferido {
  const nombre = nombreEstablecimiento(hospital);
  if (nombre === DOCTOR_SV) return "DR SV";
  if (nombre === HN_SAN_RAFAEL) return referenciaSis ? "HNSR CON REF SIS" : "HNSR SIN REF SIS";
  return referenciaSis ? "OTROS HOSP CON REF SIS" : "OTROS HOSP SIN REF SIS";
}

// ── Búsqueda ─────────────────────────────────────────────────────────────────

export interface BusquedaEstablecimientos {
  frecuentes: EstablecimientoCenso[];
  catalogo: EstablecimientoSimmow[]; // solo lo que no es frecuente, hasta `max`
  totalCatalogo: number;
}

const clavesCatalogo = new WeakMap<readonly EstablecimientoSimmow[], string[]>();

function clavesDe(catalogo: readonly EstablecimientoSimmow[]): string[] {
  let claves = clavesCatalogo.get(catalogo);
  if (!claves) {
    claves = catalogo.map((e) => claveEstablecimiento(e.nombre));
    clavesCatalogo.set(catalogo, claves);
  }
  return claves;
}

const alInicioDePalabra = (clave: string, parte: string) =>
  clave.startsWith(parte) || clave.includes(`_${parte}`);

/**
 * Busca por partes sin importar tildes ni el orden ("tecla ucsf"). Sin texto
 * devuelve solo los frecuentes. En el catálogo, primero lo que coincide al
 * inicio de palabra; empate, el orden de SIMMOW.
 */
export function buscarEstablecimientosCenso(
  consulta: string,
  catalogo: readonly EstablecimientoSimmow[],
  max = 40,
): BusquedaEstablecimientos {
  const partes = claveEstablecimiento(consulta).split("_").filter(Boolean);
  if (partes.length === 0) {
    return { frecuentes: [...ESTABLECIMIENTOS_FRECUENTES], catalogo: [], totalCatalogo: 0 };
  }
  const coincide = (clave: string) => partes.every((p) => clave.includes(p));

  const frecuentes = ESTABLECIMIENTOS_FRECUENTES.filter((e) =>
    coincide([e.nombre, ...e.alias].map(claveEstablecimiento).join("_")));

  const claves = clavesDe(catalogo);
  const encontrados: { e: EstablecimientoSimmow; puntos: number; i: number }[] = [];
  catalogo.forEach((e, i) => {
    if (CODIGOS_FRECUENTES.has(e.codigo) || EXCLUIDOS_SIMMOW.has(e.codigo)) return;
    const clave = claves[i];
    if (!coincide(clave)) return;
    encontrados.push({ e, puntos: partes.filter((p) => alInicioDePalabra(clave, p)).length, i });
  });
  encontrados.sort((a, b) => b.puntos - a.puntos || a.i - b.i);

  return {
    frecuentes,
    catalogo: encontrados.slice(0, max).map((x) => x.e),
    totalCatalogo: encontrados.length,
  };
}
