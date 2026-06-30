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
