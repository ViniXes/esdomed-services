// ============================================================================
// Términos y condiciones de uso — Herramienta de llenado SIMMOW
// ----------------------------------------------------------------------------
// Aviso específico de esta herramienta (generador de código de llenado para
// SIMMOW, flujos Atención Hospitalaria y Atención Ambulatoria), adicional a
// los términos generales del portal (ver src/lib/terminos.ts) — se piden los
// dos, uno no reemplaza al otro. Aplica a los roles que operan SIMMOW
// (esdomed, asistente_esdomed y admin).
//
// IMPORTANTE: cuando se modifique el contenido, súbase también
// TERMINOS_SIMMOW_VERSION. Eso vuelve a pedir la aceptación a todos los que
// ya la habían dado con la versión anterior.
// ============================================================================

/** Versión vigente. Al cambiarla, se vuelve a pedir la aceptación a todos. */
export const TERMINOS_SIMMOW_VERSION = "1.1";

/** Fecha de entrada en vigencia de la versión vigente (solo informativa). */
export const TERMINOS_SIMMOW_FECHA = "29 de julio de 2026";

export interface SeccionTerminos {
  titulo: string;
  parrafos: string[];
}

export const TERMINOS_SIMMOW_INTRO =
  "Esta sección del portal es una herramienta de apoyo para agilizar el llenado de los formularios de SIMMOW " +
  "(Ingreso/Edición de Egreso e Ingreso/Edición de Consulta Curativa / Atención Preventiva). Antes de usarla, lea y " +
  "acepte las siguientes condiciones, adicionales a los términos generales del portal que ya aceptó.";

export const TERMINOS_SIMMOW_SECCIONES: SeccionTerminos[] = [
  {
    titulo: "1. Qué hace esta herramienta",
    parrafos: [
      "A partir de los reportes/documentos que usted sube, la herramienta genera un código para pegar en la consola " +
        "del navegador (tecla F12) mientras tiene abierta la pantalla correspondiente de SIMMOW. Ese código llena " +
        "automáticamente los campos del formulario en pantalla, para que usted no tenga que digitarlos uno por uno.",
      "La herramienta NO inicia sesión en SIMMOW por usted, NO envía datos a SIMMOW ni a ningún otro sistema por su " +
        "cuenta, y NO presiona \"Grabar\". Todo el llenado ocurre dentro del propio navegador de SIMMOW, sobre la " +
        "sesión que usted ya abrió, y la acción de guardar la realiza siempre una persona, manualmente.",
    ],
  },
  {
    titulo: "2. Revisión obligatoria antes de grabar",
    parrafos: [
      "Después de pegar el código, usted debe revisar campo por campo que la información quedó correcta antes de " +
        "presionar \"Grabar\" en SIMMOW — comparándola contra el expediente, el reporte del SIS o el documento fuente, " +
        "según corresponda. La herramienta no reemplaza esa revisión ni la verificación manual que hoy ya hace el " +
        "personal de ESDOMED contra el SIS del hospital.",
      "Los campos que la herramienta no pudo completar por no venir en los datos de origen se muestran vacíos para " +
        "que usted los complete a mano en SIMMOW — no se inventan ni se asumen valores sin dejarlo claramente " +
        "advertido en la pantalla de revisión.",
    ],
  },
  {
    titulo: "3. Responsabilidad por la digitación",
    parrafos: [
      "Esta herramienta ayuda con la mayor parte del llenado, pero no es responsable de errores de digitación — esa " +
        "responsabilidad es del personal operativo que revisa y graba la información en SIMMOW, independientemente " +
        "de las facilidades que la herramienta ofrezca.",
      "Solo se asume responsabilidad por errores de programación de la herramienta que hayan sido reportados y " +
        "confirmados por quien la administra. Un error no reportado no puede subsanarse ni se asume por no haberse " +
        "dado a conocer a tiempo.",
      "En consecuencia, un dato mal digitado, un campo mal revisado o cualquier consecuencia derivada de no haber " +
        "verificado la información antes de grabarla en SIMMOW no puede atribuirse a un supuesto mal funcionamiento " +
        "de la herramienta. Al aceptar estos términos, usted reconoce que el uso de esta herramienta no constituye " +
        "justificación, atenuante ni excusa frente a observaciones, llamados de atención o medidas disciplinarias " +
        "derivadas de errores de digitación propios, salvo que se trate de un error de programación ya reportado y " +
        "confirmado conforme al párrafo anterior.",
    ],
  },
  {
    titulo: "4. Exclusión expresa de excusas frente a un dato mal digitado",
    parrafos: [
      "Al aceptar estos términos, usted reconoce expresamente que ninguna de las siguientes circunstancias exime, " +
        "atenúa ni justifica su responsabilidad personal por un dato mal digitado, mal revisado o mal grabado en " +
        "SIMMOW, y que la institución puede aplicar las medidas administrativas o disciplinarias que correspondan " +
        "sin que estas circunstancias constituyan defensa válida:",
      "• Que el reporte o documento fuente del SIS haya traído el dato incorrecto — verificar y corregir esa " +
        "información contra el expediente real del paciente antes de grabar es, precisamente, parte de su función.",
      "• Que no haya tenido tiempo suficiente para revisar el código generado — la revisión campo por campo antes " +
        "de presionar \"Grabar\" es un paso obligatorio de su cargo, no una actividad opcional sujeta a disponibilidad.",
      "• Que no haya leído o comprendido estos términos, o alguna instrucción de uso de la herramienta — usted tuvo " +
        "la oportunidad de consultar cualquier duda antes de aceptarlos, y su aceptación constituye una declaración " +
        "de haberlos comprendido en su totalidad.",
      "• Que el equipo, el navegador o la conexión hayan fallado o funcionado lento — un inconveniente técnico no " +
        "exime de revisar la información antes de grabarla; ante cualquier duda sobre si el llenado quedó completo, " +
        "debe verificarse manualmente antes de continuar.",
      "• Que no haya existido intención de causar el error — la responsabilidad por no revisar la información no " +
        "depende de la intención, sino del incumplimiento del deber de verificación que corresponde al cargo.",
      "• Que otro compañero, en una cuenta compartida o no, le haya indicado que la información estaba correcta — " +
        "la responsabilidad de quien revisa y graba la información en SIMMOW es personal e indelegable.",
      "• Que en ocasiones anteriores se haya digitado de forma similar sin observación alguna — la tolerancia o " +
        "falta de observación en casos previos no genera ningún derecho ni exime del cumplimiento de estas " +
        "condiciones en adelante.",
      "• Que se alegue, sin haberlo reportado antes por el canal oficial dispuesto para ello, que la herramienta " +
        "\"falló\" — solo constituye una posible excepción a su responsabilidad un error de programación reportado " +
        "por ese canal y confirmado por quien administra la herramienta, conforme a la sección 3. Un reporte hecho " +
        "después de haber grabado el dato incorrecto no borra la responsabilidad por ese dato ya grabado, aunque sí " +
        "sirve para prevenir que el mismo error se repita en adelante.",
    ],
  },
  {
    titulo: "5. Cómo reportar un error de la herramienta (reporte técnico, no un reclamo)",
    parrafos: [
      "Si detecta que un campo se llena mal de forma sistemática (no un dato de origen incorrecto, sino un error de " +
        "la herramienta), repórtelo de inmediato por el canal oficial dispuesto para ello, para que se corrija. " +
        "Mientras un error no se reporte por ese canal y se confirme, no se considera responsabilidad de la " +
        "herramienta conforme a las secciones 3 y 4.",
      "Este canal es exclusivamente un reporte técnico de un posible error de programación — no es un reclamo, " +
        "queja o solicitud formal de servicio, y su presentación no genera ningún derecho a una respuesta en un " +
        "plazo determinado ni a que el error, de confirmarse, se corrija de inmediato. Es simplemente la vía para " +
        "informar lo observado.",
      "Reportar oportunamente es también en su propio interés: es la única vía para que un fallo real de la " +
        "herramienta pueda contar a su favor. Guardarse la observación y usarla después, ya cometido el error, como " +
        "defensa no es una excusa válida conforme a la sección anterior.",
    ],
  },
  {
    titulo: "6. Confidencialidad de la información",
    parrafos: [
      "Los documentos y reportes que se suben a esta herramienta contienen datos personales y datos de salud de " +
        "pacientes. Su tratamiento sigue sujeto al deber de confidencialidad y a los términos generales del portal ya " +
        "aceptados — esta sección no los sustituye, los complementa.",
    ],
  },
  {
    titulo: "7. Naturaleza voluntaria de la herramienta",
    parrafos: [
      "Esta herramienta no forma parte de un sistema oficial del Ministerio de Salud ni de una obligación " +
        "contractual de ningún supervisor, jefe o encargado de ESDOMED — es una iniciativa voluntaria, desarrollada " +
        "en aras de la mejora continua del servicio, para facilitar (no sustituir) el trabajo que el personal ya " +
        "realiza en SIMMOW.",
      "En consecuencia, brindar, mantener, mejorar o continuar ofreciendo esta herramienta no es una obligación de " +
        "ningún supervisor o jefe. Su disponibilidad, funcionalidades o continuidad pueden modificarse, suspenderse o " +
        "descontinuarse en cualquier momento, sin que ello constituya incumplimiento de ninguna obligación laboral " +
        "ni le genere al personal derecho alguno a exigir su mantenimiento.",
      "Esta herramienta puede recibir ajustes conforme se detectan casos nuevos en los reportes o cambios en los " +
        "formularios reales de SIMMOW. El uso continuado implica la aceptación de la versión vigente de estos " +
        "términos; si se modifican de forma relevante, se le pedirá aceptarlos de nuevo al ingresar.",
    ],
  },
];
