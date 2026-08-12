"use client";

import { useEffect, useRef, useState } from "react";
import {
  collection, query, orderBy, limit, onSnapshot, doc, getDoc, updateDoc, serverTimestamp, Timestamp,
} from "@/lib/firestoreMeter";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { DateField } from "@/components/ui/DateField";
import {
  ShieldAlert, Car, HeartCrack, Clock3, Search, X, StickyNote, ChevronLeft, ChevronRight,
  FileText, CheckCircle2, AlertCircle, AlertTriangle, Copy, Ban, Landmark, Inbox,
  LayoutList, Download, Upload, Paperclip, Loader2, Pencil,
} from "lucide-react";
import {
  TIPOS_CASO, TIPO_CASO_LABEL, TIPO_CASO_CHIP,
  ESTADO_LABEL, ESTADO_CHIP, esMenorDeEdad, duplicadosDeExpediente,
  INSTANCIAS, INSTANCIA_LABEL, CONDICION_LABEL,
  AVISO_RECIBIDO_POR_MIN, AVISO_LUGAR_MIN, validarFechaAviso,
} from "@/lib/conapinaFgr";
import type {
  NotificacionConapinaFgr, EstadoNotificacionConapinaFgr, TipoCasoConapinaFgr,
  InstanciaAviso, CondicionPacienteAviso, OficioEgreso, Paciente,
} from "@/types";

const ICONO_CASO = { violencia: ShieldAlert, accidente_transito: Car, intento_suicida: HeartCrack } as const;

const FILTROS: { label: string; value: EstadoNotificacionConapinaFgr | "todos" }[] = [
  { label: "Todas", value: "todos" },
  { label: "Por recibir", value: "pendiente" },
  { label: "Sin avisar", value: "confirmado" },
  { label: "Avisadas", value: "avisado" },
  { label: "Anuladas", value: "anulado" },
];

const PAGE_SIZE = 15;
const MAX_OFICIOS = 5;

type Vista = "bandeja" | "registro";

const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500";
const thCls = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap";

const hoyISO = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function ComiteConapinaFgrPage() {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<NotificacionConapinaFgr[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sinPermiso, setSinPermiso] = useState(false);

  const [vista, setVista] = useState<Vista>("bandeja");
  const [filtro, setFiltro] = useState<EstadoNotificacionConapinaFgr | "todos">("pendiente");
  const [tipo, setTipo] = useState<TipoCasoConapinaFgr | "todos">("todos");
  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const [selected, setSelected] = useState<NotificacionConapinaFgr | null>(null);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [errAccion, setErrAccion] = useState<string | null>(null);

  // ── 3er tiempo: datos del aviso externo ──
  const [editandoAviso, setEditandoAviso] = useState(false);
  const [avisoInstancia, setAvisoInstancia] = useState<InstanciaAviso | "">("");
  const [avisoFecha, setAvisoFecha] = useState("");
  const [avisoRecibidoPor, setAvisoRecibidoPor] = useState("");
  const [avisoLugar, setAvisoLugar] = useState("");
  const [avisoObservacion, setAvisoObservacion] = useState("");
  const [condicion, setCondicion] = useState<CondicionPacienteAviso>("vivo");

  // ── Oficios ──
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState(1);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "notificaciones_conapina_fgr"), orderBy("creadoEn", "desc"), limit(400));
    return onSnapshot(
      q,
      s => {
        const docs = s.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionConapinaFgr));
        setItems(docs);
        // El modal debe reflejar el estado nuevo tras confirmar/avisar sin cerrarse.
        setSelected(prev => (prev?.id ? docs.find(d => d.id === prev.id) ?? prev : prev));
        setCargando(false);
      },
      err => {
        setCargando(false);
        if ((err as { code?: string }).code === "permission-denied") setSinPermiso(true);
      },
    );
  }, []);

  const formatFecha = (ts: unknown) => {
    if (!ts) return "—";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });
  };
  const formatFechaHora = (ts: unknown) => {
    if (!ts) return "—";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleString("es-SV", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  };
  const aDate = (ts: unknown): Date | null => {
    if (!ts) return null;
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return isNaN(d.getTime()) ? null : d;
  };

  // En el registro para MINSAL las anuladas no existen: nunca fueron un aviso.
  const base = vista === "registro" ? items.filter(n => n.estado !== "anulado") : items;

  const displayList = base.filter(n => {
    if (vista === "bandeja" && filtro !== "todos" && n.estado !== filtro) return false;
    if (tipo !== "todos" && n.tipoCaso !== tipo) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      if (!(n.pacienteExpediente?.toLowerCase() ?? "").includes(q) &&
          !(n.pacienteNombre?.toLowerCase() ?? "").includes(q) &&
          !(n.servicio?.toLowerCase() ?? "").includes(q) &&
          !(n.diagnostico?.descripcion?.toLowerCase() ?? "").includes(q) &&
          !(n.diagnostico?.codigo?.toLowerCase() ?? "").includes(q) &&
          !(n.avisoRecibidoPor?.toLowerCase() ?? "").includes(q) &&
          !(n.medicoNombre?.toLowerCase() ?? "").includes(q)) return false;
    }
    if (fechaDesde || fechaHasta) {
      // En el registro el rango filtra por la FECHA DEL AVISO (es lo que audita
      // el MINSAL); en la bandeja, por cuándo entró la notificación.
      const d = aDate(vista === "registro" ? (n.avisoFecha ?? n.creadoEn) : n.creadoEn);
      if (!d) return true;
      if (fechaDesde && d < new Date(fechaDesde + "T00:00:00")) return false;
      if (fechaHasta && d > new Date(fechaHasta + "T23:59:59")) return false;
    }
    return true;
  });

  // Reinicio de paginación al cambiar los filtros (ajuste de estado en render).
  const filtrosKey = `${vista}|${filtro}|${tipo}|${busqueda}|${fechaDesde}|${fechaHasta}`;
  const [filtrosPrevios, setFiltrosPrevios] = useState(filtrosKey);
  if (filtrosPrevios !== filtrosKey) {
    setFiltrosPrevios(filtrosKey);
    setPage(1);
  }

  const totalPaginas = Math.max(1, Math.ceil(displayList.length / PAGE_SIZE));
  const paginaActual = Math.min(page, totalPaginas);
  const paginados = displayList.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);

  const porRecibir = items.filter(n => n.estado === "pendiente").length;
  const sinAvisar = items.filter(n => n.estado === "confirmado").length;
  const avisadas = items.filter(n => n.estado === "avisado").length;

  // Duplicados entre médicos: aquí sí se ven todos los expedientes, así que este
  // es el único punto donde se puede detectar que dos médicos notificaron el
  // mismo caso. Sale de lo que ya está en memoria: 0 lecturas extra.
  const repeticiones = new Map<string, number>();
  items.forEach(n => {
    if (n.estado === "anulado") return;
    const k = (n.pacienteExpediente ?? "").trim().toLowerCase();
    if (k) repeticiones.set(k, (repeticiones.get(k) ?? 0) + 1);
  });
  const vecesNotificado = (exp?: string) => repeticiones.get((exp ?? "").trim().toLowerCase()) ?? 0;

  const resetAviso = () => {
    setEditandoAviso(false);
    setAvisoInstancia("");
    setAvisoFecha("");
    setAvisoRecibidoPor("");
    setAvisoLugar("");
    setAvisoObservacion("");
    setCondicion("vivo");
  };

  const abrir = async (n: NotificacionConapinaFgr) => {
    setSelected(n);
    setNotas(n.notasComite ?? "");
    setErrAccion(null);
    setProgreso(null);
    setAvisoInstancia(n.avisoInstancia ?? "");
    setAvisoFecha(n.avisoFecha ? (aDate(n.avisoFecha)?.toISOString().slice(0, 10) ?? "") : hoyISO());
    setAvisoRecibidoPor(n.avisoRecibidoPor ?? "");
    setAvisoLugar(n.avisoLugar ?? "");
    setAvisoObservacion(n.avisoObservacion ?? "");
    setCondicion(n.condicionPaciente ?? "vivo");
    setEditandoAviso(n.estado === "confirmado");

    // Solo al abrir un caso listo para avisar se relee el expediente (1 lectura)
    // para precargar la condición del paciente. Quien registra puede cambiarla:
    // manda lo que consta en el acta, no lo que diga el sistema.
    if (n.estado === "confirmado" && n.pacienteId && !n.condicionPaciente) {
      try {
        const snap = await getDoc(doc(db, "pacientes", n.pacienteId));
        const estado = (snap.data() as Paciente | undefined)?.estado;
        if (estado) setCondicion(estado === "alta_fallecido" ? "fallecido" : "vivo");
      } catch { /* la precarga no es crítica */ }
    }
  };

  const cerrar = () => {
    setSelected(null);
    setNotas("");
    resetAviso();
  };

  // ── 2º tiempo: dar por recibida ──
  const confirmar = async () => {
    if (!selected?.id || !profile) return;
    setSaving(true);
    setErrAccion(null);
    try {
      await updateDoc(doc(db, "notificaciones_conapina_fgr", selected.id), {
        estado: "confirmado",
        notasComite: notas.trim() || null,
        revisadoPor: profile.uid,
        revisadoPorNombre: profile.nombre,
        // serverTimestamp: las reglas exigen revisadoEn == request.time, para que
        // el acuse no se pueda antedatar.
        revisadoEn: serverTimestamp(),
        actualizadoEn: serverTimestamp(),
      });
      setEditandoAviso(true);
      setAvisoFecha(hoyISO());
    } catch (err) {
      setErrAccion(err instanceof Error ? err.message : "No se pudo confirmar la recepción.");
    } finally {
      setSaving(false);
    }
  };

  // ── 3er tiempo: asentar el aviso dado a CONAPINA / Fiscalía ──
  const errorFechaAviso = validarFechaAviso(avisoFecha, aDate(selected?.fechaHecho));
  const puedeGuardarAviso =
    !!avisoInstancia && !!avisoFecha && !errorFechaAviso
    && avisoRecibidoPor.trim().length >= AVISO_RECIBIDO_POR_MIN
    && avisoLugar.trim().length >= AVISO_LUGAR_MIN;

  const guardarAviso = async () => {
    if (!selected?.id || !profile || !puedeGuardarAviso) return;
    setSaving(true);
    setErrAccion(null);
    try {
      await updateDoc(doc(db, "notificaciones_conapina_fgr", selected.id), {
        estado: "avisado",
        avisoInstancia,
        avisoFecha: Timestamp.fromDate(new Date(avisoFecha + "T00:00:00")),
        avisoRecibidoPor: avisoRecibidoPor.trim(),
        avisoLugar: avisoLugar.trim(),
        avisoObservacion: avisoObservacion.trim() || null,
        condicionPaciente: condicion,
        avisoRegistradoPor: profile.uid,
        avisoRegistradoPorNombre: profile.nombre,
        avisoRegistradoEn: serverTimestamp(),
        actualizadoEn: serverTimestamp(),
      });
      setEditandoAviso(false);
    } catch (err) {
      setErrAccion(err instanceof Error ? err.message : "No se pudo registrar el aviso.");
    } finally {
      setSaving(false);
    }
  };

  // ── Oficios de egreso escaneados ──
  const subirOficios = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivos = Array.from(e.target.files ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (!archivos.length || !selected?.id || !user || !profile) return;
    const yaHay = selected.oficios?.length ?? 0;
    if (yaHay + archivos.length > MAX_OFICIOS) {
      setErrAccion(`Máximo ${MAX_OFICIOS} oficios por caso.`);
      return;
    }
    setSubiendo(true);
    setErrAccion(null);
    setProgreso(0);
    try {
      const nuevos: OficioEgreso[] = [];
      const totalBytes = archivos.reduce((a, f) => a + f.size, 0);
      let acumulado = 0;
      for (const file of archivos) {
        const destino = storageRef(storage, `oficios_conapina/${user.uid}/${Date.now()}_${file.name}`);
        const tarea = uploadBytesResumable(destino, file);
        await new Promise<void>((resolve, reject) => {
          tarea.on("state_changed",
            snap => setProgreso(Math.round(((acumulado + snap.bytesTransferred) / totalBytes) * 100)),
            reject,
            async () => {
              nuevos.push({
                url: await getDownloadURL(tarea.snapshot.ref),
                nombre: file.name,
                subidoPorNombre: profile.nombre,
                // serverTimestamp no se puede usar dentro de un array.
                subidoEn: Timestamp.now() as unknown as Date,
              });
              acumulado += file.size;
              resolve();
            });
        });
      }
      await updateDoc(doc(db, "notificaciones_conapina_fgr", selected.id), {
        oficios: [...(selected.oficios ?? []), ...nuevos],
        actualizadoEn: serverTimestamp(),
      });
    } catch (err) {
      setErrAccion(err instanceof Error ? err.message : "No se pudieron subir los oficios.");
    } finally {
      setSubiendo(false);
      setProgreso(null);
    }
  };

  // ── Exportar el registro que audita el MINSAL ──
  const exportar = async () => {
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const filas = displayList.map(n => ({
        EXPEDIENTE: n.pacienteExpediente ?? "",
        "NOMBRE DEL PACIENTE": n.pacienteNombre ?? "",
        EDAD: typeof n.pacienteEdad === "number" ? n.pacienteEdad : "",
        "MOTIVO DEL AVISO": TIPO_CASO_LABEL[n.tipoCaso] ?? "",
        DIAGNOSTICO: n.diagnostico?.codigo ? `${n.diagnostico.codigo} - ${n.diagnostico.descripcion}` : (n.nota ?? ""),
        "CAUSA EXTERNA": n.causaExterna?.codigo ? `${n.causaExterna.codigo} - ${n.causaExterna.descripcion}` : "",
        "PERSONAL MEDICO QUE NOTIFICA": n.medicoNombre ?? "",
        "AVISO NOTIFICADO EN": n.avisoInstancia ? INSTANCIA_LABEL[n.avisoInstancia] : "",
        "NOMBRE DE PERSONA QUE RECIBIO EL AVISO": n.avisoRecibidoPor ?? "",
        "FECHA DEL AVISO": n.avisoFecha ? formatFecha(n.avisoFecha) : "",
        "LUGAR / SEDE": n.avisoLugar ?? "",
        "CONDICION DEL PACIENTE": n.condicionPaciente ? CONDICION_LABEL[n.condicionPaciente] : "",
        ESTADO: ESTADO_LABEL[n.estado] ?? "",
        "FECHA DEL HECHO": n.fechaHecho ? formatFecha(n.fechaHecho) : "",
        "FECHA DE NOTIFICACION": formatFecha(n.creadoEn),
        SERVICIO: n.servicio ?? "",
        "OFICIOS ADJUNTOS": n.oficios?.length ?? 0,
      }));
      const ws = XLSX.utils.json_to_sheet(filas);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Avisos notificados");
      XLSX.writeFile(wb, `avisos_conapina_fgr_${fechaDesde || "inicio"}_a_${fechaHasta || "fin"}.xlsx`);
    } catch (err) {
      setErrAccion(err instanceof Error ? err.message : "No se pudo exportar.");
    } finally {
      setExportando(false);
    }
  };

  const otrasDelExpediente = selected
    ? duplicadosDeExpediente(items, selected.pacienteExpediente, selected.id)
    : [];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header del área */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
            <ShieldAlert size={17} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
              Avisos CONAPINA / FGR
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">Lesiones intencionales · comité de género y violencia</p>
          </div>
        </div>
        {sinAvisar > 0 && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
            <Landmark size={14} />
            {sinAvisar} sin avisar
          </div>
        )}
      </div>

      {/* Vistas */}
      <div className="mb-4 inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {([
          { v: "bandeja" as const, label: "Bandeja", icon: Inbox, badge: porRecibir + sinAvisar },
          { v: "registro" as const, label: "Avisos notificados", icon: LayoutList, badge: 0 },
        ]).map(({ v, label, icon: Icono, badge }) => (
          <button key={v} onClick={() => { setVista(v); setFiltro(v === "registro" ? "todos" : "pendiente"); }}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
              vista === v
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}>
            <Icono size={14} /> {label}
            {badge > 0 && (
              <span className="ml-0.5 rounded-full bg-rose-500 px-1.5 py-px text-[10px] font-bold text-white">{badge}</span>
            )}
          </button>
        ))}
      </div>

      {sinPermiso && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          Sin permisos para leer estas notificaciones. Pide al administrador que despliegue las reglas de{" "}
          <strong className="font-mono">notificaciones_conapina_fgr</strong>.
        </div>
      )}

      {/* Panel: contadores + filtros */}
      <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 md:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">
              {vista === "bandeja" ? "Bandeja" : "Registro auditado"}
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">
              {vista === "bandeja" ? "Casos notificados" : "Avisos notificados"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {vista === "bandeja"
                ? "Reciba el caso y luego asiente el aviso dado a CONAPINA o la Fiscalía."
                : "Base completa para el comité. El rango de fechas filtra por fecha del aviso."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">{displayList.length} {displayList.length === 1 ? "registro" : "registros"}</span>
            {vista === "registro" && (
              <button onClick={exportar} disabled={exportando || displayList.length === 0}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50">
                <Download size={13} /> {exportando ? "Generando..." : "Excel"}
              </button>
            )}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Tile n={items.length} label="Notificadas" icon={FileText} tone="cyan" />
          <Tile n={porRecibir} label="Por recibir" icon={Clock3} tone="amber" />
          <Tile n={sinAvisar} label="Sin avisar" icon={Landmark} tone="blue" />
          <Tile n={avisadas} label="Avisadas" icon={CheckCircle2} tone="emerald" />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {vista === "bandeja" && FILTROS.map(f => (
            <button key={f.value} onClick={() => setFiltro(f.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filtro === f.value
                  ? "bg-blue-600 text-white"
                  : "border border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              }`}>
              {f.label}
            </button>
          ))}
          {vista === "bandeja" && <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />}
          {(["todos", ...TIPOS_CASO] as const).map(t => {
            const Icono = t === "todos" ? null : ICONO_CASO[t];
            return (
              <button key={t} onClick={() => setTipo(t)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  tipo === t
                    ? "bg-amber-700 text-white"
                    : "border border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                }`}>
                {Icono && <Icono size={13} />}
                {t === "todos" ? "Todo motivo" : TIPO_CASO_LABEL[t]}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="text" placeholder="Buscar por expediente, paciente, diagnóstico, médico o quien recibió..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Desde</span>
            <DateField value={fechaDesde} onChange={setFechaDesde} clearable placeholder="Desde" ariaLabel="Fecha desde" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Hasta</span>
            <DateField value={fechaHasta} onChange={setFechaHasta} clearable placeholder="Hasta" ariaLabel="Fecha hasta" />
          </div>
          {(busqueda || fechaDesde || fechaHasta) && (
            <button onClick={() => { setBusqueda(""); setFechaDesde(""); setFechaHasta(""); }}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-500 transition-colors hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:hover:text-slate-100">
              <X size={12} /> Limpiar
            </button>
          )}
        </div>
      </section>

      {/* Tabla */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-800/50">
              <tr>
                <th className={thCls}>Expediente</th>
                <th className={thCls}>Paciente</th>
                <th className={thCls}>Edad</th>
                <th className={thCls}>Motivo del aviso</th>
                <th className={thCls}>Diagnóstico</th>
                <th className={thCls}>Médico que notifica</th>
                {vista === "registro" ? (
                  <>
                    <th className={thCls}>Avisado en</th>
                    <th className={thCls}>Recibió el aviso</th>
                    <th className={thCls}>Fecha del aviso</th>
                    <th className={thCls}>Lugar / sede</th>
                    <th className={thCls}>Condición</th>
                    <th className={thCls}>Oficio</th>
                  </>
                ) : (
                  <>
                    <th className={thCls}>Servicio / Cama</th>
                    <th className={thCls}>Notificada</th>
                  </>
                )}
                <th className={thCls}>Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginados.map(n => {
                const Icono = ICONO_CASO[n.tipoCaso] ?? ShieldAlert;
                const veces = vecesNotificado(n.pacienteExpediente);
                return (
                  <tr key={n.id} onClick={() => abrir(n)}
                    className={`cursor-pointer transition-colors hover:bg-amber-50/40 dark:hover:bg-slate-800/60 ${n.estado === "anulado" ? "opacity-60" : ""}`}>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          n.estado === "avisado" ? "bg-emerald-500"
                            : n.estado === "confirmado" ? "bg-blue-500"
                            : n.estado === "anulado" ? "bg-slate-300 dark:bg-slate-600"
                            : "bg-amber-400"
                        }`} />
                        <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{n.pacienteExpediente}</span>
                        {veces > 1 && n.estado !== "anulado" && (
                          <span title={`${veces} notificaciones vigentes de este expediente`}
                            className="flex items-center gap-0.5 rounded border border-amber-200 bg-amber-100 px-1 py-0.5 text-[10px] font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                            <Copy size={9} /> {veces}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">{n.pacienteNombre || "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {typeof n.pacienteEdad === "number" ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-slate-700 dark:text-slate-300">{n.pacienteEdad}</span>
                          {esMenorDeEdad(n.pacienteEdad) && (
                            <span className="rounded border border-violet-200 bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-800 dark:bg-violet-900/50 dark:text-violet-300">
                              Menor
                            </span>
                          )}
                        </span>
                      ) : <span title="El expediente no tiene fecha de nacimiento" className="text-slate-400">s/d</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TIPO_CASO_CHIP[n.tipoCaso]}`}>
                        <Icono size={11} /> {TIPO_CASO_LABEL[n.tipoCaso]}
                      </span>
                      {n.fechaHecho && <span className="mt-1 block text-[11px] text-slate-400">Hecho: {formatFecha(n.fechaHecho)}</span>}
                    </td>
                    <td className="max-w-[260px] px-3 py-2.5">
                      {n.diagnostico?.codigo ? (
                        <span className="flex items-baseline gap-1.5">
                          <span className="shrink-0 font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300">{n.diagnostico.codigo}</span>
                          <span className="line-clamp-2 text-xs text-slate-700 dark:text-slate-300">{n.diagnostico.descripcion}</span>
                        </span>
                      ) : n.nota ? (
                        <span className="flex items-baseline gap-1.5 text-xs italic text-slate-500">
                          <StickyNote size={11} className="shrink-0 text-slate-400" />
                          <span className="line-clamp-2">{n.nota}</span>
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                      {n.causaExterna?.codigo && (
                        <span className="mt-0.5 block font-mono text-[11px] text-slate-400">Causa externa: {n.causaExterna.codigo}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">{n.medicoNombre}</td>

                    {vista === "registro" ? (
                      <>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {n.avisoInstancia ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                              <Landmark size={10} /> {INSTANCIA_LABEL[n.avisoInstancia]}
                            </span>
                          ) : <span className="text-xs text-amber-600 dark:text-amber-400">Sin avisar</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-700 dark:text-slate-300">{n.avisoRecibidoPor || <span className="text-slate-400">—</span>}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">{n.avisoFecha ? formatFecha(n.avisoFecha) : <span className="text-slate-400">—</span>}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">{n.avisoLugar || <span className="text-slate-400">—</span>}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {n.condicionPaciente ? (
                            <span className={`text-xs font-medium ${n.condicionPaciente === "fallecido" ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-slate-300"}`}>
                              {CONDICION_LABEL[n.condicionPaciente]}
                            </span>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {n.oficios?.length ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              <Paperclip size={11} /> {n.oficios.length}
                            </span>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                          {n.servicio || "—"}{n.cama ? ` / ${n.cama}` : ""}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-500">{formatFecha(n.creadoEn)}</td>
                      </>
                    )}

                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTADO_CHIP[n.estado]}`}>
                        {ESTADO_LABEL[n.estado]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {paginados.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-500">
            {cargando ? "Cargando..." : items.length === 0 ? "Aún no hay avisos registrados." : "Sin resultados para los filtros aplicados."}
          </p>
        )}

        {totalPaginas > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/50">
            <span className="text-xs text-slate-500">Página {paginaActual} de {totalPaginas}</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={paginaActual === 1}
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:hover:text-slate-100"
                aria-label="Página anterior">
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas}
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:hover:text-slate-100"
                aria-label="Página siguiente">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detalle */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 font-heading">
                <ShieldAlert size={16} className="text-amber-500" />
                Aviso CONAPINA / FGR
              </h2>
              <button onClick={cerrar} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
            </div>

            <div className="space-y-4 p-5 text-sm">
              {/* Paciente */}
              <div className="relative overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-blue-50/80 to-white p-4 dark:border-cyan-800 dark:from-cyan-950/40 dark:via-blue-950/20 dark:to-slate-900">
                <div className="absolute bottom-0 left-0 top-0 w-1 bg-gradient-to-b from-cyan-500 to-blue-600" />
                <div className="pl-1">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-300">Paciente</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{selected.pacienteNombre || "No especificado"}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <p className="font-mono text-xs font-medium text-slate-600 dark:text-slate-300">Exp. {selected.pacienteExpediente}</p>
                    {typeof selected.pacienteEdad === "number" ? (
                      <span className="text-xs text-slate-500">· {selected.pacienteEdad} años</span>
                    ) : (
                      <span className="text-xs text-amber-700 dark:text-amber-400">· edad no registrada en el expediente</span>
                    )}
                    {esMenorDeEdad(selected.pacienteEdad) && (
                      <span className="rounded border border-violet-200 bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-800 dark:bg-violet-900/50 dark:text-violet-300">
                        Menor de edad · corresponde CONAPINA
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    {selected.servicio || "—"}{selected.cama ? ` · Cama ${selected.cama}` : ""}
                  </p>
                </div>
              </div>

              {otrasDelExpediente.length > 0 && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="min-w-0 text-xs leading-5 text-amber-800 dark:text-amber-200">
                    <p className="font-semibold">Este expediente tiene {otrasDelExpediente.length} notificación(es) más.</p>
                    <ul className="mt-1 space-y-0.5">
                      {otrasDelExpediente.slice(0, 4).map(o => (
                        <li key={o.id}>
                          · {TIPO_CASO_LABEL[o.tipoCaso]} — {o.fechaHecho ? `hecho del ${formatFecha(o.fechaHecho)}` : "sin fecha del hecho"}, notificó {o.medicoNombre} ({ESTADO_LABEL[o.estado]})
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1">Verifique si es el mismo caso antes de avisar dos veces.</p>
                  </div>
                </div>
              )}

              <Row label="Motivo" value={
                <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TIPO_CASO_CHIP[selected.tipoCaso]}`}>
                  {TIPO_CASO_LABEL[selected.tipoCaso]}
                </span>
              } />
              <Row label="Fecha del hecho" value={selected.fechaHecho ? formatFecha(selected.fechaHecho) : <span className="text-slate-400">No registrada</span>} />
              <Row label="Diagnóstico" value={
                selected.diagnostico?.codigo
                  ? <span><span className="mr-1.5 font-mono text-xs font-semibold text-blue-700 dark:text-blue-300">{selected.diagnostico.codigo}</span>{selected.diagnostico.descripcion}</span>
                  : <span className="text-slate-400">Sin código CIE-10</span>
              } />
              <Row label="Causa externa" value={
                selected.causaExterna?.codigo
                  ? <span><span className="mr-1.5 font-mono text-xs font-semibold text-blue-700 dark:text-blue-300">{selected.causaExterna.codigo}</span>{selected.causaExterna.descripcion}</span>
                  : <span className="text-slate-400">No indicada</span>
              } />
              {selected.nota && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">Nota del médico</p>
                  <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">{selected.nota}</p>
                </div>
              )}
              <Row label="Notificó" value={`Dr. ${selected.medicoNombre}${selected.medicoJvpm ? ` · JVPM ${selected.medicoJvpm}` : ""}`} />
              <Row label="Enviada" value={formatFechaHora(selected.creadoEn)} />
              <Row label="Estado" value={
                <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTADO_CHIP[selected.estado]}`}>
                  {ESTADO_LABEL[selected.estado]}
                </span>
              } />
              {selected.revisadoPorNombre && (
                <Row label="Recibida por" value={`${selected.revisadoPorNombre}${selected.revisadoEn ? ` · ${formatFechaHora(selected.revisadoEn)}` : ""}`} />
              )}

              {selected.estado === "anulado" && (
                <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                  <Ban size={15} className="mt-0.5 shrink-0 text-slate-400" />
                  <div className="text-xs leading-5 text-slate-600 dark:text-slate-400">
                    <p className="font-semibold">Anulada por el médico · {formatFechaHora(selected.anuladoEn)}</p>
                    {selected.motivoAnulacion && <p className="mt-0.5 whitespace-pre-wrap">{selected.motivoAnulacion}</p>}
                  </div>
                </div>
              )}

              {/* 2º tiempo */}
              {selected.estado === "pendiente" && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/60 dark:bg-blue-950/25">
                  <p className="text-sm font-bold text-blue-900 dark:text-blue-100">Paso 1 · Recibir el caso</p>
                  <p className="mt-0.5 text-xs leading-5 text-blue-800/90 dark:text-blue-200/80">
                    Al recibirlo se registra que el comité lo tomó. El aviso a CONAPINA o la Fiscalía se asienta después.
                  </p>
                  <label className="mb-1.5 mt-3 block text-xs font-medium text-slate-500">Observación para el médico (opcional)</label>
                  <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                    placeholder="Notas para el médico..." className={`${inputCls} resize-none bg-white dark:bg-slate-900`} />
                </div>
              )}
              {selected.estado !== "pendiente" && selected.notasComite && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">Observación del comité</p>
                  <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">{selected.notasComite}</p>
                </div>
              )}

              {/* 3er tiempo — formulario del aviso externo */}
              {(selected.estado === "confirmado" || selected.estado === "avisado") && editandoAviso && (
                <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/25">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-900 dark:text-emerald-100">
                      <Landmark size={15} /> Paso 2 · Asentar el aviso dado
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-emerald-800/90 dark:text-emerald-200/80">
                      Estos datos son los que audita el MINSAL. Quien recibió el aviso es la persona de la instancia, no de este hospital.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">Aviso notificado en <span className="text-red-500">*</span></label>
                    <div className="grid grid-cols-3 gap-2">
                      {INSTANCIAS.map(i => (
                        <button key={i} type="button" onClick={() => setAvisoInstancia(i)}
                          className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-all ${
                            avisoInstancia === i
                              ? "border-emerald-500 bg-emerald-600 text-white"
                              : "border-slate-300 bg-white text-slate-600 hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                          }`}>
                          {INSTANCIA_LABEL[i]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">Fecha del aviso <span className="text-red-500">*</span></label>
                      <DateField value={avisoFecha} onChange={setAvisoFecha} ariaLabel="Fecha del aviso" maxDate={new Date()} />
                      {errorFechaAviso && (
                        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                          <AlertCircle size={13} className="mt-0.5 shrink-0" />{errorFechaAviso}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">Condición del paciente <span className="text-red-500">*</span></label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["vivo", "fallecido"] as CondicionPacienteAviso[]).map(c => (
                          <button key={c} type="button" onClick={() => setCondicion(c)}
                            className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-all ${
                              condicion === c
                                ? c === "fallecido"
                                  ? "border-rose-500 bg-rose-600 text-white"
                                  : "border-emerald-500 bg-emerald-600 text-white"
                                : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                            }`}>
                            {CONDICION_LABEL[c]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">Persona que recibió el aviso <span className="text-red-500">*</span></label>
                      <input type="text" value={avisoRecibidoPor} onChange={e => setAvisoRecibidoPor(e.target.value)}
                        placeholder="Nombre de quien lo recibió" className={`${inputCls} bg-white dark:bg-slate-900`} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">Lugar / sede <span className="text-red-500">*</span></label>
                      <input type="text" value={avisoLugar} onChange={e => setAvisoLugar(e.target.value)}
                        placeholder="Sede u oficina donde se dio" className={`${inputCls} bg-white dark:bg-slate-900`} />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">Observación (opcional)</label>
                    <textarea value={avisoObservacion} onChange={e => setAvisoObservacion(e.target.value)} rows={2}
                      placeholder="Número de acta, referencia u observaciones..." className={`${inputCls} resize-none bg-white dark:bg-slate-900`} />
                  </div>
                </div>
              )}

              {/* 3er tiempo — ya asentado */}
              {selected.estado === "avisado" && !editandoAviso && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/25">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-900 dark:text-emerald-100">
                      <Landmark size={15} /> Aviso notificado en {selected.avisoInstancia ? INSTANCIA_LABEL[selected.avisoInstancia] : "—"}
                    </p>
                    <button onClick={() => setEditandoAviso(true)}
                      className="flex items-center gap-1 text-xs font-medium text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-300">
                      <Pencil size={11} /> Corregir
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <Row label="Recibió" value={selected.avisoRecibidoPor ?? "—"} />
                    <Row label="Fecha" value={formatFecha(selected.avisoFecha)} />
                    <Row label="Lugar/sede" value={selected.avisoLugar ?? "—"} />
                    <Row label="Condición" value={selected.condicionPaciente ? CONDICION_LABEL[selected.condicionPaciente] : "—"} />
                    {selected.avisoObservacion && <Row label="Observación" value={selected.avisoObservacion} />}
                    <Row label="Asentó" value={`${selected.avisoRegistradoPorNombre ?? "—"}${selected.avisoRegistradoEn ? ` · ${formatFechaHora(selected.avisoRegistradoEn)}` : ""}`} />
                  </div>
                </div>
              )}

              {/* Oficios de egreso */}
              {selected.estado === "avisado" && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/35">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
                    <Paperclip size={15} /> Oficios de egreso
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">Escaneos del oficio de egreso del paciente (PDF o imagen, máx. {MAX_OFICIOS}).</p>

                  {!!selected.oficios?.length && (
                    <ul className="mt-3 space-y-1.5">
                      {selected.oficios.map((o, i) => (
                        <li key={`${o.url}-${i}`}>
                          <a href={o.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-emerald-800">
                            <FileText size={13} className="shrink-0 text-slate-400" />
                            <span className="min-w-0 flex-1 truncate">{o.nombre}</span>
                            <span className="shrink-0 text-[11px] text-slate-400">{formatFecha(o.subidoEn)}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}

                  {progreso !== null && (
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progreso}%` }} />
                    </div>
                  )}

                  <input ref={fileRef} type="file" multiple accept="application/pdf,image/*"
                    onChange={subirOficios} className="hidden" />
                  <button onClick={() => fileRef.current?.click()}
                    disabled={subiendo || (selected.oficios?.length ?? 0) >= MAX_OFICIOS}
                    className="mt-3 flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    {subiendo ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    {subiendo ? `Subiendo ${progreso ?? 0}%` : "Subir oficio"}
                  </button>
                </div>
              )}

              {errAccion && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span className="text-xs">{errAccion}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              {selected.estado === "pendiente" ? (
                <button onClick={confirmar} disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50">
                  <CheckCircle2 size={14} /> {saving ? "Guardando..." : "Recibir el caso"}
                </button>
              ) : editandoAviso ? (
                <>
                  {selected.estado === "avisado" && (
                    <button onClick={() => setEditandoAviso(false)} disabled={saving}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                      Cancelar
                    </button>
                  )}
                  <button onClick={guardarAviso} disabled={saving || !puedeGuardarAviso}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50">
                    <Landmark size={14} /> {saving ? "Guardando..." : "Registrar aviso"}
                  </button>
                </>
              ) : (
                <button onClick={cerrar}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  Cerrar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TONOS = {
  cyan: { borde: "border-cyan-100 dark:border-cyan-900/60", fondo: "bg-cyan-50/70 dark:bg-cyan-950/25", icono: "bg-cyan-600" },
  amber: { borde: "border-amber-100 dark:border-amber-900/60", fondo: "bg-amber-50/70 dark:bg-amber-950/25", icono: "bg-amber-500" },
  blue: { borde: "border-blue-100 dark:border-blue-900/60", fondo: "bg-blue-50/70 dark:bg-blue-950/25", icono: "bg-blue-600" },
  emerald: { borde: "border-emerald-100 dark:border-emerald-900/60", fondo: "bg-emerald-50/70 dark:bg-emerald-950/25", icono: "bg-emerald-500" },
} as const;

function Tile({ n, label, icon: Icono, tone }: {
  n: number; label: string; icon: React.ElementType; tone: keyof typeof TONOS;
}) {
  const t = TONOS[tone];
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${t.borde} ${t.fondo}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${t.icono}`}><Icono size={16} /></span>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{n}</p>
        <p className="mt-1 truncate text-[11px] font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 pt-0.5 text-xs font-medium text-slate-500">{label}</span>
      <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200">{value}</span>
    </div>
  );
}
