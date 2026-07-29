// Reportes técnicos de posibles errores de programación de la herramienta
// SIMMOW — NO son reclamos formales (ver src/lib/simmow/terminosSimmow.ts,
// sección 5). Sustentan la cláusula de "reportado y confirmado" de esos
// términos: solo un reporte hecho por este canal y marcado "confirmado" por
// un admin exime al personal de responsabilidad por el dato afectado.

import { addDoc, collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";

export type FlujoReporteBug = "hospitalaria" | "ambulatoria" | "otro";
export type EstadoReporteBug = "pendiente" | "confirmado" | "no_es_error";

export interface ReporteBugSimmow {
  id: string;
  uid: string;
  nombreUsuario: string;
  flujo: FlujoReporteBug;
  descripcion: string;
  expediente: string;
  estado: EstadoReporteBug;
  fecha: Date | null;
  notaAdmin: string;
  resueltoPor: string;
  resueltoFecha: Date | null;
}

const COLECCION = "reportes_bugs_simmow";

export async function crearReporteBugSimmow(datos: {
  uid: string;
  nombreUsuario: string;
  flujo: FlujoReporteBug;
  descripcion: string;
  expediente?: string;
}): Promise<void> {
  await addDoc(collection(db, COLECCION), {
    uid: datos.uid,
    nombreUsuario: datos.nombreUsuario,
    flujo: datos.flujo,
    descripcion: datos.descripcion,
    expediente: datos.expediente || "",
    estado: "pendiente" satisfies EstadoReporteBug,
    fecha: serverTimestamp(),
    notaAdmin: "",
    resueltoPor: "",
    resueltoFecha: null,
  });
}

export async function listarReportesBugsSimmow(): Promise<ReporteBugSimmow[]> {
  const snap = await getDocs(query(collection(db, COLECCION), orderBy("fecha", "desc")));
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const aFecha = (v: unknown): Date | null =>
      v && typeof v === "object" && "toDate" in v ? (v as { toDate: () => Date }).toDate() : null;
    return {
      id: d.id,
      uid: (data.uid as string) || "",
      nombreUsuario: (data.nombreUsuario as string) || "",
      flujo: (data.flujo as FlujoReporteBug) || "otro",
      descripcion: (data.descripcion as string) || "",
      expediente: (data.expediente as string) || "",
      estado: (data.estado as EstadoReporteBug) || "pendiente",
      fecha: aFecha(data.fecha),
      notaAdmin: (data.notaAdmin as string) || "",
      resueltoPor: (data.resueltoPor as string) || "",
      resueltoFecha: aFecha(data.resueltoFecha),
    };
  });
}

export async function actualizarEstadoReporteBugSimmow(
  id: string,
  estado: EstadoReporteBug,
  notaAdmin: string,
  resueltoPor: string
): Promise<void> {
  await updateDoc(doc(db, COLECCION, id), {
    estado,
    notaAdmin,
    resueltoPor,
    resueltoFecha: serverTimestamp(),
  });
}
