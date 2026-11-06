"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  Loader2,
  Search,
  Stethoscope,
  Upload,
} from "lucide-react";
import {
  esCensoConsultaExterna,
  esProgramacionCitas,
  leerCenso,
  leerProgramacion,
  type CensoLeido,
  type ProgramacionLeida,
} from "@/lib/simmow/consultaExternaReportes";
import { cruzarCensoConProgramacion, enriquecerPacientesConsultaExterna } from "@/lib/simmow/consultaExternaMapeo";
import { generarScriptConsolaConsultaExterna } from "@/lib/simmow/consultaExternaGeneradorScript";
import type { DatosSimmowConsultaExterna, PacienteConsultaExterna } from "@/lib/simmow/consultaExternaTypes";
import { semanaEpidemiologica } from "@/lib/simmow/texto";
import { FormularioRevisionConsultaExterna } from "./FormularioRevisionConsultaExterna";

type Paso = "carga" | "lista" | "revision";

// Mismo criterio que Atención Ambulatoria: al recargar la página no se pierde el lote.
const CLAVE_ESTADO = "simmow_consulta_externa_estado";
const TTL_ESTADO_MS = 4 * 60 * 60 * 1000;

interface EstadoPersistido {
  guardadoEn: number;
  paso: Paso;
  pacientes: PacienteConsultaExterna[];
  advertenciasGlobales: string[];
  claveSeleccionada: string | null;
}

function cargarEstadoGuardado(): EstadoPersistido | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE_ESTADO);
    if (!crudo) return null;
    const estado = JSON.parse(crudo) as EstadoPersistido;
    if (Date.now() - estado.guardadoEn > TTL_ESTADO_MS) {
      window.localStorage.removeItem(CLAVE_ESTADO);
      return null;
    }
    return estado;
  } catch {
    return null;
  }
}

async function leerLibro(file: File): Promise<unknown[][][]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", raw: true });
  return wb.SheetNames.map((n) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: "" }));
}

/** "DD/MM/AAAA" → semana epidemiológica ("" si la fecha no es válida). */
function semanaDeFecha(fecha: string): string {
  const m = fecha.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? "" : String(semanaEpidemiologica(d));
}

const Aviso = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
    {children}
  </div>
);

/**
 * Flujo "Consulta Externa" de SIMMOW: sube el censo diario y la programación de
 * citas del SIS, los cruza por expediente, deja revisar cada consulta y copia el
 * código que llena el formulario de conrec.php. Solo administración mientras
 * está en pruebas (el control de acceso lo pone la página que lo monta).
 */
export function FlujoConsultaExterna() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [censo, setCenso] = useState<{ nombre: string; datos: CensoLeido } | null>(null);
  const [programacion, setProgramacion] = useState<{ nombre: string; datos: ProgramacionLeida } | null>(null);

  const [paso, setPaso] = useState<Paso>("carga");
  const [pacientes, setPacientes] = useState<PacienteConsultaExterna[]>([]);
  const [advertenciasGlobales, setAdvertenciasGlobales] = useState<string[]>([]);
  const [claveSeleccionada, setClaveSeleccionada] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [query, setQuery] = useState("");
  const [listoParaPersistir, setListoParaPersistir] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect --
       Restaurar desde localStorage solo puede pasar tras montar en el cliente. */
    const estado = cargarEstadoGuardado();
    if (estado) {
      setPaso(estado.paso);
      setPacientes(estado.pacientes);
      setAdvertenciasGlobales(estado.advertenciasGlobales);
      setClaveSeleccionada(estado.claveSeleccionada);
    }
    setListoParaPersistir(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!listoParaPersistir) return;
    try {
      if (pacientes.length === 0) {
        window.localStorage.removeItem(CLAVE_ESTADO);
        return;
      }
      const estado: EstadoPersistido = { guardadoEn: Date.now(), paso, pacientes, advertenciasGlobales, claveSeleccionada };
      window.localStorage.setItem(CLAVE_ESTADO, JSON.stringify(estado));
    } catch {
      /* sin almacenamiento disponible: el lote simplemente no sobrevive a una recarga */
    }
  }, [listoParaPersistir, paso, pacientes, advertenciasGlobales, claveSeleccionada]);

  const seleccionado = useMemo(
    () => pacientes.find((p) => p.clave === claveSeleccionada) ?? null,
    [pacientes, claveSeleccionada]
  );

  const manejarArchivos = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setAnalizando(true);
    try {
      for (const file of Array.from(files)) {
        const hojas = await leerLibro(file);
        const hojaCenso = hojas.find(esCensoConsultaExterna);
        if (hojaCenso) {
          const leido = leerCenso(hojaCenso);
          if (leido) {
            setCenso({ nombre: file.name, datos: leido });
            continue;
          }
        }
        if (hojas.some(esProgramacionCitas)) {
          setProgramacion({ nombre: file.name, datos: leerProgramacion(hojas) });
          continue;
        }
        setError(`"${file.name}" no parece ni el censo diario de consulta externa ni la programación de citas por día.`);
      }
    } catch (e) {
      setError(`Error al leer el archivo: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setAnalizando(false);
    }
  };

  const cruzar = async () => {
    if (!censo) return;
    setError(null);
    setProcesando(true);
    try {
      const cruce = cruzarCensoConProgramacion(censo.datos, programacion?.datos ?? null);
      if (cruce.pacientes.length === 0) {
        setError("El censo no trae ninguna consulta.");
        return;
      }
      setPacientes(await enriquecerPacientesConsultaExterna(cruce.pacientes));
      setAdvertenciasGlobales(cruce.advertenciasGlobales);
      setPaso("lista");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error procesando los reportes.");
    } finally {
      setProcesando(false);
    }
  };

  const reiniciar = () => {
    setPaso("carga");
    setPacientes([]);
    setAdvertenciasGlobales([]);
    setClaveSeleccionada(null);
    setCenso(null);
    setProgramacion(null);
    setError(null);
    setCopiado(false);
    setQuery("");
  };

  const actualizar = (patch: Partial<DatosSimmowConsultaExterna>) => {
    setPacientes((lista) => lista.map((p) => (p.clave === claveSeleccionada ? { ...p, datos: { ...p.datos, ...patch } } : p)));
  };

  const copiarCodigo = async () => {
    if (!seleccionado) return;
    const codigo = generarScriptConsolaConsultaExterna(
      seleccionado.datos,
      semanaDeFecha(seleccionado.datos.fecha),
      seleccionado.advertencias
    );
    try {
      await navigator.clipboard.writeText(codigo);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = codigo;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);

    // Marca solo cuando de verdad se copió, para avisar si se vuelve a copiar y no duplicar la atención.
    const ahora = Date.now();
    setPacientes((lista) => lista.map((p) => (p.clave === seleccionado.clave ? { ...p, codigoCopiadoEn: ahora } : p)));
  };

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pacientes;
    return pacientes.filter(
      (p) =>
        p.expediente.toLowerCase().includes(q) ||
        p.datos.paciente.toLowerCase().includes(q) ||
        p.datos.medicoNombre.toLowerCase().includes(q) ||
        p.datos.especialidadTexto.toLowerCase().includes(q)
    );
  }, [pacientes, query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Stethoscope className="h-5 w-5 text-blue-600 dark:text-[#c9a892]" />
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Consulta Externa</h2>
        <span className="text-[10px] font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300">Pruebas</span>
        {paso !== "carga" && (
          <button onClick={reiniciar} className="ml-auto text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
            Procesar otros reportes
          </button>
        )}
      </div>

      {paso === "carga" && (
        <div className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              manejarArchivos(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl px-6 py-10 text-center cursor-pointer transition-all ${
              dragActive
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                : "border-slate-300 dark:border-slate-700 hover:border-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/30"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xls,.xlsx"
              multiple
              onChange={(e) => {
                manejarArchivos(e.target.files);
                e.target.value = "";
              }}
              className="hidden"
            />
            {analizando ? (
              <div className="flex flex-col items-center gap-2 text-slate-500">
                <Loader2 size={28} className="animate-spin text-blue-500" />
                <p className="text-sm font-medium">Analizando archivo(s)...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-500">
                <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 flex items-center justify-center">
                  <Upload size={20} className="text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Arrastra los dos reportes aquí (o haz clic) — pueden ir juntos o uno por uno
                </p>
                <p className="text-xs text-slate-400">
                  &ldquo;Censo diario de consulta externa&rdquo; (un solo día) + &ldquo;Programación de citas por día&rdquo; del mismo día
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                label: "Censo diario de consulta externa",
                detalle: censo ? `${censo.nombre} — ${censo.datos.filas.length} consultas, ${censo.datos.fecha || "sin fecha"}` : null,
              },
              {
                label: "Programación de citas por día",
                detalle: programacion
                  ? `${programacion.nombre} — ${programacion.datos.porExpediente.size} citas, ${programacion.datos.fechas.join(", ") || "sin fecha"}`
                  : null,
              },
            ].map(({ label, detalle }) => (
              <div
                key={label}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                  detalle
                    ? "border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 text-slate-400"
                }`}
              >
                {detalle ? <CheckCircle2 size={16} className="flex-shrink-0" /> : <FileSpreadsheet size={16} className="flex-shrink-0" />}
                <div className="min-w-0">
                  <div className="font-medium">{label}</div>
                  <div className="text-xs truncate opacity-80">{detalle ?? "Falta subir"}</div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500">
            El censo es la lista de consultas a registrar; la programación solo aporta el DUI y el nombre del paciente (sin ella
            esos dos datos quedan vacíos).
          </p>

          <button
            disabled={!censo || procesando}
            onClick={cruzar}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {procesando && <Loader2 size={16} className="animate-spin" />}
            Cruzar reportes y ver consultas
          </button>
        </div>
      )}

      {paso === "lista" && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            {pacientes.length} consultas — elija una para revisar y generar el código
          </h3>

          {advertenciasGlobales.map((a, i) => (
            <Aviso key={i}>{a}</Aviso>
          ))}

          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por expediente, nombre, médico o especialidad..."
                className="w-full pl-8 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <span className="text-xs text-slate-500 whitespace-nowrap">
              {filtrados.length} de {pacientes.length}
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="text-left font-medium px-3 py-2">N°</th>
                  <th className="text-left font-medium px-3 py-2">Expediente</th>
                  <th className="text-left font-medium px-3 py-2">Paciente</th>
                  <th className="text-left font-medium px-3 py-2">Médico</th>
                  <th className="text-left font-medium px-3 py-2">Especialidad</th>
                  <th className="text-left font-medium px-3 py-2">Dx principal</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtrados.map((p) => (
                  <tr
                    key={p.clave}
                    onClick={() => {
                      setClaveSeleccionada(p.clave);
                      setPaso("revision");
                    }}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-2 text-slate-500">{p.numero}</td>
                    <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{p.expediente}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{p.datos.paciente || "—"}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{p.datos.medicoNombre || "—"}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{p.datos.especialidadTexto || "—"}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                      {p.datos.diagPrincipalCodigo ? `${p.datos.diagPrincipalCodigo} — ${p.datos.diagPrincipalTexto}` : "—"}
                    </td>
                    <td className="px-3 py-2 space-x-1.5 whitespace-nowrap">
                      {!p.enProgramacion && (
                        <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">incompleto</span>
                      )}
                      {p.advertencias.length > 0 && (
                        <span
                          className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400"
                          title={p.advertencias.join(" / ")}
                        >
                          revisar
                        </span>
                      )}
                      {p.codigoCopiadoEn && (
                        <span
                          className="text-[10px] uppercase tracking-wide text-orange-700 dark:text-orange-400 font-semibold"
                          title={`Código ya copiado el ${new Date(p.codigoCopiadoEn).toLocaleString("es-SV")} — cuidado de no duplicar en SIMMOW.`}
                        >
                          ya copiado
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-400 text-sm">
                      Sin resultados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {paso === "revision" && seleccionado && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Consulta N° {seleccionado.numero} — expediente {seleccionado.expediente}
            </h3>

            {seleccionado.advertencias.length > 0 && (
              <div className="space-y-1">
                {seleccionado.advertencias.map((a, i) => (
                  <Aviso key={i}>{a}</Aviso>
                ))}
              </div>
            )}

            {seleccionado.codigoCopiadoEn && (
              <div className="flex items-start gap-2 text-xs text-orange-800 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border border-orange-300 dark:border-orange-800 rounded-lg px-3 py-2 font-medium">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Ya generó y copió el código de esta consulta antes, el {new Date(seleccionado.codigoCopiadoEn).toLocaleString("es-SV")}.
                  Verifique que no la haya grabado ya en SIMMOW antes de pegarlo de nuevo — evite duplicar la atención.
                </span>
              </div>
            )}

            <Aviso>
              <span className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Este código no presiona &quot;Grabar&quot; en SIMMOW. Abra la pantalla de Ingreso/Edición Consulta Curativa /
                  Atención Preventiva, presione F12 para abrir la consola, pegue el código, presione Enter y revise cada campo antes de
                  grabar manualmente.{" "}
                  <b>
                    Esta herramienta ayuda con la mayor parte del llenado, pero la responsabilidad de una digitación correcta en
                    SIMMOW sigue siendo del personal operativo
                  </b>
                  .
                </span>
              </span>
            </Aviso>

            <button
              onClick={copiarCodigo}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiado ? "Copiado correctamente" : seleccionado.codigoCopiadoEn ? "Copiar de nuevo" : "Copiar código para SIMMOW"}
            </button>
          </div>

          <FormularioRevisionConsultaExterna datos={seleccionado.datos} onChange={actualizar} onVolver={() => setPaso("lista")} />
        </div>
      )}
    </div>
  );
}
