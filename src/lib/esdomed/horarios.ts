// Catálogo CERRADO de códigos de horario de ESDOMED.
//
// Espejo de la hoja "HORARIOS" del formato oficial (ESDOMED.xlsx). Cada código
// define una jornada con hora de entrada, salida y total de horas. El asistente
// administrativo asigna estos códigos a cada empleado por día en el plan mensual.
//
// NO se teclea a mano: este catálogo se generó desde el Excel. Si RH agrega
// códigos nuevos, regenerar desde la hoja HORARIOS.

export type TipoHorario =
  | "Administrativo"
  | "Medico Administrativo"
  | "Turno Operativo"
  | "Turno Hospitalario";

export interface Horario {
  codigo: string;   // "MA2", "TH34", ... — llave única
  tipo: TipoHorario;
  entrada: string;  // "7:00 am"
  salida: string;   // "3:00 pm"
  horas: number;    // horas de trabajo de la jornada
}

export const HORARIOS: Horario[] = [
  { codigo: "AD1", tipo: "Administrativo", entrada: "7:30 am", salida: "3:30 pm", horas: 8 },
  { codigo: "MA1", tipo: "Medico Administrativo", entrada: "6:30 am", salida: "2:30 pm", horas: 8 },
  { codigo: "MA2", tipo: "Medico Administrativo", entrada: "7:00 am", salida: "3:00 pm", horas: 8 },
  { codigo: "MA3", tipo: "Medico Administrativo", entrada: "7:30 am", salida: "3:30 pm", horas: 8 },
  { codigo: "MA4", tipo: "Medico Administrativo", entrada: "8:00 am", salida: "4:00 pm", horas: 8 },
  { codigo: "MA5", tipo: "Medico Administrativo", entrada: "8:30 am", salida: "4:30 pm", horas: 8 },
  { codigo: "MA6", tipo: "Medico Administrativo", entrada: "9:00 am", salida: "5:00 pm", horas: 8 },
  { codigo: "MA7", tipo: "Medico Administrativo", entrada: "10:00 am", salida: "6:00 pm", horas: 8 },
  { codigo: "MA8", tipo: "Medico Administrativo", entrada: "11:00 am", salida: "7:00 pm", horas: 8 },
  { codigo: "TO1", tipo: "Turno Operativo", entrada: "7:00 am", salida: "7:00 am", horas: 24 },
  { codigo: "TO2", tipo: "Turno Operativo", entrada: "3:00 pm", salida: "7:00 am", horas: 16 },
  { codigo: "TO3", tipo: "Turno Operativo", entrada: "6:00 am", salida: "6:00 pm", horas: 12 },
  { codigo: "TO4", tipo: "Turno Operativo", entrada: "6:00 pm", salida: "6:00 am", horas: 12 },
  { codigo: "TO5", tipo: "Turno Operativo", entrada: "6:00 am", salida: "2:00 pm", horas: 8 },
  { codigo: "TO6", tipo: "Turno Operativo", entrada: "10:00 am", salida: "6:00 pm", horas: 8 },
  { codigo: "TO7", tipo: "Turno Operativo", entrada: "1:30 pm", salida: "10:30 pm", horas: 9 },
  { codigo: "TO8", tipo: "Turno Operativo", entrada: "8:00 am", salida: "12:00 pm", horas: 4 },
  { codigo: "TO9", tipo: "Turno Operativo", entrada: "8:00 am", salida: "4:00 pm", horas: 8 },
  { codigo: "TO10", tipo: "Turno Operativo", entrada: "7:00 am", salida: "5:00 pm", horas: 10 },
  { codigo: "TO11", tipo: "Turno Operativo", entrada: "5:00 pm", salida: "7:00 am", horas: 14 },
  { codigo: "TO12", tipo: "Turno Operativo", entrada: "6:00 am", salida: "6:00 am", horas: 24 },
  { codigo: "TO13", tipo: "Turno Operativo", entrada: "2:00 pm", salida: "6:00 am", horas: 16 },
  { codigo: "TO14", tipo: "Turno Operativo", entrada: "11:00 pm", salida: "7:00 am", horas: 8 },
  { codigo: "TO15", tipo: "Turno Operativo", entrada: "3:00 pm", salida: "11:00 pm", horas: 8 },
  { codigo: "TO16", tipo: "Turno Operativo", entrada: "11:00 am", salida: "7:00 pm", horas: 8 },
  { codigo: "TO17", tipo: "Turno Operativo", entrada: "7:30 am", salida: "11:30 am", horas: 4 },
  { codigo: "TO18", tipo: "Turno Operativo", entrada: "7:30 am", salida: "3:30 pm", horas: 8 },
  { codigo: "TO19", tipo: "Turno Operativo", entrada: "10:30 pm", salida: "12:30 pm", horas: 14 },
  { codigo: "TH1", tipo: "Turno Hospitalario", entrada: "7:00 am", salida: "11:00 am", horas: 4 },
  { codigo: "TH2", tipo: "Turno Hospitalario", entrada: "8:00 am", salida: "12:00 pm", horas: 4 },
  { codigo: "TH3", tipo: "Turno Hospitalario", entrada: "9:00 am", salida: "12:00 pm", horas: 3 },
  { codigo: "TH4", tipo: "Turno Hospitalario", entrada: "1:00 pm", salida: "4:00 pm", horas: 3 },
  { codigo: "TH5", tipo: "Turno Hospitalario", entrada: "7:00 am", salida: "1:00 pm", horas: 6 },
  { codigo: "TH6", tipo: "Turno Hospitalario", entrada: "11:00 am", salida: "5:00 pm", horas: 6 },
  { codigo: "TH7", tipo: "Turno Hospitalario", entrada: "1:00 pm", salida: "7:00 pm", horas: 6 },
  { codigo: "TH8", tipo: "Turno Hospitalario", entrada: "6:00 am", salida: "3:00 pm", horas: 9 },
  { codigo: "TH9", tipo: "Turno Hospitalario", entrada: "8:00 am", salida: "4:00 pm", horas: 8 },
  { codigo: "TH10", tipo: "Turno Hospitalario", entrada: "9:00 am", salida: "5:00 pm", horas: 8 },
  { codigo: "TH11", tipo: "Turno Hospitalario", entrada: "10:00 am", salida: "7:00 pm", horas: 9 },
  { codigo: "TH12", tipo: "Turno Hospitalario", entrada: "10:00 am", salida: "6:00 pm", horas: 8 },
  { codigo: "TH13", tipo: "Turno Hospitalario", entrada: "1:30 pm", salida: "10:30 pm", horas: 9 },
  { codigo: "TH14", tipo: "Turno Hospitalario", entrada: "3:00 pm", salida: "12:00 am", horas: 9 },
  { codigo: "TH15", tipo: "Turno Hospitalario", entrada: "10:00 pm", salida: "7:00 am", horas: 9 },
  { codigo: "TH16", tipo: "Turno Hospitalario", entrada: "6:30 am", salida: "5:30 pm", horas: 11 },
  { codigo: "TH17", tipo: "Turno Hospitalario", entrada: "7:00 am", salida: "5:00 pm", horas: 10 },
  { codigo: "TH18", tipo: "Turno Hospitalario", entrada: "6:00 am", salida: "5:00 pm", horas: 11 },
  { codigo: "TH19", tipo: "Turno Hospitalario", entrada: "6:00 am", salida: "6:00 pm", horas: 12 },
  { codigo: "TH20", tipo: "Turno Hospitalario", entrada: "7:00 am", salida: "7:00 pm", horas: 12 },
  { codigo: "TH21", tipo: "Turno Hospitalario", entrada: "6:00 pm", salida: "6:00 am", horas: 12 },
  { codigo: "TH22", tipo: "Turno Hospitalario", entrada: "7:00 pm", salida: "7:00 am", horas: 12 },
  { codigo: "TH23", tipo: "Turno Hospitalario", entrada: "8:00 pm", salida: "8:00 am", horas: 12 },
  { codigo: "TH24", tipo: "Turno Hospitalario", entrada: "5:00 am", salida: "7:00 pm", horas: 14 },
  { codigo: "TH25", tipo: "Turno Hospitalario", entrada: "5:00 pm", salida: "7:00 am", horas: 14 },
  { codigo: "TH26", tipo: "Turno Hospitalario", entrada: "5:30 am", salida: "8:30 pm", horas: 15 },
  { codigo: "TH27", tipo: "Turno Hospitalario", entrada: "5:00 am", salida: "8:30 pm", horas: 15.5 },
  { codigo: "TH28", tipo: "Turno Hospitalario", entrada: "7:00 am", salida: "10:00 pm", horas: 15 },
  { codigo: "TH29", tipo: "Turno Hospitalario", entrada: "3:00 pm", salida: "7:00 am", horas: 16 },
  { codigo: "TH30", tipo: "Turno Hospitalario", entrada: "4:00 pm", salida: "8:00 am", horas: 16 },
  { codigo: "TH31", tipo: "Turno Hospitalario", entrada: "1:00 pm", salida: "7:00 am", horas: 18 },
  { codigo: "TH32", tipo: "Turno Hospitalario", entrada: "11:00 am", salida: "7:00 am", horas: 20 },
  { codigo: "TH33", tipo: "Turno Hospitalario", entrada: "7:00 am", salida: "5:00 am", horas: 22 },
  { codigo: "TH34", tipo: "Turno Hospitalario", entrada: "7:00 am", salida: "7:00 am", horas: 24 },
  { codigo: "TH35", tipo: "Turno Hospitalario", entrada: "6:00 am", salida: "6:00 am", horas: 24 },
  { codigo: "TH36", tipo: "Turno Hospitalario", entrada: "8:00 am", salida: "8:00 am", horas: 24 },
  { codigo: "TH37", tipo: "Turno Hospitalario", entrada: "6:00 am", salida: "2:00 pm", horas: 8 },
  { codigo: "TH38", tipo: "Turno Hospitalario", entrada: "3:00 pm", salida: "6:00 am", horas: 15 },
  { codigo: "TH39", tipo: "Turno Hospitalario", entrada: "7:00 am", salida: "6:00 am", horas: 23 },
  { codigo: "TH40", tipo: "Turno Hospitalario", entrada: "5:00 am", salida: "6:30 pm", horas: 13.5 },
  { codigo: "TH41", tipo: "Turno Hospitalario", entrada: "5:00 am", salida: "8:00 pm", horas: 15 },
  { codigo: "TH42", tipo: "Turno Hospitalario", entrada: "5:00 am", salida: "7:30 pm", horas: 14.5 },
  { codigo: "TH43", tipo: "Turno Hospitalario", entrada: "6:00 am", salida: "8:30 pm", horas: 14.5 },
  { codigo: "TH44", tipo: "Turno Hospitalario", entrada: "6:00 am", salida: "5:30 pm", horas: 11.5 },
  { codigo: "TH45", tipo: "Turno Hospitalario", entrada: "5:30 am", salida: "5:30 pm", horas: 12 },
  { codigo: "TH46", tipo: "Turno Hospitalario", entrada: "6:00 am", salida: "5:00 pm", horas: 11 },
  { codigo: "TH47", tipo: "Turno Hospitalario", entrada: "12:30 pm", salida: "8:30 pm", horas: 8 },
  { codigo: "TH48", tipo: "Turno Hospitalario", entrada: "8:00 am", salida: "11:00 am", horas: 3 },
  { codigo: "TH49", tipo: "Turno Hospitalario", entrada: "1:00 pm", salida: "9:00 am", horas: 20 },
  { codigo: "TH50", tipo: "Turno Hospitalario", entrada: "6:00 am", salida: "8:00 pm", horas: 14 },
  { codigo: "TH51", tipo: "Turno Hospitalario", entrada: "6:00 am", salida: "4:00 pm", horas: 10 },
  { codigo: "TH52", tipo: "Turno Hospitalario", entrada: "5:30 am", salida: "2:30 am", horas: 9 },
  { codigo: "TH53", tipo: "Turno Hospitalario", entrada: "8:00 am", salida: "10:00 am", horas: 2 },
  { codigo: "TH54", tipo: "Turno Hospitalario", entrada: "12:00 pm", salida: "7:00 am", horas: 19 },
  { codigo: "TH55", tipo: "Turno Hospitalario", entrada: "1:30 pm", salida: "7:30 pm", horas: 6 },
  { codigo: "TH56", tipo: "Turno Hospitalario", entrada: "7:30 am", salida: "11:30 am", horas: 4 },
  { codigo: "TH57", tipo: "Turno Hospitalario", entrada: "4:00 pm", salida: "12:00 am", horas: 8 },
  { codigo: "TH58", tipo: "Turno Hospitalario", entrada: "4:00 pm", salida: "6:00 am", horas: 14 },
  { codigo: "TH59", tipo: "Turno Hospitalario", entrada: "12:00 pm", salida: "8:00 pm", horas: 8 },
  { codigo: "TH60", tipo: "Turno Hospitalario", entrada: "2:00 pm", salida: "8:00 am", horas: 18 },
  { codigo: "TH61", tipo: "Turno Hospitalario", entrada: "4:00 pm", salida: "11:00 pm", horas: 7 },
  { codigo: "TH62", tipo: "Turno Hospitalario", entrada: "2:00 pm", salida: "8:00 pm", horas: 6 },
  { codigo: "TH63", tipo: "Turno Hospitalario", entrada: "2:00 pm", salida: "7:00 pm", horas: 5 },
  { codigo: "TH64", tipo: "Turno Hospitalario", entrada: "8:00 am", salida: "2:00 pm", horas: 6 },
  { codigo: "TH65", tipo: "Turno Hospitalario", entrada: "5:30 am", salida: "6:00 pm", horas: 12.5 },
  { codigo: "TH66", tipo: "Turno Hospitalario", entrada: "6:00 am", salida: "10:00 am", horas: 4 },
  { codigo: "TH67", tipo: "Turno Hospitalario", entrada: "6:00 am", salida: "1:00 pm", horas: 7 },
  { codigo: "TH68", tipo: "Turno Hospitalario", entrada: "6:00 am", salida: "2:00 pm", horas: 8 },
  { codigo: "TH69", tipo: "Turno Hospitalario", entrada: "8:00 am", salida: "3:30 pm", horas: 7.5 },
  { codigo: "TH70", tipo: "Turno Hospitalario", entrada: "11:30 am", salida: "7:30 pm", horas: 8 },
  { codigo: "TH71", tipo: "Turno Hospitalario", entrada: "9:30 am", salida: "8:30 pm", horas: 11 },
  { codigo: "TH72", tipo: "Turno Hospitalario", entrada: "11:00 am", salida: "7:00 pm", horas: 8 },
  { codigo: "TH73", tipo: "Turno Hospitalario", entrada: "5:30 am", salida: "7:30 pm", horas: 14 },
  { codigo: "TH74", tipo: "Turno Hospitalario", entrada: "5:30 am", salida: "3:30 pm", horas: 10 },
  { codigo: "TH75", tipo: "Turno Hospitalario", entrada: "10:30 am", salida: "8:30 pm", horas: 10 },
  { codigo: "TH76", tipo: "Turno Hospitalario", entrada: "6:30 am", salida: "5:30 pm", horas: 11 },
  { codigo: "TH77", tipo: "Turno Hospitalario", entrada: "6:30 am", salida: "8:30 pm", horas: 14 },
  { codigo: "TH78", tipo: "Turno Hospitalario", entrada: "6:30 am", salida: "6:00 pm", horas: 11.5 },
  { codigo: "TH79", tipo: "Turno Hospitalario", entrada: "7:00 pm", salida: "5:00 am", horas: 10 },
  { codigo: "TH80", tipo: "Turno Hospitalario", entrada: "7:00 am", salida: "4:00 pm", horas: 9 },
  { codigo: "TH81", tipo: "Turno Hospitalario", entrada: "7:00 am", salida: "11:00 pm", horas: 16 },
  { codigo: "TH82", tipo: "Turno Hospitalario", entrada: "7:00 am", salida: "12:00 pm", horas: 5 },
  { codigo: "TH83", tipo: "Turno Hospitalario", entrada: "5:00 am", salida: "10:00 am", horas: 5 },
  { codigo: "TH84", tipo: "Turno Hospitalario", entrada: "5:00 am", salida: "1:00 pm", horas: 8 },
  { codigo: "TH85", tipo: "Turno Hospitalario", entrada: "3:30 pm", salida: "8:30 pm", horas: 5 },
  { codigo: "TH86", tipo: "Turno Hospitalario", entrada: "9:00 am", salida: "7:00 am", horas: 22 },
  { codigo: "TH87", tipo: "Turno Hospitalario", entrada: "5:00 pm", salida: "5:00 am", horas: 12 },
  { codigo: "TH88", tipo: "Turno Hospitalario", entrada: "8:00 am", salida: "7:00 am", horas: 23 },
  { codigo: "TH89", tipo: "Turno Hospitalario", entrada: "8:00 am", salida: "1:00 pm", horas: 5 },
  { codigo: "TH90", tipo: "Turno Hospitalario", entrada: "5:00 am", salida: "3:00 pm", horas: 10 },
  { codigo: "TH91", tipo: "Turno Hospitalario", entrada: "3:00 pm", salida: "9:00 pm", horas: 6 },
  { codigo: "TH92", tipo: "Turno Hospitalario", entrada: "3:00 pm", salida: "8:00 pm", horas: 5 },
  { codigo: "TH93", tipo: "Turno Hospitalario", entrada: "12:00 pm", salida: "4:00 pm", horas: 4 },
  { codigo: "TH94", tipo: "Turno Hospitalario", entrada: "7:00 am", salida: "3:00 pm", horas: 8 },
  { codigo: "TH95", tipo: "Turno Hospitalario", entrada: "8:00 pm", salida: "7:00 am", horas: 11 },
  { codigo: "TH96", tipo: "Turno Hospitalario", entrada: "9:00 am", salida: "3:00 pm", horas: 6 },
  { codigo: "TH97", tipo: "Turno Hospitalario", entrada: "6:30 pm", salida: "6:30 am", horas: 12 },
  { codigo: "TH98", tipo: "Turno Hospitalario", entrada: "1:00 pm", salida: "5:00 pm", horas: 4 },
  { codigo: "TH99", tipo: "Turno Hospitalario", entrada: "8:00 am", salida: "8:00 pm", horas: 12 },
  { codigo: "TH100", tipo: "Turno Hospitalario", entrada: "5:30 am", salida: "8:00 pm", horas: 14.2 },
  { codigo: "TH101", tipo: "Turno Hospitalario", entrada: "6:30 am", salida: "6:30 pm", horas: 12 },
  { codigo: "TH102", tipo: "Turno Hospitalario", entrada: "7:00 am", salida: "3:00 pm", horas: 32 },
  { codigo: "TH103", tipo: "Turno Hospitalario", entrada: "5:00 pm", salida: "11:00 pm", horas: 6 },
  { codigo: "TH104", tipo: "Turno Hospitalario", entrada: "6:00 pm", salida: "11:00 pm", horas: 5 },
  { codigo: "TH105", tipo: "Turno Hospitalario", entrada: "5:30 am", salida: "1:30 pm", horas: 8 },
  { codigo: "TH106", tipo: "Turno Hospitalario", entrada: "6:00 am", salida: "12:00 pm", horas: 6 },
  { codigo: "TH107", tipo: "Turno Hospitalario", entrada: "12:00 pm", salida: "6:00 pm", horas: 6 },
  { codigo: "TH108", tipo: "Turno Hospitalario", entrada: "6:00 am", salida: "7:00 pm", horas: 13 },
];

// ── Marcas especiales (no son códigos de jornada) ──────────────────────────
// Se guardan en la celda igual que un código, pero no cuentan horas trabajadas.
export type MarcaEspecial = "VAC" | "INC" | "PER" | "ASU" | "LIC" | "MAT";

export const MARCAS_ESPECIALES: { codigo: MarcaEspecial; label: string; descripcion: string }[] = [
  { codigo: "VAC", label: "Vacaciones", descripcion: "Día de vacaciones" },
  { codigo: "INC", label: "Incapacidad", descripcion: "Día de incapacidad" },
  { codigo: "PER", label: "Permiso", descripcion: "Permiso (con o sin goce)" },
  { codigo: "ASU", label: "Asueto", descripcion: "Asueto / día festivo (Día de la Madre, del Padre, etc.)" },
  { codigo: "LIC", label: "Licencia", descripcion: "Licencia (los roles de otras áreas la marcan como \"L\")" },
  { codigo: "MAT", label: "Maternidad", descripcion: "Licencia por maternidad" },
];

// El valor de una celda: código de horario, marca especial, o "" (descanso).
export type CeldaHorario = string;

const MAPA_HORARIOS: Record<string, Horario> = Object.fromEntries(
  HORARIOS.map((h) => [h.codigo, h]),
);

const MAPA_MARCAS: Record<string, { codigo: MarcaEspecial; label: string; descripcion: string }> =
  Object.fromEntries(MARCAS_ESPECIALES.map((m) => [m.codigo, m]));

/** Busca un código en el catálogo de jornadas. */
export function getHorario(codigo: string | null | undefined): Horario | undefined {
  if (!codigo) return undefined;
  return MAPA_HORARIOS[codigo.trim().toUpperCase()];
}

export function esMarcaEspecial(codigo: string | null | undefined): codigo is MarcaEspecial {
  if (!codigo) return false;
  return codigo.trim().toUpperCase() in MAPA_MARCAS;
}

export function labelMarca(codigo: string): string {
  return MAPA_MARCAS[codigo.trim().toUpperCase()]?.label ?? codigo;
}

/** Horas que aporta una celda al total trabajado (marcas especiales = 0). */
export function horasDeCelda(codigo: CeldaHorario | null | undefined): number {
  const h = getHorario(codigo);
  return h ? h.horas : 0;
}

/** Cuenta los días de una marca especial dentro de una fila de asignaciones. */
export function contarMarca(asignaciones: CeldaHorario[], marca: MarcaEspecial): number {
  return asignaciones.filter((c) => (c ?? "").trim().toUpperCase() === marca).length;
}

/** Total de horas trabajadas en una fila (ignora marcas y descansos). */
export function totalHorasFila(asignaciones: CeldaHorario[]): number {
  return asignaciones.reduce((acc, c) => acc + horasDeCelda(c), 0);
}

/** Texto descriptivo de una celda para vistas (no para impresión). */
export function describirCelda(codigo: CeldaHorario | null | undefined): string {
  const valor = (codigo ?? "").trim();
  if (!valor) return "Descanso";
  const h = getHorario(valor);
  if (h) return `${h.entrada} – ${h.salida}`;
  if (esMarcaEspecial(valor)) return labelMarca(valor);
  return valor;
}

export const HORARIOS_POR_TIPO: { tipo: TipoHorario; codigos: Horario[] }[] = (() => {
  const tipos: TipoHorario[] = [
    "Administrativo",
    "Medico Administrativo",
    "Turno Operativo",
    "Turno Hospitalario",
  ];
  return tipos.map((tipo) => ({ tipo, codigos: HORARIOS.filter((h) => h.tipo === tipo) }));
})();
