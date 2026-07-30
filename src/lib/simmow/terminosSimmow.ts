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
export const TERMINOS_SIMMOW_VERSION = "1.4";

/** Fecha de entrada en vigencia de la versión vigente (solo informativa). */
export const TERMINOS_SIMMOW_FECHA = "29 de julio de 2026";

export interface SeccionTerminos {
  titulo: string;
  parrafos: string[];
}

export const TERMINOS_SIMMOW_INTRO =
  "Esta sección del portal es una herramienta de apoyo para el llenado de los formularios de SIMMOW " +
  "(Ingreso/Edición de Egreso e Ingreso/Edición de Consulta Curativa / Atención Preventiva). Su objetivo principal " +
  "es mejorar la calidad de la digitación de ESDOMED en SIMMOW, reduciendo errores de transcripción — la agilidad " +
  "en el llenado es un beneficio adicional, no el propósito principal. Antes de usarla, lea y acepte las siguientes " +
  "condiciones, adicionales a los términos generales del portal que ya aceptó.";

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
    titulo: "2. Uso voluntario y complementario a la digitación humana",
    parrafos: [
      "El uso de esta herramienta NO es obligatorio. Es un apoyo opcional para quien quiera usarla — el personal que " +
        "prefiera digitar directamente en SIMMOW sin generar ni pegar el código puede seguir haciéndolo con toda " +
        "normalidad, sin que eso represente ninguna falta.",
      "Su desarrollo no busca sustituir la digitación humana, sino fortalecerla: reducir los errores de transcripción " +
        "y mejorar la calidad de la información que ESDOMED digita en SIMMOW, quitándole al personal la parte más " +
        "mecánica y repetitiva del llenado para que pueda concentrar su atención en revisar que el dato quede " +
        "correcto. La agilidad es un beneficio adicional, no el propósito principal. La decisión final sobre lo que " +
        "se graba en SIMMOW, y la responsabilidad sobre esa información, siempre son de la persona que lo graba — " +
        "use o no esta herramienta para ese llenado.",
      "Esta herramienta tampoco forma parte de un sistema oficial del Ministerio de Salud ni de una obligación " +
        "contractual de ningún supervisor, jefe o encargado de ESDOMED — es una iniciativa voluntaria, desarrollada " +
        "en aras de la mejora continua del servicio. En consecuencia, brindar, mantener o continuar ofreciéndola no " +
        "es una obligación de ningún supervisor o jefe: su disponibilidad, funcionalidades o continuidad pueden " +
        "modificarse, suspenderse o descontinuarse en cualquier momento, sin que ello genere al personal derecho " +
        "alguno a exigir su mantenimiento.",
    ],
  },
  {
    titulo: "3. Revisión obligatoria antes de grabar",
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
    titulo: "4. Responsabilidad por la digitación",
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
      "Cualquier medida administrativa o disciplinaria derivada de lo anterior se aplica conforme a la normativa " +
        "institucional del MINSAL y a las leyes de la administración pública aplicables al personal del hospital — " +
        "no queda al margen de ellas ni las reemplaza.",
    ],
  },
  {
    titulo: "5. Qué no exime de responsabilidad por un dato mal digitado",
    parrafos: [
      "Al aceptar estos términos, usted entiende que las siguientes circunstancias, por sí solas, no eximen ni " +
        "atenúan su responsabilidad personal por un dato mal digitado, mal revisado o mal grabado en SIMMOW, y que " +
        "la institución puede aplicar las medidas administrativas o disciplinarias que correspondan:",
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
        "por ese canal y confirmado por quien administra la herramienta, conforme a la sección 4. Un reporte hecho " +
        "después de haber grabado el dato incorrecto no borra la responsabilidad por ese dato ya grabado, aunque sí " +
        "sirve para prevenir que el mismo error se repita en adelante.",
    ],
  },
  {
    titulo: "6. Cómo reportar un error de la herramienta",
    parrafos: [
      "Si detecta que un campo se llena mal de forma sistemática (no un dato de origen incorrecto, sino un error de " +
        "la herramienta), repórtelo por el canal oficial dispuesto para ello, para que se pueda revisar y corregir. " +
        "Mientras un error no se reporte por ese canal y se confirme, no se considera responsabilidad de la " +
        "herramienta conforme a las secciones 4 y 5.",
      "Este canal sirve para informar posibles errores técnicos de programación — es un espacio de reporte, no una " +
        "solicitud formal de servicio con tiempos de respuesta garantizados. Aun así, cada reporte se toma en cuenta " +
        "para revisar y, si corresponde, mejorar la herramienta.",
      "Reportar oportunamente es también en su propio interés: es la única vía para que un fallo real de la " +
        "herramienta pueda contar a su favor. Guardarse la observación y usarla después, ya cometido el error, como " +
        "defensa no es una excusa válida conforme a la sección anterior.",
    ],
  },
  {
    titulo: "7. Confidencialidad de la información",
    parrafos: [
      "Los documentos y reportes que se suben a esta herramienta contienen datos personales y datos de salud de " +
        "pacientes. Su tratamiento sigue sujeto al deber de confidencialidad y a los términos generales del portal ya " +
        "aceptados — esta sección no los sustituye, los complementa.",
    ],
  },
  {
    titulo: "8. Mejora continua y vigencia",
    parrafos: [
      "Esta herramienta puede recibir ajustes conforme se detectan casos nuevos en los reportes o cambios en los " +
        "formularios reales de SIMMOW. El uso continuado implica la aceptación de la versión vigente de estos " +
        "términos; si se modifican de forma relevante, se le pedirá aceptarlos de nuevo al ingresar.",
    ],
  },
];
