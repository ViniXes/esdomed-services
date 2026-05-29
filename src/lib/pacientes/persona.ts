import {
  collection, doc, getDoc, getDocs, query, where, writeBatch, setDoc, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Persona, ResponsablePaciente } from "@/types";
import type { PacienteFormValue } from "@/components/pacientes/PacienteForm";

// Claves de datos personales: viven canónicamente en personas/{expediente} y se
// replican como snapshot dentro de cada ingreso (pacientes/{id}). Esta es la única
// fuente de verdad de "qué campo es personal" — la usan el fan-out y los formularios.
export const CAMPOS_PERSONALES = [
  "expediente", "apellidos", "nombres", "fechaNacimiento", "genero", "estadoFamiliar",
  "dui", "numeroAfiliacion", "ocupacion", "nacionalidad",
  "direccion", "municipio", "departamento", "canton", "area", "telefono", "otrosNumeros",
  "responsable",
] as const;

/** Sanea el responsable: null si no tiene al menos nombre. */
export function limpiarResponsable(r?: ResponsablePaciente | null): ResponsablePaciente | null {
  if (!r || !r.nombre?.trim()) return null;
  const out: ResponsablePaciente = { nombre: r.nombre.trim() };
  if (r.parentesco?.trim()) out.parentesco = r.parentesco.trim();
  if (r.documento?.trim())  out.documento  = r.documento.trim();
  if (r.telefono?.trim())   out.telefono   = r.telefono.trim();
  if (r.direccion?.trim())  out.direccion  = r.direccion.trim();
  return out;
}

/**
 * Construye el objeto de datos personales listo para Firestore (trim, null en vacíos,
 * Timestamp en fechaNacimiento, responsable saneado) a partir del valor del formulario.
 * No incluye campos clínicos ni de ingreso.
 */
export function construirDatosPersonales(form: PacienteFormValue): Record<string, unknown> {
  const fechaNacimiento = form.fechaNacimiento ? new Date(form.fechaNacimiento) : null;
  return {
    expediente:       form.expediente!.trim(),
    apellidos:        form.apellidos!.trim(),
    nombres:          form.nombres!.trim(),
    genero:           form.genero ?? "otro",
    fechaNacimiento:  fechaNacimiento ? Timestamp.fromDate(fechaNacimiento) : null,
    estadoFamiliar:   form.estadoFamiliar?.trim()    || null,
    dui:              form.dui?.trim()               || null,
    numeroAfiliacion: form.numeroAfiliacion?.trim()  || null,
    ocupacion:        form.ocupacion?.trim()         || null,
    nacionalidad:     form.nacionalidad?.trim()      || null,
    direccion:        form.direccion?.trim()         || null,
    municipio:        form.municipio?.trim()         || null,
    departamento:     form.departamento?.trim()      || null,
    canton:           form.canton?.trim()            || null,
    area:             form.area                      ?? null,
    telefono:         form.telefono?.trim()          || null,
    otrosNumeros:     form.otrosNumeros?.trim()      || null,
    responsable:      limpiarResponsable(form.responsable),
  };
}

/**
 * Construye el documento de un ingreso (pacientes/{id}) a partir del formulario:
 * snapshot personal + datos clínicos + metadata. Lo usan tanto el alta manual como la
 * importación, para que ambos caminos produzcan exactamente la misma estructura.
 */
export function construirDocIngreso(
  form: PacienteFormValue,
  datosPersonales: Record<string, unknown>,
  autor: { uid: string; nombre: string },
): Record<string, unknown> {
  const servicio = form.servicioIngreso!.trim();
  const doc: Record<string, unknown> = {
    ...datosPersonales,
    fechaIngreso:    Timestamp.fromDate(new Date(form.fechaIngreso!)),
    servicioIngreso: servicio,
    servicioActual:  servicio,
    estado:          "activo" as const,
    movimientos:     [],
    creadoEn:        Timestamp.now(),
    creadoPor:       autor.uid,
    creadoPorNombre: autor.nombre,
  };

  // Campos clínicos opcionales — solo si están definidos
  if (form.establecimientoProcedencia) doc.establecimientoProcedencia = form.establecimientoProcedencia.trim();
  if (form.circunstanciaIngreso)       doc.circunstanciaIngreso = form.circunstanciaIngreso;
  if (form.camaActual)                 doc.camaActual = form.camaActual.trim();
  if (form.medicoIngresoNombre)        doc.medicoIngresoNombre = form.medicoIngresoNombre.trim();
  if (form.diagnosticoIngreso?.codigo || form.diagnosticoIngreso?.descripcion) {
    doc.diagnosticoIngreso = {
      codigo:      (form.diagnosticoIngreso.codigo ?? "").trim(),
      descripcion: (form.diagnosticoIngreso.descripcion ?? "").trim(),
    };
  }
  return doc;
}

/** Lee la persona canónica por expediente, o null si no existe. */
export async function getPersona(expediente: string): Promise<Persona | null> {
  const snap = await getDoc(doc(db, "personas", expediente.trim()));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Persona, "id">) };
}

/**
 * Guarda los datos personales en personas/{expediente} (fuente de verdad) y propaga
 * el snapshot a TODOS los ingresos (pacientes) de ese expediente en un solo batch.
 * Así un cambio personal se refleja en todas las vistas de ingreso de la persona.
 */
export async function guardarPersona(
  expediente: string,
  datosPersonales: Record<string, unknown>,
  uid: string,
): Promise<void> {
  const exp = expediente.trim();
  const ahora = Timestamp.now();

  // 1. Documento canónico de persona
  await setDoc(
    doc(db, "personas", exp),
    { ...datosPersonales, expediente: exp, actualizadoEn: ahora, actualizadoPor: uid },
    { merge: true },
  );

  // 2. Fan-out del snapshot a los ingresos existentes de esta persona
  const ingresos = await getDocs(
    query(collection(db, "pacientes"), where("expediente", "==", exp)),
  );
  if (ingresos.empty) return;

  const batch = writeBatch(db);
  ingresos.forEach((d) => {
    batch.update(d.ref, { ...datosPersonales, actualizadoEn: ahora, actualizadoPor: uid });
  });
  await batch.commit();
}
