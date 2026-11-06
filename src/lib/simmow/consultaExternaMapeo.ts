// Cruce del censo de consulta externa con la programación de citas y mapeo de
// cada fila a los campos del formulario de SIMMOW (conrec.php).
//
// El censo es la lista AUTORITATIVA de a quién hay que generarle código ese día
// (una fila = una consulta). La programación es solo un complemento por
// expediente: aporta DUI y nombre, que el censo no trae. A diferencia de
// Emergencia, un mismo expediente puede aparecer dos veces el mismo día (dos
// especialidades), así que NO se agrupa por expediente.

import { edadDesglosada } from "./ambulatorioMapeo";
import { cargarEstablecimientos, esEstablecimientoPrivado, mejorCoincidenciaEstablecimiento } from "./establecimientos";
import { cargarMedicos, mejorCoincidenciaMedico } from "./medicos";
import { cortar, sinAcentos } from "./texto";
import {
  datosConsultaExternaVacios,
  type DatosSimmowConsultaExterna,
  type PacienteConsultaExterna,
} from "./consultaExternaTypes";
import type { CensoLeido, CitaProgramada, FilaCenso, ProgramacionLeida } from "./consultaExternaReportes";

const MAX_NOMBRE_PACIENTE = 40; // maxlength del campo "paciente" de SIMMOW
const MAX_NUMERO_AFILIACION = 12; // maxlength de isssn y numero_otros_derechohabientes

export interface ResultadoCruceConsultaExterna {
  fecha: string;
  establecimientoReporte: string;
  pacientes: PacienteConsultaExterna[];
  advertenciasGlobales: string[];
}

const norm = (v: string) => sinAcentos(v).toLowerCase().trim();

function esSi(valor: string): boolean {
  const n = norm(valor);
  return n === "si" || n === "1" || n === "s";
}

// IMC del reporte (texto) → value del select m_est_nut_mc de SIMMOW.
function imcAValor(texto: string): string {
  const n = norm(texto);
  if (!n) return "";
  if (/^[1-6]$/.test(n)) return n;
  if (n.includes("severa")) return "6";
  if (n.includes("desnutricion")) return "3";
  if (n.includes("bajo")) return "2";
  if (n.includes("normal")) return "1";
  if (n.includes("sobrepeso")) return "4";
  if (n.includes("obesidad")) return "5";
  return "";
}

function mapearFila(fila: FilaCenso, fecha: string): { datos: DatosSimmowConsultaExterna; advertencias: string[] } {
  const c = fila.campos;
  const advertencias: string[] = [];
  const datos = datosConsultaExternaVacios();

  // Valor numérico del reporte que SIMMOW espera tal cual en un select/radio con
  // opciones 1..max; cualquier otra cosa se avisa en vez de enviarla.
  const codigo = (campo: number, etiqueta: string, max: number): string => {
    const v = c[campo] ?? "";
    if (!v) return "";
    if (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= max) return String(Number(v));
    advertencias.push(`${etiqueta}: el reporte trae "${v}", que no es una opción de SIMMOW — elíjalo a mano.`);
    return "";
  };

  datos.expediente = fila.expediente;
  datos.fecha = fecha;
  datos.sexoValor = codigo(4, "Sexo", 3);
  const { anios, meses, dias } = edadDesglosada(c[5]);
  datos.edadAnios = anios;
  datos.edadMeses = meses;
  datos.edadDias = dias;
  datos.departamentoValor = codigo(8, "Departamento", 21);
  datos.municipio = c[9] ?? "";
  datos.areaValor = codigo(10, "Área", 2);

  const tabaquismo = c[11] ?? "";
  datos.tabaquismoTexto = tabaquismo;
  if (/^[1-3]$/.test(tabaquismo)) {
    datos.tabaquismoValor = tabaquismo;
  } else if (tabaquismo) {
    advertencias.push(
      `Tabaquismo: el reporte solo dice "${tabaquismo}" — SIMMOW pide fumador activo, pasivo o exfumador. Elíjalo a mano.`
    );
  }

  datos.inscripcionValor = codigo(12, "Inscripción", 7);
  datos.controlValor = codigo(13, "Control subsecuente", 9);
  datos.evaluacionInfantilValor = codigo(14, "Evaluación del desarrollo infantil", 2);
  datos.perimetroCefalico = c[15] ?? "";
  datos.pesoEdadValor = codigo(16, "Peso/edad", 3);
  datos.tallaEdadValor = codigo(17, "Longitud/talla-edad", 4);
  datos.pesoTallaValor = codigo(18, "Peso/talla", 5);
  datos.imcTexto = c[19] ?? "";
  datos.imcValor = imcAValor(datos.imcTexto);
  if (datos.imcTexto && !datos.imcValor) {
    advertencias.push(`IMC: no se reconoció "${datos.imcTexto}" — elíjalo a mano.`);
  }
  datos.lactanciaValor = codigo(20, "Lactancia materna", 3);
  datos.pfInscripcionControlValor = codigo(21, "Planificación familiar (inscripción/control)", 4);
  datos.pfMetodoValor = codigo(22, "Planificación familiar (método)", 7);
  datos.pfUsuariaValor = codigo(23, "Usuaria activa", 7);
  datos.deteccionCancerValor = codigo(24, "Detección precoz del cáncer", 9);
  datos.amenorreaSemanas = c[25] ?? "";

  datos.dptconValor = codigo(26, "Tipo de consulta (Dx principal)", 2);
  datos.especialistaValor = codigo(27, "Tipo de consulta del especialista", 2);
  datos.dpstMarcado = esSi(c[28] ?? "");
  datos.diagPrincipalTexto = c[29] ?? "";
  datos.diagPrincipalCodigo = (c[30] ?? "").toUpperCase();
  datos.dstconValor = codigo(31, "Tipo de consulta (Dx secundario)", 2);
  datos.diagSecundarioTexto = c[32] ?? "";
  datos.diagSecundarioCodigo = (c[33] ?? "").toUpperCase();
  datos.causaExternaTexto = c[34] ?? "";
  datos.causaExternaCodigo = (c[35] ?? "").toUpperCase();

  if (!datos.diagPrincipalCodigo) {
    advertencias.push("Sin diagnóstico principal con código CIE-10 en el reporte.");
  }

  datos.discapacidadValor = codigo(36, "Tipo de discapacidad", 6);
  datos.violenciaCondicionValor = codigo(37, "Violencia (condición)", 5);
  datos.violenciaAmbitoValor = codigo(38, "Violencia (ámbito)", 4);
  datos.procSaludMentalValor = codigo(39, "Procedimiento de salud mental", 5);
  datos.ingresoHospitalario = esSi(c[40] ?? "");

  datos.refTipoValor = codigo(41, "Referencia/Interconsulta (tipo)", 2);
  datos.refATexto = c[42] ?? "";
  datos.refDeTexto = c[47] ?? "";

  const tipoAfiliacion = c[43] ?? "";
  const numeroAfiliacion = c[44] ?? "";
  const tipo = codigo(43, "Afiliación (tipo)", 8);
  if (tipo === "1" || tipo === "2") {
    datos.isss = true;
    datos.tipoIsssValor = tipo;
    datos.numeroAfiliacion = numeroAfiliacion;
  } else if (tipo) {
    datos.derechohabienteOtrosValor = tipo;
    datos.derechohabienteOtrosNumero = numeroAfiliacion;
  } else if (!tipoAfiliacion && numeroAfiliacion) {
    // Mismo criterio que Atención Ambulatoria (pedido del usuario): mejor un
    // valor a confirmar que un radio vacío que se olvide revisar.
    datos.isss = true;
    datos.tipoIsssValor = "1";
    datos.numeroAfiliacion = numeroAfiliacion;
    advertencias.push(
      "El reporte trae N° de afiliación pero no el tipo — se marcó ISSS Cotizante por defecto. Verifique antes de grabar."
    );
  }
  if (numeroAfiliacion.length > MAX_NUMERO_AFILIACION) {
    advertencias.push(`El N° de afiliación tiene más de ${MAX_NUMERO_AFILIACION} caracteres: SIMMOW no lo aceptará completo.`);
  }

  datos.victimaDHValor = codigo(45, "Víctima de violaciones a DD. HH.", 3);
  datos.privadoLibertadValor = codigo(46, "Personas privadas de libertad", 7);

  datos.medicoNombre = fila.medico;
  datos.especialidadTexto = fila.especialidad;
  if (!fila.medico) advertencias.push("El reporte no trae el médico de esta consulta.");

  return { datos, advertencias };
}

function aplicarProgramacion(
  datos: DatosSimmowConsultaExterna,
  cita: CitaProgramada | undefined,
  repetido: boolean,
  advertencias: string[]
): boolean {
  if (!cita) {
    advertencias.push("No aparece en la programación de citas del día: DUI y nombre quedan vacíos — complételos a mano.");
    return false;
  }
  datos.dui = cita.dui;
  datos.paciente = cortar(cita.nombre, MAX_NOMBRE_PACIENTE);
  if (cita.nombre.length > MAX_NOMBRE_PACIENTE) {
    advertencias.push(`El nombre del paciente excede ${MAX_NOMBRE_PACIENTE} caracteres y se cortó: verifíquelo.`);
  }
  if (!cita.dui) {
    advertencias.push("Sin DUI en la programación (¿menor de edad o sin documento?).");
  } else if (cita.dui.length !== 9) {
    advertencias.push(`El DUI "${cita.dui}" no tiene 9 dígitos — verifíquelo.`);
  }
  if (repetido) {
    advertencias.push("Tiene más de una cita en la programación del día; se usaron los datos de la primera.");
  }
  return true;
}

export function cruzarCensoConProgramacion(
  censo: CensoLeido,
  programacion: ProgramacionLeida | null
): ResultadoCruceConsultaExterna {
  const advertenciasGlobales: string[] = [];

  const unSoloDia = Boolean(censo.fecha) && censo.fecha === censo.fechaFin;
  if (!censo.fecha) {
    advertenciasGlobales.push("No se pudo leer la fecha del encabezado del censo.");
  } else if (!unSoloDia) {
    advertenciasGlobales.push(
      `El censo abarca un rango de fechas (${censo.fecha} – ${censo.fechaFin}) y no trae la fecha de cada consulta. Descárguelo de un solo día.`
    );
  }
  const fecha = unSoloDia ? censo.fecha : "";

  if (censo.establecimiento && !norm(censo.establecimiento).includes("el salvador")) {
    advertenciasGlobales.push(`El censo es de otro establecimiento: "${censo.establecimiento}".`);
  }
  if (!programacion) {
    advertenciasGlobales.push("No se cargó la programación de citas: DUI y nombre de los pacientes quedan vacíos.");
  } else if (fecha && programacion.fechas.length && !programacion.fechas.includes(fecha)) {
    advertenciasGlobales.push(
      `La programación es del ${programacion.fechas.join(", ")} y el censo del ${fecha}: no son del mismo día, el DUI y el nombre podrían no corresponder.`
    );
  }
  if (!censo.filas.length) advertenciasGlobales.push("El censo no trae ninguna consulta.");

  const pacientes = censo.filas.map((fila, indice): PacienteConsultaExterna => {
    const { datos, advertencias } = mapearFila(fila, fecha);
    const enProgramacion = programacion
      ? aplicarProgramacion(
          datos,
          programacion.porExpediente.get(fila.expediente),
          programacion.repetidos.has(fila.expediente),
          advertencias
        )
      : false;

    return {
      clave: `${fila.numero || indice + 1}-${fila.expediente}`,
      numero: fila.numero,
      expediente: fila.expediente,
      datos,
      enProgramacion,
      advertencias,
    };
  });

  return { fecha, establecimientoReporte: censo.establecimiento, pacientes, advertenciasGlobales };
}

/**
 * Resuelve contra los catálogos reales de SIMMOW el código del médico y de los
 * establecimientos de referencia (mismo mecanismo que Atención Ambulatoria).
 * Es aparte de `cruzarCensoConProgramacion` porque necesita cargar los JSON de
 * los catálogos.
 */
export async function enriquecerPacientesConsultaExterna(
  pacientes: PacienteConsultaExterna[]
): Promise<PacienteConsultaExterna[]> {
  const [medicos, establecimientos] = await Promise.all([cargarMedicos(), cargarEstablecimientos()]);

  return pacientes.map((p) => {
    const datos = { ...p.datos };
    const advertencias = [...p.advertencias];

    if (datos.medicoNombre) {
      const medico = mejorCoincidenciaMedico(medicos, datos.medicoNombre);
      if (medico) {
        datos.medicoCodigoSimmow = medico.codigo;
      } else {
        advertencias.push(
          `El médico "${datos.medicoNombre}" no se encontró de forma única en el catálogo de SIMMOW — búsquelo a mano (o verifique que ya esté registrado como recurso).`
        );
      }
    }

    const resolverReferencia = (texto: string, etiqueta: string) => {
      if (!texto) return { codigo: "", radio: "" };
      const establecimiento = mejorCoincidenciaEstablecimiento(establecimientos, texto);
      if (!establecimiento) {
        advertencias.push(`${etiqueta}: "${texto}" no se encontró en el catálogo de establecimientos de SIMMOW.`);
        return { codigo: "", radio: "" };
      }
      return { codigo: establecimiento.codigo, radio: esEstablecimientoPrivado(establecimiento.nombre) ? "2" : "3" };
    };

    const referidoA = resolverReferencia(datos.refATexto, "Referido A");
    datos.refAEstablecimientoCodigo = referidoA.codigo;
    datos.refAValor = referidoA.radio;
    const referidoDe = resolverReferencia(datos.refDeTexto, "Referido De");
    datos.refDeEstablecimientoCodigo = referidoDe.codigo;
    datos.refDeValor = referidoDe.radio;

    return { ...p, datos, advertencias };
  });
}
