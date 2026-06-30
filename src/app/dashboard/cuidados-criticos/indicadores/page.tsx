"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { Activity, AlertCircle, BarChart3, Calculator, Save } from "lucide-react";
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
const SERVICIOS_UCI = serviciosPorTipoMedico("uci");
const SERVICIOS_UCIN = serviciosPorTipoMedico("ucin");
type VistaTablaIndicadores = "indicadores" | "datos" | "graficos";
type TipoUnidadIndicadores = "uci" | "ucin";
type VistaGraficoIndicadores = "cama" | "porcentajes" | "tasas";

interface DatoGraficoServicio {
  servicio: string;
  camas: number;
  valores: Record<number, number | null>;
}

interface ColumnaGrafico {
  id: number;
  label: string;
  suffix?: string;
}

const GRAFICOS_CAMA: ColumnaGrafico[] = [
  { id: 1, label: "Giro cama" },
  { id: 2, label: "Ocupacion", suffix: "%" },
  { id: 3, label: "Dias estancia" },
  { id: 4, label: "Sustitucion" },
];

const GRAFICOS_COMPLICACIONES: ColumnaGrafico[] = [
  { id: 12, label: "Complic. CVC", suffix: "%" },
  { id: 13, label: "Infec. CVC", suffix: "%" },
  { id: 16, label: "Neumonia VM", suffix: "%" },
  { id: 19, label: "Infec. STU", suffix: "%" },
  { id: 6, label: "Ulceras", suffix: "%" },
];

const GRAFICOS_INGRESO: ColumnaGrafico[] = [
  { id: 5, label: "Reingreso <=72h", suffix: "%" },
  { id: 10, label: "Escala severidad", suffix: "%" },
  { id: 18, label: "Caidas x1000" },
];

const GRAFICOS_NO_PROGRAMADOS: ColumnaGrafico[] = [
  { id: 11, label: "Extub. accidental", suffix: "%" },
  { id: 14, label: "Retiro CVC", suffix: "%" },
  { id: 20, label: "Retiro STU", suffix: "%" },
  { id: 21, label: "Retiro SNG", suffix: "%" },
  { id: 22, label: "Retiro TQT", suffix: "%" },
  { id: 23, label: "Retiro gastrost.", suffix: "%" },
];

const GRAFICOS_VMI: ColumnaGrafico[] = [
  { id: 7, label: "Reintubacion", suffix: "%" },
  { id: 8, label: "Extub. exitosa", suffix: "%" },
  { id: 9, label: "Extub. fallida", suffix: "%" },
];

const GRAFICOS_TASAS_CLAVE: ColumnaGrafico[] = [
  { id: 17, label: "IAAS", suffix: "%" },
  { id: 30, label: "Neumonia IASS", suffix: "%" },
  { id: 32, label: "NAVM x1000" },
];

const GRAFICOS_MORTALIDAD: ColumnaGrafico[] = [
  { id: 25, label: "Mortalidad bruta", suffix: "%" },
  { id: 26, label: "Mortalidad neta", suffix: "%" },
  { id: 27, label: "Indice mortalidad" },
];

const GRAFICOS_LETALIDAD: ColumnaGrafico[] = [
  { id: 28, label: "VM", suffix: "%" },
  { id: 29, label: "Neumonia", suffix: "%" },
  { id: 31, label: "COVID-19", suffix: "%" },
  { id: 33, label: "Diarrea", suffix: "%" },
  { id: 34, label: "ERC", suffix: "%" },
  { id: 35, label: "Diabetes", suffix: "%" },
  { id: 36, label: "Hipertension", suffix: "%" },
];

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
  const [vistaTabla, setVistaTabla] = useState<VistaTablaIndicadores>("indicadores");
  const [vistaGrafico, setVistaGrafico] = useState<VistaGraficoIndicadores>("cama");
  const [tipoUnidad, setTipoUnidad] = useState<TipoUnidadIndicadores>("uci");
  const [mostrarFormulas, setMostrarFormulas] = useState(false);
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

  const serviciosUnidad = useMemo(() => tipoUnidad === "uci" ? SERVICIOS_UCI : SERVICIOS_UCIN, [tipoUnidad]);

  useEffect(() => {
    if (servicio !== "todos" && !serviciosUnidad.includes(servicio)) {
      setServicio("todos");
    }
  }, [servicio, serviciosUnidad]);

  const configDiasHabiles = configs.find(item => item.anio === anio && item.mes === mes && item.servicio === "__periodo__") ?? null;
  const diasHabilesOficial = diasHabilesOficiales(anio, mes);
  const diasHabilesParaCalculo = diasHabilesOficial ?? configDiasHabiles?.diasHabiles ?? 0;
  const camasSistema = servicio !== "todos"
    ? camasServicio(servicio)
    : serviciosUnidad.reduce((total, item) => total + camasServicio(item), 0);

  const configParaCalculo = useMemo(() => {
    if (camasSistema <= 0) return null;
    return {
      servicio,
      anio,
      mes,
      camasAsignadas: camasSistema,
      diasHabiles: diasHabilesParaCalculo,
    } satisfies ConfigIndicadoresCuidadosCriticos;
  }, [anio, camasSistema, diasHabilesParaCalculo, mes, servicio]);

  const indicadores = useMemo(
    () => calcularIndicadoresCuidadosCriticos(fichas, { anio, mes, servicio, tipo: tipoUnidad, config: configParaCalculo }),
    [anio, configParaCalculo, fichas, mes, servicio, tipoUnidad],
  );
  const datosBase = useMemo(
    () => calcularDatosBaseCuidadosCriticos(fichas, { anio, servicio, tipo: tipoUnidad, configs, camasAsignadas: camasSistema }),
    [anio, camasSistema, configs, fichas, servicio, tipoUnidad],
  );
  const datosGraficos = useMemo<DatoGraficoServicio[]>(() => {
    const serviciosFiltrados = servicio === "todos"
      ? serviciosUnidad
      : serviciosUnidad.filter(item => item === servicio);

    return serviciosFiltrados.map(nombreServicio => {
      const camas = camasServicio(nombreServicio);
      const calculados = calcularIndicadoresCuidadosCriticos(fichas, {
        anio,
        mes,
        servicio: nombreServicio,
        config: camas > 0 ? {
          servicio: nombreServicio,
          anio,
          mes,
          camasAsignadas: camas,
          diasHabiles: diasHabilesParaCalculo,
        } : null,
      });
      const valores = Object.fromEntries(calculados.map(indicador => [indicador.id, indicador.valor])) as Record<number, number | null>;
      return {
        servicio: nombreServicio,
        camas,
        valores,
      };
    });
  }, [anio, diasHabilesParaCalculo, fichas, mes, servicio, serviciosUnidad]);
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
        <div className="grid gap-3 lg:grid-cols-[120px_180px_220px_minmax(260px,1fr)]">
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
            <span className="mb-1 block text-xs font-semibold text-slate-500">Tipo de unidad</span>
            <div className="flex rounded-lg border border-slate-300 bg-white p-1 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => setTipoUnidad("uci")}
                className={`flex-1 rounded-md px-3 py-1.5 ${tipoUnidad === "uci" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"}`}
              >
                UCI
              </button>
              <button
                type="button"
                onClick={() => setTipoUnidad("ucin")}
                className={`flex-1 rounded-md px-3 py-1.5 ${tipoUnidad === "ucin" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"}`}
              >
                UCIN
              </button>
            </div>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Servicio</span>
            <select value={servicio} onChange={event => setServicio(event.target.value)} className={inputCls}>
              <option value="todos">Todos los servicios {tipoUnidad.toUpperCase()}</option>
              {serviciosUnidad.map(item => <option key={item} value={item}>{item}</option>)}
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
                {tituloVista(vistaTabla)}
              </h2>
              <p className="text-xs text-slate-500">
                {vistaTabla === "indicadores"
                  ? "Resultados calculados desde los numeradores y denominadores."
                  : vistaTabla === "datos"
                    ? "Conteos mensuales usados como fuente de los indicadores."
                    : "Resumen visual por servicio, separado entre UCI y UCIN."}
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
            <button
              type="button"
              onClick={() => setVistaTabla("graficos")}
              className={`rounded-lg px-3 py-2 ${vistaTabla === "graficos" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-900"}`}
            >
              Graficos
            </button>
          </div>
        </div>
        {vistaTabla === "indicadores" ? <TablaIndicadores indicadores={indicadores} mostrarFormulas={mostrarFormulas} onCambiarFormulas={() => setMostrarFormulas(actual => !actual)} /> : vistaTabla === "datos" ? (
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
        ) : (
          <GraficosIndicadores
            tipo={tipoUnidad}
            vista={vistaGrafico}
            servicioSeleccionado={servicio}
            datos={datosGraficos}
            onCambiarVista={setVistaGrafico}
          />
        )}
      </section>
    </div>
  );
}

function GraficosIndicadores({
  tipo,
  vista,
  servicioSeleccionado,
  datos,
  onCambiarVista,
}: {
  tipo: TipoUnidadIndicadores;
  vista: VistaGraficoIndicadores;
  servicioSeleccionado: string;
  datos: DatoGraficoServicio[];
  onCambiarVista: (vista: VistaGraficoIndicadores) => void;
}) {
  const sinServicios = datos.length === 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
            <BarChart3 size={14} className="text-blue-500" />
            {tituloGrafico(vista)}
          </h3>
          <p className="text-[11px] text-slate-500">
            {servicioSeleccionado === "todos"
              ? `Mostrando solo servicios ${tipo.toUpperCase()}.`
              : "Mostrando el servicio seleccionado si pertenece al grupo activo."}
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-bold dark:border-slate-700 dark:bg-slate-950">
          <BotonGrafico actual={vista} value="cama" onClick={onCambiarVista}>Cama</BotonGrafico>
          <BotonGrafico actual={vista} value="porcentajes" onClick={onCambiarVista}>Porcentajes</BotonGrafico>
          <BotonGrafico actual={vista} value="tasas" onClick={onCambiarVista}>Tasas</BotonGrafico>
        </div>
      </div>

      {sinServicios ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          El servicio seleccionado no pertenece a {tipo.toUpperCase()}. Cambia el switch o selecciona otro servicio.
        </div>
      ) : (
        <VistaGraficos datos={datos} vista={vista} />
      )}
    </div>
  );
}

function BotonGrafico({ actual, value, onClick, children }: { actual: VistaGraficoIndicadores; value: VistaGraficoIndicadores; onClick: (vista: VistaGraficoIndicadores) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`rounded-md px-2.5 py-1 ${actual === value ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-900"}`}
    >
      {children}
    </button>
  );
}

function VistaGraficos({ datos, vista }: { datos: DatoGraficoServicio[]; vista: VistaGraficoIndicadores }) {
  if (vista === "porcentajes") {
    return (
      <div className="grid gap-2 xl:grid-cols-2">
        <TablaGrafica titulo="% por complicaciones" datos={datos} columnas={GRAFICOS_COMPLICACIONES} />
        <TablaGrafica titulo="% por ingreso" datos={datos} columnas={GRAFICOS_INGRESO} />
        <TablaGrafica titulo="% no programados" datos={datos} columnas={GRAFICOS_NO_PROGRAMADOS} />
        <TablaGrafica titulo="% relacionados a VMI" datos={datos} columnas={GRAFICOS_VMI} />
      </div>
    );
  }

  if (vista === "tasas") {
    return (
      <div className="space-y-2">
        <div className="grid gap-1.5 sm:grid-cols-3 xl:grid-cols-6">
          {[...GRAFICOS_TASAS_CLAVE, ...GRAFICOS_MORTALIDAD].map(columna => (
            <TarjetaGrafico key={columna.id} label={columna.label} value={promedioIndicador(datos, columna.id)} suffix={columna.suffix} />
          ))}
        </div>
        <div className="grid gap-2 xl:grid-cols-2">
          <TablaGrafica titulo="Tasas principales" datos={datos} columnas={GRAFICOS_TASAS_CLAVE} />
          <TablaGrafica titulo="Tasa de mortalidad" datos={datos} columnas={GRAFICOS_MORTALIDAD} />
          <GraficoBarras titulo="Letalidad por diagnostico" suffix="%" datos={GRAFICOS_LETALIDAD.map(columna => ({ label: columna.label, value: promedioIndicador(datos, columna.id) }))} />
          <TablaGrafica titulo="Tasa de letalidad" datos={datos} columnas={GRAFICOS_LETALIDAD} />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {GRAFICOS_CAMA.map(columna => (
          <TarjetaGrafico key={columna.id} label={columna.label} value={promedioIndicador(datos, columna.id)} suffix={columna.suffix} />
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {GRAFICOS_CAMA.map(columna => (
          <GraficoBarras
            key={columna.id}
            titulo={columna.label}
            suffix={columna.suffix}
            datos={datos.map(item => ({ label: nombreCortoServicio(item.servicio), value: valorServicio(item, columna.id) }))}
          />
        ))}
      </div>
    </>
  );
}

function TablaGrafica({ titulo, datos, columnas }: { titulo: string; datos: DatoGraficoServicio[]; columnas: ColumnaGrafico[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40">
      <div className="border-b border-slate-200 px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:border-slate-800 dark:text-slate-200">
        {titulo}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-[10px]">
          <thead className="bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
            <tr>
              <th className="min-w-[120px] px-2 py-1.5">Servicio</th>
              {columnas.map(columna => <th key={columna.id} className="px-2 py-1.5 text-right">{columna.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {datos.map(item => (
              <tr key={`${titulo}-${item.servicio}`} className="text-slate-700 dark:text-slate-300">
                <td className="max-w-[150px] truncate px-2 py-1.5 font-semibold" title={item.servicio}>{nombreCortoServicio(item.servicio)}</td>
                {columnas.map(columna => (
                  <td key={columna.id} className="px-2 py-1.5 text-right font-mono">{valorGrafico(valorServicio(item, columna.id))}{columna.suffix ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TarjetaGrafico({ label, value, suffix = "" }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950/40">
      <p className="line-clamp-2 text-[11px] font-bold uppercase leading-tight tracking-wide text-slate-500 dark:text-slate-400" title={label}>{label}</p>
      <p className="shrink-0 text-xl font-black leading-none text-slate-900 dark:text-slate-100">{valorGrafico(value)}{suffix}</p>
    </div>
  );
}

function GraficoBarras({ titulo, datos, suffix = "" }: { titulo: string; datos: Array<{ label: string; value: number | null }>; suffix?: string }) {
  const maximo = Math.max(...datos.map(item => item.value ?? 0), 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40">
      <h4 className="mb-3 truncate text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200" title={titulo}>{titulo}</h4>
      <div className="space-y-2">
        {datos.map(item => {
          const value = item.value ?? 0;
          const width = maximo > 0 ? Math.max((value / maximo) * 100, value > 0 ? 6 : 0) : 0;
          return (
            <div key={item.label} className="grid grid-cols-[128px_1fr_54px] items-center gap-2 text-[11px]">
              <span className="truncate font-semibold text-slate-600 dark:text-slate-300" title={item.label}>{item.label}</span>
              <div className="h-4 overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-4 rounded bg-emerald-600"
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className="text-right font-mono text-slate-500 dark:text-slate-400">{valorGrafico(item.value)}{suffix}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TablaIndicadores({ indicadores, mostrarFormulas, onCambiarFormulas }: { indicadores: IndicadorCuidadosCriticos[]; mostrarFormulas: boolean; onCambiarFormulas: () => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <tr>
            <th className="px-3 py-2">ID</th>
            <th className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span>Indicador</span>
                <button
                  type="button"
                  onClick={onCambiarFormulas}
                  className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-white dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {mostrarFormulas ? "Ocultar formulas" : "Ver formulas"}
                </button>
              </div>
            </th>
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
              <td className="max-w-xl px-3 py-2">
                {indicador.nombre}
                {mostrarFormulas && <p className="mt-1 font-mono text-[10px] leading-4 text-slate-500 dark:text-slate-400">{FORMULAS_INDICADORES[indicador.id]}</p>}
                {indicador.nota && <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-300">{indicador.nota}</p>}
              </td>
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

function tituloVista(vista: VistaTablaIndicadores) {
  if (vista === "datos") return "Datos base del periodo evaluado";
  if (vista === "graficos") return "Graficos del periodo evaluado";
  return "Tabla de indicadores";
}

function camasServicio(servicio: string) {
  return CAMAS_POR_SERVICIO[servicio as keyof typeof CAMAS_POR_SERVICIO]?.length ?? 0;
}

function capitalizarMes(mes: string) {
  return mes.charAt(0) + mes.slice(1).toLowerCase();
}

function promedio(valores: Array<number | null>) {
  const validos = valores.filter((valor): valor is number => valor !== null && Number.isFinite(valor));
  if (!validos.length) return null;
  return validos.reduce((total, valor) => total + valor, 0) / validos.length;
}

function valorServicio(item: DatoGraficoServicio, id: number) {
  return item.valores[id] ?? null;
}

function promedioIndicador(datos: DatoGraficoServicio[], id: number) {
  return promedio(datos.map(item => valorServicio(item, id)));
}

function tituloGrafico(vista: VistaGraficoIndicadores) {
  if (vista === "porcentajes") return "Indicadores porcentajes";
  if (vista === "tasas") return "Indicadores tasas";
  return "Indicadores cama";
}

function valorGrafico(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  if (Math.abs(value) >= 100) return value.toFixed(1);
  return value.toFixed(2).replace(/\.00$/, "");
}

function nombreCortoServicio(servicio: string) {
  return servicio
    .replace(/^Unidad de /i, "")
    .replace(/^cuidados /i, "Cuidados ")
    .replace(/Cuidados Intensivos/i, "UCI")
    .replace(/cuidados intensivos/i, "UCI")
    .replace(/Cuidados Intermedios/i, "UCIN")
    .replace(/Adultos/i, "")
    .replace(/ y Posquirurgicos Cardiovasculares/i, "")
    .replace(/ y Posquirúrgicos Cardiovasculares/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
