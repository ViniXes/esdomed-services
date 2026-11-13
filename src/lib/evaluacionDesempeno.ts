// Evaluación del desempeño del personal ESDOMED (solo admin).
//
// Réplica del "Formulario de Evaluación del Desempeño para Personal Médico,
// Paramédico y de Enfermería" del MINSAL (4 páginas carta). Los textos de los
// factores, la tabla de valoración y los rangos son los oficiales TAL CUAL, con
// sus erratas ("prgramas", "simpre", "Normass"…): es un documento institucional
// y aquí solo se llenan sus blancos. No corregirlos sin que RRHH lo pida.
//
// Colecciones (ver firestore.rules, solo admin):
//   evaluaciones_desempeno/{id}           — una evaluación (snapshot de los datos al evaluar)
//   evaluaciones_desempeno_fichas/{uid}   — últimos datos laborales usados para esa persona
//                                           (DUI, cargos, partida, sueldo…) para precargar la próxima.

import type { UserProfile } from "@/types";
import { jefeDe } from "@/lib/inconsistenciasMarcacion/formato";

export const COLECCION_EVALUACIONES_DESEMPENO = "evaluaciones_desempeno";
export const COLECCION_FICHAS_EVALUACION = "evaluaciones_desempeno_fichas";

export type Opcion = "A" | "B" | "C" | "D";
export const OPCIONES: Opcion[] = ["A", "B", "C", "D"];

export type TipoIncidente = "F" | "D";

export interface FactorEvaluacion {
  numero: number;
  titulo: string;        // como va en el encabezado del factor
  etiquetaTabla: string; // como va en la Tabla de Valoración
  etiquetaCorta: string; // como va en "Factores que se observan" (página 3)
  definicion: string;
  descriptores: Record<Opcion, string>;
  puntos: Record<Opcion, number>;
}

export const FACTORES: FactorEvaluacion[] = [
  {
    numero: 1,
    titulo: "CALIDAD DE TRABAJO",
    etiquetaTabla: "1.- Calidad de Trabajo",
    etiquetaCorta: "1. Calidad de Trabajo",
    definicion:
      "Se refiere a la forma en que aplica los procedimientos de trabajo; el grado de eficiencia con que los realiza; el seguimiento que se le da a los mismos; la atención completa que brinda al usuario en los diferentes programas de salud en un ambiente de confianza y amabilidad.",
    descriptores: {
      A: "Es negligente en su trabajo. No se interesa en orientar al usuario sobre la atención que prestan los diferentes programas de salud.",
      B: "Casi siempre aplica correctamente los procedimientos de trabajo y les da seguimiento. Se interesa en orientar al usuario sobre la atención que prestan los prgramas de salud.",
      C: "Siempre aplica correctamente los procedimientos de trabajo, dándole seguimiento completo a los mismos. Pone mucho interés en orientar al usuario sobre la atención que prestan los programas de salud.",
      D: "Aplica con precisión y exactitud los procedimientos de trabajo, aprovechando al máximo el uso de los recursos con que cuenta, siempre esta actualizado en las nuevas técnicas de su trabajo. Pone interés especial en la atención que brinda al usuario, tanto en el área de su competencia como en otras áreas.",
    },
    puntos: { A: 0, B: 7, C: 14, D: 21 },
  },
  {
    numero: 2,
    titulo: "RESPONSABILIDAD",
    etiquetaTabla: "2.- Responsabilidad",
    etiquetaCorta: "2. Responsabilidad",
    definicion:
      "Es el grado de compromiso, dedicación, interés y preocupación que tiene el empleado en la ejecución de sus funciones y ante la institucion misma.",
    descriptores: {
      A: "Siempre evade las obligaciones de puesto de trabajo, muestra apatía y desinterés por el mismo.",
      B: "Casi siempre cumple con las obligaciones de su puesto de trabajo, algunas veces no muestra interés por lo tanto, no logra concluirlas oportunamente.",
      C: "Cumple con las obligaciones de su puesto de trabajo con verdadero interés. Logra concluirlas oportunamente.",
      D: "Siempre cumple con todas las obligaciones de su puesto de trabajo y con otras que le sean encomendadas, además demuestra interés por iniciativa propia.",
    },
    puntos: { A: 0, B: 6, C: 12, D: 18 },
  },
  {
    numero: 3,
    titulo: "CUMPLIMIENTO DE METAS",
    etiquetaTabla: "3.- Cumplimiento de Metas",
    etiquetaCorta: "3. Cumplimiento de Metas",
    definicion: "Es la forma metódica y sistemática de realizar el trabajo a fín de alcanzar los resultados esperados en forma oportuna.",
    descriptores: {
      A: "Con frecuencia no alcanza a cumplir con las metas que le son asignadas, ni en el tiempo estipulado.",
      B: "Generalmente cumple con las metas que le son asignadas.\nPresenta dificultades para lograrlo en el tiempo encomendado.",
      C: "Cumple con las metas que le son encomendadas en el tiempo establecido. No presenta dificultades para lograrlo.",
      D: "Cumple con exactitud las metas que le son asignadas en menos tiempo de lo estipulado, lo que le permite apoyar el trabajo de otras áreas.",
    },
    puntos: { A: 0, B: 5, C: 10, D: 15 },
  },
  {
    numero: 4,
    titulo: "ORGANIZACION DE SU TRABAJO",
    etiquetaTabla: "4.- Organización de su Trabajo",
    etiquetaCorta: "4. Organización de su Trabajo",
    definicion: "Se refiere a la habilidad con que organiza y coordina los recursos de que dispone, a fín de obtener resultados ágiles y oportunos.",
    descriptores: {
      A: "Pierde mucho tiempo por la falta de orden en su trabajo, lo cual dificulta el cumplimiento del mismo.",
      B: "Distribuye el trabajo en forma adecuada pero no simpre lo hace en el tiempo oportuno.",
      C: "Es organizado. Habitualmente es oportuno con su trabajo. Puede ejecutar tareas adicionales dentro de su jornada ordinaria.",
      D: "Organiza perfectamente su trabajo, aprovecha muy bien su tiempo, es oportuno. Puede disponer de tiempo para colaborar con otros.",
    },
    puntos: { A: 0, B: 4, C: 8, D: 12 },
  },
  {
    numero: 5,
    titulo: "CUMPLIMIENTO DE NORMAS E INSTRUCCIONES",
    etiquetaTabla: "5.- Cumplimiento de Normass e Instrucciones",
    etiquetaCorta: "5. Cumplimiento de Normas e Instrucciones",
    definicion:
      "Se refiere al grado de cumplimiento de leyes, reglamento y normas de la institución e instrucciones emanadas de las jefaturas correspondientes. Asímismo de la puntualidad y en general de toda disposición aplicable al correcto desempeño.",
    descriptores: {
      A: "Incurre constantemente en faltas relacionadas con el cumpllimiento de leyes, normas e instrucciones de niveles superiores. Incumple los horarios de trabajo establecidos.",
      B: "Generalmente cumple con las leyes, normas, instrucciones y otras disposiciones reglamentarias. Eventualmente incumple los hrarios de trabajo establecidos.",
      C: "Cumple con la s leyes, normas, instrucciones y otras disposiciones reglamentarias sin ninguna dificultad. No presenta problemas de disciplina.",
      D: "Su acata.miento de las leyes, normas e instrucciones de niveles superiores es ejemplar, así como la disciplina (Asistencia, permanencia, puntualidad y conducta) observada durante su desempeño.",
    },
    puntos: { A: 0, B: 3, C: 6, D: 9 },
  },
  {
    numero: 6,
    titulo: "DISCRECION",
    etiquetaTabla: "6.- Discreción",
    etiquetaCorta: "6. Discreción.",
    definicion: "Es el grado de reserva y confidencialidad con que maneja la información de su trabajo y de la institución en general.",
    descriptores: {
      A: "No es reservado en el manjeo de la información relacionada con su trabajo y con su trabajo y con información institucional que llega a su puesto.",
      B: "Mantiene la reserva necesaria en relación a la información de su trabajo y de la institución.\nEventualmente comete alguna indiscreción.",
      C: "Es prudente en el manejo de la información de su trabajo y de la institución para la cual labora. No comete ninguna indiscreción.",
      D: "Totalmente reservado en el manejo de información de su trabajo y de la institución, lo que fortalece su ética profesional. Siempre digno de confianza.",
    },
    puntos: { A: 0, B: 2, C: 4, D: 6 },
  },
  {
    numero: 7,
    titulo: "RELACIONES LABORALES",
    etiquetaTabla: "7.- Relaciones Laborales",
    etiquetaCorta: "7. Relaciones Laborales.",
    definicion:
      "Es la actitud que tiene el empleado en sus relaciones laborales con jefes, compañeros y el grado de atención que se brinda al usuario de los servicios de salud.",
    descriptores: {
      A: "Tiene dificultad con sus jefes y compañeros. Casi siempre existen quejas por parte de los usuarios por la mala atención de los servicios.",
      B: "Las relaciones que mantiene con sus jefes y compañeros son aceptables. La atención que brinda a los usuarios es adecuada, pero en algunas ocasiones presenta actitudes negativas.. Algunas veces existen quejas.",
      C: "Mantiene buenas relaciones con jefes y compañeros. Casi siempre brinda la atención adecuada a los usuarios de los servicios. Rara vez existe inconformidad por parte del usuario, que puede solventarse con facilidad.",
      D: "Desarrolla magnificas relaciones con sus jefes y compañeros. Brinda una esmerada atención en los servicios, inspira confianza. El usuario queda totalmente satisfecho.",
    },
    puntos: { A: 0, B: 1, C: 2, D: 3 },
  },
];

/**
 * Formulario para personal ADMINISTRATIVO (mismo MINSAL: misma estructura,
 * puntos y rangos; cambian los factores y sus textos). Textos tal cual, con sus
 * erratas ("maximiznado", "armonia nia", "Normass").
 */
export const FACTORES_ADMINISTRATIVO: FactorEvaluacion[] = [
  {
    numero: 1,
    titulo: "CALIDAD DE TRABAJO",
    etiquetaTabla: "1.- Calidad de Trabajo",
    etiquetaCorta: "1. Calidad de Trabajo",
    definicion:
      "Se refiere al cuidado, nitidez y exactitud con que realiza su trabajo, utilizando adecuadamente los recursos y eliminando el desperdicio en terminos materiales, tiempo y costo.",
    descriptores: {
      A: "Casi siempre es necesario que rectifique su trabajo. Necesita mucha supervisión.",
      B: "Eventualmente comete errores, que son fácilmente corregidos. Necesita poca supervisión.",
      C: "No comete errores. Trabaja con precisión y oportunidad. No necesita supervisión directa.",
      D: "Trabajo que excede a la normalidad, realizado con máximo grado de precisión, oportunidad y exactitud.",
    },
    puntos: { A: 0, B: 7, C: 14, D: 21 },
  },
  {
    numero: 2,
    titulo: "PRODUCTIVIDAD",
    etiquetaTabla: "2.- Productividad",
    etiquetaCorta: "2. Productividad",
    definicion:
      "Se evalua el rendimiento de trabajo efectivo generado por el empleado durante un tiempo estipulado, de conformidad con las asignaciones que recibe, maximiznado el uso de los recursos y eliminando pérdida de tiempo.",
    descriptores: {
      A: "Con frecuencia no alcanza a cumplir con la cantidad de trabajo asignado. Siempre está atrasado. En repetidas ocasiones se le proporciona adiestramiento.",
      B: "Cumple con el trabajo que le es asignado, algunas veces se atrasa. Eventualmente necesita adiestramiento, en alguna etapa de su trabajo.",
      C: "Cumple con los trabajos asignados. Siempre está al día. Utiliza adecuadamente los recursos; conoce bien su trabajo y no necesita adiestramiento.",
      D: "Conoce a la perfección su trabajo, lo que le permite realizarlo en menor tiempo del asignado, a la vez que maximiza los recursos. Realiza tareas adicionales a las encomendadas.",
    },
    puntos: { A: 0, B: 6, C: 12, D: 18 },
  },
  {
    numero: 3,
    titulo: "RESPONSABILIDAD",
    etiquetaTabla: "3.- Responsabilidad",
    etiquetaCorta: "3. Responsabilidad",
    definicion: "Es el grado de compromiso, dedicación, interés y preocupación que tiene el empleado en la ejecución de sus funciones y ante la Institución misma.",
    descriptores: {
      A: "Generalmente no cumple con las responsabilidades de su puesto de trabajo, muestra apatía y desinteres. Necesita que se le incentive.",
      B: "Cumple sus funciones, sin embargo a veces no logra concluirlas oportunamente.",
      C: "Demuestra interés y cumple con las actividades de su puesto de trabajo.",
      D: "Cumple con las responsabilidades de su puesto y otras que le son encomendadas.",
    },
    puntos: { A: 0, B: 5, C: 10, D: 15 },
  },
  {
    numero: 4,
    titulo: "INICIATIVA Y CREATIVIDAD",
    etiquetaTabla: "4.- Iniciativa y Creatividad",
    etiquetaCorta: "4. Iniciativa y Creatividad",
    definicion:
      "Evalúa la capacidad del empleado para proponer cambios que mejoren los métodos de trabajo, enfrentar y resolver problemas, aportando soluciones a los mismos. Puede considerarse también, la forma en que actúa para afrontar situaciones no rutinarias.",
    descriptores: {
      A: "No aporta nuevas ideas ni demuestra interés por mejorar el trabajo, por lo general se guia por la rutina.",
      B: "Algunas veces aporta ideas que contribuyen a mejorar el trabajo. Tiene capacidad, pero es necesario su jefe inmediato le presione.",
      C: "Aporta ideas y sugerencias que contribuyen a mejorar su trabajo y solucionar problemas. No requiere de presiones para desarrollar su potencialidad.",
      D: "Permanentemente propone cambios, aporta ideas y sugerencias prácticas que permiten la solución de problemas e innovaciones a su trabajo y al de otras áreas.",
    },
    puntos: { A: 0, B: 4, C: 8, D: 12 },
  },
  {
    numero: 5,
    titulo: "CUMPLIMIENTO DE NORMAS E INSTRUCCIONES",
    etiquetaTabla: "5.- Cumplimiento de Normass e Instrucciones",
    etiquetaCorta: "5. Cumplimiento de Normas e Instrucciones",
    definicion:
      "Es el cumplimiento de normas institucionales e instrucciones emanadas por los jefes. En general de todas las disposiciones reglamentarias y de las aplicacion de las mismas, con especial apego a la puntualidad en el horario de trabajo.",
    descriptores: {
      A: "Reincide en incumplir algunas normas y reglamentos especialmente la puntualidad a los horarios de su jornada laboral.",
      B: "Cumple ordenes e instrucciones. En algunas ocasiones presenta problemas de disciplina y puntualidad en su jornada laboral.",
      C: "Cumple con las normas y reglamentos vigentes sin dificultad, acata las ordenes e instrucciones que recibe. No presenta problemas de incumplimiento de horarios ni disciplina.",
      D: "Su acatamiento de las normas e instrucciones es ejemplar, así como la disciplina (asistencia, permanencia y puntualidad en su jornada laboral y conducta), es intachable.",
    },
    puntos: { A: 0, B: 3, C: 6, D: 9 },
  },
  {
    numero: 6,
    titulo: "RELACIONES LABORALES",
    etiquetaTabla: "6.- Relaciones Laborales",
    etiquetaCorta: "6. Relaciones Laborales",
    definicion:
      "Es la forma de comportarse del empleado con respeto, consideración, buena disposición y prestando ayuda en las relaciones laborales con jefes, compañeros de trabajo y/o visitantes de la Institución.",
    descriptores: {
      A: "Presenta dificultades en las relaciones con sus jefes, compañeros y/o visitantes, adopta actitudes negativas. Tiene poca disposición con sus jefes y presta poca ayuda a sus compañeros.",
      B: "Tiene buenas relaciones con sus jefes, compañeros y/o visitantes, algunas veces presenta dificultades que son fácilmente manejables.",
      C: "Mantiene muy buenas relaciones con jefes, compañeros y/o visitantes. Tiene muy buena disposición con sus jefes y al solicitarle colaboración la presta con gusto.",
      D: "Desarrolla su trabajo en total armonia nia con sus jefes, compañeros y/o visitantes. Mantiene total disposición con sus jefes y presta colaboración a sus compañeros sin que sea solicitada",
    },
    puntos: { A: 0, B: 2, C: 4, D: 6 },
  },
  {
    numero: 7,
    titulo: "DISCRECION",
    etiquetaTabla: "7.- Discreción",
    etiquetaCorta: "7. Discreción",
    definicion:
      "Actitud del empleado para actuar con moderación, sensatez y tacto en el manejo de la información relacionada con su puesto de trabajo y de la institución en general.",
    descriptores: {
      A: "Indiscreto con la información relacionada con su trabajo y con información institucional que llega a su puesto.",
      B: "Mantiene la reserva necesaria en relación a la información de su trabajo y la de la institución, eventualmente comete alguna indiscreción.",
      C: "Es reservado en el manejo de la información de su trabajo y de la institución, no comete indiscreción.",
      D: "Totalmente reservado en el manejo de información de su trabajo y de la institución, por lo que siempre se considera digno de confianza.",
    },
    puntos: { A: 0, B: 1, C: 2, D: 3 },
  },
];

/** "mpe" = Médico, paramédico y de enfermería (el de casi todo el personal); "administrativo". */
export type FormatoEvaluacion = "mpe" | "administrativo";

export const FORMATOS: Record<FormatoEvaluacion, { nombre: string; titulo: string; factores: FactorEvaluacion[] }> = {
  mpe: { nombre: "Médico, paramédico y de enfermería", titulo: "MEDICO, PARAMEDICO Y DE ENFERMERIA", factores: FACTORES },
  administrativo: { nombre: "Administrativo", titulo: "ADMINISTRATIVO", factores: FACTORES_ADMINISTRATIVO },
};

export const factoresDe = (formato?: FormatoEvaluacion | null) => FORMATOS[formato ?? "mpe"].factores;

/**
 * Personal que se evalúa con el formulario ADMINISTRATIVO (decisión de la
 * jefatura). Por uid; el editor permite cambiar el formato de cualquier
 * evaluación si hace falta.
 */
export const FORMATO_ADMINISTRATIVO_UIDS: Record<string, string> = {
  DdrwgkBxCtSm7bRFNlIOJTQjAr92: "Boris Andree Quintanilla",
  gZwWfKaYDmTZavHW6vMmATorhMN2: "Violeta Sarai Castro Orellana",
};

export const formatoPorDefecto = (uid: string): FormatoEvaluacion => (uid in FORMATO_ADMINISTRATIVO_UIDS ? "administrativo" : "mpe");

export const PUNTAJE_MAXIMO = FACTORES.reduce((s, f) => s + f.puntos.D, 0); // 84 (igual en los dos formatos)

export type Calificacion = "Excelente" | "Muy Bueno" | "Bueno" | "Insatisfactorio";
export const CALIFICACIONES: Calificacion[] = ["Excelente", "Muy Bueno", "Bueno", "Insatisfactorio"];

/** Rangos tal cual la tabla "Calificación por puntos y por rangos". */
export const RANGOS: { calificacion: Calificacion; texto: string; min: number }[] = [
  { calificacion: "Excelente", texto: "De 73 a 84 puntos", min: 73 },
  { calificacion: "Muy Bueno", texto: "De 56 a 72 puntos", min: 56 },
  { calificacion: "Bueno", texto: "De 28 a 55 puntos", min: 28 },
  { calificacion: "Insatisfactorio", texto: "Hasta 27 puntos", min: 0 },
];

export type RespuestasFactores = Partial<Record<number, Opcion>>;

export function puntajeDe(respuestas: RespuestasFactores): number {
  return FACTORES.reduce((s, f) => {
    const r = respuestas[f.numero];
    return s + (r ? f.puntos[r] : 0);
  }, 0);
}

export const factoresCompletos = (respuestas: RespuestasFactores) => FACTORES.every((f) => !!respuestas[f.numero]);

export function calificacionDe(puntaje: number): Calificacion {
  return (RANGOS.find((r) => puntaje >= r.min) ?? RANGOS[RANGOS.length - 1]).calificacion;
}

// ── Datos generales (sección I) ──────────────────────────────────────────────

export interface DatosGeneralesEvaluacion {
  dependencia: string;
  periodo: string;             // "JUL - DIC 2026"
  dui: string;
  nombre: string;
  cargoNombramiento: string;
  cargoFunciones: string;
  aPartirDe: string;
  fechaIngreso: string;        // como se escribe en el formulario: "13/9/2021"
  partida: string;
  subnumero: string;
  sueldo: string;              // "719.72" (se imprime con "$")
  jefeNombre: string;
  jefePuesto: string;
  unidadAdministrativa: string;
}

/** Lo que se recuerda por persona entre evaluaciones (sin periodo ni nombre). */
export type FichaEvaluacion = Omit<DatosGeneralesEvaluacion, "periodo" | "nombre">;

export interface IncidenteCritico {
  fecha: string;      // "YYYY-MM-DD"
  factor: number;     // 1..7
  tipo: TipoIncidente;
  descripcion: string;
}

/** Filas del Registro de Incidentes Críticos impreso (página 3). */
export const FILAS_INCIDENTES = 14;

export interface EvaluacionDesempeno {
  id?: string;
  empleadoId: string;
  empleadoNombre: string;
  periodo: string;
  datos: DatosGeneralesEvaluacion;
  respuestas: RespuestasFactores;
  puntaje: number;
  calificacion: Calificacion | null; // null mientras falten factores
  incidentes: IncidenteCritico[];
  observacionesIncidentes: string;
  tiempoSupervisar: string;
  comentariosEvaluador: string;
  fechaEvaluador: string;            // "YYYY-MM-DD" o vacío (se llena a mano)
  fechaJefeSuperior: string;
  comentariosEvaluado: string;
  fechaEvaluado: string;
  acciones: string;
  fechaAcciones: string;
  /** Foto del respaldo de Services al guardar (ver evaluacionDesempenoRespaldo.ts). */
  respaldo?: import("@/lib/evaluacionDesempenoRespaldo").ResumenRespaldo | null;
  /** Formulario usado; ausente = "mpe" (las evaluaciones anteriores a los formatos). */
  formato?: FormatoEvaluacion;
  /** Votos de los supervisores mientras estuvo en curso: solo sugerencia (ver evaluacionDesempenoVotacion.ts). */
  votos?: import("@/lib/evaluacionDesempenoVotacion").VotosEvaluacion;
  creadoPorId: string;
  creadoPorNombre: string;
  creadoEn: Date;
  actualizadoEn: Date;
}

// ── Precarga ─────────────────────────────────────────────────────────────────

const MESES_CORTOS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

/** Semestre en curso, como se escribe en el formulario: "JUL - DIC 2026". */
export function periodoSemestral(fecha = new Date()): string {
  const primero = fecha.getMonth() < 6;
  return `${primero ? MESES_CORTOS[0] : MESES_CORTOS[6]} - ${primero ? MESES_CORTOS[5] : MESES_CORTOS[11]} ${fecha.getFullYear()}`;
}

/** Solo hay dos periodos de evaluación al año, siempre los mismos. */
export const SEMESTRES = ["ENE - JUN", "JUL - DIC"] as const;
export type Semestre = (typeof SEMESTRES)[number];

export function partirPeriodo(periodo: string): { semestre: Semestre; anio: number } {
  const m = /^(ENE - JUN|JUL - DIC)\s+(\d{4})$/.exec(periodo.trim());
  if (m) return { semestre: m[1] as Semestre, anio: Number(m[2]) };
  const actual = periodoSemestral();
  return partirPeriodo(actual);
}

export const armarPeriodo = (semestre: Semestre, anio: number) => `${semestre} ${anio}`;

/** Años del selector: desde 2026 (arranque de la app) hasta el siguiente al actual. */
export function aniosEvaluacion(fecha = new Date()): number[] {
  const hasta = fecha.getFullYear() + 1;
  const desde = Math.min(2026, fecha.getFullYear());
  return Array.from({ length: hasta - desde + 1 }, (_, i) => hasta - i);
}

type PersonaPrecarga = Pick<UserProfile, "uid" | "nombre" | "dui" | "puesto" | "codigoMarcacion">;

/**
 * Datos generales precargados: lo último que se usó con esta persona (ficha)
 * manda; si no hay ficha, lo que trae su perfil (nombre, DUI, puesto) y el
 * jefe inmediato del personal ESDOMED (jefeDe).
 */
export function datosPrecargados(persona: PersonaPrecarga, ficha: Partial<FichaEvaluacion> | null, periodo: string): DatosGeneralesEvaluacion {
  const jefe = jefeDe(persona.codigoMarcacion);
  const puesto = (persona.puesto ?? "").trim();
  return {
    dependencia: ficha?.dependencia || "ESDOMED",
    periodo,
    dui: ficha?.dui || persona.dui || "",
    nombre: persona.nombre.toLocaleUpperCase("es"),
    cargoNombramiento: ficha?.cargoNombramiento || puesto,
    cargoFunciones: ficha?.cargoFunciones || puesto.toLocaleUpperCase("es"),
    aPartirDe: ficha?.aPartirDe || "",
    fechaIngreso: ficha?.fechaIngreso || "",
    partida: ficha?.partida || "",
    subnumero: ficha?.subnumero || "",
    sueldo: ficha?.sueldo || "",
    jefeNombre: ficha?.jefeNombre || jefe.nombre,
    jefePuesto: ficha?.jefePuesto || jefe.cargo,
    unidadAdministrativa: ficha?.unidadAdministrativa || "",
  };
}

export function fichaDesdeDatos(d: DatosGeneralesEvaluacion): FichaEvaluacion {
  const { periodo: _p, nombre: _n, ...ficha } = d;
  void _p;
  void _n;
  return ficha;
}

/** "2026-11-10" → "10/11/2026" (vacío si no hay fecha). */
export function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || "";
}
