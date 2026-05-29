"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { collection, onSnapshot, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

export type TipoNotif = "fallecido" | "traslado" | "alta" | "psicologia";

export interface NotifToast {
  id: string;
  tipo: TipoNotif;
  titulo: string;
  mensaje: string;
}

interface Pendientes {
  fallecidos: number;
  traslados: number;
  altas: number;
  total: number;
}

interface NotificacionesContextType {
  pendientes: Pendientes;
  toasts: NotifToast[];
  dismissToast: (id: string) => void;
}

const Ctx = createContext<NotificacionesContextType>({
  pendientes: { fallecidos: 0, traslados: 0, altas: 0, total: 0 },
  toasts: [],
  dismissToast: () => {},
});

export function NotificacionesProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();

  const [countFallecidos, setCountFallecidos] = useState(0);
  const [countTraslados, setCountTraslados]   = useState(0);
  const [countAltas, setCountAltas]           = useState(0);
  const [toasts, setToasts]                   = useState<NotifToast[]>([]);

  const knownFallecidos = useRef<Set<string> | null>(null);
  const knownTraslados  = useRef<Set<string> | null>(null);
  const knownAltas      = useRef<Set<string> | null>(null);
  const knownPsConfirm  = useRef<Set<string> | null>(null);

  const esEsdomed   = profile?.role === "esdomed" || profile?.role === "admin";
  const puedeAltas  = esEsdomed || profile?.role === "trabajo_social";

  const addToast = useCallback((toast: Omit<NotifToast, "id">) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    setToasts(prev => [...prev.slice(-3), { ...toast, id }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Fallecidos — solo esdomed/admin
  useEffect(() => {
    if (!esEsdomed) return;
    knownFallecidos.current = null;

    const q = query(
      collection(db, "notificaciones_fallecidos"),
      where("estado", "==", "pendiente"),
    );
    return onSnapshot(q, snap => {
      const ids = new Set(snap.docs.map(d => d.id));

      if (knownFallecidos.current === null) {
        knownFallecidos.current = ids;
      } else {
        snap.docs.forEach(doc => {
          if (!knownFallecidos.current!.has(doc.id)) {
            const d = doc.data();
            addToast({
              tipo: "fallecido",
              titulo: "Nuevo fallecido notificado",
              mensaje: `${d.pacienteNombre ?? ""} · Exp. ${d.pacienteExpediente ?? ""}`,
            });
          }
        });
        knownFallecidos.current = ids;
      }
      setCountFallecidos(snap.size);
    });
  }, [esEsdomed, addToast]);

  // Confirmación de lectura de Psicología sobre un fallecido — avisa a esdomed/admin.
  // Detecta cuando una notificación pasa a tener `recibeDePs` (la confirma Psicología).
  useEffect(() => {
    if (!esEsdomed) return;
    knownPsConfirm.current = null;

    const q = query(
      collection(db, "notificaciones_fallecidos"),
      orderBy("creadoEn", "desc"),
      limit(200),
    );
    return onSnapshot(q, snap => {
      const confirmados = new Set(
        snap.docs.filter(d => d.data().recibeDePs).map(d => d.id),
      );

      if (knownPsConfirm.current === null) {
        knownPsConfirm.current = confirmados;
      } else {
        snap.docs.forEach(doc => {
          const d = doc.data();
          if (d.recibeDePs && !knownPsConfirm.current!.has(doc.id)) {
            addToast({
              tipo: "psicologia",
              titulo: "Psicología confirmó lectura",
              mensaje: `${d.recibeDePs} · ${d.pacienteNombre ?? ""} · Exp. ${d.pacienteExpediente ?? ""}`,
            });
          }
        });
        knownPsConfirm.current = confirmados;
      }
    });
  }, [esEsdomed, addToast]);

  // Traslados — solo esdomed/admin
  useEffect(() => {
    if (!esEsdomed) return;
    knownTraslados.current = null;

    const q = query(
      collection(db, "traslados"),
      where("estado", "==", "pendiente"),
    );
    return onSnapshot(q, snap => {
      const ids = new Set(snap.docs.map(d => d.id));

      if (knownTraslados.current === null) {
        knownTraslados.current = ids;
      } else {
        snap.docs.forEach(doc => {
          if (!knownTraslados.current!.has(doc.id)) {
            const d = doc.data();
            addToast({
              tipo: "traslado",
              titulo: "Nueva solicitud de traslado",
              mensaje: `Exp. ${d.pacienteExpediente ?? ""} · ${d.servicioOrigen ?? ""} → ${d.servicioDestino ?? "—"}`,
            });
          }
        });
        knownTraslados.current = ids;
      }
      setCountTraslados(snap.size);
    });
  }, [esEsdomed, addToast]);

  // Altas vivos — esdomed/admin/trabajo_social
  useEffect(() => {
    if (!puedeAltas) return;
    knownAltas.current = null;

    const q = query(
      collection(db, "notificaciones_altas"),
      where("estado", "==", "pendiente"),
    );
    return onSnapshot(q, snap => {
      const ids = new Set(snap.docs.map(d => d.id));

      if (knownAltas.current === null) {
        knownAltas.current = ids;
      } else {
        snap.docs.forEach(doc => {
          if (!knownAltas.current!.has(doc.id)) {
            const d = doc.data();
            addToast({
              tipo: "alta",
              titulo: "Nueva notificación de alta",
              mensaje: `${d.pacienteNombre ?? ""} · ${d.tipoAlta ?? ""}`,
            });
          }
        });
        knownAltas.current = ids;
      }
      setCountAltas(snap.size);
    });
  }, [puedeAltas, addToast]);

  const pendientes: Pendientes = {
    fallecidos: countFallecidos,
    traslados:  countTraslados,
    altas:      countAltas,
    total:      countFallecidos + countTraslados + countAltas,
  };

  return (
    <Ctx.Provider value={{ pendientes, toasts, dismissToast }}>
      {children}
    </Ctx.Provider>
  );
}

export const useNotificaciones = () => useContext(Ctx);
