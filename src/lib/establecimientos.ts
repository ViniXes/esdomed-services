// Catálogo de establecimientos de la red nacional de salud.
// Fuente única reutilizada por: Anexo 5 (referencia) y Traslado a otro hospital.

export const ESTABLECIMIENTOS = [
  "Hospital Nacional El Salvador",
  "Hospital Nacional Rosales",
  "Hospital Nacional de Niños Benjamín Bloom",
  "Hospital Nacional de la Mujer Dra. María Isabel Rodríguez",
  "Hospital Nacional Zacamil Dr. Juan José Fernández",
  "Hospital Nacional Neumológico y de Medicina Familiar Dr. José Antonio Saldaña",
  "Hospital Nacional Psiquiátrico Dr. José Molina Martínez",
  "Hospital Nacional General de Ilopango Enf. Angélica Vidal de Najarro",
  "Hospital Nacional Nuestra Señora de Fátima – Cojutepeque",
  "Hospital Nacional Santa Gertrudis – San Vicente",
  "Hospital Nacional Santa Teresa – Zacatecoluca",
  "Hospital Nacional San Juan de Dios – San Miguel",
  "Hospital Nacional San Pedro – Usulután",
  "Hospital Nacional Jiquilisco – Usulután",
  "Hospital Nacional Jorge Mena – Santiago de María",
  "Hospital Nacional de La Unión",
  "Hospital Nacional Santa Rosa de Lima – La Unión",
  "Hospital Nacional Nueva Concepción – Chalatenango",
  "Hospital Nacional Chalatenango Dr. Luis Edmundo Vásquez",
  "Hospital Nacional Sonsonate Dr. Jorge Mazzini Villacorta",
  "Hospital Nacional San Rafael – Santa Tecla",
  "Hospital Nacional de San Francisco Gotera",
  "Hospital Nacional de Sensuntepeque – San Jerónimo Emiliani",
  "Hospital Nacional de Ilobasco Dr. José Luis Saca",
  "Hospital Nacional Atiquizaya – Francisco Menéndez",
  "Hospital Nacional Ahuachapán – Dr. Francisco Menéndez",
  "Hospital Nacional Metapán Dr. Arturo Morales",
  "Hospital Nacional de Nueva Guadalupe",
  "Hospital Nacional de La Palma",
  "Hospital Nacional de San Marcos",
  "Hospital Nacional de Tecoluca – Prof. José Simeón Cañas",
  "Hospital Nacional de Chalchuapa",
  "Hospital Nacional San Juan de Dios - Santa Ana",
  "Instituto Salvadoreño de Rehabilitación Integral – ISRI",

  // Red hospitalaria del Instituto Salvadoreño del Seguro Social (ISSS).
  "Hospital General – ISSS",
  "Hospital Médico Quirúrgico y Oncológico – ISSS",
  "Hospital Materno Infantil 1.º de Mayo – ISSS",
  "Hospital Amatepec – ISSS",
  "Hospital Policlínico Arce – ISSS",
  "Hospital Policlínico Zacamil – ISSS",
  "Hospital Policlínico Roma – ISSS",
  "Hospital Policlínico Planes de Renderos – ISSS",
  "Hospital Regional de San Miguel – ISSS",
  "Hospital Regional de Santa Ana – ISSS",
  "Hospital Regional de Sonsonate – ISSS",
];

export const normalizarBusqueda = (valor: string) =>
  valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const etiquetaEstablecimiento = (establecimiento: string) =>
  establecimiento === "Hospital Nacional San Juan de Dios - Santa Ana"
    ? 'Hospital Nacional "San Juan de Dios" - Santa Ana'
    : establecimiento;
