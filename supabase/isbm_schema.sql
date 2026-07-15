-- ============================================================
-- MÓDULO CONVENIO ISBM-HNES — Esquema PostgreSQL (Supabase)
-- Convenio N° 25/01/2023-ISBM · Hospital Nacional El Salvador
-- ============================================================
-- Adaptación del schema.sql del proyecto isbm-project al alcance
-- integrado en la plataforma ESDOMED Services:
--
--   • La AUTENTICACIÓN vive en Firebase Auth (third-party auth de
--     Supabase). Aquí NO hay tabla de usuarios: cada fila guarda
--     snapshot de quién actuó (uid + nombre) y las políticas RLS
--     leen el rol desde el custom claim `isbm_rol` del JWT.
--   • La LLAVE de persona es el EXPEDIENTE HNES (igual que la
--     colección `personas` de Firestore). El número de afiliación
--     ISBM es un campo abierto opcional que digita el técnico.
--   • La admisión se HEREDA de los pacientes activos de ESDOMED:
--     `ingresos.id` = doc id de Firestore `pacientes/{id}`.
--   • Alcance: afiliaciones, censo diario (visitas AM/PM + cierre),
--     captura de cargos y autorizaciones. Paquetes/glosas/honorarios
--     quedan fuera (se descartaron).
--
-- Ejecutar UNA VEZ en el SQL Editor de Supabase.
-- Después ejecutar supabase/isbm_seed_aranceles.sql (672 aranceles).
-- ============================================================


-- ============================================================
-- 1. CATÁLOGO: SERVICIOS DE FACTURACIÓN DEL CONVENIO
-- ============================================================
-- Los 6 servicios de la cláusula cuarta. El precio día-cama y el
-- tope diario de exámenes salen de aquí (no de los aranceles).

CREATE TABLE servicios_hospitalarios (
    id                   SERIAL PRIMARY KEY,
    codigo               VARCHAR(20) NOT NULL UNIQUE,
    nombre               VARCHAR(100) NOT NULL,
    tipo_facturacion     TEXT NOT NULL CHECK (tipo_facturacion IN (
                             'HOSPITALARIO', 'CUIDADOS_INTERMEDIOS', 'UCI',
                             'UCI_ECMO', 'CRONICOS', 'PALIATIVOS')),
    precio_dia_cama      NUMERIC(10,2) NOT NULL,
    tope_diario_examenes NUMERIC(10,2) NOT NULL,
    activo               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO servicios_hospitalarios
    (codigo, nombre, tipo_facturacion, precio_dia_cama, tope_diario_examenes)
VALUES
    ('HOSPI',    'Hospitalización General',       'HOSPITALARIO',         165.00, 100.00),
    ('INTERM',   'Cuidados Intermedios',          'CUIDADOS_INTERMEDIOS', 702.00, 100.00),
    ('UCI',      'Cuidados Intensivos (UCI)',     'UCI',                 1012.50, 150.00),
    ('UCI_ECMO', 'UCI con ECMO',                  'UCI_ECMO',            2000.00, 150.00),
    ('CRON',     'Crónicos (estancia > 90 días)', 'CRONICOS',             400.00, 100.00),
    ('PALIT',    'Cuidados Paliativos',           'PALIATIVOS',           300.00, 100.00);


-- ============================================================
-- 2. AFILIACIONES — personas cubiertas por el convenio
-- ============================================================
-- PK = expediente HNES (la misma llave estable de personas/{expediente}
-- en Firestore). El técnico ISBM afilia a un paciente ya existente en
-- la plataforma; los datos personales son snapshot de ese momento.

CREATE TABLE afiliaciones (
    expediente              TEXT PRIMARY KEY,
    paciente_nombre         TEXT NOT NULL,          -- "apellidos, nombres" (snapshot)
    fecha_nacimiento        DATE,
    genero                  TEXT CHECK (genero IN ('masculino', 'femenino', 'otro')),
    dui                     VARCHAR(10),
    -- Campo abierto: lo agrega/edita el técnico ISBM cuando lo conoce
    numero_afiliacion_isbm  VARCHAR(30),
    tipo_beneficiario       TEXT CHECK (tipo_beneficiario IN (
                                'COTIZANTE', 'CONYUGUE', 'HIJO', 'PADRE_MADRE')),
    observaciones           TEXT,
    activo                  BOOLEAN NOT NULL DEFAULT TRUE,
    creado_por_uid          TEXT NOT NULL,
    creado_por_nombre       TEXT NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_por_nombre  TEXT,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Único cuando existe (permite afiliar sin conocer el número todavía)
CREATE UNIQUE INDEX uq_afiliaciones_numero_isbm
    ON afiliaciones (numero_afiliacion_isbm)
    WHERE numero_afiliacion_isbm IS NOT NULL;


-- ============================================================
-- 3. INGRESOS — espejo del ingreso hospitalario de ESDOMED
-- ============================================================
-- id = doc id de Firestore pacientes/{id} (el ingreso real de la
-- plataforma). Se crea al afiliar/activar la cobertura del ingreso.
-- El egreso se sincroniza desde la plataforma cuando ocurre.

CREATE TABLE ingresos (
    id                      TEXT PRIMARY KEY,       -- doc id Firestore pacientes/{id}
    expediente              TEXT NOT NULL REFERENCES afiliaciones(expediente),
    paciente_nombre         TEXT NOT NULL,          -- snapshot
    fecha_ingreso           DATE NOT NULL,
    fecha_egreso            DATE,
    -- PENDIENTE = ingreso activo (cobertura ISBM abierta)
    condicion_egreso        TEXT NOT NULL DEFAULT 'PENDIENTE'
                            CHECK (condicion_egreso IN (
                                'PENDIENTE', 'MEJORADO', 'FALLECIDO',
                                'TRASLADO', 'ALTA_VOLUNTARIA')),
    servicio_actual         TEXT,                   -- snapshot ESDOMED (texto libre)
    cama_actual             TEXT,
    medico_tratante_nombre  TEXT,
    creado_por_uid          TEXT NOT NULL,
    creado_por_nombre       TEXT NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_egreso_posterior
        CHECK (fecha_egreso IS NULL OR fecha_egreso >= fecha_ingreso)
);

CREATE INDEX idx_ingresos_expediente ON ingresos(expediente);
CREATE INDEX idx_ingresos_activos ON ingresos(condicion_egreso)
    WHERE condicion_egreso = 'PENDIENTE';


-- ============================================================
-- 4. CENSO DIARIO — una fila por ingreso por día
-- ============================================================
-- El UNIQUE (ingreso_id, fecha) garantiza que no existan dos censos
-- del mismo día para el mismo ingreso (misma garantía del proyecto
-- original). Visitas AM/PM de la cláusula quinta. `dia_cerrado`
-- congela el día: no admite cargos nuevos y fija el snapshot de
-- totales (el cierre es el punto autoritativo del recálculo).

CREATE TABLE censo_diario (
    id                          BIGSERIAL PRIMARY KEY,
    ingreso_id                  TEXT NOT NULL REFERENCES ingresos(id),
    expediente                  TEXT NOT NULL REFERENCES afiliaciones(expediente),
    fecha                       DATE NOT NULL,
    -- Física vs facturación pueden diferir (paciente en sala,
    -- facturado como UCI): motivo obligatorio cuando difieren.
    servicio_fisico_id          INTEGER NOT NULL REFERENCES servicios_hospitalarios(id),
    servicio_facturacion_id     INTEGER NOT NULL REFERENCES servicios_hospitalarios(id),
    motivo_diferencia_servicio  TEXT,
    cama                        TEXT,               -- texto libre (snapshot ESDOMED)
    medico_tratante_nombre      TEXT,
    -- Visitas médicas AM / PM
    visita_am_registrada        BOOLEAN NOT NULL DEFAULT FALSE,
    visita_am_medico            TEXT,
    visita_am_hora              TIME,
    visita_pm_registrada        BOOLEAN NOT NULL DEFAULT FALSE,
    visita_pm_medico            TEXT,
    visita_pm_hora              TIME,
    -- Cierre del día (bloquea cargos y fija snapshot)
    dia_cerrado                 BOOLEAN NOT NULL DEFAULT FALSE,
    cerrado_en                  TIMESTAMPTZ,
    cerrado_por_uid             TEXT,
    cerrado_por_nombre          TEXT,
    -- Snapshot al cerrar (recalculado por el cierre, no editable)
    total_servicio_dia          NUMERIC(12,2),      -- suma costo_total del día
    total_cobrable_dia          NUMERIC(12,2),      -- suma monto_facturable del día
    registrado_por_uid          TEXT NOT NULL,
    registrado_por_nombre       TEXT NOT NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ingreso_id, fecha)
);

CREATE INDEX idx_censo_fecha ON censo_diario(fecha);
CREATE INDEX idx_censo_ingreso ON censo_diario(ingreso_id);


-- ============================================================
-- 5. ARANCELES — catálogo de ítems cobrables (672 seed)
-- ============================================================
-- Compatible con supabase/isbm_seed_aranceles.sql (mismas columnas
-- del proyecto original). Versionado por fecha: el precio vigente es
-- WHERE vigente_hasta IS NULL AND activo = TRUE.

CREATE TABLE aranceles (
    id                      SERIAL PRIMARY KEY,
    codigo                  VARCHAR(30) NOT NULL,
    rubro                   TEXT NOT NULL CHECK (rubro IN (
                                'DIA_CAMA', 'RX_BASICO', 'LABORATORIO_BASICO',
                                'LABORATORIO_ADICIONAL', 'LABORATORIO_BIOLOGIA_MOLECULAR',
                                'QUIRURGICO', 'MEDICAMENTOS_CUADRO', 'MEDICAMENTOS_ADICIONALES',
                                'OTROS', 'ESTUDIOS_NEUROFISIOLOGICOS', 'MISCELANEOS',
                                'BANCO_SANGRE')),
    descripcion             TEXT NOT NULL,
    precio_hnes             NUMERIC(10,2) NOT NULL,
    es_cuadro_basico        BOOLEAN NOT NULL DEFAULT FALSE,
    es_bolson               BOOLEAN NOT NULL DEFAULT FALSE,
    es_controlado           BOOLEAN NOT NULL DEFAULT FALSE,
    requiere_autorizacion   BOOLEAN NOT NULL DEFAULT FALSE,
    -- Umbrales cláusula decimotercera: hasta el umbral aprueba el
    -- supervisor; por encima, el jefe (antes "gerente GTASS").
    monto_umbral_supervisor NUMERIC(10,2),
    monto_umbral_gerente    NUMERIC(10,2),
    vigente_desde           DATE NOT NULL,
    vigente_hasta           DATE,                   -- NULL = vigente
    activo                  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (codigo, vigente_desde)
);

CREATE INDEX idx_aranceles_rubro ON aranceles(rubro) WHERE activo = TRUE;
CREATE INDEX idx_aranceles_busqueda
    ON aranceles USING gin(to_tsvector('spanish', descripcion));


-- ============================================================
-- 6. CARGOS — tabla central de facturación
-- ============================================================
-- Una fila por cargo. costo_total = lo que se brindó;
-- monto_facturable = lo que se cobra a ISBM (≤ costo_total);
-- la diferencia es pérdida que absorbe el hospital.
-- Anulación LÓGICA (anulado = TRUE, monto_facturable = 0).

CREATE TABLE cargos_paciente_dia (
    id                          BIGSERIAL PRIMARY KEY,
    censo_id                    BIGINT NOT NULL REFERENCES censo_diario(id),
    -- Desnormalizados para consultar sin JOIN
    ingreso_id                  TEXT NOT NULL REFERENCES ingresos(id),
    expediente                  TEXT NOT NULL REFERENCES afiliaciones(expediente),
    fecha                       DATE NOT NULL,
    arancel_id                  INTEGER NOT NULL REFERENCES aranceles(id),
    cantidad                    NUMERIC(8,2) NOT NULL DEFAULT 1,
    precio_unitario             NUMERIC(10,2) NOT NULL,     -- snapshot del arancel
    costo_total                 NUMERIC(12,2) NOT NULL,     -- cantidad × precio
    monto_facturable            NUMERIC(12,2) NOT NULL,
    motivo_no_facturable        TEXT CHECK (motivo_no_facturable IN (
                                    'EXCEDE_TOPE_DIARIO_RUBRO', 'EXCEDE_TOPE_MENSUAL',
                                    'SIN_AUTORIZACION', 'INTERCONSULTA_DENTRO_48H',
                                    'EXCLUIDO_ART_25', 'INCLUIDO_EN_DIA_CAMA',
                                    'DUPLICADO', 'SIN_DOCUMENTO_RESPALDO',
                                    'ANULADO', 'DECISION_ISBM')),
    justificacion_no_facturable TEXT,               -- auditoría de overrides manuales
    -- Documentación de respaldo
    tipo_documento_respaldo     TEXT CHECK (tipo_documento_respaldo IN (
                                    'RECETA_MEDICA', 'FORMULARIO_QUIRURGICO',
                                    'RESULTADO_LAB', 'IMAGEN_RX', 'OTRO')),
    documento_respaldo_ref      VARCHAR(100),       -- ampo, folio, etc.
    comentarios                 TEXT,
    -- Solo rubro QUIRURGICO
    tipo_cirugia                TEXT CHECK (tipo_cirugia IN (
                                    'AMBULATORIA', 'EMERGENCIA', 'ELECTIVA')),
    -- Solo interconsultas (OTROS / MISCELANEOS): regla de 48 h
    especialidad_interconsulta  TEXT,
    -- Marcado para revisión antes de facturar (no afecta montos)
    pendiente_revision          BOOLEAN NOT NULL DEFAULT FALSE,
    anulado                     BOOLEAN NOT NULL DEFAULT FALSE,
    capturado_por_uid           TEXT NOT NULL,
    capturado_por_nombre        TEXT NOT NULL,
    capturado_en                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modificado_por_nombre       TEXT,
    modificado_en               TIMESTAMPTZ,
    CONSTRAINT chk_facturable_menor_igual_servicio
        CHECK (monto_facturable <= costo_total),
    CONSTRAINT chk_cantidad_positiva CHECK (cantidad > 0),
    CONSTRAINT chk_precios_positivos
        CHECK (precio_unitario >= 0 AND costo_total >= 0 AND monto_facturable >= 0)
);

CREATE INDEX idx_cargos_censo ON cargos_paciente_dia(censo_id);
CREATE INDEX idx_cargos_ingreso_fecha ON cargos_paciente_dia(ingreso_id, fecha);
CREATE INDEX idx_cargos_fecha ON cargos_paciente_dia(fecha);


-- ============================================================
-- 7. AUTORIZACIONES — aprobación por umbrales
-- ============================================================
-- Se crea automáticamente al capturar un cargo cuyo arancel tiene
-- requiere_autorizacion = TRUE. Nivel según monto vs umbral:
-- hasta el umbral → SUPERVISOR; por encima → JEFE.
-- El jefe ISBM puede resolver cualquier nivel.

CREATE TABLE autorizaciones_servicio (
    id                  SERIAL PRIMARY KEY,
    cargo_id            BIGINT NOT NULL UNIQUE REFERENCES cargos_paciente_dia(id),
    tipo                TEXT NOT NULL CHECK (tipo IN (
                            'LABORATORIO_RADIOLOGIA', 'PAQUETE_QUIRURGICO',
                            'MEDICAMENTO', 'INTERCONSULTA', 'OTRO')),
    nivel_requerido     TEXT NOT NULL CHECK (nivel_requerido IN ('SUPERVISOR', 'JEFE')),
    monto_solicitado    NUMERIC(12,2) NOT NULL,
    estado              TEXT NOT NULL DEFAULT 'PENDIENTE'
                        CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA')),
    solicitado_por_uid  TEXT NOT NULL,
    solicitado_por_nombre TEXT NOT NULL,
    solicitado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resuelto_por_uid    TEXT,
    resuelto_por_nombre TEXT,
    resuelto_por_rol    TEXT,                       -- isbm_supervisor | isbm_jefe
    resuelto_en         TIMESTAMPTZ,
    comentario          TEXT                        -- obligatorio al rechazar (valida la app)
);

CREATE INDEX idx_autorizaciones_pendientes ON autorizaciones_servicio(estado)
    WHERE estado = 'PENDIENTE';


-- ============================================================
-- 8. SEGURIDAD — Row Level Security
-- ============================================================
-- La plataforma se loguea con Firebase Auth (third-party auth).
-- El JWT de Firebase trae los custom claims:
--   role     = 'authenticated'   (requisito de Supabase)
--   isbm_rol = 'tecnico' | 'supervisor' | 'jefe'
-- Nadie sin claim isbm_rol ve NADA de estas tablas (los demás
-- usuarios de la plataforma no tienen acceso al módulo).
-- No hay DELETE en ninguna tabla: las correcciones son lógicas
-- (anulado / activo = FALSE) para preservar la auditoría.

CREATE OR REPLACE FUNCTION isbm_rol() RETURNS TEXT
LANGUAGE SQL STABLE AS $$
    SELECT NULLIF(auth.jwt() ->> 'isbm_rol', '')
$$;

ALTER TABLE servicios_hospitalarios  ENABLE ROW LEVEL SECURITY;
ALTER TABLE afiliaciones             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingresos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE censo_diario             ENABLE ROW LEVEL SECURITY;
ALTER TABLE aranceles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE cargos_paciente_dia      ENABLE ROW LEVEL SECURITY;
ALTER TABLE autorizaciones_servicio  ENABLE ROW LEVEL SECURITY;

-- Catálogos: todos los roles ISBM leen; solo el jefe modifica
CREATE POLICY sel_servicios ON servicios_hospitalarios FOR SELECT
    TO authenticated USING (isbm_rol() IS NOT NULL);
CREATE POLICY upd_servicios ON servicios_hospitalarios FOR UPDATE
    TO authenticated USING (isbm_rol() = 'jefe');

CREATE POLICY sel_aranceles ON aranceles FOR SELECT
    TO authenticated USING (isbm_rol() IS NOT NULL);
CREATE POLICY ins_aranceles ON aranceles FOR INSERT
    TO authenticated WITH CHECK (isbm_rol() = 'jefe');
CREATE POLICY upd_aranceles ON aranceles FOR UPDATE
    TO authenticated USING (isbm_rol() = 'jefe');

-- Operación diaria: técnico, supervisor y jefe
CREATE POLICY sel_afiliaciones ON afiliaciones FOR SELECT
    TO authenticated USING (isbm_rol() IS NOT NULL);
CREATE POLICY ins_afiliaciones ON afiliaciones FOR INSERT
    TO authenticated WITH CHECK (isbm_rol() IS NOT NULL);
CREATE POLICY upd_afiliaciones ON afiliaciones FOR UPDATE
    TO authenticated USING (isbm_rol() IS NOT NULL);

CREATE POLICY sel_ingresos ON ingresos FOR SELECT
    TO authenticated USING (isbm_rol() IS NOT NULL);
CREATE POLICY ins_ingresos ON ingresos FOR INSERT
    TO authenticated WITH CHECK (isbm_rol() IS NOT NULL);
CREATE POLICY upd_ingresos ON ingresos FOR UPDATE
    TO authenticated USING (isbm_rol() IS NOT NULL);

CREATE POLICY sel_censo ON censo_diario FOR SELECT
    TO authenticated USING (isbm_rol() IS NOT NULL);
CREATE POLICY ins_censo ON censo_diario FOR INSERT
    TO authenticated WITH CHECK (isbm_rol() IS NOT NULL);
CREATE POLICY upd_censo ON censo_diario FOR UPDATE
    TO authenticated USING (isbm_rol() IS NOT NULL);

CREATE POLICY sel_cargos ON cargos_paciente_dia FOR SELECT
    TO authenticated USING (isbm_rol() IS NOT NULL);
CREATE POLICY ins_cargos ON cargos_paciente_dia FOR INSERT
    TO authenticated WITH CHECK (isbm_rol() IS NOT NULL);
CREATE POLICY upd_cargos ON cargos_paciente_dia FOR UPDATE
    TO authenticated USING (isbm_rol() IS NOT NULL);

-- Autorizaciones: todos leen, la app las crea al capturar el cargo,
-- pero solo supervisor/jefe pueden RESOLVERLAS (update)
CREATE POLICY sel_autorizaciones ON autorizaciones_servicio FOR SELECT
    TO authenticated USING (isbm_rol() IS NOT NULL);
CREATE POLICY ins_autorizaciones ON autorizaciones_servicio FOR INSERT
    TO authenticated WITH CHECK (isbm_rol() IS NOT NULL);
CREATE POLICY upd_autorizaciones ON autorizaciones_servicio FOR UPDATE
    TO authenticated USING (isbm_rol() IN ('supervisor', 'jefe'));
