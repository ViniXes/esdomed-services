import type { NextConfig } from "next";

// Cabeceras de caché para assets estáticos de /public y el manifest de la PWA.
// Gotcha de Vercel: los archivos de /public se sirven por defecto con
// `max-age=0, must-revalidate`, así que el navegador los REVALIDA en cada carga y
// cada revalidación cuenta como un Edge Request. El manifest y su icono se re-pedían
// en cada apertura de la PWA (estaban en el top de consumo). Con esto el navegador
// los cachea y deja de golpear a Vercel en cada visita.
// (A /sw.js NO se le pone caché a propósito: el service worker debe revalidarse
// para que los deploys nuevos lo reemplacen.)
const CACHE_STATIC = "public, max-age=604800, stale-while-revalidate=86400"; // 7 días

const nextConfig: NextConfig = {
  // Todas las imágenes del proyecto son logos/íconos locales ya listos: servir
  // el original desde /public (con las cabeceras de caché de abajo) evita las
  // peticiones a /_next/image en cada carga, que cuentan como Edge Requests +
  // transformaciones de Image Optimization.
  images: { unoptimized: true },
  async headers() {
    return [
      // Iconos de la PWA (rara vez cambian).
      { source: "/icons/:path*", headers: [{ key: "Cache-Control", value: CACHE_STATIC }] },
      // Logos e imágenes del /public raíz (por extensión).
      { source: "/(.*)\\.(png|jpg|jpeg|svg|ico|webp)", headers: [{ key: "Cache-Control", value: CACHE_STATIC }] },
      // Manifest: caché moderada (1 día) por ser el punto de entrada de la PWA.
      { source: "/manifest.webmanifest", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] },
      // Catálogo de códigos de marcación (JSON estático de /public): sin esto
      // se revalida en cada visita a la página de usuarios (1 día de caché).
      { source: "/esdomed/marcacion.json", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] },
    ];
  },
};

export default nextConfig;
