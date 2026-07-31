"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileCode2, CheckCircle2, Copy, Check, AlertTriangle, Stethoscope, Building2, Download } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { extraerDocumento } from "@/lib/simmow/pdfEngine";
import { esFieh, extraerFieh } from "@/lib/simmow/fiehExtractor";
import {
  esCertificado,
  extraerCertificado,
  fusionarCertificado,
  limpiarCamposCertificado,
} from "@/lib/simmow/certificadoExtractor";
import { aplicarReglasCondicionEgreso } from "@/lib/simmow/reglas";
import { generarScriptConsola } from "@/lib/simmow/generadorScript";
import {
  cargarEstablecimientos,
  esEstablecimientoPrivado,
  mejorCoincidenciaEstablecimiento,
} from "@/lib/simmow/establecimientos";
import { cargarMedicos, mejorCoincidenciaMedico } from "@/lib/simmow/medicos";
import type { DatosSimmow, DocumentoExtraido, ResultadoExtraccion } from "@/lib/simmow/types";
import { PasoCarga, type DatosCarga } from "@/components/simmow/PasoCarga";
import { FormularioRevision } from "@/components/simmow/FormularioRevision";
import { cruzarReportes } from "@/lib/simmow/ambulatorioMapeo";
import { semanaEpidemiologica } from "@/lib/simmow/texto";
import { generarScriptConsolaAmbulatorio } from "@/lib/simmow/ambulatorioGeneradorScript";
import type { PacienteAmbulatorio } from "@/lib/simmow/ambulatorioTypes";
import { PasoCargaAmbulatorio, type DatosCargaAmbulatorio } from "@/components/simmow/PasoCargaAmbulatorio";
import { ListaPacientesAmbulatorio } from "@/components/simmow/ListaPacientesAmbulatorio";
import { FormularioRevisionAmbulatorio } from "@/components/simmow/FormularioRevisionAmbulatorio";
import { DateField } from "@/components/ui/DateField";
import { TerminosSimmowGate } from "@/components/simmow/TerminosSimmowGate";
import { ReportarErrorSimmow } from "@/components/simmow/ReportarErrorSimmow";
import { VerTerminosSimmow } from "@/components/simmow/VerTerminosSimmow";
import { RecordatorioTerminosSimmow } from "@/components/simmow/RecordatorioTerminosSimmow";

type Flujo = "elegir" | "hospitalaria" | "ambulatoria";
type Paso = "carga" | "revision";
type PasoAmbulatorio = "carga" | "lista" | "revision";

// Al recargar la página no debe botar al personal de vuelta a "elegir flujo"
// ni borrar de un solo la lista de pacientes ya cruzada — se guarda en el
// navegador un rato (pedido explícito del usuario) para sobrevivir un
// refresh accidental. TTL corto: es progreso de trabajo del día, no algo que
// deba sobrevivir para siempre (ni cruzar días distintos por error).
const CLAVE_ESTADO_AMBULATORIO = "simmow_ambulatorio_estado";
const TTL_ESTADO_AMBULATORIO_MS = 4 * 60 * 60 * 1000; // 4 horas

interface EstadoPersistidoAmbulatorio {
  guardadoEn: number;
  pasoAmb: PasoAmbulatorio;
  pacientesAmb: PacienteAmbulatorio[];
  expedienteSeleccionado: string | null;
}

function cargarEstadoAmbulatorioGuardado(): EstadoPersistidoAmbulatorio | null {
  if (typeof window === "undefined") return null;
  try {
    const crudo = window.localStorage.getItem(CLAVE_ESTADO_AMBULATORIO);
    if (!crudo) return null;
    const estado = JSON.parse(crudo) as EstadoPersistidoAmbulatorio;
    if (Date.now() - estado.guardadoEn > TTL_ESTADO_AMBULATORIO_MS) {
      window.localStorage.removeItem(CLAVE_ESTADO_AMBULATORIO);
      return null;
    }
    return estado;
  } catch {
    return null;
  }
}

/**
 * Resuelve el código interno de SIMMOW para el médico y el código del
 * establecimiento de referencia contra los catálogos reales — mismo
 * mecanismo que ya usa el flujo hospitalario, aplicado una vez por cada
 * paciente cruzado antes de mostrar la lista.
 */
async function enriquecerPacientesAmbulatorio(pacientes: PacienteAmbulatorio[]): Promise<PacienteAmbulatorio[]> {
  const [medicos, establecimientos] = await Promise.all([cargarMedicos(), cargarEstablecimientos()]);

  return pacientes.map((p) => {
    const datos = { ...p.datos };

    if (datos.medicoNombre) {
      const coincidenciaMedico = mejorCoincidenciaMedico(medicos, datos.medicoNombre);
      if (coincidenciaMedico) datos.medicoCodigoSimmow = coincidenciaMedico.codigo;
    }

    if (datos.establecimientoReferidoTexto) {
      const coincidenciaEstablecimiento = mejorCoincidenciaEstablecimiento(
        establecimientos,
        datos.establecimientoReferidoTexto
      );
      if (coincidenciaEstablecimiento) {
        datos.establecimientoReferidoCodigo = coincidenciaEstablecimiento.codigo;
        // "Priv" para privados (Hospital/Clínica Privada...), "Establec" para
        // el resto del catálogo (Hospital Nacional, UCSF, Unidad de Salud...).
        datos.refdeValor = esEstablecimientoPrivado(coincidenciaEstablecimiento.nombre) ? "2" : "3";
      }
    }

    // "Referido A" no trae dato de origen en ninguno de los dos reportes hoy
    // (se completa a mano en el formulario de revisión) — si algún día se
    // resuelve automáticamente un establecimiento para este campo, debe
    // decidir Priv/Establec con el mismo criterio de arriba
    // (esEstablecimientoPrivado), no dejarlo fijo en "Establec".

    return { ...p, datos };
  });
}

/**
 * Reemplaza los tres campos de establecimiento con el nombre EXACTO del
 * catálogo real de SIMMOW cuando hay una coincidencia confiable (el FIEH
 * puede traer el nombre en otro orden o con leves diferencias). Si no hay
 * suficiente certeza, deja el texto tal como se extrajo del FIEH para que
 * el personal lo busque/corrija a mano en el formulario.
 */
async function sugerirEstablecimientosDelCatalogo(datos: DatosSimmow): Promise<DatosSimmow> {
  const campos: Array<"REFERIDO_A_ESTABLECIMIENTO" | "REFERIDO_DEL_ESTABLECIMIENTO" | "RETORNO_HACIA"> = [
    "REFERIDO_A_ESTABLECIMIENTO",
    "REFERIDO_DEL_ESTABLECIMIENTO",
    "RETORNO_HACIA",
  ];
  if (!campos.some((campo) => datos[campo])) return datos;

  const catalogo = await cargarEstablecimientos();
  const actualizado = { ...datos };

  for (const campo of campos) {
    const valor = actualizado[campo];
    if (!valor) continue;
    const coincidencia = mejorCoincidenciaEstablecimiento(catalogo, valor);
    if (coincidencia) actualizado[campo] = coincidencia.nombre;
  }

  return actualizado;
}

/**
 * Resuelve el código interno de SIMMOW para el médico responsable del alta,
 * buscando por NOMBRE (el mismo en SIS y SIMMOW) contra el catálogo real de
 * médicos — el JVPM del SIS no coincide con el código que SIMMOW espera en
 * ese campo, por eso el nombre nunca precargaba automáticamente antes. Si no
 * hay una coincidencia única y confiable, deja el código vacío para que el
 * personal lo busque/confirme a mano.
 */
async function sugerirMedicoDelCatalogo(datos: DatosSimmow): Promise<DatosSimmow> {
  if (!datos.MEDICO_RESPONSABLE_ALTA) return datos;

  const catalogo = await cargarMedicos();
  const coincidencia = mejorCoincidenciaMedico(catalogo, datos.MEDICO_RESPONSABLE_ALTA);
  if (!coincidencia) return datos;

  return { ...datos, MEDICO_RESPONSABLE_CODIGO_SIMMOW: coincidencia.codigo };
}

export default function SimmowPage() {
  const router = useRouter();
  const { profile, loading } = useAuth();

  const [flujo, setFlujo] = useState<Flujo>("elegir");

  const [paso, setPaso] = useState<Paso>("carga");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documento, setDocumento] = useState<DocumentoExtraido | null>(null);
  const [resultado, setResultado] = useState<ResultadoExtraccion | null>(null);
  const [datos, setDatos] = useState<DatosSimmow | null>(null);
  const [errorGeneracion, setErrorGeneracion] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const [pasoAmb, setPasoAmb] = useState<PasoAmbulatorio>("carga");
  const [procesandoAmb, setProcesandoAmb] = useState(false);
  const [errorAmb, setErrorAmb] = useState<string | null>(null);
  const [pacientesAmb, setPacientesAmb] = useState<PacienteAmbulatorio[]>([]);
  const [seleccionadoAmb, setSeleccionadoAmb] = useState<PacienteAmbulatorio | null>(null);
  const [copiadoAmb, setCopiadoAmb] = useState(false);
  const [listoParaPersistirAmb, setListoParaPersistirAmb] = useState(false);

  // Restaura el progreso guardado apenas monta EN EL CLIENTE — tiene que ser
  // un efecto, no un initializer perezoso de useState: esta página se
  // renderiza primero en el servidor (sin localStorage) y Next.js hidrata
  // usando ese resultado, así que un initializer nunca llega a ver el valor
  // real guardado en el navegador.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect --
       Restaurar desde localStorage solo puede pasar tras montar en el
       cliente (no hay "última prop/estado" de React que sincronizar acá,
       es una carga única desde una fuente externa al primer render). */
    const estado = cargarEstadoAmbulatorioGuardado();
    if (estado) {
      setFlujo("ambulatoria");
      setPasoAmb(estado.pasoAmb);
      setPacientesAmb(estado.pacientesAmb);
      if (estado.expedienteSeleccionado) {
        const p = estado.pacientesAmb.find((x) => x.expediente === estado.expedienteSeleccionado);
        if (p) setSeleccionadoAmb(p);
      }
    }
    setListoParaPersistirAmb(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Persiste el progreso de Ambulatoria (con timestamp para el TTL) cada vez
  // que cambia, para sobrevivir un refresh accidental de la página. Se frena
  // hasta que termine la restauración de arriba, para no pisar lo guardado
  // con el estado inicial vacío antes de restaurarlo.
  useEffect(() => {
    if (!listoParaPersistirAmb) return;
    if (pacientesAmb.length === 0 && pasoAmb === "carga") {
      window.localStorage.removeItem(CLAVE_ESTADO_AMBULATORIO);
      return;
    }
    const estado: EstadoPersistidoAmbulatorio = {
      guardadoEn: Date.now(),
      pasoAmb,
      pacientesAmb,
      expedienteSeleccionado: seleccionadoAmb?.expediente ?? null,
    };
    window.localStorage.setItem(CLAVE_ESTADO_AMBULATORIO, JSON.stringify(estado));
  }, [listoParaPersistirAmb, pasoAmb, pacientesAmb, seleccionadoAmb]);

  // La fecha no se extrae de los reportes (no es verídica) — se pide al
  // personal con doble confirmación antes de generar el código, para no
  // dejarla a la suerte de una sola digitación.
  const [fechaConfirmadaAmb, setFechaConfirmadaAmb] = useState<string | null>(null);
  const [fechaTemp1Amb, setFechaTemp1Amb] = useState("");
  const [fechaTemp2Amb, setFechaTemp2Amb] = useState("");
  const [errorFechaAmb, setErrorFechaAmb] = useState<string | null>(null);

  // Mismos roles que pueden ver el enlace en dashboard/layout.tsx (esdomed,
  // asistente_esdomed y admin) — el resto de roles no debe poder abrir la
  // página aunque escriba la URL directamente.
  const puedeVerSimmow = profile?.role === "esdomed" || profile?.role === "asistente_esdomed" || profile?.role === "admin";

  useEffect(() => {
    if (!loading && profile && !puedeVerSimmow) {
      router.replace("/dashboard");
    }
  }, [loading, profile, puedeVerSimmow, router]);

  if (!profile || !puedeVerSimmow) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const procesar = async ({ condicion, archivoFieh, archivoCertificado }: DatosCarga) => {
    setError(null);
    setProcesando(true);
    try {
      const docFieh = await extraerDocumento(archivoFieh);
      if (!esFieh(docFieh.textoCompleto)) {
        setError(
          docFieh.textoCompleto.trim().length < 100
            ? "El FIEH parece un escaneo (imagen) sin texto digital — esta herramienta solo procesa el PDF generado por el sistema, no fotocopias."
            : "El PDF no parece ser un FIEH (Formulario de Ingreso y Egreso Hospitalario)."
        );
        return;
      }

      const resFieh = extraerFieh(docFieh);
      let datosFinal = resFieh.datos;
      let advertencias = [...resFieh.advertencias];
      let camposNoEncontrados = [...resFieh.camposNoEncontrados];

      // La condición seleccionada manualmente tiene prioridad sobre la casilla
      // detectada en el FIEH (que puede no ser legible en todos los casos).
      datosFinal.CONDICION_EGRESO = condicion;

      if (condicion === "MUERTO") {
        if (!archivoCertificado) {
          setError("Debe subir el Certificado de Defunción para un paciente fallecido.");
          return;
        }

        const docCert = await extraerDocumento(archivoCertificado);
        if (!esCertificado(docCert.textoCompleto)) {
          setError(
            docCert.textoCompleto.trim().length < 100
              ? "El Certificado parece un escaneo (imagen) sin texto digital — esta herramienta solo procesa el PDF generado por el sistema."
              : "El PDF no parece ser un Certificado de Defunción."
          );
          return;
        }

        const resCert = extraerCertificado(docCert);
        datosFinal = fusionarCertificado(datosFinal, resCert.datos);
        advertencias = [...advertencias, ...resCert.advertencias];
        camposNoEncontrados = [...camposNoEncontrados, ...resCert.camposNoEncontrados];
      } else {
        datosFinal = limpiarCamposCertificado(datosFinal);
      }

      datosFinal = aplicarReglasCondicionEgreso(datosFinal);
      datosFinal = await sugerirEstablecimientosDelCatalogo(datosFinal);
      datosFinal = await sugerirMedicoDelCatalogo(datosFinal);

      setDocumento(docFieh);
      setResultado({ datos: datosFinal, advertencias, camposNoEncontrados });
      setDatos(datosFinal);
      setPaso("revision");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error procesando el PDF.");
    } finally {
      setProcesando(false);
    }
  };

  const actualizar = (patch: Partial<DatosSimmow>) => {
    setDatos((d) => (d ? { ...d, ...patch } : d));
  };

  const reiniciar = () => {
    setDocumento(null);
    setResultado(null);
    setDatos(null);
    setErrorGeneracion(null);
    setCopiado(false);
    setError(null);
    setPaso("carga");
  };

  const copiarCodigo = async () => {
    if (!datos) return;
    if (!datos.EDAD_ANIOS.trim()) {
      setErrorGeneracion(
        "Falta la edad en años (EDAD_ANIOS). Complétela en el formulario antes de generar el código."
      );
      return;
    }
    setErrorGeneracion(null);
    const codigo = generarScriptConsola(datos, resultado?.advertencias ?? []);

    try {
      await navigator.clipboard.writeText(codigo);
    } catch {
      // Navegadores sin permiso/soporte para el Clipboard API: respaldo con
      // un textarea invisible + execCommand, sin mostrar el código en pantalla.
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
  };

  // ── Flujo Atención Ambulatoria ──────────────────────────────────────────

  // DateField trabaja en "YYYY-MM-DD"; SIMMOW espera "DD/MM/AAAA".
  const isoAFechaSimmow = (iso: string): string => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    return `${m[3]}/${m[2]}/${m[1]}`;
  };

  const isoADateLocal = (iso: string): Date | null => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };

  // Comparación lexicográfica de "YYYY-MM-DD" equivale a comparación cronológica.
  const hoyIso = (): string => {
    const h = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${h.getFullYear()}-${p(h.getMonth() + 1)}-${p(h.getDate())}`;
  };

  const confirmarFechaAmbulatorio = () => {
    if (!fechaTemp1Amb || !fechaTemp2Amb) {
      setErrorFechaAmb("Seleccione la fecha en ambos calendarios.");
      return;
    }
    if (fechaTemp1Amb !== fechaTemp2Amb) {
      setErrorFechaAmb("Las dos fechas no coinciden — vuelva a seleccionar.");
      return;
    }
    if (fechaTemp1Amb > hoyIso()) {
      setErrorFechaAmb("La fecha no puede ser mayor a hoy — verifique el día seleccionado.");
      return;
    }
    setErrorFechaAmb(null);
    setFechaConfirmadaAmb(isoAFechaSimmow(fechaTemp1Amb));
  };

  const procesarAmbulatorio = async ({ filasEmergencia, filasRegistro }: DatosCargaAmbulatorio) => {
    if (!fechaConfirmadaAmb) {
      setErrorAmb("Confirme la fecha de esta atención antes de cruzar los reportes.");
      return;
    }
    setErrorAmb(null);
    setProcesandoAmb(true);
    try {
      const cruzados = cruzarReportes(filasEmergencia, filasRegistro);
      if (cruzados.length === 0) {
        setErrorAmb("No se encontraron pacientes al cruzar los dos reportes.");
        return;
      }
      const enriquecidos = await enriquecerPacientesAmbulatorio(cruzados);
      // La fecha (y la semana epidemiológica que se calcula de ahí) se
      // confirmó una sola vez para todo el lote — Registro Diario de
      // Emergencia es, por definición, el listado de un solo día.
      const fechaComoDate = isoADateLocal(fechaTemp1Amb);
      const semana = fechaComoDate ? String(semanaEpidemiologica(fechaComoDate)) : "";
      const conFecha = enriquecidos.map((p) => ({
        ...p,
        datos: { ...p.datos, fecha: fechaConfirmadaAmb, semanaEpidemiologica: semana },
      }));
      setPacientesAmb(conFecha);
      setPasoAmb("lista");
    } catch (err) {
      setErrorAmb(err instanceof Error ? err.message : "Error procesando los reportes.");
    } finally {
      setProcesandoAmb(false);
    }
  };

  const actualizarAmb = (patch: Partial<PacienteAmbulatorio["datos"]>) => {
    setSeleccionadoAmb((p) => (p ? { ...p, datos: { ...p.datos, ...patch } } : p));
  };

  const reiniciarAmb = () => {
    setPasoAmb("carga");
    setPacientesAmb([]);
    setSeleccionadoAmb(null);
    setErrorAmb(null);
    setCopiadoAmb(false);
    setFechaConfirmadaAmb(null);
    setFechaTemp1Amb("");
    setFechaTemp2Amb("");
    setErrorFechaAmb(null);
  };

  const seleccionarPacienteAmb = (p: PacienteAmbulatorio) => {
    setSeleccionadoAmb(p);
    setPasoAmb("revision");
  };

  const TEXTO_SEXO: Record<string, string> = { "1": "Masculino", "2": "Femenino", "3": "Intersexual" };
  const TEXTO_AREA: Record<string, string> = { "1": "Urbana", "2": "Rural" };
  const TEXTO_TIPO_ISSS: Record<string, string> = { "1": "Cotizante", "2": "Beneficiario" };

  /**
   * Reporte consolidado (Excel) para que el personal lo tenga abierto al lado
   * mientras revisa cada código generado antes de grabarlo en SIMMOW — mismo
   * espíritu que el "REPORTE EMERGENCIA COMPLETO" que arman a mano hoy, pero
   * ya con los códigos de médico/establecimiento resueltos contra el catálogo
   * real de SIMMOW (lo que de verdad hay que verificar).
   */
  const exportarReporteConsolidadoAmb = async () => {
    const XLSX = await import("xlsx");

    const filas = pacientesAmb.map((p) => {
      const d = p.datos;
      return {
        Expediente: d.expediente,
        "Nombre del Paciente": d.paciente,
        DUI: d.dui,
        Sexo: TEXTO_SEXO[d.sexoValor] ?? "",
        "Edad (años)": d.edadAnios,
        Departamento: d.departamento,
        "Municipio / Distrito": d.municipio,
        Área: TEXTO_AREA[d.areaValor] ?? "",
        "Cód. CIE-10 Dx Principal": d.diagPrincipalCodigo,
        "Diagnóstico Principal": d.diagPrincipalTexto,
        "Cód. CIE-10 Dx Secundario": d.diagSecundarioCodigo,
        "Diagnóstico Secundario": d.diagSecundarioTexto,
        "Cód. CIE-10 Causa Externa": d.causaExternaCodigo,
        "Causa Externa de Morbilidad": d.causaExternaTexto,
        Médico: d.medicoNombre,
        "Código SIMMOW Médico": d.medicoCodigoSimmow,
        "Ingreso Hospitalario": d.ingresoHospitalario ? "Sí" : "No",
        "Afiliación ISSS": d.isss ? "Sí" : "No",
        "Tipo ISSS": TEXTO_TIPO_ISSS[d.tipoIsssValor] ?? "",
        "N° de Afiliación": d.numeroAfiliacion,
        "Establecimiento Referido (texto original)": d.establecimientoReferidoTexto,
        "Código SIMMOW Establecimiento": d.establecimientoReferidoCodigo,
        Fecha: d.fecha,
        "Semana Epidemiológica": d.semanaEpidemiologica,
        "En Pacientes Atendidos En Emergencia": p.enPacientesAtendidos ? "Sí" : "No",
        Advertencias: p.advertencias.join(" / "),
      };
    });

    const hoja = XLSX.utils.json_to_sheet(filas);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Atención Ambulatoria");
    const nombreArchivo = `reporte_consolidado_ambulatoria_${fechaConfirmadaAmb?.replace(/\//g, "-") ?? "sin_fecha"}.xlsx`;
    XLSX.writeFile(libro, nombreArchivo);
  };

  const copiarCodigoAmbulatorio = async () => {
    if (!seleccionadoAmb) return;
    const codigo = generarScriptConsolaAmbulatorio(seleccionadoAmb.datos, seleccionadoAmb.advertencias);

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

    setCopiadoAmb(true);
    setTimeout(() => setCopiadoAmb(false), 2500);

    // Marca este paciente como "ya copiado" (en la lista y en el seleccionado)
    // para avisar si se vuelve a abrir/copiar y así no duplicar la atención
    // en SIMMOW — solo se marca cuando de verdad se hizo clic en copiar, no
    // solo por abrir la pantalla de revisión.
    const ahora = Date.now();
    const expedienteActual = seleccionadoAmb.expediente;
    setPacientesAmb((lista) =>
      lista.map((p) => (p.expediente === expedienteActual ? { ...p, codigoCopiadoEn: ahora } : p))
    );
    setSeleccionadoAmb((p) => (p ? { ...p, codigoCopiadoEn: ahora } : p));
  };

  return (
    <>
      <TerminosSimmowGate />
      <ReportarErrorSimmow />
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <FileCode2 className="h-6 w-6 text-blue-600 dark:text-[#c9a892]" />
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          SIMMOW — Generador de código de llenado
        </h1>
        <span className="ml-auto">
          <VerTerminosSimmow />
        </span>
        <button
          onClick={() => router.push("/dashboard/simmow/reportes")}
          className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          Ver reportes de errores
        </button>
        {flujo !== "elegir" && (
          <button
            onClick={() => setFlujo("elegir")}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            Cambiar de flujo
          </button>
        )}
      </div>

      <RecordatorioTerminosSimmow />

      {flujo === "elegir" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => setFlujo("hospitalaria")}
            className="flex flex-col items-start gap-2 text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm hover:border-blue-400 dark:hover:border-blue-700 transition-colors"
          >
            <Building2 className="h-6 w-6 text-blue-600 dark:text-[#c9a892]" />
            <span className="font-semibold text-slate-800 dark:text-slate-100">Atención Hospitalaria</span>
            <span className="text-xs text-slate-500">
              Traslados/egresos — sube el FIEH (y el Certificado de Defunción si aplica).
            </span>
          </button>
          <button
            onClick={() => setFlujo("ambulatoria")}
            className="flex flex-col items-start gap-2 text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm hover:border-blue-400 dark:hover:border-blue-700 transition-colors"
          >
            <Stethoscope className="h-6 w-6 text-blue-600 dark:text-[#c9a892]" />
            <span className="font-semibold text-slate-800 dark:text-slate-100">Atención Ambulatoria</span>
            <span className="text-xs text-slate-500">
              Consultas de Emergencia — sube los reportes del SIS &ldquo;Pacientes Atendidos&rdquo; y
              &ldquo;Registro Diario&rdquo;.
            </span>
          </button>
        </div>
      )}

      {flujo === "hospitalaria" && (
        <>
          {paso === "carga" && (
            <PasoCarga procesando={procesando} error={error} onProcesar={procesar} />
          )}

      {paso === "revision" && resultado && datos && documento && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Extracción completada — {documento.numPaginas} páginas — {datos.CONDICION_EGRESO}
              </h2>
              <button
                onClick={reiniciar}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Procesar otro
              </button>
            </div>

            {resultado.advertencias.length > 0 && (
              <div className="mb-4 space-y-1">
                {resultado.advertencias.map((a, i) => (
                  <div
                    key={i}
                    className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2"
                  >
                    {a}
                  </div>
                ))}
              </div>
            )}

            {errorGeneracion && (
              <div className="mb-4 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
                {errorGeneracion}
              </div>
            )}

            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2 mb-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Este código no presiona &quot;Grabar&quot; en SIMMOW. Abra SIMMOW, entre a la pantalla de
                Ingreso/Egreso del paciente, presione F12 para abrir la consola, pegue el código, presione
                Enter, y revise cada campo antes de grabar manualmente. <b>Esta herramienta ayuda con la mayor
                parte del llenado, pero no es responsable de errores de digitación — esa responsabilidad es del
                personal operativo</b>. Solo se asume responsabilidad por errores de programación ya reportados y
                confirmados.
              </span>
            </div>

            <button
              onClick={copiarCodigo}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiado ? "Copiado correctamente" : "Copiar código para SIMMOW"}
            </button>
          </div>

          <FormularioRevision
            datos={datos}
            camposNoEncontrados={resultado.camposNoEncontrados}
            onChange={actualizar}
          />
        </div>
      )}
        </>
      )}

      {flujo === "ambulatoria" && (
        <>
          {pasoAmb === "carga" && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Fecha de esta atención (Registro Diario de Emergencia es el listado de un solo día — se aplica a
                  todos los pacientes de este lote)
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  No se extrae de los reportes porque no es confiable. Selecciónela dos veces del calendario para
                  confirmar — un error aquí es responsabilidad de quien digita.
                </p>
                <div className="flex flex-wrap gap-2 items-center">
                  <DateField
                    value={fechaTemp1Amb}
                    onChange={(v) => {
                      setFechaTemp1Amb(v);
                      setFechaConfirmadaAmb(null);
                    }}
                    placeholder="Fecha"
                    className="w-40"
                    maxDate={new Date()}
                  />
                  <DateField
                    value={fechaTemp2Amb}
                    onChange={(v) => {
                      setFechaTemp2Amb(v);
                      setFechaConfirmadaAmb(null);
                    }}
                    placeholder="Confirmar fecha"
                    className="w-40"
                    maxDate={new Date()}
                  />
                  <button
                    onClick={confirmarFechaAmbulatorio}
                    disabled={!fechaTemp1Amb || !fechaTemp2Amb}
                    className="px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Confirmar fecha
                  </button>
                  {fechaConfirmadaAmb && (
                    <span className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Confirmada: {fechaConfirmadaAmb} — Semana
                      Epidemiológica {isoADateLocal(fechaTemp1Amb) ? semanaEpidemiologica(isoADateLocal(fechaTemp1Amb)!) : ""}
                    </span>
                  )}
                </div>
                {errorFechaAmb && <p className="text-xs text-red-600 dark:text-red-400">{errorFechaAmb}</p>}
              </div>

              {fechaConfirmadaAmb ? (
                <PasoCargaAmbulatorio procesando={procesandoAmb} error={errorAmb} onProcesar={procesarAmbulatorio} />
              ) : (
                <p className="text-xs text-slate-500">Confirme la fecha para habilitar la carga de reportes.</p>
              )}
            </div>
          )}

          {pasoAmb === "lista" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  {pacientesAmb.length} pacientes cruzados — elija uno para revisar y generar el código
                </h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={exportarReporteConsolidadoAmb}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white font-medium rounded-lg transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" /> Descargar reporte consolidado (Excel)
                  </button>
                  <button
                    onClick={reiniciarAmb}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  >
                    Procesar otros reportes
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Descargue el reporte y ábralo en Excel para ir marcando/comparando cada paciente mientras revisa el
                código generado, antes de grabarlo en SIMMOW.
              </p>
              <ListaPacientesAmbulatorio pacientes={pacientesAmb} onSeleccionar={seleccionarPacienteAmb} />
            </div>
          )}

          {pasoAmb === "revision" && seleccionadoAmb && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
                {seleccionadoAmb.advertencias.length > 0 && (
                  <div className="mb-3 space-y-1">
                    {seleccionadoAmb.advertencias.map((a, i) => (
                      <div
                        key={i}
                        className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2"
                      >
                        {a}
                      </div>
                    ))}
                  </div>
                )}
                {seleccionadoAmb.codigoCopiadoEn && (
                  <div className="flex items-start gap-2 text-xs text-orange-800 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border border-orange-300 dark:border-orange-800 rounded-lg px-3 py-2 mb-3 font-medium">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      Ya generó y copió el código de este paciente antes, el{" "}
                      {new Date(seleccionadoAmb.codigoCopiadoEn).toLocaleString("es-SV")}. Verifique que no lo haya
                      grabado ya en SIMMOW antes de pegarlo de nuevo — evite duplicar la atención.
                    </span>
                  </div>
                )}
                <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2 mb-3">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Este código no presiona &quot;Grabar&quot; en SIMMOW. Abra SIMMOW, entre a la pantalla de
                    Ingreso/Edición Consulta Curativa, presione F12 para abrir la consola, pegue el código, presione
                    Enter, y revise cada campo antes de grabar manualmente. <b>Esta herramienta ayuda con la mayor
                    parte del llenado, pero la responsabilidad de una digitación correcta en SIMMOW sigue siendo del
                    personal operativo</b> — revise cada campo antes de grabar.
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={copiarCodigoAmbulatorio}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {copiadoAmb ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copiadoAmb
                      ? "Copiado correctamente"
                      : seleccionadoAmb.codigoCopiadoEn
                        ? "Copiar de nuevo"
                        : "Copiar código para SIMMOW"}
                  </button>
                  <span className="text-xs text-slate-500">Fecha confirmada para este lote: {fechaConfirmadaAmb}</span>
                </div>
              </div>

              <FormularioRevisionAmbulatorio
                datos={seleccionadoAmb.datos}
                onChange={actualizarAmb}
                onVolver={() => setPasoAmb("lista")}
              />
            </div>
          )}
        </>
      )}
      </div>
    </>
  );
}
