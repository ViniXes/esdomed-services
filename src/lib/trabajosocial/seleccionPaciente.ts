// Paciente seleccionado para trabajar en Seguimiento — y el traspaso entre vistas.
//
// El snapshot mínimo con lo que necesita una gestión. `ingresoId` es la ESTANCIA:
// un expediente puede tener N ingresos y la gestión pertenece a uno concreto.
//
// Traspaso: cuando Asignaciones manda a Seguimiento, el paciente YA está resuelto
// (la asignación guarda su nombre, servicio y cama), así que se entrega por
// sessionStorage y la hoja abre al instante y con CERO lecturas. El `?exp=` de la
// URL queda como respaldo para cuando se recarga o se comparte el enlace.

import type { EstadoPacienteGestion } from "./catalogos";

export interface SeleccionPaciente {
  expediente: string;
  nombre: string;
  servicio?: string;
  cama?: string;
  ingresoId?: string;
  estadoPaciente: EstadoPacienteGestion;
  familiar?: string;
  parentesco?: string;
  telefono?: string;
}

const LLAVE = "ts_seguimiento_abrir";

/** Deja el paciente listo para que Seguimiento lo abra en cuanto monte. */
export function pedirAperturaSeguimiento(s: SeleccionPaciente) {
  try {
    sessionStorage.setItem(LLAVE, JSON.stringify(s));
  } catch {
    /* sin sessionStorage se cae al ?exp= de la URL */
  }
}

/** Lo consume UNA vez (se borra al leerlo: no debe reabrirse al navegar de vuelta). */
export function tomarAperturaSeguimiento(): SeleccionPaciente | null {
  try {
    const raw = sessionStorage.getItem(LLAVE);
    if (!raw) return null;
    sessionStorage.removeItem(LLAVE);
    const s = JSON.parse(raw) as SeleccionPaciente;
    return s?.expediente ? s : null;
  } catch {
    return null;
  }
}
