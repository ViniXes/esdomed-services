import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Query,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import {
  serviciosCanonicosCuidadosCriticos,
  serviciosConsultaCuidadosCriticos,
} from "@/lib/cuidadosCriticos";
import type { FichaCuidadosCriticos, Paciente } from "@/types";

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

function serviciosParaConsultaFichas(servicios: string[]) {
  const unicos = [...new Set(serviciosCanonicosCuidadosCriticos(servicios).map(servicio => servicio.trim()).filter(Boolean))];
  if (unicos.length === 0) {
    throw new Error("No hay servicios asignados para consultar fichas de cuidados criticos.");
  }
  return unicos.slice(0, 30);
}

function serviciosParaConsultaPacientes(servicios: string[]) {
  const unicos = [...new Set(serviciosConsultaCuidadosCriticos(servicios).map(servicio => servicio.trim()).filter(Boolean))];
  if (unicos.length === 0) {
    throw new Error("No hay servicios asignados para consultar pacientes de cuidados criticos.");
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
    where("servicio", "in", serviciosParaConsultaFichas(servicios)),
    limit(limite),
  );
}

export function queryFichasPorIngresoServicios(desde: string, hasta: string, servicios: string[], limite = LIMITE_RANGO) {
  return query(
    collection(db, COLLECTION),
    where("servicio", "in", serviciosParaConsultaFichas(servicios)),
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
    where("servicio", "in", serviciosParaConsultaFichas(servicios)),
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

// Parchea una entrada de la caché tras un cambio hecho fuera del flujo normal
// de consulta (eliminar/rechazar una ficha desde el lienzo), para que al volver
// a esta pantalla sin apretar "Actualizar" no reaparezca el dato viejo.
export function actualizarFichaEnCache(clave: string, ficha: FichaCuidadosCriticos) {
  const entrada = cache.get(clave);
  if (!entrada) return;
  cache.set(clave, {
    ...entrada,
    fichas: entrada.fichas.map(item => item.id === ficha.id ? ficha : item),
  });
}

export function eliminarFichaDeCache(clave: string, id: string) {
  const entrada = cache.get(clave);
  if (!entrada) return;
  cache.set(clave, {
    ...entrada,
    fichas: entrada.fichas.filter(item => item.id !== id),
  });
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

// ── Suscripción compartida de pacientes (en vivo, reutilizada entre pantallas) ──
// La lista de pacientes debe verse en tiempo real sin que el médico tenga que
// pedirla (a diferencia de las fichas, que se consultan manualmente). Para no
// volver a pagar la lectura inicial completa cada vez que el médico entra y
// sale de esta pantalla, el listener de Firestore se mantiene vivo a nivel de
// módulo — no se desuscribe al desmontar el componente — y se comparte entre
// todos los que pidan la misma clave (mismo conjunto de servicios).
//
// Se filtra ademas por estado == "activo": servicioActual NO se limpia al dar
// de alta a un paciente (sigue apuntando a su ultimo servicio), asi que sin
// este filtro la lista acumula para siempre a todo el que alguna vez paso por
// el servicio, no solo a los internados ahora — cada vez mas documentos leidos
// en cada apertura de esta pantalla. Buscar un expediente historico para
// reabrir una ficha vieja sigue funcionando aparte, por la busqueda directa en
// fichas_cuidados_criticos (ver medico/cuidados-criticos/page.tsx).
interface SuscripcionPacientes {
  pacientes: Paciente[];
  listeners: Set<(pacientes: Paciente[]) => void>;
}

const suscripcionesPacientes = new Map<string, SuscripcionPacientes>();

export function suscribirPacientesCuidadosCriticos(
  clave: string,
  servicios: string[],
  onCambio: (pacientes: Paciente[]) => void,
): () => void {
  let sub = suscripcionesPacientes.get(clave);
  if (!sub) {
    sub = { pacientes: [], listeners: new Set() };
    suscripcionesPacientes.set(clave, sub);
    onSnapshot(
      query(
        collection(db, "pacientes"),
        where("servicioActual", "in", serviciosParaConsultaPacientes(servicios)),
        where("estado", "==", "activo"),
      ),
      snap => {
        const pacientes = snap.docs.map(item => ({ id: item.id, ...item.data() } as Paciente));
        const actual = suscripcionesPacientes.get(clave);
        if (!actual) return;
        actual.pacientes = pacientes;
        actual.listeners.forEach(listener => listener(pacientes));
      },
    );
  }
  sub.listeners.add(onCambio);
  if (sub.pacientes.length > 0) onCambio(sub.pacientes);
  return () => {
    suscripcionesPacientes.get(clave)?.listeners.delete(onCambio);
    // El listener de Firestore NO se apaga al desmontar: queda vivo para que la
    // proxima vez que se entre a esta pantalla no se vuelva a pagar el costo de
    // la carga inicial completa, solo las lecturas incrementales de cambios reales.
  };
}
