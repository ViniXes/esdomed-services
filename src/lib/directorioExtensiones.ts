// Directorio de extensiones fijas del Hospital Nacional El Salvador (HNES).
// Fuente: directorio institucional 2023 (sites.google.com/salud.gob.sv/directorio2023-hnes).
// Datos normalizados: se omitieron entradas marcadas "fuera de uso"/"sin personal
// asignado" y los registros que no son extensiones internas (teléfonos completos).

export interface EntradaExtension {
  nombre: string;
  extension: string;
}

export interface CategoriaExtensiones {
  nombre: string;
  seccion: "hospitalaria" | "administrativa";
  destacado?: boolean; // resalta la categoría (p. ej. ESDOMED)
  entradas: EntradaExtension[];
}

export const DIRECTORIO_EXTENSIONES: CategoriaExtensiones[] = [
  // ─── ESDOMED (destacado) ───────────────────────────────────────────────────
  {
    nombre: "ESDOMED — Estadística y Documentos Médicos",
    seccion: "hospitalaria",
    destacado: true,
    entradas: [
      { nombre: "Defunciones", extension: "2160" },
      { nombre: "Altas / Egresos", extension: "2161" },
      { nombre: "Supervisor / Administrativo", extension: "2162" },
      { nombre: "Supervisor en turno", extension: "2163" },
    ],
  },

  // ─── Hospitalarias ─────────────────────────────────────────────────────────
  {
    nombre: "UCI y Emergencia",
    seccion: "hospitalaria",
    entradas: [
      { nombre: "Emergencia", extension: "2234" },
      { nombre: "Máxima Emergencia", extension: "2187" },
      { nombre: "Terapia Respiratoria", extension: "2133" },
      { nombre: "Quirúrgica Nefrología", extension: "2120" },
      { nombre: "UCI General II", extension: "2121" },
      { nombre: "UCI Neurocríticos", extension: "2122" },
      { nombre: "Cuidados Paliativos", extension: "2123" },
      { nombre: "UCI Circulación Extracorpórea", extension: "2124" },
      { nombre: "UCI Coronarios / Cardiovascular", extension: "2125" },
      { nombre: "UCI General I", extension: "2126" },
      { nombre: "UCI Asilados", extension: "2127" },
    ],
  },
  {
    nombre: "UCIN — Crónicos / Agudos",
    seccion: "hospitalaria",
    entradas: [
      { nombre: "Intermedios — Enfermería", extension: "2201-2202" },
      { nombre: "Intermedios — Médicos", extension: "2203-2204" },
      { nombre: "Crónicos — Enfermería", extension: "2205-2206" },
      { nombre: "Crónicos", extension: "2207-2208" },
      { nombre: "UCIN BM", extension: "2213-2216" },
    ],
  },
  {
    nombre: "Centro Quirúrgico",
    seccion: "hospitalaria",
    entradas: [
      { nombre: "Jefatura Unidad de Cirugía", extension: "2233" },
      { nombre: "CEYE General", extension: "2141" },
      { nombre: "Jefe CEYE", extension: "2142" },
      { nombre: "Contaminados CEYE", extension: "2143" },
      { nombre: "Área Estéril CEYE", extension: "2145" },
      { nombre: "Coronarios y Post Quirúrgicos Cardiovascular", extension: "2138" },
      { nombre: "Áreas de Cirugía", extension: "2217-2220" },
    ],
  },
  {
    nombre: "Hospitalización — Medicina Interna",
    seccion: "hospitalaria",
    entradas: [
      { nombre: "Jefe Hospitalización (Médicos)", extension: "2232" },
      { nombre: "Medicina Hombres", extension: "2217" },
      { nombre: "Medicina Hombres / Mujeres", extension: "2140" },
    ],
  },
  {
    nombre: "División Enfermería",
    seccion: "hospitalaria",
    entradas: [
      { nombre: "Administración General de Enfermería", extension: "2176" },
      { nombre: "C.E.Y.E.", extension: "2185" },
    ],
  },
  {
    nombre: "Unidad ISBM — Bienestar Magisterial",
    seccion: "hospitalaria",
    entradas: [
      { nombre: "Recepción General", extension: "2310" },
      { nombre: "Jefe de Enfermería", extension: "2311" },
      { nombre: "Estación de Trabajo Médicos", extension: "2312" },
      { nombre: "Recepción de Medicamentos", extension: "2313" },
      { nombre: "Estaciones de Enfermería (1, 2, 3)", extension: "2314-2316" },
      { nombre: "Personal Terapia", extension: "2317" },
      { nombre: "Jefatura / Coordinación", extension: "2318" },
      { nombre: "Oficinas Administrativas", extension: "2319" },
      { nombre: "Subcoordinación", extension: "2320" },
    ],
  },
  {
    nombre: "Angiografía",
    seccion: "hospitalaria",
    entradas: [
      { nombre: "Recepción", extension: "2300" },
      { nombre: "Oficina Administrativa", extension: "2301" },
      { nombre: "Oficina Anestesia", extension: "2302" },
      { nombre: "Estación de Enfermería", extension: "2303" },
      { nombre: "Control Angiógrafo", extension: "2304-2305" },
    ],
  },
  {
    nombre: "Radiología e Imágenes",
    seccion: "hospitalaria",
    entradas: [
      { nombre: "Jefatura Unidad de Radiología", extension: "2415" },
      { nombre: "Subjefatura RX", extension: "2409" },
      { nombre: "Coordinación RX", extension: "2408" },
      { nombre: "Recepción Administrativa", extension: "2414" },
      { nombre: "Recepción Pacientes Rayos X (1, 2)", extension: "2402-2403" },
      { nombre: "Recepción Pacientes Rayos X 3", extension: "2420" },
      { nombre: "TAC Externos", extension: "2237" },
      { nombre: "Control Tomografía", extension: "2423" },
      { nombre: "Resonancia", extension: "2410" },
      { nombre: "Control de Resonancia", extension: "2407" },
      { nombre: "Recepción Pacientes Resonancia", extension: "2411" },
      { nombre: "Preparación Pacientes Resonancia", extension: "2406" },
      { nombre: "Ultrasonografía 2", extension: "2400-2401" },
      { nombre: "Ultrasonografía 4", extension: "2412" },
      { nombre: "Fluoroscopia 1", extension: "2413" },
      { nombre: "Fluoroscopia 2", extension: "2422" },
      { nombre: "Preparación de Enfermería", extension: "2405" },
      { nombre: "Salas de Lectura (1, 2)", extension: "2418-2419" },
      { nombre: "Sala de Reuniones", extension: "2421" },
      { nombre: "Sala Descanso Personal de Turno", extension: "2416" },
      { nombre: "Sala Descanso Residentes", extension: "2417" },
      { nombre: "Sala Descanso Radiólogo", extension: "2428" },
      { nombre: "Archivo 1", extension: "2404" },
      { nombre: "Archivo 2", extension: "2427" },
    ],
  },
  {
    nombre: "Laboratorios y Banco de Sangre",
    seccion: "hospitalaria",
    entradas: [
      { nombre: "Banco de Sangre", extension: "2171" },
      { nombre: "Jefatura de Laboratorios", extension: "2180" },
      { nombre: "Laboratorio", extension: "2181" },
      { nombre: "Recepción Laboratorio", extension: "2182" },
      { nombre: "Bacteriología", extension: "2183" },
      { nombre: "Pruebas Especiales", extension: "2172" },
    ],
  },
  {
    nombre: "Farmacia",
    seccion: "hospitalaria",
    entradas: [
      { nombre: "Jefe Farmacia", extension: "2153" },
      { nombre: "Secretaria Farmacia", extension: "2156" },
      { nombre: "Farmacia Emergencia", extension: "2152" },
      { nombre: "Farmacia Unidosis", extension: "2157" },
      { nombre: "Diluciones Farmacia", extension: "2151" },
      { nombre: "Altas de Farmacoterapia", extension: "2165" },
    ],
  },
  {
    nombre: "Trabajo Social",
    seccion: "hospitalaria",
    entradas: [
      { nombre: "Jefatura Trabajo Social", extension: "2188" },
      { nombre: "Trabajo Social (uso externo)", extension: "2359" },
    ],
  },
  {
    nombre: "Psicología",
    seccion: "hospitalaria",
    entradas: [{ nombre: "Psicología", extension: "2186" }],
  },
  {
    nombre: "Fisioterapia",
    seccion: "hospitalaria",
    entradas: [{ nombre: "Fisioterapia", extension: "2241" }],
  },
  {
    nombre: "Alimentación, Dietas y Nutrición",
    seccion: "hospitalaria",
    entradas: [
      { nombre: "Jefatura de Alimentación y Dietas", extension: "2131" },
      { nombre: "Alimentación y Dietas", extension: "2132" },
      { nombre: "Alimentación y Dietas", extension: "2136" },
    ],
  },
  {
    nombre: "Medicina Preventiva",
    seccion: "hospitalaria",
    entradas: [{ nombre: "Departamento de Medicina Preventiva (IASS)", extension: "2130" }],
  },
  {
    nombre: "Otras unidades",
    seccion: "hospitalaria",
    entradas: [
      { nombre: "Unidad de Epidemiología", extension: "2173" },
      { nombre: "Terapia Sanguínea Extracorpórea", extension: "2229" },
      { nombre: "Clínica Empresarial", extension: "2360" },
    ],
  },

  // ─── Administrativas ───────────────────────────────────────────────────────
  {
    nombre: "Dirección y Consejo Estratégico",
    seccion: "administrativa",
    entradas: [
      { nombre: "Subdirección General", extension: "2116" },
      { nombre: "Asistente Dirección", extension: "2240" },
    ],
  },
  {
    nombre: "Subdirección Administrativa",
    seccion: "administrativa",
    entradas: [
      { nombre: "Jefe", extension: "2250" },
      { nombre: "Asistente", extension: "2252" },
      { nombre: "Recepción", extension: "2245" },
    ],
  },
  {
    nombre: "Unidad Financiera",
    seccion: "administrativa",
    entradas: [
      { nombre: "Jefe", extension: "2134" },
      { nombre: "Asistente", extension: "2197" },
      { nombre: "Pagos y Órdenes de Descuento", extension: "2198" },
      { nombre: "Contabilidad", extension: "2196" },
      { nombre: "Quedan y Facturas", extension: "2195" },
      { nombre: "Presupuesto", extension: "2199" },
    ],
  },
  {
    nombre: "Unidad de Compras Públicas",
    seccion: "administrativa",
    entradas: [
      { nombre: "Jefatura", extension: "2190" },
      { nombre: "Consultas Externas", extension: "2191" },
      { nombre: "Jurídico", extension: "2192" },
      { nombre: "Técnico", extension: "2193-2194" },
    ],
  },
  {
    nombre: "Unidades de Apoyo",
    seccion: "administrativa",
    entradas: [
      { nombre: "Unidad Jurídica", extension: "2155" },
      { nombre: "Unidad Jurídica — Técnicos", extension: "2150" },
      { nombre: "Unidad de Auditoría Interna", extension: "2135" },
      { nombre: "Unidad de Asesoría Médica", extension: "2178" },
      { nombre: "Almacén de Medicamentos", extension: "2285" },
    ],
  },
  {
    nombre: "Recursos Humanos",
    seccion: "administrativa",
    entradas: [{ nombre: "Administración", extension: "2271-2272" }],
  },
  {
    nombre: "Mantenimiento",
    seccion: "administrativa",
    entradas: [
      { nombre: "Jefatura y Subjefatura", extension: "2345-2346" },
      { nombre: "Asistente", extension: "2158" },
      { nombre: "Activo Fijo", extension: "2159" },
    ],
  },
  {
    nombre: "Abastecimiento",
    seccion: "administrativa",
    entradas: [
      { nombre: "Almacén Insumos Médicos", extension: "2164" },
      { nombre: "Suministros Generales", extension: "2284" },
    ],
  },
  {
    nombre: "Servicios Varios",
    seccion: "administrativa",
    entradas: [
      { nombre: "Saneamiento", extension: "2168" },
      { nombre: "Servicios Generales", extension: "2169" },
      { nombre: "Ropería", extension: "2177" },
      { nombre: "Unidad de Transporte", extension: "2264" },
    ],
  },
  {
    nombre: "Tecnología y Comunicaciones",
    seccion: "administrativa",
    entradas: [
      { nombre: "Conmutador", extension: "2100" },
      { nombre: "Jefe", extension: "2111" },
      { nombre: "Sistemas", extension: "2114" },
      { nombre: "Soporte Informática", extension: "2112" },
      { nombre: "Telefonía / Megafonía", extension: "2269" },
    ],
  },
  {
    nombre: "Portones",
    seccion: "administrativa",
    entradas: [{ nombre: "Casetas (Portones 1, 6, 7)", extension: "2261-2263" }],
  },
];
