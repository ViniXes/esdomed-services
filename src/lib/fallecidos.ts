import type { NotificacionFallecido, UserRole } from "@/types";

// Confirmación de lectura por Psicología / Trabajo Social, ya separada de la
// asignación/entrega del certificado que hace ESDOMED.
//
// Prioriza los campos nuevos (lecturaPor*). Para registros antiguos cae a los
// campos legacy `recibeDePs*` PERO solo cuando existe `recibeDePsRol`: ese campo
// únicamente lo escribía el flujo viejo de confirmación de lectura, así que es la
// señal fiable de que `recibeDePs` corresponde a una lectura real y no a una
// asignación de ESDOMED.
export interface LecturaConfirmada {
  por: string;
  rol?: UserRole | "psicologia" | "trabajo_social";
  en?: Date;
}

export function getLecturaConfirmada(n: NotificacionFallecido): LecturaConfirmada | null {
  if (n.lecturaPor) {
    return { por: n.lecturaPor, rol: n.lecturaPorRol, en: n.lecturaEn };
  }
  // Legacy: solo se considera lectura si tiene recibeDePsRol (lo escribía el flujo viejo).
  if (n.recibeDePsRol && n.recibeDePs) {
    return { por: n.recibeDePs, rol: n.recibeDePsRol, en: n.recibeDePsEn };
  }
  return null;
}

// ── Resguardo físico de certificados ──
// Los certificados que no se entregan (privados de libertad y cuerpos no
// reclamados) se archivan en este mueble, en una carpeta por año de defunción;
// la carpeta de un año nuevo sale sola de `carpetaResguardo`. Si cambia el
// archivero o la gaveta se edita aquí: los ya archivados conservan su propia
// ubicación (`ubicacionCertificado` es una foto al momento de archivar).
export const ARCHIVO_RESGUARDO = {
  archivero: "Archivero H",
  activoFijo: "0866-153-030-03-00063",
  gaveta: 4,
} as const;

export function certificadoEnResguardo(n: NotificacionFallecido): boolean {
  return !!n.privadoDeLibertad || n.estadoEntregaCertificado === "resguardado";
}

export function carpetaResguardo(fechaDefuncion: unknown): string {
  const d = (fechaDefuncion as { toDate?: () => Date } | null)?.toDate?.()
    ?? (fechaDefuncion ? new Date(fechaDefuncion as string) : new Date());
  const anio = Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  return `HNES-CDCI-${anio}`;
}
