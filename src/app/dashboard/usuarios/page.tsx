"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { TipoMedicoCuidadosCriticos, UserProfile, UserRole } from "@/types";
import { Check, ChevronDown, ChevronLeft, ChevronRight, KeyRound, Pencil, Search, Trash2, UserPlus, Users, X } from "lucide-react";

const PAGE_SIZE = 10;
import { useServicios } from "@/contexts/ServiciosContext";
import {
  serviciosPorTipoMedico,
  TIPO_MEDICO_CRITICO_LABEL,
} from "@/lib/cuidadosCriticos";

interface NuevoUsuario {
  nombre: string;
  email: string;
  username: string;
  password: string;
  userRole: UserRole;
  tipoMedico: TipoMedicoCuidadosCriticos | "";
  servicios: string[];
  jvpm: string;
  codigoMarcacion: string;
  puesto: string;
}

type EditableUsuario = Omit<NuevoUsuario, "password">;

// Solicitud de autoregistro de médico pendiente de aprobación (la API serializa
// creadoEn como ISO string).
interface PendienteMedico {
  uid: string;
  nombre: string;
  dui: string;
  jvpm: string;
  username: string;
  email: string;
  tipoMedico?: TipoMedicoCuidadosCriticos;
  servicios: string[];
  creadoEn: string | null;
}

const DEFAULT_PASSWORD = "123456";
const EMPTY_FORM: NuevoUsuario = {
  nombre: "",
  email: "",
  username: "",
  password: DEFAULT_PASSWORD,
  userRole: "medico",
  tipoMedico: "",
  servicios: [],
  jvpm: "",
  codigoMarcacion: "",
  puesto: "",
};

const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500";

const roleColors: Record<UserRole, string> = {
  esdomed: "bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-900",
  asistente_esdomed: "bg-[#1c1e4d]/10 text-[#1c1e4d] border-[#1c1e4d]/20 dark:bg-[var(--color-institutional-navy)] dark:text-[#c9a892] dark:border-[#c9a892]/30",
  trabajo_social: "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900",
  medico: "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900",
  psicologia: "bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900",
  admin: "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900",
  enfermeria: "bg-cyan-50 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-900",
  rrhh: "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900",
  transporte: "bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-900",
  motorista: "bg-lime-50 dark:bg-lime-950 text-lime-700 dark:text-lime-400 border-lime-200 dark:border-lime-900",
  isbm_tecnico: "bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-900",
  isbm_supervisor: "bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900",
  isbm_jefe: "bg-fuchsia-50 dark:bg-fuchsia-950 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-200 dark:border-fuchsia-900",
};

const roleLabels: Record<UserRole, string> = {
  esdomed: "ESDOMED",
  asistente_esdomed: "Asistente Admin. ESDOMED",
  trabajo_social: "Trabajo Social",
  medico: "Medico",
  psicologia: "Psicologia",
  admin: "Administrador Superusuario",
  enfermeria: "Enfermeria",
  rrhh: "Recursos Humanos",
  transporte: "Jefe de Transporte",
  motorista: "Motorista",
  isbm_tecnico: "Técnico ISBM",
  isbm_supervisor: "Supervisor ISBM",
  isbm_jefe: "Jefe ISBM",
};

const roleOptions: { value: UserRole; label: string }[] = [
  { value: "medico", label: "Medico" },
  { value: "esdomed", label: "Personal ESDOMED" },
  { value: "asistente_esdomed", label: "Asistente Administrativo ESDOMED" },
  { value: "trabajo_social", label: "Trabajo Social" },
  { value: "psicologia", label: "Psicologia" },
  { value: "enfermeria", label: "Enfermeria" },
  { value: "rrhh", label: "Recursos Humanos" },
  { value: "transporte", label: "Jefe de Transporte" },
  { value: "motorista", label: "Motorista" },
  { value: "isbm_tecnico", label: "Técnico ISBM" },
  { value: "isbm_supervisor", label: "Supervisor ISBM" },
  { value: "isbm_jefe", label: "Jefe ISBM" },
  { value: "admin", label: "Administrador Superusuario" },
];

// Filtro de la lista: además de un rol puntual, permite "todos" (trae la
// colección completa — deliberado, no es el valor inicial ni el default).
type FiltroRol = UserRole | "todos" | "";
const roleFilterOptions: { value: UserRole | "todos"; label: string }[] = [
  { value: "todos", label: "Todos los roles (lee toda la colección)" },
  ...roleOptions,
];

// Caché por rol consultado. Persiste durante la sesión del SPA (sobrevive a
// navegación client-side, no a recarga completa), evita releer Firestore al
// volver a un rol ya consultado.
const cacheUsuarios = new Map<string, UserProfile[]>();

export default function DashboardUsuariosPage() {
  const { user, profile } = useAuth();
  const { servicios } = useServicios();
  const esAdmin = profile?.role === "admin";
  const [usuarios, setUsuarios] = useState<UserProfile[]>([]);
  const [pendientes, setPendientes] = useState<PendienteMedico[]>([]);
  const [procesandoUid, setProcesandoUid] = useState<string | null>(null);
  // Modal de confirmación para aprobar/rechazar una solicitud de médico.
  const [accionPend, setAccionPend] = useState<{ tipo: "aprobar" | "rechazar"; p: PendienteMedico } | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  // Lectura de la lista: bajo demanda, acotada por rol. Nada se carga hasta
  // que se elige un tipo de usuario y se pulsa Consultar.
  const [loading, setLoading] = useState(false);
  const [consultado, setConsultado] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NuevoUsuario>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Mensaje del modal de "usuario ya existe" (null = cerrado).
  const [duplicadoMsg, setDuplicadoMsg] = useState<string | null>(null);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [resettingUid, setResettingUid] = useState<string | null>(null);
  const [serviciosOpen, setServiciosOpen] = useState(false);
  const [editServiciosOpen, setEditServiciosOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editForm, setEditForm] = useState<EditableUsuario | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  // Catálogo de códigos de marcación (nombre → código) para autocompletar.
  const [marcacion, setMarcacion] = useState<{ nombre: string; codigo: string }[]>([]);
  // Filtros y paginación de la lista. filtroRol arranca vacío a propósito: no
  // se lee nada hasta que se elige un tipo de usuario.
  const [filtroNombre, setFiltroNombre] = useState("");
  const [filtroRol, setFiltroRol] = useState<FiltroRol>("");
  const [pagina, setPagina] = useState(1);

  const getToken = async () => (await user?.getIdToken()) ?? "";

  useEffect(() => {
    fetch("/esdomed/marcacion.json")
      .then(r => (r.ok ? r.json() : []))
      .then(setMarcacion)
      .catch(() => setMarcacion([]));
  }, []);

  // Lectura puntual (getDocs vía API), acotada por rol — nunca trae toda la
  // colección salvo que se elija explícitamente "todos".
  const fetchUsuarios = async (rol: FiltroRol) => {
    if (!rol) return;
    setLoading(true);
    const token = await getToken();
    const res = await fetch(`/api/usuarios?role=${encodeURIComponent(rol)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setError((await res.json()).error ?? "No se pudieron cargar los usuarios");
      setUsuarios([]);
    } else {
      const data = await res.json();
      cacheUsuarios.set(rol, data);
      setUsuarios(data);
      setConsultado(true);
    }
    setLoading(false);
  };

  const fetchPendientes = async () => {
    if (!esAdmin) return;
    const token = await getToken();
    const res = await fetch("/api/registros-medicos", { headers: { Authorization: `Bearer ${token}` } });
    setPendientes(res.ok ? await res.json() : []);
  };

  useEffect(() => {
    if (!user) return;
    const timeout = window.setTimeout(() => {
      void fetchPendientes();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al cambiar de rol: si ya está en caché se muestra al instante (sin leer
  // Firestore); si no, se deja vacío hasta que se pulse Consultar. Ajuste de
  // estado en render (mismo patrón que dashboard/pacientes).
  const [filtroRolPrev, setFiltroRolPrev] = useState(filtroRol);
  if (filtroRolPrev !== filtroRol) {
    setFiltroRolPrev(filtroRol);
    const cached = filtroRol ? cacheUsuarios.get(filtroRol) : undefined;
    setUsuarios(cached ?? []);
    setConsultado(!!cached);
  }

  const abrirAccion = (tipo: "aprobar" | "rechazar", p: PendienteMedico) => {
    setMotivoRechazo("");
    setAccionPend({ tipo, p });
  };

  const confirmarAccion = async () => {
    if (!accionPend) return;
    const { tipo, p } = accionPend;
    setProcesandoUid(p.uid);
    setError("");
    const token = await getToken();
    const res = await fetch(`/api/registros-medicos/${p.uid}`, {
      method: tipo === "aprobar" ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      ...(tipo === "rechazar" ? { body: JSON.stringify({ motivo: motivoRechazo.trim() }) } : {}),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? `No se pudo ${tipo === "aprobar" ? "aprobar" : "rechazar"} la solicitud`);
    }
    setProcesandoUid(null);
    setAccionPend(null);
    setMotivoRechazo("");
    // Aprobar mueve el médico a `usuarios`; rechazar solo limpia pendientes.
    // Si hay un rol consultado en pantalla, se refresca ESE rol (no toda la
    // colección); si no hay ninguno elegido aún, no hay nada que refrescar.
    await Promise.all([
      fetchPendientes(),
      tipo === "aprobar" && filtroRol ? fetchUsuarios(filtroRol) : Promise.resolve(),
    ]);
  };

  const setField = (field: keyof NuevoUsuario) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));

  const setEditField = (field: keyof EditableUsuario) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setEditForm(prev => prev ? { ...prev, [field]: e.target.value } : prev);

  const toggleServicio = (servicio: string) => {
    setForm(prev => ({
      ...prev,
      servicios: prev.servicios.includes(servicio)
        ? prev.servicios.filter(s => s !== servicio)
        : [...prev.servicios, servicio],
    }));
  };

  const toggleEditServicio = (servicio: string) => {
    setEditForm(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        servicios: prev.servicios.includes(servicio)
          ? prev.servicios.filter(s => s !== servicio)
          : [...prev.servicios, servicio],
      };
    });
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // El correo ya está registrado: lo mostramos en un modal en vez de texto rojo.
        if (res.status === 409 && data.code === "email-already-exists") {
          setDuplicadoMsg(data.error ?? `Ya existe un usuario con el correo ${form.email}`);
          return;
        }
        throw new Error(data.error ?? "Error al crear usuario");
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      setServiciosOpen(false);
      // Refresca el rol actualmente en pantalla (si hay uno elegido). Si el
      // nuevo usuario es de otro rol, no aparecerá hasta que se consulte ese rol.
      if (filtroRol) await fetchUsuarios(filtroRol);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (uid: string, nombre: string) => {
    if (!confirm(`Eliminar a ${nombre}? Esta accion no se puede deshacer.`)) return;
    setDeletingUid(uid);
    const token = await getToken();
    const res = await fetch(`/api/usuarios/${uid}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) setError((await res.json()).error ?? "No se pudo eliminar el usuario");
    setDeletingUid(null);
    if (filtroRol) await fetchUsuarios(filtroRol);
  };

  const handleResetPassword = async (uid: string, nombre: string) => {
    if (!confirm(`Restablecer la clave de ${nombre} a ${DEFAULT_PASSWORD}?`)) return;
    setResettingUid(uid);
    setError("");
    const token = await getToken();
    const res = await fetch(`/api/usuarios/${uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ resetPassword: true }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "No se pudo restablecer la clave");
    } else {
      alert(`Clave restablecida a ${DEFAULT_PASSWORD}`);
    }
    setResettingUid(null);
  };

  const openEditUser = (u: UserProfile) => {
    const serviciosActuales = u.servicios?.length ? u.servicios : u.servicio ? [u.servicio] : [];
    setEditingUser(u);
    setEditForm({
      nombre: u.nombre,
      email: u.email,
      username: u.username ?? "",
      userRole: u.role,
      tipoMedico: u.tipoMedico ?? "",
      servicios: serviciosActuales,
      jvpm: u.jvpm ?? "",
      codigoMarcacion: u.codigoMarcacion ?? "",
      puesto: u.puesto ?? "",
    });
    setEditServiciosOpen(false);
    setError("");
  };

  const handleSaveUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editForm) return;

    setSavingEdit(true);
    setError("");
    const token = await getToken();
    const res = await fetch(`/api/usuarios/${editingUser.uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(editForm),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "No se pudo actualizar el usuario");
    } else {
      setEditingUser(null);
      setEditForm(null);
      // Si el usuario editado cambió de rol, puede desaparecer del rol en
      // pantalla al refrescar — es lo correcto (ya no pertenece a ese filtro).
      if (filtroRol) await fetchUsuarios(filtroRol);
    }
    setSavingEdit(false);
  };

  const displayServicios = (u: UserProfile) => {
    if (u.servicios?.length) return u.servicios.join(", ");
    if (u.servicio) return u.servicio;
    return "-";
  };

  const displayRole = (u: UserProfile) =>
    u.role === "medico" && u.tipoMedico
      ? TIPO_MEDICO_CRITICO_LABEL[u.tipoMedico]
      : roleLabels[u.role] || "Medico";

  const renderServiciosPicker = (
    selected: string[],
    open: boolean,
    setOpen: (value: boolean) => void,
    toggle: (servicio: string) => void,
  ) => (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
      >
        <span className="truncate text-left">
          {selected.length === 0 ? "Seleccionar servicios..." : selected.join(", ")}
        </span>
        <ChevronDown size={15} className={`flex-shrink-0 ml-2 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-1 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 max-h-52 overflow-y-auto shadow-lg">
          {servicios.map(servicio => (
            <label key={servicio}
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer text-sm text-slate-800 dark:text-slate-200">
              <input type="checkbox"
                checked={selected.includes(servicio)}
                onChange={() => toggle(servicio)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 accent-blue-600" />
              {servicio}
            </label>
          ))}
        </div>
      )}
    </>
  );

  // ── Búsqueda de texto + paginación ──
  // El rol ya viene acotado desde el servidor (fetchUsuarios); aquí solo se
  // filtra por texto dentro de ese conjunto ya cargado.
  const usuariosFiltrados = useMemo(() => {
    const q = filtroNombre.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter(u =>
      u.nombre?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.codigoMarcacion?.toLowerCase().includes(q)
    );
  }, [usuarios, filtroNombre]);

  // Al cambiar filtros, volver a la página 1 (ajuste en render, sin efecto).
  const filtrosKey = `${filtroNombre}|${filtroRol}`;
  const [prevFiltros, setPrevFiltros] = useState(filtrosKey);
  if (filtrosKey !== prevFiltros) {
    setPrevFiltros(filtrosKey);
    setPagina(1);
  }

  const totalPaginas = Math.max(1, Math.ceil(usuariosFiltrados.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const usuariosPagina = usuariosFiltrados.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);

  // Con el rol ya acotado en el servidor, "hay filtros" ahora solo se refiere
  // a la búsqueda de texto dentro de ese conjunto.
  const hayFiltros = filtroNombre.trim() !== "";

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center border border-slate-300 dark:border-slate-700">
            <Users size={17} className="text-slate-600 dark:text-slate-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Gestion de usuarios</h1>
        </div>
        <button onClick={() => { setShowForm(!showForm); setError(""); setServiciosOpen(false); }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
          {showForm ? "Cancelar" : "+ Nuevo usuario"}
        </button>
      </div>

      {esAdmin && pendientes.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <UserPlus size={17} className="text-amber-600 dark:text-amber-400" />
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Solicitudes de médicos pendientes ({pendientes.length})
              </p>
            </div>
            <Link prefetch={false} href="/dashboard/registros-medicos"
              className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline whitespace-nowrap">
              Ver historial
            </Link>
          </div>
          <div className="space-y-3">
            {pendientes.map((p) => (
              <div
                key={p.uid}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-xl px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{p.nombre}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    DUI {p.dui} · JVPM {p.jvpm}
                    {p.tipoMedico ? ` · ${TIPO_MEDICO_CRITICO_LABEL[p.tipoMedico]}` : ""}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">{p.servicios.join(", ")}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => abrirAccion("aprobar", p)}
                    disabled={procesandoUid === p.uid}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
                  >
                    <Check size={14} /> Aprobar
                  </button>
                  <button
                    onClick={() => abrirAccion("rechazar", p)}
                    disabled={procesandoUid === p.uid}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950 text-red-600 dark:text-red-400 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-50 transition-colors"
                  >
                    <X size={14} /> Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-6 space-y-4">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Crear nuevo usuario</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Nombre completo</label>
              <input type="text" value={form.nombre} onChange={setField("nombre")} required className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Correo electronico</label>
              <input type="email" value={form.email} onChange={setField("email")} required className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Usuario (para iniciar sesion)</label>
              <input type="text" value={form.username}
                onChange={e => setForm(prev => ({ ...prev, username: e.target.value.toLowerCase().replace(/\s+/g, "") }))}
                autoCapitalize="none" spellCheck={false} placeholder="ej. jperez" className={inputCls} />
              <p className="mt-1 text-[11px] text-slate-400">Opcional. 3-30 caracteres: letras, numeros, . _ -</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Contrasena inicial</label>
              <input type="password" value={form.password} onChange={setField("password")} required minLength={6} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Rol</label>
              <select value={form.userRole} onChange={setField("userRole")} className={inputCls}>
                {roleOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            {form.userRole === "medico" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Tipo de medico</label>
                  <select
                    value={form.tipoMedico}
                    onChange={e => {
                      const tipo = e.target.value as TipoMedicoCuidadosCriticos | "";
                      setForm(prev => ({
                        ...prev,
                        tipoMedico: tipo,
                        servicios: tipo ? serviciosPorTipoMedico(tipo) : prev.servicios,
                      }));
                    }}
                    className={inputCls}
                  >
                    <option value="">Medico general / servicios manuales</option>
                    <option value="uci">Medico UCI</option>
                    <option value="ucin">Medico UCIN</option>
                    <option value="uci_ucin">Medico UCI/UCIN</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">JVPM (sello)</label>
                  <input type="text" value={form.jvpm} onChange={setField("jvpm")} placeholder="Ej: ABCD-1234" className={inputCls} />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">
                    {form.tipoMedico ? "Servicios asignados automaticamente" : "Servicios del medico"}
                    {form.servicios.length > 0 && (
                      <span className="ml-2 text-blue-600 dark:text-blue-400">
                        ({form.servicios.length} seleccionado{form.servicios.length !== 1 ? "s" : ""})
                      </span>
                    )}
                  </label>
                  {form.tipoMedico ? (
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {form.servicios.map(servicio => (
                        <p key={servicio} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
                          {servicio}
                        </p>
                      ))}
                    </div>
                  ) : renderServiciosPicker(form.servicios, serviciosOpen, setServiciosOpen, toggleServicio)}
                </div>
              </>
            )}

            {(form.userRole === "psicologia" || form.userRole === "trabajo_social") && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Número de junta (JVPM)</label>
                <input type="text" value={form.jvpm} onChange={setField("jvpm")} placeholder="Ej: ABCD-1234" className={inputCls} />
              </div>
            )}

            {(form.userRole === "esdomed" || form.userRole === "asistente_esdomed" || form.userRole === "admin") && (
              <>
                {form.userRole === "admin" && (
                  <p className="sm:col-span-2 text-[11px] text-slate-400 -mb-1">
                    Opcional. Solo si este superusuario también es personal de ESDOMED y debe aparecer en el plan de horarios.
                  </p>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Código de marcación</label>
                  <input
                    type="text"
                    list="marcacion-codigos"
                    value={form.codigoMarcacion}
                    onChange={e => {
                      const v = e.target.value;
                      const match = marcacion.find(m => m.codigo === v);
                      setForm(prev => ({
                        ...prev,
                        codigoMarcacion: v,
                        // Si el código coincide con el catálogo y aún no hay nombre, lo autocompleta.
                        nombre: match && !prev.nombre.trim() ? match.nombre : prev.nombre,
                      }));
                    }}
                    placeholder="Ej: C-043"
                    className={inputCls}
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Vincula a esta persona con su fila en el plan de horarios.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Puesto</label>
                  <input
                    type="text"
                    value={form.puesto}
                    onChange={setField("puesto")}
                    placeholder="Ej: TÉCNICO EN ESTADÍSTICA Y DOCUMENTOS MÉDICOS"
                    className={inputCls}
                  />
                </div>
              </>
            )}
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
            {saving ? "Creando usuario..." : "Crear usuario"}
          </button>
        </form>
      )}

      {!showForm && error && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Filtros: el rol es obligatorio para consultar — nada se carga hasta elegirlo */}
      <div className="mb-4 flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filtroNombre}
            onChange={e => setFiltroNombre(e.target.value)}
            placeholder="Buscar por nombre, correo o código..."
            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-9 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {filtroNombre && (
            <button onClick={() => setFiltroNombre("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <X size={15} />
            </button>
          )}
        </div>
        <select
          value={filtroRol}
          onChange={e => setFiltroRol(e.target.value as FiltroRol)}
          className="sm:w-64 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="" disabled>Selecciona un tipo de usuario...</option>
          {roleFilterOptions.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button
          onClick={() => fetchUsuarios(filtroRol)}
          disabled={!filtroRol || loading}
          className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0"
        >
          <Search size={15} />
          {consultado ? "Actualizar" : "Consultar"}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 text-center py-10">Cargando usuarios...</p>
      ) : !consultado ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <Users size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">
            Selecciona un tipo de usuario y pulsa Consultar para ver la lista.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                {["Nombre / JVPM", "Correo", "Rol", "Servicio(s)", ""].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {usuariosFiltrados.length === 0 && (
                <tr><td colSpan={5} className="text-center py-10 text-slate-500">
                  {hayFiltros ? "Ningun usuario coincide con la busqueda." : "Sin usuarios con este rol."}
                </td></tr>
              )}
              {usuariosPagina.map(u => (
                <tr key={u.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{u.nombre}</p>
                    {u.username && (
                      <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5 font-mono">@{u.username}</p>
                    )}
                    {u.role === "medico" && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-mono">
                        {u.jvpm ? `JVPM: ${u.jvpm}` : <span className="italic">Sin JVPM</span>}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${roleColors[u.role] || roleColors.medico}`}>
                      {displayRole(u)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs max-w-[220px]">
                    <span className="line-clamp-2">{displayServicios(u)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEditUser(u)}
                        title="Editar usuario"
                        className="p-1 text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleResetPassword(u.uid, u.nombre)} disabled={resettingUid === u.uid}
                        title={`Restablecer clave a ${DEFAULT_PASSWORD}`}
                        className="p-1 text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 disabled:opacity-40 transition-colors">
                        <KeyRound size={15} />
                      </button>
                      <button onClick={() => handleDelete(u.uid, u.nombre)} disabled={deletingUid === u.uid}
                        title="Eliminar usuario"
                        className="p-1 text-red-500 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      {!loading && usuariosFiltrados.length > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mostrando <span className="font-semibold text-slate-700 dark:text-slate-300">{(paginaActual - 1) * PAGE_SIZE + 1}</span>
            {"–"}
            <span className="font-semibold text-slate-700 dark:text-slate-300">{Math.min(paginaActual * PAGE_SIZE, usuariosFiltrados.length)}</span>
            {" de "}
            <span className="font-semibold text-slate-700 dark:text-slate-300">{usuariosFiltrados.length}</span>
          </p>
          {totalPaginas > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={paginaActual === 1}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <span className="px-2 text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                {paginaActual} / {totalPaginas}
              </span>
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaActual === totalPaginas}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {editingUser && editForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <form onSubmit={handleSaveUser} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-0.5">Editar usuario</p>
              <h3 className="font-bold text-slate-900 dark:text-slate-100">{editingUser.nombre}</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Nombre completo</label>
                <input type="text" value={editForm.nombre} onChange={setEditField("nombre")} required className={inputCls} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Correo electronico</label>
                <input type="email" value={editForm.email} onChange={setEditField("email")} required className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Usuario (para iniciar sesion)</label>
                <input type="text" value={editForm.username}
                  onChange={e => setEditForm(prev => prev ? { ...prev, username: e.target.value.toLowerCase().replace(/\s+/g, "") } : prev)}
                  autoCapitalize="none" spellCheck={false} placeholder="ej. jperez" className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Rol</label>
                <select value={editForm.userRole} onChange={setEditField("userRole")} className={inputCls}>
                  {roleOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              {editForm.userRole === "medico" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Tipo de medico</label>
                    <select
                      value={editForm.tipoMedico}
                      onChange={e => {
                        const tipo = e.target.value as TipoMedicoCuidadosCriticos | "";
                        setEditForm(prev => prev ? {
                          ...prev,
                          tipoMedico: tipo,
                          servicios: tipo ? serviciosPorTipoMedico(tipo) : prev.servicios,
                        } : prev);
                      }}
                      className={inputCls}
                    >
                      <option value="">Medico general / servicios manuales</option>
                      <option value="uci">Medico UCI</option>
                      <option value="ucin">Medico UCIN</option>
                      <option value="uci_ucin">Medico UCI/UCIN</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">JVPM (sello)</label>
                    <input type="text" value={editForm.jvpm} onChange={setEditField("jvpm")} placeholder="Ej: ABCD-1234" className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">
                      {editForm.tipoMedico ? "Servicios asignados automaticamente" : "Servicios del medico"}
                      {editForm.servicios.length > 0 && (
                        <span className="ml-2 text-blue-600 dark:text-blue-400">
                          ({editForm.servicios.length} seleccionado{editForm.servicios.length !== 1 ? "s" : ""})
                        </span>
                      )}
                    </label>
                    {editForm.tipoMedico ? (
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {editForm.servicios.map(servicio => (
                          <p key={servicio} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
                            {servicio}
                          </p>
                        ))}
                      </div>
                    ) : renderServiciosPicker(editForm.servicios, editServiciosOpen, setEditServiciosOpen, toggleEditServicio)}
                  </div>
                </>
              )}

              {(editForm.userRole === "psicologia" || editForm.userRole === "trabajo_social") && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Número de junta (JVPM)</label>
                  <input type="text" value={editForm.jvpm} onChange={setEditField("jvpm")} placeholder="Ej: ABCD-1234" className={inputCls} />
                </div>
              )}

              {(editForm.userRole === "esdomed" || editForm.userRole === "asistente_esdomed" || editForm.userRole === "admin") && (
                <>
                  {editForm.userRole === "admin" && (
                    <p className="sm:col-span-2 text-[11px] text-slate-400 -mb-1">
                      Opcional. Solo si este superusuario también es personal de ESDOMED y debe aparecer en el plan de horarios.
                    </p>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Código de marcación</label>
                    <input
                      type="text"
                      list="marcacion-codigos"
                      value={editForm.codigoMarcacion}
                      onChange={setEditField("codigoMarcacion")}
                      placeholder="Ej: C-043"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Puesto</label>
                    <input
                      type="text"
                      value={editForm.puesto}
                      onChange={setEditField("puesto")}
                      placeholder="Ej: TÉCNICO EN ESTADÍSTICA Y DOCUMENTOS MÉDICOS"
                      className={inputCls}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => { setEditingUser(null); setEditForm(null); }}
                className="flex-1 py-2.5 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={savingEdit}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors">
                {savingEdit ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: confirmar aprobación / rechazo de una solicitud de médico. */}
      {accionPend && (() => {
        const { tipo, p } = accionPend;
        const aprobar = tipo === "aprobar";
        const procesando = procesandoUid === p.uid;
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className={`w-11 h-11 flex-shrink-0 rounded-full flex items-center justify-center border ${
                  aprobar
                    ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900"
                    : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900"
                }`}>
                  {aprobar
                    ? <Check size={20} className="text-emerald-600 dark:text-emerald-400" />
                    : <X size={20} className="text-red-600 dark:text-red-400" />}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 dark:text-slate-100">
                    {aprobar ? "Aprobar solicitud" : "Rechazar solicitud"}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    {aprobar
                      ? "Se creará la cuenta y el médico podrá iniciar sesión con su JVPM."
                      : "Se eliminará la solicitud y su acceso. Esta acción no se puede deshacer."}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-4 py-3 mb-4 text-sm">
                <p className="font-semibold text-slate-900 dark:text-slate-100">{p.nombre}</p>
                <p className="text-xs text-slate-500 mt-1">
                  DUI {p.dui} · JVPM {p.jvpm}
                  {p.tipoMedico ? ` · ${TIPO_MEDICO_CRITICO_LABEL[p.tipoMedico]}` : ""}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">{p.servicios.join(", ")}</p>
              </div>

              {!aprobar && (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Motivo del rechazo (opcional)</label>
                  <textarea
                    value={motivoRechazo}
                    onChange={(e) => setMotivoRechazo(e.target.value)}
                    rows={2}
                    placeholder="Ej: JVPM no verificado, datos incompletos..."
                    className={`${inputCls} resize-none`}
                  />
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setAccionPend(null); setMotivoRechazo(""); }}
                  disabled={procesando}
                  className="flex-1 py-2.5 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarAccion}
                  disabled={procesando}
                  className={`flex-1 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors ${
                    aprobar ? "bg-emerald-600 hover:bg-emerald-500" : "bg-red-600 hover:bg-red-500"
                  }`}
                >
                  {procesando ? "Procesando..." : aprobar ? "Aprobar" : "Rechazar"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: el correo ya pertenece a un usuario existente. */}
      {duplicadoMsg && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 flex items-center justify-center mb-4">
              <Users size={20} className="text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-1.5">El usuario ya existe</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">{duplicadoMsg}</p>
            <button
              type="button"
              onClick={() => setDuplicadoMsg(null)}
              className="w-full py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Catálogo de códigos de marcación para autocompletar (compartido). */}
      <datalist id="marcacion-codigos">
        {marcacion.map(m => (
          <option key={m.codigo} value={m.codigo}>{m.nombre}</option>
        ))}
      </datalist>
    </div>
  );
}
