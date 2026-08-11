import type {
  EstadoNotificacionConapinaFgr, TipoCasoConapinaFgr, InstanciaAviso,
  CondicionPacienteAviso, NotificacionConapinaFgr, DiagnosticoCIE,
} from "@/types";

// Catálogo y reglas de validación del módulo Lesiones intencionales
// (avisos CONAPINA / FGR). Vive aparte de los tipos porque lo comparten las
// tres vistas (médico notifica, bandeja de Psicología, ingresos por lesión) y
// así las etiquetas, colores y rangos CIE-10 no se duplican.

export const TIPO_CASO_LABEL: Record<TipoCasoConapinaFgr, string> = {
  violencia: "Violencia",
  accidente_transito: "Accidente de tránsito",
  intento_suicida: "Intento suicida",
};

// Descripción corta que ve el médico al elegir el tipo de caso.
export const TIPO_CASO_AYUDA: Record<TipoCasoConapinaFgr, string> = {
  violencia: "Física, sexual, psicológica, intrafamiliar, negligencia o maltrato.",
  accidente_transito: "Atropello, colisión, motocicleta u otro hecho de tránsito.",
  intento_suicida: "Lesión autoinfligida de forma intencional.",
};

export const TIPO_CASO_CHIP: Record<TipoCasoConapinaFgr, string> = {
  violencia:
    "text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/50 border-rose-200 dark:border-rose-800",
  accidente_transito:
    "text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 border-amber-200 dark:border-amber-800",
  intento_suicida:
    "text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/50 border-indigo-200 dark:border-indigo-800",
};

export const TIPOS_CASO: TipoCasoConapinaFgr[] = ["violencia", "accidente_transito", "intento_suicida"];

// Vocabulario del módulo: el estado se lee desde el punto de vista de Psicología
// ("por recibir" / "recibida" / "avisada"), no con el genérico
// Pendiente/Confirmado del componente Badge compartido. Por eso los chips se
// pintan aquí y no allá.
export const ESTADO_LABEL: Record<EstadoNotificacionConapinaFgr, string> = {
  pendiente: "Por recibir",
  confirmado: "Recibida",
  avisado: "Avisada",
  anulado: "Anulada",
};

export const ESTADO_CHIP: Record<EstadoNotificacionConapinaFgr, string> = {
  pendiente:
    "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900",
  confirmado:
    "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900",
  avisado:
    "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900",
  anulado:
    "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700",
};

export const INSTANCIA_LABEL: Record<InstanciaAviso, string> = {
  conapina: "CONAPINA",
  fiscalia: "Fiscalía",
  ambos: "Ambos",
};

export const INSTANCIAS: InstanciaAviso[] = ["conapina", "fiscalia", "ambos"];

export const CONDICION_LABEL: Record<CondicionPacienteAviso, string> = {
  vivo: "Vivo",
  fallecido: "Fallecido",
};

// Un paciente menor de edad implica aviso a CONAPINA además de la FGR. NO se
// decide aquí a qué instancia va el caso (eso lo asienta Psicología en el 3er
// tiempo): solo se marca la edad para que la bandeja lo priorice.
export const esMenorDeEdad = (edad: number | null | undefined) =>
  typeof edad === "number" && edad < 18;

// ── Validación de la nota ───────────────────────────────────────────────────
// Cuando no hay código CIE-10, la nota es el ÚNICO dato clínico del caso: exige
// contenido real, no un carácter suelto.
export const NOTA_MIN_SIN_CIE = 15;
export const NOTA_MAX = 1000;

// Mínimos de los campos del aviso externo (van al registro que audita MINSAL).
export const AVISO_RECIBIDO_POR_MIN = 3;
export const AVISO_LUGAR_MIN = 3;

// ── Clasificación CIE-10 de lesiones intencionales ──────────────────────────
// Un mismo criterio para dos usos: avisar al médico si la causa externa no
// concuerda con el tipo de caso, y detectar los ingresos por lesión intencional
// a partir del diagnóstico del expediente.
//   V01–V99  accidentes de transporte
//   X60–X84  lesiones autoinfligidas intencionalmente (intento suicida)
//   X85–Y09  agresiones · T74 síndromes del maltrato · Z04 examen tras denuncia
export function clasificarLesion(codigo?: string): TipoCasoConapinaFgr | null {
  const c = (codigo ?? "").replace(/\./g, "").toUpperCase();
  if (!c) return null;
  if (/^V\d/.test(c)) return "accidente_transito";
  if (/^(X6\d|X7\d|X8[0-4])/.test(c)) return "intento_suicida";
  if (/^T74/.test(c) || /^(X8[5-9]|X9\d|Y0\d)/.test(c) || /^Z04/.test(c)) return "violencia";
  return null;
}

// Solo AVISA: el diagnóstico principal suele ser la lesión (S/T) y la causa
// externa es opcional, así que una discrepancia nunca debe bloquear el envío.
export function causaExternaCoincide(tipo: TipoCasoConapinaFgr, codigo?: string): boolean {
  if (!codigo) return true;
  return clasificarLesion(codigo) === tipo;
}

export const CAUSA_EXTERNA_AVISO: Record<TipoCasoConapinaFgr, string> = {
  accidente_transito: "Para un hecho de tránsito se esperaría un código V01–V99.",
  violencia: "Para violencia se esperaría T74, X85–Y09 o Z04.",
  intento_suicida: "Para un intento suicida se esperaría un código X60–X84.",
};

// Clasifica un expediente por sus diagnósticos, en orden de especificidad: la
// causa externa manda sobre el diagnóstico clínico, porque el diagnóstico suele
// ser la lesión (fractura, trauma) y no el hecho que la produjo.
export function clasificarIngreso(p: {
  causaExterna?: DiagnosticoCIE | null;
  diagnosticoIngreso?: DiagnosticoCIE | null;
  ultimoDiagnostico?: DiagnosticoCIE | null;
}): { categoria: TipoCasoConapinaFgr; codigo: string; origen: string } | null {
  const fuentes: { d?: DiagnosticoCIE | null; origen: string }[] = [
    { d: p.causaExterna, origen: "Causa externa" },
    { d: p.diagnosticoIngreso, origen: "Diagnóstico de ingreso" },
    { d: p.ultimoDiagnostico, origen: "Último diagnóstico" },
  ];
  for (const { d, origen } of fuentes) {
    const categoria = clasificarLesion(d?.codigo);
    if (categoria) return { categoria, codigo: d!.codigo, origen };
  }
  return null;
}

// ── Fecha del hecho ─────────────────────────────────────────────────────────
// No se acota por la fecha de ingreso a propósito: el hecho casi siempre es
// anterior (por eso el paciente ingresó) y puede ser de meses atrás en violencia
// crónica detectada durante la estancia.
export function validarFechaHecho(valor: string, fechaNacimiento?: Date | null): string | null {
  if (!valor) return null;
  const d = new Date(valor + "T00:00:00");
  if (isNaN(d.getTime())) return "La fecha ingresada no es válida.";
  const hoy = new Date();
  hoy.setHours(23, 59, 59, 999);
  if (d > hoy) return "La fecha del hecho no puede estar en el futuro. Revisa el año.";
  if (fechaNacimiento && d < fechaNacimiento)
    return "La fecha del hecho no puede ser anterior al nacimiento del paciente.";
  return null;
}

// El aviso no puede darse en el futuro ni antes de que el hecho ocurriera.
export function validarFechaAviso(valor: string, fechaHecho?: Date | null): string | null {
  if (!valor) return null;
  const d = new Date(valor + "T00:00:00");
  if (isNaN(d.getTime())) return "La fecha ingresada no es válida.";
  const hoy = new Date();
  hoy.setHours(23, 59, 59, 999);
  if (d > hoy) return "La fecha del aviso no puede estar en el futuro.";
  if (fechaHecho) {
    const piso = new Date(fechaHecho);
    piso.setHours(0, 0, 0, 0);
    if (d < piso) return "El aviso no puede ser anterior a la fecha del hecho.";
  }
  return null;
}

// ── Duplicados ──────────────────────────────────────────────────────────────
// Se resuelve contra la lista que el cliente ya tiene cargada (0 lecturas
// extra): del lado del médico son sus propias notificaciones y del lado de
// Psicología son todas. Las anuladas no cuentan como duplicado.
export function duplicadosDeExpediente(
  lista: NotificacionConapinaFgr[],
  expediente: string,
  excluirId?: string,
): NotificacionConapinaFgr[] {
  const exp = expediente.trim().toLowerCase();
  if (!exp) return [];
  return lista.filter(
    n => n.id !== excluirId
      && n.estado !== "anulado"
      && (n.pacienteExpediente ?? "").trim().toLowerCase() === exp,
  );
}
