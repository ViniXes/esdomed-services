import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type DocumentData,
  type Query,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import type { FichaCuidadosCriticos } from "@/types";

const COLLECTION = "fichas_cuidados_criticos";
const LIMITE_RANGO = 1200;
const LIMITE_ACTIVAS = 300;
const LIMITE_CONSULTA_MANUAL = 5000;

interface CacheFichas {
  fichas: FichaCuidadosCriticos[];
  consultadoEn: Date;
}

const cache = new Map<string, CacheFichas>();

function fechaInput(fecha: Date) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

function serviciosParaConsulta(servicios: string[]) {
  const unicos = [...new Set(servicios.map(servicio => servicio.trim()).filter(Boolean))];
  if (unicos.length === 0) {
    throw new Error("No hay servicios asignados para consultar fichas de cuidados criticos.");
  }
  return unicos.slice(0, 30);
}

export function rangoIngresoMes(anio: number, mes: number) {
  return {
    desde: fechaInput(new Date(anio, mes - 1, 1)),
    hasta: fechaInput(new Date(anio, mes, 0)),
  };
}

export function rangoIngresoAnio(anio: number) {
  return {
    desde: `${anio}-01-01`,
    hasta: `${anio}-12-31`,
  };
}

export function queryFichasPorIngreso(desde: string, hasta: string, limite = LIMITE_RANGO) {
  return query(
    collection(db, COLLECTION),
    where("datos.fecha_ingreso_al_servicio", ">=", desde),
    where("datos.fecha_ingreso_al_servicio", "<=", hasta),
    orderBy("datos.fecha_ingreso_al_servicio", "asc"),
    limit(limite),
  );
}

export function queryFichasTodas(limite = LIMITE_CONSULTA_MANUAL) {
  return query(
    collection(db, COLLECTION),
    limit(limite),
  );
}

export function queryFichasServicios(servicios: string[], limite = LIMITE_CONSULTA_MANUAL) {
  return query(
    collection(db, COLLECTION),
    where("servicio", "in", serviciosParaConsulta(servicios)),
    limit(limite),
  );
}

export function queryFichasPorIngresoServicios(desde: string, hasta: string, servicios: string[], limite = LIMITE_RANGO) {
  return query(
    collection(db, COLLECTION),
    where("servicio", "in", serviciosParaConsulta(servicios)),
    where("datos.fecha_ingreso_al_servicio", ">=", desde),
    where("datos.fecha_ingreso_al_servicio", "<=", hasta),
    orderBy("datos.fecha_ingreso_al_servicio", "asc"),
    limit(limite),
  );
}

export function queryFichasPorEgreso(desde: string, hasta: string, limite = LIMITE_RANGO) {
  return query(
    collection(db, COLLECTION),
    where("datos.fecha_egreso_del_servicio", ">=", desde),
    where("datos.fecha_egreso_del_servicio", "<=", hasta),
    orderBy("datos.fecha_egreso_del_servicio", "asc"),
    limit(limite),
  );
}

export function queryFichasIngresoMes(anio: number, mes: number, limite = LIMITE_RANGO) {
  const { desde, hasta } = rangoIngresoMes(anio, mes);
  return queryFichasPorIngreso(desde, hasta, limite);
}

export function queryFichasIngresoMesServicios(anio: number, mes: number, servicios: string[], limite = LIMITE_RANGO) {
  const { desde, hasta } = rangoIngresoMes(anio, mes);
  return queryFichasPorIngresoServicios(desde, hasta, servicios, limite);
}

export function queryFichasIngresoAnio(anio: number, limite = LIMITE_RANGO) {
  const { desde, hasta } = rangoIngresoAnio(anio);
  return queryFichasPorIngreso(desde, hasta, limite);
}

export function queryFichasIngresoAnioServicios(anio: number, servicios: string[], limite = LIMITE_RANGO) {
  const { desde, hasta } = rangoIngresoAnio(anio);
  return queryFichasPorIngresoServicios(desde, hasta, servicios, limite);
}

export function queryFichasEgresoAnio(anio: number, limite = LIMITE_RANGO) {
  const { desde, hasta } = rangoIngresoAnio(anio);
  return queryFichasPorEgreso(desde, hasta, limite);
}

export function queryFichasActivas(limite = LIMITE_ACTIVAS) {
  return query(
    collection(db, COLLECTION),
    where("estadoEstancia", "==", "activa"),
    limit(limite),
  );
}

export function queryFichasActivasServicios(servicios: string[], limite = LIMITE_ACTIVAS) {
  return query(
    collection(db, COLLECTION),
    where("servicio", "in", serviciosParaConsulta(servicios)),
    where("estadoEstancia", "==", "activa"),
    limit(limite),
  );
}

export function unirFichas(...listas: FichaCuidadosCriticos[][]) {
  const porId = new Map<string, FichaCuidadosCriticos>();
  const sinId: FichaCuidadosCriticos[] = [];

  for (const lista of listas) {
    for (const ficha of lista) {
      if (!ficha.id) {
        sinId.push(ficha);
        continue;
      }
      porId.set(ficha.id, ficha);
    }
  }

  return [...porId.values(), ...sinId];
}

export function getFichasCuidadosCriticosCache(clave: string): CacheFichas | null {
  return cache.get(clave) ?? null;
}

export async function consultarFichasCuidadosCriticos(
  clave: string,
  consultas: Query<DocumentData>[],
) {
  const snaps = await Promise.all(consultas.map(consulta => getDocs(consulta)));
  const fichas = unirFichas(...snaps.map(snap => (
    snap.docs.map(item => ({ id: item.id, ...item.data() } as FichaCuidadosCriticos))
  )));
  const entrada = { fichas, consultadoEn: new Date() };
  cache.set(clave, entrada);
  return entrada;
}
