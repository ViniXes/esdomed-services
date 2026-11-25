"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2, UsersRound } from "lucide-react";
import { DateField } from "@/components/ui/DateField";
import { hoySV } from "@/lib/consultaExterna/actualizaciones";
import {
  TIPOS_ACTIVIDAD, labelActividad, validarActividad, type ActividadTSCE, type AreaTSCE,
} from "@/lib/consultaExterna/trabajoSocial";
import { mensaje, useTS } from "./contexto";
import { Aviso, Cargando, Chips, Encabezado, Vacio, botonPrimario, botonTexto, fechaCorta, inputCls, preguntaCls, tarjeta } from "./ui";

// Lo que no es de un paciente: charlas, reuniones, correspondencia. Cuenta en
// la productividad aparte de las gestiones.

export function ActividadesTS() {
  const { llamar, area, uid, esAdmin } = useTS();
  const hoy = hoySV();
  const [mes] = useState(() => hoy.slice(0, 7));
  const [lista, setLista] = useState<ActividadTSCE[] | null>(null);
  const [tipo, setTipo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [asistentes, setAsistentes] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [porBorrar, setPorBorrar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

  useEffect(() => {
    let vivo = true;
    llamar<{ actividades: ActividadTSCE[] }>(`/actividades?mes=${mes}`)
      .then((r) => { if (vivo) setLista(r.actividades); })
      .catch((e) => { if (vivo) setError(mensaje(e)); });
    return () => { vivo = false; };
  }, [llamar, mes]);

  const t = TIPOS_ACTIVIDAD.find((x) => x.id === tipo);
  const guardar = async () => {
    const v = validarActividad({ tipo, detalle, asistentes: asistentes === "" ? 0 : Number(asistentes), area: (area || "otra") as AreaTSCE, fecha }, hoySV());
    if (!v.ok) { setError(v.error); return; }
    setGuardando(true);
    setError("");
    try {
      const r = await llamar<{ actividad: ActividadTSCE }>("/actividades", "POST", { actividad: v.datos });
      if (r.actividad.fecha.slice(0, 7) === mes) setLista((l) => [r.actividad, ...(l ?? [])]);
      setExito(`${labelActividad(v.datos.tipo)} registrada.`);
      setTipo(""); setDetalle(""); setAsistentes(""); setFecha(hoySV());
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (a: ActividadTSCE) => {
    setError("");
    try {
      await llamar(`/actividades/${a.id}`, "DELETE");
      setLista((l) => (l ?? []).filter((x) => x.id !== a.id));
      setPorBorrar("");
    } catch (e) {
      setError(mensaje(e));
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <Encabezado icono={UsersRound} titulo="Otras actividades" detalle="Trabajo Social de Consulta Externa" />

      {exito && <Aviso tipo="exito">{exito}</Aviso>}
      <form className={`${tarjeta} space-y-5 p-4 md:p-5`} onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
        <div>
          <p className={preguntaCls}>¿Qué actividad hizo?</p>
          <Chips opciones={TIPOS_ACTIVIDAD} valor={tipo} onChange={(v) => { setTipo(v); setExito(""); setError(""); }} etiqueta="Tipo de actividad" />
        </div>
        {t && (
          <>
            <label className="block">
              <span className={preguntaCls}>{t.pregunta}</span>
              <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={2} maxLength={500} className={`${inputCls} resize-y`} />
            </label>
            <div className="flex flex-wrap items-end gap-4">
              {t.asistentes && (
                <label className="w-32">
                  <span className={preguntaCls}>Asistentes</span>
                  <input value={asistentes} inputMode="numeric" onChange={(e) => setAsistentes(e.target.value.replace(/\D/g, "").slice(0, 4))} className={inputCls} />
                </label>
              )}
              <div className="w-44">
                <p className={preguntaCls}>Fecha</p>
                <DateField value={fecha} onChange={(f) => setFecha(f || hoy)} ariaLabel="Fecha de la actividad" maxDate={new Date(`${hoy}T00:00:00`)} />
              </div>
              <button type="submit" disabled={guardando} className={`${botonPrimario} ml-auto`}>
                {guardando && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}Registrar actividad
              </button>
            </div>
          </>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
      </form>

      <section>
        <h2 className="mb-3 font-heading text-sm font-bold text-slate-900 dark:text-slate-100">Registradas este mes</h2>
        {!lista ? (!error && <Cargando />) : lista.length === 0 ? (
          <Vacio icono={UsersRound} titulo="Sin actividades este mes" />
        ) : (
          <ul className={`${tarjeta} divide-y divide-slate-100 overflow-hidden dark:divide-slate-800`}>
            {lista.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{labelActividad(a.tipo)}</p>
                  <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{a.detalle}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {fechaCorta(a.fecha)} · {a.autorNombre}{a.asistentes > 0 && ` · ${a.asistentes} asistentes`}
                  </p>
                </div>
                {(esAdmin || a.autor === uid) && (porBorrar === a.id ? (
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => setPorBorrar("")} className={botonTexto}>Cancelar</button>
                    <button type="button" onClick={() => void borrar(a)} className={`${botonTexto} text-rose-700 dark:text-rose-300`}>Sí, borrar</button>
                  </span>
                ) : (
                  <button type="button" aria-label="Borrar la actividad" onClick={() => setPorBorrar(a.id)} className={botonTexto}><Trash2 size={14} /></button>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
