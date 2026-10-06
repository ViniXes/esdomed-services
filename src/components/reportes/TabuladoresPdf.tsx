"use client";

// PDF institucional de Tabuladores (Reportes → Tabuladores): solo tablas por
// servicio, separadas en Bienestar Magisterial (BM, UCI BM, UCIN BM) y Servicios
// de Hospitalización MINSAL. Overlay + window.print(): el usuario elige
// "Guardar como PDF" en el diálogo. Tamaño carta, vertical.
//
// Se monta en un portal directo en <body> para que al imprimir el resto de la
// app se oculte con display:none (no visibility): la tabla de detalle de la
// página puede tener miles de filas y, solo invisible, seguiría ocupando hojas
// en blanco en el PDF.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Printer } from "lucide-react";
import type { Paciente } from "@/types";
import {
  MODALIDADES_VIVO, esServicioBM, generoDe, pivotar, servicioDe, sexoCols,
  type ColDef, type Pivote,
} from "@/lib/reportes/tabuladores";

// Paleta institucional HNES (hoja de papel: siempre clara, ajena al tema).
const AZUL = "#1A4E70";
const ACENTO = "#2B8CA8";
const TINTA = "#16191C";
const GRIS = "#5b6670";
const CERO = "#a3adb6";
const LINEA = "#d5dee5";
const ZEBRA = "#f3f7f9";
const SUAVE = "#e4eff4";

interface Props {
  desde: string;          // YYYY-MM-DD
  hasta: string;          // YYYY-MM-DD
  vivos: Paciente[];
  fallecidos: Paciente[];
  ingresados: Paciente[];
  generadoPor?: string;
  onClose: () => void;
}

interface Categoria {
  id: string;
  titulo: string;
  criterio: string;
  columnas: ColDef[];
  bm: Pivote;
  minsal: Pivote;
  total: number;
}

const fechaLarga = (ymd: string) =>
  new Date(ymd + "T00:00:00").toLocaleDateString("es-SV", { day: "numeric", month: "long", year: "numeric" });

function separar(items: Paciente[], columnas: ColDef[], clasificar: (p: Paciente) => string) {
  const bm = pivotar(items.filter((p) => esServicioBM(servicioDe(p))), columnas, clasificar);
  const minsal = pivotar(items.filter((p) => !esServicioBM(servicioDe(p))), columnas, clasificar);
  return { bm, minsal, total: bm.totalGeneral + minsal.totalGeneral };
}

export default function TabuladoresPdf({ desde, hasta, vivos, fallecidos, ingresados, generadoPor, onClose }: Props) {
  const [generado] = useState(() =>
    new Date().toLocaleString("es-SV", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }),
  );
  const periodo = desde === hasta ? `Día ${fechaLarga(desde)}` : `Del ${fechaLarga(desde)} al ${fechaLarga(hasta)}`;

  const categorias = useMemo<Categoria[]>(() => {
    const colsVivos: ColDef[] = MODALIDADES_VIVO.map((m) => ({ key: m.key, label: m.label }));
    const colsFall = sexoCols(fallecidos);
    const colsIng = sexoCols(ingresados);
    const porSexo = (p: Paciente) => generoDe(p.genero);
    return [
      { id: "vivos", titulo: "Egresos vivos", criterio: "Por servicio y modalidad de egreso · según fecha de egreso", columnas: colsVivos, ...separar(vivos, colsVivos, (p) => p.estado) },
      { id: "fallecidos", titulo: "Egresos fallecidos", criterio: "Por servicio y sexo · según fecha de egreso", columnas: colsFall, ...separar(fallecidos, colsFall, porSexo) },
      { id: "ingresados", titulo: "Ingresados", criterio: "Por servicio y sexo · según fecha de ingreso, en cualquier estado actual", columnas: colsIng, ...separar(ingresados, colsIng, porSexo) },
    ];
  }, [vivos, fallecidos, ingresados]);

  // Nombre sugerido del archivo al "Guardar como PDF" (el navegador usa el título).
  useEffect(() => {
    const anterior = document.title;
    document.title = desde === hasta ? `Tabuladores ESDOMED ${desde}` : `Tabuladores ESDOMED ${desde} a ${hasta}`;
    return () => { document.title = anterior; };
  }, [desde, hasta]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="tabuladores-pdf fixed inset-0 z-[220] bg-slate-200 dark:bg-slate-950 overflow-y-auto print:bg-white print:static print:inset-auto print:overflow-visible">
      {/* Toolbar — oculto al imprimir */}
      <div className="print:hidden sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">
            <ArrowLeft size={15} /> Volver
          </button>
          <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 text-center">
            Vista previa · tamaño carta · en el diálogo elige <span className="font-semibold">“Guardar como PDF”</span>
          </p>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <Printer size={14} /> Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      {/* Hojas (una por categoría; la primera lleva el resumen) */}
      <div id="reporte-print" className="py-6 px-3 sm:px-4 space-y-6 print:p-0 print:space-y-0">
        {categorias.map((cat, i) => (
          <div key={cat.id} className="hoja bg-white shadow-lg mx-auto" style={{ color: TINTA }}>
            <Encabezado periodo={periodo} generado={generado} />
            {i === 0 && <Resumen categorias={categorias} />}
            <SeccionCategoria numero={i + 1} cat={cat}>
              <Pie generadoPor={generadoPor} pagina={i + 1} paginas={categorias.length} />
            </SeccionCategoria>
          </div>
        ))}
      </div>

      {/* Impresión: ocultar TODA la app y dejar solo las hojas del reporte. */}
      <style jsx global>{`
        #reporte-print .hoja {
          width: 21.59cm;
          min-height: 27.94cm;
          max-width: 100%;
          padding: 12mm 13mm;
          line-height: 1.3;
        }
        #reporte-print table { border-collapse: collapse; width: 100%; table-layout: fixed; line-height: 1.25; }
        #reporte-print thead { display: table-header-group; }
        #reporte-print tr { break-inside: avoid; }
        @media print {
          body > *:not(.tabuladores-pdf) { display: none !important; }
          html, body {
            background: #fff !important;
            height: auto !important;
            overflow: visible !important;
          }
          #reporte-print, #reporte-print * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #reporte-print .hoja {
            width: auto !important;
            min-height: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
          #reporte-print .hoja + .hoja { break-before: page; }
          @page { size: letter portrait; margin: 12mm 13mm; }
        }
      `}</style>
    </div>,
    document.body,
  );
}

function Encabezado({ periodo, generado }: { periodo: string; generado: string }) {
  return (
    <header style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", paddingBottom: "10px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo_hnes.png" alt="Hospital Nacional El Salvador" style={{ height: "62px", width: "auto", objectFit: "contain" }} />
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: "8.5px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: AZUL }}>
            Hospital Nacional El Salvador
          </p>
          <p style={{ fontSize: "8.5px", letterSpacing: "0.1em", textTransform: "uppercase", color: GRIS, marginTop: "1px" }}>
            Estadística y Documentos Médicos · ESDOMED
          </p>
          <h1 style={{ fontSize: "16px", fontWeight: 700, color: TINTA, marginTop: "5px", lineHeight: 1.15 }}>
            Tabuladores de egresos e ingresos por servicio
          </h1>
          <p style={{ fontSize: "10px", color: TINTA, marginTop: "2px" }}>{periodo}</p>
          <p style={{ fontSize: "8px", color: GRIS, marginTop: "1px" }}>Generado: {generado}</p>
        </div>
      </div>
      <div style={{ height: "3px", background: AZUL }} />
      <div style={{ height: "1.5px", background: ACENTO, marginTop: "1.5px" }} />
    </header>
  );
}

function Resumen({ categorias }: { categorias: Categoria[] }) {
  const tot = categorias.reduce(
    (a, c) => ({ bm: a.bm + c.bm.totalGeneral, minsal: a.minsal + c.minsal.totalGeneral }),
    { bm: 0, minsal: 0 },
  );
  return (
    <section style={{ marginBottom: "18px", breakInside: "avoid" }}>
      <TituloGrupo titulo="Resumen del período" />
      <table style={{ fontSize: "9.5px" }}>
        <colgroup>
          <col style={{ width: "40%" }} />
          <col style={{ width: "20%" }} />
          <col style={{ width: "20%" }} />
          <col style={{ width: "20%" }} />
        </colgroup>
        <thead>
          <tr style={{ background: AZUL, color: "#fff" }}>
            <Th>Categoría</Th>
            <Th center>Bienestar Magisterial</Th>
            <Th center>Hospitalización MINSAL</Th>
            <Th center>Total</Th>
          </tr>
        </thead>
        <tbody>
          {categorias.map((c, i) => (
            <tr key={c.id} style={{ background: i % 2 ? ZEBRA : "#fff", borderBottom: `1px solid ${LINEA}` }}>
              <td style={{ padding: "4px 7px", fontWeight: 600 }}>{c.titulo}</td>
              <Num v={c.bm.totalGeneral} />
              <Num v={c.minsal.totalGeneral} />
              <Num v={c.total} fuerte />
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: "8px", color: GRIS, marginTop: "4px" }}>
        Egresos según fecha de egreso; ingresados según fecha de ingreso. Un paciente ingresado en el período puede figurar también como egreso.
        {tot.bm + tot.minsal === 0 && " No hay registros en el período seleccionado."}
      </p>
    </section>
  );
}

/** `children` = pie de la sección: va pegado al Total general para que nunca
 *  quede solo en una hoja aparte. */
function SeccionCategoria({ numero, cat, children }: { numero: number; cat: Categoria; children: React.ReactNode }) {
  const general = useMemo(() => {
    const cols: Record<string, number> = {};
    cat.columnas.forEach((c) => { cols[c.key] = (cat.bm.totCols[c.key] ?? 0) + (cat.minsal.totCols[c.key] ?? 0); });
    return cols;
  }, [cat]);

  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", borderBottom: `1px solid ${LINEA}`, paddingBottom: "4px", breakAfter: "avoid" }}>
        <h2 style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: AZUL }}>
          {numero}. {cat.titulo}
        </h2>
        <p style={{ fontSize: "10px", color: GRIS }}>
          Total del período: <span style={{ fontWeight: 700, color: TINTA }}>{cat.total}</span>
        </p>
      </div>
      <p style={{ fontSize: "8.5px", color: GRIS, marginTop: "3px", marginBottom: "12px" }}>{cat.criterio}</p>

      <TablaGrupo
        titulo="Bienestar Magisterial"
        subtitulo="Bienestar Magisterial · UCI BM · UCIN BM"
        etiquetaTotal="Total Bienestar Magisterial"
        columnas={cat.columnas}
        pivote={cat.bm}
      />
      <TablaGrupo
        titulo="Servicios de Hospitalización — MINSAL"
        subtitulo="Todos los demás servicios de hospitalización"
        etiquetaTotal="Total Hospitalización MINSAL"
        columnas={cat.columnas}
        pivote={cat.minsal}
      />

      {/* Total general (BM + MINSAL) + pie */}
      <div style={{ breakInside: "avoid" }}>
        <table style={{ fontSize: "9.5px" }}>
          <Columnas columnas={cat.columnas} />
          <tbody>
            <tr style={{ background: AZUL, color: "#fff", fontWeight: 700 }}>
              <td style={{ padding: "5px 7px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total general</td>
              {cat.columnas.map((c) => (
                <td key={c.key} style={{ padding: "5px 4px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{general[c.key] ?? 0}</td>
              ))}
              <td style={{ padding: "5px 4px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{cat.total}</td>
            </tr>
          </tbody>
        </table>
        {children}
      </div>
    </section>
  );
}

function TablaGrupo({ titulo, subtitulo, etiquetaTotal, columnas, pivote }: {
  titulo: string; subtitulo: string; etiquetaTotal: string; columnas: ColDef[]; pivote: Pivote;
}) {
  // Un grupo corto no se parte entre páginas; uno largo sí (repite encabezados).
  const corto = pivote.filas.length <= 18;
  return (
    <div style={{ marginBottom: "14px", breakInside: corto ? "avoid" : "auto" }}>
      <TituloGrupo titulo={titulo} subtitulo={subtitulo} />
      <table style={{ fontSize: "9.5px" }}>
        <Columnas columnas={columnas} />
        <thead>
          <tr style={{ background: AZUL, color: "#fff" }}>
            <Th>Servicio</Th>
            {columnas.map((c) => <Th key={c.key} center>{c.label}</Th>)}
            <Th center>Total</Th>
          </tr>
        </thead>
        <tbody>
          {pivote.filas.length === 0 ? (
            <tr style={{ borderBottom: `1px solid ${LINEA}` }}>
              <td colSpan={columnas.length + 2} style={{ padding: "7px", textAlign: "center", fontStyle: "italic", color: GRIS }}>
                Sin registros en el período.
              </td>
            </tr>
          ) : (
            pivote.filas.map((f, i) => (
              <tr key={f.servicio} style={{ background: i % 2 ? ZEBRA : "#fff", borderBottom: `1px solid ${LINEA}` }}>
                <td style={{ padding: "3px 7px", lineHeight: 1.2 }}>{f.servicio}</td>
                {columnas.map((c) => <Num key={c.key} v={f.cols[c.key] ?? 0} />)}
                <Num v={f.total} fuerte />
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr style={{ background: SUAVE, borderTop: `1.5px solid ${AZUL}`, fontWeight: 700, color: AZUL }}>
            <td style={{ padding: "4px 7px" }}>{etiquetaTotal}</td>
            {columnas.map((c) => (
              <td key={c.key} style={{ padding: "4px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{pivote.totCols[c.key] ?? 0}</td>
            ))}
            <td style={{ padding: "4px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{pivote.totalGeneral}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Mismos anchos en todas las tablas de una categoría, para que las columnas calcen. */
function Columnas({ columnas }: { columnas: ColDef[] }) {
  const anchoServicio = columnas.length >= 5 ? 38 : 46;
  const anchoNum = (100 - anchoServicio) / (columnas.length + 1);
  return (
    <colgroup>
      <col style={{ width: `${anchoServicio}%` }} />
      {columnas.map((c) => <col key={c.key} style={{ width: `${anchoNum}%` }} />)}
      <col style={{ width: `${anchoNum}%` }} />
    </colgroup>
  );
}

function TituloGrupo({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "5px", breakAfter: "avoid" }}>
      <h3 style={{ fontSize: "10.5px", fontWeight: 700, color: AZUL }}>{titulo}</h3>
      {subtitulo && <span style={{ fontSize: "8px", color: GRIS }}>{subtitulo}</span>}
    </div>
  );
}

function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <th style={{
      padding: "5px 4px", paddingLeft: center ? "4px" : "7px", textAlign: center ? "center" : "left",
      fontSize: "8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.2, verticalAlign: "bottom",
    }}>
      {children}
    </th>
  );
}

function Num({ v, fuerte }: { v: number; fuerte?: boolean }) {
  return (
    <td style={{
      padding: "3px 4px", textAlign: "center", fontVariantNumeric: "tabular-nums",
      fontWeight: fuerte ? 700 : 400,
      color: fuerte ? TINTA : v === 0 ? CERO : TINTA,
      background: fuerte ? "rgba(43, 140, 168, 0.07)" : undefined,
    }}>
      {v}
    </td>
  );
}

function Pie({ generadoPor, pagina, paginas }: { generadoPor?: string; pagina: number; paginas: number }) {
  return (
    <footer style={{ marginTop: "16px", paddingTop: "5px", borderTop: `1px solid ${LINEA}`, display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "7.5px", color: GRIS }}>
      <span>Fuente: Sistema Integrado de Salud - SIS{generadoPor ? ` · Generado por ${generadoPor}` : ""}</span>
      <span style={{ whiteSpace: "nowrap" }}>Sección {pagina} de {paginas}</span>
    </footer>
  );
}
