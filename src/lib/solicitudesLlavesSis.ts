import type { EstadoSolicitudLlaveSis } from "@/types";

export const ESTADO_SOLICITUD_LLAVE_SIS_LABEL: Record<EstadoSolicitudLlaveSis, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  llave_generada: "Llave generada",
  entregada: "Entregada",
  rechazada: "Rechazada",
};
