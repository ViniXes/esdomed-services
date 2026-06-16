"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Activity, AlertCircle, FileSpreadsheet, Search, Table2, Users } from "lucide-react";
import { LienzoMatrizCuidadosCriticos } from "@/components/cuidados-criticos/LienzoMatrizCuidadosCriticos";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { TIPO_MEDICO_CRITICO_LABEL } from "@/lib/cuidadosCriticos";
import { esValorRegistrado, fichaPendienteCierreCuidadosCriticos, valorComoTexto } from "@/lib/matrizCuidadosCriticos";
import type { FichaCuidadosCriticos } from "@/types";

type PeriodoFiltro = "todos" | "mes" | "rango";
type CierreFiltro = "todos" | "pendientes" | "cerrados";

const MESES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

const inputCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const timestamp = value as { toDate?: () => Date };
  const date = timestamp.toDate?.() ?? new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fechaIngresoFicha(ficha: FichaCuidadosCriticos) {
  const fecha = valorComoTexto(ficha.datos?.fecha_ingreso_al_servicio);
  return fecha ? new Date(`${fecha}T00:00:00`) : null;
}

function enRango(fecha: Date | null, desde: string, hasta: string) {
  if (!fecha) return false;
  const inicio = desde ? new Date(`${desde}T00:00:00`) : null;
  const fin = hasta ? new Date(`${hasta}T23:59:59`) : null;
  if (inicio && fecha < inicio) return false;
  if (fin && fecha > fin) return false;
  return true;
}

function fichaEgresada(ficha: FichaCuidadosCriticos) {
  return ficha.estadoEstancia === "egresada"
    || esValorRegistrado(ficha.datos?.fecha_egreso_del_servicio)
    || ficha.datos?.alta === "FALLECIDO";
}

export default function RegistrosCuidadosCriticosMedicoPage() {
  const { profile } = useAuth();
  const [fichas, setFichas] = useState<FichaCuidadosCriticos[]>([]);
  const [servicio, setServicio] = useState("todos");
  const [periodo, setPeriodo] = useState<PeriodoFiltro>("todos");
  const [cierre, setCierre] = useState<CierreFiltro>("todos");
  const [mes, setMes] = useState(MESES[new Date().getMonth()]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const servicios = useMemo(() => profile?.servicios ?? [], [profile?.servicios]);

  useEffect(() => {
    if (!profile?.tipoMedico || servicios.length === 0) return;
    const fichasQuery = query(collection(db, "fichas_cuidados_criticos"), where("servicio", "in", servicios));
    return onSnapshot(fichasQuery, snap => {
      const docs = snap.docs.map(item => ({ id: item.id, ...item.data() } as FichaCuidadosCriticos));
      docs.sort((a, b) => (toDate(b.actualizadoEn)?.getTime() ?? 0) - (toDate(a.actualizadoEn)?.getTime() ?? 0));
      setFichas(docs);
    });
  }, [profile?.tipoMedico, servicios]);

  const fichasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return fichas.filter(ficha => {
      if (servicio !== "todos" && ficha.servicio !== servicio) return false;
      const pendienteCierre = fichaPendienteCierreCuidadosCriticos(ficha);
      if (cierre === "pendientes" && !pendienteCierre) return false;
      if (cierre === "cerrados" && pendienteCierre) return false;
      if (periodo === "mes" && valorComoTexto(ficha.datos?.mes) !== mes) return false;
      if (periodo === "rango" && !enRango(fechaIngresoFicha(ficha), desde, hasta)) return false;
      if (!texto) return true;
      return `${ficha.pacienteExpediente} ${ficha.pacienteNombre} ${ficha.servicio} ${ficha.cama ?? ""}`
        .toLowerCase()
        .includes(texto);
    });
  }, [busqueda, cierre, desde, fichas, hasta, mes, periodo, servicio]);

  const pacientesUnicos = new Set(fichasFiltradas.map(ficha => ficha.pacienteExpediente)).size;
  const activas = fichasFiltradas.filter(ficha => !fichaEgresada(ficha)).length;
  const pendientesCierre = fichasFiltradas.filter(fichaPendienteCierreCuidadosCriticos).length;

  if (!profile?.tipoMedico) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Tu usuario no tiene permisos de Medico UCI o Medico UCIN para consultar este consolidado.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
          <Table2 size={19} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-heading text-slate-900 dark:text-slate-100">Mis registros UCI / UCIN</h1>
          <p className="text-xs text-slate-500">
            {TIPO_MEDICO_CRITICO_LABEL[profile.tipoMedico]} - Vista consolidada de las estancias registradas en tus unidades.
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<FileSpreadsheet size={18} />} label="Entradas filtradas" value={fichasFiltradas.length} />
        <Stat icon={<Users size={18} />} label="Pacientes" value={pacientesUnicos} />
        <Stat icon={<Activity size={18} />} label="Activas" value={activas} />
        <Stat icon={<AlertCircle size={18} />} label="Pendientes de cierre" value={pendientesCierre} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Servicio</span>
            <select value={servicio} onChange={event => setServicio(event.target.value)} className={`${inputCls} w-full`}>
              <option value="todos">Todos mis servicios</option>
              {servicios.map(item => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Periodo</span>
            <select value={periodo} onChange={event => setPeriodo(event.target.value as PeriodoFiltro)} className={inputCls}>
              <option value="todos">Todas las entradas</option>
              <option value="mes">Por mes</option>
              <option value="rango">Rango de fechas</option>
            </select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Cierre</span>
            <select value={cierre} onChange={event => setCierre(event.target.value as CierreFiltro)} className={inputCls}>
              <option value="todos">Todos</option>
              <option value="pendientes">Pendientes</option>
              <option value="cerrados">Cerrados</option>
            </select>
          </label>

          {periodo === "mes" && (
            <label>
              <span className="mb-1 block text-xs font-semibold text-slate-500">Mes</span>
              <select value={mes} onChange={event => setMes(event.target.value)} className={inputCls}>
                {MESES.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          )}

          {periodo === "rango" && (
            <>
              <label>
                <span className="mb-1 block text-xs font-semibold text-slate-500">Desde ingreso UCI/UCIN</span>
                <input type="date" value={desde} onChange={event => setDesde(event.target.value)} className={inputCls} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold text-slate-500">Hasta ingreso UCI/UCIN</span>
                <input type="date" value={hasta} onChange={event => setHasta(event.target.value)} className={inputCls} />
              </label>
            </>
          )}

          <label className="min-w-64 flex-1">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Buscar</span>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={busqueda}
                onChange={event => setBusqueda(event.target.value)}
                placeholder="Expediente, paciente, servicio o cama..."
                className={`${inputCls} w-full pl-9`}
              />
            </div>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <LienzoMatrizCuidadosCriticos
          tipo={profile.tipoMedico}
          fichas={fichasFiltradas}
          expedienteHref={ficha => ficha.id ? `/medico/cuidados-criticos?ficha=${ficha.id}` : undefined}
        />
      </section>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">{icon}<span className="text-xs font-medium text-slate-500">{label}</span></div>
      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}
