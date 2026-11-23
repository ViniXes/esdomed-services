"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Search, Undo2, UserPen, Users, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { veActualizacionesEquipoCE } from "@/lib/accesoConsultaExterna";
import { ActualizacionesEquipo } from "@/components/consultaExterna/ActualizacionesEquipo";
import { claveTexto } from "@/lib/consultaExterna/expedientesCreados";
import { TIPOS_ACTUALIZACION, type PacientePool, type TipoActualizacion } from "@/lib/consultaExterna/actualizaciones";

// Registro de actualizaciones de datos hechas en el SIS (documento de
// identificación, responsable). Se buscan los pacientes de un día (citados y
// expedientes creados) o por expediente, y se registra quién y qué actualizó.
// Services no cambia los datos: solo cuenta para la productividad.

type Mia = { expediente: string; pacienteNombre: string; tipos: TipoActualizacion[]; hechoEn: number | null };

const hoyISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
const inputCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
const corto = (t: TipoActualizacion) => TIPOS_ACTUALIZACION.find((x) => x.id === t)?.corto ?? t;
const hora = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" }) : "");

export function ActualizacionesPacientes() {
  const { user, profile } = useAuth();
  // El admin abre en lo que registró cada persona; las demás cuentas solo registran.
  const veEquipo = veActualizacionesEquipoCE(profile);
  const [vistaElegida, setVistaElegida] = useState<"equipo" | "registrar" | null>(null);
  const vista = veEquipo ? vistaElegida ?? "equipo" : "registrar";
  const [fecha, setFecha] = useState(hoyISO);
  const [texto, setTexto] = useState("");
  const [pacientes, setPacientes] = useState<PacientePool[]>([]);
  const [mias, setMias] = useState<Mia[]>([]);
  const [usadas, setUsadas] = useState(0);
  const [tope, setTope] = useState(100);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [buscado, setBuscado] = useState("");
  const [encontrado, setEncontrado] = useState<PacientePool | null | undefined>(undefined);
  const [buscando, setBuscando] = useState(false);
  const [abierto, setAbierto] = useState<PacientePool | null>(null);
  const [tipos, setTipos] = useState<TipoActualizacion[]>([]);
  const [guardando, setGuardando] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const llamar = async (url: string, init?: RequestInit) => {
    if (!user) throw new Error("Sesión no iniciada.");
    const r = await fetch(url, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "No se pudo completar.");
    return data;
  };

  const cargar = async (f = fecha) => {
    if (!user) return;
    setCargando(true); setError("");
    try {
      const data = await llamar(`/api/consulta-externa/actualizaciones?fecha=${f}`);
      setPacientes(data.pacientes ?? []);
      setMias(data.mias ?? []);
      setUsadas(data.usadas ?? 0);
      setTope(data.tope ?? 100);
    } catch (e) {
      setPacientes([]);
      setError(e instanceof Error ? e.message : "No se pudo cargar la lista.");
    } finally { setCargando(false); }
  };

  useEffect(() => {
    const t = window.setTimeout(() => { void cargar(); }, 0);
    return () => window.clearTimeout(t);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const buscarExpediente = async () => {
    const exp = buscado.trim();
    if (!exp) return;
    setBuscando(true); setError("");
    try {
      const data = await llamar(`/api/consulta-externa/actualizaciones?expediente=${encodeURIComponent(exp)}`);
      setEncontrado(data.paciente ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo buscar.");
    } finally { setBuscando(false); }
  };

  const miasPorExp = useMemo(() => new Map(mias.map((m) => [m.expediente, m])), [mias]);
  const filtrados = useMemo(() => {
    const k = claveTexto(texto);
    return pacientes.filter((p) => !k || claveTexto(`${p.expediente} ${p.nombre}`).includes(k));
  }, [pacientes, texto]);
  const lleno = usadas >= tope;

  const abrir = (p: PacientePool) => {
    setAbierto(p);
    setTipos(miasPorExp.get(p.expediente)?.tipos ?? []);
    setAviso("");
    // El panel queda arriba de la lista: se lleva la vista hasta él.
    window.setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  };

  const guardar = async () => {
    if (!abierto || tipos.length === 0) return;
    setGuardando(true); setError("");
    try {
      const data = await llamar("/api/consulta-externa/actualizaciones", {
        method: "POST",
        body: JSON.stringify({ expediente: abierto.expediente, nombre: abierto.nombre, tipos }),
      });
      setUsadas(data.usadas ?? usadas);
      const previa = miasPorExp.get(abierto.expediente);
      const nueva: Mia = { expediente: abierto.expediente, pacienteNombre: abierto.nombre, tipos, hechoEn: previa?.hechoEn ?? Date.now() };
      setMias((m) => [nueva, ...m.filter((x) => x.expediente !== abierto.expediente)]);
      setAviso(data.nueva ? `Registrada la actualización de ${abierto.nombre || abierto.expediente}.` : "Se corrigió lo registrado hoy (no cuenta otra vez).");
      setAbierto(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar.");
    } finally { setGuardando(false); }
  };

  const deshacer = async (m: Mia) => {
    setError("");
    try {
      const data = await llamar(`/api/consulta-externa/actualizaciones?expediente=${encodeURIComponent(m.expediente)}`, { method: "DELETE" });
      setUsadas(data.usadas ?? Math.max(0, usadas - 1));
      setMias((lista) => lista.filter((x) => x.expediente !== m.expediente));
      setAviso(`Se quitó el registro de ${m.pacienteNombre || m.expediente}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo deshacer.");
    }
  };

  const botonRegistrar = (p: PacientePool) => {
    const ya = miasPorExp.get(p.expediente);
    if (ya) {
      return (
        <button type="button" onClick={() => abrir(p)}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          <Check size={13} />Registrada hoy: {ya.tipos.map(corto).join(" y ")}
        </button>
      );
    }
    return (
      <button type="button" onClick={() => abrir(p)} disabled={lleno}
        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40">
        <UserPen size={13} />Registrar actualización
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold text-slate-900 dark:text-slate-100">Actualizaciones de datos en el SIS</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
            {vista === "equipo"
              ? "Cuántos pacientes registró cada persona como actualizados en el SIS: hoy, otro día o en un rango de fechas."
              : "Registra aquí cada paciente al que le actualizaste datos en el SIS. Services no cambia los datos del paciente: solo guarda quién, cuándo y qué se actualizó, para la productividad. Busca por día (citados y expedientes creados ese día) o por número de expediente."}
          </p>
        </div>
        {vista === "registrar" && (
          <div className={`rounded-xl border px-4 py-2 text-right ${lleno ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}>
            <p className="text-[11px] font-medium uppercase text-slate-500">Mis registros de hoy</p>
            <p className="font-heading text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{usadas}<span className="text-sm font-medium text-slate-400"> / {tope}</span></p>
          </div>
        )}
      </div>

      {veEquipo && (
        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800" role="tablist">
          {([["equipo", "Del equipo", Users], ["registrar", "Registrar", UserPen]] as const).map(([id, label, Icono]) => (
            <button key={id} type="button" role="tab" aria-selected={vista === id} onClick={() => setVistaElegida(id)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-semibold ${vista === id
                ? "border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}>
              <Icono size={15} />{label}
            </button>
          ))}
        </div>
      )}

      {vista === "equipo" ? <ActualizacionesEquipo /> : (<>
      {lleno && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Llegaste al máximo de {tope} actualizaciones por día. Puedes corregir o deshacer las de hoy.
        </p>
      )}
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{error}</p>}
      {aviso && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">{aviso}</p>}

      {abierto && (
        <div ref={panelRef} className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{abierto.nombre || "Sin nombre"}</p>
              <p className="font-mono text-xs text-slate-500">{abierto.expediente}</p>
            </div>
            <button type="button" onClick={() => setAbierto(null)} aria-label="Cerrar" className="rounded-lg p-1 text-slate-500 hover:bg-white dark:hover:bg-slate-800"><X size={16} /></button>
          </div>
          <p className="mt-3 text-xs font-semibold text-slate-600 dark:text-slate-300">¿Qué actualizaste en el SIS?</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            {TIPOS_ACTUALIZACION.map((t) => {
              const marcado = tipos.includes(t.id);
              return (
                <label key={t.id} className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${marcado ? "border-blue-400 bg-white text-blue-800 dark:border-blue-700 dark:bg-slate-900 dark:text-blue-200" : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}>
                  <input type="checkbox" checked={marcado} className="h-4 w-4 accent-blue-600"
                    onChange={() => setTipos((x) => (marcado ? x.filter((y) => y !== t.id) : [...x, t.id]))} />
                  {t.label}
                </label>
              );
            })}
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={() => void guardar()} disabled={guardando || tipos.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
              {guardando ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}Guardar
            </button>
          </div>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Buscar por expediente</p>
        <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void buscarExpediente(); }}>
          <input value={buscado} onChange={(e) => { setBuscado(e.target.value); setEncontrado(undefined); }} placeholder="Número de expediente"
            className={`w-56 font-mono ${inputCls}`} />
          <button type="submit" disabled={buscando || !buscado.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            {buscando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}Buscar
          </button>
        </form>
        {encontrado === null && <p className="mt-2 text-sm text-slate-500">Ese expediente no está en el padrón de services ni en las citas cargadas.</p>}
        {encontrado && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{encontrado.nombre}</p>
              <p className="font-mono text-xs text-slate-500">{encontrado.expediente} · {encontrado.origen}</p>
            </div>
            {botonRegistrar(encontrado)}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50">
          <label className="text-xs text-slate-500">Pacientes del día
            <input type="date" value={fecha} max={hoyISO()} onChange={(e) => { if (e.target.value) { setFecha(e.target.value); void cargar(e.target.value); } }}
              className={`mt-1 block ${inputCls}`} />
          </label>
          <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Filtrar por expediente o nombre"
            className={`min-w-[14rem] flex-1 ${inputCls}`} />
          <span className="pb-2 text-xs font-semibold text-slate-500">{cargando ? "Cargando…" : `${filtrados.length} pacientes`}</span>
        </div>
        {!cargando && filtrados.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">No hay citas cargadas ni expedientes creados ese día.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-500 dark:border-slate-800">
                  <th className="px-4 py-2">Expediente</th><th className="px-4 py-2">Paciente</th><th className="px-4 py-2">Viene de</th><th className="px-4 py-2 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtrados.map((p) => (
                  <tr key={p.expediente}>
                    <td className="px-4 py-2 font-mono text-xs">{p.expediente}</td>
                    <td className="px-4 py-2 text-slate-800 dark:text-slate-100">{p.nombre || "Sin nombre"}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{p.origen}</td>
                    <td className="px-4 py-2 text-right">{botonRegistrar(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {mias.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/50">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Registradas hoy por mí</p>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {mias.map((m) => (
              <li key={m.expediente} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <div>
                  <p className="text-sm text-slate-800 dark:text-slate-100">{m.pacienteNombre || "Sin nombre"}</p>
                  <p className="text-xs text-slate-500"><span className="font-mono">{m.expediente}</span> · {m.tipos.map(corto).join(" y ")} · {hora(m.hechoEn)}</p>
                </div>
                <button type="button" onClick={() => void deshacer(m)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  <Undo2 size={13} />Deshacer
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      </>)}
    </div>
  );
}
