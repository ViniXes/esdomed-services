// Preparación de la agenda del día a partir del reporte leído: resuelve cada
// especialidad contra el catálogo y numera los códigos de llamado. Puro (sin
// Firestore), para poder probarlo: scripts/test-consulta-externa.mjs.

import {
  ESPECIALIDADES_CE,
  formatearCodigo,
  resolverEspecialidad,
  type EspecialidadCEId,
  type EstacionCEId,
} from "./especialidades";
import type { CitaLeida, ProgramacionLeida } from "./programacion";

export interface CitaPreparada extends CitaLeida {
  especialidadId: EspecialidadCEId;
  /** Nombre del catálogo (con tildes), no el del reporte. */
  especialidadNombre: string;
  estacionId: EstacionCEId;
  prefijo: string;
}

export interface CitaNumerada extends CitaPreparada {
  codigo: string;
  numero: number;
}

export interface ResumenEspecialidad {
  id: EspecialidadCEId;
  nombre: string;
  prefijo: string;
  estacionId: EstacionCEId;
  citas: number;
  primeraVez: number;
  sinDui: number;
  medicos: number;
}

export interface CargaPreparada {
  /** "YYYY-MM-DD"; vacío si el reporte no trae una fecha única. */
  fechaISO: string;
  citas: CitaPreparada[];
  /** Especialidades del reporte que no están en el catálogo: no se cargan. */
  noReconocidas: { especialidad: string; citas: number }[];
  resumen: ResumenEspecialidad[];
}

/** "13/11/2026" → "2026-11-13". */
export function fechaReporteAISO(fecha: string): string {
  const m = String(fecha ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** Id del documento de la cita: un expediente tiene una cita por especialidad y día. */
export function idCita(fechaISO: string, especialidadId: string, expediente: string): string {
  return `${fechaISO}_${especialidadId}_${expediente}`;
}

export function prepararCarga(programacion: ProgramacionLeida): CargaPreparada {
  const citas: CitaPreparada[] = [];
  const noReconocidas = new Map<string, number>();

  for (const c of programacion.citas) {
    const esp = resolverEspecialidad(c.especialidad);
    if (!esp) {
      noReconocidas.set(c.especialidad, (noReconocidas.get(c.especialidad) ?? 0) + 1);
      continue;
    }
    citas.push({ ...c, especialidadId: esp.id, especialidadNombre: esp.nombre, estacionId: esp.estacion, prefijo: esp.prefijo });
  }

  const porId = new Map<EspecialidadCEId, ResumenEspecialidad & { _medicos: Set<string> }>();
  for (const c of citas) {
    const r =
      porId.get(c.especialidadId) ??
      {
        id: c.especialidadId,
        nombre: c.especialidadNombre,
        prefijo: c.prefijo,
        estacionId: c.estacionId,
        citas: 0,
        primeraVez: 0,
        sinDui: 0,
        medicos: 0,
        _medicos: new Set<string>(),
      };
    r.citas += 1;
    if (c.primeraVez) r.primeraVez += 1;
    if (!c.dui) r.sinDui += 1;
    r._medicos.add(c.medico);
    porId.set(c.especialidadId, r);
  }

  // En el orden del catálogo, para que el resumen salga siempre igual.
  const resumen = ESPECIALIDADES_CE.flatMap((e) => {
    const r = porId.get(e.id);
    if (!r) return [];
    return [{
      id: r.id, nombre: r.nombre, prefijo: r.prefijo, estacionId: r.estacionId,
      citas: r.citas, primeraVez: r.primeraVez, sinDui: r.sinDui, medicos: r._medicos.size,
    }];
  });

  return {
    fechaISO: programacion.fechas.length === 1 ? fechaReporteAISO(programacion.fechas[0]) : "",
    citas,
    noReconocidas: [...noReconocidas].map(([especialidad, n]) => ({ especialidad, citas: n })),
    resumen,
  };
}

/**
 * Numera las citas nuevas por especialidad, siguiendo el último número ya
 * usado ese día. El orden es por inicio de franja y, dentro de la franja, el
 * del reporte: así los códigos bajos son los de más temprano. Las citas que se
 * agregan en una segunda carga siguen la numeración (nunca se renumera lo ya
 * cargado: el paciente pudo haber recibido su código).
 */
export function numerarNuevas(
  nuevas: CitaPreparada[],
  ultimoNumero: Partial<Record<EspecialidadCEId, number>>,
): { numeradas: CitaNumerada[]; ultimoNumero: Partial<Record<EspecialidadCEId, number>> } {
  const ultimo = { ...ultimoNumero };
  const ordenadas = [...nuevas].sort(
    (a, b) => a.franjaInicio.localeCompare(b.franjaInicio) || a.orden - b.orden,
  );
  const numeradas = ordenadas.map((c) => {
    const numero = (ultimo[c.especialidadId] ?? 0) + 1;
    ultimo[c.especialidadId] = numero;
    return { ...c, numero, codigo: formatearCodigo(c.prefijo, numero) };
  });
  return { numeradas, ultimoNumero: ultimo };
}
