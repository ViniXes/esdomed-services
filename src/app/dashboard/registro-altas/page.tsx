"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, getDocs, where, limit, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DateField } from "@/components/ui/DateField";
import { useAuth } from "@/contexts/AuthContext";
import { useServicios } from "@/contexts/ServiciosContext";
import { Genero, RegistroAlta, TipoAlta } from "@/types";
import {
  ListChecks, Plus, Search, X, Download, Pencil, Trash2,
  ChevronLeft, ChevronRight,
} from "lucide-react";

const PAGE_SIZE = 12;

const TIPO_ALTA_LABEL: Record<TipoAlta, string> = {
  alta_efectiva: "Alta efectiva",
  alta_exigida: "Alta exigida",
  alta_voluntaria: "Alta voluntaria",
  alta_suspendida: "Alta suspendida",
  alta_dengue: "Alta dengue",
  alta_jornada_cirugia: "Alta jornada cirugía",
  deposito: "Depósito",
  traslado_otro_hospital: "Traslado a otro hospital",
};
const TIPOS_ALTA = Object.keys(TIPO_ALTA_LABEL) as TipoAlta[];

const GENERO_LABEL: Record<Genero, string> = {
  masculino: "Masculino",
  femenino: "Femenino",
  otro: "Otro",
};

const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "block text-xs font-medium text-slate-500 mb-1.5";

const hoy = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

interface FormState {
  fecha: string;
  expediente: string;
  pacienteNombre: string;
  servicio: string;
  cama: string;
  genero: Genero | "";
  tipoAlta: TipoAlta;
  responsableEsdomed: string;
  digitadorSimmow: string;
  medicoRetira: string;
  documentacionCompleta: boolean;
  documentacionEntregada: boolean;
  notas: string;
}

const emptyForm = (responsable = ""): FormState => ({
  fecha: hoy(),
  expediente: "",
  pacienteNombre: "",
  servicio: "",
  cama: "",
  genero: "",
  tipoAlta: "alta_efectiva",
  responsableEsdomed: responsable,
  digitadorSimmow: "",
  medicoRetira: "",
  documentacionCompleta: true,
  documentacionEntregada: false,
  notas: "",
});

const notaTexto = (r: RegistroAlta) =>
  [
    r.documentacionCompleta ? "Documentación completa" : "Documentación incompleta",
    r.documentacionEntregada ? "entregada" : null,
    r.notas?.trim() || null,
  ].filter(Boolean).join(" · ");

export default function RegistroAltasPage() {
  const { profile } = useAuth();
  const { servicios } = useServicios();
  const [registros, setRegistros] = useState<RegistroAlta[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [buscandoExp, setBuscandoExp] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Catálogo de personal ESDOMED para autocompletar responsable/digitador.
  const [personal, setPersonal] = useState<string[]>([]);

  // Filtros + paginación.
  const [busqueda, setBusqueda] = useState("");
  const [filtroServicio, setFiltroServicio] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<TipoAlta | "">("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    // Un solo orderBy para no exigir índice compuesto; el desempate por creadoEn se hace en cliente.
    const q = query(collection(db, "registro_altas"), orderBy("fecha", "desc"), limit(500));
    return onSnapshot(q, s => {
      const docs = s.docs.map(d => ({ id: d.id, ...d.data() } as RegistroAlta));
      docs.sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
        const at = (a.creadoEn as { toMillis?: () => number })?.toMillis?.() ?? 0;
        const bt = (b.creadoEn as { toMillis?: () => number })?.toMillis?.() ?? 0;
        return bt - at;
      });
      setRegistros(docs);
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  useEffect(() => {
    getDocs(query(collection(db, "usuarios"), where("role", "in", ["esdomed", "asistente_esdomed", "admin"])))
      .then(s => setPersonal(s.docs.map(d => (d.data().nombre as string)).filter(Boolean).sort((a, b) => a.localeCompare(b))))
      .catch(() => setPersonal([]));
  }, []);

  // ── Form ──────────────────────────────────────────────────────────────────
  const abrirNuevo = () => {
    setEditId(null);
    setForm(emptyForm(profile?.nombre ?? ""));
    setError("");
    setShowForm(true);
  };

  const abrirEdicion = (r: RegistroAlta) => {
    setEditId(r.id!);
    setForm({
      fecha: r.fecha,
      expediente: r.expediente,
      pacienteNombre: r.pacienteNombre,
      servicio: r.servicio,
      cama: r.cama ?? "",
      genero: r.genero ?? "",
      tipoAlta: r.tipoAlta,
      responsableEsdomed: r.responsableEsdomed,
      digitadorSimmow: r.digitadorSimmow ?? "",
      medicoRetira: r.medicoRetira ?? "",
      documentacionCompleta: r.documentacionCompleta,
      documentacionEntregada: r.documentacionEntregada,
      notas: r.notas ?? "",
    });
    setError("");
    setShowForm(true);
  };

  const cerrarForm = () => { setShowForm(false); setEditId(null); setError(""); };

  // Autollena paciente/servicio/cama/género desde el último ingreso del expediente.
  const buscarExpediente = async () => {
    const exp = form.expediente.trim();
    if (!exp) return;
    setBuscandoExp(true);
    try {
      const snap = await getDocs(query(collection(db, "pacientes"), where("expediente", "==", exp), limit(1)));
      if (!snap.empty) {
        const p = snap.docs[0].data();
        setForm(prev => ({
          ...prev,
          pacienteNombre: `${p.nombres ?? ""} ${p.apellidos ?? ""}`.trim() || prev.pacienteNombre,
          servicio: (p.servicioActual as string) ?? prev.servicio,
          cama: (p.camaActual as string) ?? prev.cama,
          genero: (p.genero as Genero) ?? prev.genero,
        }));
      }
    } catch { /* ignora; el módulo de pacientes es opcional */ }
    finally { setBuscandoExp(false); }
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!form.expediente.trim()) { setError("El expediente es obligatorio."); return; }
    if (!form.pacienteNombre.trim()) { setError("El nombre del paciente es obligatorio."); return; }
    if (!form.servicio) { setError("Selecciona el servicio."); return; }
    if (!form.responsableEsdomed.trim()) { setError("Indica el responsable de ESDOMED."); return; }

    setSaving(true);
    setError("");
    try {
      const base = {
        fecha: form.fecha,
        expediente: form.expediente.trim(),
        pacienteNombre: form.pacienteNombre.trim(),
        servicio: form.servicio,
        cama: form.cama.trim(),
        tipoAlta: form.tipoAlta,
        responsableEsdomed: form.responsableEsdomed.trim(),
        digitadorSimmow: form.digitadorSimmow.trim(),
        medicoRetira: form.medicoRetira.trim(),
        documentacionCompleta: form.documentacionCompleta,
        documentacionEntregada: form.documentacionEntregada,
        notas: form.notas.trim(),
        ...(form.genero ? { genero: form.genero } : {}),
      };
      if (editId) {
        await updateDoc(doc(db, "registro_altas", editId), { ...base, actualizadoEn: Timestamp.now() });
      } else {
        await addDoc(collection(db, "registro_altas"), {
          ...base,
          creadoEn: Timestamp.now(),
          creadoPorId: profile.uid,
          creadoPorNombre: profile.nombre,
        });
      }
      cerrarForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el registro");
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (r: RegistroAlta) => {
    if (!confirm(`Eliminar el registro de alta del Exp. ${r.expediente} (${r.pacienteNombre})?`)) return;
    setDeletingId(r.id!);
    try { await deleteDoc(doc(db, "registro_altas", r.id!)); }
    catch { /* noop */ }
    finally { setDeletingId(null); }
  };

  // ── Filtrado + paginación ───────────────────────────────────────────────
  const displayList = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return registros.filter(r => {
      if (q && !(r.expediente.toLowerCase().includes(q) || r.pacienteNombre.toLowerCase().includes(q))) return false;
      if (filtroServicio && r.servicio !== filtroServicio) return false;
      if (filtroTipo && r.tipoAlta !== filtroTipo) return false;
      if (fechaDesde && r.fecha < fechaDesde) return false;
      if (fechaHasta && r.fecha > fechaHasta) return false;
      return true;
    });
  }, [registros, busqueda, filtroServicio, filtroTipo, fechaDesde, fechaHasta]);

  // Al cambiar cualquier filtro, volver a la página 1 (ajuste en render, sin efecto).
  const filtrosKey = `${busqueda}|${filtroServicio}|${filtroTipo}|${fechaDesde}|${fechaHasta}`;
  const [prevFiltros, setPrevFiltros] = useState(filtrosKey);
  if (filtrosKey !== prevFiltros) {
    setPrevFiltros(filtrosKey);
    setPagina(1);
  }

  const totalPaginas = Math.max(1, Math.ceil(displayList.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const pageItems = displayList.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);

  const hayFiltros = !!(busqueda || filtroServicio || filtroTipo || fechaDesde || fechaHasta);

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const filas = displayList.map(r => ({
      FECHA: r.fecha,
      EXP: r.expediente,
      PACIENTE: r.pacienteNombre,
      SERVICIO: r.servicio,
      CAMA: r.cama ?? "",
      GENERO: r.genero ? r.genero.toUpperCase() : "",
      ESTADO: TIPO_ALTA_LABEL[r.tipoAlta] ?? r.tipoAlta,
      "RESPONSABLE ESDOMED": r.responsableEsdomed,
      "DIGITADOR SIMMOW": r.digitadorSimmow ?? "",
      "MEDICO QUE RETIRA DOCUMENTACION": r.medicoRetira ?? "",
      NOTAS: notaTexto(r),
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Registro de Altas");
    XLSX.writeFile(wb, `registro-altas-${hoy()}.xlsx`);
  };

  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-900">
            <ListChecks size={17} className="text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Registro de Altas</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportar} disabled={displayList.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors">
            <Download size={15} /> Exportar
          </button>
          <button onClick={showForm ? cerrarForm : abrirNuevo}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
            {showForm ? <><X size={15} /> Cancelar</> : <><Plus size={15} /> Nuevo registro</>}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={guardar} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-6 space-y-4">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {editId ? "Editar registro" : "Nuevo registro de alta"}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Fecha del alta</label>
              <DateField value={form.fecha} onChange={v => setF("fecha", v)}
                placeholder="Fecha del alta" ariaLabel="Fecha del alta" />
            </div>
            <div>
              <label className={labelCls}>Expediente</label>
              <div className="flex gap-1.5">
                <input type="text" value={form.expediente} onChange={e => setF("expediente", e.target.value)} required
                  placeholder="Ej. 417-24" className={inputCls} />
                <button type="button" onClick={buscarExpediente} disabled={buscandoExp || !form.expediente.trim()}
                  title="Autocompletar desde pacientes"
                  className="shrink-0 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors">
                  <Search size={15} />
                </button>
              </div>
            </div>
            <div>
              <label className={labelCls}>Paciente</label>
              <input type="text" value={form.pacienteNombre} onChange={e => setF("pacienteNombre", e.target.value)} required
                placeholder="Nombre completo" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Servicio</label>
              <select value={form.servicio} onChange={e => setF("servicio", e.target.value)} required className={inputCls}>
                <option value="">Seleccionar...</option>
                {servicios.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Cama</label>
              <input type="text" value={form.cama} onChange={e => setF("cama", e.target.value)} placeholder="Ej. 126" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Género</label>
              <select value={form.genero} onChange={e => setF("genero", e.target.value as Genero | "")} className={inputCls}>
                <option value="">—</option>
                {(Object.keys(GENERO_LABEL) as Genero[]).map(g => <option key={g} value={g}>{GENERO_LABEL[g]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Tipo de alta</label>
              <select value={form.tipoAlta} onChange={e => setF("tipoAlta", e.target.value as TipoAlta)} className={inputCls}>
                {TIPOS_ALTA.map(t => <option key={t} value={t}>{TIPO_ALTA_LABEL[t]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Responsable ESDOMED</label>
              <input type="text" list="personal-esdomed" value={form.responsableEsdomed}
                onChange={e => setF("responsableEsdomed", e.target.value)} required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Digitador SIMMOW</label>
              <input type="text" list="personal-esdomed" value={form.digitadorSimmow}
                onChange={e => setF("digitadorSimmow", e.target.value)} placeholder="Opcional" className={inputCls} />
            </div>
            <div className="lg:col-span-2">
              <label className={labelCls}>Médico que retira documentación</label>
              <input type="text" value={form.medicoRetira} onChange={e => setF("medicoRetira", e.target.value)}
                placeholder="Texto libre (puede no tener usuario)" className={inputCls} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5 pt-1">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" checked={form.documentacionCompleta}
                onChange={e => setF("documentacionCompleta", e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 accent-blue-600" />
              Documentación completa
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" checked={form.documentacionEntregada}
                onChange={e => setF("documentacionEntregada", e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 accent-blue-600" />
              Documentación entregada
            </label>
          </div>

          <div>
            <label className={labelCls}>Notas (opcional)</label>
            <input type="text" value={form.notas} onChange={e => setF("notas", e.target.value)}
              placeholder="Ej. Solo resumen, sin papelería a imprimir..." className={inputCls} />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={cerrarForm}
              className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 sm:flex-none px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">
              {saving ? "Guardando..." : editId ? "Guardar cambios" : "Registrar alta"}
            </button>
          </div>
        </form>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" placeholder="Buscar por expediente o paciente..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400" />
        </div>
        <select value={filtroServicio} onChange={e => setFiltroServicio(e.target.value)}
          className="px-2.5 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 dark:text-slate-200">
          <option value="">Todos los servicios</option>
          {servicios.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as TipoAlta | "")}
          className="px-2.5 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 dark:text-slate-200">
          <option value="">Todos los tipos</option>
          {TIPOS_ALTA.map(t => <option key={t} value={t}>{TIPO_ALTA_LABEL[t]}</option>)}
        </select>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Desde</span>
          <DateField value={fechaDesde} onChange={setFechaDesde} clearable
            placeholder="Desde" ariaLabel="Fecha desde" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Hasta</span>
          <DateField value={fechaHasta} onChange={setFechaHasta} clearable
            placeholder="Hasta" ariaLabel="Fecha hasta" />
        </div>
        {hayFiltros && (
          <button onClick={() => { setBusqueda(""); setFiltroServicio(""); setFiltroTipo(""); setFechaDesde(""); setFechaHasta(""); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors">
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 text-center py-10">Cargando registros...</p>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  {["Fecha", "Expediente", "Paciente", "Servicio / Cama", "Tipo", "Responsable", "Digitador", "Documentación", ""].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pageItems.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-10 text-slate-500">
                    {hayFiltros ? "Ningún registro coincide con los filtros." : "Aún no hay altas registradas."}
                  </td></tr>
                )}
                {pageItems.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors align-top">
                    <td className="px-3 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">{r.fecha}</td>
                    <td className="px-3 py-3 whitespace-nowrap font-mono text-xs text-slate-600 dark:text-slate-400">{r.expediente}</td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{r.pacienteNombre}</p>
                      {r.medicoRetira && <p className="text-[11px] text-slate-400 mt-0.5">Retira: {r.medicoRetira}</p>}
                    </td>
                    <td className="px-3 py-3 text-slate-500 text-xs">{r.servicio}{r.cama ? ` · Cama ${r.cama}` : ""}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400">
                        {TIPO_ALTA_LABEL[r.tipoAlta]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">{r.responsableEsdomed}</td>
                    <td className="px-3 py-3 text-xs text-slate-500">{r.digitadorSimmow || "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                          r.documentacionCompleta
                            ? "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800"
                            : "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-800"
                        }`}>
                          {r.documentacionCompleta ? "Completa" : "Incompleta"}
                        </span>
                        {r.documentacionEntregada && (
                          <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/20 dark:border-green-800">
                            Entregada
                          </span>
                        )}
                      </div>
                      {r.notas && <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">{r.notas}</p>}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => abrirEdicion(r)} title="Editar"
                          className="p-1 text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => eliminar(r)} disabled={deletingId === r.id} title="Eliminar"
                          className="p-1 text-red-500 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40 transition-colors">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Paginación */}
      {!loading && displayList.length > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mostrando <span className="font-semibold text-slate-700 dark:text-slate-300">{(paginaActual - 1) * PAGE_SIZE + 1}</span>
            {"–"}
            <span className="font-semibold text-slate-700 dark:text-slate-300">{Math.min(paginaActual * PAGE_SIZE, displayList.length)}</span>
            {" de "}
            <span className="font-semibold text-slate-700 dark:text-slate-300">{displayList.length}</span>
          </p>
          {totalPaginas > 1 && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={paginaActual === 1}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft size={14} /> Anterior
              </button>
              <span className="px-2 text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums">{paginaActual} / {totalPaginas}</span>
              <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Catálogo de personal para autocompletar responsable/digitador. */}
      <datalist id="personal-esdomed">
        {personal.map(n => <option key={n} value={n} />)}
      </datalist>
    </div>
  );
}
