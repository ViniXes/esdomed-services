// Lector de la "Programación de citas por día" del SIS para el turnero de
// Consulta Externa. Recibe las hojas ya leídas con SheetJS (matriz de celdas) y
// no toca archivos ni Firestore.
//
// El SIS descarga un .xls que en realidad es HTML: SheetJS lo abre con una hoja
// por agenda (especialidad + médico). Cada hoja trae: especialidad, médico,
// fecha y, por cada franja horaria ("08:00:00 AM - 09:00:00 AM" + "Consultorio:
// Cardiologia - 3"), las citas con expediente, DUI, nombre, tipo de cita, fecha
// de otorgamiento y módulo. También se acepta el mismo reporte guardado desde
// Excel en una sola hoja con todas las agendas seguidas: el encabezado de cada
// agenda se reconoce por su forma, no por su posición.
//
// A diferencia de leerProgramacion() de SIMMOW (que solo busca DUI y nombre por
// expediente), aquí se conserva cada cita con su franja y su consultorio.
//
// Sin imports a propósito: lo prueba scripts/test-consulta-externa.mjs.

export interface CitaLeida {
  expediente: string;
  /** Tal como viene ("00418860-6"); vacío si el paciente no tiene DUI. */
  dui: string;
  /** Tal como lo escribe el SIS: "Apellidos, Nombres". */
  paciente: string;
  tipoCita: string;
  primeraVez: boolean;
  fechaOtorgamiento: string;
  /** Nombre de la especialidad tal como viene en el reporte. */
  especialidad: string;
  medico: string;
  /** Sin el prefijo "Consultorio:" ("Cardiologia - 3"). */
  consultorio: string;
  /** Inicio y fin de la franja en 24 h ("08:00", "13:00"). */
  franjaInicio: string;
  franjaFin: string;
  /** Posición en el reporte; desempata el orden dentro de una misma franja. */
  orden: number;
}

export interface AgendaLeida {
  especialidad: string;
  medico: string;
  consultorios: string[];
  /** "08:00–09:00", en el orden del reporte. */
  franjas: string[];
  citas: number;
}

export interface ProgramacionLeida {
  /** Fechas (DD/MM/YYYY) que trae el reporte; debería ser una sola. */
  fechas: string[];
  citas: CitaLeida[];
  agendas: AgendaLeida[];
  /** Mismo expediente dos veces en la misma especialidad: se conserva la primera. */
  repetidas: { expediente: string; especialidad: string }[];
}

const txt = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim();
const clave = (v: string): string =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const PATRON_EXPEDIENTE = /^\d{1,7}-\d{2}$/;
const PATRON_FECHA = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const PATRON_FRANJA =
  /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP])\.?\s*M\.?\s*-\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP])\.?\s*M\.?$/i;

function normalizarFecha(v: string): string {
  const m = v.match(PATRON_FECHA);
  return m ? `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}` : "";
}

/** "08", "00", "PM" → "20:00". */
function hora24(h: string, min: string, meridiano: string): string {
  let hora = Number(h) % 12;
  if (meridiano.toUpperCase() === "P") hora += 12;
  return `${String(hora).padStart(2, "0")}:${min}`;
}

export function leerFranja(texto: string): { inicio: string; fin: string } | null {
  const m = txt(texto).match(PATRON_FRANJA);
  if (!m) return null;
  return { inicio: hora24(m[1], m[2], m[3]), fin: hora24(m[4], m[5], m[6]) };
}

export function esProgramacionCitas(matriz: unknown[][]): boolean {
  return matriz.some(
    (f) => clave(txt(f?.[0])) === "numero expediente" && clave(txt(f?.[1])) === "dui",
  );
}

/** Celdas con contenido de una fila. */
const llenas = (fila: unknown[]): string[] => (fila ?? []).map(txt).filter(Boolean);

export function leerProgramacionCitas(hojas: unknown[][][]): ProgramacionLeida {
  const fechas = new Set<string>();
  const citas: CitaLeida[] = [];
  const agendas = new Map<string, AgendaLeida>();
  const vistas = new Set<string>();
  const repetidas: ProgramacionLeida["repetidas"] = [];
  let orden = 0;

  for (const matriz of hojas) {
    if (!esProgramacionCitas(matriz)) continue;

    // Encabezado de agenda: líneas sueltas de una sola celda (especialidad,
    // médico) y luego la fecha sola. Se guardan las sueltas hasta ver la fecha.
    let sueltas: string[] = [];
    let especialidad = "";
    let medico = "";
    let consultorio = "";
    let franja: { inicio: string; fin: string } | null = null;
    let agenda: AgendaLeida | null = null;

    for (const fila of matriz) {
      const celdas = llenas(fila);
      if (!celdas.length) continue;
      const primera = txt(fila[0]);

      const rango = leerFranja(primera);
      if (rango) {
        franja = rango;
        const celdaConsultorio = celdas.find((c) => /^Consultorio\s*:/i.test(c));
        if (celdaConsultorio) consultorio = celdaConsultorio.replace(/^Consultorio\s*:\s*/i, "");
        if (agenda) {
          agenda.franjas.push(`${rango.inicio}–${rango.fin}`);
          if (consultorio && !agenda.consultorios.includes(consultorio)) agenda.consultorios.push(consultorio);
        }
        continue;
      }

      if (celdas.length === 1 && PATRON_FECHA.test(primera)) {
        const fecha = normalizarFecha(primera);
        fechas.add(fecha);
        especialidad = sueltas.length >= 2 ? sueltas[sueltas.length - 2] : sueltas[0] ?? "";
        medico = sueltas.length >= 2 ? sueltas[sueltas.length - 1] : "";
        sueltas = [];
        consultorio = "";
        franja = null;
        const k = `${clave(especialidad)}|${clave(medico)}`;
        agenda = agendas.get(k) ?? { especialidad, medico, consultorios: [], franjas: [], citas: 0 };
        agendas.set(k, agenda);
        continue;
      }

      const expediente = primera.replace(/\s+/g, "");
      if (PATRON_EXPEDIENTE.test(expediente) && txt(fila[2])) {
        const k = `${clave(especialidad)}|${expediente}`;
        if (vistas.has(k)) {
          repetidas.push({ expediente, especialidad });
          continue;
        }
        vistas.add(k);
        const tipoCita = txt(fila[3]);
        citas.push({
          expediente,
          dui: txt(fila[1]),
          paciente: txt(fila[2]),
          tipoCita,
          primeraVez: clave(tipoCita) === "primera vez",
          fechaOtorgamiento: normalizarFecha(txt(fila[4])),
          especialidad,
          medico,
          consultorio,
          franjaInicio: franja?.inicio ?? "",
          franjaFin: franja?.fin ?? "",
          orden: orden++,
        });
        if (agenda) agenda.citas += 1;
        continue;
      }

      // Línea suelta de una sola celda que no es dato de paciente: parte del
      // encabezado de la próxima agenda.
      if (celdas.length === 1 && fila.slice(1).every((c) => !txt(c)) && !/:\s*$/.test(primera)) {
        sueltas.push(primera);
      }
    }
  }

  return { fechas: [...fechas], citas, agendas: [...agendas.values()], repetidas };
}
