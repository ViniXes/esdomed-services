import {
  Activity, Ambulance, ArrowRightLeft, BarChart3, BookOpenText, Building2, ClipboardList, ClipboardPen,
  Contact, DoorOpen, FileClock, FileStack, FileText, FolderOpen, HeartPulse, KeyRound, LayoutDashboard,
  LayoutGrid, Phone, Printer, Send, ShieldAlert, Siren, Table2, UserSearch,
} from "lucide-react";
import type { NavItem } from "@/components/Sidebar";
import type { Pendientes } from "@/contexts/NotificacionesContext";
import type { UserProfile } from "@/types";
import { construirMenu, type SeccionNav } from "@/lib/navRegistro";
import { SECCION_LESIONES } from "@/lib/navComiteLesiones";
import { apoyaComiteLesiones } from "@/lib/accesoComiteLesiones";
import { puedeVerModuloCuidadosCriticos } from "@/lib/accesoCuidadosCriticos";

type Perfil = UserProfile | null | undefined;

// El admin entra a /medico solo por el registro de cuidados críticos.
const noEsAdmin = (p: Perfil) => p?.role !== "admin";

// Menú del portal médico por tarea. El Sidebar lo pinta como acordeón: cada
// sección es un botón padre y solo una queda abierta a la vez. Cuidados
// críticos va arriba porque es el trabajo diario de quien lo tiene; luego
// Emergencia; lo que es apoyo por persona (Lesiones intencionales) va al final.
const MENU_MEDICO: SeccionNav[] = [
  {
    entradas: [{ href: "/medico", label: "Inicio", icon: LayoutDashboard, exact: true }],
  },
  {
    titulo: "Cuidados críticos",
    icon: Activity,
    visibleSi: p => !!p?.tipoMedico || p?.role === "admin",
    entradas: [
      { href: "/medico/cuidados-criticos", label: "Registro UCI / UCIN", icon: ClipboardPen },
      { href: "/medico/cuidados-criticos/registros", label: "Mis registros UCI / UCIN", icon: Table2 },
      // Matriz e indicadores se reexportan desde /dashboard para que el jefe
      // no salga de su portal.
      { href: "/medico/cuidados-criticos/matriz", label: "Matriz UCI / UCIN", icon: LayoutGrid, globo: "cuidadosCriticosEliminacion", visibleSi: puedeVerModuloCuidadosCriticos },
      { href: "/medico/cuidados-criticos/indicadores", label: "Indicadores UCI / UCIN", icon: BarChart3, visibleSi: puedeVerModuloCuidadosCriticos },
    ],
  },
  {
    titulo: "Emergencia",
    icon: Siren,
    visibleSi: noEsAdmin,
    entradas: [
      // Los censos se registran desde la cola, por eso van juntos.
      { href: "/medico/cola-expedientes", label: "Cola de expedientes", icon: FileStack },
      { href: "/medico/emergencia", label: "Atendidos en emergencia", icon: Ambulance },
      { href: "/medico/emergencia/egresos", label: "Egresos de emergencia", icon: DoorOpen },
      { href: "/medico/censos", label: "Censos de emergencia", icon: BookOpenText },
    ],
  },
  {
    titulo: "Solicitudes y avisos",
    icon: Send,
    visibleSi: noEsAdmin,
    entradas: [
      { href: "/medico/traslados", label: "Traslados", icon: ArrowRightLeft },
      { href: "/medico/traslado-externo", label: "Traslado a otro hospital", icon: Building2 },
      { href: "/medico/fallecidos", label: "Fallecidos", icon: HeartPulse, tone: "rose" },
      // Globo: solicitudes de notificación que el comité difunde a todos los médicos.
      { href: "/medico/conapina-fgr", label: "CONAPINA / FGR", icon: ShieldAlert, globo: "solicitudesLesion" },
      { href: "/medico/reposicion-llave-sis", label: "Reposición de llave SIS", icon: KeyRound },
    ],
  },
  {
    titulo: "Documentos",
    icon: FolderOpen,
    visibleSi: noEsAdmin,
    entradas: [
      { href: "/medico/incapacidades", label: "Incapacidades", icon: FileText },
      // Egresos anteriores a la app que ESDOMED cargó del FIEH y asignó a este
      // médico para que las complete; el globo es lo que tiene por completar.
      { href: "/medico/incapacidades/reposicion", label: "Reposición de incapacidad", icon: FileClock, globo: "reposiciones" },
      { href: "/medico/anexo5/nueva", label: "Anexo 5", icon: ClipboardList },
      { href: "/medico/impresiones", label: "Impresiones", icon: Printer },
    ],
  },
  {
    titulo: "Pacientes",
    icon: Contact,
    visibleSi: noEsAdmin,
    entradas: [
      { href: "/medico/buscar-paciente", label: "Buscar paciente", icon: UserSearch },
      { href: "/medico/busqueda-telefono", label: "Búsqueda de teléfono", icon: Phone },
    ],
  },
  { ...SECCION_LESIONES, visibleSi: apoyaComiteLesiones },
];

// Compartido entre el layout del portal y el de /comite-lesiones (donde entran
// los médicos que apoyan al comité), para que el cruce entre áreas sea
// transparente. Mismo patrón que navPsicologia y navTrabajoSocial.
export function navItemsMedico(profile: Perfil, pendientes: Pendientes): NavItem[] {
  return construirMenu(MENU_MEDICO, profile, pendientes);
}
