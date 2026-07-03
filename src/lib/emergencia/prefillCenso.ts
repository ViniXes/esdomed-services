// Prellenado de identidad para los censos de emergencia.
//
// Regla acordada con emergencia: SOLO datos personales del paciente — nombre,
// edad y sexo. Nada clínico se prellena; eso es criterio del médico que digita.
// Fuentes, en orden de autoridad:
//   1. Padrón `personas` (doc id == expediente) — nombre, sexo, edad por
//      fecha de nacimiento.
//   2. `registro_diario_emergencia` (reporte SIS que carga ESDOMED) — sexo y
//      edad; disponible apenas el paciente entra, aunque aún no esté en padrón.
//      No trae nombre.

import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { calcularEdad, toDate } from "@/lib/pacientes/helpers";
import type { Genero } from "@/types";

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

  // 2. Registro diario del SIS (completa lo que falte)
  if (out.genero === undefined || out.edad === undefined) {
    try {
      const snap = await getDocs(query(
        collection(db, "registro_diario_emergencia"),
        where("expediente", "==", exp),
      ));
      if (!snap.empty) {
        // El más reciente por fecha de reporte (pocos docs por expediente).
        const docs = snap.docs
          .map((d) => d.data())
          .sort((a, b) => (toDate(b.fechaReporte)?.getTime() ?? 0) - (toDate(a.fechaReporte)?.getTime() ?? 0));
        const rd = docs[0];
        if (out.genero === undefined && (rd.genero === "masculino" || rd.genero === "femenino")) out.genero = rd.genero;
        if (out.edad === undefined && typeof rd.edadAnios === "number") out.edad = rd.edadAnios;
        out.fuentes.push("registro diario");
      }
    } catch { /* ídem */ }
  }

  return out;
}
