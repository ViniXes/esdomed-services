"use client";

import { useEffect, useMemo, useState } from "react";
import { Star, UsersRound } from "lucide-react";
import { collection, doc, getDoc, getDocs, query, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { PlanTrabajo, UserProfile } from "@/types";
import { COLOR_GRUPO, PERIODO_ACTUAL, labelPeriodo, ordenGrupo } from "@/lib/esdomed/plan";
import { normalizarCodigoMarcacion } from "@/lib/esdomed/catalogo-plan";
import { esEnMemoria, fechaBajaCorta } from "@/lib/bajaUsuarios";

// Personal de trabajo — el equipo ESDOMED en tarjetas, agrupado por el grupo
// que cada persona tiene en el plan de trabajo del mes en curso (1 lectura del
// plan + la colección de usuarios ESDOMED, sin listeners).
//
// Los compañeros fallecidos (baja con tipo "fallecimiento") van primero, en la
// sección "En memoria", con tarjeta dorada y estrella. El dorado es una
// excepción deliberada al design system: no es un color decorativo, es el
// homenaje. Queda concentrado en TarjetaMemorial para no contaminar el resto.

const ROLES_PERMITIDOS = new Set(["esdomed", "asistente_esdomed", "admin"]);
const SIN_GRUPO = "Sin grupo asignado este mes";

type Persona = Pick<UserProfile, "uid" | "nombre" | "codigoMarcacion" | "puesto" | "role" | "activo" | "baja">;

export default function PersonalTrabajoPage() {
  const { profile } = useAuth();
  const role = profile?.role;
  const miUid = profile?.uid;
  const [personal, setPersonal] = useState<Persona[]>([]);
  const [plan, setPlan] = useState<PlanTrabajo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // Sin rol permitido no se lee nada: el render muestra el aviso de acceso
    // antes de mirar `loading`.
    if (!role || !ROLES_PERMITIDOS.has(role)) return;
    let cancelado = false;
    Promise.all([
      getDocs(query(collection(db, "usuarios"), where("role", "in", ["esdomed", "asistente_esdomed", "admin"]))),
      getDoc(doc(db, "planes_trabajo", PERIODO_ACTUAL)),
    ])
      .then(([snap, planSnap]) => {
        if (cancelado) return;
        const lista = snap.docs
          .map((d) => ({ uid: d.id, ...d.data() } as Persona))
          // Un admin solo cuenta como personal ESDOMED si tiene código de marcación.
          .filter((u) => u.role !== "admin" || Boolean(u.codigoMarcacion?.trim()))
          // Vigentes + fallecidos (en memoria). Otras bajas (retiro, traslado)
          // ya no forman parte del equipo y no se muestran.
          .filter((u) => u.activo !== false || esEnMemoria(u));
        setPersonal(lista);
        setPlan(planSnap.exists() ? (planSnap.data() as PlanTrabajo) : null);
      })
      .catch(() => {
        if (!cancelado) setError("No se pudo cargar el personal. Intenta de nuevo.");
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [role]);

  // Grupo de cada persona según el plan del mes (por uid, respaldo por código).
  const grupoDe = useMemo(() => {
    const porUid = new Map<string, string>();
    const porCodigo = new Map<string, string>();
    for (const f of plan?.filas ?? []) {
      const g = f.grupo?.trim() || "";
      if (!g) continue;
      if (f.uid) porUid.set(f.uid, g);
      const c = normalizarCodigoMarcacion(f.codigoMarcacion);
      if (c) porCodigo.set(c, g);
    }
    return (u: Persona) => porUid.get(u.uid) || porCodigo.get(normalizarCodigoMarcacion(u.codigoMarcacion)) || "";
  }, [plan]);

  const enMemoria = useMemo(
    () => personal.filter(esEnMemoria).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [personal],
  );

  const secciones = useMemo(() => {
    const mapa = new Map<string, Persona[]>();
    for (const u of personal) {
      if (esEnMemoria(u)) continue;
      const g = grupoDe(u) || SIN_GRUPO;
      if (!mapa.has(g)) mapa.set(g, []);
      mapa.get(g)!.push(u);
    }
    return [...mapa.entries()]
      .sort(([a], [b]) => {
        if (a === SIN_GRUPO) return 1;
        if (b === SIN_GRUPO) return -1;
        return ordenGrupo(a) - ordenGrupo(b) || a.localeCompare(b);
      })
      .map(([grupo, personas]) => ({
        grupo,
        personas: personas.sort((a, b) => a.nombre.localeCompare(b.nombre)),
      }));
  }, [personal, grupoDe]);

  const totalVigentes = personal.length - enMemoria.length;

  if (role && !ROLES_PERMITIDOS.has(role)) {
    return (
      <div className="p-6 text-sm text-slate-500">Esta sección es del personal de ESDOMED.</div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-900">
          <UsersRound size={17} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Personal de trabajo</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Equipo ESDOMED
            {loading ? "" : ` · ${totalVigentes} ${totalVigentes === 1 ? "persona" : "personas"}`}
            {!loading && plan ? ` · grupos según el plan de ${labelPeriodo(PERIODO_ACTUAL)}` : ""}
          </p>
        </div>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500 text-center py-10">Cargando personal...</p>
      ) : (
        <>
          {/* En memoria */}
          {enMemoria.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-1">
                <Star size={14} className="fill-[#d4af37] text-[#b8860b]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#8a6508] dark:text-[#e5c76a]">En memoria</h2>
                <span className="h-px flex-1 bg-gradient-to-r from-[#d4af37]/60 to-transparent" />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Compañeros que formaron parte de este equipo y a quienes recordamos con cariño.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {enMemoria.map((u) => (
                  <TarjetaMemorial key={u.uid} persona={u} />
                ))}
              </div>
            </section>
          )}

          {secciones.length === 0 && enMemoria.length === 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
              <UsersRound size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-sm text-slate-500">No hay personal ESDOMED registrado.</p>
            </div>
          )}

          {/* Equipo vigente, por grupo del mes */}
          {secciones.map(({ grupo, personas }) => {
            const estilo = COLOR_GRUPO[grupo];
            return (
              <section key={grupo} className="mb-7">
                <div className="flex items-center gap-2 mb-3">
                  {estilo && <span className={`h-2.5 w-2.5 rounded-full ${estilo.dot}`} />}
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{grupo}</h2>
                  <span className="text-[11px] font-medium text-slate-400">{personas.length}</span>
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {personas.map((u) => (
                    <TarjetaPersona key={u.uid} persona={u} estiloAvatar={estilo?.badge} esYo={u.uid === miUid} />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

function TarjetaPersona({
  persona,
  estiloAvatar,
  esYo,
}: {
  persona: Persona;
  estiloAvatar?: string;
  esYo: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border p-3.5 transition-colors ${
        esYo
          ? "border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/30"
          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
      }`}
    >
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          estiloAvatar ?? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        }`}
      >
        {inicialesNombre(persona.nombre)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white leading-tight">
          <span className="truncate" title={persona.nombre}>{persona.nombre}</span>
          {esYo && (
            <span className="shrink-0 rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold text-white">TÚ</span>
          )}
        </p>
        <p className="mt-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300">
          {persona.codigoMarcacion || "Sin código"}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={persona.puesto}>
          {persona.puesto || "Sin puesto"}
        </p>
      </div>
    </div>
  );
}

// Tarjeta dorada de homenaje. Hex explícitos a propósito (ver nota al inicio).
function TarjetaMemorial({ persona }: { persona: Persona }) {
  const fecha = fechaBajaCorta(persona.baja?.fecha);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#d4af37] bg-gradient-to-br from-[#fffae8] via-[#fbefc4] to-[#f2dd9b] p-4 shadow-[0_10px_30px_-14px_rgba(184,134,11,0.55)] dark:border-[#d4af37]/70 dark:from-[#3b300f] dark:via-[#4b3d14] dark:to-[#5c4a16]">
      {/* Brillo suave en la esquina */}
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/50 blur-2xl dark:bg-[#f3d87a]/10" />
      <Star
        size={18}
        aria-hidden
        className="absolute right-3 top-3 fill-[#d4af37] text-[#b8860b] drop-shadow-[0_0_6px_rgba(212,175,55,0.7)]"
      />

      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f1d778] to-[#b8860b] text-base font-bold text-white shadow-md ring-2 ring-white/70 dark:ring-[#f3d87a]/40">
          {inicialesNombre(persona.nombre)}
        </div>
        <div className="min-w-0 flex-1 pr-5">
          <p className="truncate text-sm font-bold text-[#5c4300] dark:text-[#f7e6a6]" title={persona.nombre}>
            {persona.nombre}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-[#8a6508] dark:text-[#e5c76a]">
            {persona.codigoMarcacion || "Sin código"}
          </p>
          <p className="truncate text-[11px] text-[#7a5f14] dark:text-[#d9c27a]" title={persona.puesto}>
            {persona.puesto || "Sin puesto"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#d4af37]/40 pt-2.5">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#8a6508] dark:text-[#e5c76a]">
          <Star size={11} className="fill-current" aria-hidden /> En memoria
        </span>
        {fecha && <span className="text-[11px] text-[#7a5f14] dark:text-[#d9c27a]">{fecha}</span>}
      </div>
      <p className="mt-1.5 text-[11px] italic text-[#7a5f14]/90 dark:text-[#d9c27a]/90">
        Siempre parte del equipo ESDOMED.
      </p>
    </div>
  );
}

function inicialesNombre(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "?";
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[palabras.length - 1][0]).toUpperCase();
}
