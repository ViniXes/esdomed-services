import { servicioCanonicoCuidadosCriticos } from "@/lib/cuidadosCriticos";
import { fechaCuidadosCriticos } from "@/lib/fechasCuidadosCriticos";
import { esValorRegistrado, valorComoTexto } from "@/lib/matrizCuidadosCriticos";
import type { FichaCuidadosCriticos } from "@/types";

export interface GrupoPosibleDuplicado {
  clave: string;
  fichas: FichaCuidadosCriticos[];
}

function textoClave(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function fechaIngreso(ficha: FichaCuidadosCriticos) {
  const date = fechaCuidadosCriticos(ficha.datos?.fecha_ingreso_al_servicio);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function horaIngreso(ficha: FichaCuidadosCriticos) {
  const raw = valorComoTexto(ficha.datos?.hora_ingreso_al_servicio).trim();
  if (!esValorRegistrado(raw)) return "";
  const match = /^(\d{1,2}):(\d{2})/.exec(raw);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : textoClave(raw);
}

export function clavePosibleDuplicado(ficha: FichaCuidadosCriticos) {
  const expediente = textoClave(ficha.pacienteExpediente).replace(/[^A-Z0-9]/g, "");
  const servicio = textoClave(servicioCanonicoCuidadosCriticos(ficha.servicio));
  const cama = textoClave(ficha.cama).replace(/\s+/g, "");
  const fecha = fechaIngreso(ficha);
  const hora = horaIngreso(ficha);

  if (!ficha.id || !expediente || !servicio || !cama || !fecha || !hora) return null;
  return [expediente, servicio, cama, fecha, hora].join("|");
}

export function detectarGruposPosibleDuplicado(fichas: FichaCuidadosCriticos[]): GrupoPosibleDuplicado[] {
  const grupos = new Map<string, FichaCuidadosCriticos[]>();
  for (const ficha of fichas) {
    const clave = clavePosibleDuplicado(ficha);
    if (!clave) continue;
    grupos.set(clave, [...(grupos.get(clave) ?? []), ficha]);
  }
  return [...grupos.entries()]
    .filter(([, grupo]) => grupo.length > 1)
    .map(([clave, grupo]) => ({ clave, fichas: grupo }));
}

export function ponerGruposPosiblesDuplicadosJuntos(
  fichas: FichaCuidadosCriticos[],
  grupos: GrupoPosibleDuplicado[],
) {
  const fichaPorId = new Map(fichas.filter(ficha => ficha.id).map(ficha => [ficha.id!, ficha]));
  const grupoPorId = new Map<string, GrupoPosibleDuplicado>();
  for (const grupo of grupos) {
    for (const ficha of grupo.fichas) {
      if (ficha.id) grupoPorId.set(ficha.id, grupo);
    }
  }

  const resultado: FichaCuidadosCriticos[] = [];
  const agregados = new Set<string>();
  for (const ficha of fichas) {
    const id = ficha.id;
    const grupo = id ? grupoPorId.get(id) : undefined;
    if (!grupo || agregados.has(grupo.clave)) {
      if (!id || !agregados.has(id)) resultado.push(ficha);
      if (id) agregados.add(id);
      continue;
    }
    grupo.fichas.forEach(miembro => {
      const miembroActual = miembro.id ? fichaPorId.get(miembro.id) : undefined;
      if (miembroActual && !agregados.has(miembroActual.id!)) {
        resultado.push(miembroActual);
        agregados.add(miembroActual.id!);
      }
    });
    agregados.add(grupo.clave);
  }
  return resultado;
}
