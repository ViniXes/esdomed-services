"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { gestionaConsultaExterna } from "@/lib/accesoConsultaExterna";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Database, Loader2, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  NOMBRE_DIA,
  choquesDeConsultorio,
  franjasDelMedico,
  idFranja,
  limpiarTexto,
  slugMedico,
  validarCatalogo,
  type CatalogoCitas,
  type DiaSemana,
  type FranjaCatalogo,
} from "@/lib/consultaExterna/citasProgramadas";
import { catalogoSemilla, guardarCatalogoCitas, leerCatalogoCitas } from "@/lib/consultaExterna/citasProgramadasDatos";
import { ESPECIALIDADES_CE } from "@/lib/consultaExterna/especialidades";

// Catálogo de la programación 2027: médicos (nombre exacto del SIS),
// consultorios y franjas semanales con su cupo. Se edita en memoria y se
// guarda entero en un documento.

const tarjeta = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";
const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const th = "px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";
const td = "px-2 py-1.5 align-middle";
const boton =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

type Pestana = "medicos" | "consultorios" | "horarios";
const DIAS_ORDEN: DiaSemana[] = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

export default function CatalogoCitasPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  // No está en el menú: el layout no la veta. Quien solo registra citas vuelve a la lista.
  const permitido = gestionaConsultaExterna(profile);
  useEffect(() => {
    if (profile && !permitido) router.replace("/consulta-externa/citas-2027");
  }, [profile, permitido, router]);
  const [cat, setCat] = useState<CatalogoCitas | null | undefined>(undefined);
  const [guardadoEn, setGuardadoEn] = useState<string>("");
  const [cambios, setCambios] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("medicos");
  const [medicoHorario, setMedicoHorario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => {
    leerCatalogoCitas()
      .then((c) => {
        setCat(c);
        if (c?.actualizadoEn) {
          setGuardadoEn(`${c.actualizadoEn.toDate().toLocaleString("es-SV")} por ${c.actualizadoPorNombre ?? ""}`);
        }
      })
      .catch((e) => {
        console.error("No se pudo leer el catálogo", e);
        setMensaje({ tono: "error", texto: "No se pudo leer el catálogo. Recargue la página." });
        setCat(null);
      });
  }, []);

  const especialidades = useMemo(() => {
    const set = new Set<string>(ESPECIALIDADES_CE.map((e) => e.nombre));
    for (const m of cat?.medicos ?? []) set.add(m.especialidad);
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [cat]);

  const errores = useMemo(() => (cat ? validarCatalogo(cat) : []), [cat]);
  const choques = useMemo(() => (cat ? choquesDeConsultorio(cat) : []), [cat]);

  const editar = (f: (c: CatalogoCitas) => CatalogoCitas) => {
    setCat((c) => (c ? f(c) : c));
    setCambios(true);
    setMensaje(null);
  };

  const sembrar = async () => {
    const semilla = await catalogoSemilla();
    setCat(semilla);
    setCambios(true);
    setMensaje({ tono: "ok", texto: "Catálogo cargado del libro de agendas. Revíselo y presione Guardar." });
  };

  const guardar = async () => {
    if (!cat || !user) return;
    setGuardando(true);
    setMensaje(null);
    try {
      await guardarCatalogoCitas(cat, { uid: user.uid, nombre: profile?.nombre ?? user.email ?? "" });
      setCambios(false);
      setGuardadoEn(`${new Date().toLocaleString("es-SV")} por ${profile?.nombre ?? ""}`);
      setMensaje({ tono: "ok", texto: "Catálogo guardado." });
    } catch (e) {
      console.error("No se pudo guardar el catálogo", e);
      setMensaje({ tono: "error", texto: e instanceof Error ? e.message : "No se pudo guardar el catálogo." });
    } finally {
      setGuardando(false);
    }
  };

  // ── Médicos ──
  const agregarMedico = () => {
    const nombre = limpiarTexto(window.prompt("Nombre completo del médico, escrito exactamente como en el SIS:") ?? "");
    if (!nombre || !cat) return;
    const id = slugMedico(nombre);
    if (cat.medicos.some((m) => m.id === id)) {
      window.alert("Ese médico ya está en el catálogo.");
      return;
    }
    editar((c) => ({
      ...c,
      medicos: [...c.medicos, { id, nombre, especialidad: especialidades[0] ?? "", consultorioFijo: "", activo: true }],
    }));
  };

  // ── Consultorios ──
  const agregarConsultorio = () => {
    editar((c) => ({ ...c, consultorios: [...c.consultorios, { nombre: "", especialidad: especialidades[0] ?? "", activo: true }] }));
  };

  // ── Franjas ──
  const medicoSel = cat?.medicos.find((m) => m.id === medicoHorario);
  const franjasMedico = cat && medicoHorario ? franjasDelMedico(cat, medicoHorario) : [];
  const consultoriosDe = (esp: string) => (cat?.consultorios ?? []).filter((c) => c.especialidad === esp && c.activo);

  const cambiarFranja = (id: string, cambio: Partial<FranjaCatalogo>) =>
    editar((c) => ({
      ...c,
      franjas: c.franjas.map((f) => {
        if (f.id !== id) return f;
        // El id no cambia al editar: es la llave de la fila.
        return { ...f, ...cambio };
      }),
    }));

  const agregarFranja = () => {
    if (!medicoSel) return;
    const ultima = franjasMedico[franjasMedico.length - 1];
    const dia: DiaSemana = ultima?.dia ?? "lunes";
    const inicio = ultima ? ultima.fin : "08:00";
    const [h, m] = inicio.split(":").map(Number);
    const fin = `${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    editar((c) => ({
      ...c,
      franjas: [
        ...c.franjas,
        {
          id: c.franjas.some((f) => f.id === idFranja(medicoSel.id, dia, inicio))
            ? `${idFranja(medicoSel.id, dia, inicio)}_${Date.now()}`
            : idFranja(medicoSel.id, dia, inicio),
          medicoId: medicoSel.id,
          dia,
          inicio,
          fin,
          cupo: ultima?.cupo ?? 4,
          consultorio: ultima?.consultorio ?? medicoSel.consultorioFijo,
        },
      ],
    }));
  };

  if (!permitido) return null;

  if (cat === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={26} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/consulta-externa/citas-2027" className="mb-1 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
            <ArrowLeft size={14} /> Citas 2027
          </Link>
          <h1 className="text-2xl font-bold font-heading text-slate-900 dark:text-white">Catálogo de agendas</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Médicos, consultorios y horarios con su cupo. Escriba los nombres exactamente como en el SIS: así se pasarán las citas.
          </p>
          {guardadoEn && <p className="mt-1 text-xs text-slate-400">Última versión guardada: {guardadoEn}</p>}
        </div>
        {cat && (
          <button type="button" onClick={() => void guardar()} disabled={!cambios || guardando || errores.length > 0} className={`${boton} bg-blue-600 text-white hover:bg-blue-700`}>
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {cambios ? "Guardar cambios" : "Guardado"}
          </button>
        )}
      </div>

      {mensaje && (
        <p className={`text-sm ${mensaje.tono === "ok" ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600"}`}>{mensaje.texto}</p>
      )}

      {!cat ? (
        <div className={`${tarjeta} space-y-3 text-sm text-slate-600 dark:text-slate-300`}>
          <p>
            Aún no hay catálogo. Se puede crear con lo que trae el libro <em>agendas redistribuidas</em> (actualizado al 13/10/2026):
            28 médicos, 17 consultorios y 176 horarios semanales.
          </p>
          <button type="button" onClick={() => void sembrar()} className={`${boton} bg-blue-600 text-white hover:bg-blue-700`}>
            <Database size={16} /> Crear catálogo desde el libro de agendas
          </button>
        </div>
      ) : (
        <>
          {errores.length > 0 && (
            <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <ul className="list-disc pl-4">{errores.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
          {choques.length > 0 && (
            <details className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <summary className="cursor-pointer font-medium">{choques.length} consultorio(s) con dos médicos a la misma hora</summary>
              <ul className="mt-2 list-disc pl-5">{choques.map((c) => <li key={c}>{c}</li>)}</ul>
            </details>
          )}

          <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
            {(
              [
                ["medicos", `Médicos (${cat.medicos.length})`],
                ["consultorios", `Consultorios (${cat.consultorios.length})`],
                ["horarios", "Horarios"],
              ] as const
            ).map(([k, t]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPestana(k)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                  pestana === k ? "border-blue-600 text-blue-700 dark:text-blue-300" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {pestana === "medicos" && (
            <section className={tarjeta}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={th}>Nombre (como en el SIS)</th>
                      <th className={th}>Especialidad</th>
                      <th className={th}>Consultorio fijo</th>
                      <th className={th}>Horas/sem.</th>
                      <th className={th}>Activo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {[...cat.medicos]
                      .sort((a, b) => a.especialidad.localeCompare(b.especialidad, "es") || a.nombre.localeCompare(b.nombre, "es"))
                      .map((m) => (
                        <tr key={m.id} className={m.activo ? "" : "opacity-60"}>
                          <td className={td}>
                            <input
                              className={campo}
                              value={m.nombre}
                              onChange={(e) => editar((c) => ({ ...c, medicos: c.medicos.map((x) => (x.id === m.id ? { ...x, nombre: e.target.value } : x)) }))}
                              onBlur={(e) => editar((c) => ({ ...c, medicos: c.medicos.map((x) => (x.id === m.id ? { ...x, nombre: limpiarTexto(e.target.value) } : x)) }))}
                            />
                          </td>
                          <td className={td}>
                            <select
                              className={campo}
                              value={m.especialidad}
                              onChange={(e) => editar((c) => ({ ...c, medicos: c.medicos.map((x) => (x.id === m.id ? { ...x, especialidad: e.target.value, consultorioFijo: "" } : x)) }))}
                            >
                              {especialidades.map((e) => <option key={e} value={e}>{e}</option>)}
                            </select>
                          </td>
                          <td className={td}>
                            <select
                              className={campo}
                              value={m.consultorioFijo}
                              onChange={(e) => editar((c) => ({ ...c, medicos: c.medicos.map((x) => (x.id === m.id ? { ...x, consultorioFijo: e.target.value } : x)) }))}
                            >
                              <option value="">Sin consultorio</option>
                              {consultoriosDe(m.especialidad).map((k) => <option key={k.nombre} value={k.nombre}>{k.nombre}</option>)}
                            </select>
                          </td>
                          <td className={`${td} text-slate-500`}>{cat.franjas.filter((f) => f.medicoId === m.id).length}</td>
                          <td className={td}>
                            <input
                              type="checkbox"
                              checked={m.activo}
                              onChange={(e) => editar((c) => ({ ...c, medicos: c.medicos.map((x) => (x.id === m.id ? { ...x, activo: e.target.checked } : x)) }))}
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={agregarMedico} className={`${boton} mt-4 border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200`}>
                <Plus size={16} /> Agregar médico
              </button>
            </section>
          )}

          {pestana === "consultorios" && (
            <section className={tarjeta}>
              <p className="mb-3 text-xs text-slate-500">Un consultorio inactivo deja de ofrecerse, pero las citas ya registradas lo conservan.</p>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={th}>Nombre (como en el SIS)</th>
                    <th className={th}>Especialidad</th>
                    <th className={th}>Activo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {cat.consultorios.map((k, i) => (
                    <tr key={i} className={k.activo ? "" : "opacity-60"}>
                      <td className={td}>
                        <input
                          className={campo}
                          value={k.nombre}
                          placeholder="Hematología - 6"
                          onChange={(e) => editar((c) => ({ ...c, consultorios: c.consultorios.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)) }))}
                          onBlur={(e) => editar((c) => ({ ...c, consultorios: c.consultorios.map((x, j) => (j === i ? { ...x, nombre: limpiarTexto(e.target.value) } : x)) }))}
                        />
                      </td>
                      <td className={td}>
                        <select
                          className={campo}
                          value={k.especialidad}
                          onChange={(e) => editar((c) => ({ ...c, consultorios: c.consultorios.map((x, j) => (j === i ? { ...x, especialidad: e.target.value } : x)) }))}
                        >
                          {especialidades.map((e) => <option key={e} value={e}>{e}</option>)}
                        </select>
                      </td>
                      <td className={td}>
                        <input
                          type="checkbox"
                          checked={k.activo}
                          onChange={(e) => editar((c) => ({ ...c, consultorios: c.consultorios.map((x, j) => (j === i ? { ...x, activo: e.target.checked } : x)) }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" onClick={agregarConsultorio} className={`${boton} mt-4 border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200`}>
                <Plus size={16} /> Agregar consultorio
              </button>
            </section>
          )}

          {pestana === "horarios" && (
            <section className={tarjeta}>
              <div className="mb-4 max-w-md">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500" htmlFor="medh">Médico</label>
                <select id="medh" className={campo} value={medicoHorario} onChange={(e) => setMedicoHorario(e.target.value)}>
                  <option value="">Elija…</option>
                  {[...cat.medicos]
                    .sort((a, b) => a.especialidad.localeCompare(b.especialidad, "es") || a.nombre.localeCompare(b.nombre, "es"))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.especialidad} · {m.nombre}
                      </option>
                    ))}
                </select>
              </div>

              {medicoSel && (
                <>
                  {franjasMedico.length === 0 ? (
                    <p className="text-sm text-slate-500">Sin horarios. Agregue el primero.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className={th}>Día</th>
                          <th className={th}>Inicio</th>
                          <th className={th}>Fin</th>
                          <th className={th}>Cupo</th>
                          <th className={th}>Consultorio</th>
                          <th className={th}></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {franjasMedico.map((f) => (
                          <tr key={f.id}>
                            <td className={td}>
                              <select className={campo} value={f.dia} onChange={(e) => cambiarFranja(f.id, { dia: e.target.value as DiaSemana })}>
                                {DIAS_ORDEN.map((d) => <option key={d} value={d}>{NOMBRE_DIA[d]}</option>)}
                              </select>
                            </td>
                            <td className={td}>
                              <input type="time" className={campo} value={f.inicio} onChange={(e) => cambiarFranja(f.id, { inicio: e.target.value })} />
                            </td>
                            <td className={td}>
                              <input type="time" className={campo} value={f.fin} onChange={(e) => cambiarFranja(f.id, { fin: e.target.value })} />
                            </td>
                            <td className={td}>
                              <input
                                type="number"
                                min={1}
                                max={30}
                                className={`${campo} w-20`}
                                value={f.cupo}
                                onChange={(e) => cambiarFranja(f.id, { cupo: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                              />
                            </td>
                            <td className={td}>
                              <select className={campo} value={f.consultorio} onChange={(e) => cambiarFranja(f.id, { consultorio: e.target.value })}>
                                <option value="">Sin consultorio</option>
                                {consultoriosDe(medicoSel.especialidad).map((k) => <option key={k.nombre} value={k.nombre}>{k.nombre}</option>)}
                              </select>
                            </td>
                            <td className={`${td} text-right`}>
                              <button
                                type="button"
                                title="Quitar horario"
                                className="text-slate-500 hover:text-rose-600"
                                onClick={() => editar((c) => ({ ...c, franjas: c.franjas.filter((x) => x.id !== f.id) }))}
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <button type="button" onClick={agregarFranja} className={`${boton} mt-4 border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200`}>
                    <Plus size={16} /> Agregar horario
                  </button>
                  <p className="mt-2 text-xs text-slate-500">
                    Quitar o cambiar un horario no toca las citas ya registradas; solo cambia lo que se ofrece para citas nuevas.
                  </p>
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
