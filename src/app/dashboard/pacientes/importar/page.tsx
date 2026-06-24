"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  collection, getDocs, query, where, doc, writeBatch, arrayUnion, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useServicios } from "@/contexts/ServiciosContext";
import {
  ArrowLeft, Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2,
  UserPlus, ArrowRightLeft, MinusCircle, HelpCircle, LogOut, ChevronDown,
} from "lucide-react";
import { mapearFilaReporte } from "@/lib/pacientes/importMapper";
import { construirDatosPersonales, construirDocIngreso, limpiarResponsable } from "@/lib/pacientes/persona";
import type { PacienteFormValue } from "@/components/pacientes/PacienteForm";
import type { DiagnosticoCIE, ResponsablePaciente } from "@/types";

type Paso = "subir" | "previsualizar" | "hecho";

interface Nuevo { expediente: string; nombre: string; servicio: string; cama?: string; form: PacienteFormValue; }
interface CambioPersonal { campo: string; anterior: string; nuevo: string; }
interface Actualizar {
  id: string; expediente: string; nombre: string;
  servicioAnterior: string; camaAnterior: string;
  servicioNuevo: string; camaNuevo: string;
  ultimoDiagnostico?: DiagnosticoCIE;   // último diagnóstico del reporte (se refresca)
  cambioDx: boolean;                    // true si el último diagnóstico cambió
  cambiosPersonales?: CambioPersonal[]; // cambios en datos personales detectados
  datosPersonales?: Record<string, unknown>; // campos personales a actualizar (parcial)
}
interface SinCambios { expediente: string; nombre: string; }
interface NoReconocido { expediente: string; nombre: string; servicioExcel: string; }
interface Ausente { id: string; expediente: string; nombre: string; servicioActual: string; }
interface Invalido { fila: number; motivo: string; }
interface AdvCama { expediente: string; advertencia: string; }

interface Diff {
  nuevos: Nuevo[];
  actualizar: Actualizar[];
  sinCambios: SinCambios[];
  noReconocidos: NoReconocido[];
  ausentes: Ausente[];
  invalidos: Invalido[];
  advertenciasCama: AdvCama[];
  totalFilas: number;
}

const nombreDe = (f: PacienteFormValue) => `${f.nombres ?? ""} ${f.apellidos ?? ""}`.replace(/\s+/g, " ").trim();
const dxKey = (d?: DiagnosticoCIE) => `${(d?.codigo ?? "").trim()}|${(d?.descripcion ?? "").trim()}`.toLowerCase();

export default function ImportarReportePage() {
  const { profile } = useAuth();
  const { servicios, getCamas } = useServicios();
  const inputRef = useRef<HTMLInputElement>(null);

  const [paso, setPaso] = useState<Paso>("subir");
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<Diff | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ creados: number; actualizados: number } | null>(null);

  const reset = () => {
    setPaso("subir");
    setNombreArchivo("");
    setDiff(null);
    setError(null);
    setResultado(null);
  };

  // ── Parseo + diff ───────────────────────────────────────────────────────
  const procesarArchivo = async (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".xlsx") && !file.name.toLowerCase().endsWith(".xls")) {
      setError(`"${file.name}" no es un archivo Excel (.xlsx).`);
      return;
    }
    setNombreArchivo(file.name);
    setProcesando(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

      // Activos actuales en el sistema
      const snap = await getDocs(query(collection(db, "pacientes"), where("estado", "==", "activo")));
      const activos = new Map<string, {
        id: string; servicioActual: string; camaActual: string; nombre: string;
        ultimoDiagnostico?: DiagnosticoCIE;
        dui?: string; estadoFamiliar?: string; ocupacion?: string; responsable?: ResponsablePaciente;
        numeroAfiliacion?: string; direccion?: string; municipio?: string; departamento?: string;
        telefono?: string;
      }>();
      snap.forEach((d) => {
        const data = d.data();
        activos.set(String(data.expediente), {
          id: d.id,
          servicioActual: data.servicioActual ?? "",
          camaActual: data.camaActual ?? "",
          nombre: `${data.nombres ?? ""} ${data.apellidos ?? ""}`.replace(/\s+/g, " ").trim(),
          ultimoDiagnostico: data.ultimoDiagnostico,
          dui: data.dui ?? "",
          estadoFamiliar: data.estadoFamiliar ?? "",
          ocupacion: data.ocupacion ?? "",
          responsable: data.responsable ?? undefined,
          numeroAfiliacion: data.numeroAfiliacion ?? "",
          direccion: data.direccion ?? "",
          municipio: data.municipio ?? "",
          departamento: data.departamento ?? "",
          telefono: data.telefono ?? "",
        });
      });

      const d: Diff = {
        nuevos: [], actualizar: [], sinCambios: [], noReconocidos: [],
        ausentes: [], invalidos: [], advertenciasCama: [], totalFilas: rows.length,
      };
      const expedientesEnReporte = new Set<string>();

      rows.forEach((row, i) => {
        const m = mapearFilaReporte(row, servicios, getCamas);
        if (!m.valido) {
          d.invalidos.push({ fila: i + 2, motivo: m.motivoInvalido ?? "fila inválida" });
          return;
        }
        expedientesEnReporte.add(m.expediente);
        if (m.advertenciaCama) d.advertenciasCama.push({ expediente: m.expediente, advertencia: m.advertenciaCama });

        if (!m.servicioReconocido) {
          d.noReconocidos.push({ expediente: m.expediente, nombre: nombreDe(m.form), servicioExcel: m.servicioExcel });
          return;
        }

        const existente = activos.get(m.expediente);
        const servicioNuevo = (m.form.servicioActual ?? "").trim();
        const camaNueva = (m.form.camaActual ?? "").trim();

        if (existente) {
          const cambioServicio = existente.servicioActual !== servicioNuevo;
          const cambioCama = camaNueva !== "" && existente.camaActual !== camaNueva;
          const dxNuevo = m.form.ultimoDiagnostico;
          const cambioDx = !!dxNuevo && dxKey(existente.ultimoDiagnostico) !== dxKey(dxNuevo);

          // ── Cambios en datos personales ──
          // Solo se actualiza cuando el reporte trae un valor NO vacío y distinto;
          // nunca se borra con un campo vacío (el padrón puede estar más completo).
          const cambiosPersonales: CambioPersonal[] = [];
          const dp: Record<string, unknown> = {};
          const cmp = (label: string, nuevo: string | undefined, viejo: string | undefined, key: string) => {
            const n = (nuevo ?? "").trim();
            const v = (viejo ?? "").trim();
            if (n !== "" && n.toLowerCase() !== v.toLowerCase()) {
              cambiosPersonales.push({ campo: label, anterior: v || "—", nuevo: n });
              dp[key] = n;
            }
          };
          cmp("DUI", m.form.dui, existente.dui, "dui");
          cmp("Estado familiar", m.form.estadoFamiliar, existente.estadoFamiliar, "estadoFamiliar");
          cmp("Ocupación", m.form.ocupacion, existente.ocupacion, "ocupacion");
          cmp("Afiliación ISSS", m.form.numeroAfiliacion, existente.numeroAfiliacion, "numeroAfiliacion");
          cmp("Dirección", m.form.direccion, existente.direccion, "direccion");
          cmp("Municipio", m.form.municipio, existente.municipio, "municipio");
          cmp("Departamento", m.form.departamento, existente.departamento, "departamento");
          cmp("Teléfono", m.form.telefono, existente.telefono, "telefono");

          // Responsable (nombre + teléfono + parentesco); se reconstruye sin perder lo ya guardado.
          const rN = m.form.responsable;
          const rV = existente.responsable;
          const rNombre = (rN?.nombre ?? "").trim();
          const rTel = (rN?.telefono ?? "").trim();
          const rParent = (rN?.parentesco ?? "").trim();
          const cambioRespNombre = rNombre !== "" && rNombre.toLowerCase() !== (rV?.nombre ?? "").trim().toLowerCase();
          const cambioRespTel = rTel !== "" && rTel !== (rV?.telefono ?? "").trim();
          const cambioRespParent = rParent !== "" && rParent.toLowerCase() !== (rV?.parentesco ?? "").trim().toLowerCase();
          if (cambioRespNombre) cambiosPersonales.push({ campo: "Responsable", anterior: rV?.nombre || "—", nuevo: rNombre });
          if (cambioRespTel) cambiosPersonales.push({ campo: "Tel. responsable", anterior: rV?.telefono || "—", nuevo: rTel });
          if (cambioRespParent) cambiosPersonales.push({ campo: "Parentesco", anterior: rV?.parentesco || "—", nuevo: rParent });
          if (cambioRespNombre || cambioRespTel || cambioRespParent) {
            const merged: ResponsablePaciente = { ...(rV ?? { nombre: "" }) };
            if (rNombre) merged.nombre = rNombre;
            if (rTel) merged.telefono = rTel;
            if (rParent) merged.parentesco = rParent;
            const limpio = limpiarResponsable(merged);
            if (limpio) dp.responsable = limpio;
          }

          if (cambioServicio || cambioCama || cambioDx || cambiosPersonales.length > 0) {
            d.actualizar.push({
              id: existente.id, expediente: m.expediente, nombre: nombreDe(m.form),
              servicioAnterior: existente.servicioActual, camaAnterior: existente.camaActual,
              servicioNuevo, camaNuevo: camaNueva,
              ultimoDiagnostico: dxNuevo, cambioDx,
              cambiosPersonales: cambiosPersonales.length ? cambiosPersonales : undefined,
              datosPersonales: Object.keys(dp).length ? dp : undefined,
            });
          } else {
            d.sinCambios.push({ expediente: m.expediente, nombre: nombreDe(m.form) });
          }
        } else {
          d.nuevos.push({ expediente: m.expediente, nombre: nombreDe(m.form), servicio: servicioNuevo, cama: camaNueva || undefined, form: m.form });
        }
      });

      // Activos del sistema que no vinieron en el reporte
      activos.forEach((v, exp) => {
        if (!expedientesEnReporte.has(exp)) {
          d.ausentes.push({ id: v.id, expediente: exp, nombre: v.nombre, servicioActual: v.servicioActual });
        }
      });

      setDiff(d);
      setPaso("previsualizar");
    } catch (e) {
      setError(`Error al leer el archivo: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setProcesando(false);
    }
  };

  // ── Confirmar (escritura) ─────────────────────────────────────────────────
  const confirmar = async () => {
    if (!profile || !diff) return;
    setGuardando(true);
    setError(null);
    try {
      const ahora = Timestamp.now();
      const registrador = `${profile.nombre} (importación)`;
      let batch = writeBatch(db);
      let ops = 0;
      const flush = async () => { if (ops > 0) { await batch.commit(); batch = writeBatch(db); ops = 0; } };
      const bump = async (n: number) => { ops += n; if (ops >= 400) await flush(); };

      // Nuevos ingresos + persona canónica
      for (const n of diff.nuevos) {
        const dp = construirDatosPersonales(n.form);
        const ingresoRef = doc(collection(db, "pacientes"));
        batch.set(ingresoRef, construirDocIngreso(n.form, dp, profile));
        const personaRef = doc(db, "personas", n.expediente);
        batch.set(personaRef, { ...dp, actualizadoEn: ahora, actualizadoPor: profile.uid }, { merge: true });
        await bump(2);
      }

      // Actualizaciones de activos: cama/servicio (con movimiento) y/o último diagnóstico.
      for (const a of diff.actualizar) {
        const payload: Record<string, unknown> = {
          actualizadoEn: ahora,
          actualizadoPor: profile.uid,
        };
        const cambioServicio = a.servicioAnterior !== a.servicioNuevo;
        const cambioCama = !!a.camaNuevo && a.camaAnterior !== a.camaNuevo;
        if (cambioServicio || cambioCama) {
          const mov: Record<string, unknown> = {
            fecha: ahora,
            servicioOrigen: a.servicioAnterior,
            servicioDestino: a.servicioNuevo,
            registradoPorNombre: registrador,
          };
          if (a.camaAnterior) mov.camaOrigen = a.camaAnterior;
          if (a.camaNuevo) mov.camaDestino = a.camaNuevo;
          payload.servicioActual = a.servicioNuevo;
          payload.camaActual = a.camaNuevo || null;
          payload.movimientos = arrayUnion(mov);
        }
        if (a.cambioDx && a.ultimoDiagnostico) {
          payload.ultimoDiagnostico = {
            codigo: (a.ultimoDiagnostico.codigo ?? "").trim(),
            descripcion: (a.ultimoDiagnostico.descripcion ?? "").trim(),
          };
        }
        // Cambios de datos personales: actualiza el snapshot del ingreso y el padrón.
        if (a.datosPersonales) {
          Object.assign(payload, a.datosPersonales);
          batch.set(
            doc(db, "personas", a.expediente),
            { ...a.datosPersonales, actualizadoEn: ahora, actualizadoPor: profile.uid },
            { merge: true },
          );
          await bump(1);
        }
        batch.update(doc(db, "pacientes", a.id), payload);
        await bump(1);
      }

      await flush();
      setResultado({ creados: diff.nuevos.length, actualizados: diff.actualizar.length });
      setPaso("hecho");
    } catch (e) {
      setError(`Error al guardar: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setGuardando(false);
    }
  };

  const onFiles = (files: FileList | null) => {
    if (files?.length) procesarArchivo(files[0]);
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/pacientes"
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
            Importar reporte de ingresos
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Sube el reporte de pacientes ingresados (.xlsx). Se agregan solo los nuevos; los
            activos no presentes y los ya dados de alta no se tocan.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Paso: subir */}
      {paso === "subir" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => { e.preventDefault(); setDragActive(false); onFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl px-6 py-12 text-center cursor-pointer transition-all ${
            dragActive
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
              : "border-slate-300 dark:border-slate-700 hover:border-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/30"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
            className="hidden"
          />
          {procesando ? (
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <Loader2 size={28} className="animate-spin text-blue-500" />
              <p className="text-sm font-medium">Analizando {nombreArchivo}...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 flex items-center justify-center">
                <Upload size={20} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Arrastra el reporte aquí o haz clic para seleccionar
              </p>
              <p className="text-xs text-slate-500">Formato Excel del SIS — hoja de pacientes ingresados</p>
            </div>
          )}
        </div>
      )}

      {/* Paso: previsualizar */}
      {paso === "previsualizar" && diff && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <FileSpreadsheet size={15} className="text-emerald-500" />
            <span className="font-medium">{nombreArchivo}</span>
            <span className="text-slate-400">· {diff.totalFilas} filas</span>
          </div>

          {/* Tarjetas resumen */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <ResumenCard icon={UserPlus}     color="emerald" label="Nuevos"        n={diff.nuevos.length} />
            <ResumenCard icon={ArrowRightLeft} color="blue"    label="Actualizar"   n={diff.actualizar.length} />
            <ResumenCard icon={MinusCircle}  color="slate"   label="Sin cambios"   n={diff.sinCambios.length} />
            <ResumenCard icon={LogOut}       color="amber"   label="Ausentes"      n={diff.ausentes.length} />
            <ResumenCard icon={HelpCircle}   color="rose"    label="No reconocidos" n={diff.noReconocidos.length} />
          </div>

          {/* Listas */}
          <Seccion titulo="Nuevos ingresos a crear" vacioMsg="No hay ingresos nuevos en el reporte." items={diff.nuevos}>
            {diff.nuevos.map((n) => (
              <Fila key={n.expediente} exp={n.expediente} nombre={n.nombre} detalle={`${n.servicio}${n.cama ? ` · Cama ${n.cama}` : ""}`} />
            ))}
          </Seccion>

          <Seccion titulo="Actualizaciones (servicio / cama / diagnóstico / datos)" vacioMsg="Ningún activo cambió de servicio, cama, diagnóstico o datos personales." items={diff.actualizar}>
            {diff.actualizar.map((a) => {
              const cambioUbicacion = a.servicioAnterior !== a.servicioNuevo || (!!a.camaNuevo && a.camaAnterior !== a.camaNuevo);
              const partes = [
                cambioUbicacion
                  ? `${a.servicioAnterior}${a.camaAnterior ? ` (${a.camaAnterior})` : ""} → ${a.servicioNuevo}${a.camaNuevo ? ` (${a.camaNuevo})` : ""}`
                  : null,
                a.cambioDx ? `Dx → ${a.ultimoDiagnostico?.codigo || a.ultimoDiagnostico?.descripcion || "actualizado"}` : null,
              ].filter(Boolean).join("  ·  ");
              return (
                <div key={a.expediente} className="py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-slate-500 w-20 flex-shrink-0">{a.expediente}</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate flex-shrink-0 max-w-[40%]">{a.nombre}</span>
                    <span className="text-xs text-slate-500 truncate flex-1">{partes}</span>
                  </div>
                  {a.cambiosPersonales && a.cambiosPersonales.length > 0 && (
                    <div className="ml-[5.75rem] mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {a.cambiosPersonales.map((c, i) => (
                        <span key={i} className="text-[11px] text-amber-700 dark:text-amber-400">
                          {c.campo}: <span className="line-through opacity-60">{c.anterior}</span> → <span className="font-medium">{c.nuevo}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </Seccion>

          <Seccion titulo="Activos ausentes del reporte (revisar)" vacioMsg="Todos los activos están en el reporte." items={diff.ausentes}>
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-2 px-1">
              Estos pacientes figuran activos en el sistema pero no aparecen en el reporte. No se
              modifican; revísalos por si ya fueron dados de alta.
            </p>
            {diff.ausentes.map((a) => (
              <Fila key={a.expediente} exp={a.expediente} nombre={a.nombre} detalle={a.servicioActual} href={`/dashboard/pacientes/${a.id}`} />
            ))}
          </Seccion>

          <Seccion titulo="Servicios no reconocidos (se omiten)" vacioMsg="Todos los servicios coinciden con el catálogo." items={diff.noReconocidos}>
            {diff.noReconocidos.map((n) => (
              <Fila key={n.expediente} exp={n.expediente} nombre={n.nombre} detalle={`Servicio: "${n.servicioExcel}"`} />
            ))}
          </Seccion>

          {diff.advertenciasCama.length > 0 && (
            <Seccion titulo="Advertencias de cama (se importan con el valor original)" vacioMsg="" items={diff.advertenciasCama}>
              {diff.advertenciasCama.map((a, i) => (
                <Fila key={i} exp={a.expediente} nombre="" detalle={a.advertencia} />
              ))}
            </Seccion>
          )}

          {diff.invalidos.length > 0 && (
            <Seccion titulo="Filas omitidas (datos incompletos)" vacioMsg="" items={diff.invalidos}>
              {diff.invalidos.map((iv, i) => (
                <Fila key={i} exp={`Fila ${iv.fila}`} nombre="" detalle={iv.motivo} />
              ))}
            </Seccion>
          )}

          {/* Footer */}
          <div className="sticky bottom-0 bg-gradient-to-t from-slate-50 dark:from-slate-950 via-slate-50/95 dark:via-slate-950/95 to-transparent pt-4 pb-2 -mx-4 px-4 md:-mx-6 md:px-6 flex items-center justify-end gap-3">
            <button
              onClick={reset}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={confirmar}
              disabled={guardando || (diff.nuevos.length === 0 && diff.actualizar.length === 0)}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors"
            >
              {guardando ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {guardando
                ? "Guardando..."
                : `Confirmar (${diff.nuevos.length} nuevos · ${diff.actualizar.length} actualizaciones)`}
            </button>
          </div>
        </div>
      )}

      {/* Paso: hecho */}
      {paso === "hecho" && resultado && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 flex items-center justify-center mx-auto">
            <CheckCircle2 size={26} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">Importación completa</p>
            <p className="text-sm text-slate-500 mt-1">
              {resultado.creados} ingresos creados · {resultado.actualizados} activos actualizados
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={reset}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Importar otro
            </button>
            <Link
              href="/dashboard/pacientes"
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
            >
              Ver pacientes
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

const COLORS: Record<string, string> = {
  emerald: "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400",
  blue: "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-400",
  slate: "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300",
  amber: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400",
  rose: "bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400",
};

function ResumenCard({ icon: Icon, color, label, n }: { icon: typeof UserPlus; color: string; label: string; n: number }) {
  return (
    <div className={`rounded-2xl border p-3.5 ${COLORS[color]}`}>
      <div className="flex items-center gap-1.5 mb-1.5 opacity-80">
        <Icon size={13} />
        <p className="text-[11px] font-medium uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-bold tabular-nums">{n}</p>
    </div>
  );
}

function Seccion({
  titulo, vacioMsg, items, children,
}: {
  titulo: string; vacioMsg: string; items: unknown[]; children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(true);
  if (items.length === 0) {
    if (!vacioMsg) return null;
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{titulo} <span className="text-slate-400 font-normal">· 0</span></p>
        <p className="text-xs text-slate-400 italic mt-1">{vacioMsg}</p>
      </div>
    );
  }
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
      >
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${abierto ? "" : "-rotate-90"}`} />
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex-1 text-left">{titulo}</span>
        <span className="text-xs font-medium text-slate-400 tabular-nums">{items.length}</span>
      </button>
      {abierto && <div className="px-4 pb-3 max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">{children}</div>}
    </div>
  );
}

function Fila({ exp, nombre, detalle, href }: { exp: string; nombre: string; detalle: string; href?: string }) {
  const contenido = (
    <div className="flex items-center gap-3 py-2 text-sm">
      <span className="font-mono text-xs text-slate-500 w-20 flex-shrink-0">{exp}</span>
      {nombre && <span className="font-medium text-slate-800 dark:text-slate-200 truncate flex-shrink-0 max-w-[40%]">{nombre}</span>}
      <span className="text-xs text-slate-500 truncate flex-1">{detalle}</span>
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:bg-slate-50 dark:hover:bg-slate-800/40 -mx-1 px-1 rounded transition-colors">
      {contenido}
    </Link>
  ) : (
    contenido
  );
}
