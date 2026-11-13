import type { UserProfile } from "@/types";

// Quién entra al subsistema de Consulta Externa (turnero de llamados).
//
// - Cuenta de estación (`consulta_externa`): cuenta compartida de la estación de
//   enfermería de una especialidad. Marca llegadas y llama a preconsulta y al
//   consultorio. Su único portal es este subsistema: no tiene "Volver al panel".
// - Gestión (carga de citas del SIS, recepción de primera vez, pantallas):
//   ESDOMED y admin. Mientras el módulo está en construcción solo lo ve el
//   admin; para abrirlo a ESDOMED basta con poner EN_CONSTRUCCION = false.

type Perfil = UserProfile | null | undefined;

export const EN_CONSTRUCCION = true;

export const esCuentaEstacion = (p: Perfil) => p?.role === "consulta_externa";

const esEsdomed = (p: Perfil) => p?.role === "esdomed" || p?.role === "asistente_esdomed";
const esAdmin = (p: Perfil) => p?.role === "admin";

/** Carga de citas, recepción de primera vez y configuración de pantallas. */
export const gestionaConsultaExterna = (p: Perfil) => esAdmin(p) || (!EN_CONSTRUCCION && esEsdomed(p));

/** Puede entrar al subsistema (también decide si ve la entrada en el panel de ESDOMED). */
export const entraConsultaExterna = (p: Perfil) => gestionaConsultaExterna(p) || esCuentaEstacion(p);
