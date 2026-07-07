"use client";

import { useEffect } from "react";

// Registra el service worker (soporte offline + requisito de instalabilidad de la
// PWA). No cachea el bundle de Next (evita servir JS/CSS viejo tras un deploy):
// solo entra en juego cuando falla la red, mostrando /offline.html en vez del
// error del navegador.
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => { /* no bloquea la app */ });
  }, []);

  return null;
}
