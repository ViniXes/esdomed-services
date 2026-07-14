"use client";

import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";

// San Salvador (zona del Hospital Nacional El Salvador).
const CENTRO: [number, number] = [13.7035, -89.2073];

// Pin institucional dibujado con CSS (evita los assets de imagen de Leaflet,
// que se rompen con el bundler).
const PIN_HTML =
  '<div style="width:18px;height:18px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>';

/**
 * Selector de destino en mapa (OpenStreetMap, sin API key): toca el mapa para
 * colocar el pin o arrástralo. No controlado: el valor inicial solo se usa al
 * montar; los cambios se reportan por onChange.
 */
export function MapaPinDestino({
  lat,
  lng,
  onChange,
  className = "",
}: {
  lat?: number;
  lng?: number;
  onChange: (lat: number, lng: number) => void;
  className?: string;
}) {
  const contRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const inicialRef = useRef<{ lat?: number; lng?: number }>({ lat, lng });

  useEffect(() => {
    let mapa: Leaflet.Map | undefined;
    let cancelado = false;
    const cont = contRef.current;

    (async () => {
      const mod = await import("leaflet");
      const L = (mod as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
      if (cancelado || !cont || cont.dataset.init === "1") return;
      cont.dataset.init = "1";

      const ini = inicialRef.current;
      const centro: [number, number] = ini.lat != null && ini.lng != null ? [ini.lat, ini.lng] : CENTRO;
      mapa = L.map(cont, { attributionControl: false }).setView(centro, 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapa);
      L.control.attribution({ prefix: false }).addAttribution("© OpenStreetMap").addTo(mapa);

      const icono = L.divIcon({ className: "", html: PIN_HTML, iconSize: [18, 18], iconAnchor: [9, 9] });
      let marcador: Leaflet.Marker | undefined;

      const colocar = (ll: Leaflet.LatLng, avisar: boolean) => {
        if (!marcador) {
          marcador = L.marker(ll, { icon: icono, draggable: true }).addTo(mapa!);
          marcador.on("dragend", () => {
            const p = marcador!.getLatLng();
            onChangeRef.current(p.lat, p.lng);
          });
        } else {
          marcador.setLatLng(ll);
        }
        if (avisar) onChangeRef.current(ll.lat, ll.lng);
      };

      if (ini.lat != null && ini.lng != null) colocar(L.latLng(ini.lat, ini.lng), false);
      mapa.on("click", (e: Leaflet.LeafletMouseEvent) => colocar(e.latlng, true));
    })();

    return () => {
      cancelado = true;
      mapa?.remove();
      if (cont) delete cont.dataset.init;
    };
  }, []);

  return (
    <div
      ref={contRef}
      className={`h-56 sm:h-64 w-full rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden z-0 ${className}`}
      aria-label="Mapa para marcar el destino"
    />
  );
}
