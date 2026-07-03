"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, Timestamp, where } from "firebase/firestore";
import {
  BadgeCheck,
  BarChart3,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  HeartPulse,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { ProductividadTabs } from "../_components/ProductividadTabs";
import { GraficoBarras, GraficoPastel, TarjetaMonitoreoHorario, type PuntoDato, type RegistroMonitoreo } from "../_components/GraficosProductividad";
import type { NotificacionAltaVivo, NotificacionFallecido, RegistroAlta, SolicitudImpresion, SolicitudTraslado } from "@/types";

type Vista = "resumen" | "expedientes" | "documentos" | "altas" | "franjas";

type ControlIngreso = {
  id?: string;
  responsableIngresoNombre?: string;
  creadoPorNombre?: string;
  creadoEn?: unknown;
};

const VISTAS: { id: Vista; label: string; icon: LucideIcon }[] = [
  { id: "resumen", label: "Resumen", icon: BarChart3 },
  { id: "expedientes", label: "Expedientes y defunciones", icon: HeartPulse },
  { id: "documentos", label: "Documentos entregados", icon: FileCheck2 },
  { id: "altas", label: "Altas y SIMMOW", icon: BadgeCheck },
  { id: "franjas", label: "Franjas horarias", icon: Clock3 },
];

const COLUMNAS_RESUMEN = [
  { id: "expedientes", label: "Expedientes creados", corto: "Expedientes" },
  { id: "defunciones", label: "Defunciones procesadas", corto: "Defunciones" },
  { id: "certificados", label: "Certificados entregados", corto: "Certificados" },
  { id: "altas", label: "Altas efectivas", corto: "Altas" },
  { id: "documentos", label: "Docs. de alta entregados", corto: "Docs. alta" },
  { id: "simmow", label: "Altas digitadas SIMMOW", corto: "SIMMOW" },
  { id: "traslados", label: "Traslados procesados", corto: "Traslados" },
] as const;

type TonoTarjeta = "blue" | "rose" | "amber" | "emerald" | "cyan" | "violet" | "slate";

const tonosTarjeta: Record<TonoTarjeta, { barra: string; icono: string }> = {
  blue: { barra: "bg-blue-500", icono: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  rose: { barra: "bg-rose-500", icono: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  amber: { barra: "bg-amber-500", icono: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  emerald: { barra: "bg-emerald-500", icono: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  cyan: { barra: "bg-cyan-500", icono: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300" },
  violet: { barra: "bg-violet-500", icono: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  slate: { barra: "bg-slate-500", icono: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
};

const selectCls =
  "appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer";

const FRANJAS = [
  { label: "00:00 - 06:00", desde: 0, hasta: 6 },
  { label: "06:00 - 12:00", desde: 6, hasta: 12 },
  { label: "12:00 - 18:00", desde: 12, hasta: 18 },
  { label: "18:00 - 24:00", desde: 18, hasta: 24 },
] as const;

function mesActualStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
}

function rangoMes(mes: string): { inicio: Date; fin: Date; iniStr: string; finStr: string } {
  const [y, m] = mes.split("-").map(Number);
  const inicio = new Date(y, m - 1, 1);
  const fin = new Date(y, m, 0, 23, 59, 59, 999);
  const dias = fin.getDate();
  return { inicio, fin, iniStr: `${mes}-01`, finStr: `${mes}-${`${dias}`.padStart(2, "0")}` };
}

function aFecha(value: unknown): Date | null {
  if (!value) return null;
  const timestamp = value as { toDate?: () => Date };
  const fecha = timestamp.toDate?.() ?? new Date(value as string);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function contarPor<T>(items: T[], obtenerNombre: (item: T) => string | undefined | null): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const item of items) {
    const nombre = obtenerNombre(item)?.trim();
    if (!nombre) continue;
    mapa.set(nombre, (mapa.get(nombre) ?? 0) + 1);
  }
  return mapa;
}

function contarFranjas(fechas: Date[]): number[] {
  return FRANJAS.map(({ desde, hasta }) => fechas.filter(f => f.getHours() >= desde && f.getHours() < hasta).length);
}

function mapaAArray(mapa: Map<string, number>): PuntoDato[] {
  return Array.from(mapa, ([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor);
}

function franjasAArray(franjas: number[]): PuntoDato[] {
  return FRANJAS.map((franja, index) => ({ nombre: franja.label, valor: franjas[index] }));
}

function contarPorDia(fechas: Date[], diasEnMes: number): PuntoDato[] {
  const conteo = new Array(diasEnMes + 1).fill(0);
  for (const fecha of fechas) conteo[fecha.getDate()] += 1;
  return Array.from({ length: diasEnMes }, (_, index) => ({ nombre: String(index + 1), valor: conteo[index + 1] }));
}

function aRegistros<T>(items: T[], obtenerNombre: (item: T) => string | undefined | null, obtenerFecha: (item: T) => unknown): RegistroMonitoreo[] {
  const registros: RegistroMonitoreo[] = [];
  for (const item of items) {
    const nombre = obtenerNombre(item)?.trim();
    const fecha = aFecha(obtenerFecha(item));
    if (!nombre || !fecha) continue;
    registros.push({ nombre, fecha });
  }
  return registros;
}

export default function ProductividadEsdomedPage() {
  const [mes, setMes] = useState(mesActualStr());
  const [personal, setPersonal] = useState<string[]>([]);
  const [controlIngresos, setControlIngresos] = useState<ControlIngreso[]>([]);
  const [fallecidosConfirmados, setFallecidosConfirmados] = useState<NotificacionFallecido[]>([]);
  const [fallecidosCertificado, setFallecidosCertificado] = useState<NotificacionFallecido[]>([]);
  const [altas, setAltas] = useState<RegistroAlta[]>([]);
  const [altasEfectivasProcesadas, setAltasEfectivasProcesadas] = useState<NotificacionAltaVivo[]>([]);
  const [impresionesEntregadas, setImpresionesEntregadas] = useState<SolicitudImpresion[]>([]);
  const [traslados, setTraslados] = useState<SolicitudTraslado[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [vista, setVista] = useState<Vista>("resumen");
  const [personaFranjas, setPersonaFranjas] = useState<string>("todas");
  const [mostrarHoras, setMostrarHoras] = useState(false);
  const [subVistaFranjas, setSubVistaFranjas] = useState<"dia" | "horario">("dia");

  const { inicio, fin, iniStr, finStr } = useMemo(() => rangoMes(mes), [mes]);

  useEffect(() => {
    getDocs(query(collection(db, "usuarios"), where("role", "in", ["esdomed", "asistente_esdomed", "admin"])))
      .then(s => setPersonal(s.docs.map(d => (d.data().nombre as string)).filter(Boolean).sort((a, b) => a.localeCompare(b))))
      .catch(() => setPersonal([]));
  }, []);

  useEffect(() => {
    queueMicrotask(() => setLoading(true));
    const inicioTs = Timestamp.fromDate(inicio);
    const finTs = Timestamp.fromDate(fin);

    Promise.all([
      getDocs(query(collection(db, "control_ingresos"), where("creadoEn", ">=", inicioTs), where("creadoEn", "<=", finTs))),
      getDocs(query(collection(db, "notificaciones_fallecidos"), where("confirmadoEn", ">=", inicioTs), where("confirmadoEn", "<=", finTs))),
      getDocs(query(collection(db, "notificaciones_fallecidos"), where("entregaCertificadoEn", ">=", inicioTs), where("entregaCertificadoEn", "<=", finTs))),
      getDocs(query(collection(db, "registro_altas"), where("fecha", ">=", iniStr), where("fecha", "<=", finStr))),
      getDocs(query(collection(db, "notificaciones_altas"), where("procesadoEn", ">=", inicioTs), where("procesadoEn", "<=", finTs))),
      getDocs(query(collection(db, "solicitudes_impresion"), where("impresoEn", ">=", inicioTs), where("impresoEn", "<=", finTs))),
      getDocs(query(collection(db, "traslados"), where("actualizadoEn", ">=", inicioTs), where("actualizadoEn", "<=", finTs))),
    ])
      .then(([ingresosSnap, confirmadosSnap, certificadoSnap, altasSnap, altasProcesadasSnap, impresionesSnap, trasladosSnap]) => {
        setControlIngresos(ingresosSnap.docs.map(d => ({ id: d.id, ...d.data() } as ControlIngreso)));
        setFallecidosConfirmados(confirmadosSnap.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionFallecido)));
        setFallecidosCertificado(certificadoSnap.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionFallecido)));
        setAltas(altasSnap.docs.map(d => ({ id: d.id, ...d.data() } as RegistroAlta)));
        setAltasEfectivasProcesadas(
          altasProcesadasSnap.docs
            .map(d => ({ id: d.id, ...d.data() } as NotificacionAltaVivo))
            .filter(a => a.estado === "procesada")
        );
        setImpresionesEntregadas(
          impresionesSnap.docs
            .map(d => ({ id: d.id, ...d.data() } as SolicitudImpresion))
            .filter(i => i.estado === "impreso")
        );
        setTraslados(trasladosSnap.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudTraslado)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [inicio, fin, iniStr, finStr]);

  const expedientesCreados = useMemo(() => contarPor(controlIngresos, i => i.responsableIngresoNombre ?? i.creadoPorNombre), [controlIngresos]);
  const defuncionesProcesadas = useMemo(() => contarPor(fallecidosConfirmados, f => f.confirmadoPorNombre), [fallecidosConfirmados]);
  const certificadosEntregados = useMemo(() => contarPor(fallecidosCertificado, f => f.entregaCertificado), [fallecidosCertificado]);
  const altasEfectivas = useMemo(() => contarPor(altasEfectivasProcesadas, a => a.procesadoPorNombre), [altasEfectivasProcesadas]);
  const documentosEntregados = useMemo(() => contarPor(impresionesEntregadas, i => i.impresoPorNombre), [impresionesEntregadas]);
  const altasSimmow = useMemo(() => contarPor(altas.filter(a => a.digitadorSimmow), a => a.digitadorSimmow), [altas]);
  const trasladosProcesados = useMemo(() => contarPor(traslados, t => t.revisadoPorNombre), [traslados]);

  const registrosIngresos = useMemo(() => aRegistros(controlIngresos, i => i.responsableIngresoNombre ?? i.creadoPorNombre, i => i.creadoEn), [controlIngresos]);
  const registrosAltas = useMemo(() => aRegistros(altasEfectivasProcesadas, a => a.procesadoPorNombre, a => a.procesadoEn), [altasEfectivasProcesadas]);
  const registrosFallecidos = useMemo(() => aRegistros(fallecidosConfirmados, f => f.confirmadoPorNombre, f => f.confirmadoEn), [fallecidosConfirmados]);
  const registrosTraslados = useMemo(() => aRegistros(traslados, t => t.revisadoPorNombre, t => t.actualizadoEn), [traslados]);

  const registrosIngresosFiltrados = useMemo(() => (personaFranjas === "todas" ? registrosIngresos : registrosIngresos.filter(r => r.nombre === personaFranjas)), [registrosIngresos, personaFranjas]);
  const registrosAltasFiltrados = useMemo(() => (personaFranjas === "todas" ? registrosAltas : registrosAltas.filter(r => r.nombre === personaFranjas)), [registrosAltas, personaFranjas]);
  const registrosFallecidosFiltrados = useMemo(() => (personaFranjas === "todas" ? registrosFallecidos : registrosFallecidos.filter(r => r.nombre === personaFranjas)), [registrosFallecidos, personaFranjas]);
  const registrosTrasladosFiltrados = useMemo(() => (personaFranjas === "todas" ? registrosTraslados : registrosTraslados.filter(r => r.nombre === personaFranjas)), [registrosTraslados, personaFranjas]);

  const diasEnMes = fin.getDate();
  const porDiaIngresos = useMemo(() => (personaFranjas === "todas" ? undefined : contarPorDia(registrosIngresosFiltrados.map(r => r.fecha), diasEnMes)), [registrosIngresosFiltrados, personaFranjas, diasEnMes]);
  const porDiaAltas = useMemo(() => (personaFranjas === "todas" ? undefined : contarPorDia(registrosAltasFiltrados.map(r => r.fecha), diasEnMes)), [registrosAltasFiltrados, personaFranjas, diasEnMes]);
  const porDiaFallecidos = useMemo(() => (personaFranjas === "todas" ? undefined : contarPorDia(registrosFallecidosFiltrados.map(r => r.fecha), diasEnMes)), [registrosFallecidosFiltrados, personaFranjas, diasEnMes]);
  const porDiaTraslados = useMemo(() => (personaFranjas === "todas" ? undefined : contarPorDia(registrosTrasladosFiltrados.map(r => r.fecha), diasEnMes)), [registrosTrasladosFiltrados, personaFranjas, diasEnMes]);

  const franjaIngresos = useMemo(() => contarFranjas(registrosIngresosFiltrados.map(r => r.fecha)), [registrosIngresosFiltrados]);
  const franjaAltas = useMemo(() => contarFranjas(registrosAltasFiltrados.map(r => r.fecha)), [registrosAltasFiltrados]);
  const franjaFallecidos = useMemo(() => contarFranjas(registrosFallecidosFiltrados.map(r => r.fecha)), [registrosFallecidosFiltrados]);
  const franjaTraslados = useMemo(() => contarFranjas(registrosTrasladosFiltrados.map(r => r.fecha)), [registrosTrasladosFiltrados]);

  const nombres = useMemo(() => {
    const set = new Set<string>(personal);
    for (const mapa of [expedientesCreados, defuncionesProcesadas, certificadosEntregados, altasEfectivas, documentosEntregados, altasSimmow, trasladosProcesados]) {
      for (const nombre of mapa.keys()) set.add(nombre);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [personal, expedientesCreados, defuncionesProcesadas, certificadosEntregados, altasEfectivas, documentosEntregados, altasSimmow, trasladosProcesados]);

  const totales = {
    expedientesCreados: controlIngresos.length,
    defuncionesProcesadas: fallecidosConfirmados.length,
    certificadosEntregados: fallecidosCertificado.length,
    altasEfectivas: altasEfectivas.size ? Array.from(altasEfectivas.values()).reduce((a, b) => a + b, 0) : 0,
    documentosEntregados: Array.from(documentosEntregados.values()).reduce((a, b) => a + b, 0),
    altasSimmow: Array.from(altasSimmow.values()).reduce((a, b) => a + b, 0),
    trasladosProcesados: Array.from(trasladosProcesados.values()).reduce((a, b) => a + b, 0),
  };

  const simmowDona: PuntoDato[] = [
    { nombre: "Digitadas en SIMMOW", valor: totales.altasSimmow },
    { nombre: "Pendientes de digitar", valor: Math.max(0, totales.altasEfectivas - totales.altasSimmow) },
  ];

  const resumenPorPersona = useMemo(() => nombres.map(nombre => {
    const valores = {
      expedientes: expedientesCreados.get(nombre) ?? 0,
      defunciones: defuncionesProcesadas.get(nombre) ?? 0,
      certificados: certificadosEntregados.get(nombre) ?? 0,
      altas: altasEfectivas.get(nombre) ?? 0,
      documentos: documentosEntregados.get(nombre) ?? 0,
      simmow: altasSimmow.get(nombre) ?? 0,
      traslados: trasladosProcesados.get(nombre) ?? 0,
    };
    const total = Object.values(valores).reduce((sum, valor) => sum + valor, 0);
    return { nombre, valores, total };
  }), [
    nombres,
    expedientesCreados,
    defuncionesProcesadas,
    certificadosEntregados,
    altasEfectivas,
    documentosEntregados,
    altasSimmow,
    trasladosProcesados,
  ]);

  const exportarExcel = async () => {
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const aoa: (string | number)[][] = [
        ["Productividad ESDOMED", mes],
        [],
        ["Nombre", "Expedientes creados", "Defunciones procesadas", "Certificados entregados", "Altas efectivas", "Documentos de alta entregados", "Altas digitadas SIMMOW", "Traslados procesados"],
        ...nombres.map(nombre => [
          nombre,
          expedientesCreados.get(nombre) ?? 0,
          defuncionesProcesadas.get(nombre) ?? 0,
          certificadosEntregados.get(nombre) ?? 0,
          altasEfectivas.get(nombre) ?? 0,
          documentosEntregados.get(nombre) ?? 0,
          altasSimmow.get(nombre) ?? 0,
          trasladosProcesados.get(nombre) ?? 0,
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Productividad ESDOMED");
      XLSX.writeFile(wb, `productividad_esdomed_${mes}.xlsx`);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
          <BarChart3 size={13} /> Productividad
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">ESDOMED</h1>
        <p className="text-xs text-slate-500 mt-0.5">Producción del personal de ESDOMED por periodo.</p>
      </div>

      <ProductividadTabs />

      <div className="flex flex-wrap items-center gap-3">
        <input type="month" value={mes} onChange={e => setMes(e.target.value)} className={selectCls} />
        {!loading && (
          <button
            onClick={exportarExcel}
            disabled={exportando}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <Download size={15} /> {exportando ? "Exportando..." : "Exportar Excel"}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 py-16 text-center">Cargando...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-white/80 p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 lg:grid-cols-5">
            {VISTAS.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setVista(item.id)}
                className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold transition-all sm:text-sm ${
                  vista === item.id
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <item.icon size={15} className="shrink-0" />
                {item.label}
              </button>
            ))}
          </div>

          {vista === "resumen" && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
                <TarjetaTotal label="Expedientes creados" valor={totales.expedientesCreados} icon={FileText} tono="blue" />
                <TarjetaTotal label="Defunciones procesadas" valor={totales.defuncionesProcesadas} icon={HeartPulse} tono="rose" />
                <TarjetaTotal label="Certificados entregados" valor={totales.certificadosEntregados} icon={FileCheck2} tono="amber" />
                <TarjetaTotal label="Altas efectivas" valor={totales.altasEfectivas} icon={BadgeCheck} tono="emerald" />
                <TarjetaTotal label="Docs. de alta entregados" valor={totales.documentosEntregados} icon={FileCheck2} tono="cyan" />
                <TarjetaTotal label="Altas digitadas SIMMOW" valor={totales.altasSimmow} icon={BadgeCheck} tono="violet" />
                <TarjetaTotal label="Traslados procesados" valor={totales.trasladosProcesados} icon={Clock3} tono="slate" />
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Resumen por persona</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Comparativo mensual de productividad individual.</p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    <BarChart3 size={14} />
                    {resumenPorPersona.length} personas
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <th className="sticky left-0 z-10 min-w-[190px] bg-white px-4 py-3 text-left text-[11px] font-bold uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">Nombre</th>
                        {COLUMNAS_RESUMEN.map(columna => (
                          <th key={columna.id} className="px-3 py-3 text-center text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
                            <span className="hidden xl:inline">{columna.label}</span>
                            <span className="xl:hidden">{columna.corto}</span>
                          </th>
                        ))}
                        <th className="px-4 py-3 text-center text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {resumenPorPersona.map((fila, index) => (
                        <tr key={fila.nombre} className="group hover:bg-blue-50/50 dark:hover:bg-slate-800/70">
                          <td className={`sticky left-0 z-10 whitespace-nowrap px-4 py-3 font-semibold text-slate-800 transition-colors dark:text-slate-100 ${index % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50/70 dark:bg-slate-900"} group-hover:bg-blue-50 dark:group-hover:bg-slate-800`}>
                            {fila.nombre}
                          </td>
                          {COLUMNAS_RESUMEN.map(columna => (
                            <td key={columna.id} className="px-3 py-3 text-center">
                              <span className={`inline-flex min-w-8 justify-center rounded-md px-2 py-1 text-sm font-semibold tabular-nums ${fila.valores[columna.id] > 0 ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`}>
                                {fila.valores[columna.id]}
                              </span>
                            </td>
                          ))}
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex min-w-10 justify-center rounded-lg bg-blue-600 px-2.5 py-1 text-sm font-bold tabular-nums text-white shadow-sm shadow-blue-600/20">
                              {fila.total}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {vista === "expedientes" && (
            <div className="grid gap-4 md:grid-cols-2">
              <GraficoPastel titulo="Expedientes creados por persona" datos={mapaAArray(expedientesCreados)} />
              <GraficoPastel titulo="Defunciones procesadas por persona" datos={mapaAArray(defuncionesProcesadas)} />
            </div>
          )}

          {vista === "documentos" && (
            <div className="grid gap-4 md:grid-cols-2">
              <GraficoBarras titulo="Certificados de defunción entregados" datos={mapaAArray(certificadosEntregados)} color="#f43f5e" />
              <GraficoBarras titulo="Documentos de alta entregados" datos={mapaAArray(documentosEntregados)} color="#10b981" />
            </div>
          )}

          {vista === "altas" && (
            <div className="grid gap-4 md:grid-cols-2">
              <GraficoBarras titulo="Altas efectivas por persona" datos={mapaAArray(altasEfectivas)} color="#3b82f6" />
              <GraficoBarras titulo="Traslados procesados por persona" datos={mapaAArray(trasladosProcesados)} color="#8b5cf6" />
              <GraficoPastel titulo="Altas digitadas en SIMMOW" datos={simmowDona} />
            </div>
          )}

          {vista === "franjas" && (() => {
            const hayPersona = personaFranjas !== "todas";
            const datosIngresos = hayPersona && subVistaFranjas === "dia" ? porDiaIngresos! : franjasAArray(franjaIngresos);
            const datosAltas = hayPersona && subVistaFranjas === "dia" ? porDiaAltas! : franjasAArray(franjaAltas);
            const datosFallecidos = hayPersona && subVistaFranjas === "dia" ? porDiaFallecidos! : franjasAArray(franjaFallecidos);
            const datosTraslados = hayPersona && subVistaFranjas === "dia" ? porDiaTraslados! : franjasAArray(franjaTraslados);
            return (
              <>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">Ver detalle de:</span>
                    <select value={personaFranjas} onChange={e => setPersonaFranjas(e.target.value)} className={selectCls}>
                      <option value="todas">Todas las personas (solo gráfica)</option>
                      {nombres.map(nombre => <option key={nombre} value={nombre}>{nombre}</option>)}
                    </select>
                  </label>
                  {hayPersona && (
                    <>
                      <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950">
                        <button
                          type="button"
                          onClick={() => setSubVistaFranjas("dia")}
                          className={`rounded-md px-3 py-1.5 ${subVistaFranjas === "dia" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-900"}`}
                        >
                          Por día del mes
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubVistaFranjas("horario")}
                          className={`rounded-md px-3 py-1.5 ${subVistaFranjas === "horario" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-900"}`}
                        >
                          Por horario
                        </button>
                      </div>
                      <label className="flex items-center gap-1.5 text-sm text-slate-500">
                        <input type="checkbox" checked={mostrarHoras} onChange={e => setMostrarHoras(e.target.checked)} className="rounded border-slate-300 dark:border-slate-700" />
                        Mostrar horas exactas
                      </label>
                    </>
                  )}
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <TarjetaMonitoreoHorario titulo="Ingresos (expedientes) procesados" registros={registrosIngresosFiltrados} datos={datosIngresos} mostrarHoras={mostrarHoras} color="#3b82f6" />
                  <TarjetaMonitoreoHorario titulo="Altas procesadas" registros={registrosAltasFiltrados} datos={datosAltas} mostrarHoras={mostrarHoras} color="#10b981" />
                  <TarjetaMonitoreoHorario titulo="Fallecidos procesados" registros={registrosFallecidosFiltrados} datos={datosFallecidos} mostrarHoras={mostrarHoras} color="#f43f5e" />
                  <TarjetaMonitoreoHorario titulo="Traslados procesados" registros={registrosTrasladosFiltrados} datos={datosTraslados} mostrarHoras={mostrarHoras} color="#8b5cf6" />
                </div>
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}

function TarjetaTotal({ label, valor, icon: Icon, tono }: { label: string; valor: number; icon: LucideIcon; tono: TonoTarjeta }) {
  const clases = tonosTarjeta[tono];
  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
      <div className={`absolute inset-x-0 top-0 h-1 ${clases.barra}`} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-bold font-heading tabular-nums text-slate-900 dark:text-slate-100">{valor}</p>
        </div>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${clases.icono}`}>
          <Icon size={16} />
        </div>
      </div>
    </div>
  );
}
