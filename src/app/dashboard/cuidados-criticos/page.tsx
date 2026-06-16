"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Activity, AlertCircle, FileSpreadsheet, Users } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { LienzoMatrizCuidadosCriticos } from "@/components/cuidados-criticos/LienzoMatrizCuidadosCriticos";
import { camposPendientesCierreCuidadosCriticos, fichaPendienteCierreCuidadosCriticos } from "@/lib/matrizCuidadosCriticos";
import type { FichaCuidadosCriticos, TipoMedicoCuidadosCriticos } from "@/types";

type Filtro = "todos" | TipoMedicoCuidadosCriticos;
type FiltroCierre = "todos" | "pendientes" | "cerrados";

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const timestamp = value as { toDate?: () => Date };
  return timestamp.toDate?.() ?? new Date(value as string);
}

export default function CuidadosCriticosDashboardPage() {
  const { profile, loading } = useAuth();
  const [fichas, setFichas] = useState<FichaCuidadosCriticos[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [filtroCierre, setFiltroCierre] = useState<FiltroCierre>("todos");

  const puedeVer = profile?.role === "admin";

  useEffect(() => {
    if (!puedeVer) return;
    return onSnapshot(collection(db, "fichas_cuidados_criticos"), snap => {
    const docs = snap.docs.map(item => ({ id: item.id, ...item.data() } as FichaCuidadosCriticos));
    docs.sort((a, b) => (toDate(b.actualizadoEn)?.getTime() ?? 0) - (toDate(a.actualizadoEn)?.getTime() ?? 0));
    setFichas(docs);
    });
  }, [puedeVer]);

  const fichasPorTipo = filtro === "todos" ? fichas : fichas.filter(ficha => ficha.tipoUnidad === filtro);
  const fichasFiltradas = fichasPorTipo.filter(ficha => {
    const pendiente = fichaPendienteCierreCuidadosCriticos(ficha);
    if (filtroCierre === "pendientes") return pendiente;
    if (filtroCierre === "cerrados") return !pendiente;
    return true;
  });
  const pendientesCierre = fichasFiltradas.filter(fichaPendienteCierreCuidadosCriticos).length;
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
          No tienes permisos para ver el consolidado UCI / UCIN.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto space-y-6">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
          <Activity size={19} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-heading text-slate-900 dark:text-slate-100">Consolidado UCI y UCIN</h1>
          <p className="text-xs text-slate-500">Lienzo institucional consolidado desde las fichas registradas por los médicos</p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<FileSpreadsheet size={18} />} label="Fichas registradas" value={fichas.length} />
        <Stat icon={<Users size={18} />} label="Pacientes UCI" value={fichas.filter(item => item.tipoUnidad === "uci").length} />
        <Stat icon={<Users size={18} />} label="Pacientes UCIN" value={fichas.filter(item => item.tipoUnidad === "ucin").length} />
        <Stat icon={<AlertCircle size={18} />} label="Pendientes de cierre" value={pendientesCierre} />
      </div>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold font-heading text-slate-900 dark:text-slate-100">Lienzo consolidado</h2>
            <p className="mt-1 text-xs text-slate-500">Cada ficha forma una fila. Las columnas mantienen los nombres y el orden de la matriz compartida.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-lg border border-slate-200 p-1 dark:border-slate-700">
              {(["todos", "uci", "ucin"] as Filtro[]).map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFiltro(value)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase ${filtro === value ? "bg-blue-600 text-white" : "text-slate-500 hover:text-blue-600"}`}
                >
                  {value}
                </button>
              ))}
            </div>
            <select
              value={filtroCierre}
              onChange={event => setFiltroCierre(event.target.value as FiltroCierre)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="todos">Todos</option>
              <option value="pendientes">Pendientes</option>
              <option value="cerrados">Cerrados</option>
            </select>
          </div>
        </div>
        {pendientesCierre > 0 && (
          <div className="overflow-hidden rounded-xl border border-amber-200 dark:border-amber-900">
            <table className="w-full text-left text-xs">
              <thead className="bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <tr>
                  <th className="px-3 py-2">Expediente</th>
                  <th className="px-3 py-2">Paciente</th>
                  <th className="px-3 py-2">Responsable</th>
                  <th className="px-3 py-2">Falta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100 dark:divide-amber-900/60">
                {fichasFiltradas.filter(fichaPendienteCierreCuidadosCriticos).slice(0, 8).map(ficha => (
                  <tr key={ficha.id} className="text-slate-700 dark:text-slate-300">
                    <td className="px-3 py-2 font-mono">{ficha.pacienteExpediente}</td>
                    <td className="px-3 py-2">{ficha.pacienteNombre}</td>
                    <td className="px-3 py-2">{ficha.creadoPorNombre || "No registrado"}</td>
                    <td className="px-3 py-2 text-amber-700 dark:text-amber-300">{camposPendientesCierreCuidadosCriticos(ficha.datos).map(campo => campo.label).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <LienzoMatrizCuidadosCriticos tipo={filtro === "uci" ? "uci" : "ucin"} fichas={fichasFiltradas} />
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
