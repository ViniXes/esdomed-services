// Reglas de negocio del módulo de Transporte que no dependen de la UI:
// choques de agenda, validación de odómetro y bitácora de auditoría.

import type { EventoViajeTransporte, ViajeTransporte } from "@/types";
import { CHECKLIST_ITEMS } from "./catalogos";

// ── Fechas y horas ────────────────────────────────────────────────────────────
export const hoyStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};

export const ahoraHHMM = (): string => new Date().toTimeString().slice(0, 5);

export const fmtFecha = (f?: string): string => {
  if (!f) return "—";
  const [y, m, d] = f.split("-");
  return y && m && d ? `${d}/${m}/${y}` : f;
};

// "HH:MM" → minutos desde medianoche (-1 si viene vacío o mal formado).
export const minutosDeHora = (hhmm?: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
};

// ── Choques de agenda ─────────────────────────────────────────────────────────
// Un viaje no declara duración, así que se asume una ventana alrededor de la
// hora solicitada: dos misiones del mismo vehículo o del mismo motorista dentro
// de esa ventana se consideran choque. No bloquea (a veces son dos mandados
// cortos seguidos), pero el jefe debe confirmarlo a propósito.
export const VENTANA_CONFLICTO_MIN = 90;

export interface ConflictosAsignacion {
  vehiculo: ViajeTransporte[];      // choques de agenda por vehículo
  motorista: ViajeTransporte[];     // choques de agenda por motorista
  vehiculoEnRuta?: ViajeTransporte; // el vehículo está en ruta ahora mismo (otro viaje sin cerrar)
  motoristaEnRuta?: ViajeTransporte;
}

export function hayConflictos(c: ConflictosAsignacion): boolean {
  return c.vehiculo.length > 0 || c.motorista.length > 0 || !!c.vehiculoEnRuta || !!c.motoristaEnRuta;
}

/**
 * Busca choques para una asignación propuesta contra los viajes activos
 * (pendiente/asignado/en_ruta) que el tablero ya tiene en memoria: 0 lecturas.
 */
export function detectarConflictos(
  viaje: ViajeTransporte,
  vehiculoId: string,
  motoristaId: string,
  activos: ViajeTransporte[],
): ConflictosAsignacion {
  const min = minutosDeHora(viaje.horaNecesita);
  const otros = activos.filter((v) => v.folio !== viaje.folio && v.estado !== "pendiente");

  const solapa = (v: ViajeTransporte) =>
    v.fechaNecesita === viaje.fechaNecesita &&
    min >= 0 &&
    minutosDeHora(v.horaNecesita) >= 0 &&
    Math.abs(minutosDeHora(v.horaNecesita) - min) < VENTANA_CONFLICTO_MIN;

  return {
    vehiculo: vehiculoId ? otros.filter((v) => v.vehiculoId === vehiculoId && solapa(v)) : [],
    motorista: motoristaId ? otros.filter((v) => v.motoristaId === motoristaId && solapa(v)) : [],
    vehiculoEnRuta: vehiculoId ? otros.find((v) => v.vehiculoId === vehiculoId && v.estado === "en_ruta") : undefined,
    motoristaEnRuta: motoristaId ? otros.find((v) => v.motoristaId === motoristaId && v.estado === "en_ruta") : undefined,
  };
}

// Resumen de una línea para dejarlo escrito en la bitácora del viaje.
export function resumirConflictos(c: ConflictosAsignacion): string {
  const partes: string[] = [];
  if (c.vehiculoEnRuta) partes.push(`vehículo en ruta en ${c.vehiculoEnRuta.folio}`);
  if (c.motoristaEnRuta) partes.push(`motorista en ruta en ${c.motoristaEnRuta.folio}`);
  if (c.vehiculo.length) partes.push(`vehículo cruzado con ${c.vehiculo.map((v) => v.folio).join(", ")}`);
  if (c.motorista.length) partes.push(`motorista cruzado con ${c.motorista.map((v) => v.folio).join(", ")}`);
  return partes.join("; ");
}

// ── Odómetro ──────────────────────────────────────────────────────────────────
// Un odómetro nunca retrocede: si el número es menor al último conocido se
// bloquea. Un salto grande no es imposible (viaje al oriente del país), así que
// solo se avisa.
export const SALTO_KM_SOSPECHOSO = 500;

export interface ValidacionKm {
  error?: string;   // impide guardar
  aviso?: string;   // deja guardar, pero advierte
}

export function validarKmSalida(km: number, kmActual?: number): ValidacionKm {
  if (!Number.isFinite(km) || km < 0) return { error: "Escribe el kilometraje del odómetro." };
  if (kmActual == null) return {};
  if (km < kmActual) {
    return { error: `El odómetro del vehículo marca ${kmActual.toLocaleString("es-SV")} km; la salida no puede ser menor.` };
  }
  const salto = km - kmActual;
  if (salto > SALTO_KM_SOSPECHOSO) {
    return { aviso: `Son ${salto.toLocaleString("es-SV")} km más que el último registro. Verifica el número.` };
  }
  return {};
}

export function validarKmEntrada(km: number, kmSalida?: number): ValidacionKm {
  if (!Number.isFinite(km) || km < 0) return { error: "Escribe el kilometraje del odómetro." };
  if (kmSalida == null) return {};
  if (km < kmSalida) {
    return { error: `Debe ser mayor o igual al kilometraje de salida (${kmSalida.toLocaleString("es-SV")} km).` };
  }
  const recorrido = km - kmSalida;
  if (recorrido > SALTO_KM_SOSPECHOSO) {
    return { aviso: `El recorrido daría ${recorrido.toLocaleString("es-SV")} km. Verifica el número.` };
  }
  return {};
}

// ── Bitácora de auditoría ─────────────────────────────────────────────────────
// `en` se sella con la hora del cliente a propósito: serverTimestamp() no se
// puede usar dentro de un array de Firestore.
export function eventoViaje(
  accion: EventoViajeTransporte["accion"],
  perfil: { uid: string; nombre: string },
  detalle?: string,
): EventoViajeTransporte {
  const e: EventoViajeTransporte = {
    en: new Date(),
    accion,
    porId: perfil.uid,
    porNombre: perfil.nombre,
  };
  if (detalle) e.detalle = detalle;
  return e;
}

export const ACCION_VIAJE_LABEL: Record<EventoViajeTransporte["accion"], string> = {
  creado: "Solicitud creada",
  asignado: "Asignado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
  en_ruta: "Salida registrada",
  finalizado: "Viaje finalizado",
  cerrado_por_jefe: "Cerrado por transporte",
  corregido: "Datos corregidos",
};

// ── Checklist ─────────────────────────────────────────────────────────────────
export function etiquetasItems(ids: string[] = []): string[] {
  return ids.map((id) => CHECKLIST_ITEMS.find((i) => i.id === id)?.label ?? id);
}
