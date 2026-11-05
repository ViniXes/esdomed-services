import { claveServicio, mismaCama, resolverServicioCanonico } from "@/lib/servicios";
import type { FilaOcupacion } from "./ocupacionCamasXlsx";

export interface AmbienteOcupacion {
  fila: number;
  filaTotal: number;
  especialidad: string;
  /** Nombre tal como lo exige el formulario de MINSAL. */
  ambiente: string;
  /** Nombre en el catálogo de servicios. */
  servicio: string;
  tipo: FilaOcupacion["tipo"];
}

const noCensable = (
  fila: number, filaTotal: number, ambiente: string, servicio: string, especialidad = "Medicina Interna",
): AmbienteOcupacion => ({ fila, filaTotal, especialidad, ambiente, servicio, tipo: "noCensable" });

const censable = (
  fila: number, filaTotal: number, ambiente: string, servicio: string, especialidad = "Medicina Interna",
): AmbienteOcupacion => ({ fila, filaTotal, especialidad, ambiente, servicio, tipo: "censable" });

/** Filas del formulario, en su orden. No agregar ni quitar: MINSAL lo prohíbe. */
export const AMBIENTES_OCUPACION: AmbienteOcupacion[] = [
  noCensable(13, 32, "Centro quirúrgico", "Centro Quirúrgico", "Cirugía General"),
  noCensable(14, 20, "Unidad de Cuidados Intensivos Aislados", "Unidad de cuidados intensivos aislados Adultos"),
  noCensable(15, 21, "Unidad de Cuidados Intensivos Quirúrgica", "Unidad de Cuidados Intensivos Quirúrgicos Adultos"),
  noCensable(16, 22, "Unidad de Cuidados Intensivos General 1", "Unidad de cuidados intensivos General 1 Adultos"),
  noCensable(17, 23, "Unidad de Cuidados Coronarios y Postquirúrgicos Cardiovasculares (UCCP)", "Unidad de Cuidados Coronarios y Posquirúrgicos Cardiovasculares"),
  noCensable(18, 24, "Unidad de Cuidados Intensivos Extracorpórea", "Unidad de Cuidados Intensivos Extracorpórea Adultos"),
  noCensable(19, 25, "Unidad de Cuidados Neurointensivos", "Unidad de Cuidados Neurointensivos Adultos"),
  noCensable(20, 26, "Unidad de Cuidados Intensivos Cardiovascular", "Unidad de cuidados intensivos cardiovascular Adultos"),
  noCensable(21, 27, "Unidad de Cuidados Intermedios Agudos", "Unidad de Cuidados Intermedios Adultos MINSAL"),
  noCensable(22, 28, "Unidad de Cuidados Intermedios Crónicos", "Unidad de Cuidados Intermedios Crónicos Adultos"),
  noCensable(23, 29, "Unidad de Cuidados Intermedios Aislados", "Unidad de Cuidados Intermedios Aislados Adultos"),
  noCensable(24, 30, "Unidad de Cuidados Intensivos Convenios (ISBM)", "Unidad de Cuidados Intensivos Adultos BM"),
  noCensable(25, 31, "Unidad de Cuidados Intermedios Convenios (ISBM)", "Unidad de Cuidados Intermedios Adultos BM"),
  noCensable(26, 33, "Terapias sanguíneas extracorpórea", "Terapias Sanguíneas Extracorpórea"),
  noCensable(27, 34, "Unidad de evaluacion y observacion medica", "Unidad de Evaluacion y Observación Medica"),
  noCensable(28, 35, "Quimioterapia ambulatoria", "Quimioterapia Ambulatoria"),
  noCensable(29, 36, "Unidad de Terapia Intervencionista Endovascular", "Unidad de Terapia Intervencionista Endovascular"),
  censable(30, 16, "Cirugía hombres 1", "Cirugía Hombres 1", "Cirugía General"),
  censable(31, 17, "Cirugía mujeres 1", "Cirugía Mujeres 1", "Cirugía General"),
  censable(32, 18, "Cirugia cardiovascular", "Cirugía Cardiovascular", "Cirugía General"),
  censable(33, 19, "Neurocirugia", "Neurocirugia", "Cirugía General"),
  censable(34, 3, "Medicina Interna Hombres 1", "Medicina Interna Hombres 1"),
  censable(35, 4, "Medicina Interna Hombres 2", "Medicina Interna Hombres 2"),
  censable(36, 5, "Medicina Interna Hombres 3", "Medicina Interna Hombres 3"),
  censable(37, 6, "Medicina Interna Mujeres 1", "Medicina Interna Mujeres 1"),
  censable(38, 7, "Medicina Interna Mujeres 2", "Medicina Interna Mujeres 2"),
  censable(39, 8, "Medicina Interna Mujeres 3", "Medicina Interna Mujeres 3"),
  censable(40, 9, "Servicio de Cardiologia", "Servicio de Cardiologia"),
  censable(41, 10, "Servicio de Hematologia", "Servicio de Hematologia"),
  censable(42, 11, "Servicio de Aislados", "Servicio de Aislados"),
  censable(43, 12, "Servicio de Oncología", "Servicio de Oncologia"),
  censable(44, 13, "Dolor y Cuidados paliativos", "Dolor y cuidados Paliativos"),
  censable(45, 14, "Dialisis Peritoneal", "Dialisis Peritoneal"),
  censable(46, 15, "Bienestar Magisterial", "Bienestar Magisterial"),
];

export interface ServicioCatalogo {
  nombre: string;
  camas: string[];
  camasExtra?: string[];
}

export interface PacienteEnCama {
  servicio: string;
  cama?: string;
}

export type FilaReporte = FilaOcupacion & AmbienteOcupacion;

const SERVICIOS_DEL_REPORTE = AMBIENTES_OCUPACION.map((a) => a.servicio);

/** Cruza el catálogo vivo con los pacientes activos. Los activos de un servicio
 *  que el formulario no contempla (p. ej. Emergencia) se devuelven aparte. */
export function armarOcupacion(catalogo: ServicioCatalogo[], activos: PacienteEnCama[]) {
  const filas: FilaReporte[] = AMBIENTES_OCUPACION.map((ambiente) => {
    const servicio = catalogo.find((s) => claveServicio(s.nombre) === claveServicio(ambiente.servicio));
    const extras = servicio?.camasExtra?.length ?? 0;
    return {
      ...ambiente,
      oficiales: (servicio?.camas.length ?? 0) - extras,
      extras,
      ocupadas: 0,
      ocupadasExtra: 0,
    };
  });

  const fuera = new Map<string, number>();
  for (const paciente of activos) {
    const canonico = resolverServicioCanonico(paciente.servicio, SERVICIOS_DEL_REPORTE);
    const fila = filas.find((f) => f.servicio === canonico);
    if (!fila) {
      const nombre = paciente.servicio || "Sin servicio";
      fuera.set(nombre, (fuera.get(nombre) ?? 0) + 1);
      continue;
    }
    const servicio = catalogo.find((s) => claveServicio(s.nombre) === claveServicio(fila.servicio));
    const enExtra = servicio?.camasExtra?.some((c) => mismaCama(c, paciente.cama)) ?? false;
    if (enExtra) fila.ocupadasExtra += 1;
    else fila.ocupadas += 1;
  }

  return { filas, fuera: Array.from(fuera, ([servicio, total]) => ({ servicio, total })) };
}
