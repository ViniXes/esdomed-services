import type { PreguntaEvaluacion } from "@/lib/evaluacionEnLinea";

// SOLO SERVIDOR (lo importa únicamente la API de la evaluación en línea).
// Las 3 claves tal cual los PDF de la jefatura ("clave_N_test_sin_respuestas")
// y la respuesta correcta de cada pregunta ("…_con_respuestas"), como índice
// de la opción (0 = A, 1 = B, 2 = C). Las respuestas nunca salen al navegador.

interface Clave {
  preguntas: PreguntaEvaluacion[];
  correctas: number[];
}

const A = 0, B = 1, C = 2;

export const CLAVES_EVALUACION: Record<number, Clave> = {
  1: {
    preguntas: [
      { texto: "¿Qué plazo tiene la jefatura para reportar por escrito a RRHH los cambios en la programación mensual?", opciones: ["Hasta el cierre del siguiente mes.", "Cinco días calendario después del cambio.", "Dos días hábiles posteriores al evento que ocasiona el cambio."] },
      { texto: "¿Cómo debe utilizarse el uniforme institucional cuando se tiene ese beneficio?", opciones: ["Completo durante el desarrollo de la jornada laboral.", "Únicamente con las piezas que el trabajador prefiera.", "Solo al inicio y al final del turno."] },
      { texto: "¿Para qué fines deben utilizarse los equipos informáticos institucionales?", opciones: ["Para cualquier actividad durante los tiempos libres.", "Para actividades laborales y negocios personales.", "Estrictamente para fines laborales."] },
      { texto: "¿Con cuánta anticipación debe solicitarse una misión oficial en el extranjero?", opciones: ["Con 5 días hábiles de anticipación al evento.", "Con 15 días hábiles de anticipación al evento.", "El mismo día de salida del país."] },
      { texto: "En atención directa a usuarios y familiares, ¿cómo deben mantenerse las uñas?", opciones: ["Se permiten uñas artificiales si se usan guantes.", "Con esmalte transparente y cualquier longitud.", "Cortas, limpias, sin sobrepasar el pulpejo y sin esmalte."] },
      { texto: "¿Cómo debe portarse el carnet de identificación dentro del hospital?", opciones: ["Guardado en el bolsillo durante la jornada.", "En un lugar visible.", "Visible únicamente al ingresar al establecimiento."] },
      { texto: "¿Qué condición permite que la jefatura programe 24 horas continuas de trabajo?", opciones: ["Solicitud del empleado, aunque no exista fuerza mayor.", "Fuerza mayor comprobable y autorización de la Subdirección del área.", "Acuerdo entre compañeros, sin otra autorización."] },
      { texto: "¿Puede el personal permanecer dentro de vehículos estacionados en las instalaciones del hospital?", opciones: ["Sí, si el vehículo es de su propiedad.", "Sí, durante cualquier descanso.", "No, está estrictamente prohibido."] },
      { texto: "¿Cuándo debe presentarse a RRHH una incapacidad emitida en los últimos tres días del mes?", opciones: ["A más tardar el primer día hábil del mes siguiente.", "Dentro de los siguientes quince días calendario.", "Hasta el último viernes del mes siguiente."] },
      { texto: "¿A quiénes se aplican obligatoriamente estos lineamientos?", opciones: ["Solo al personal que tiene atención directa al paciente.", "Solo al personal permanente.", "A todo el personal, sin importar la modalidad de contratación."] },
    ],
    correctas: [C, A, C, B, C, B, B, C, A, C],
  },
  2: {
    preguntas: [
      { texto: "Si se olvidan las marcaciones de entrada y salida de un mismo turno, ¿qué debe agregarse al trámite?", opciones: ["Ningún respaldo adicional al formulario.", "Una nota firmada únicamente por un compañero.", "Un informe de actividades realizadas suscrito por la jefatura inmediata."] },
      { texto: "¿Qué se exige para todo ingreso y salida del automóvil?", opciones: ["Mostrar cualquier código QR personal.", "Registrar solo la placa una vez al año.", "Presentar el QR extendido y autorizado por la institución."] },
      { texto: "Si un permiso se utiliza un jueves o viernes, ¿cuál es el plazo máximo previsto para presentarlo?", opciones: ["Hasta el viernes de la siguiente semana.", "Únicamente el mismo día en que se utilizó.", "Hasta el último día del siguiente mes."] },
      { texto: "Si la jefatura solicita homologar en el ISSS una incapacidad de médico particular, ¿cuándo debe iniciarse el trámite?", opciones: ["Cuando finalice el siguiente mes.", "Solo si la incapacidad supera treinta días.", "Inmediatamente después de recibir la solicitud de la jefatura."] },
      { texto: "¿Qué debe hacer el trabajador si su carnet se daña, pierde o extravía?", opciones: ["Esperar a la siguiente renovación anual sin reportarlo.", "Usar temporalmente el carnet de un compañero.", "Reportarlo a su jefatura y gestionar la reposición a través de RRHH."] },
      { texto: "¿Quién debe dar a conocer al personal el mismo plan de trabajo que se entrega a RRHH?", opciones: ["La jefatura inmediata.", "Exclusivamente la Subdirección Administrativa.", "Cada trabajador debe obtenerlo por su cuenta."] },
      { texto: "¿Quién controla la asistencia, permanencia y puntualidad del personal de cada área?", opciones: ["Únicamente el personal de seguridad.", "Cada empleado, sin supervisión de su jefatura.", "La jefatura de esa área."] },
      { texto: "¿Cuál de estas opciones cumple los requisitos del calzado?", opciones: ["Zapatos sin talón, aunque sean antideslizantes.", "Sandalias limpias y cómodas.", "Cerrado, resistente, impermeable, antideslizante, íntegro y limpio."] },
      { texto: "¿Con cuánta anticipación debe solicitarse la licencia por estudio?", opciones: ["El primer día de clases, sin trámite previo.", "Al menos una semana antes del inicio del ciclo.", "Al finalizar el primer mes del ciclo."] },
      { texto: "Cuando es posible marcar, ¿qué registro exige el lineamiento para el tiempo extra solicitado por la jefatura?", opciones: ["El inicio y la finalización en el sistema de marcación.", "Únicamente la hora de salida.", "Basta un acuerdo verbal, sin registro de marcación."] },
    ],
    correctas: [C, C, A, C, C, A, C, C, B, A],
  },
  3: {
    preguntas: [
      { texto: "¿Quién presenta la documentación de un movimiento en el plan de trabajo realizado por la jefatura para cubrir necesidades del servicio?", opciones: ["El empleado al que se le modifica el plan.", "El compañero que cubre el turno, sin intervención de la jefatura.", "La jefatura que realiza el movimiento."] },
      { texto: "¿Cuál de estas conductas está prohibida por los lineamientos?", opciones: ["Tratar con respeto al personal de seguridad y limpieza.", "Vender productos alimenticios o de cualquier tipo en oficinas administrativas.", "Usar los equipos informáticos para las labores asignadas."] },
      { texto: "¿Qué se requiere para dejar un vehículo en el hospital durante el fin de semana?", opciones: ["Autorización de la Subdirección Administrativa, previa solicitud del interesado.", "Ningún trámite si el dueño trabaja en el hospital.", "Únicamente avisar a un compañero."] },
      { texto: "¿Qué debe registrar todo empleado al cumplir su jornada de trabajo?", opciones: ["La entrada y la salida mediante los mecanismos establecidos.", "Solo la salida cuando trabaja de noche.", "Solo la entrada si cumple el turno completo."] },
      { texto: "Si cambia el horario de estudio autorizado, ¿qué debe hacer el empleado?", opciones: ["Informar únicamente al finalizar el ciclo.", "Notificar inmediatamente a RRHH y presentar los atestados de respaldo.", "Cambiar su permiso sin informar a RRHH."] },
      { texto: "¿Quién notifica a RRHH el regreso o la falta de reincorporación tras una licencia sin goce de salario?", opciones: ["Únicamente un compañero del trabajador.", "Nadie; RRHH debe asumir que el trabajador regresó.", "La jefatura, mediante memorándum o correo electrónico."] },
      { texto: "¿Está permitido salir del establecimiento para ir de compras usando traje quirúrgico, filipina o gabacha?", opciones: ["No, el lineamiento prohíbe ese uso para salir de compras.", "Sí, siempre que se porte el carnet.", "Sí, si las compras toman menos de diez minutos."] },
      { texto: "¿Hasta cuándo puede presentarse la licencia por cuido de pariente?", opciones: ["Hasta el primer turno al que deba presentarse tras finalizar el cuido, sin prórroga.", "En cualquier fecha del siguiente mes.", "Hasta quince días después de reincorporarse."] },
      { texto: "¿Cómo debe seleccionarse el equipo de protección personal?", opciones: ["Solo según la preferencia del trabajador.", "De acuerdo con el riesgo y la actividad que se realizará.", "Usando el mismo equipo para cualquier actividad, sin evaluar el riesgo."] },
      { texto: "¿Cómo deben llevar el cabello las trabajadoras que brindan atención directa a usuarios y familiares?", opciones: ["Suelto sobre los hombros durante los procedimientos.", "De cualquier forma, siempre que utilicen uniforme completo.", "Limpio, ordenado y recogido por encima del cuello, sin reajustes frecuentes."] },
    ],
    correctas: [C, B, A, A, B, C, A, A, B, C],
  },
};

export const NUMEROS_CLAVE = Object.keys(CLAVES_EVALUACION).map(Number);

/** Aciertos (1 punto cada uno). Una respuesta vacía o fuera de rango no suma. */
export function calificar(clave: number, respuestas: number[]): { puntaje: number; total: number } {
  const { correctas } = CLAVES_EVALUACION[clave];
  const puntaje = correctas.reduce((s, c, i) => s + (respuestas[i] === c ? 1 : 0), 0);
  return { puntaje, total: correctas.length };
}
