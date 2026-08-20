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
import { Ambulance } from "lucide-react";
import { Icon } from "@iconify/react";
import documentAdd from "@iconify-icons/solar/document-add-linear";
import calendar from "@iconify-icons/solar/calendar-minimalistic-linear";
import checkCircle from "@iconify-icons/solar/check-circle-linear";
import magnifer from "@iconify-icons/solar/magnifer-linear";
import closeCircle from "@iconify-icons/solar/close-circle-linear";
import pen from "@iconify-icons/solar/pen-2-linear";

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
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-600 dark:focus:bg-slate-800";

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

const FILAS_POR_PAGINA = 10;

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
  const [pagina, setPagina] = useState(1);
  const [detalleIngreso, setDetalleIngreso] = useState<ControlIngreso | null>(null);

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

  // Editar está abierto a todo el personal ESDOMED (operativo y asistentes) y admin;
  // las reglas de Firestore ya permiten el update a estos mismos roles.
  const puedeEditar = profile.role === "esdomed" || profile.role === "asistente_esdomed" || profile.role === "admin";

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
      setPagina(1);
    } finally {
      setBuscandoHistoricos(false);
    }
  };

  const limpiarFiltros = () => {
    setBusqueda(""); setFechaDesde(""); setFechaHasta("");
    setResultadosHistoricos(null);
    setPagina(1);
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
  const totalPaginas = Math.max(1, Math.ceil(lista.length / FILAS_POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const inicioPagina = (paginaActual - 1) * FILAS_POR_PAGINA;
  const registrosPagina = lista.slice(inicioPagina, inicioPagina + FILAS_POR_PAGINA);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      {modalInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
            <div className={`p-5 flex items-center justify-center ${modalInfo.tipo === "exito" ? "bg-green-500" : "bg-red-500"}`}>
              {modalInfo.tipo === "exito" ? (
                <Icon icon={checkCircle} width={54} className="text-white" />
              ) : (
                <Icon icon={closeCircle} width={54} className="text-white" />
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

      {detalleIngreso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={() => setDetalleIngreso(null)}>
          <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" role="dialog" aria-modal="true" aria-label="Detalle del ingreso" onClick={e => e.stopPropagation()}>
            <div className="relative bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-5 py-5 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/40">
              <button type="button" onClick={() => setDetalleIngreso(null)} className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="Cerrar detalle"><Icon icon={closeCircle} width={20} /></button>
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#4f5ee8] text-white shadow-lg shadow-blue-500/20"><Icon icon={documentAdd} width={24} /></div>
                <div className="min-w-0 pr-8">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">Detalle del ingreso</p>
                  <h2 className="mt-1 font-heading text-lg font-bold text-slate-900 dark:text-slate-100">{detalleIngreso.apellidos}, {detalleIngreso.nombres}</h2>
                  <span className="mt-2 inline-block rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-sm font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">Exp. {detalleIngreso.expediente}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-5 p-5 sm:grid-cols-2">
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Paciente</h3>
                <dl className="space-y-2.5 text-sm">
                  <div className="flex items-start justify-between gap-3"><dt className="text-slate-500">DUI</dt><dd className="text-right font-mono text-slate-800 dark:text-slate-200">{detalleIngreso.dui || "—"}</dd></div>
                  <div className="flex items-start justify-between gap-3"><dt className="text-slate-500">Edad</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{detalleIngreso.edad != null ? `${detalleIngreso.edad} años` : "—"}</dd></div>
                  <div className="flex items-start justify-between gap-3"><dt className="text-slate-500">Género</dt><dd className="font-medium capitalize text-slate-800 dark:text-slate-200">{detalleIngreso.genero ?? "—"}</dd></div>
                </dl>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Atención</h3>
                <dl className="space-y-2.5 text-sm">
                  <div className="flex items-start justify-between gap-3"><dt className="text-slate-500">Servicio</dt><dd className="max-w-[65%] text-right font-medium text-slate-800 dark:text-slate-200">{detalleIngreso.servicio}</dd></div>
                  <div className="flex items-start justify-between gap-3"><dt className="text-slate-500">Origen</dt><dd><span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${detalleIngreso.ingresoDirectoServicio ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"}`}>{detalleIngreso.ingresoDirectoServicio ? "Directo" : "Triage"}</span></dd></div>
                  <div className="flex items-start justify-between gap-3"><dt className="text-slate-500">Registro</dt><dd className="text-right font-medium text-slate-800 dark:text-slate-200">{formatFecha(detalleIngreso.creadoEn)}</dd></div>
                </dl>
              </section>
              <section className="border-t border-slate-100 pt-4 sm:col-span-2 dark:border-slate-800">
                <p className="text-xs text-slate-500">Registrado por <span className="font-medium text-slate-700 dark:text-slate-300">{detalleIngreso.responsableIngresoNombre || "—"}</span></p>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-white via-blue-50/70 to-indigo-50/80 px-5 py-5 shadow-sm dark:border-blue-900/60 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/40 md:px-6">
        <div className="absolute -right-8 -top-12 h-36 w-36 rounded-full bg-indigo-200/35 blur-2xl dark:bg-indigo-500/10" />
        <div className="absolute bottom-0 right-28 h-20 w-20 rounded-full bg-cyan-200/35 blur-xl dark:bg-cyan-500/10" />
        <div className="relative flex items-center gap-4">
          <div className="flex items-center gap-3.5">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#2b8ca8] to-[#1a4e70] text-white shadow-lg shadow-blue-500/20">
              <Ambulance size={25} strokeWidth={2.1} />
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">Admisión ESDOMED</p>
              <h1 className="font-heading text-xl font-bold leading-tight text-slate-900 dark:text-slate-100 md:text-2xl">Control de ingresos</h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Registra pacientes y consulta los ingresos recientes en tiempo real</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.45fr)]">
      {/* Form card */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-5">

        {/* Card header */}
        <div className="flex items-center gap-3 bg-gradient-to-r from-blue-50/80 via-white to-indigo-50/60 px-5 py-4 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/60">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300"><Icon icon={documentAdd} width={21} /></div>
          <div className="min-w-0">
            <p className="font-heading text-sm font-bold text-slate-900 dark:text-slate-100">
              {editingId ? "Editar ingreso" : "Nuevo ingreso"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Responsable: {profile.nombre}</p>
          </div>
        </div>

        <form onSubmit={registrar} className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
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

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition-colors hover:border-blue-200 hover:bg-blue-50/50 dark:border-slate-700 dark:bg-slate-800/70 dark:hover:border-blue-900 dark:hover:bg-blue-950/20">
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

          <div className="flex gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={editingId ? cancelEdit : () => setForm(emptyForm())}
              disabled={guardando}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              {editingId ? "Cancelar" : "Limpiar"}
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex-1 rounded-xl bg-[#4f5ee8] py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-500/25 transition-all hover:bg-[#5b6bf0] active:scale-[0.99] disabled:opacity-50"
            >
              {guardando ? (editingId ? "Actualizando..." : "Registrando...") : (editingId ? "Actualizar ingreso" : "Registrar ingreso")}
            </button>
          </div>
        </form>
      </div>

      {/* Lista de registros */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="bg-gradient-to-r from-blue-50/80 via-white to-indigo-50/60 px-4 py-3.5 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/60">
          <div className="mb-3 flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300"><Icon icon={calendar} width={18} /></div>
            <div className="min-w-0 flex-1">
              <p className="font-heading text-sm font-bold text-slate-900 dark:text-slate-100">{resultadosHistoricos !== null ? "Resultados históricos" : "Ingresos de ayer y hoy"}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{lista.length} registro(s) mostrados</p>
            </div>
          </div>

        {/* Barra de búsqueda y fechas */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Icon icon={magnifer} width={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Expediente o nombre..."
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Desde</span>
            <DateField value={fechaDesde} onChange={value => { setFechaDesde(value); setPagina(1); }} placeholder="Desde" ariaLabel="Fecha desde" clearable />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Hasta</span>
            <DateField value={fechaHasta} onChange={value => { setFechaHasta(value); setPagina(1); }} placeholder="Hasta" ariaLabel="Fecha hasta" clearable />
          </div>
          {(busqueda || fechaDesde || fechaHasta || resultadosHistoricos !== null) && (
            <button
              onClick={limpiarFiltros}
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-500 transition-colors hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:hover:text-slate-100"
            >
              <Icon icon={closeCircle} width={15} /> Limpiar
            </button>
          )}
        </div>
        </div>

        {/* La vista en vivo solo cubre ayer y hoy; para fechas anteriores hay que pedirlo explícitamente */}
        {fueraDeRangoVivo && resultadosHistoricos === null && (
          <div className="m-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
            <span>Ese rango incluye fechas anteriores a ayer, fuera de la vista en vivo.</span>
            <button
              onClick={buscarHistoricos}
              disabled={buscandoHistoricos}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
            >
              <Icon icon={magnifer} width={15} /> {buscandoHistoricos ? "Buscando…" : "Buscar históricos"}
            </button>
          </div>
        )}

        <div className="overflow-hidden">
          {lista.length === 0 && (
            <p className="text-sm text-slate-500 py-8 text-center">
              {resultadosHistoricos !== null
                ? "Sin resultados históricos para ese rango."
                : ingresos.length === 0
                  ? "No hay ingresos registrados en las últimas 24-48 horas."
                  : "Sin resultados para los filtros aplicados."}
            </p>
          )}
          {lista.length > 0 && (
            <>
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="w-[26%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-4">Expediente</th>
                  <th className="w-[42%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-4">Paciente</th>
                  <th className="w-[32%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-4">Atención</th>
                  {puedeEditar && <th className="w-11 px-2 py-3" aria-label="Acciones" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {registrosPagina.map(ingreso => (
                  <tr key={ingreso.id} onClick={() => setDetalleIngreso(ingreso)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetalleIngreso(ingreso); } }} tabIndex={0} role="button" aria-label={`Ver detalle del expediente ${ingreso.expediente}`} className="cursor-pointer transition-colors hover:bg-blue-50/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-slate-800/60">
                    <td className="px-3 py-3 sm:px-4">
                      <span className="inline-block max-w-full truncate rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-sm font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">{ingreso.expediente}</span>
                      <p className="mt-1 truncate text-[11px] text-slate-500" title={formatFecha(ingreso.creadoEn)}>{formatFecha(ingreso.creadoEn)}</p>
                    </td>
                    <td className="px-3 py-3 sm:px-4">
                      <p className="truncate font-medium text-slate-900 dark:text-slate-100" title={`${ingreso.apellidos}, ${ingreso.nombres}`}>{ingreso.apellidos}, {ingreso.nombres}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{ingreso.edad != null && `${ingreso.edad} años`}{ingreso.genero && ` · ${ingreso.genero === "masculino" ? "Masculino" : "Femenino"}`}</p>
                    </td>
                    <td className="px-3 py-3 sm:px-4">
                      <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200" title={ingreso.servicio}>{ingreso.servicio}</p>
                      <span className={`mt-1 inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${ingreso.ingresoDirectoServicio ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"}`}>{ingreso.ingresoDirectoServicio ? "Directo" : "Triage"}</span>
                    </td>
                    {puedeEditar && (
                      <td className="px-2 py-3 text-right">
                        <button onClick={e => { e.stopPropagation(); handleEdit(ingreso); }} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30" title="Editar registro" aria-label="Editar registro"><Icon icon={pen} width={16} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-3 py-3 dark:border-slate-800 sm:px-4">
              <p className="text-xs text-slate-500">Mostrando {inicioPagina + 1}–{Math.min(inicioPagina + FILAS_POR_PAGINA, lista.length)} de {lista.length}</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={paginaActual === 1} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">Anterior</button>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{paginaActual} / {totalPaginas}</span>
                <button type="button" onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas} className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900">Siguiente</button>
              </div>
            </div>
            </>
          )}
        </div>
      </div>

      </div>
    </div>
  );
}
