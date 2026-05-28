export const SERVICIOS_HOSPITALARIOS = [
  // Nombres exactos según CamasOficialesSIS.xlsx
  "Emergencia",                                                          // no figura en SIS pero se conserva
  "Bienestar Magisterial",
  "Unidad de Cuidados Intensivos Adultos BM",                           // antes: Convenios (ISBM)
  "Unidad de Cuidados Intermedios Adultos BM",                          // antes: Convenios (ISBM)
  "Cirugía Hombres 1",
  "Cirugía Mujeres 1",
  "Cirugía Cardiovascular",
  "Neurocirugia",                                                        // SIS: sin tilde
  "Dolor y cuidados Paliativos",                                         // SIS: "cuidados" en minúscula
  "Unidad de Cuidados Intermedios Adultos MINSAL",
  "Unidad de Cuidados Intermedios Aislados Adultos",
  "Unidad de Cuidados Intermedios Crónicos Adultos",
  "Unidad de Cuidados Intermedios",                                      // nuevo en SIS
  "Medicina Interna Hombres 1",
  "Medicina Interna Hombres 2",
  "Medicina Interna Hombres 3",
  "Medicina Interna Mujeres 1",
  "Medicina Interna Mujeres 2",
  "Medicina Interna Mujeres 3",
  "Servicio de Cardiologia",                                             // SIS: sin tilde
  "Servicio de Hematologia",                                             // SIS: sin tilde
  "Servicio de Aislados",
  "Servicio de Oncologia",                                               // SIS: sin tilde
  "Obstetricia",                                                         // nuevo en SIS
  "Unidad de cuidados intensivos General 1 Adultos",                    // SIS: "1" (dígito), no "I" romano
  "Unidad de cuidados intensivos aislados Adultos",                     // SIS: minúsculas
  "Unidad de cuidados intensivos cardiovascular Adultos",               // SIS: minúsculas
  "Unidad de Cuidados Intensivos Extracorpórea Adultos",
  "Unidad de Cuidados Intensivos Quirúrgicos Adultos",
  "Unidad de Cuidados Neurointensivos Adultos",
  "Unidad de Cuidados Coronarios y Posquirúrgicos Cardiovasculares",
  "Unidad de Cuidados Intensivos",                                       // nuevo en SIS (genérico)
  "Unidad de Cuidados Intensivos Adultos BM",
  "Unidad de Evaluacion y Observación Medica",                          // SIS: sin tildes en "Evaluacion" y "Medica"
  "Quimioterapia Ambulatoria",
  "Unidad de Terapia Intervencionista Endovascular",
  "Dialisis Peritoneal",                                                 // SIS: sin tilde
  "Terapias Sanguíneas Extracorpórea",
  "Centro Quirúrgico",
] as const;

export type ServicioHospitalario = (typeof SERVICIOS_HOSPITALARIOS)[number];

// ── Helpers de generación de camas ────────────────────────────────────────────

/** PREFIX-01, PREFIX-02, ...  (guión + 2 dígitos) */
function beds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${String(i + 1).padStart(2, "0")}`);
}

/** 1A, 2A, 3A, ...  (número + sufijo, formato UCI) */
function bedsNS(count: number, suffix: string): string[] {
  return Array.from({ length: count }, (_, i) => `${i + 1}${suffix}`);
}

/** CR01, CR02, ...  (prefijo + número, sin guión, 2 dígitos) */
function bedsPN(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, "0")}`);
}

/** 01, 02, ..., 30  (números solos con cero inicial) */
function bedsZP(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(i + 1).padStart(2, "0"));
}

/** 1, 2, ..., 60  (números solos sin cero inicial) */
function bedsN(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(i + 1));
}

// ── Camas por servicio ────────────────────────────────────────────────────────

export const CAMAS_POR_SERVICIO: Record<ServicioHospitalario, string[]> = {
  // Sin camas fijas
  "Emergencia":                                                        [],
  "Obstetricia":                                                       [],
  "Unidad de Cuidados Intensivos":                                     [],
  "Unidad de Cuidados Intermedios":                                    [],

  // Bienestar Magisterial
  "Bienestar Magisterial":                                             bedsN(2),
  "Unidad de Cuidados Intensivos Adultos BM":                         bedsN(10),
  "Unidad de Cuidados Intermedios Adultos BM":                        bedsN(10),

  // Cirugía
  "Cirugía Hombres 1":                                                bedsZP(12),
  "Cirugía Mujeres 1":                                                bedsZP(12),
  "Cirugía Cardiovascular":                                           beds("CCV", 8),
  "Neurocirugia":                                                     beds("NEU", 10),

  // Dolor / Paliativos  (1P, 2P, …)
  "Dolor y cuidados Paliativos":                                      bedsNS(10, "P"),

  // Cuidados Intermedios
  "Unidad de Cuidados Intermedios Adultos MINSAL":                    bedsZP(30),
  "Unidad de Cuidados Intermedios Aislados Adultos":                  bedsPN("AI", 5),
  "Unidad de Cuidados Intermedios Crónicos Adultos":                  bedsPN("CR", 21),

  // Medicina Interna
  "Medicina Interna Hombres 1":                                       beds("MH1", 45),
  "Medicina Interna Hombres 2":                                       beds("MH2", 25),
  "Medicina Interna Hombres 3":                                       beds("MH3", 20),
  "Medicina Interna Mujeres 1":                                       beds("MM1", 50),
  "Medicina Interna Mujeres 2":                                       beds("MM2", 30),
  "Medicina Interna Mujeres 3":                                       beds("MM3", 32),
  "Servicio de Cardiologia":                                          beds("CAR", 8),
  "Servicio de Hematologia":                                          beds("HEM", 50),
  "Servicio de Aislados":                                             beds("MAI", 12),
  "Servicio de Oncologia":                                            beds("ONC", 15),

  // UCI — Cuidados Intensivos
  "Unidad de cuidados intensivos General 1 Adultos":                  bedsNS(10, "G1"),
  "Unidad de cuidados intensivos aislados Adultos":                   bedsNS(8,  "A"),
  "Unidad de cuidados intensivos cardiovascular Adultos":             bedsNS(12, "C"),
  "Unidad de Cuidados Intensivos Extracorpórea Adultos":              bedsNS(9,  "E"),
  "Unidad de Cuidados Intensivos Quirúrgicos Adultos":                bedsNS(9,  "Q"),
  "Unidad de Cuidados Neurointensivos Adultos":                       bedsNS(10, "N"),
  "Unidad de Cuidados Coronarios y Posquirúrgicos Cardiovasculares":  bedsNS(7,  "CPC"),

  // Servicios ambulatorios y especiales
  "Unidad de Evaluacion y Observación Medica":                        beds("EOM", 10),
  "Quimioterapia Ambulatoria":                                        bedsPN("QTA", 20),
  "Unidad de Terapia Intervencionista Endovascular":                  ["UTE-1", "UTE-2", "UTE-3"],
  "Dialisis Peritoneal":                                              bedsN(60),
  "Terapias Sanguíneas Extracorpórea":                                bedsN(10),

  // Centro Quirúrgico
  "Centro Quirúrgico": [
    ...bedsPN("Q", 5),
    ...Array.from({ length: 12 }, (_, i) => `R${i + 1}`),
  ],
};
