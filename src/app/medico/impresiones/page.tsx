"use client";

import { useEffect, useState, useRef } from "react";
import {
  collection, query, where, onSnapshot, addDoc, Timestamp,
  getDocs, orderBy, limit, type QueryConstraint,
} from "@/lib/firestoreMeter";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { SolicitudImpresion } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { DateField } from "@/components/ui/DateField";
import { Printer, Plus, Upload, X, Search, Clock, History } from "lucide-react";

const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";

// Ventana en vivo: las últimas solicitudes del médico. Lo anterior se busca
// bajo demanda (la colección crece ~60 solicitudes/día entre todos).
const RECIENTES_LIMIT = 30;
const LIMIT_HISTORICO = 500;

type Vista = "recientes" | "buscar";

const ms = (ts: unknown) => (ts as { toDate?: () => Date })?.toDate?.()?.getTime() ?? 0;
const porFecha = (a: SolicitudImpresion, b: SolicitudImpresion) => ms(b.creadoEn) - ms(a.creadoEn);

export default function MedicoImpresionesPage() {
  const { user, profile } = useAuth();
  const [solicitudes, setSolicitudes] = useState<SolicitudImpresion[]>([]);
  const [vista, setVista] = useState<Vista>("recientes");
  const [busquedaExpediente, setBusquedaExpediente] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Búsqueda histórica (bajo demanda, siempre acotada al propio médico).
  const [expBusqueda, setExpBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [resultados, setResultados] = useState<SolicitudImpresion[] | null>(null); // null = aún no se busca
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState("");

  const [pacienteExpediente, setPacienteExpediente] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [copias, setCopias] = useState("1");
  const [files, setFiles] = useState<File[]>([]);
  
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // En vivo, pero solo las últimas RECIENTES_LIMIT del médico: antes se
  // escuchaba TODO su historial (un médico con años de uso pagaba más de mil
  // lecturas cada vez que abría la pantalla).
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "solicitudes_impresion"),
      where("medicoId", "==", user.uid),
      orderBy("creadoEn", "desc"),
      limit(RECIENTES_LIMIT),
    );
    return onSnapshot(q, s => {
      setSolicitudes(s.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudImpresion)));
    });
  }, [user]);

  const sinCriterio = !expBusqueda.trim() && !fechaDesde && !fechaHasta;

  // Búsqueda histórica: una sola lectura puntual, nunca un listener.
  const buscar = async () => {
    if (!user || sinCriterio) return;
    const exp = expBusqueda.trim();
    setBuscando(true);
    setErrorBusqueda("");
    try {
      let docs: SolicitudImpresion[];
      if (exp) {
        // Solo igualdades (medicoId + expediente): sin orderBy para no exigir
        // índice compuesto; el rango, si lo hay, se afina en cliente.
        const snap = await getDocs(query(
          collection(db, "solicitudes_impresion"),
          where("medicoId", "==", user.uid),
          where("pacienteExpediente", "==", exp),
        ));
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudImpresion));
        if (fechaDesde) docs = docs.filter(s => ms(s.creadoEn) >= new Date(fechaDesde + "T00:00:00").getTime());
        if (fechaHasta) docs = docs.filter(s => ms(s.creadoEn) <= new Date(fechaHasta + "T23:59:59").getTime());
      } else {
        const constraints: QueryConstraint[] = [where("medicoId", "==", user.uid)];
        if (fechaDesde) constraints.push(where("creadoEn", ">=", Timestamp.fromDate(new Date(fechaDesde + "T00:00:00"))));
        if (fechaHasta) constraints.push(where("creadoEn", "<=", Timestamp.fromDate(new Date(fechaHasta + "T23:59:59"))));
        constraints.push(orderBy("creadoEn", "desc"), limit(LIMIT_HISTORICO));
        const snap = await getDocs(query(collection(db, "solicitudes_impresion"), ...constraints));
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudImpresion));
      }
      setResultados(docs.sort(porFecha));
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files);
      if (selected.length > 5) {
        alert("Solo puedes subir un máximo de 5 archivos.");
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
      setFiles(selected);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    if (fileRef.current) fileRef.current.value = ""; // Reset to allow re-selection
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0 || !user || !profile || !pacienteExpediente) return;
    if (files.length > 5) {
      alert("Solo puedes subir un máximo de 5 archivos.");
      return;
    }
    
    setSaving(true);
    setProgress(0);
    
    try {
      const uploadedFiles: { url: string; nombre: string }[] = [];
      let totalBytesTransferred = 0;
      const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

      // We upload sequentially to track progress easily, or we could do it in parallel
      for (const file of files) {
        const storageRef = ref(storage, `impresiones/${user.uid}/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);
        
        await new Promise<void>((resolve, reject) => {
          uploadTask.on("state_changed",
            (snap) => {
              // Note: this progress is an approximation since it resets per file, but for UX we just show a generic "Subiendo..." or fake progress
              // A better way is to accumulate bytes, but for simplicity we'll just set it to 50, then 100
              setProgress(Math.round(((totalBytesTransferred + snap.bytesTransferred) / totalBytes) * 100));
            },
            reject,
            async () => {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              uploadedFiles.push({ url, nombre: file.name });
              totalBytesTransferred += file.size;
              resolve();
            }
          );
        });
      }

      await addDoc(collection(db, "solicitudes_impresion"), {
        medicoId: user.uid, 
        medicoNombre: profile.nombre,
        medicoServicio: profile.servicios?.join(" / ") || profile.servicio || "",
        medicoJvpm: profile.jvpm || "",
        pacienteExpediente,
        descripcion, 
        copias: parseInt(copias), 
        archivos: uploadedFiles,
        estado: "pendiente", 
        creadoEn: Timestamp.now(),
      });
      
      setShowForm(false);
      setVista("recientes"); // la nueva solicitud vive en la ventana en vivo
      setFiles([]);
      setPacienteExpediente("");
      setDescripcion(""); 
      setCopias("1");
      setProgress(null); 
      setSaving(false);
      if (fileRef.current) fileRef.current.value = "";

    } catch (error) {
      console.error("Error uploading files:", error);
      alert("Hubo un error al subir los archivos.");
      setSaving(false);
      setProgress(null);
    }
  };

  const base = vista === "buscar" ? (resultados ?? []) : solicitudes;
  const displayList = base.filter(s => {
    if (vista !== "recientes" || !busquedaExpediente) return true;
    const t = busquedaExpediente.toLowerCase();
    return (s.pacienteExpediente?.toLowerCase() ?? "").includes(t)
      || (s.descripcion?.toLowerCase() ?? "").includes(t);
  });

  const formatFecha = (ts: unknown) => {
    if (!ts) return "—";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleString("es-HN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-50 dark:bg-violet-950 rounded-xl flex items-center justify-center border border-violet-200 dark:border-violet-900">
            <Printer size={17} className="text-violet-600 dark:text-violet-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Solicitudes de impresión</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
          {showForm ? "Cancelar" : <><Plus size={15} /> Nueva solicitud</>}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Número de expediente <span className="text-red-500">*</span></label>
              <input type="text" value={pacienteExpediente} onChange={e => setPacienteExpediente(e.target.value)} required
                placeholder="Ej: 123456" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Descripción <span className="text-red-500">*</span></label>
              <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)} required
                placeholder="Ej: Resumen médico de egreso" className={inputCls} />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Número de copias <span className="text-red-500">*</span></label>
              <input type="number" min="1" max="20" value={copias} onChange={e => setCopias(e.target.value)} required className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Archivos (.pdf, .docx - Max 5) <span className="text-red-500">*</span></label>
              <label className="flex items-center gap-2 cursor-pointer bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 hover:border-slate-400 dark:hover:border-slate-600 transition-colors">
                <Upload size={14} className="text-slate-500 flex-shrink-0" />
                <span className="text-sm text-slate-500 dark:text-slate-400 truncate">
                  {files.length > 0 ? `${files.length} archivo(s) seleccionado(s)` : "Seleccionar documentos"}
                </span>
                <input ref={fileRef} type="file" multiple accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFileChange} className="sr-only" />
              </label>
            </div>
          </div>

          {files.length > 0 && (
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Archivos seleccionados:</p>
              <ul className="space-y-1.5">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between text-sm bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-700 dark:text-slate-300 truncate pr-2">{f.name}</span>
                    <button type="button" onClick={() => removeFile(i)} className="text-red-500 hover:text-red-600 p-0.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {progress !== null && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Subiendo...</span><span>{progress}%</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          <button type="submit" disabled={saving || files.length === 0}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-all active:scale-[0.99]">
            {saving ? `Subiendo... ${progress ?? 0}%` : "Enviar solicitud"}
          </button>
        </form>
      )}

      {/* Vistas: ventana reciente en vivo vs búsqueda histórica bajo demanda */}
      <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-4">
        {([
          { value: "recientes", label: "Recientes", icon: Clock },
          { value: "buscar",    label: "Buscar anteriores", icon: History },
        ] as { value: Vista; label: string; icon: typeof Clock }[]).map(v => (
          <button
            key={v.value}
            onClick={() => setVista(v.value)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              vista === v.value
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <v.icon size={14} />
            {v.label}
          </button>
        ))}
      </div>

      {vista === "recientes" ? (
        <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="text" placeholder="Filtrar por expediente o descripción..." value={busquedaExpediente} onChange={e => setBusquedaExpediente(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400" />
          </div>
          <p className="text-xs text-slate-500">
            Tus últimas {RECIENTES_LIMIT} solicitudes · para anteriores usa <span className="font-medium text-slate-600 dark:text-slate-300">Buscar anteriores</span>
          </p>
          {busquedaExpediente && (
            <button onClick={() => setBusquedaExpediente("")}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors">
              <X size={12} /> Limpiar
            </button>
          )}
        </div>
      ) : (
        <div className="mb-4 space-y-2">
          <div className="flex items-start gap-2">
            <History size={14} className="mt-0.5 shrink-0 text-slate-400" />
            <p className="text-xs text-slate-500">
              Busca entre tus solicitudes anteriores por expediente exacto o por rango de fechas. La consulta se hace bajo demanda para no releer todo tu historial.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input type="text" placeholder="Expediente exacto…" value={expBusqueda}
                onChange={e => setExpBusqueda(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }}
                className="w-full pl-8 pr-3 py-1.5 text-sm font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 shrink-0">Desde</span>
              <DateField value={fechaDesde} onChange={setFechaDesde} clearable placeholder="Desde" ariaLabel="Desde" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 shrink-0">Hasta</span>
              <DateField value={fechaHasta} onChange={setFechaHasta} clearable placeholder="Hasta" ariaLabel="Hasta" />
            </div>
            <button onClick={buscar} disabled={buscando || sinCriterio}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
              <Search size={13} /> {buscando ? "Buscando…" : "Buscar"}
            </button>
            {(expBusqueda || fechaDesde || fechaHasta || resultados !== null) && (
              <button onClick={limpiarBusqueda}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors">
                <X size={12} /> Limpiar
              </button>
            )}
          </div>
          {errorBusqueda && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
              {errorBusqueda}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {buscando ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayList.length === 0 && (
          <p className="text-sm text-slate-500 py-10 text-center">
            {vista === "buscar"
              ? (resultados === null
                  ? "Indica un expediente o un rango de fechas y pulsa Buscar."
                  : "Sin resultados para esa búsqueda.")
              : (solicitudes.length === 0
                  ? "No has enviado solicitudes de impresión."
                  : "Sin resultados para el filtro aplicado.")}
          </p>
        )}
        {displayList.map(s => (
          <div key={s.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-violet-300 dark:hover:border-violet-900 transition-all shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 text-[15px] truncate">{s.descripcion}</p>
                  <Badge estado={s.estado} />
                </div>
                {s.pacienteExpediente && (
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Exp. {s.pacienteExpediente}</p>
                )}
                <p className="text-xs text-slate-500 mt-1">{s.copias} copia(s) · {formatFecha(s.creadoEn)}</p>
                
                {s.estado === "impreso" && s.impresoPorNombre && (
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-md border border-green-200 dark:border-green-800">
                    <p className="text-[11px] font-medium">Impreso por {s.impresoPorNombre}</p>
                  </div>
                )}
              </div>
              
              <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto">
                {s.archivos && s.archivos.length > 0 ? (
                  <div className="space-y-1.5">
                    {s.archivos.map((archivo, idx) => (
                      <a key={idx} href={archivo.url} target="_blank" rel="noopener noreferrer"
                        className="block px-3 py-1.5 text-xs font-medium text-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors truncate max-w-full sm:max-w-[150px]" title={archivo.nombre}>
                        {archivo.nombre}
                      </a>
                    ))}
                  </div>
                ) : s.pdfUrl ? (
                  <a href={s.pdfUrl} target="_blank" rel="noopener noreferrer"
                    className="block px-3 py-1.5 text-xs font-medium text-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors truncate max-w-[150px]" title={s.pdfNombre}>
                    {s.pdfNombre || "Ver Documento"}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
