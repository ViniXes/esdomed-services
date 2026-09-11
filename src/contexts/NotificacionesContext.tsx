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
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { getLecturaConfirmada } from "@/lib/fallecidos";
import type { NotificacionFallecido } from "@/types";

export type TipoNotif =
  | "fallecido" | "traslado" | "traslado_externo" | "alta" | "psicologia"
  | "incapacidad" | "anexo5" | "impresion" | "recepcion" | "conapina"
  | "solicitud_lesion" | "solicitud_usuario_sis" | "uci_eliminacion" | "simmow_reporte";

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
  conapina: number;
  // Solicitudes de notificación del comité difundidas al área médica.
  solicitudesLesion: number;
  // Solicitudes de creación de usuario SIS todavía sin gestionar.
  solicitudesSis: number;
  // Solicitudes administrativas pendientes.
  cuidadosCriticosEliminacion: number;
  simmowReportes: number;
  total: number;
}

interface NotificacionesContextType {
  pendientes: Pendientes;
  toasts: NotifToast[];
  dismissToast: (id: string) => void;
}

const Ctx = createContext<NotificacionesContextType>({
  pendientes: { fallecidos: 0, traslados: 0, trasladosExternos: 0, altas: 0, incapacidades: 0, anexo5: 0, impresiones: 0, recepciones: 0, conapina: 0, solicitudesLesion: 0, solicitudesSis: 0, cuidadosCriticosEliminacion: 0, simmowReportes: 0, total: 0 },
  toasts: [],
  dismissToast: () => {},
});

// Refresco de contadores (por agregación, no en vivo). El prompt-cache de lecturas
// se reduce drásticamente: no se leen los documentos, solo se cuentan en el servidor.
const POLL_MS = 120_000; // 2 min

type Doc = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

export function NotificacionesProvider({ children }: { children: ReactNode }) {
  const { profile, user } = useAuth();

  const [counts, setCounts] = useState<Omit<Pendientes, "total">>({
    fallecidos: 0, traslados: 0, trasladosExternos: 0, altas: 0, incapacidades: 0, anexo5: 0, impresiones: 0, recepciones: 0, conapina: 0, solicitudesLesion: 0, solicitudesSis: 0, cuidadosCriticosEliminacion: 0, simmowReportes: 0,
  });
  const [toasts, setToasts] = useState<NotifToast[]>([]);

  const esEsdomed    = profile?.role === "esdomed" || profile?.role === "asistente_esdomed" || profile?.role === "admin";
  const esMedico     = profile?.role === "medico";
  const puedeAltas   = esEsdomed || profile?.role === "trabajo_social";
  const esPsicologia = profile?.role === "psicologia";
  const esTS         = profile?.role === "trabajo_social";
  const esComiteLesiones = profile?.role === "comite_lesiones";
  const puedeVerSolicitudesSis = profile?.role === "admin" || profile?.role === "medico_licenciado_dimes";
  // Psicología apoya el trámite del comité: comparte sus vistas y su bandeja.
  const cuentaConapina = esComiteLesiones || esPsicologia;
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

  // ── Comité de Lesiones: notificaciones CONAPINA/FGR pendientes de acuse ──
  // Contador por agregación (no lee documentos) + 1 listener del más reciente
  // para el toast, igual que las fuentes de ESDOMED.
  const knownConapina = useRef<string | null>(null);
  useEffect(() => {
    if (!cuentaConapina) return;
    let activo = true;
    knownConapina.current = null;

    // El comité solo tiene una acción pendiente: recibir el caso. El aviso a
    // CONAPINA / la Fiscalía ya lo dio el médico y viene declarado en la
    // notificación, así que una recibida no deja nada por hacer.
    const contar = async () => {
      try {
        const pend = await getCountFromServer(
          query(collection(db, "notificaciones_conapina_fgr"), where("estado", "==", "pendiente")),
        );
        if (activo) setCount("conapina", pend.data().count);
      } catch { /* el conteo no es crítico */ }
    };
    contar();
    const onFocus = () => contar();
    window.addEventListener("focus", onFocus);
    const iv = window.setInterval(contar, POLL_MS);

    const unsub = onSnapshot(
      query(collection(db, "notificaciones_conapina_fgr"), orderBy("creadoEn", "desc"), limit(1)),
      snap => {
        const d0 = snap.docs[0];
        if (!d0) return;
        if (knownConapina.current === null) { knownConapina.current = d0.id; return; }
        if (d0.id !== knownConapina.current) {
          knownConapina.current = d0.id;
          const d = d0.data();
          addToast({
            tipo: "conapina",
            titulo: "Nueva notificación CONAPINA/FGR",
            mensaje: `${s(d.pacienteNombre)} · Exp. ${s(d.pacienteExpediente)}`,
          });
          contar();
        }
      },
    );

    return () => {
      activo = false;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(iv);
      unsub();
    };
  }, [cuentaConapina, addToast, setCount]);

  // ── Médicos: solicitudes de notificación difundidas por el comité ──
  // Un solo listener sobre las PENDIENTES (son pocas por diseño: las crea el
  // comité a mano): da el contador vivo del globo y detecta las nuevas para el
  // toast, sin poll ni conteo por agregación.
  const knownSolicitudes = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!esMedico) return;
    knownSolicitudes.current = null;
    const q = query(collection(db, "solicitudes_notificacion_lesion"), where("estado", "==", "pendiente"));
    return onSnapshot(q, snap => {
      const ids = new Set(snap.docs.map(d => d.id));
      if (knownSolicitudes.current === null) {
        knownSolicitudes.current = ids;
      } else {
        snap.docs.forEach(doc => {
          if (!knownSolicitudes.current!.has(doc.id)) {
            const d = doc.data();
            addToast({
              tipo: "solicitud_lesion",
              titulo: "El comité solicita una notificación",
              mensaje: `${s(d.pacienteNombre)} · Exp. ${s(d.expediente)}`,
            });
          }
        });
        knownSolicitudes.current = ids;
      }
      setCount("solicitudesLesion", snap.size);
    });
  }, [esMedico, addToast, setCount]);

  // ── Administración / DIMES: solicitudes SIS pendientes ──
  // Esta colección se consulta por API autenticada, igual que su bandeja,
  // para no exponer datos personales en las reglas de Firestore del cliente.
  // Mantiene el contador del menú y usa los mismos avisos temporales del resto
  // de módulos. La carga inicial solo muestra el contador, sin repetir avisos.
  const knownSolicitudesSis = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!puedeVerSolicitudesSis || !user) return;
    let activo = true;
    knownSolicitudesSis.current = null;

    type ResumenSis = {
      pendientes: number;
      solicitudes: { id: string; nombre: string; servicio: string }[];
    };

    const refrescar = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/solicitudes-usuarios-sis?resumen=pendientes", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json() as ResumenSis;
        if (!activo) return;

        const ids = new Set(data.solicitudes.map((solicitud) => solicitud.id));
        if (knownSolicitudesSis.current === null) {
          knownSolicitudesSis.current = ids;
        } else {
          data.solicitudes.forEach((solicitud) => {
            if (!knownSolicitudesSis.current!.has(solicitud.id)) {
              addToast({
                tipo: "solicitud_usuario_sis",
                titulo: "Nueva solicitud de usuario SIS",
                mensaje: `${solicitud.nombre} · ${solicitud.servicio || "Servicio sin indicar"}`,
              });
            }
          });
          knownSolicitudesSis.current = ids;
        }
        setCount("solicitudesSis", Number(data.pendientes) || 0);
      } catch {
        // El contador no debe interrumpir el resto del panel si hay un fallo temporal.
      }
    };

    void refrescar();
    const onFocus = () => { void refrescar(); };
    window.addEventListener("focus", onFocus);
    const iv = window.setInterval(() => { void refrescar(); }, POLL_MS);
    return () => {
      activo = false;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(iv);
    };
  }, [puedeVerSolicitudesSis, user, addToast, setCount]);

  // ── Admin: solicitudes de eliminación de fichas UCI/UCIN ──
  const knownEliminacionesCriticas = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!profile || profile.role !== "admin") return;
    knownEliminacionesCriticas.current = null;
    const q = query(collection(db, "fichas_cuidados_criticos"), where("solicitudEliminacion.estado", "==", "pendiente"));
    return onSnapshot(q, snap => {
      const ids = new Set(snap.docs.map(d => d.id));
      if (knownEliminacionesCriticas.current === null) {
        knownEliminacionesCriticas.current = ids;
      } else {
        snap.docs.forEach(doc => {
          if (!knownEliminacionesCriticas.current!.has(doc.id)) {
            const d = doc.data();
            const solicitud = d.solicitudEliminacion as Doc | undefined;
            addToast({
              tipo: "uci_eliminacion",
              titulo: "Solicitud de eliminación UCI/UCIN",
              mensaje: `${s(d.pacienteNombre)} · Exp. ${s(d.pacienteExpediente)}${solicitud?.solicitadoPorNombre ? ` · ${s(solicitud.solicitadoPorNombre)}` : ""}`,
            });
          }
        });
        knownEliminacionesCriticas.current = ids;
      }
      setCount("cuidadosCriticosEliminacion", snap.size);
    });
  }, [profile, addToast, setCount]);

  // ── Admin: reportes técnicos pendientes de SIMMOW (Vault Boy) ──
  const knownReportesSimmow = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!profile || profile.role !== "admin") return;
    knownReportesSimmow.current = null;
    const q = query(collection(db, "reportes_bugs_simmow"), where("estado", "==", "pendiente"));
    return onSnapshot(q, snap => {
      const ids = new Set(snap.docs.map(d => d.id));
      if (knownReportesSimmow.current === null) {
        knownReportesSimmow.current = ids;
      } else {
        snap.docs.forEach(doc => {
          if (!knownReportesSimmow.current!.has(doc.id)) {
            const d = doc.data();
            addToast({
              tipo: "simmow_reporte",
              titulo: "Nuevo reporte técnico SIMMOW",
              mensaje: `${s(d.nombreUsuario)}${s(d.expediente) ? ` · Exp. ${s(d.expediente)}` : ""}`,
            });
          }
        });
        knownReportesSimmow.current = ids;
      }
      setCount("simmowReportes", snap.size);
    });
  }, [profile, addToast, setCount]);

  const pendientes: Pendientes = {
    ...counts,
    total: counts.fallecidos + counts.traslados + counts.trasladosExternos + counts.altas + counts.incapacidades + counts.anexo5 + counts.impresiones + counts.recepciones + counts.conapina + counts.solicitudesLesion + counts.solicitudesSis + counts.cuidadosCriticosEliminacion + counts.simmowReportes,
  };

  return (
    <Ctx.Provider value={{ pendientes, toasts, dismissToast }}>
      {children}
    </Ctx.Provider>
  );
}

export const useNotificaciones = () => useContext(Ctx);
