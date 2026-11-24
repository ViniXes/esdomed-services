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
// - Cuenta de mensajes (`mensajes_ce`): cuenta general que solo escribe lo que
//   dirán las pantallas (Mensajes a pantalla). Las reglas solo le dejan leer y
//   escribir los llamados del día.
// - Trabajo Social de Consulta Externa (`trabajo_social_ce`): registra sus
//   gestiones y consulta la bitácora y la productividad. No ve nada más: ni lo
//   de hospitalización (rol trabajo_social) ni el resto de este subsistema.
// - Gestión (carga de citas del SIS, recepción de primera vez, pantallas):
//   ESDOMED y admin. Mientras el módulo está en construcción solo lo ven el
//   admin, el asistente administrativo (asistente_esdomed) y tres personas de
//   ESDOMED (USUARIOS_ESDOMED_CE); para abrirlo a ESDOMED basta con poner EN_CONSTRUCCION = false.

type Perfil = UserProfile | null | undefined;

export const EN_CONSTRUCCION = true;

export const esCuentaEstacion = (p: Perfil) => p?.role === "consulta_externa";

export const esCuentaPantalla = (p: Perfil) => p?.role === "pantalla_ce";

export const esCuentaMensajes = (p: Perfil) => p?.role === "mensajes_ce";

/** Personal que por ahora solo registra las citas 2027 (rol agenda_ce). Su único portal es este. */
export const esAgendaCE = (p: Perfil) => p?.role === "agenda_ce";

/** Trabajadora social de Consulta Externa. Su único portal es este. */
export const esTrabajoSocialCE = (p: Perfil) => p?.role === "trabajo_social_ce";

const esEsdomed = (p: Perfil) => p?.role === "esdomed" || p?.role === "asistente_esdomed";
const esAdmin = (p: Perfil) => p?.role === "admin";

/**
 * El asistente administrativo (asistente_esdomed: Denys Álvarez y la cuenta
 * "admin" con su mismo rol, para ver el sistema como él) entra a la gestión
 * aunque el módulo siga en construcción (pedido del usuario, 2026-11-23). Las
 * reglas de Firestore ya dejan a asistente_esdomed en todo Consulta Externa.
 */
const esAsistenteEsdomed = (p: Perfil) => p?.role === "asistente_esdomed";

/**
 * Personal ESDOMED que también entra mientras el módulo sigue en construcción
 * (pedido del usuario, 2026-11-23): Diego Iván López, Luis Fernando Amaya Grande
 * y Fernando Javier Gálvez Sampson. Va por usuario de inicio de sesión, que es
 * único y no cambia si se corrige el nombre. El resto de ESDOMED sigue sin verlo.
 */
const USUARIOS_ESDOMED_CE = ["dlopez", "lamaya", "fgalvez"];
const esEsdomedHabilitadoCE = (p: Perfil) =>
  p?.role === "esdomed" && USUARIOS_ESDOMED_CE.includes((p.username ?? "").trim().toLowerCase());

/** Carga de citas, recepción de primera vez y configuración de pantallas. */
export const gestionaConsultaExterna = (p: Perfil) =>
  esAdmin(p) || esAsistenteEsdomed(p) || esEsdomedHabilitadoCE(p) || (!EN_CONSTRUCCION && esEsdomed(p));

/** Registra citas 2027 (sin editar el catálogo de agendas, que es de gestión). */
export const registraCitas2027 = (p: Perfil) => gestionaConsultaExterna(p) || esAgendaCE(p);

/** Sube el reporte SIS "Expedientes creados" (productividad + padrón). Mismos roles que la API. */
export const subeExpedientesCreadosCE = (p: Perfil) => registraCitas2027(p) || esEsdomed(p);

/**
 * Catálogo de tarjetas (solo lectura). Además de la gestión, las digitadoras
 * de Consulta Externa (agenda_ce: Paola y Kathya; pedido del usuario, 2026-11-19).
 */
export const veCatalogoTarjetas = (p: Perfil) => gestionaConsultaExterna(p) || esAgendaCE(p);

/**
 * PROVISIONAL. Pacientes con fecha de nacimiento genérica (10/10/2000): los ven
 * y los marcan las digitadoras (agenda_ce) y la gestión (pedido del usuario,
 * 2026-11-24). La API usa este mismo predicado.
 */
export const veFechaGenericaCE = (p: Perfil) => gestionaConsultaExterna(p) || esAgendaCE(p);

/** Llamados: estación de especialidad y pantallas. */
export const veLlamadosCE = (p: Perfil) => gestionaConsultaExterna(p) || esCuentaEstacion(p);

/** Puede entrar al subsistema (también decide si ve la entrada en el panel de ESDOMED). */
export const entraConsultaExterna = (p: Perfil) =>
  gestionaConsultaExterna(p) || esCuentaEstacion(p) || esAgendaCE(p) || esTrabajoSocialCE(p);

/** Registra gestiones de Trabajo Social de Consulta Externa. */
export const registraGestionesTSCE = (p: Perfil) => esTrabajoSocialCE(p) || esAdmin(p);

/**
 * Supervisa Trabajo Social de Consulta Externa: una trabajadora social del
 * hospital marcada por persona (la jefatura). Solo consulta, desde su menú.
 */
export const supervisaTSCE = (p: Perfil) => p?.role === "trabajo_social" && p.supervisaTSCE === true;

/** Consulta la bitácora y la productividad. */
export const consultaGestionesTSCE = (p: Perfil) => registraGestionesTSCE(p) || supervisaTSCE(p);

/**
 * Puede abrir la pantalla de llamados (/consulta-externa/pantalla). Sin
 * agenda_ce: las reglas no le dejan leer los llamados.
 */
export const veLaPantallaCE = (p: Perfil) => gestionaConsultaExterna(p) || esCuentaEstacion(p) || esCuentaPantalla(p);

/** Vaciar lo que muestran todas las pantallas (pedido del usuario: solo el admin). */
export const limpiaPantallasCE = (p: Perfil) => esAdmin(p);

/**
 * Ve en Actualizaciones lo que registró cada persona, por día o rango (pedido
 * del usuario, 2026-11-23: solo el admin). = ROLES_VEN_ACTUALIZACIONES_EQUIPO en la API.
 */
export const veActualizacionesEquipoCE = (p: Perfil) => esAdmin(p);

/**
 * Escribe mensajes para las pantallas (/consulta-externa/mensajes). No espera
 * a EN_CONSTRUCCION: la cuenta de mensajes se usa ya (pedido del usuario, 2026-11-18).
 */
export const enviaMensajesCE = (p: Perfil) => gestionaConsultaExterna(p) || esCuentaEstacion(p) || esCuentaMensajes(p);

/** Adónde va la cuenta de pantalla al entrar al sistema. */
export const RUTA_PANTALLA_CE = "/consulta-externa/pantalla";

/** Adónde va Trabajo Social de Consulta Externa al entrar al sistema. */
export const RUTA_TRABAJO_SOCIAL_CE = "/consulta-externa/trabajo-social";

/** Adónde va la cuenta de mensajes al entrar al sistema: es su única página. */
export const RUTA_MENSAJES_CE = "/consulta-externa/mensajes";
