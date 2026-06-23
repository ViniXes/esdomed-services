"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
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
  FORMULAS_INDICADORES,
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
  const [editandoDiasHabiles, setEditandoDiasHabiles] = useState(false);
  const [diasHabilesEdicion, setDiasHabilesEdicion] = useState<Record<number, string>>({});
  const [vistaTabla, setVistaTabla] = useState<"indicadores" | "datos">("indicadores");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const puedeVer = puedeVerIndicadoresCuidadosCriticos(profile);
  const esAdmin = profile?.role === "admin";

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
  const iniciarEdicionDiasHabiles = () => {
    const valores = Object.fromEntries(MESES_INDICADORES.map((_, indice) => {
      const numeroMes = indice + 1;
      const oficial = diasHabilesOficiales(anio, numeroMes);
      const configurado = configs.find(item => item.anio === anio && item.mes === numeroMes && item.servicio === "__periodo__")?.diasHabiles;
      return [numeroMes, oficial ? "" : configurado ? String(configurado) : ""];
    }));
    setDiasHabilesEdicion(valores);
    setMessage("");
    setEditandoDiasHabiles(true);
  };

  const guardarDiasHabiles = async () => {
    if (!user || !profile || !esAdmin) return;
    const cambios = MESES_INDICADORES.map((_, indice) => {
      const numeroMes = indice + 1;
      const valor = diasHabilesEdicion[numeroMes]?.trim() ?? "";
      if (diasHabilesOficiales(anio, numeroMes) || !valor) return null;
      const diasHabiles = Number(valor);
      return { numeroMes, diasHabiles };
    }).filter((item): item is { numeroMes: number; diasHabiles: number } => item !== null);

    if (cambios.some(item => !Number.isFinite(item.diasHabiles) || item.diasHabiles <= 0)) {
      setMessage("Los dias habiles deben ser valores mayores que 0.");
      return;
    }
    if (!cambios.length) {
      setMessage("Ingresa al menos un mes antes de guardar.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const batch = writeBatch(db);
      cambios.forEach(({ numeroMes, diasHabiles }) => {
        batch.set(doc(db, "config_indicadores_cuidados_criticos", configDiasHabilesIndicadoresId(anio, numeroMes)), {
          servicio: "__periodo__",
          anio,
          mes: numeroMes,
          camasAsignadas: 0,
          diasHabiles,
          actualizadoPorId: user.uid,
          actualizadoPorNombre: profile.nombre,
          actualizadoEn: serverTimestamp(),
        });
      });
      await batch.commit();
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
          <div className="flex flex-wrap items-center gap-2">
            {vistaTabla === "indicadores" && (
              <details className="rounded-xl border border-slate-200 bg-slate-50 text-xs dark:border-slate-700 dark:bg-slate-950">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 font-semibold text-slate-600 marker:content-none hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
                  <Calculator size={14} /> Formulas
                </summary>
                <div className="max-h-80 w-[min(680px,calc(100vw-3rem))] overflow-y-auto border-t border-slate-200 px-3 py-2 dark:border-slate-700">
                  <p className="mb-2 text-[11px] text-slate-500">Referencia del calculo aplicado al mes y servicio seleccionados.</p>
                  <ol className="space-y-1.5 text-[11px] leading-4 text-slate-600 dark:text-slate-300">
                    {indicadores.map(indicador => (
                      <li key={`formula-${indicador.id}`}>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{indicador.id}. {indicador.nombre}:</span>{" "}
                        <span className="font-mono">{FORMULAS_INDICADORES[indicador.id]}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </details>
            )}
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
        </div>
        {vistaTabla === "indicadores" ? <TablaIndicadores indicadores={indicadores} /> : (
          <TablaDatosBase
            datos={datosBase}
            anio={anio}
            esAdmin={esAdmin}
            editandoDiasHabiles={editandoDiasHabiles}
            diasHabilesEdicion={diasHabilesEdicion}
            saving={saving}
            message={message}
            onEditarDiasHabiles={iniciarEdicionDiasHabiles}
            onCambiarDiasHabiles={(numeroMes, valor) => setDiasHabilesEdicion(actual => ({ ...actual, [numeroMes]: valor }))}
            onGuardarDiasHabiles={guardarDiasHabiles}
            onCancelarDiasHabiles={() => {
              setEditandoDiasHabiles(false);
              setMessage("");
            }}
          />
        )}
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

function TablaDatosBase({
  datos,
  anio,
  esAdmin,
  editandoDiasHabiles,
  diasHabilesEdicion,
  saving,
  message,
  onEditarDiasHabiles,
  onCambiarDiasHabiles,
  onGuardarDiasHabiles,
  onCancelarDiasHabiles,
}: {
  datos: DatoBaseCuidadosCriticos[];
  anio: number;
  esAdmin: boolean;
  editandoDiasHabiles: boolean;
  diasHabilesEdicion: Record<number, string>;
  saving: boolean;
  message: string;
  onEditarDiasHabiles: () => void;
  onCambiarDiasHabiles: (numeroMes: number, valor: string) => void;
  onGuardarDiasHabiles: () => void;
  onCancelarDiasHabiles: () => void;
}) {
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
          {datos.map(row => {
            const esFilaDiasHabiles = row.descriptor === "Total de dias habiles del periodo";
            const tieneTablaOficial = MESES_INDICADORES.some((_, indice) => diasHabilesOficiales(anio, indice + 1));
            return (
            <tr key={row.descriptor} className="text-slate-700 dark:text-slate-300">
              <td className="sticky left-0 z-10 max-w-[420px] bg-white px-3 py-2 font-semibold dark:bg-slate-900">
                {row.descriptor}
                {row.nota && <p className="mt-1 text-[11px] font-normal text-amber-600 dark:text-amber-300">{row.nota}</p>}
                {esFilaDiasHabiles && esAdmin && !tieneTablaOficial && (
                  <div className="mt-1 flex flex-wrap gap-1.5 font-normal">
                    {editandoDiasHabiles ? (
                      <>
                        <button type="button" onClick={onGuardarDiasHabiles} disabled={saving} className="inline-flex items-center gap-1 rounded border border-blue-200 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950">
                          <Save size={12} /> {saving ? "Guardando" : "Guardar"}
                        </button>
                        <button type="button" onClick={onCancelarDiasHabiles} className="rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-700">Cancelar</button>
                      </>
                    ) : (
                      <button type="button" onClick={onEditarDiasHabiles} className="rounded border border-blue-200 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950">Editar</button>
                    )}
                    {message && <span className="text-[11px] text-slate-500">{message}</span>}
                  </div>
                )}
              </td>
              {row.valores.map((valor, index) => {
                const numeroMes = index + 1;
                const puedeEditarCelda = esFilaDiasHabiles && editandoDiasHabiles && !diasHabilesOficiales(anio, numeroMes);
                return (
                  <td key={`${row.descriptor}-${index}`} className="px-3 py-2 text-right font-mono">
                    {puedeEditarCelda ? (
                      <input
                        type="number"
                        min={1}
                        value={diasHabilesEdicion[numeroMes] ?? (valor === "-" ? "" : String(valor))}
                        onChange={event => onCambiarDiasHabiles(numeroMes, event.target.value)}
                        className="w-14 rounded border border-slate-300 bg-white px-1 py-0.5 text-right text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    ) : valor}
                  </td>
                );
              })}
            </tr>
            );
          })}
        </tbody>
      </table>
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
