import type { Timestamp } from "firebase/firestore";
import type { EspecialidadCEId, EstacionCEId } from "./especialidades";
import type { AccionCE, EstadoCitaCE, LlamadoPantalla } from "./circuito";

export type { EstadoCitaCE } from "./circuito";

// Documentos de Consulta Externa en Firestore.
//
//   consulta_externa_agendas/{YYYY-MM-DD}   contadores del día (1 lectura para el resumen)
//   consulta_externa_citas/{fecha}_{especialidad}_{expediente}
//   consulta_externa_llamados/{YYYY-MM-DD}  últimos llamados: lo único que escuchan las pantallas
//
// Solo se guarda lo que el turnero necesita: el reporte del SIS trae además
// teléfonos, responsable y dirección, que no se copian.

export interface PasoHistorialCE {
  accion: AccionCE;
  en: Timestamp;
  por: string;
  porUid: string;
}

export interface CitaCE {
  fecha: string;
  codigo: string;
  numero: number;
  especialidadId: EspecialidadCEId;
  /** Nombre del catálogo (con tildes). */
  especialidad: string;
  estacionId: EstacionCEId;
  expediente: string;
  dui: string;
  /** Como lo escribe el SIS: "Apellidos, Nombres". */
  paciente: string;
  tipoCita: string;
  primeraVez: boolean;
  fechaOtorgamiento: string;
  medico: string;
  consultorio: string;
  franjaInicio: string;
  franjaFin: string;
  estado: EstadoCitaCE;
  cargadaPor: string;
  cargadaPorNombre: string;
  cargadaEn: Timestamp | null;

  // ── Circuito (los escribe la estación o la recepción) ──
  llegadaEn?: Timestamp | null;
  llegadaPor?: string;
  llegadaPorUid?: string;
  /** Llamados al consultorio hechos, con repeticiones. */
  llamadas?: number;
  ultimoLlamadoEn?: Timestamp | null;
  historial?: PasoHistorialCE[];
  actualizadoEn?: Timestamp | null;
  actualizadoPor?: string;
  actualizadoPorNombre?: string;
}

export type CitaCEConId = CitaCE & { id: string };

export interface CargaAgendaCE {
  en: Timestamp;
  porUid: string;
  porNombre: string;
  archivo: string;
  nuevas: number;
  yaCargadas: number;
}

export interface AgendaCE {
  fecha: string;
  totalCitas: number;
  porEspecialidad: Partial<Record<EspecialidadCEId, number>>;
  /** Último número de código usado por especialidad; una carga posterior sigue desde aquí. */
  ultimoNumero: Partial<Record<EspecialidadCEId, number>>;
  cargas: CargaAgendaCE[];
}

export interface LlamadosCE {
  fecha: string;
  /** El más reciente primero; máximo MAX_LLAMADOS_PANTALLA. */
  ultimos: LlamadoPantalla[];
}
