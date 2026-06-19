"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ClipboardList, Clock, CheckCircle2, Search, Printer, ExternalLink } from "lucide-react";
import type { SolicitudAnexo5 } from "@/types";

type Tab = "cola" | "historial";

export default function BandejaAnexo5Page() {
  const { profile } = useAuth();
  const [solicitudes, setSolicitudes] = useState<SolicitudAnexo5[]>([]);
  const [tab, setTab] = useState<Tab>("cola");
  const [busqueda, setBusqueda] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "anexo5"), orderBy("creadoEn", "desc"));
    return onSnapshot(q, (snap) => {
      const lista = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        creadoEn: d.data().creadoEn?.toDate ? d.data().creadoEn.toDate() : new Date(d.data().creadoEn),
      })) as SolicitudAnexo5[];
      setSolicitudes(lista);
      setLoading(false);
    });
  }, []);

  const cola = solicitudes.filter((s) => s.estado === "pendiente");
  const historial = solicitudes.filter((s) => s.estado === "emitido");

  const listToDisplay = (tab === "cola" ? cola : historial).filter(s => {
    const term = busqueda.toLowerCase();
    return (
      s.nombrePaciente.toLowerCase().includes(term) ||
      (s.fecha ?? "").includes(term) ||
      (s.expediente ?? "").toLowerCase().includes(term)
    );
  });

  const selectedItem = solicitudes.find((s) => s.id === selectedId) || null;

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
            onClick={() => { setTab("cola"); setSelectedId(null); }}
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
            onClick={() => { setTab("historial"); setSelectedId(null); }}
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
              Referencias registradas
            </h2>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar por paciente, expediente o fecha..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100"
              />
            </div>
            <p className="text-xs text-slate-500">Haz clic en una fila para ver el comprobante e imprimir.</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="p-5 text-sm text-center text-slate-500">Cargando...</p>
            ) : listToDisplay.length === 0 ? (
              <p className="p-5 text-sm text-center text-slate-500">No hay referencias en esta vista.</p>
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
                      onClick={() => setSelectedId(s.id || null)}
                      className={`cursor-pointer transition-colors ${
                        selectedId === s.id
                          ? "bg-blue-50 dark:bg-blue-900/20"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400 text-xs">
                        {s.fecha}
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
                  <div className="text-center space-y-4 mb-8">
                    <h1 className="text-xl font-bold">Anexo 5</h1>
                    <div className="flex flex-col items-center gap-2">
                      <img src="/logo_minsal.png" alt="Logo MINSAL" className="w-20 object-contain" />
                      <p className="text-sm font-semibold text-gray-700 tracking-wide uppercase mt-1">MINISTERIO DE SALUD</p>
                    </div>
                    <div className="text-sm space-y-1 mt-4">
                      <p>Dirección Nacional de Hospitales</p>
                      <p>Dirección Nacional de Primer Nivel de Atención</p>
                    </div>
                  </div>

                  <hr className="border-black mb-6" />

                  <h2 className="text-center font-bold text-lg mb-8">Comprobante para el paciente referido en el SIS</h2>

                  <div className="space-y-6 text-sm">
                    <div className="flex justify-between border-b border-black pb-1">
                      <span className="font-bold w-1/3">Fecha</span>
                      <span className="w-2/3">{selectedItem.fecha || "— (a llenar a mano)"}</span>
                    </div>
                    <div className="flex justify-between border-b border-black pb-1">
                      <span className="font-bold w-1/3">1. Nombre</span>
                      <span className="w-2/3">{selectedItem.nombrePaciente}</span>
                    </div>
                    <div className="flex justify-between border-b border-black pb-1">
                      <span className="font-bold w-1/3">2. Referido de</span>
                      <span className="w-2/3">{selectedItem.referidoDe}</span>
                    </div>
                    <div className="flex justify-between border-b border-black pb-1">
                      <span className="font-bold w-1/3">3. Establecimiento de referencia</span>
                      <span className="w-2/3">{selectedItem.establecimientoReferencia}</span>
                    </div>
                    <div className="flex justify-between border-b border-black pb-1">
                      <span className="font-bold w-1/3">4. Fecha y hora de la cita</span>
                      <span className="w-2/3">{selectedItem.fechaHoraCita || ""}</span>
                    </div>
                    <div className="flex justify-between border-b border-black pb-1">
                      <span className="font-bold w-1/3">5. Especialidad</span>
                      <span className="w-2/3">{selectedItem.especialidad}</span>
                    </div>
                    <div className="flex justify-between border-b border-black pb-1">
                      <span className="font-bold w-1/3">6. Médico</span>
                      <span className="w-2/3">{selectedItem.medicoRefiere}</span>
                    </div>
                    <div className="flex justify-between border-b border-black pb-1">
                      <span className="font-bold w-1/3">7. Establecimiento que refiere :</span>
                      <span className="w-2/3">{selectedItem.establecimientoQueRefiere}</span>
                    </div>
                    
                    <div className="flex justify-between pt-6">
                      <div className="flex-1">
                        <span className="font-bold block mb-1">Teléfono del establecimiento que refiere:</span>
                        <div className="border-b border-black w-3/4 pb-1">
                          {selectedItem.telefonoEstablecimiento}
                        </div>
                      </div>
                      <div className="w-32 flex flex-col items-center justify-end">
                        <div className="w-full border-b border-black h-12 mb-1"></div>
                        <span className="font-bold">Sello</span>
                      </div>
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
