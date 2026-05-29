import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Sora } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ServiciosProvider } from "@/contexts/ServiciosContext";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "ESDOMED Services",
  description: "Portal de gestión operativa — Estadística y Documentos Médicos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geistSans.variable} ${sora.variable} dark h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-[var(--color-institutional-dark)] text-slate-900 dark:text-slate-100">
        <ThemeProvider>
          <AuthProvider>
            <ServiciosProvider>{children}</ServiciosProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
