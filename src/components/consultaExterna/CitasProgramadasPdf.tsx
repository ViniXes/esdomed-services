"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Printer } from "lucide-react";
import {
  NOMBRE_DIA,
  NOMBRE_ESTADO,
  agruparPorEspecialidad,
  diaSemanaDeISO,
  textoFranja,
} from "@/lib/consultaExterna/citasProgramadas";
import type { CitaProgramadaConId } from "@/lib/consultaExterna/citasProgramadasDatos";

// PDF de las citas 2027: una hoja (o más) por especialidad, en el orden de la
// lista en pantalla. Overlay + window.print(), como los tabuladores: el usuario
// elige "Guardar como PDF".

const AZUL = "#1A4E70";
const TINTA = "#16191C";
const GRIS = "#5b6670";

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function CitasProgramadasPdf({
  citas,
  titulo,
  generadoPor,
  onClose,
}: {
  citas: CitaProgramadaConId[];
  titulo: string;
  generadoPor: string;
  onClose: () => void;
}) {
  const grupos = agruparPorEspecialidad(citas);
  const generado = new Date().toLocaleString("es-SV", { dateStyle: "long", timeStyle: "short" });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="citas-pdf fixed inset-0 z-[220] overflow-y-auto bg-slate-200 dark:bg-slate-950 print:static print:inset-auto print:overflow-visible print:bg-white">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white shadow-sm print:hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
            <ArrowLeft size={15} /> Volver
          </button>
          <p className="hidden text-center text-xs text-slate-500 sm:block dark:text-slate-400">
            Carta horizontal · una hoja por especialidad · en el diálogo elija <span className="font-semibold">“Guardar como PDF”</span>
          </p>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500">
            <Printer size={14} /> Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      <div id="citas-print" className="space-y-6 px-3 py-6 print:space-y-0 print:p-0 sm:px-4">
        {grupos.map((g) => (
          <div key={g.especialidad} className="hoja mx-auto bg-white shadow-lg" style={{ color: TINTA }}>
            <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", borderBottom: `2px solid ${AZUL}`, paddingBottom: "8px", marginBottom: "10px" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo_hnes.png" alt="Hospital Nacional El Salvador" style={{ height: "48px", width: "auto", objectFit: "contain" }} />
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: AZUL }}>
                  Consulta Externa · Programación de citas
                </p>
                <p style={{ fontSize: "15px", fontWeight: 700, marginTop: "2px" }}>{g.especialidad}</p>
                <p style={{ fontSize: "9px", color: GRIS, marginTop: "1px" }}>
                  {titulo} · {g.citas.length} cita(s)
                </p>
              </div>
            </header>
            <table>
              <thead>
                <tr>
                  {["Fecha", "Horario", "Médico", "Consultorio", "Expediente", "Nombre del paciente", "Tipo", "Estado"].map((h) => (
                    <th key={h} style={{ fontSize: "8.5px", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", color: "#fff", background: AZUL, padding: "4px 5px" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.citas.map((c, i) => (
                  <tr key={c.id} style={{ background: i % 2 ? "#f1f5f9" : "#fff" }}>
                    <td style={celda}>
                      {fechaCorta(c.fecha)} <span style={{ color: GRIS }}>{NOMBRE_DIA[diaSemanaDeISO(c.fecha)].slice(0, 3)}</span>
                    </td>
                    <td style={celda}>{textoFranja(c.franjaInicio, c.franjaFin)}</td>
                    <td style={celda}>{c.medico}</td>
                    <td style={celda}>{c.consultorio}</td>
                    <td style={{ ...celda, fontWeight: 600 }}>{c.expediente}</td>
                    <td style={celda}>
                      {c.paciente}
                      {c.observaciones ? <span style={{ display: "block", color: GRIS }}>{c.observaciones}</span> : null}
                    </td>
                    <td style={celda}>{c.tipo}</td>
                    <td style={celda}>{c.estado === "pendiente" ? "Pendiente" : NOMBRE_ESTADO[c.estado]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: "8px", color: GRIS, marginTop: "8px" }}>
              Generado el {generado} por {generadoPor} · ESDOMED Services
            </p>
          </div>
        ))}
      </div>

      <style jsx global>{`
        #citas-print .hoja {
          width: 27.94cm;
          max-width: 100%;
          padding: 10mm 11mm;
        }
        #citas-print table { border-collapse: collapse; width: 100%; line-height: 1.25; }
        #citas-print thead { display: table-header-group; }
        #citas-print tr { break-inside: avoid; }
        @media print {
          body > *:not(.citas-pdf) { display: none !important; }
          html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
          #citas-print, #citas-print * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          #citas-print .hoja { width: auto !important; padding: 0 !important; box-shadow: none !important; }
          #citas-print .hoja + .hoja { break-before: page; }
          @page { size: letter landscape; margin: 10mm 11mm; }
        }
      `}</style>
    </div>,
    document.body,
  );
}

const celda: React.CSSProperties = { fontSize: "9px", padding: "3px 5px", borderBottom: "1px solid #e2e8f0", verticalAlign: "top" };
