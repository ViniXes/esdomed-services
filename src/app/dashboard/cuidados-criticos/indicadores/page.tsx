"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { Activity, AlertCircle, Calculator, Save } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { puedeVerIndicadoresCuidadosCriticos } from "@/lib/accesoCuidadosCriticos";
import { CAMAS_POR_SERVICIO } from "@/lib/servicios";
import { serviciosPorTipoMedico } from "@/lib/cuidadosCriticos";
import {
  calcularDatosBaseCuidadosCriticos,
  calcularIndicadoresCuidadosCriticos,
  configDiasHabilesIndicadoresId,
  diasHabilesOficiales,
  MESES_INDICADORES,
  type DatoBaseCuidadosCriticos,
  type IndicadorCuidadosCriticos,
} from "@/lib/indicadoresCuidadosCriticos";
import type { ConfigIndicadoresCuidadosCriticos, FichaCuidadosCriticos } from "@/types";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const SERVICIOS_CRITICOS = serviciosPorTipoMedico("uci_ucin");

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const timestamp = value as { toDate?: () => Date };
  return timestamp.toDate?.() ?? new Date(value as string);
}

export default function IndicadoresCuidadosCriticosPage() {
  const { user, profile, loading } = useAuth();
  const fecha = new Date();
  const [fichas, setFichas] = useState<FichaCuidadosCriticos[]>([]);
  const [configs, setConfigs] = useState<ConfigIndicadoresCuidadosCriticos[]>([]);
  const [anio, setAnio] = useState(fecha.getFullYear());
  const [mes, setMes] = useState(fecha.getMonth() + 1);
  const [servicio, setServicio] = useState("todos");
  const [diasHabiles, setDiasHabiles] = useState("");
  const [editandoDiasHabiles, setEditandoDiasHabiles] = useState(false);
  const [vistaTabla, setVistaTabla] = useState<"indicadores" | "datos">("indicadores");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const puedeVer = puedeVerIndicadoresCuidadosCriticos(profile);

  useEffect(() => {
    if (!puedeVer) return;
    return onSnapshot(collection(db, "fichas_cuidados_criticos"), snap => {
      const docs = snap.docs.map(item => ({ id: item.id, ...item.data() } as FichaCuidadosCriticos));
      docs.sort((a, b) => (toDate(b.actualizadoEn)?.getTime() ?? 0) - (toDate(a.actualizadoEn)?.getTime() ?? 0));
      setFichas(docs);
    });
  }, [puedeVer]);

  useEffect(() => {
    if (!puedeVer) return;
    return onSnapshot(query(collection(db, "config_indicadores_cuidados_criticos"), where("anio", "==", anio)), snap => {
      setConfigs(snap.docs.map(item => ({ id: item.id, ...item.data() } as ConfigIndicadoresCuidadosCriticos)));
    });
  }, [anio, puedeVer]);

  const configDiasHabiles = configs.find(item => item.anio === anio && item.mes === mes && item.servicio === "__periodo__") ?? null;
  const diasHabilesOficial = diasHabilesOficiales(anio, mes);
  const diasHabilesParaCalculo = diasHabilesOficial ?? configDiasHabiles?.diasHabiles ?? 0;
  const camasSistema = servicio !== "todos"
    ? camasServicio(servicio)
    : SERVICIOS_CRITICOS.reduce((total, item) => total + camasServicio(item), 0);

  useEffect(() => {
    queueMicrotask(() => {
      setDiasHabiles(diasHabilesParaCalculo ? String(diasHabilesParaCalculo) : "");
      setEditandoDiasHabiles(!diasHabilesOficial && !configDiasHabiles?.diasHabiles);
    });
  }, [configDiasHabiles?.diasHabiles, diasHabilesOficial, diasHabilesParaCalculo, mes, anio]);

  const configParaCalculo = useMemo(() => {
    if (!diasHabilesParaCalculo || camasSistema <= 0) return null;
    return {
      servicio,
      anio,
      mes,
      camasAsignadas: camasSistema,
      diasHabiles: diasHabilesParaCalculo,
    } satisfies ConfigIndicadoresCuidadosCriticos;
  }, [anio, camasSistema, diasHabilesParaCalculo, mes, servicio]);

  const indicadores = useMemo(
    () => calcularIndicadoresCuidadosCriticos(fichas, { anio, mes, servicio, config: configParaCalculo }),
    [anio, configParaCalculo, fichas, mes, servicio],
  );
  const datosBase = useMemo(
    () => calcularDatosBaseCuidadosCriticos(fichas, { anio, servicio, configs, camasAsignadas: camasSistema }),
    [anio, camasSistema, configs, fichas, servicio],
  );
  const fichasPeriodo = useMemo(() => {
    return fichas.filter(ficha => {
      if (servicio !== "todos" && ficha.servicio !== servicio) return false;
      const ingreso = toDate(ficha.datos?.fecha_ingreso_al_servicio);
      return ingreso?.getFullYear() === anio && ingreso.getMonth() + 1 === mes;
    }).length;
  }, [anio, fichas, mes, servicio]);

  const guardarConfig = async () => {
    if (!user || !profile) return;
    const habiles = Number(diasHabiles);
    if (!Number.isFinite(habiles) || habiles <= 0) {
      setMessage("Configura los dias habiles del periodo con un valor mayor a 0.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await setDoc(doc(db, "config_indicadores_cuidados_criticos", configDiasHabilesIndicadoresId(anio, mes)), {
        servicio: "__periodo__",
        anio,
        mes,
        camasAsignadas: 0,
        diasHabiles: habiles,
        actualizadoPorId: user.uid,
        actualizadoPorNombre: profile.nombre,
        actualizadoEn: serverTimestamp(),
      });
      setMessage("Dias habiles guardados.");
      setEditandoDiasHabiles(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la configuracion.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!puedeVer) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Esta vista de indicadores UCI / UCIN esta habilitada temporalmente solo para el usuario administrador autorizado.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
          <Calculator size={19} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="font-heading text-xl font-bold text-slate-900 dark:text-slate-100">Indicadores UCI / UCIN</h1>
          <p className="text-xs text-slate-500">Calculo mensual desde fichas registradas y configuracion estadistica.</p>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-3 lg:grid-cols-[120px_180px_minmax(260px,1fr)]">
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Anio</span>
            <input type="number" value={anio} onChange={event => setAnio(Number(event.target.value))} className={inputCls} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Mes</span>
            <select value={mes} onChange={event => setMes(Number(event.target.value))} className={inputCls}>
              {MESES_INDICADORES.map((nombre, index) => <option key={nombre} value={index + 1}>{nombre}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Servicio</span>
            <select value={servicio} onChange={event => setServicio(event.target.value)} className={inputCls}>
              <option value="todos">Todos los servicios UCI/UCIN</option>
              {SERVICIOS_CRITICOS.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="grid items-start gap-3 lg:grid-cols-[minmax(280px,380px)_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-heading text-sm font-bold text-slate-900 dark:text-slate-100">Configuracion del periodo</h2>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            Las camas se toman automaticamente del catalogo actual del servicio. Los dias habiles 2026 ya quedan fijos desde la tabla oficial.
          </p>
          <div className="mt-3 space-y-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              Camas del sistema para el filtro actual: <span className="font-bold text-slate-900 dark:text-slate-100">{camasSistema}</span>
            </div>
            <label>
              <span className="mb-1 block text-xs font-semibold text-slate-500">Dias habiles del periodo</span>
              <input
                type="number"
                min={1}
                value={diasHabiles}
                onChange={event => setDiasHabiles(event.target.value)}
                disabled={Boolean(diasHabilesOficial) || !editandoDiasHabiles}
                className={inputCls}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {diasHabilesOficial ? (
                <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                  Dato oficial {anio}
                </span>
              ) : editandoDiasHabiles ? (
                <>
                  <button
                    type="button"
                    onClick={guardarConfig}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    <Save size={16} /> {saving ? "Guardando..." : "Guardar dias habiles"}
                  </button>
                  {configDiasHabiles?.diasHabiles ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDiasHabiles(String(configDiasHabiles.diasHabiles));
                        setEditandoDiasHabiles(false);
                        setMessage("");
                      }}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Cancelar
                    </button>
                  ) : null}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditandoDiasHabiles(true);
                    setMessage("");
                  }}
                  className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950"
                >
                  Editar dias habiles
                </button>
              )}
            </div>
          </div>
          {message && (
            <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              {message}
            </p>
          )}
        </div>

        <div className="grid self-start gap-3 sm:grid-cols-3">
          <Stat label="Pacientes registrados" value={fichasPeriodo} />
          <Stat label="Camas del sistema" value={camasSistema || "Sin camas"} />
          <Stat label="Dias habiles" value={configParaCalculo?.diasHabiles ?? "Sin config."} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity size={17} className="text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="font-heading font-bold text-slate-900 dark:text-slate-100">
                {vistaTabla === "indicadores" ? "Tabla de indicadores" : "Datos base del periodo evaluado"}
              </h2>
              <p className="text-xs text-slate-500">
                {vistaTabla === "indicadores"
                  ? "Resultados calculados desde los numeradores y denominadores."
                  : "Conteos mensuales usados como fuente de los indicadores."}
              </p>
            </div>
          </div>
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setVistaTabla("indicadores")}
              className={`rounded-lg px-3 py-2 ${vistaTabla === "indicadores" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-900"}`}
            >
              Indicadores
            </button>
            <button
              type="button"
              onClick={() => setVistaTabla("datos")}
              className={`rounded-lg px-3 py-2 ${vistaTabla === "datos" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-900"}`}
            >
              Datos base
            </button>
          </div>
        </div>
        {vistaTabla === "indicadores" ? <TablaIndicadores indicadores={indicadores} /> : <TablaDatosBase datos={datosBase} />}
      </section>
    </div>
  );
}

function TablaIndicadores({ indicadores }: { indicadores: IndicadorCuidadosCriticos[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <tr>
            <th className="px-3 py-2">ID</th>
            <th className="px-3 py-2">Indicador</th>
            <th className="px-3 py-2 text-right">Numerador</th>
            <th className="px-3 py-2 text-right">Denominador</th>
            <th className="px-3 py-2 text-right">Resultado</th>
            <th className="px-3 py-2">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {indicadores.map(indicador => (
            <tr key={indicador.id} className="text-slate-700 dark:text-slate-300">
              <td className="px-3 py-2 font-mono">{indicador.id}</td>
              <td className="max-w-xl px-3 py-2">{indicador.nombre}{indicador.nota && <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-300">{indicador.nota}</p>}</td>
              <td className="px-3 py-2 text-right font-mono">{numeroTabla(indicador.numerador)}</td>
              <td className="px-3 py-2 text-right font-mono">{numeroTabla(indicador.denominador)}</td>
              <td className="px-3 py-2 text-right font-mono font-semibold">{resultadoTabla(indicador)}</td>
              <td className="px-3 py-2"><Estado indicador={indicador} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaDatosBase({ datos }: { datos: DatoBaseCuidadosCriticos[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="min-w-[1320px] text-left text-xs">
        <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <tr>
            <th className="sticky left-0 z-10 min-w-[360px] bg-slate-100 px-3 py-2 dark:bg-slate-800">Periodo evaluado</th>
            {MESES_INDICADORES.map(mes => (
              <th key={mes} className="px-3 py-2 text-right">{capitalizarMes(mes)}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {datos.map(row => (
            <tr key={row.descriptor} className="text-slate-700 dark:text-slate-300">
              <td className="sticky left-0 z-10 max-w-[420px] bg-white px-3 py-2 font-semibold dark:bg-slate-900">
                {row.descriptor}
                {row.nota && <p className="mt-1 text-[11px] font-normal text-amber-600 dark:text-amber-300">{row.nota}</p>}
              </td>
              {row.valores.map((valor, index) => (
                <td key={`${row.descriptor}-${index}`} className="px-3 py-2 text-right font-mono">
                  {valor}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold leading-none text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

function Estado({ indicador }: { indicador: IndicadorCuidadosCriticos }) {
  if (indicador.estado === "calculado") return <span className="rounded-md bg-green-100 px-2 py-1 text-[11px] font-semibold text-green-700 dark:bg-green-950 dark:text-green-300">Calculado</span>;
  if (indicador.estado === "pendiente_formula") return <span className="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">Formula pendiente</span>;
  if (indicador.estado === "sin_configuracion") return <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300"><AlertCircle size={12} />Sin config.</span>;
  return <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">Sin denominador</span>;
}

function numeroTabla(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function resultadoTabla(indicador: IndicadorCuidadosCriticos) {
  if (indicador.valor === null || Number.isNaN(indicador.valor)) return "-";
  if (indicador.formato === "porcentaje") return `${indicador.valor.toFixed(2)}%`;
  if (indicador.formato === "tasa") return indicador.valor.toFixed(2);
  return indicador.valor.toFixed(2);
}

function camasServicio(servicio: string) {
  return CAMAS_POR_SERVICIO[servicio as keyof typeof CAMAS_POR_SERVICIO]?.length ?? 0;
}

function capitalizarMes(mes: string) {
  return mes.charAt(0) + mes.slice(1).toLowerCase();
}
