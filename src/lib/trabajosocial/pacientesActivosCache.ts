import { collection, getDocs, query, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import type { Paciente } from "@/types";

// Caché de módulo COMPARTIDA entre Panorama, Rastreo y Seguimiento (pestañas de
// Gestiones) y Visitas: todas parten del mismo censo de pacientes activos
// creado por ESDOMED. Antes cada vista tenía su propio onSnapshot en vivo sobre
// esa colección (sin límite); ahora es una sola lectura puntual (getDocs) que
// las cuatro reusan al navegar entre pestañas — sin releer en cada cambio del
// censo mientras la pestaña queda abierta. Persiste durante la sesión del SPA
// (sobrevive a navegación client-side, no a una recarga completa).
let cache: Paciente[] | null = null;
let cacheEn: Date | null = null;

export function getPacientesActivosCache(): Paciente[] | null {
  return cache;
}

export function getPacientesActivosCacheEn(): Date | null {
  return cacheEn;
}

// Sin orderBy (evita exigir índice compuesto estado+fechaIngreso); cada vista
// ordena en cliente según lo que necesite.
export async function consultarPacientesActivos(): Promise<Paciente[]> {
  const snap = await getDocs(query(collection(db, "pacientes"), where("estado", "==", "activo")));
  const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Paciente));
  cache = lista;
  cacheEn = new Date();
  return lista;
}
