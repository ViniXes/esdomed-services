import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Sora } from "next/font/google";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ServiciosProvider } from "@/contexts/ServiciosContext";
import { TerminosGate } from "@/components/TerminosGate";
import { PwaRegister } from "@/components/PwaRegister";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

// Identidad institucional HNES (public/paletanueva_tipografia.png): Barlow
// para títulos y cuerpo, Barlow Condensed para cintillos en versalitas. El
// tema .tema-hnes va en el <body> para que TODAS las áreas lo hereden —
// incluidos los portales (DateField) que se montan directo en body.
const barlow = Barlow({ variable: "--font-barlow", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const barlowCondensed = Barlow_Condensed({ variable: "--font-barlow-condensed", subsets: ["latin"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: "ESDOMED Services",
  description: "Portal de gestión operativa — Estadística y Documentos Médicos",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ESDOMED",
  },
  // Evita que iOS convierta expedientes/números en tablas en enlaces de
  // llamada/dirección (los detecta como teléfono al ser secuencias numéricas).
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#1c2834" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geistSans.variable} ${sora.variable} h-full antialiased`}>
      <head>
        {/* Aplica el tema oscuro antes del primer render solo si el usuario lo
            eligió antes (evita parpadeo). El tema por defecto es el claro. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
      </head>
      <body className={`tema-hnes ${barlow.variable} ${barlowCondensed.variable} min-h-full flex flex-col bg-slate-50 dark:bg-[var(--color-institutional-dark)] text-slate-900 dark:text-slate-100`}>
        <ThemeProvider>
          <AuthProvider>
            <ServiciosProvider>{children}</ServiciosProvider>
            <TerminosGate />
          </AuthProvider>
        </ThemeProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
