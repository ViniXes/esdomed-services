"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Upload, X } from "lucide-react";
import type { VacacionProgramada } from "@/types";
import {
  bloqueoQuincena,
  claveQuincena,
  CUPOS_POR_QUINCENA,
  etiquetaCortaQuincena,
  QUINCENAS_DEL_ANIO,
  type Quincena,
} from "@/lib/esdomed/vacaciones";
import { emparejarNombre, leerExcelVacaciones, type TipoCoincidencia } from "@/lib/esdomed/importar-vacaciones";

export interface PersonaVacaciones {
  uid: string;
  nombre: string;
  codigoMarcacion: string;
  grupo: string;
  administrativo: boolean;
}

// uid elegido: "" = falta elegir, NO_IMPORTAR = la fila se descarta.
const NO_IMPORTAR = "-";

interface FilaImport {
  id: number;
  mes: number;
  quincena: Quincena;
  nombreExcel: string;
  uid: string;
  coincidencia: TipoCoincidencia;
  bloqueo: string | null; // la quincena del Excel no se puede usar
  destino: string;        // claveQuincena final ("" = falta elegir)
}

const selectCls = "w-full rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

const desdeClave = (clave: string): { mes: number; quincena: Quincena } => {
  const [mes, quincena] = clave.split("-").map(Number);
  return { mes, quincena: quincena as Quincena };
};

/**
 * Lee el Excel de la jefatura y deja revisar, fila por fila, a quién del
 * sistema corresponde cada nombre antes de usarlo. Los periodos que caen en
 * una quincena bloqueada (p. ej. la 2da de febrero) se reubican en la primera
 * quincena libre siguiente, y el admin puede cambiarla.
 */
export function ImportarVacacionesModal({
  anio,
  operativos,
  onCancelar,
  onAplicar,
}: {
  anio: number;
  operativos: PersonaVacaciones[];
  onCancelar: () => void;
  onAplicar: (asignaciones: VacacionProgramada[]) => void;
}) {
  const [filas, setFilas] = useState<FilaImport[] | null>(null);
  const [archivo, setArchivo] = useState("");
  const [anioArchivo, setAnioArchivo] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [leyendo, setLeyendo] = useState(false);

  const disponibles = useMemo(
    () => QUINCENAS_DEL_ANIO.filter((q) => !bloqueoQuincena(anio, q.mes, q.quincena)),
    [anio],
  );

  const leer = async (file: File) => {
    setLeyendo(true);
    setError("");
    try {
      const XLSX = await import("xlsx");
      const libro = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const hoja = libro.Sheets[libro.SheetNames[0]];
      const datos = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: "", raw: false });
      const lectura = leerExcelVacaciones(datos);
      if (lectura.error) throw new Error(lectura.error);
      if (lectura.filas.length === 0) throw new Error("El archivo no trae personas programadas.");

      const nuevas: FilaImport[] = lectura.filas.map((f, id) => {
        const match = emparejarNombre(f.nombre, operativos);
        const bloqueo = bloqueoQuincena(anio, f.mes, f.quincena);
        return {
          id,
          mes: f.mes,
          quincena: f.quincena,
          nombreExcel: f.nombre,
          uid: match.uid,
          coincidencia: match.tipo,
          bloqueo,
          destino: bloqueo ? "" : claveQuincena(f.mes, f.quincena),
        };
      });
      // Reubica lo bloqueado en la primera quincena libre que siga.
      const ocupacion = new Map<string, number>();
      nuevas.forEach((f) => f.destino && ocupacion.set(f.destino, (ocupacion.get(f.destino) ?? 0) + 1));
      const orden = disponibles.map((q) => claveQuincena(q.mes, q.quincena));
      for (const f of nuevas.filter((x) => x.bloqueo)) {
        const desde = orden.findIndex((c) => desdeClave(c).mes * 2 + desdeClave(c).quincena > f.mes * 2 + f.quincena);
        const candidatas = [...orden.slice(Math.max(desde, 0)), ...orden.slice(0, Math.max(desde, 0))];
        const libre = candidatas.find((c) => (ocupacion.get(c) ?? 0) < CUPOS_POR_QUINCENA);
        if (libre) {
          f.destino = libre;
          ocupacion.set(libre, (ocupacion.get(libre) ?? 0) + 1);
        }
      }
      setFilas(nuevas);
      setArchivo(file.name);
      setAnioArchivo(lectura.anioDelArchivo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally {
      setLeyendo(false);
    }
  };

  const cambiar = (id: number, cambio: Partial<FilaImport>) =>
    setFilas((prev) => prev?.map((f) => (f.id === id ? { ...f, ...cambio } : f)) ?? prev);

  const revision = useMemo(() => {
    const activas = (filas ?? []).filter((f) => f.uid !== NO_IMPORTAR);
    const vecesUid = new Map<string, number>();
    const vecesDestino = new Map<string, number>();
    activas.forEach((f) => {
      if (f.uid) vecesUid.set(f.uid, (vecesUid.get(f.uid) ?? 0) + 1);
      if (f.destino) vecesDestino.set(f.destino, (vecesDestino.get(f.destino) ?? 0) + 1);
    });
    const repetido = (f: FilaImport) => !!f.uid && f.uid !== NO_IMPORTAR && (vecesUid.get(f.uid) ?? 0) > 1;
    const lleno = (f: FilaImport) => f.uid !== NO_IMPORTAR && !!f.destino && (vecesDestino.get(f.destino) ?? 0) > CUPOS_POR_QUINCENA;
    const pendientes = activas.filter((f) => !f.uid || !f.destino).length;
    const conLleno = activas.filter(lleno).length;
    return { activas, repetido, lleno, pendientes, conLleno };
  }, [filas]);

  const aplicar = () => {
    const porUid = new Map(operativos.map((p) => [p.uid, p]));
    onAplicar(
      revision.activas.map((f) => {
        const p = porUid.get(f.uid);
        const { mes, quincena } = desdeClave(f.destino);
        return { uid: f.uid, codigoMarcacion: p?.codigoMarcacion ?? "", nombre: p?.nombre ?? f.nombreExcel, mes, quincena };
      }),
    );
  };

  const chip = (f: FilaImport) => {
    if (f.uid === NO_IMPORTAR) return { texto: "No se importa", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };
    if (!f.uid) return { texto: "Elija la persona", cls: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" };
    if (revision.lleno(f)) return { texto: "Quincena llena", cls: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" };
    if (revision.repetido(f)) return { texto: "Repetido", cls: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" };
    if (f.coincidencia === "sugerida") return { texto: "Revisar", cls: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" };
    return { texto: "Coincide", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white font-heading">
              <FileSpreadsheet size={18} className="text-blue-700 dark:text-blue-300" /> Importar programación {anio}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Excel con las columnas Mes, Quincena y Nombre completo. Nada se guarda hasta que lo revise y presione Guardar.
            </p>
          </div>
          <button type="button" onClick={onCancelar} aria-label="Cerrar"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-4 text-sm font-medium transition-colors ${
            filas ? "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/50"
              : "border-blue-300 bg-blue-50/60 text-blue-800 hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200"
          }`}>
            <Upload size={16} />
            {leyendo ? "Leyendo…" : archivo ? `${archivo} · elegir otro archivo` : "Elegir el archivo de Excel"}
            <input type="file" accept=".xlsx,.xls,.csv" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void leer(f); }} />
          </label>

          {error && (
            <p className="mt-3 flex items-start gap-1.5 text-sm text-rose-700 dark:text-rose-300">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
            </p>
          )}

          {filas && anioArchivo !== null && anioArchivo !== anio && (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              El archivo dice {anioArchivo} y está importando a {anio}. Los bloqueos (Semana Santa, etc.) se calculan para {anio}.
            </p>
          )}

          {filas && (
            <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {filas.map((f) => {
                const c = chip(f);
                return (
                  <div key={f.id} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9.5rem_7rem] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{f.nombreExcel}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        En el Excel: {etiquetaCortaQuincena(f.mes, f.quincena)}
                        {f.bloqueo && <span className="text-amber-700 dark:text-amber-300"> · bloqueada ({f.bloqueo})</span>}
                      </p>
                    </div>
                    <select value={f.uid} onChange={(e) => cambiar(f.id, { uid: e.target.value })} className={selectCls}
                      aria-label={`Persona del sistema para ${f.nombreExcel}`}>
                      <option value="">— Elegir persona —</option>
                      <option value={NO_IMPORTAR}>— No importar —</option>
                      {operativos.map((p) => <option key={p.uid} value={p.uid}>{p.nombre}</option>)}
                    </select>
                    {f.bloqueo ? (
                      <select value={f.destino} onChange={(e) => cambiar(f.id, { destino: e.target.value })} className={selectCls}
                        aria-label={`Quincena para ${f.nombreExcel}`}>
                        <option value="">— Mover a —</option>
                        {disponibles.map((q) => (
                          <option key={claveQuincena(q.mes, q.quincena)} value={claveQuincena(q.mes, q.quincena)}>
                            {etiquetaCortaQuincena(q.mes, q.quincena)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm text-slate-600 dark:text-slate-300">{etiquetaCortaQuincena(f.mes, f.quincena)}</span>
                    )}
                    <span className={`justify-self-start rounded-md px-2 py-0.5 text-[11px] font-semibold sm:justify-self-end ${c.cls}`}>{c.texto}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {filas
              ? `${revision.activas.length} periodo(s) a importar${revision.pendientes ? ` · ${revision.pendientes} sin resolver` : ""}${revision.conLleno ? ` · ${revision.conLleno} en quincena llena` : ""}`
              : "Reemplazará la programación que se ve en pantalla."}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onCancelar}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              Cancelar
            </button>
            <button type="button" onClick={aplicar}
              disabled={!filas || revision.activas.length === 0 || revision.pendientes > 0 || revision.conLleno > 0}
              className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50">
              Usar esta programación
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
