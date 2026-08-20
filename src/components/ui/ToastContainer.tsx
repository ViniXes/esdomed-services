"use client";

import { useEffect } from "react";
import { ArrowRightLeft, HeartPulse, LogIn, BookCheck, FileText, ClipboardList, Printer, Inbox, Building2, ShieldAlert, Megaphone, X } from "lucide-react";
import { useNotificaciones, type NotifToast } from "@/contexts/NotificacionesContext";

const CONFIG: Record<
  NotifToast["tipo"],
  { icon: React.ElementType; borderColor: string; iconColor: string }
> = {
  fallecido: {
    icon: HeartPulse,
    borderColor: "border-l-red-500",
    iconColor: "text-red-400",
  },
  traslado: {
    icon: ArrowRightLeft,
    borderColor: "border-l-blue-500",
    iconColor: "text-blue-400",
  },
  traslado_externo: {
    icon: Building2,
    borderColor: "border-l-cyan-500",
    iconColor: "text-cyan-400",
  },
  alta: {
    icon: LogIn,
    borderColor: "border-l-emerald-500",
    iconColor: "text-emerald-400",
  },
  psicologia: {
    icon: BookCheck,
    borderColor: "border-l-violet-500",
    iconColor: "text-violet-400",
  },
  incapacidad: {
    icon: FileText,
    borderColor: "border-l-amber-500",
    iconColor: "text-amber-400",
  },
  anexo5: {
    icon: ClipboardList,
    borderColor: "border-l-teal-500",
    iconColor: "text-teal-400",
  },
  impresion: {
    icon: Printer,
    borderColor: "border-l-indigo-500",
    iconColor: "text-indigo-400",
  },
  recepcion: {
    icon: Inbox,
    borderColor: "border-l-teal-500",
    iconColor: "text-teal-400",
  },
  conapina: {
    icon: ShieldAlert,
    borderColor: "border-l-amber-500",
    iconColor: "text-amber-400",
  },
  solicitud_lesion: {
    icon: Megaphone,
    borderColor: "border-l-orange-500",
    iconColor: "text-orange-400",
  },
};

const AUTO_DISMISS_MS = 5500;

function Toast({
  toast,
  onDismiss,
}: {
  toast: NotifToast;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const { icon: Icon, borderColor, iconColor } = CONFIG[toast.tipo];

  return (
    <div
      className={`flex items-start gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 border-l-4 ${borderColor} rounded-lg shadow-xl px-4 py-3 w-80`}
      style={{ animation: "notif-in 0.25s ease-out" }}
    >
      <Icon size={15} className={`mt-0.5 flex-shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">
          {toast.titulo}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
          {toast.mensaje}
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="ml-1 flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        aria-label="Cerrar"
      >
        <X size={13} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismissToast } = useNotificaciones();
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <Toast toast={t} onDismiss={() => dismissToast(t.id)} />
        </div>
      ))}
    </div>
  );
}
