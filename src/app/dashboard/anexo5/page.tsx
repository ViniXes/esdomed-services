"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  collection, onSnapshot, orderBy, query, limit, doc, updateDoc, Timestamp,
  where, getDocs, type QueryConstraint, type QueryDocumentSnapshot, type DocumentData,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { DateField } from "@/components/ui/DateField";
import { ClipboardList, Clock, CheckCircle2, Search, Printer, X } from "lucide-react";
import type { SolicitudAnexo5 } from "@/types";
import { formatearFechaGeneracionAnexo5 } from "@/lib/anexo5";

type Tab = "cola" | "historial";

// El histórico (1200+ referencias emitidas y creciendo) se consulta bajo
// demanda: en vivo solo queda la cola de pendientes, que es lo accionable.
const LIMIT_HISTORICO = 500;

const mapAnexo5 = (d: QueryDocumentSnapshot<DocumentData>): SolicitudAnexo5 => ({
  id: d.id,
  ...d.data(),
  creadoEn: d.data().creadoEn?.toDate ? d.data().creadoEn.toDate() : new Date(d.data().creadoEn),
}) as SolicitudAnexo5;

const ms = (f: SolicitudAnexo5["creadoEn"]) => new Date(f as unknown as string).getTime();

export default function BandejaAnexo5Page() {
  const { profile } = useAuth();
  const [cola, setCola] = useState<SolicitudAnexo5[]>([]);
  const [tab, setTab] = useState<Tab>("cola");
  const [busqueda, setBusqueda] = useState("");
  const [seleccionado, setSeleccionado] = useState<SolicitudAnexo5 | null>(null);
  const [loading, setLoading] = useState(true);

  // Historial: bajo demanda, exige expediente o rango de fechas.
  const [expBusqueda, setExpBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [resultados, setResultados] = useState<SolicitudAnexo5[] | null>(null); // null = aún no se busca
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState("");

  // Solo la cola de pendientes en vivo (sin orderBy para no exigir índice
  // compuesto estado + creadoEn; se ordena en cliente). Antes este listener
  // bajaba las 400 referencias más recientes en cada apertura.
  useEffect(() => {
    const q = query(collection(db, "anexo5"), where("estado", "==", "pendiente"));
    return onSnapshot(
      q,
      (snap) => {
        setCola(snap.docs.map(mapAnexo5).sort((a, b) => ms(b.creadoEn) - ms(a.creadoEn)));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);

  const sinCriterio = !expBusqueda.trim() && !fechaDesde && !fechaHasta;

  // Búsqueda del historial: una sola lectura puntual, no un listener.
  const buscar = async () => {
    const exp = expBusqueda.trim();
    if (sinCriterio) return;
    setBuscando(true);
    setErrorBusqueda("");
    try {
      let docs: SolicitudAnexo5[];
      if (exp) {
        // Por expediente exacto: todas las referencias de ese paciente. Sin
        // orderBy para no exigir índice compuesto; el rango se afina en cliente.
        const snap = await getDocs(query(collection(db, "anexo5"), where("expediente", "==", exp)));
        docs = snap.docs.map(mapAnexo5);
        if (fechaDesde) docs = docs.filter(s => ms(s.creadoEn) >= new Date(fechaDesde + "T00:00:00").getTime());
        if (fechaHasta) docs = docs.filter(s => ms(s.creadoEn) <= new Date(fechaHasta + "T23:59:59").getTime());
      } else {
        // Por rango de fecha de generación (mismo campo en where/orderBy).
        const constraints: QueryConstraint[] = [];
        if (fechaDesde) constraints.push(where("creadoEn", ">=", Timestamp.fromDate(new Date(fechaDesde + "T00:00:00"))));
        if (fechaHasta) constraints.push(where("creadoEn", "<=", Timestamp.fromDate(new Date(fechaHasta + "T23:59:59"))));
        constraints.push(orderBy("creadoEn", "desc"), limit(LIMIT_HISTORICO));
        const snap = await getDocs(query(collection(db, "anexo5"), ...constraints));
        docs = snap.docs.map(mapAnexo5);
      }
      setResultados(docs.sort((a, b) => ms(b.creadoEn) - ms(a.creadoEn)));
    } catch (e) {
      setErrorBusqueda(e instanceof Error ? e.message : "No se pudo completar la búsqueda.");
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  };

  const limpiarBusqueda = () => {
    setExpBusqueda(""); setFechaDesde(""); setFechaHasta("");
    setResultados(null); setErrorBusqueda("");
  };

  const listToDisplay = (tab === "cola" ? cola : (resultados ?? [])).filter(s => {
    const term = busqueda.toLowerCase();
    if (!term) return true;
    return (
      s.nombrePaciente.toLowerCase().includes(term) ||
      formatearFechaGeneracionAnexo5(s.creadoEn).toLowerCase().includes(term) ||
      (s.expediente ?? "").toLowerCase().includes(term)
    );
  });

  const selectedItem = seleccionado;

  const emitirEImprimir = async () => {
    if (!selectedItem?.id || !profile) return;

    // Si ya está emitido, solo imprimir
    if (selectedItem.estado === "emitido") {
      window.open(`/dashboard/anexo5/${selectedItem.id}/imprimir`, "_blank");
      return;
    }

    // Actualizar estado a emitido
    await updateDoc(doc(db, "anexo5", selectedItem.id), {
      estado: "emitido",
      emitidoPor: profile.uid,
      emitidoPorNombre: profile.nombre,
      emitidoEn: Timestamp.now(),
    });

    // Al emitirla sale de la cola en vivo: se conserva la selección en local
    // para que la previsualización siga en pantalla (con "Reimprimir").
    setSeleccionado({ ...selectedItem, estado: "emitido", emitidoPorNombre: profile.nombre });
    setResultados(prev => prev?.map(s => s.id === selectedItem.id ? { ...s, estado: "emitido" } : s) ?? prev);

    // Abrir impresión
    window.open(`/dashboard/anexo5/${selectedItem.id}/imprimir`, "_blank");
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto h-[calc(100vh-80px)] flex flex-col space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-900">
            <ClipboardList size={17} className="text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
            Bandeja de Anexo 5
          </h1>
        </div>
        
        {/* Tabs */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => { setTab("cola"); setSeleccionado(null); setBusqueda(""); }}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === "cola" ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Clock size={15} />
            Cola Anexo 5
            {cola.length > 0 && (
              <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-[10px] px-1.5 py-0.5 rounded-full">
                {cola.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setTab("historial"); setSeleccionado(null); setBusqueda(""); }}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === "historial" ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <CheckCircle2 size={15} />
            Historial
          </button>
        </div>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden min-h-0">
        
        {/* Lista (Izquierda) */}
        <div className="w-full md:w-[400px] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm shrink-0">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3 shrink-0">
            <h2 className="font-semibold text-slate-800 dark:text-slate-200">
              {tab === "cola" ? "Pendientes de emitir" : "Historial de referencias"}
            </h2>

            {tab === "cola" ? (
              <>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Filtrar por paciente, expediente o fecha..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <p className="text-xs text-slate-500">Haz clic en una fila para ver el comprobante e imprimir. Las ya emitidas están en Historial.</p>
              </>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Expediente exacto…"
                    value={expBusqueda}
                    onChange={(e) => setExpBusqueda(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }}
                    className="w-full pl-9 pr-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <DateField value={fechaDesde} onChange={setFechaDesde} clearable placeholder="Desde" ariaLabel="Fecha desde" />
                  <DateField value={fechaHasta} onChange={setFechaHasta} clearable placeholder="Hasta" ariaLabel="Fecha hasta" />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={buscar}
                    disabled={buscando || sinCriterio}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Search size={14} /> {buscando ? "Buscando…" : "Buscar"}
                  </button>
                  {(expBusqueda || fechaDesde || fechaHasta || resultados !== null) && (
                    <button
                      onClick={limpiarBusqueda}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-500 transition-colors hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:hover:text-slate-100"
                    >
                      <X size={12} /> Limpiar
                    </button>
                  )}
                </div>
                {errorBusqueda ? (
                  <p className="text-xs text-red-600 dark:text-red-400">{errorBusqueda}</p>
                ) : (
                  <p className="text-xs text-slate-500">
                    Se consulta bajo demanda: indica un expediente o un rango de fechas.
                    {resultados !== null && ` · ${resultados.length} resultado(s)`}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {(tab === "cola" && loading) || buscando ? (
              <p className="p-5 text-sm text-center text-slate-500">Cargando...</p>
            ) : listToDisplay.length === 0 ? (
              <p className="p-5 text-sm text-center text-slate-500">
                {tab === "cola"
                  ? (cola.length === 0 ? "No hay referencias pendientes de emitir." : "Sin coincidencias para el filtro.")
                  : (resultados === null ? "Indica un expediente o un rango de fechas y pulsa Buscar." : "Sin resultados para esa búsqueda.")}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Fecha</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Paciente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {listToDisplay.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => setSeleccionado(s)}
                      className={`cursor-pointer transition-colors ${
                        seleccionado?.id === s.id
                          ? "bg-blue-50 dark:bg-blue-900/20"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400 text-xs">
                        {formatearFechaGeneracionAnexo5(s.creadoEn)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="block text-slate-900 dark:text-slate-200 font-medium">{s.nombrePaciente}</span>
                        {s.expediente && (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">Exp. {s.expediente}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Previsualización (Derecha) */}
        <div className="hidden md:flex flex-1 flex-col bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden relative shadow-inner">
          {selectedItem ? (
            <>
              {/* Botón de Imprimir flotante */}
              <div className="absolute top-4 right-4 z-10">
                <button
                  onClick={emitirEImprimir}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg shadow-lg font-medium text-sm transition-all"
                >
                  <Printer size={16} />
                  {selectedItem.estado === "pendiente" ? "Emitir e Imprimir" : "Reimprimir"}
                </button>
              </div>

              {/* Expediente — solo referencia interna, no aparece en el impreso */}
              {selectedItem.expediente && (
                <div className="absolute top-4 left-4 z-10">
                  <span className="inline-flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 text-xs font-semibold px-3 py-1.5 rounded-lg">
                    Exp. {selectedItem.expediente}
                  </span>
                </div>
              )}

              {/* Vista previa simulada de hoja */}
              <div className="flex-1 overflow-y-auto p-8">
                <div className="bg-white mx-auto shadow-sm border border-slate-200 max-w-[650px] p-10 min-h-[800px] text-black" style={{ fontFamily: "Arial, sans-serif" }}>
                  <div className="relative flex flex-col items-center text-center mb-8">
                    <p className="absolute left-0 top-0 max-w-[150px] text-left text-[10px] leading-4">
                      <span className="block font-bold">Fecha y hora de emisión</span>
                      {formatearFechaGeneracionAnexo5(selectedItem.creadoEn)}
                    </p>
                    <div className="text-sm space-y-1">
                      <p className="font-bold">Ministerio de Salud</p>
                      <p>Dirección Nacional de Hospitales</p>
                      <p>Dirección Nacional de Primer Nivel de Atención</p>
                    </div>
                    <Image
                      src="/logo_minsal.png"
                      alt="Ministerio de Salud"
                      width={200}
                      height={68}
                      className="mt-2 object-contain"
                    />
                    <h1 className="mt-3 text-xl font-bold">Anexo 5</h1>
                  </div>

                  <hr className="border-black mb-6" />

                  <h2 className="text-center font-bold text-lg mb-8">Comprobante para el paciente referido en el SIS</h2>

                  <div className="space-y-6 text-sm">
                    <div className="flex items-end gap-1.5">
                      <span className="shrink-0 font-bold">1. Nombre:</span>
                      <span className="min-h-5 flex-1 border-b border-black px-0.5">{selectedItem.nombrePaciente}</span>
                      <span className="ml-2 shrink-0 font-bold">NEC:</span>
                      <span className="min-h-5 w-24 border-b border-black px-0.5">{selectedItem.expediente || ""}</span>
                    </div>
                    <div className="flex items-end gap-1.5">
                      <span className="shrink-0 font-bold">2. Establecimiento que refiere:</span>
                      <span className="min-h-5 flex-1 border-b border-black px-0.5">{selectedItem.establecimientoQueRefiere}</span>
                    </div>
                    <div className="flex items-end gap-1.5">
                      <span className="shrink-0 font-bold">3. Teléfono del establecimiento que refiere:</span>
                      <span className="min-h-5 flex-1 border-b border-black px-0.5">{selectedItem.telefonoEstablecimiento}</span>
                    </div>
                    <div className="flex items-end gap-1.5">
                      <span className="shrink-0 font-bold">4. Médico que refiere:</span>
                      <span className="min-h-5 flex-1 border-b border-black px-0.5">{selectedItem.medicoRefiere}</span>
                    </div>
                    <div className="flex items-end gap-1.5">
                      <span className="shrink-0 font-bold">5. Especialidad del médico que refiere:</span>
                      <span className="min-h-5 flex-1 border-b border-black px-0.5">{selectedItem.especialidad}</span>
                    </div>
                    <div className="flex h-16 w-[96%] items-center justify-center rounded-sm border border-dashed border-black/10 text-xs font-semibold text-black/10">
                      Firma y sello del médico
                    </div>
                    <div className="border-b border-black py-2 text-center">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                        Datos de la cita por RRI
                      </p>
                    </div>
                    <div className="flex items-end gap-1.5">
                      <span className="shrink-0 font-bold">6. Establecimiento al que se refiere:</span>
                      <span className="min-h-5 flex-1 border-b border-black px-0.5">{selectedItem.establecimientoReferencia}</span>
                    </div>
                    <div className="flex items-end gap-1.5">
                      <span className="shrink-0 font-bold">7. Fecha y hora de la cita:</span>
                      <span className="min-h-5 flex-1 border-b border-black px-0.5">{selectedItem.fechaHoraCita || ""}</span>
                    </div>
                    <div className="flex items-end gap-1.5">
                      <span className="shrink-0 font-bold">8. Médico que atenderá al paciente:</span>
                      <span className="min-h-5 flex-1 border-b border-black px-0.5">{selectedItem.medicoAtendera || ""}</span>
                    </div>
                    <div className="flex items-end gap-1.5">
                      <span className="shrink-0 font-bold">9. Especialidad donde será atendido:</span>
                      <span className="min-h-5 flex-1 border-b border-black px-0.5">{selectedItem.especialidadAtencion || ""}</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <ClipboardList size={48} className="mb-4 opacity-20" />
              <p>Selecciona una referencia para previsualizar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
