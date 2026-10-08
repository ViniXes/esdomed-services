"use client";

import { useEffect, useState } from "react";
import { Bell, RefreshCw } from "lucide-react";
import { useSincronizacionSis } from "@/contexts/SincronizacionSisContext";

const INTERVALO_MS = 10 * 60 * 1000;
const TITULO = "Sincroniza los pacientes activos en SIS";
const MENSAJE = "Recuerda sincronizar los pacientes activos en SIS. Procura no dejar pasar más de 10 minutos entre sincronizaciones.";
const EVENTO_CONFIRMACION = "esdomed:sis-sincronizado";

// El temporizador es local; toma la hora compartida de la última importación.
// "Ya sincronicé" solo reinicia el aviso personal, no cambia la hora global.
export function RecordatorioSincronizacionSis({ uid }: { uid: string }) {
  const { sincronizadoEn } = useSincronizacionSis();
  const [pendiente, setPendiente] = useState(false);
  const [avisos, setAvisos] = useState(false);
  const [permiso, setPermiso] = useState<NotificationPermission | "no-disponible">("no-disponible");
  const [error, setError] = useState("");
  const base = `esdomed:sis:${uid}`;

  useEffect(() => {
    let activo = true;
    let timer: number;
    // También funciona si el navegador bloquea localStorage.
    const memoria = new Map<string, string>();
    const leer = (key: string) => {
      try { return localStorage.getItem(key); } catch { return memoria.get(key) ?? null; }
    };
    const guardar = (key: string, value: string) => {
      memoria.set(key, value);
      try { localStorage.setItem(key, value); } catch { /* usar memoria */ }
    };
    const fecha = (key: string, fallback: number) => {
      const valor = Number(leer(key));
      return Number.isFinite(valor) && valor > 0 && valor <= Date.now() ? valor : fallback;
    };
    const inicio = Date.now();
    if (!leer(`${base}:confirmado`)) guardar(`${base}:confirmado`, String(inicio));

    const notificar = async (confirmado: number) => {
      if (!("Notification" in window) || Notification.permission !== "granted" || leer(`${base}:avisos`) !== "true") return;
      try {
        const registro = "serviceWorker" in navigator
          ? await navigator.serviceWorker.getRegistration()
          : undefined;
        if (!activo || Math.max(fecha(`${base}:confirmado`, inicio), sincronizadoEn ?? 0) !== confirmado || leer(`${base}:avisos`) !== "true" || Notification.permission !== "granted") return;
        if (registro) {
          await registro.showNotification(TITULO, {
            body: MENSAJE,
            icon: "/icons/icon-192.png",
            tag: `${base}:recordatorio`,
            data: { tipo: "sincronizacion-sis" },
          });
        }
      } catch { /* el aviso dentro de la app sigue disponible */ }
    };

    const comprobar = () => {
      if (!activo) return;
      window.clearTimeout(timer);
      const ahora = Date.now();
      const confirmado = Math.max(fecha(`${base}:confirmado`, inicio), sincronizadoEn ?? 0);
      const ultimoAviso = fecha(`${base}:avisado`, confirmado);
      const vencido = ahora - confirmado >= INTERVALO_MS;
      setPendiente(vencido);
      setAvisos(leer(`${base}:avisos`) === "true");
      setPermiso("Notification" in window && window.isSecureContext ? Notification.permission : "no-disponible");

      // Reclamar el aviso antes de cualquier await evita repetirlo entre pestañas.
      if (vencido && ahora - Math.max(confirmado, ultimoAviso) >= INTERVALO_MS) {
        guardar(`${base}:avisado`, String(ahora));
        void notificar(confirmado);
      }
      const referencia = Math.max(confirmado, fecha(`${base}:avisado`, confirmado));
      timer = window.setTimeout(revisar, Math.max(1, referencia + INTERVALO_MS - Date.now()));
    };

    function revisar() {
      // Web Locks coordina los temporizadores de varias pestañas del mismo usuario.
      if (navigator.locks) {
        void navigator.locks.request(base, comprobar).catch(() => { if (activo) comprobar(); });
      } else {
        comprobar();
      }
    }
    const cambioStorage = (event: StorageEvent) => {
      if (event.key === null || event.key?.startsWith(base + ":")) revisar();
    };
    const visible = () => { if (document.visibilityState === "visible") revisar(); };
    const confirmar = () => {
      guardar(`${base}:confirmado`, String(Date.now()));
      guardar(`${base}:avisado`, String(Date.now()));
      revisar();
    };

    revisar();
    window.addEventListener("storage", cambioStorage);
    window.addEventListener("focus", revisar);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener(EVENTO_CONFIRMACION, confirmar);
    return () => {
      activo = false;
      window.clearTimeout(timer);
      window.removeEventListener("storage", cambioStorage);
      window.removeEventListener("focus", revisar);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener(EVENTO_CONFIRMACION, confirmar);
    };
  }, [base, sincronizadoEn]);

  const cambiarAvisos = async () => {
    setError("");
    if (!("Notification" in window)) return;
    try {
      const nuevoPermiso = avisos ? Notification.permission : await Notification.requestPermission();
      setPermiso(nuevoPermiso);
      const habilitados = !avisos && nuevoPermiso === "granted";
      setAvisos(habilitados);
      try { localStorage.setItem(`${base}:avisos`, String(habilitados)); } catch {
        setAvisos(false);
        setError("El navegador no permite guardar esta preferencia. El recordatorio dentro de la app seguirá funcionando.");
      }
    } catch {
      setError("No se pudieron activar los avisos del navegador. El recordatorio dentro de la app seguirá funcionando.");
    }
  };

  return (
    <aside className={`mx-4 mt-4 rounded-xl border p-3 md:mx-6 print:hidden ${pendiente
      ? "sticky top-0 z-30 border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
      : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <RefreshCw size={18} className="shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1" role="status" aria-live="polite">
          <p className="text-sm font-semibold">{pendiente ? TITULO : "Pacientes activos en SIS"}</p>
          <p className="text-xs">{pendiente ? MENSAJE : "Sincroniza al menos cada 10 minutos. Te recordaremos mientras esdomed esté abierto."}</p>
        </div>
        {pendiente && (
          <button type="button" onClick={() => window.dispatchEvent(new Event(EVENTO_CONFIRMACION))}
            className="rounded-lg border border-current px-3 py-2 text-xs font-semibold">
            Ya sincronicé
          </button>
        )}
        {permiso !== "no-disponible" && permiso !== "denied" && (
          <button type="button" onClick={() => { void cambiarAvisos(); }}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-700">
            <Bell size={14} aria-hidden="true" /> {avisos ? "Desactivar avisos" : "Activar avisos"}
          </button>
        )}
      </div>
      {(error || permiso === "denied") && <p className="mt-2 text-xs" role="status">{error || "Los avisos del navegador están bloqueados. El recordatorio seguirá apareciendo aquí."}</p>}
    </aside>
  );
}
