"use client";

// Hoja de inconsistencia ya llena para los días elegidos en "Mis marcaciones".
// Al imprimir queda registrado el trámite E con esos días y sin adjuntos: lo único
// que le falta es la foto del recibido de RRHH (ver faltaRecibidoRrhh), que el
// empleado anexa después. Abrir una hoja ya registrada solo la reimprime.
// Lecturas: 1 consulta de copias + 1 de trámites propios + 1 plan por mes de los días.

import { Suspense, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { addDoc, collection, doc, getDoc, getDocs, query, Timestamp, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { DiaReclamadoMarcacion, InconsistenciasMarcacionPersonal, PlanTrabajo, TramitePersonal } from "@/types";
import { esPersonalPlan, filaDeUsuario } from "@/lib/esdomed/plan";
import { periodoDeFecha } from "@/lib/esdomed/permisos-plan";
import { datosFormato, fechaFormato, jefeDe, type DatosFormato } from "@/lib/inconsistenciasMarcacion/formato";
import { COLECCION_INCONSISTENCIAS_PERSONAL, contextoPlanDia, diaReclamado } from "@/lib/inconsistenciasMarcacion/personal";
import { FormatoInconsistenciaPrintLayout } from "@/components/marcacion/FormatoInconsistenciaPrintLayout";

// `useSearchParams` obliga a un límite de Suspense en el App Router.
export default function FormatoInconsistenciaPage() {
  return (
    <Suspense fallback={<Pantalla><Cargando /></Pantalla>}>
      <FormatoVista />
    </Suspense>
  );
}

function Pantalla({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white p-6 dark:bg-slate-950">{children}</div>;
}

function Cargando() {
  return <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />;
}

function FormatoVista() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const periodo = searchParams.get("periodo");
  const dias = searchParams.get("dias");
  const puedeVer = !!profile && esPersonalPlan(profile.role, profile.codigoMarcacion);

  const [hojas, setHojas] = useState<DatosFormato[] | null>(null);
  const [plaza, setPlaza] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reclamados, setReclamados] = useState<DiaReclamadoMarcacion[]>([]);
  // Ya hay un trámite vivo con estos días: imprimir no crea otro.
  const [registrado, setRegistrado] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [errorRegistro, setErrorRegistro] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && profile && !puedeVer) router.replace("/dashboard");
  }, [authLoading, profile, puedeVer, router]);

  useEffect(() => {
    if (!profile || !puedeVer) return;
    const fechas = (dias ?? "").split(",").filter(Boolean);
    let cancelado = false;
    (async () => {
      const [copias, tramites] = await Promise.all([
        getDocs(query(collection(db, COLECCION_INCONSISTENCIAS_PERSONAL), where("empleadoId", "==", profile.uid))),
        getDocs(query(collection(db, "tramites_personal"), where("empleadoId", "==", profile.uid))),
      ]);
      const copia = copias.docs.map((d) => d.data() as InconsistenciasMarcacionPersonal).find((c) => c.periodo === periodo);
      const elegidos = (copia?.dias ?? []).filter((d) => fechas.includes(d.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha));
      const periodos = [...new Set(elegidos.map((d) => periodoDeFecha(d.fecha)))];
      const planes = Object.fromEntries(
        await Promise.all(
          periodos.map((p) =>
            getDoc(doc(db, "planes_trabajo", p))
              .then((s) => [p, s.exists() ? ({ id: s.id, ...s.data() } as PlanTrabajo) : null] as const)
              .catch(() => [p, null] as const),
          ),
        ),
      );
      if (cancelado) return;
      const filas = elegidos.flatMap((d) => {
        const plan = planes[periodoDeFecha(d.fecha)];
        const fila = plan ? filaDeUsuario(plan, profile) : undefined;
        const hoja = datosFormato(d, fila);
        return hoja ? [{ hoja, reclamado: diaReclamado(d, contextoPlanDia(fila, d)) }] : [];
      });
      setPlaza(copia?.plaza ?? "");
      setReclamados(filas.map((f) => f.reclamado));
      setRegistrado(
        tramites.docs.some((s) => {
          const t = s.data() as TramitePersonal;
          return t.estado !== "rechazado" && t.reclamoMarcacion?.dias.some((d) => fechas.includes(d.fecha));
        }),
      );
      setHojas(filas.map((f) => f.hoja));
    })().catch((e) => {
      if (!cancelado) setError(`No se pudo armar el formato: ${e instanceof Error ? e.message : "error"}`);
    });
    return () => {
      cancelado = true;
    };
  }, [profile, puedeVer, periodo, dias]);

  const emision = useMemo(() => fechaFormato(new Date()), []);

  // El navegador no avisa si el diálogo de impresión se canceló: se registra al
  // pedir la impresión y, si no salió, se reimprime desde la misma hoja.
  const imprimir = async () => {
    if (!registrado) {
      if (!profile || !periodo) return;
      setRegistrando(true);
      setErrorRegistro(null);
      try {
        await addDoc(collection(db, "tramites_personal"), {
          categoria: "E_inconsistencias_marcacion",
          empleadoId: profile.uid,
          empleadoNombre: profile.nombre,
          estado: "subido",
          reclamoMarcacion: { periodo, dias: reclamados },
          creadoEn: Timestamp.now(),
        });
        setRegistrado(true);
      } catch (e) {
        console.error(e);
        setErrorRegistro("No se pudo registrar el trámite, así que no se imprimió. Intenta de nuevo.");
        return;
      } finally {
        setRegistrando(false);
      }
    }
    window.print();
  };

  if (error) {
    return (
      <Pantalla>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{error}</p>
        <button onClick={() => router.push("/dashboard/mis-marcaciones")} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← Volver a Mis marcaciones
        </button>
      </Pantalla>
    );
  }
  if (authLoading || !profile || !puedeVer || hojas === null) {
    return (
      <Pantalla>
        <Cargando />
      </Pantalla>
    );
  }
  if (!hojas.length) {
    return (
      <Pantalla>
        <p className="mb-3 max-w-md text-center text-sm text-slate-600 dark:text-slate-300">
          Estos días no admiten el formato: solo aplica cuando falta la marca de entrada o la de salida.
        </p>
        <button onClick={() => router.push("/dashboard/mis-marcaciones")} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← Volver a Mis marcaciones
        </button>
      </Pantalla>
    );
  }


  return createPortal(
    <div className="formato-impresion fixed inset-0 z-[220] overflow-y-auto bg-slate-200 print:static print:inset-auto print:overflow-visible print:bg-white dark:bg-slate-950">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white shadow-sm print:hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <button
            onClick={() => router.push("/dashboard/mis-marcaciones")}
            className="flex items-center gap-1.5 text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          >
            <ArrowLeft size={15} />
            Volver
          </button>
          <button
            onClick={imprimir}
            disabled={registrando}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
          >
            <Printer size={14} />
            {registrando ? "Registrando…" : "Imprimir / Guardar PDF"}
          </button>
        </div>
        <p className="mx-auto max-w-5xl px-4 pb-3 text-xs text-slate-500 dark:text-slate-400">
          {hojas.length === 1 ? "Una hoja." : `${hojas.length} hojas, una por día.`}{" "}
          {registrado
            ? "Ya quedó registrada: fírmala, pide el Vo. Bo. de tu jefe y llévala a RRHH. Después solo anexas la foto del recibido desde Mis marcaciones."
            : "Al imprimir queda registrado tu trámite; después solo anexas la foto del recibido de RRHH."}
        </p>
        {errorRegistro && <p className="mx-auto max-w-5xl px-4 pb-3 text-xs font-medium text-red-700 dark:text-red-400">{errorRegistro}</p>}
      </div>

      <div className="overflow-x-auto py-6 print:overflow-visible print:py-0">
        <div className="mx-auto w-fit print:w-auto">
          <FormatoInconsistenciaPrintLayout
            dias={hojas}
            emision={emision}
            empleado={{
              nombre: profile.nombre.toLocaleUpperCase("es"),
              cargo: profile.puesto || plaza.toLocaleUpperCase("es"),
              codigo: profile.codigoMarcacion ?? "",
            }}
            jefe={jefeDe(profile.codigoMarcacion)}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
