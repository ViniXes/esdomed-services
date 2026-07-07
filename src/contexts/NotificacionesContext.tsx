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
import {
  collection, onSnapshot, query, where, orderBy, limit, getCountFromServer, type Query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { getLecturaConfirmada } from "@/lib/fallecidos";
import type { NotificacionFallecido } from "@/types";

export type TipoNotif =
  | "fallecido" | "traslado" | "traslado_externo" | "alta" | "psicologia"
  | "incapacidad" | "anexo5" | "impresion" | "recepcion";

export interface NotifToast {
  id: string;
  tipo: TipoNotif;
  titulo: string;
  mensaje: string;
}

interface Pendientes {
  fallecidos: number;
  traslados: number;
  trasladosExternos: number;
  altas: number;
  incapacidades: number;
  anexo5: number;
  impresiones: number;
  recepciones: number;
  total: number;
}

interface NotificacionesContextType {
  pendientes: Pendientes;
  toasts: NotifToast[];
  dismissToast: (id: string) => void;
}

const Ctx = createContext<NotificacionesContextType>({
  pendientes: { fallecidos: 0, traslados: 0, trasladosExternos: 0, altas: 0, incapacidades: 0, anexo5: 0, impresiones: 0, recepciones: 0, total: 0 },
  toasts: [],
  dismissToast: () => {},
});

// Refresco de contadores (por agregación, no en vivo). El prompt-cache de lecturas
// se reduce drásticamente: no se leen los documentos, solo se cuentan en el servidor.
const POLL_MS = 120_000; // 2 min

type Doc = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

export function NotificacionesProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();

  const [counts, setCounts] = useState<Omit<Pendientes, "total">>({
    fallecidos: 0, traslados: 0, trasladosExternos: 0, altas: 0, incapacidades: 0, anexo5: 0, impresiones: 0, recepciones: 0,
  });
  const [toasts, setToasts] = useState<NotifToast[]>([]);

  const esEsdomed    = profile?.role === "esdomed" || profile?.role === "asistente_esdomed" || profile?.role === "admin";
  const puedeAltas   = esEsdomed || profile?.role === "trabajo_social";
  const esPsicologia = profile?.role === "psicologia";
  const esTS         = profile?.role === "trabajo_social";
  // Psicología y Trabajo Social comparten la revisión de fallecidos (confirmar "visto").
  const revisaFallecidos = esPsicologia || esTS;
  const psUid        = profile?.uid;

  const addToast = useCallback((toast: Omit<NotifToast, "id">) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    setToasts(prev => [...prev.slice(-3), { ...toast, id }]);
  }, []);
  const dismissToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  const setCount = useCallback(
    (k: keyof Omit<Pendientes, "total">, n: number) => setCounts(prev => (prev[k] === n ? prev : { ...prev, [k]: n })),
    [],
  );

  // ── Contadores de pendientes por AGREGACIÓN (getCountFromServer) ──
  // No lee los documentos (cuenta en el servidor, ~1 lectura por cada 1000).
  // Se refresca al montar, al enfocar la ventana y cada 2 min (no en tiempo real).
  useEffect(() => {
    if (!esEsdomed && !puedeAltas) return;
    let activo = true;
    const contar = async (k: keyof Omit<Pendientes, "total">, q: Query) => {
      try {
        const r = await getCountFromServer(q);
        if (activo) setCount(k, r.data().count);
      } catch { /* el conteo no es crítico */ }
    };
    const pend = (coll: string) => query(collection(db, coll), where("estado", "==", "pendiente"));
    const refrescar = () => {
      if (esEsdomed) {
        contar("fallecidos", pend("notificaciones_fallecidos"));
        contar("traslados", pend("traslados"));
        contar("trasladosExternos", pend("traslados_externos"));
        contar("incapacidades", pend("incapacidades"));
        contar("anexo5", pend("anexo5"));
        contar("impresiones", pend("solicitudes_impresion"));
      }
      if (puedeAltas) contar("altas", pend("notificaciones_altas"));
    };
    refrescar();
    const onFocus = () => refrescar();
    window.addEventListener("focus", onFocus);
    const iv = window.setInterval(refrescar, POLL_MS);
    return () => { activo = false; window.removeEventListener("focus", onFocus); window.clearInterval(iv); };
  }, [esEsdomed, puedeAltas, setCount]);

  // ── Toasts de nuevos registros: 1 documento por colección (el más reciente) ──
  // Detecta cuando aparece un id nuevo en la cima; lee solo 1 doc por colección.
  useEffect(() => {
    if (!esEsdomed && !puedeAltas) return;
    const fuentes: { coll: string; gate: boolean; tipo: TipoNotif; titulo: string; msg: (d: Doc) => string }[] = [
      { coll: "notificaciones_fallecidos", gate: esEsdomed, tipo: "fallecido", titulo: "Nuevo fallecido notificado", msg: d => `${s(d.pacienteNombre)} · Exp. ${s(d.pacienteExpediente)}` },
      { coll: "traslados", gate: esEsdomed, tipo: "traslado", titulo: "Nueva solicitud de traslado", msg: d => `Exp. ${s(d.pacienteExpediente)} · ${s(d.servicioOrigen)} → ${s(d.servicioDestino) || "—"}` },
      { coll: "traslados_externos", gate: esEsdomed, tipo: "traslado_externo", titulo: "Nuevo traslado a otro hospital", msg: d => `Exp. ${s(d.pacienteExpediente)} → ${s(d.establecimientoDestino)}` },
      { coll: "incapacidades", gate: esEsdomed, tipo: "incapacidad", titulo: "Nueva solicitud de incapacidad", msg: d => `${s(d.pacienteNombre)} · Exp. ${s(d.pacienteExpediente)}` },
      { coll: "anexo5", gate: esEsdomed, tipo: "anexo5", titulo: "Nueva solicitud de Anexo 5", msg: d => `${s(d.nombrePaciente)}` },
      { coll: "solicitudes_impresion", gate: esEsdomed, tipo: "impresion", titulo: "Nueva solicitud de impresión", msg: d => `${s(d.descripcion) || "Documento"}` },
      { coll: "notificaciones_altas", gate: puedeAltas, tipo: "alta", titulo: "Nueva notificación de alta", msg: d => `${s(d.pacienteNombre)} · ${s(d.tipoAlta)}` },
    ];
    const unsubs = fuentes.filter(f => f.gate).map(f => {
      let known: string | null = null;
      return onSnapshot(
        query(collection(db, f.coll), orderBy("creadoEn", "desc"), limit(1)),
        snap => {
          const d0 = snap.docs[0];
          if (!d0) return;
          if (known === null) { known = d0.id; return; }
          if (d0.id !== known) { known = d0.id; addToast({ tipo: f.tipo, titulo: f.titulo, mensaje: f.msg(d0.data()) }); }
        },
      );
    });
    return () => unsubs.forEach(u => u());
  }, [esEsdomed, puedeAltas, addToast]);

  // ── Psicología confirmó lectura de un fallecido → aviso a ESDOMED (limit 40) ──
  const knownPsConfirm = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!esEsdomed) return;
    knownPsConfirm.current = null;
    const q = query(collection(db, "notificaciones_fallecidos"), orderBy("creadoEn", "desc"), limit(40));
    return onSnapshot(q, snap => {
      const confirmados = new Set(snap.docs.filter(d => d.data().recibeDePs).map(d => d.id));
      if (knownPsConfirm.current === null) { knownPsConfirm.current = confirmados; return; }
      snap.docs.forEach(doc => {
        const d = doc.data();
        if (d.recibeDePs && !knownPsConfirm.current!.has(doc.id)) {
          const areaConfirma = d.recibeDePsRol === "trabajo_social" ? "Trabajo Social" : "Psicología";
          addToast({ tipo: "psicologia", titulo: `${areaConfirma} confirmó lectura`, mensaje: `${s(d.recibeDePs)} · ${s(d.pacienteNombre)} · Exp. ${s(d.pacienteExpediente)}` });
        }
      });
      knownPsConfirm.current = confirmados;
    });
  }, [esEsdomed, addToast]);

  // ── Psicología: recepciones asignadas a este usuario (consulta pequeña por uid) ──
  const knownRecepciones = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!esPsicologia || !psUid) return;
    knownRecepciones.current = null;
    const q = query(collection(db, "notificaciones_fallecidos"), where("recibeDePsUid", "==", psUid));
    return onSnapshot(q, snap => {
      const porConfirmar = snap.docs.filter(d => !d.data().recibeDePsConfirmado);
      const ids = new Set(porConfirmar.map(d => d.id));
      if (knownRecepciones.current === null) {
        knownRecepciones.current = ids;
      } else {
        porConfirmar.forEach(doc => {
          if (!knownRecepciones.current!.has(doc.id)) {
            const d = doc.data();
            addToast({ tipo: "recepcion", titulo: "Nueva recepción asignada", mensaje: `${d.recibeDePsEntregadoPor ? `Entregado por ${s(d.recibeDePsEntregadoPor)} · ` : ""}${s(d.pacienteNombre)} · Exp. ${s(d.pacienteExpediente)}` });
          }
        });
        knownRecepciones.current = ids;
      }
      setCount("recepciones", porConfirmar.length);
    });
  }, [esPsicologia, psUid, addToast, setCount]);

  // ── Psicología / Trabajo Social: fallecidos por revisar (sin "visto" del área) — limit 40 ──
  const knownVistos = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!revisaFallecidos) return;
    knownVistos.current = null;
    const q = query(collection(db, "notificaciones_fallecidos"), orderBy("creadoEn", "desc"), limit(40));
    return onSnapshot(q, snap => {
      // "Sin visto" = sin lectura confirmada por el área (lecturaPor / getLecturaConfirmada),
      // NO el campo recibeDePs (que es la asignación de certificado que hace ESDOMED). Así el
      // contador coincide con lo que la página marca Visto/Pendiente y baja al confirmar.
      const sinVisto = snap.docs.filter(d => !getLecturaConfirmada({ id: d.id, ...d.data() } as NotificacionFallecido));
      const ids = new Set(sinVisto.map(d => d.id));
      if (knownVistos.current === null) {
        knownVistos.current = ids;
      } else {
        sinVisto.forEach(doc => {
          if (!knownVistos.current!.has(doc.id)) {
            const d = doc.data();
            addToast({ tipo: "fallecido", titulo: "Nuevo fallecido por revisar", mensaje: `${s(d.pacienteNombre)} · Exp. ${s(d.pacienteExpediente)}` });
          }
        });
        knownVistos.current = ids;
      }
      setCount("fallecidos", sinVisto.length);
    });
  }, [revisaFallecidos, addToast, setCount]);

  const pendientes: Pendientes = {
    ...counts,
    total: counts.fallecidos + counts.traslados + counts.trasladosExternos + counts.altas + counts.incapacidades + counts.anexo5 + counts.impresiones + counts.recepciones,
  };

  return (
    <Ctx.Provider value={{ pendientes, toasts, dismissToast }}>
      {children}
    </Ctx.Provider>
  );
}

export const useNotificaciones = () => useContext(Ctx);
