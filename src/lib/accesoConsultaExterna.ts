import type { UserProfile } from "@/types";

// Quién entra al subsistema de Consulta Externa (turnero de llamados).
//
// - Cuenta de estación (`consulta_externa`): cuenta compartida de la estación de
//   enfermería de una especialidad. Marca llegadas y llama a los pacientes a
//   su estación. Su único portal es este subsistema: no tiene "Volver al panel".
// - Cuenta de pantalla (`pantalla_ce`): la computadora de una TV. Solo abre la
//   pantalla de llamados (las reglas solo le dejan leer los llamados del día),
//   no se cierra por inactividad y no pide términos: no es una persona. Así no
//   queda una cuenta con permisos sesionada en un equipo de la sala de espera.
// - Gestión (carga de citas del SIS, recepción de primera vez, pantallas):
//   ESDOMED y admin. Mientras el módulo está en construcción solo lo ve el
//   admin; para abrirlo a ESDOMED basta con poner EN_CONSTRUCCION = false.

type Perfil = UserProfile | null | undefined;

export const EN_CONSTRUCCION = true;

export const esCuentaEstacion = (p: Perfil) => p?.role === "consulta_externa";

export const esCuentaPantalla = (p: Perfil) => p?.role === "pantalla_ce";

/** Personal que por ahora solo registra las citas 2027 (rol agenda_ce). Su único portal es este. */
export const esAgendaCE = (p: Perfil) => p?.role === "agenda_ce";

const esEsdomed = (p: Perfil) => p?.role === "esdomed" || p?.role === "asistente_esdomed";
const esAdmin = (p: Perfil) => p?.role === "admin";

/** Carga de citas, recepción de primera vez y configuración de pantallas. */
export const gestionaConsultaExterna = (p: Perfil) => esAdmin(p) || (!EN_CONSTRUCCION && esEsdomed(p));

/** Registra citas 2027 (sin editar el catálogo de agendas, que es de gestión). */
export const registraCitas2027 = (p: Perfil) => gestionaConsultaExterna(p) || esAgendaCE(p);

/** Llamados: estación de especialidad y pantallas. */
export const veLlamadosCE = (p: Perfil) => gestionaConsultaExterna(p) || esCuentaEstacion(p);

/** Puede entrar al subsistema (también decide si ve la entrada en el panel de ESDOMED). */
export const entraConsultaExterna = (p: Perfil) => gestionaConsultaExterna(p) || esCuentaEstacion(p) || esAgendaCE(p);

/**
 * Puede abrir la pantalla de llamados (/consulta-externa/pantalla). Sin
 * agenda_ce: las reglas no le dejan leer los llamados.
 */
export const veLaPantallaCE = (p: Perfil) => gestionaConsultaExterna(p) || esCuentaEstacion(p) || esCuentaPantalla(p);

/** Vaciar lo que muestran todas las pantallas (pedido del usuario: solo el admin). */
export const limpiaPantallasCE = (p: Perfil) => esAdmin(p);

/** Adónde va la cuenta de pantalla al entrar al sistema. */
export const RUTA_PANTALLA_CE = "/consulta-externa/pantalla";
