import type { LucideIcon, LucideProps } from "lucide-react";
import {
  Activity, BatteryCharging, CalendarCheck, CalendarClock, CalendarRange, Ellipsis, FileBadge, FileCheck, FileText, FlaskConical,
  FolderOpen, HandHeart, HeartHandshake, HeartPulse, MessageCircle, MessagesSquare, NotebookPen, Phone, Pill, ScrollText, Signpost,
  Syringe, Ticket, UserCog, UserRound, UserRoundPen, UserRoundSearch, UserX,
} from "lucide-react";

// Íconos de las gestiones y de los medios. Van aparte del catálogo
// (trabajoSocial.ts), que es puro y lo usan la API y las pruebas.

const ICONO_TIPO: Record<string, LucideIcon> = {
  atencion_caso: MessagesSquare,
  cita_estudio: CalendarCheck,
  reprogramacion: CalendarClock,
  expediente: FolderOpen,
  receta: Pill,
  resumen_clinico: FileText,
  constancia_medica: FileBadge,
  constancia_permanencia: FileCheck,
  rastreo: UserRoundSearch,
  informe_social: ScrollText,
  orientacion_referencia: Signpost,
  cambio_medico: UserCog,
  otra: Ellipsis,
  actualizacion_datos: UserRoundPen,
  marcapaso: HeartPulse,
  cambio_generador: BatteryCharging,
  cupo_demanda: Ticket,
  programa_mas: HandHeart,
  cambio_tratamiento: Syringe,
  programa_tfr: Activity,
  disfruto_mi_salud: HeartHandshake,
  resultado_laboratorio: FlaskConical,
  bcr: CalendarRange,
  paciente_reprobado: UserX,
};

const ICONO_MEDIO: Record<string, LucideIcon> = {
  presencial: UserRound,
  llamada: Phone,
  whatsapp: MessageCircle,
  tramite: FileText,
};

/** Para pasarlo como prop. Un tipo nuevo del catálogo sale con el genérico hasta que se le ponga el suyo. */
export const iconoTipo = (id: string): LucideIcon => ICONO_TIPO[id] ?? NotebookPen;

/** El ícono de una gestión, para dibujarlo directo. */
export function IconoTipo({ tipo, ...props }: { tipo: string } & LucideProps) {
  const Icono = ICONO_TIPO[tipo] ?? NotebookPen;
  return <Icono aria-hidden="true" {...props} />;
}

export function IconoMedio({ medio, ...props }: { medio: string } & LucideProps) {
  const Icono = ICONO_MEDIO[medio] ?? FileText;
  return <Icono aria-hidden="true" {...props} />;
}
