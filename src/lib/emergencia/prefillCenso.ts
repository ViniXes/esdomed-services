// Prellenado de identidad para los censos de emergencia.
//
// Regla acordada con emergencia: SOLO datos personales del paciente — nombre,
// edad y sexo. Nada clínico se prellena; eso es criterio del médico que digita.
// Fuentes, en orden de autoridad:
//   1. Padrón `personas` (doc id == expediente) — nombre, sexo, edad por
//      fecha de nacimiento.
//   2. `control_ingresos` (cola de expedientes que digita ESDOMED) — nombre,
//      edad y sexo del registro más reciente del expediente; disponible apenas
//      ESDOMED registra al paciente, aunque aún no esté en padrón.

import { collection, doc, getDoc, getDocs, limit, query, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { calcularEdad, toDate } from "@/lib/pacientes/helpers";
import type { Genero } from "@/types";

// Datos que manda el botón "+" de la cola de expedientes por query params
// (?exp=&nombre=&edad=&genero=&fecha=). La fecha es la del registro de
// control_ingresos (mismo registro del que salen nombre, edad y sexo).
export interface PrefillCola {
  expediente: string;
  nombre?: string;
  edad?: string;
  genero?: Genero;
  fechaRegistro?: Date;
  /** id del doc de control_ingresos desde cuyo "+" se abrió el formulario. */
  controlIngresoId?: string;
}

export function leerPrefillCola(): PrefillCola | null {
  const p = new URLSearchParams(window.location.search);
  const exp = p.get("exp");
  if (!exp) return null;
  const out: PrefillCola = { expediente: exp };
  const ci = p.get("ci");
  if (ci) out.controlIngresoId = ci;
  const nombre = p.get("nombre");
  if (nombre) out.nombre = nombre.toUpperCase();
  const edad = p.get("edad");
  if (edad) out.edad = edad;
  const genero = p.get("genero");
  if (genero === "masculino" || genero === "femenino") out.genero = genero;
  const fechaMs = Number(p.get("fecha"));
  if (Number.isFinite(fechaMs) && fechaMs > 0) out.fechaRegistro = new Date(fechaMs);
  return out;
}

export interface IdentidadPaciente {
  nombre?: string;
  genero?: Genero;
  edad?: number;
  /** De dónde salió cada dato, para mostrárselo al médico. */
  fuentes: string[];
}

export async function buscarIdentidadPaciente(expediente: string): Promise<IdentidadPaciente> {
  const out: IdentidadPaciente = { fuentes: [] };
  const exp = expediente.trim();
  if (!exp) return out;

  // 1. Padrón de personas
  try {
    const snap = await getDoc(doc(db, "personas", exp));
    if (snap.exists()) {
      const p = snap.data();
      const nombre = `${p.nombres ?? ""} ${p.apellidos ?? ""}`.replace(/\s+/g, " ").trim();
      if (nombre) out.nombre = nombre.toUpperCase();
      if (p.genero === "masculino" || p.genero === "femenino") out.genero = p.genero;
      const edad = calcularEdad(toDate(p.fechaNacimiento) ?? null);
      if (edad !== null) out.edad = edad;
      out.fuentes.push("padrón");
    }
  } catch { /* sin padrón no se bloquea el prellenado */ }

  // 2. Control de ingresos / cola de expedientes (completa lo que falte)
  if (out.nombre === undefined || out.genero === undefined || out.edad === undefined) {
    try {
      const snap = await getDocs(query(
        collection(db, "control_ingresos"),
        where("expediente", "==", exp),
        limit(20),
      ));
      if (!snap.empty) {
        // El más reciente (pocos docs por expediente; se ordena en cliente).
        const docs = snap.docs
          .map((d) => d.data())
          .sort((a, b) => (toDate(b.creadoEn)?.getTime() ?? 0) - (toDate(a.creadoEn)?.getTime() ?? 0));
        const ci = docs[0];
        if (out.nombre === undefined) {
          const nombre = `${ci.nombres ?? ""} ${ci.apellidos ?? ""}`.replace(/\s+/g, " ").trim();
          if (nombre) out.nombre = nombre.toUpperCase();
        }
        if (out.genero === undefined && (ci.genero === "masculino" || ci.genero === "femenino")) out.genero = ci.genero;
        if (out.edad === undefined && typeof ci.edad === "number") out.edad = ci.edad;
        out.fuentes.push("cola de expedientes");
      }
    } catch { /* ídem */ }
  }

  return out;
}
