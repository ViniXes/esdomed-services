import type { FichaCuidadosCriticos } from "@/types";

export interface ResumenCalidadRegistro {
  creadorId: string;
  creadorNombre: string;
  fichas: number;
  estanciasCerradas: number;
  cerradasConDiagnostico: number;
  cerradasSinDiagnostico: number;
}

function estaCerrada(ficha: FichaCuidadosCriticos) {
  const alta = ficha.datos?.alta;
  return ficha.estadoEstancia === "egresada"
    || registrado(ficha.datos?.fecha_egreso_del_servicio)
    || registrado(ficha.datos?.fecha_de_muerte)
    || registrado(alta);
}

function registrado(valor: unknown) {
  const texto = String(valor ?? "").trim();
  return texto !== "" && texto !== "No registrado";
}

export function resumirCalidadRegistrosCuidadosCriticos(fichas: FichaCuidadosCriticos[]) {
  const resumen = new Map<string, ResumenCalidadRegistro>();

  for (const ficha of fichas) {
    const creadorId = ficha.creadoPorId?.trim() || "sin-id";
    const creadorNombre = ficha.creadoPorNombre?.trim() || "Creador no registrado";
    const actual = resumen.get(creadorId) ?? {
      creadorId,
      creadorNombre,
      fichas: 0,
      estanciasCerradas: 0,
      cerradasConDiagnostico: 0,
      cerradasSinDiagnostico: 0,
    };

    actual.fichas += 1;
    if (estaCerrada(ficha)) {
      actual.estanciasCerradas += 1;
      if (registrado(ficha.datos?.diagnostico_de_egreso_1)) {
        actual.cerradasConDiagnostico += 1;
      } else {
        actual.cerradasSinDiagnostico += 1;
      }
    }

    resumen.set(creadorId, actual);
  }

  return [...resumen.values()].sort((a, b) =>
    b.cerradasSinDiagnostico - a.cerradasSinDiagnostico
      || b.estanciasCerradas - a.estanciasCerradas
      || a.creadorNombre.localeCompare(b.creadorNombre, "es"),
  );
}
