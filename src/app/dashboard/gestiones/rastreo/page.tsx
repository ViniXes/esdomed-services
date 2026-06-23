"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, setDoc, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { Paciente, RastreoTS } from "@/types";
import {
  CANALES_RASTREO, CANAL_RASTREO_LABEL, ESTADO_RASTREO_COLOR, ESTADO_RASTREO_LABEL,
  habilitaSeguimiento, type CanalRastreo, type EstadoRastreo,
} from "@/lib/trabajosocial/catalogos";
import { GestionesTabs } from "../_components/GestionesTabs";
import { DateField } from "@/components/ui/DateField";
import {
  AlertTriangle, CheckCircle2, Lock, Loader2, Radar, Search, X,
} from "lucide-react";

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";
const selectCls =
  "w-full appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer";
const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";

const ESTADOS: EstadoRastreo[] = ["en_gestion", "contactado", "no_efectivo", "alta", "defuncion", "no_aplica"];

const hoyStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};
const nombrePac = (p: Paciente) => `${p.apellidos}, ${p.nombres}`;

type Filtro = "pendientes" | "contactados" | "no_efectivo" | "todos";

export default function RastreoPage() {
  const { profile } = useAuth();

  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [rastreos, setRastreos] = useState<Map<string, RastreoTS>>(new Map());
  const [loading, setLoading] = useState(true);
  const [permissionError, setPermissionError] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("pendientes");

  // Modal de captura
  const [sel, setSel] = useState<Paciente | null>(null);
  const [estado, setEstado] = useState<EstadoRastreo>("en_gestion");
  const [canales, setCanales] = useState<CanalRastreo[]>([]);
  const [familiar, setFamiliar] = useState("");
  const [parentesco, setParentesco] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [dui, setDui] = useState<"menor" | "no_dui" | null>(null);
  const [fechaContacto, setFechaContacto] = useState(hoyStr());
  const [hora, setHora] = useState("");
  const [duracion, setDuracion] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ tipo: "success" | "error"; msg: string } | null>(null);

  // Pacientes activos creados por ESDOMED — origen del worklist de rastreo.
  useEffect(() => {
    const q = query(collection(db, "pacientes"), where("estado", "==", "activo"));
    return onSnapshot(q, (s) => {
      setPacientes(s.docs.map((d) => ({ id: d.id, ...d.data() } as Paciente)));
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  // Rastreos existentes (un doc por expediente).
  useEffect(() => {
    return onSnapshot(collection(db, "rastreos_ts"), (s) => {
      setPermissionError(false);
      const m = new Map<string, RastreoTS>();
      s.docs.forEach((d) => m.set(d.id, { id: d.id, ...d.data() } as RastreoTS));
      setRastreos(m);
    }, (err) => { if (err.code === "permission-denied") setPermissionError(true); });
  }, []);

  const estadoDe = (p: Paciente): EstadoRastreo | "pendiente" =>
    rastreos.get(p.expediente)?.estado ?? "pendiente";

  const stats = useMemo(() => {
    let pend = 0, cont = 0, noef = 0;
    for (const p of pacientes) {
      const e = estadoDe(p);
      if (e === "pendiente" || e === "en_gestion") pend++;
      else if (e === "contactado") cont++;
      else if (e === "no_efectivo") noef++;
    }
    return { total: pacientes.length, pend, cont, noef };
  }, [pacientes, rastreos]);

  const lista = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return pacientes
      .filter((p) => {
        const e = estadoDe(p);
        if (filtro === "pendientes" && !(e === "pendiente" || e === "en_gestion")) return false;
        if (filtro === "contactados" && e !== "contactado") return false;
        if (filtro === "no_efectivo" && e !== "no_efectivo") return false;
        if (!t) return true;
        return (
          p.expediente.toLowerCase().includes(t) ||
          nombrePac(p).toLowerCase().includes(t) ||
          (p.servicioActual ?? "").toLowerCase().includes(t)
        );
      })
      .sort((a, b) => nombrePac(a).localeCompare(nombrePac(b)));
  }, [pacientes, rastreos, busqueda, filtro]);

  const abrir = (p: Paciente) => {
    const r = rastreos.get(p.expediente);
    setSel(p);
    setEstado(r?.estado ?? "en_gestion");
    setCanales(r?.canalesIntentados ?? []);
    setFamiliar(r?.familiarNombre ?? p.responsable?.nombre ?? "");
    setParentesco(r?.parentesco ?? p.responsable?.parentesco ?? "");
    setTelefono(r?.telefono ?? p.responsable?.telefono ?? p.telefono ?? "");
    setDireccion(r?.direccionActual ?? p.responsable?.direccion ?? p.direccion ?? "");
    setDui(r?.duiPaciente ?? null);
    setFechaContacto(r?.fechaContacto ?? hoyStr());
    setHora(r?.horaContacto ?? "");
    setDuracion(r?.duracionMin != null ? String(r.duracionMin) : "");
    setNotas(r?.notas ?? "");
  };

  const toggleCanal = (c: CanalRastreo) =>
    setCanales((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const guardar = async () => {
    if (!sel || !profile) return;
    setSaving(true);
    try {
      const existe = rastreos.has(sel.expediente);
      const data: Record<string, unknown> = {
        expediente: sel.expediente,
        pacienteId: sel.id ?? null,
        pacienteNombre: nombrePac(sel),
        genero: sel.genero ?? null,
        servicio: sel.servicioActual ?? null,
        cama: sel.camaActual ?? null,
        vinculadoPadron: true,
        familiarNombre: familiar.trim() || null,
        parentesco: parentesco.trim() || null,
        telefono: telefono.trim() || null,
        direccionActual: direccion.trim() || null,
        duiPaciente: dui,
        estado,
        canalesIntentados: canales,
        intentos: canales.length,
        notas: notas.trim() || null,
        trabajadoraId: profile.uid,
        trabajadoraNombre: profile.nombre,
        actualizadoEn: Timestamp.now(),
        fechaContacto: estado === "contactado" ? (fechaContacto || hoyStr()) : null,
        horaContacto: estado === "contactado" ? (hora.trim() || null) : null,
        duracionMin: estado === "contactado" && duracion ? Number(duracion) : null,
        ...(existe ? {} : { creadoEn: Timestamp.now() }),
      };
      await setDoc(doc(db, "rastreos_ts", sel.expediente), data, { merge: true });
      setToast({ tipo: "success", msg: "Rastreo actualizado" });
      setSel(null);
    } catch {
      setToast({ tipo: "error", msg: "No se pudo guardar el rastreo" });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const Badge = ({ e }: { e: EstadoRastreo | "pendiente" }) =>
    e === "pendiente" ? (
      <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border text-slate-500 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
        Sin rastrear
      </span>
    ) : (
      <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${ESTADO_RASTREO_COLOR[e]}`}>
        {ESTADO_RASTREO_LABEL[e]}
      </span>
    );

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1c1e4d] dark:text-[#c9a892] mb-1">
          <Radar size={13} /> Trabajo Social
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Rastreo de pacientes</h1>
        <p className="text-xs text-slate-500 mt-0.5">Localiza al paciente y su familiar — paso previo obligatorio al seguimiento</p>
      </div>

      <GestionesTabs />

      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer los rastreos. Pide al administrador que despliegue la regla de la colección <strong>rastreos_ts</strong>.
        </div>
      )}

      {/* Regla de negocio */}
      <div className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>Un paciente solo pasa a <strong>seguimiento / visita</strong> cuando su rastreo está <strong>Contactado</strong>. Esta lista se deriva de los pacientes activos creados por ESDOMED.</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { k: "todos" as Filtro, label: "Activos", n: stats.total, cls: "text-slate-800 dark:text-slate-200" },
          { k: "pendientes" as Filtro, label: "Por contactar", n: stats.pend, cls: "text-amber-600 dark:text-amber-400" },
          { k: "contactados" as Filtro, label: "Contactados", n: stats.cont, cls: "text-emerald-600 dark:text-emerald-400" },
          { k: "no_efectivo" as Filtro, label: "No efectivos", n: stats.noef, cls: "text-rose-600 dark:text-rose-400" },
        ].map((s) => (
          <button
            key={s.k}
            onClick={() => setFiltro(s.k)}
            className={`text-left bg-white dark:bg-slate-900 border rounded-2xl px-4 py-3 transition-colors ${
              filtro === s.k ? "border-blue-400 dark:border-blue-700 ring-1 ring-blue-400/40" : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
            }`}
          >
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{s.label}</p>
            <p className={`text-2xl font-bold font-heading tabular-nums ${s.cls}`}>{s.n}</p>
          </button>
        ))}
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por expediente, paciente o servicio…"
          className={inputCls + " pl-9"}
        />
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-sm text-slate-400 py-16 text-center">Cargando pacientes activos…</p>
      ) : lista.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Radar size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No hay pacientes que coincidan con el filtro.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
          {lista.map((p) => {
            const e = estadoDe(p);
            const ok = habilitaSeguimiento(e === "pendiente" ? undefined : e);
            return (
              <button
                key={p.id}
                onClick={() => abrir(p)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[11px] text-slate-500">{p.expediente}</span>
                    <Badge e={e} />
                    {ok ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 size={11} /> Habilita seguimiento
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                        <Lock size={11} /> Bloqueado para seguimiento
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 truncate mt-0.5">{nombrePac(p)}</p>
                  <p className="text-xs text-slate-500">
                    {p.servicioActual || "—"}{p.camaActual ? ` · Cama ${p.camaActual}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {e === "pendiente" ? "Rastrear" : "Actualizar"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Modal de captura */}
      {sel && (
        <div className="fixed inset-0 z-50 flex justify-center items-start pt-8 px-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden mb-10">
            <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="min-w-0">
                <p className="font-mono text-[11px] text-slate-500">{sel.expediente}</p>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate">{nombrePac(sel)}</h2>
                <p className="text-xs text-slate-500">{sel.servicioActual || "—"}{sel.camaActual ? ` · Cama ${sel.camaActual}` : ""}</p>
              </div>
              <button onClick={() => setSel(null)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors shrink-0">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Datos de contacto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Familiar / responsable</label>
                  <input value={familiar} onChange={(e) => setFamiliar(e.target.value)} className={inputCls} placeholder="Nombre del familiar" />
                </div>
                <div>
                  <label className={labelCls}>Parentesco</label>
                  <input value={parentesco} onChange={(e) => setParentesco(e.target.value)} className={inputCls} placeholder="Hija, esposo…" />
                </div>
                <div>
                  <label className={labelCls}>Teléfono</label>
                  <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inputCls} placeholder="0000-0000" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Dirección actual</label>
                  <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={inputCls} placeholder="Dirección del paciente / familia" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Documento del paciente</label>
                  <select value={dui ?? ""} onChange={(e) => setDui((e.target.value || null) as "menor" | "no_dui" | null)} className={selectCls}>
                    <option value="">Tiene DUI</option>
                    <option value="menor">Menor de edad</option>
                    <option value="no_dui">Nunca emitió DUI</option>
                  </select>
                </div>
              </div>

              {/* Canales intentados */}
              <div>
                <label className={labelCls}>Canales usados para localizar</label>
                <div className="flex flex-wrap gap-2">
                  {CANALES_RASTREO.map((c) => {
                    const on = canales.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleCanal(c)}
                        className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                          on
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-300"
                        }`}
                      >
                        {CANAL_RASTREO_LABEL[c]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Estado */}
              <div>
                <label className={labelCls}>Estado del rastreo</label>
                <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoRastreo)} className={selectCls}>
                  {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_RASTREO_LABEL[e]}</option>)}
                </select>
                {estado === "contactado" ? (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Habilitará el seguimiento de este paciente.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                    <Lock size={12} /> Mientras no esté "Contactado", el paciente no pasa a seguimiento.
                  </p>
                )}
              </div>

              {/* Datos del contacto efectivo */}
              {estado === "contactado" && (
                <div className="grid grid-cols-3 gap-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 rounded-xl p-3">
                  <div>
                    <label className={labelCls}>Fecha</label>
                    <DateField value={fechaContacto} onChange={setFechaContacto} placeholder="Fecha" ariaLabel="Fecha de contacto" />
                  </div>
                  <div>
                    <label className={labelCls}>Hora</label>
                    <input value={hora} onChange={(e) => setHora(e.target.value)} placeholder="10:30" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Duración (min)</label>
                    <input type="number" min={0} inputMode="numeric" value={duracion} onChange={(e) => setDuracion(e.target.value)} placeholder="—" className={inputCls} />
                  </div>
                </div>
              )}

              {/* Notas */}
              <div>
                <label className={labelCls}>Notas del proceso <span className="text-slate-400 normal-case font-normal">(paso a paso, dificultades)</span></label>
                <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} className={inputCls + " resize-y"} placeholder="Detalle de los intentos de contacto…" />
              </div>
            </div>

            <div className="px-6 pb-6 flex justify-end gap-3">
              <button onClick={() => setSel(null)} disabled={saving} className="px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={guardar} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl transition-colors">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Guardar rastreo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[210] flex items-center gap-2.5 rounded-xl border px-4 py-3 shadow-xl text-sm font-medium bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
          style={{ borderLeftWidth: 4, borderLeftColor: toast.tipo === "success" ? "#10b981" : "#f43f5e" }}>
          {toast.tipo === "success" ? <CheckCircle2 size={16} className="text-emerald-500" /> : <AlertTriangle size={16} className="text-rose-500" />}
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
