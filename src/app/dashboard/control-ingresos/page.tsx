"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDoc, collection, Timestamp, query, orderBy, onSnapshot, limit, doc, updateDoc,
  where, getDocs, QueryConstraint,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useServicios } from "@/contexts/ServiciosContext";
import { useAuth } from "@/contexts/AuthContext";
import { DateField } from "@/components/ui/DateField";
import { ClipboardList, CheckCircle2, Search, X, Pencil } from "lucide-react";

type GeneroIngreso = "masculino" | "femenino";

type ControlIngreso = {
  id?: string;
  expediente: string;
  dui?: string;
  apellidos: string;
  nombres: string;
  edad?: number;
  genero?: GeneroIngreso;
  servicio: string;
  ingresoDirectoServicio: boolean;
  responsableIngresoNombre: string;
  creadoEn: Date;
};

type FormState = {
  expediente: string;
  dui: string;
  apellidos: string;
  nombres: string;
  edad: string;
  genero: "" | GeneroIngreso;
  servicio: string;
  ingresoDirectoServicio: boolean;
};

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-[#c9a892] dark:focus:border-[#c9a892] transition";

const emptyForm = (): FormState => ({
  expediente: "",
  dui: "",
  apellidos: "",
  nombres: "",
  edad: "",
  genero: "",
  servicio: "",
  ingresoDirectoServicio: false,
});

export default function ControlIngresosPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { servicios } = useServicios();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [guardando, setGuardando] = useState(false);
  const [modalInfo, setModalInfo] = useState<{ tipo: "exito" | "error", mensaje: string } | null>(null);
  const [ingresos, setIngresos] = useState<ControlIngreso[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [resultadosHistoricos, setResultadosHistoricos] = useState<ControlIngreso[] | null>(null);
  const [buscandoHistoricos, setBuscandoHistoricos] = useState(false);

  useEffect(() => {
    if (!profile) return;
    if (profile.role !== "esdomed" && profile.role !== "asistente_esdomed" && profile.role !== "admin") router.replace("/dashboard");
  }, [profile, router]);

  // Vista en vivo acotada a ayer + hoy (mismo campo en where/orderBy, no exige
  // índice compuesto). Antes traía hasta 400 registros de toda la historia
  // cada vez que se abría la ruta; ahora solo lo reciente y acotado.
  useEffect(() => {
    const inicioAyer = new Date();
    inicioAyer.setDate(inicioAyer.getDate() - 1);
    inicioAyer.setHours(0, 0, 0, 0);
    const q = query(
      collection(db, "control_ingresos"),
      where("creadoEn", ">=", Timestamp.fromDate(inicioAyer)),
      orderBy("creadoEn", "desc"),
    );
    return onSnapshot(q, s =>
      setIngresos(s.docs.map(d => ({ id: d.id, ...d.data() } as ControlIngreso)))
    );
  }, []);

  if (!profile || (profile.role !== "esdomed" && profile.role !== "asistente_esdomed" && profile.role !== "admin")) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const set =
    (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      let val = e.target.value;
      if (field === "nombres" || field === "apellidos") {
        val = val.toUpperCase();
      }
      if (field === "edad") {
        val = val.replace(/\D/g, "").slice(0, 3);
      }
      setForm(prev => ({ ...prev, [field]: val }));
    };

  const validar = (): string | null => {
    if (!form.expediente.trim()) return "El número de expediente es obligatorio.";
    if (!/^\d+-\d{2}$/.test(form.expediente.trim())) return "El formato del expediente debe ser X-XX (ej. 1-26).";
    if (!form.apellidos.trim()) return "Los apellidos son obligatorios.";
    if (!form.nombres.trim()) return "Los nombres son obligatorios.";
    if (!form.edad.trim()) return "La edad es obligatoria.";
    if (!/^\d+$/.test(form.edad.trim()) || parseInt(form.edad, 10) > 120) return "La edad debe ser un número entero válido.";
    if (!form.genero) return "Seleccione el género.";
    if (!form.servicio.trim()) return "Seleccione el servicio.";
    return null;
  };

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validar();
    if (err) { 
      setModalInfo({ tipo: "error", mensaje: err });
      return; 
    }
    setGuardando(true);
    try {
      const data: Record<string, unknown> = {
        expediente: form.expediente.trim(),
        apellidos: form.apellidos.trim(),
        nombres: form.nombres.trim(),
        edad: parseInt(form.edad, 10),
        genero: form.genero,
        servicio: form.servicio,
        ingresoDirectoServicio: form.ingresoDirectoServicio,
      };
      if (form.dui.trim()) data.dui = form.dui.trim();

      if (editingId) {
        await updateDoc(doc(db, "control_ingresos", editingId), data);
        setEditingId(null);
        setModalInfo({ tipo: "exito", mensaje: "Ingreso actualizado correctamente." });
      } else {
        data.responsableIngresoUid = profile.uid;
        data.responsableIngresoNombre = profile.nombre;
        data.creadoPor = profile.uid;
        data.creadoPorNombre = profile.nombre;
        data.creadoEn = Timestamp.now();
        await addDoc(collection(db, "control_ingresos"), data);
        setModalInfo({ tipo: "exito", mensaje: "Ingreso registrado correctamente." });
      }

      setForm(emptyForm());
    } catch (err) {
      setModalInfo({ tipo: "error", mensaje: `Error al ${editingId ? "actualizar" : "registrar"}: ${err instanceof Error ? err.message : "desconocido"}` });
    } finally {
      setGuardando(false);
    }
  };

  const handleEdit = (ingreso: ControlIngreso) => {
    setEditingId(ingreso.id!);
    setForm({
      expediente: ingreso.expediente || "",
      dui: ingreso.dui || "",
      apellidos: ingreso.apellidos || "",
      nombres: ingreso.nombres || "",
      edad: ingreso.edad != null ? String(ingreso.edad) : "",
      genero: ingreso.genero || "",
      servicio: ingreso.servicio || "",
      ingresoDirectoServicio: ingreso.ingresoDirectoServicio || false,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const formatFecha = (ts: unknown) => {
    if (!ts) return "—";
    const d = ((ts as unknown) as { toDate?: () => Date }).toDate?.() ?? (ts as Date);
    return d.toLocaleString("es-HN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  };

  // Fecha (YYYY-MM-DD local) de "ayer", límite inferior de la vista en vivo.
  const limiteVivoStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  })();
  const fueraDeRangoVivo = !!fechaDesde && fechaDesde < limiteVivoStr;

  // Búsqueda de registros anteriores a ayer: una sola lectura (getDocs), no listener.
  const buscarHistoricos = async () => {
    if (!fechaDesde && !fechaHasta) return;
    setBuscandoHistoricos(true);
    try {
      const constraints: QueryConstraint[] = [];
      if (fechaDesde) constraints.push(where("creadoEn", ">=", Timestamp.fromDate(new Date(fechaDesde + "T00:00:00"))));
      if (fechaHasta) constraints.push(where("creadoEn", "<=", Timestamp.fromDate(new Date(fechaHasta + "T23:59:59"))));
      constraints.push(orderBy("creadoEn", "desc"), limit(500));
      const snap = await getDocs(query(collection(db, "control_ingresos"), ...constraints));
      setResultadosHistoricos(snap.docs.map(d => ({ id: d.id, ...d.data() } as ControlIngreso)));
    } finally {
      setBuscandoHistoricos(false);
    }
  };

  const limpiarFiltros = () => {
    setBusqueda(""); setFechaDesde(""); setFechaHasta("");
    setResultadosHistoricos(null);
  };

  const lista = (resultadosHistoricos ?? ingresos).filter(i => {
    if (busqueda) {
      const q = busqueda.toLowerCase();
      const enExp = (i.expediente?.toLowerCase() ?? "").includes(q);
      const enApe = (i.apellidos?.toLowerCase() ?? "").includes(q);
      const enNom = (i.nombres?.toLowerCase() ?? "").includes(q);
      if (!enExp && !enApe && !enNom) return false;
    }
    if (fechaDesde || fechaHasta) {
      const d = ((i.creadoEn as unknown) as { toDate?: () => Date }).toDate?.() ?? i.creadoEn;
      if (fechaDesde && d < new Date(fechaDesde + "T00:00:00")) return false;
      if (fechaHasta && d > new Date(fechaHasta + "T23:59:59")) return false;
    }
    return true;
  });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {modalInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
            <div className={`p-5 flex items-center justify-center ${modalInfo.tipo === "exito" ? "bg-green-500" : "bg-red-500"}`}>
              {modalInfo.tipo === "exito" ? (
                <CheckCircle2 size={48} className="text-white" />
              ) : (
                <X size={48} className="text-white" />
              )}
            </div>
            <div className="p-6 text-center space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {modalInfo.tipo === "exito" ? "¡Éxito!" : "Error"}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {modalInfo.mensaje}
              </p>
              <button
                type="button"
                onClick={() => setModalInfo(null)}
                className={`w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-colors ${
                  modalInfo.tipo === "exito" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-teal-50 dark:bg-[#c9a892]/15 rounded-xl flex items-center justify-center border border-teal-200 dark:border-[#c9a892]/45 flex-shrink-0">
          <ClipboardList size={17} className="text-teal-600 dark:text-[#e7c8b4]" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading leading-tight">
            Control de Ingresos
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{ingresos.length} registro(s) de ayer y hoy</p>
        </div>
      </div>

      {/* Form card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#c9a892]/25 rounded-2xl shadow-sm dark:shadow-[0_22px_70px_rgba(0,0,0,0.22)] mb-6">

        {/* Card header */}
        <div className="flex items-center gap-4 px-5 pt-5 pb-4 border-b border-slate-100 dark:border-[#c9a892]/15">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 font-heading">
              {editingId ? "Editar ingreso" : "Nuevo ingreso"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Responsable: {profile.nombre}</p>
          </div>
        </div>

        <form onSubmit={registrar} className="p-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Número de expediente <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.expediente}
                onChange={set("expediente")}
                placeholder="Ej: 123-25"
                className={inputCls}
                autoComplete="off"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Número de DUI{" "}
                <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={form.dui}
                onChange={set("dui")}
                placeholder="Ej: 12345678-9"
                className={inputCls}
                autoComplete="off"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Apellidos <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.apellidos}
                onChange={set("apellidos")}
                placeholder="Apellidos completos"
                className={inputCls}
                autoComplete="off"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Nombres <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.nombres}
                onChange={set("nombres")}
                placeholder="Nombres completos"
                className={inputCls}
                autoComplete="off"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Edad <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={form.edad}
                onChange={set("edad")}
                placeholder="Ej: 45"
                className={inputCls}
                autoComplete="off"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Género <span className="text-red-500">*</span>
              </label>
              <select
                value={form.genero}
                onChange={set("genero")}
                className={`${inputCls} appearance-none`}
              >
                <option value="">Seleccione...</option>
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Servicio <span className="text-red-500">*</span>
              </label>
              <select
                value={form.servicio}
                onChange={set("servicio")}
                className={`${inputCls} appearance-none`}
              >
                <option value="">Seleccione el servicio...</option>
                {servicios.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.ingresoDirectoServicio}
              onChange={e => setForm(prev => ({ ...prev, ingresoDirectoServicio: e.target.checked }))}
              className="h-4 w-4 mt-0.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 flex-shrink-0"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              El paciente ingresó directamente a un servicio hospitalario
            </span>
          </label>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={editingId ? cancelEdit : () => setForm(emptyForm())}
              disabled={guardando}
              className="px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {editingId ? "Cancelar" : "Limpiar"}
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 dark:bg-[var(--color-institutional-navy)] dark:hover:bg-blue-800 dark:ring-1 dark:ring-[#c9a892]/35 rounded-lg disabled:opacity-50 transition-all active:scale-[0.99]"
            >
              {guardando ? (editingId ? "Actualizando..." : "Registrando...") : (editingId ? "Actualizar ingreso" : "Registrar ingreso")}
            </button>
          </div>
        </form>
      </div>

      {/* Lista de registros */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          {resultadosHistoricos !== null ? `Resultados históricos (${lista.length})` : `Registros (${lista.length})`}
        </p>

        {/* Barra de búsqueda y fechas */}
        <div className="flex flex-wrap gap-2 mb-3 p-3 bg-slate-50 dark:bg-slate-900/80 rounded-xl border border-slate-200 dark:border-[#c9a892]/20">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Expediente o nombre..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-[#c9a892] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Desde</span>
            <DateField value={fechaDesde} onChange={setFechaDesde} placeholder="Desde" ariaLabel="Fecha desde" clearable />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Hasta</span>
            <DateField value={fechaHasta} onChange={setFechaHasta} placeholder="Hasta" ariaLabel="Fecha hasta" clearable />
          </div>
          {(busqueda || fechaDesde || fechaHasta || resultadosHistoricos !== null) && (
            <button
              onClick={limpiarFiltros}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
            >
              <X size={12} /> Limpiar
            </button>
          )}
        </div>

        {/* La vista en vivo solo cubre ayer y hoy; para fechas anteriores hay que pedirlo explícitamente */}
        {fueraDeRangoVivo && resultadosHistoricos === null && (
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-3 py-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-xs text-amber-700 dark:text-amber-400">
            <span>Ese rango incluye fechas anteriores a ayer, fuera de la vista en vivo.</span>
            <button
              onClick={buscarHistoricos}
              disabled={buscandoHistoricos}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg disabled:opacity-50 transition-colors shrink-0"
            >
              <Search size={12} /> {buscandoHistoricos ? "Buscando…" : "Buscar históricos"}
            </button>
          </div>
        )}

        <div className="space-y-2">
          {lista.length === 0 && (
            <p className="text-sm text-slate-500 py-8 text-center">
              {resultadosHistoricos !== null
                ? "Sin resultados históricos para ese rango."
                : ingresos.length === 0
                  ? "No hay ingresos registrados en las últimas 24-48 horas."
                  : "Sin resultados para los filtros aplicados."}
            </p>
          )}
          {lista.map(ingreso => (
            <div
              key={ingreso.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#c9a892]/20 rounded-xl px-4 py-3 flex items-start justify-between gap-3 hover:border-slate-300 dark:hover:border-[#c9a892]/40 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm font-mono">
                    Exp. {ingreso.expediente}
                  </span>
                  {ingreso.ingresoDirectoServicio ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded">
                      Directo
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded">
                      Triage
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">
                  {ingreso.apellidos}, {ingreso.nombres}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {ingreso.servicio}
                  {ingreso.edad != null && ` · ${ingreso.edad} años`}
                  {ingreso.genero && ` · ${ingreso.genero === "masculino" ? "Masculino" : "Femenino"}`}
                </p>
              </div>
              <div className="flex flex-col items-end shrink-0 gap-2">
                <div className="text-right">
                  <p className="text-xs text-slate-500">{formatFecha(ingreso.creadoEn)}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{ingreso.responsableIngresoNombre}</p>
                </div>
                {profile?.role === "admin" && (
                  <button
                    onClick={() => handleEdit(ingreso)}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                    title="Editar registro"
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
