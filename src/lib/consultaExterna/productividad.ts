// Productividad de Consulta Externa: reglas puras (sin Firebase), compartidas
// por la pestaña Consulta Externa, la pestaña Administrativos y la prueba
// (node scripts/test-productividad-ce.mjs).
//
// Tres fuentes, ya guardadas por sus pantallas:
// - Expedientes creados (reporte del SIS): uno por expediente, acreditado a quien
//   lo creó en el SIS. Se agrupa por su usuario de services (creadoPorUid).
// - Actualizaciones de datos en el SIS: una por persona, paciente y día, aunque
//   se hayan actualizado varios tipos (hechoPor).
// - Citas 2027 registradas en services (creadaPor), por el día en que se
//   registraron. No cuentan las anuladas (anular es deshacer, como en
//   Actualizaciones) ni las migradas por script desde Excel (no son de nadie).
//
// Quién va en cada pestaña lo decide la página: los administrativos del plan
// salen en Administrativos; en Consulta Externa, el resto del personal evaluable
// con producción (hoy, las digitadoras de Consulta Externa).

export interface RegistroExpedienteCE {
  creadoPorUid: string | null;
  /** Nombre en services (usuarios.nombre); null si el nombre del SIS no calzó con nadie. */
  creadoPorNombre: string | null;
  /** Nombre tal como lo escribe el SIS. */
  creadoPorSis: string;
  /** YYYY-MM-DD (fecha de creación del SIS). */
  fechaCreacion: string;
  personaNueva: boolean;
}

export interface ActualizacionCE {
  hechoPor: string;
  hechoPorNombre: string;
  /** YYYY-MM-DD (día en que se registró). */
  fecha: string;
  tipos: string[];
}

export interface CitaRegistradaCE {
  creadaPor: string;
  creadaPorNombre: string;
  /** YYYY-MM-DD (día en que se registró, hora de El Salvador). */
  fecha: string;
  anulada: boolean;
}

/** Las citas migradas por script llevan este creadaPor (ver CLAUDE.md, Citas 2027). */
export const CREADA_POR_MIGRACION = "migracion";

export interface FilaProductividadCE {
  /** uid de services. */
  clave: string;
  nombre: string;
  expedientes: number;
  nuevosPadron: number;
  actualizaciones: number;
  identificacion: number;
  responsable: number;
  citas: number;
}

export interface ProductividadCE {
  filas: FilaProductividadCE[];
  /** Creadores del SIS sin usuario en services (p. ej. "SIS Referencia Retorno"): no son personas a evaluar. */
  sinUsuario: { nombre: string; expedientes: number }[];
}

export const totalFilaCE = (f: Pick<FilaProductividadCE, "expedientes" | "actualizaciones" | "citas">) => f.expedientes + f.actualizaciones + f.citas;

/** Cita que cuenta como productividad: registrada por una persona y no anulada. */
export const citaCuenta = (c: CitaRegistradaCE) => Boolean(c.creadaPor) && c.creadaPor !== CREADA_POR_MIGRACION && !c.anulada;

/** Mayúsculas, sin tildes y con un solo espacio: para comparar nombres. */
export function claveNombre(nombre: string): string {
  return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

export function productividadPorPersona(registros: RegistroExpedienteCE[], actualizaciones: ActualizacionCE[], citas: CitaRegistradaCE[] = []): ProductividadCE {
  const filas = new Map<string, FilaProductividadCE>();
  const fila = (clave: string, nombre: string) => {
    const f = filas.get(clave) ?? { clave, nombre, expedientes: 0, nuevosPadron: 0, actualizaciones: 0, identificacion: 0, responsable: 0, citas: 0 };
    if (!f.nombre && nombre) f.nombre = nombre;
    filas.set(clave, f);
    return f;
  };
  const sinUsuario = new Map<string, number>();

  for (const r of registros) {
    if (!r.creadoPorUid) {
      const nombre = r.creadoPorSis || "Sin nombre";
      sinUsuario.set(nombre, (sinUsuario.get(nombre) ?? 0) + 1);
      continue;
    }
    const f = fila(r.creadoPorUid, r.creadoPorNombre ?? r.creadoPorSis);
    f.expedientes++;
    if (r.personaNueva) f.nuevosPadron++;
  }
  for (const a of actualizaciones) {
    if (!a.hechoPor) continue;
    const f = fila(a.hechoPor, a.hechoPorNombre);
    f.actualizaciones++;
    if (a.tipos.includes("identificacion")) f.identificacion++;
    if (a.tipos.includes("responsable")) f.responsable++;
  }
  for (const c of citas) {
    if (!citaCuenta(c)) continue;
    fila(c.creadaPor, c.creadaPorNombre).citas++;
  }

  return {
    filas: Array.from(filas.values()).sort((a, b) => totalFilaCE(b) - totalFilaCE(a) || a.nombre.localeCompare(b.nombre, "es")),
    sinUsuario: Array.from(sinUsuario, ([nombre, expedientes]) => ({ nombre, expedientes })).sort((a, b) => b.expedientes - a.expedientes),
  };
}

/** Cuenta por día del mes ("YYYY-MM"): una entrada por día, del 1 al último. */
export function conteoPorDia(fechas: string[], mes: string): { dia: number; valor: number }[] {
  const [anio, numero] = mes.split("-").map(Number);
  const dias = new Date(Date.UTC(anio, numero, 0)).getUTCDate();
  const conteo = new Array<number>(dias + 1).fill(0);
  for (const f of fechas) {
    if (!f.startsWith(`${mes}-`)) continue;
    const d = Number(f.slice(8, 10));
    if (d >= 1 && d <= dias) conteo[d]++;
  }
  return Array.from({ length: dias }, (_, i) => ({ dia: i + 1, valor: conteo[i + 1] }));
}
