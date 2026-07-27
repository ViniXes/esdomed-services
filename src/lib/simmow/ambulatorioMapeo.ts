// Cruce de los dos reportes del SIS ("Pacientes Atendidos En Emergencia" +
// "Registro Diario de Emergencia") por expediente, traducido a los campos
// reales del formulario "Ingreso/Edición Consulta Curativa" de SIMMOW.
//
// Reutiliza tal cual (sin modificarlos) los mappers que ya existen en el
// proyecto para estos mismos reportes, usados hoy para las estadísticas de
// emergencia en Firestore — acá solo se cruzan por expediente y se traducen
// los valores a lo que SIMMOW espera.

import type { FilaEmergenciaMapeada } from "@/lib/emergencia/importMapper";
import type { FilaMapeada } from "@/lib/emergencia/registroDiarioMapper";
import { mayus } from "./texto";
import { datosAmbulatorioVacios, type PacienteAmbulatorio } from "./ambulatorioTypes";

/** "64 años 7 meses 18 días" → { anios, meses, dias }, cada uno "" si no aparece en el texto. */
export function edadDesglosada(texto: string | undefined): { anios: string; meses: string; dias: string } {
  const t = String(texto || "");
  const anios = t.match(/(\d+)\s*años?/i)?.[1] ?? "";
  const meses = t.match(/(\d+)\s*mes(?:es)?/i)?.[1] ?? "";
  const dias = t.match(/(\d+)\s*d[ií]as?/i)?.[1] ?? "";
  return { anios, meses, dias };
}

function sexoValorDeGenero(genero: string | undefined): string {
  if (genero === "masculino") return "1";
  if (genero === "femenino") return "2";
  if (genero === "otro") return "3";
  return "";
}

function areaValorDeArea(area: string | undefined): string {
  if (area === "urbana") return "1";
  if (area === "rural") return "2";
  return "";
}

/**
 * "ISSS Cotizante" / "ISSS Beneficiario" → { isss, tipoIsssValor }. La
 * casilla "Afiliación ISSS" de SIMMOW es SOLO para ISSS — otros tipos de
 * afiliación (ej. "Bienestar Magisterial", IPSFA, ISBM, Veterano de Guerra,
 * confirmados como valores reales de esta columna) van en "Derechohabiente
 * Otros", un campo distinto, y NUNCA deben marcar este checkbox.
 *
 * Algunas filas traen el número de afiliación pero dejan "Tipo de
 * afiliación" vacío (dato incompleto en el SIS, no un error nuestro) — SOLO
 * en ese caso (texto vacío, no un tipo distinto explícito) se asume ISSS por
 * ser el más común en Emergencia, y se asume Cotizante por defecto (pedido
 * explícito del usuario: mejor un valor a confirmar que un radio vacío que
 * el personal olvide revisar) — por eso se marca `asumido: true`, para que
 * quede una advertencia visible y no se le achaque el descuido a quien
 * revisa. Si el texto sí dice algo (aunque no sea ISSS) se respeta tal cual
 * y no se marca la casilla.
 */
function afiliacionIsss(
  tipoAfiliacionTexto: string | undefined,
  numeroAfiliacion: string | undefined
): { isss: boolean; tipoIsssValor: string; asumido: boolean } {
  const t = mayus(tipoAfiliacionTexto || "");
  if (t.includes("ISSS")) {
    if (t.includes("COTIZANTE")) return { isss: true, tipoIsssValor: "1", asumido: false };
    if (t.includes("BENEFICIARIO")) return { isss: true, tipoIsssValor: "2", asumido: false };
    return { isss: true, tipoIsssValor: "1", asumido: true };
  }
  if (!t && numeroAfiliacion) {
    return { isss: true, tipoIsssValor: "1", asumido: true };
  }
  return { isss: false, tipoIsssValor: "", asumido: false };
}

/**
 * Cruza las filas ya mapeadas de los dos reportes por expediente.
 *
 * "Registro Diario de Emergencia" es la lista AUTORITATIVA de a quién
 * hay que generarle código ese día — solo esos expedientes entran a la
 * lista de pacientes. "Pacientes Atendidos En Emergencia" es puramente
 * un complemento (DUI, nombre, fecha de ingreso): un expediente que
 * aparezca ahí pero NO en Registro Diario se descarta por completo, no
 * genera una fila (pedido explícito del usuario — antes se incluían por
 * error, inflando la lista con "incompletos" que no correspondía procesar).
 */
export function cruzarReportes(
  filasEmergencia: FilaEmergenciaMapeada[],
  filasRegistro: FilaMapeada[]
): PacienteAmbulatorio[] {
  const complementoPorExpediente = new Map<string, FilaEmergenciaMapeada>();
  for (const fila of filasEmergencia) {
    if (!fila.valido || !fila.expediente) continue;
    complementoPorExpediente.set(fila.expediente, fila);
  }

  const porExpediente = new Map<string, PacienteAmbulatorio>();

  const obtener = (expediente: string): PacienteAmbulatorio => {
    let p = porExpediente.get(expediente);
    if (!p) {
      p = {
        expediente,
        datos: { ...datosAmbulatorioVacios(), expediente },
        enPacientesAtendidos: false,
        enRegistroDiario: false,
        advertencias: [],
      };
      porExpediente.set(expediente, p);
    }
    return p;
  };

  for (const fila of filasRegistro) {
    if (!fila.valido || !fila.expediente) continue;
    const p = obtener(fila.expediente);
    p.enRegistroDiario = true;

    // "Pacientes Atendidos En Emergencia" es SOLO un complemento para DUI y
    // nombre del paciente — todo lo demás (incluyendo Ingreso Hospitalario)
    // sale de "Registro Diario de Emergencia", el reporte oficial. La fecha
    // no se extrae de ningún reporte (no es verídica) — la confirma el
    // personal a mano con doble confirmación antes de generar el código.
    const complemento = complementoPorExpediente.get(fila.expediente);
    if (complemento) {
      p.enPacientesAtendidos = true;
      p.datos.dui = complemento.datos.dui || "";
      p.datos.paciente = mayus(complemento.pacienteNombre);
    }

    const d = fila.datos;

    const { anios, meses, dias } = edadDesglosada(d.edadTexto);
    p.datos.sexoValor = sexoValorDeGenero(d.genero);
    p.datos.edadAnios = anios;
    p.datos.edadMeses = meses;
    p.datos.edadDias = dias;
    p.datos.departamento = d.departamento || "";
    p.datos.municipio = d.municipio || "";
    p.datos.areaValor = areaValorDeArea(d.area);
    p.datos.diagPrincipalCodigo = d.diagnosticoPrincipal?.codigo || "";
    p.datos.diagPrincipalTexto = d.diagnosticoPrincipal?.descripcion || "";
    p.datos.diagSecundarioCodigo = d.diagnosticoSecundario?.codigo || "";
    p.datos.diagSecundarioTexto = d.diagnosticoSecundario?.descripcion || "";
    p.datos.causaExternaCodigo = d.causaExterna?.codigo || "";
    p.datos.causaExternaTexto = d.causaExterna?.descripcion || "";
    p.datos.medicoNombre = d.medico || "";
    p.datos.ingresoHospitalario = !!d.ingresoHospitalario;
    p.datos.tipoAfiliacionTexto = d.tipoAfiliacion || "";
    const { isss, tipoIsssValor, asumido } = afiliacionIsss(d.tipoAfiliacion, d.numeroAfiliacion);
    p.datos.isss = isss;
    p.datos.tipoIsssValor = tipoIsssValor;
    p.datos.numeroAfiliacion = d.numeroAfiliacion || "";
    if (asumido) {
      p.advertencias.push(
        "El reporte trae N° de afiliación pero no dice si es Cotizante o Beneficiario — se marcó Cotizante por defecto. Verifique con el paciente/expediente antes de grabar."
      );
    }
    p.datos.establecimientoReferidoTexto = d.establecimientoReferido || "";
  }

  return [...porExpediente.values()].sort((a, b) => a.expediente.localeCompare(b.expediente));
}
