"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, Timestamp, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useServicios } from "@/contexts/ServiciosContext";
import { getPersona } from "@/lib/pacientes/persona";
import { GestionesTabs } from "./_components/GestionesTabs";
import { DateField } from "@/components/ui/DateField";
import {
  ESTADO_PACIENTE_GESTION_LABEL, esTipoVisita, GRUPOS_GESTION_TS, labelTipoGestion,
  MODALIDAD_GESTION_LABEL, RESULTADO_VISITA_COLOR, RESULTADO_VISITA_LABEL, TIPOS_GESTION_TS,
  type EstadoPacienteGestion, type ModalidadGestion, type ResultadoVisita,
} from "@/lib/trabajosocial/catalogos";
import type { EstadoPaciente, GestionTS, Paciente } from "@/types";
import {
  AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, Link2, Loader2,
  NotebookPen, Search, Trash2, User, X,
} from "lucide-react";

// ── Estilos compartidos (acento ámbar, igual que el resto de vistas de TS) ──────
const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";
const selectCls =
  "w-full appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer";
const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";

// ── Utilidades de fecha ─────────────────────────────────────────────────────────
function fechaStr(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}
function hoyStr(): string {
  return fechaStr(new Date());
}
function toDate(ts: unknown): Date | null {
  if (!ts) return null;
  return (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
}
function fmtHora(ts: unknown): string {
  const d = toDate(ts);
  return d ? d.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
}
function fmtFechaStr(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString("es-HN", { weekday: "long", day: "2-digit", month: "long" });
}

// Mapea el estado vital del ingreso (padrón) al estado simplificado de la gestión.
function estadoIngresoAGestion(estado?: EstadoPaciente): EstadoPacienteGestion {
  if (!estado) return "na";
  if (estado === "activo") return "actual";
  if (estado === "alta_fallecido") return "defuncion";
  return "alta"; // alta_vivo, alta_voluntaria, fuga, in_extremis, referido
}

// ── Formulario en blanco ────────────────────────────────────────────────────────
interface FormValue {
  expediente: string;
  pacienteNombre: string;
  servicio: string;
  estadoPaciente: EstadoPacienteGestion;
  vinculadoPadron: boolean;
  tipo: string;
  resultadoVisita: ResultadoVisita;
  modalidad: ModalidadGestion;
  duracionMin: string;
  notas: string;
  fecha: string;
}
const formVacio = (fecha: string): FormValue => ({
  expediente: "",
  pacienteNombre: "",
  servicio: "",
  estadoPaciente: "actual",
  vinculadoPadron: false,
  tipo: "",
  resultadoVisita: "realizada",
  modalidad: "presencial",
  duracionMin: "",
  notas: "",
  fecha,
});

export default function GestionesPage() {
  const { profile } = useAuth();
  const { servicios } = useServicios();

  const [form, setForm] = useState<FormValue>(() => formVacio(hoyStr()));
  const [buscandoExp, setBuscandoExp] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Lista del día
  const [fechaLista, setFechaLista] = useState(hoyStr());
  const [gestiones, setGestiones] = useState<GestionTS[]>([]);
  const [permissionError, setPermissionError] = useState(false);
  const [texto, setTexto] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [aEliminar, setAEliminar] = useState<GestionTS | null>(null);
  const [eliminando, setEliminando] = useState(false);

  // Toasts
  const feedbackId = useRef(0);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const notify = useCallback((tipo: "success" | "error", mensaje: string) => {
    const id = ++feedbackId.current;
    setFeedbacks((f) => [...f, { id, tipo, mensaje }]);
  }, []);
  const dismiss = useCallback((id: number) => setFeedbacks((f) => f.filter((x) => x.id !== id)), []);

  const expRef = useRef<HTMLInputElement>(null);

  // Suscripción a las gestiones de la fecha seleccionada.
  useEffect(() => {
    const q = query(collection(db, "gestiones_ts"), where("fecha", "==", fechaLista));
    return onSnapshot(
      q,
      (s) => {
        setPermissionError(false);
        const docs = s.docs.map((d) => ({ id: d.id, ...d.data() } as GestionTS));
        docs.sort((a, b) => (toDate(b.creadoEn)?.getTime() ?? 0) - (toDate(a.creadoEn)?.getTime() ?? 0));
        setGestiones(docs);
      },
      (err) => { if (err.code === "permission-denied") setPermissionError(true); },
    );
  }, [fechaLista]);

  // Autocompletar desde el padrón al escribir el expediente (debounce 400 ms).
  // Si calza en personas: rellena nombre + vincula. Busca su ingreso para servicio/estado.
  // Si no calza: deja el nombre editable (paciente ISBM / rastreo / fuera del padrón).
  useEffect(() => {
    const exp = form.expediente.trim();
    if (!exp) { setBuscandoExp(false); return; }
    let cancel = false;
    setBuscandoExp(true);
    const id = window.setTimeout(async () => {
      try {
        const persona = await getPersona(exp);
        if (cancel) return;
        if (!persona) {
          setForm((f) => (f.expediente.trim() === exp ? { ...f, vinculadoPadron: false } : f));
          return;
        }
        // Buscar el ingreso más reciente para inferir servicio y estado actuales.
        let servicio = "";
        let estado: EstadoPacienteGestion = "na";
        try {
          const snap = await getDocs(query(collection(db, "pacientes"), where("expediente", "==", exp)));
          const ingresos = snap.docs
            .map((d) => d.data() as Paciente)
            .sort((a, b) => (toDate(b.fechaIngreso)?.getTime() ?? 0) - (toDate(a.fechaIngreso)?.getTime() ?? 0));
          const ult = ingresos[0];
          if (ult) {
            servicio = ult.servicioActual ?? "";
            estado = estadoIngresoAGestion(ult.estado);
          }
        } catch { /* sin permisos de pacientes: solo se usa la persona */ }
        if (cancel) return;
        setForm((f) => {
          if (f.expediente.trim() !== exp) return f; // el usuario siguió escribiendo
          return {
            ...f,
            pacienteNombre: `${persona.apellidos}, ${persona.nombres}`,
            servicio: servicio || f.servicio,
            estadoPaciente: estado !== "na" ? estado : f.estadoPaciente,
            vinculadoPadron: true,
          };
        });
      } finally {
        if (!cancel) setBuscandoExp(false);
      }
    }, 400);
    return () => { cancel = true; window.clearTimeout(id); };
  }, [form.expediente]);

  const setExpediente = (v: string) =>
    setForm((f) => ({ ...f, expediente: v, vinculadoPadron: false }));

  const valido =
    form.expediente.trim() && form.pacienteNombre.trim() && form.tipo && form.fecha;

  const registrar = async () => {
    if (!profile) return;
    if (!valido) { notify("error", "Completa expediente, paciente y tipo de gestión"); return; }
    setGuardando(true);
    try {
      const dur = parseInt(form.duracionMin, 10);
      const nuevo: Omit<GestionTS, "id"> = {
        expediente: form.expediente.trim(),
        pacienteNombre: form.pacienteNombre.trim(),
        servicio: form.servicio.trim() || undefined,
        estadoPaciente: form.estadoPaciente,
        vinculadoPadron: form.vinculadoPadron,
        tipo: form.tipo,
        resultadoVisita: esTipoVisita(form.tipo) ? form.resultadoVisita : undefined,
        modalidad: form.modalidad,
        duracionMin: Number.isFinite(dur) && dur > 0 ? dur : undefined,
        notas: form.notas.trim() || undefined,
        fecha: form.fecha,
        trabajadoraId: profile.uid,
        trabajadoraNombre: profile.nombre,
        creadoEn: Timestamp.now() as unknown as Date,
      };
      // Firestore no acepta `undefined`: limpiar las claves vacías.
      const payload = Object.fromEntries(Object.entries(nuevo).filter(([, v]) => v !== undefined));
      await addDoc(collection(db, "gestiones_ts"), payload);
      notify("success", "Gestión registrada");
      // Mantener la fecha (sesión de captura del mismo día); limpiar el resto.
      setForm(formVacio(form.fecha));
      expRef.current?.focus();
    } catch {
      notify("error", "No se pudo registrar la gestión");
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    const g = aEliminar;
    if (!g?.id) return;
    setEliminando(true);
    try {
      await deleteDoc(doc(db, "gestiones_ts", g.id));
      notify("success", "Gestión eliminada");
      setAEliminar(null);
    } catch {
      notify("error", "No se pudo eliminar (solo el administrador puede borrar gestiones de otros días).");
    } finally {
      setEliminando(false);
    }
  };

  // Filtrado de la lista (texto + tipo).
  const listaFiltrada = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return gestiones.filter((g) => {
      if (filtroTipo !== "todos" && g.tipo !== filtroTipo) return false;
      if (!t) return true;
      return (
        g.expediente?.toLowerCase().includes(t) ||
        g.pacienteNombre?.toLowerCase().includes(t) ||
        g.servicio?.toLowerCase().includes(t) ||
        g.trabajadoraNombre?.toLowerCase().includes(t) ||
        labelTipoGestion(g.tipo).toLowerCase().includes(t) ||
        (g.notas ?? "").toLowerCase().includes(t)
      );
    });
  }, [gestiones, texto, filtroTipo]);

  // Productividad del día: conteo por trabajadora (vista previa de PRODUCCION DIARIA).
  const productividad = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of gestiones) m.set(g.trabajadoraNombre, (m.get(g.trabajadoraNombre) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [gestiones]);

  return (
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto flex flex-col gap-4 xl:h-full xl:min-h-0 xl:overflow-hidden">
      {/* Header */}
      <div className="shrink-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1c1e4d] dark:text-[#c9a892] mb-1">
          <NotebookPen size={13} /> Trabajo Social
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Registro de gestiones</h1>
        <p className="text-xs text-slate-500 mt-0.5">Intervenciones de Trabajo Social — reemplaza el formulario de intervenciones presenciales</p>
      </div>

      <div className="shrink-0">
        <GestionesTabs />
      </div>

      {permissionError && (
        <div className="shrink-0 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer las gestiones. Pide al administrador que despliegue la regla de la colección <strong>gestiones_ts</strong>.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,400px)_1fr] xl:grid-rows-1 gap-5 items-start xl:items-stretch xl:flex-1 xl:min-h-0">
        {/* ── Formulario de captura ── */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3.5 xl:h-full xl:overflow-y-auto">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Nueva gestión</p>

          {/* Expediente + autocompletar */}
          <div>
            <label className={labelCls}>Expediente</label>
            <div className="relative">
              <input
                ref={expRef}
                value={form.expediente}
                onChange={(e) => setExpediente(e.target.value)}
                placeholder="Ej. 1-26"
                className={inputCls + " pr-9 font-mono"}
                autoFocus
              />
              {buscandoExp && (
                <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
              )}
            </div>
            {form.expediente.trim() && !buscandoExp && (
              form.vinculadoPadron ? (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                  <Link2 size={11} /> Vinculado al padrón de pacientes
                </p>
              ) : (
                <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">
                  Expediente fuera del padrón — captura el nombre manualmente
                </p>
              )
            )}
          </div>

          {/* Paciente */}
          <div>
            <label className={labelCls}>Paciente</label>
            <input
              value={form.pacienteNombre}
              onChange={(e) => setForm((f) => ({ ...f, pacienteNombre: e.target.value }))}
              placeholder="Apellidos, nombres"
              className={inputCls}
            />
          </div>

          {/* Servicio + estado */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={labelCls}>Servicio</label>
              <input
                value={form.servicio}
                onChange={(e) => setForm((f) => ({ ...f, servicio: e.target.value }))}
                list="servicios-ts"
                placeholder="Servicio"
                className={inputCls}
              />
              <datalist id="servicios-ts">
                {servicios.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>Estado</label>
              <select
                value={form.estadoPaciente}
                onChange={(e) => setForm((f) => ({ ...f, estadoPaciente: e.target.value as EstadoPacienteGestion }))}
                className={selectCls}
              >
                {(Object.keys(ESTADO_PACIENTE_GESTION_LABEL) as EstadoPacienteGestion[]).map((e) => (
                  <option key={e} value={e}>{ESTADO_PACIENTE_GESTION_LABEL[e]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tipo de gestión (catálogo cerrado, agrupado) */}
          <div>
            <label className={labelCls}>Tipo de gestión</label>
            <select
              value={form.tipo}
              onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
              className={selectCls}
            >
              <option value="">— Selecciona el tipo</option>
              {GRUPOS_GESTION_TS.map((grupo) => (
                <optgroup key={grupo} label={grupo}>
                  {TIPOS_GESTION_TS.filter((t) => t.grupo === grupo).map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Resultado de la visita (solo para tipos del grupo Visitas) */}
          {esTipoVisita(form.tipo) && (
            <div>
              <label className={labelCls}>Resultado de la visita</label>
              <select
                value={form.resultadoVisita}
                onChange={(e) => setForm((f) => ({ ...f, resultadoVisita: e.target.value as ResultadoVisita }))}
                className={selectCls}
              >
                {(Object.keys(RESULTADO_VISITA_LABEL) as ResultadoVisita[]).map((r) => (
                  <option key={r} value={r}>{RESULTADO_VISITA_LABEL[r]}</option>
                ))}
              </select>
            </div>
          )}

          {/* Modalidad + duración */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={labelCls}>Modalidad</label>
              <select
                value={form.modalidad}
                onChange={(e) => setForm((f) => ({ ...f, modalidad: e.target.value as ModalidadGestion }))}
                className={selectCls}
              >
                {(Object.keys(MODALIDAD_GESTION_LABEL) as ModalidadGestion[]).map((m) => (
                  <option key={m} value={m}>{MODALIDAD_GESTION_LABEL[m]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Duración <span className="text-slate-400 normal-case font-normal">(min)</span></label>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={form.duracionMin}
                onChange={(e) => setForm((f) => ({ ...f, duracionMin: e.target.value }))}
                placeholder="—"
                className={inputCls}
              />
            </div>
          </div>

          {/* Fecha */}
          <div>
            <label className={labelCls}>Fecha de la gestión</label>
            <DateField
              value={form.fecha}
              onChange={(v) => setForm((f) => ({ ...f, fecha: v }))}
              placeholder="Fecha de la gestión"
              ariaLabel="Fecha de la gestión"
            />
          </div>

          {/* Notas */}
          <div>
            <label className={labelCls}>Notas <span className="text-slate-400 normal-case font-normal">(opcional)</span></label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              rows={2}
              placeholder="Detalle de la intervención…"
              className={inputCls + " resize-y"}
            />
          </div>

          <button
            onClick={registrar}
            disabled={!valido || guardando}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Registrar gestión
          </button>
        </div>

        {/* ── Lista del día ── */}
        <div className="space-y-4 xl:space-y-0 xl:gap-4 xl:h-full xl:min-h-0 xl:flex xl:flex-col">
          <div className="shrink-0 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <CalendarDays size={15} />
              <DateField
                value={fechaLista}
                onChange={setFechaLista}
                placeholder="Fecha"
                ariaLabel="Fecha de la lista"
              />
            </label>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 capitalize">{fmtFechaStr(fechaLista)}</span>
            <span className="ml-auto text-sm text-slate-500">{listaFiltrada.length} de {gestiones.length} gestión(es)</span>
          </div>

          {/* Productividad del día */}
          {productividad.length > 0 && (
            <div className="shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Productividad del día</p>
              <div className="flex flex-wrap gap-2">
                {productividad.map(([nombre, n]) => (
                  <span key={nombre} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-300">
                    {nombre} <span className="font-bold">{n}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Filtros de la lista */}
          <div className="shrink-0 flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Buscar por paciente, expediente, trabajadora, tipo o notas…"
                className={inputCls + " pl-9"}
              />
            </div>
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className={selectCls + " sm:w-auto sm:max-w-[260px]"}>
              <option value="todos">Todos los tipos</option>
              {GRUPOS_GESTION_TS.map((grupo) => (
                <optgroup key={grupo} label={grupo}>
                  {TIPOS_GESTION_TS.filter((t) => t.grupo === grupo).map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Lista — tarjetas en móvil, tabla en escritorio (scroll propio en xl) */}
          <div className="xl:flex-1 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          {gestiones.length === 0 ? (
            <EmptyState texto="No hay gestiones registradas para este día." sub="Registra la primera con el formulario de la izquierda." />
          ) : listaFiltrada.length === 0 ? (
            <p className="text-sm text-slate-400 py-10 text-center">Ninguna gestión coincide con el filtro.</p>
          ) : (
            <>
              {/* Tarjetas (móvil / tablet) */}
              <div className="space-y-2.5 lg:hidden">
                {listaFiltrada.map((g) => (
                  <div key={g.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-slate-500 flex items-center gap-1">
                          {g.expediente}
                          {g.vinculadoPadron && <Link2 size={10} className="text-emerald-500" />}
                        </p>
                        <p className="font-semibold text-slate-800 dark:text-slate-200 leading-tight truncate">{g.pacienteNombre}</p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400 tabular-nums">{fmtHora(g.creadoEn)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 break-words">{labelTipoGestion(g.tipo)}</p>
                      {g.resultadoVisita && (
                        <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${RESULTADO_VISITA_COLOR[g.resultadoVisita]}`}>
                          {RESULTADO_VISITA_LABEL[g.resultadoVisita]}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mt-1">
                      <span className="break-words min-w-0">{g.servicio || "Sin servicio"}</span>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <span>{ESTADO_PACIENTE_GESTION_LABEL[g.estadoPaciente]}</span>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <span>
                        {g.modalidad ? MODALIDAD_GESTION_LABEL[g.modalidad] : "Presencial"}
                        {g.duracionMin ? ` · ${g.duracionMin} min` : ""}
                      </span>
                    </div>
                    {g.notas && <p className="text-xs text-slate-500 mt-1.5 break-words whitespace-pre-wrap">{g.notas}</p>}
                    <div className="flex items-center justify-between gap-3 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500 min-w-0">
                        <User size={12} className="text-slate-400 shrink-0" /> <span className="truncate">{g.trabajadoraNombre}</span>
                      </span>
                      <button
                        onClick={() => setAEliminar(g)}
                        className="shrink-0 text-slate-400 hover:text-rose-500 transition-colors"
                        aria-label="Eliminar gestión"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tabla (escritorio) */}
              <div className="hidden lg:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                        {["Paciente", "Servicio / Estado", "Gestión", "Trabajadora", "Hora", ""].map((h, i) => (
                          <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {listaFiltrada.map((g) => (
                        <tr key={g.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 align-top">
                          <td className="px-4 py-3">
                            <p className="font-mono text-xs text-slate-500 flex items-center gap-1">
                              {g.expediente}
                              {g.vinculadoPadron && <Link2 size={10} className="text-emerald-500" />}
                            </p>
                            <p className="font-medium text-slate-800 dark:text-slate-200">{g.pacienteNombre}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-slate-700 dark:text-slate-300">{g.servicio || "—"}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{ESTADO_PACIENTE_GESTION_LABEL[g.estadoPaciente]}</p>
                          </td>
                          <td className="px-4 py-3 max-w-[460px]">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-slate-800 dark:text-slate-200 break-words">{labelTipoGestion(g.tipo)}</p>
                              {g.resultadoVisita && (
                                <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${RESULTADO_VISITA_COLOR[g.resultadoVisita]}`}>
                                  {RESULTADO_VISITA_LABEL[g.resultadoVisita]}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {g.modalidad ? MODALIDAD_GESTION_LABEL[g.modalidad] : "Presencial"}
                              {g.duracionMin ? ` · ${g.duracionMin} min` : ""}
                            </p>
                            {g.notas && <p className="text-xs text-slate-500 mt-0.5 break-words whitespace-pre-wrap">{g.notas}</p>}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1"><User size={12} className="text-slate-400" /> {g.trabajadoraNombre}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtHora(g.creadoEn)}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setAEliminar(g)}
                              className="text-slate-400 hover:text-rose-500 transition-colors"
                              aria-label="Eliminar gestión"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
          </div>
        </div>
      </div>

      {/* Confirmación de borrado */}
      {aEliminar && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="p-6 flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center">
                <Trash2 size={26} className="text-rose-600 dark:text-rose-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Eliminar gestión</h3>
              <p className="text-sm text-slate-500">
                Se eliminará la gestión de <span className="font-semibold text-slate-700 dark:text-slate-300">{aEliminar.pacienteNombre}</span>. Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="p-5 pt-0 flex gap-3">
              <button
                type="button"
                onClick={() => setAEliminar(null)}
                disabled={eliminando}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={eliminar}
                disabled={eliminando}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors disabled:opacity-50"
              >
                {eliminando ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      <FeedbackStack items={feedbacks} onDismiss={dismiss} />
    </div>
  );
}

// ── Subcomponentes ──────────────────────────────────────────────────────────────
function EmptyState({ texto, sub }: { texto: string; sub?: string }) {
  return (
    <div className="text-center py-16 text-slate-400">
      <ClipboardList size={32} className="mx-auto mb-3 opacity-40" />
      <p className="text-sm">{texto}</p>
      {sub && <p className="text-xs mt-1">{sub}</p>}
    </div>
  );
}

// ── Toasts (mismo patrón que el resto del portal) ───────────────────────────────
type Feedback = { id: number; tipo: "success" | "error"; mensaje: string };

function FeedbackStack({ items, onDismiss }: { items: Feedback[]; onDismiss: (id: number) => void }) {
  if (!items.length) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[210] flex flex-col gap-2 items-center pointer-events-none">
      {items.map((f) => <FeedbackToast key={f.id} f={f} onDismiss={() => onDismiss(f.id)} />)}
    </div>
  );
}

function FeedbackToast({ f, onDismiss }: { f: Feedback; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  const ok = f.tipo === "success";
  return (
    <div
      className="pointer-events-auto flex items-center gap-2.5 rounded-xl border px-4 py-3 shadow-xl text-sm font-medium bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
      style={{ borderLeftWidth: 4, borderLeftColor: ok ? "#10b981" : "#f43f5e", animation: "notif-in 0.25s ease-out" }}
    >
      {ok ? <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" /> : <AlertTriangle size={16} className="text-rose-500 flex-shrink-0" />}
      <span>{f.mensaje}</span>
      <button onClick={onDismiss} className="ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Cerrar"><X size={13} /></button>
    </div>
  );
}
