/**
 * División político-administrativa de El Salvador vigente desde el 1 de mayo
 * de 2024 (Ley Especial para la Reestructuración Municipal, 2023): los 14
 * departamentos de siempre, 44 municipios y 262 distritos. Los distritos son
 * los antiguos municipios; se listan para que quien conoce el lugar por su
 * nombre de siempre (p. ej. Soyapango) encuentre el municipio nuevo
 * (San Salvador Este).
 *
 * Lista fija por ley: si cambia, se corrige aquí.
 */

export interface MunicipioSV {
  nombre: string;
  distritos: string[];
}

export interface DepartamentoSV {
  nombre: string;
  municipios: MunicipioSV[];
}

// En el orden oficial de los departamentos (01 Ahuachapán … 14 La Unión).
const DIVISION: Record<string, Record<string, string[]>> = {
  "Ahuachapán": {
    "Ahuachapán Norte": ["Atiquizaya", "El Refugio", "San Lorenzo", "Turín"],
    "Ahuachapán Centro": ["Ahuachapán", "Apaneca", "Concepción de Ataco", "Tacuba"],
    "Ahuachapán Sur": ["Guaymango", "Jujutla", "San Francisco Menéndez", "San Pedro Puxtla"],
  },
  "Santa Ana": {
    "Santa Ana Norte": ["Masahuat", "Metapán", "Santa Rosa Guachipilín", "Texistepeque"],
    "Santa Ana Centro": ["Santa Ana"],
    "Santa Ana Este": ["Coatepeque", "El Congo"],
    "Santa Ana Oeste": [
      "Candelaria de la Frontera", "Chalchuapa", "El Porvenir", "San Antonio Pajonal",
      "San Sebastián Salitrillo", "Santiago de la Frontera",
    ],
  },
  "Sonsonate": {
    "Sonsonate Norte": ["Juayúa", "Nahuizalco", "Salcoatitán", "Santa Catarina Masahuat"],
    "Sonsonate Centro": ["Nahulingo", "San Antonio del Monte", "Santo Domingo de Guzmán", "Sonsonate", "Sonzacate"],
    "Sonsonate Este": ["Armenia", "Caluco", "Cuisnahuat", "Izalco", "San Julián", "Santa Isabel Ishuatán"],
    "Sonsonate Oeste": ["Acajutla"],
  },
  "Chalatenango": {
    "Chalatenango Norte": ["Citalá", "La Palma", "San Ignacio"],
    "Chalatenango Centro": [
      "Agua Caliente", "Dulce Nombre de María", "El Paraíso", "La Reina", "Nueva Concepción",
      "San Fernando", "San Francisco Morazán", "San Rafael", "Santa Rita", "Tejutla",
    ],
    "Chalatenango Sur": [
      "Arcatao", "Azacualpa", "Chalatenango", "Comalapa", "Concepción Quezaltepeque", "El Carrizal",
      "La Laguna", "Las Vueltas", "Nombre de Jesús", "Nueva Trinidad", "Ojos de Agua", "Potonico",
      "San Antonio de la Cruz", "San Antonio Los Ranchos", "San Francisco Lempa", "San Isidro Labrador",
      "San José Cancasque", "San José Las Flores", "San Luis del Carmen", "San Miguel de Mercedes",
    ],
  },
  "La Libertad": {
    "La Libertad Norte": ["Quezaltepeque", "San Matías", "San Pablo Tacachico"],
    "La Libertad Centro": ["Ciudad Arce", "San Juan Opico"],
    "La Libertad Sur": ["Comasagua", "Santa Tecla"],
    "La Libertad Este": ["Antiguo Cuscatlán", "Huizúcar", "Nuevo Cuscatlán", "San José Villanueva", "Zaragoza"],
    "La Libertad Oeste": ["Colón", "Jayaque", "Sacacoyo", "Talnique", "Tepecoyo"],
    "La Libertad Costa": ["Chiltiupán", "Jicalapa", "La Libertad", "Tamanique", "Teotepeque"],
  },
  "San Salvador": {
    "San Salvador Norte": ["Aguilares", "El Paisnal", "Guazapa"],
    "San Salvador Centro": ["Ayutuxtepeque", "Ciudad Delgado", "Cuscatancingo", "Mejicanos", "San Salvador"],
    "San Salvador Sur": ["Panchimalco", "Rosario de Mora", "San Marcos", "Santiago Texacuangos", "Santo Tomás"],
    "San Salvador Este": ["Ilopango", "San Martín", "Soyapango", "Tonacatepeque"],
    "San Salvador Oeste": ["Apopa", "Nejapa"],
  },
  "Cuscatlán": {
    "Cuscatlán Norte": [
      "Oratorio de Concepción", "San Bartolomé Perulapía", "San José Guayabal", "San Pedro Perulapán", "Suchitoto",
    ],
    "Cuscatlán Sur": [
      "Candelaria", "Cojutepeque", "El Carmen", "El Rosario", "Monte San Juan", "San Cristóbal",
      "San Rafael Cedros", "San Ramón", "Santa Cruz Analquito", "Santa Cruz Michapa", "Tenancingo",
    ],
  },
  "La Paz": {
    "La Paz Centro": [
      "El Rosario", "Jerusalén", "Mercedes La Ceiba", "Paraíso de Osorio", "San Antonio Masahuat",
      "San Emigdio", "San Juan Tepezontes", "San Luis La Herradura", "San Miguel Tepezontes",
      "San Pedro Nonualco", "Santa María Ostuma", "Santiago Nonualco",
    ],
    "La Paz Este": ["San Juan Nonualco", "San Rafael Obrajuelo", "Zacatecoluca"],
    "La Paz Oeste": [
      "Cuyultitán", "Olocuilta", "San Francisco Chinameca", "San Juan Talpa", "San Luis Talpa",
      "San Pedro Masahuat", "Tapalhuaca",
    ],
  },
  "Cabañas": {
    "Cabañas Este": ["Dolores", "Guacotecti", "San Isidro", "Sensuntepeque", "Victoria"],
    "Cabañas Oeste": ["Cinquera", "Ilobasco", "Jutiapa", "Tejutepeque"],
  },
  "San Vicente": {
    "San Vicente Norte": [
      "Apastepeque", "San Esteban Catarina", "San Ildefonso", "San Lorenzo", "San Sebastián",
      "Santa Clara", "Santo Domingo",
    ],
    "San Vicente Sur": ["Guadalupe", "San Cayetano Istepeque", "San Vicente", "Tecoluca", "Tepetitán", "Verapaz"],
  },
  "Usulután": {
    "Usulután Norte": [
      "Alegría", "Berlín", "El Triunfo", "Estanzuelas", "Jucuapa", "Mercedes Umaña", "Nueva Granada",
      "San Buenaventura", "Santiago de María",
    ],
    "Usulután Este": [
      "California", "Concepción Batres", "Ereguayquín", "Jucuarán", "Ozatlán", "San Dionisio",
      "Santa Elena", "Santa María", "Tecapán", "Usulután",
    ],
    "Usulután Oeste": ["Jiquilisco", "Puerto El Triunfo", "San Agustín", "San Francisco Javier"],
  },
  "San Miguel": {
    "San Miguel Norte": [
      "Carolina", "Chapeltique", "Ciudad Barrios", "Nuevo Edén de San Juan", "San Antonio del Mosco",
      "San Gerardo", "San Luis de la Reina", "Sesori",
    ],
    "San Miguel Centro": ["Chirilagua", "Comacarán", "Moncagua", "Quelepa", "San Miguel", "Uluazapa"],
    "San Miguel Oeste": ["Chinameca", "El Tránsito", "Lolotique", "Nueva Guadalupe", "San Jorge", "San Rafael Oriente"],
  },
  "Morazán": {
    "Morazán Norte": [
      "Arambala", "Cacaopera", "Corinto", "El Rosario", "Joateca", "Jocoaitique", "Meanguera",
      "Perquín", "San Fernando", "San Isidro", "Torola",
    ],
    "Morazán Sur": [
      "Chilanga", "Delicias de Concepción", "El Divisadero", "Gualococti", "Guatajiagua", "Jocoro",
      "Lolotiquillo", "Osicala", "San Carlos", "San Francisco Gotera", "San Simón", "Sensembra",
      "Sociedad", "Yamabal", "Yoloaiquín",
    ],
  },
  "La Unión": {
    "La Unión Norte": [
      "Anamorós", "Bolívar", "Concepción de Oriente", "El Sauce", "Lislique", "Nueva Esparta",
      "Pasaquina", "Polorós", "San José La Fuente", "Santa Rosa de Lima",
    ],
    "La Unión Sur": [
      "Conchagua", "El Carmen", "Intipucá", "La Unión", "Meanguera del Golfo", "San Alejo",
      "Yayantique", "Yucuaiquín",
    ],
  },
};

/** Departamentos en orden alfabético (así se buscan en un selector). */
export const DEPARTAMENTOS_SV: DepartamentoSV[] = Object.entries(DIVISION)
  .map(([nombre, municipios]) => ({
    nombre,
    municipios: Object.entries(municipios).map(([m, distritos]) => ({ nombre: m, distritos })),
  }))
  .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

export function municipiosDe(departamento: string): MunicipioSV[] {
  return DEPARTAMENTOS_SV.find((d) => d.nombre === departamento)?.municipios ?? [];
}

export function esMunicipioDe(departamento: string, municipio: string): boolean {
  return municipiosDe(departamento).some((m) => m.nombre === municipio);
}
