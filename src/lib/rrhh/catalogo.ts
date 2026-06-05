import type {
  BolsaLicencia,
  CategoriaLicencia,
  TipoDocumentoLicencia,
  UnidadLicencia,
} from "@/types";

// ── Comportamiento al exceder el tope (decisión confirmada con RRHH) ─────────
//  - "advertir": médicas (enfermedad/accidente/maternidad). No se puede negar un
//     hecho médico → se permite registrar; el exceso sobre el tope con goce se
//     reclasifica como sin goce. Requiere justificación.
//  - "bloquear": discrecionales (personal/sin goce/duelo). La institución otorga
//     el permiso → no se permite pasar el tope legal.
export type ComportamientoExceso = "advertir" | "bloquear";

export interface MetaCategoria {
  categoria: CategoriaLicencia;
  label: string;
  bolsa: BolsaLicencia;
  comportamiento: ComportamientoExceso;
  tipoDocumento: TipoDocumentoLicencia;
  /** ¿Es una licencia médica (lleva diagnóstico)? */
  medica: boolean;
  /** ¿Descuenta de una bolsa de saldo? (lactancia/decreto no descuentan). */
  descuentaSaldo: boolean;
  /** Por defecto se emite con goce de sueldo. */
  conGocePorDefecto: boolean;
}

// Catálogo CERRADO — la fuente única de las categorías de licencia. Reemplaza
// los 15+ valores de texto libre del campo RIESGO del Excel.
export const CATEGORIAS: Record<CategoriaLicencia, MetaCategoria> = {
  enfermedad_comun: {
    categoria: "enfermedad_comun",
    label: "Enfermedad común",
    bolsa: "incapacidad",
    comportamiento: "advertir",
    tipoDocumento: "resolucion",
    medica: true,
    descuentaSaldo: true,
    conGocePorDefecto: true,
  },
  enfermedad_profesional: {
    categoria: "enfermedad_profesional",
    label: "Enfermedad profesional",
    bolsa: "incapacidad",
    comportamiento: "advertir",
    tipoDocumento: "resolucion",
    medica: true,
    descuentaSaldo: true,
    conGocePorDefecto: true,
  },
  accidente_comun: {
    categoria: "accidente_comun",
    label: "Accidente común",
    bolsa: "incapacidad",
    comportamiento: "advertir",
    tipoDocumento: "resolucion",
    medica: true,
    descuentaSaldo: true,
    conGocePorDefecto: true,
  },
  accidente_trabajo: {
    categoria: "accidente_trabajo",
    label: "Accidente de trabajo",
    bolsa: "incapacidad",
    comportamiento: "advertir",
    tipoDocumento: "resolucion",
    medica: true,
    descuentaSaldo: true,
    conGocePorDefecto: true,
  },
  maternidad: {
    categoria: "maternidad",
    label: "Maternidad",
    bolsa: "maternidad",
    comportamiento: "advertir",
    tipoDocumento: "resolucion",
    medica: true,
    descuentaSaldo: true,
    conGocePorDefecto: true,
  },
  duelo: {
    categoria: "duelo",
    label: "Duelo",
    bolsa: "duelo_cuido",
    comportamiento: "bloquear",
    tipoDocumento: "acuerdo",
    medica: false,
    descuentaSaldo: true,
    conGocePorDefecto: true,
  },
  cuido_pariente: {
    categoria: "cuido_pariente",
    label: "Cuido de pariente",
    bolsa: "duelo_cuido",
    comportamiento: "bloquear",
    tipoDocumento: "acuerdo",
    medica: false,
    descuentaSaldo: true,
    conGocePorDefecto: true,
  },
  personal: {
    categoria: "personal",
    label: "Permiso personal con goce",
    bolsa: "personal_congoce",
    comportamiento: "bloquear",
    tipoDocumento: "acuerdo",
    medica: false,
    descuentaSaldo: true,
    conGocePorDefecto: true,
  },
  sin_goce: {
    categoria: "sin_goce",
    label: "Permiso sin goce de sueldo",
    bolsa: "permiso_singoce",
    comportamiento: "bloquear",
    tipoDocumento: "acuerdo",
    medica: false,
    descuentaSaldo: true,
    conGocePorDefecto: false,
  },
  // Lactancia y decreto: en los datos del Excel van aparte y no descuentan de
  // las bolsas anuales. Tratamiento exacto pendiente de confirmar con RRHH
  // (sprint posterior); por ahora son informativos.
  lactancia: {
    categoria: "lactancia",
    label: "Hora de lactancia",
    bolsa: "ninguna",
    comportamiento: "advertir",
    tipoDocumento: "acuerdo",
    medica: false,
    descuentaSaldo: false,
    conGocePorDefecto: true,
  },
  decreto: {
    categoria: "decreto",
    label: "Licencia por decreto",
    bolsa: "ninguna",
    comportamiento: "advertir",
    tipoDocumento: "resolucion",
    medica: true,
    descuentaSaldo: false,
    conGocePorDefecto: true,
  },
};

// Orden de presentación en selectores (agrupado por tipo).
export const CATEGORIAS_ORDEN: CategoriaLicencia[] = [
  "enfermedad_comun",
  "enfermedad_profesional",
  "accidente_comun",
  "accidente_trabajo",
  "maternidad",
  "decreto",
  "duelo",
  "cuido_pariente",
  "personal",
  "sin_goce",
  "lactancia",
];

// Metadatos por bolsa, incluida la UNIDAD en que se mide.
export const BOLSAS_META: Record<BolsaLicencia, { label: string; unidad: UnidadLicencia }> = {
  incapacidad:      { label: "Incapacidad por enfermedad", unidad: "dias" },
  duelo_cuido:      { label: "Duelo / cuido de pariente",  unidad: "dias" },
  personal_congoce: { label: "Permiso personal con goce",  unidad: "horas" },
  permiso_singoce:  { label: "Permiso sin goce",           unidad: "horas" },
  maternidad:       { label: "Maternidad",                 unidad: "dias" },
  ninguna:          { label: "Sin bolsa",                  unidad: "dias" },
};

export const BOLSA_LABEL: Record<BolsaLicencia, string> = {
  incapacidad: BOLSAS_META.incapacidad.label,
  duelo_cuido: BOLSAS_META.duelo_cuido.label,
  personal_congoce: BOLSAS_META.personal_congoce.label,
  permiso_singoce: BOLSAS_META.permiso_singoce.label,
  maternidad: BOLSAS_META.maternidad.label,
  ninguna: BOLSAS_META.ninguna.label,
};

export function unidadBolsa(b: BolsaLicencia): UnidadLicencia {
  return BOLSAS_META[b].unidad;
}

export function metaCategoria(c: CategoriaLicencia): MetaCategoria {
  return CATEGORIAS[c];
}

/** Unidad en que se mide/captura una categoría (vía su bolsa). */
export function unidadCategoria(c: CategoriaLicencia): UnidadLicencia {
  return unidadBolsa(CATEGORIAS[c].bolsa);
}

export function categoriaLabel(c: CategoriaLicencia): string {
  return CATEGORIAS[c]?.label ?? c;
}
