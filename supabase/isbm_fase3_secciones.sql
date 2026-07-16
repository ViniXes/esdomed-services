-- ============================================================
-- MÓDULO ISBM — Fase 3: interconsulta por arancel + secciones
-- del consolidado
-- ============================================================
-- Ejecutar UNA VEZ en el SQL Editor de Supabase (después de
-- isbm_fase2.sql; reemplaza cerrar_dia_censo).
--
-- Problema que corrige: el rubro OTROS/MISCELANEOS se usaba como
-- proxy de "interconsulta", pero en el tarifario del convenio las
-- interconsultas reales (OT020, OT021) conviven en OTROS con la
-- alimentación parenteral, las fisioterapias, curaciones, etc.
-- Consecuencias: (a) la captura pedía especialidad a cargos que no
-- son interconsulta, (b) la regla de 48 h anulaba cargos legítimos
-- por colisión de especialidad (p. ej. una parenteral con
-- especialidad OTRA mataba la interconsulta real del mismo día) y
-- (c) el consolidado ponía "Fisioterapias" en la sección 6 y
-- dejaba la 7 vacía (mapeaba sección 7 = rubro MISCELANEOS, que en
-- realidad son ecos/EKG/monitoreos).
--
-- Cambios:
--   1. aranceles.es_interconsulta — solo estos piden especialidad
--      al capturar y participan en la regla de 48 h. Por defecto
--      OT020 y OT021 (pendiente confirmar con ISBM si hay más).
--   2. aranceles.seccion_consolidado — sección del libro (1-7)
--      donde se presenta cada arancel, independiente del rubro.
--      Es SOLO presentación: el tope diario de exámenes sigue
--      siendo por rubro.
--   3. Saneamiento de datos existentes: limpia la especialidad de
--      cargos que no son interconsulta, restaura los montos
--      anulados por la colisión de 48 h y recalcula los snapshots
--      de los días ya cerrados.
--   4. cerrar_dia_censo (recalculador autoritativo) evalúa la
--      regla de 48 h con es_interconsulta.
--
-- OJO: cerrar_dia_censo fue reemplazada de nuevo en
-- isbm_fase4_no_cobrables.sql (regla de ítems no cobrables).
-- ============================================================

-- ── 1 y 2: columnas nuevas en aranceles ──────────────────────

ALTER TABLE aranceles
    ADD COLUMN IF NOT EXISTS es_interconsulta BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE aranceles
    ADD COLUMN IF NOT EXISTS seccion_consolidado TEXT NOT NULL DEFAULT 'OTROS_SERVICIOS';
ALTER TABLE aranceles
    DROP CONSTRAINT IF EXISTS aranceles_seccion_consolidado_chk;
ALTER TABLE aranceles
    ADD CONSTRAINT aranceles_seccion_consolidado_chk CHECK (seccion_consolidado IN (
        'DIA_CAMA', 'LABORATORIO', 'RADIOLOGIA', 'MEDICAMENTOS',
        'OTROS_SERVICIOS', 'INTERCONSULTAS', 'FISIOTERAPIA'));

-- Sección por defecto según rubro (las mismas 7 del libro Excel)
UPDATE aranceles SET seccion_consolidado = CASE
    WHEN rubro = 'DIA_CAMA' THEN 'DIA_CAMA'
    WHEN rubro IN ('LABORATORIO_BASICO', 'LABORATORIO_ADICIONAL',
                   'LABORATORIO_BIOLOGIA_MOLECULAR', 'BANCO_SANGRE') THEN 'LABORATORIO'
    WHEN rubro IN ('RX_BASICO', 'ESTUDIOS_NEUROFISIOLOGICOS') THEN 'RADIOLOGIA'
    WHEN rubro IN ('MEDICAMENTOS_CUADRO', 'MEDICAMENTOS_ADICIONALES') THEN 'MEDICAMENTOS'
    ELSE 'OTROS_SERVICIOS'
END;

-- Interconsultas reales del tarifario
UPDATE aranceles
SET es_interconsulta = TRUE, seccion_consolidado = 'INTERCONSULTAS'
WHERE codigo IN ('OT020', 'OT021');

-- Fisioterapias → sección 7
UPDATE aranceles SET seccion_consolidado = 'FISIOTERAPIA' WHERE codigo = 'OT016';

-- Estudios de imagen del rubro MISCELANEOS → sección 3 (ecos, EKG,
-- FAST, rastreo). Los monitoreos MC012/MC013 y la colecistostomía
-- MC001 se quedan en OTROS_SERVICIOS.
UPDATE aranceles SET seccion_consolidado = 'RADIOLOGIA'
WHERE codigo IN ('MC002', 'MC003', 'MC004', 'MC005', 'MC006', 'MC007',
                 'MC008', 'MC009', 'MC010', 'MC011', 'MC014');

-- ── 3: saneamiento de cargos existentes ──────────────────────

-- 3a. Los cargos que no son interconsulta no llevan especialidad
--     (era el dato que provocaba la colisión de 48 h).
UPDATE cargos_paciente_dia c
SET especialidad_interconsulta = NULL
FROM aranceles a
WHERE a.id = c.arancel_id
  AND NOT a.es_interconsulta
  AND c.especialidad_interconsulta IS NOT NULL;

-- 3b. Restaura los cargos anulados por una colisión de 48 h que ya
--     no aplica: solo sigue NO facturable si el cargo ES una
--     interconsulta y existe otra interconsulta previa de la misma
--     especialidad dentro de la ventana de 48 h.
UPDATE cargos_paciente_dia c
SET monto_facturable = c.costo_total,
    motivo_no_facturable = NULL,
    modificado_por_nombre = 'Migración fase 3 (interconsulta por arancel)',
    modificado_en = NOW()
FROM aranceles a
WHERE a.id = c.arancel_id
  AND c.motivo_no_facturable = 'INTERCONSULTA_DENTRO_48H'
  AND NOT c.anulado
  AND (
    NOT a.es_interconsulta
    OR NOT EXISTS (
        SELECT 1
        FROM cargos_paciente_dia c2
        JOIN aranceles a2 ON a2.id = c2.arancel_id
        WHERE c2.ingreso_id = c.ingreso_id
          AND c2.id <> c.id
          AND NOT c2.anulado
          AND a2.es_interconsulta
          AND c2.especialidad_interconsulta = c.especialidad_interconsulta
          AND c2.fecha >= c.fecha - 2
          AND (c2.fecha < c.fecha
               OR (c2.fecha = c.fecha AND (c2.capturado_en, c2.id) < (c.capturado_en, c.id)))
    )
  );

-- 3c. Los snapshots de los días cerrados reflejan los montos restaurados
UPDATE censo_diario cd
SET total_servicio_dia = t.serv,
    total_cobrable_dia = t.cobr,
    updated_at = NOW()
FROM (
    SELECT censo_id,
           COALESCE(SUM(costo_total), 0)      AS serv,
           COALESCE(SUM(monto_facturable), 0) AS cobr
    FROM cargos_paciente_dia
    WHERE NOT anulado
    GROUP BY censo_id
) t
WHERE cd.id = t.censo_id
  AND cd.dia_cerrado
  AND (cd.total_servicio_dia IS DISTINCT FROM t.serv
       OR cd.total_cobrable_dia IS DISTINCT FROM t.cobr);

-- ── 4: recalculador autoritativo con es_interconsulta ────────
-- Idéntico al de fase 2 salvo la regla 4: antes aplicaba a todo
-- cargo de rubro OTROS/MISCELANEOS con especialidad; ahora solo a
-- aranceles con es_interconsulta.

CREATE OR REPLACE FUNCTION cerrar_dia_censo(p_censo_id BIGINT, p_nombre TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_censo     censo_diario%ROWTYPE;
    v_servicio  servicios_hospitalarios%ROWTYPE;
    v_codigo_dc TEXT;
    v_arancel_id INTEGER;
    v_uid       TEXT := COALESCE(auth.jwt() ->> 'sub', 'desconocido');
    r           RECORD;
    v_fact      NUMERIC(12,2);
    v_motivo    TEXT;
    v_acum_ex   NUMERIC(12,2) := 0;   -- exámenes facturados acumulados del día
    v_disp      NUMERIC(12,2);
BEGIN
    SELECT * INTO v_censo FROM censo_diario WHERE id = p_censo_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El censo % no existe', p_censo_id;
    END IF;
    IF v_censo.dia_cerrado THEN
        RAISE EXCEPTION 'El día ya está cerrado';
    END IF;

    -- Regla 1: no se cierra con autorizaciones pendientes del día
    IF EXISTS (
        SELECT 1
        FROM autorizaciones_servicio a
        JOIN cargos_paciente_dia c ON c.id = a.cargo_id
        WHERE c.censo_id = p_censo_id AND NOT c.anulado AND a.estado = 'PENDIENTE'
    ) THEN
        RAISE EXCEPTION 'Hay autorizaciones pendientes de cargos de este día: resuélvelas antes de cerrar';
    END IF;

    SELECT * INTO v_servicio
    FROM servicios_hospitalarios
    WHERE id = v_censo.servicio_facturacion_id;

    -- Cargo día-cama del servicio de facturación (uno por censo)
    v_codigo_dc := CASE v_servicio.tipo_facturacion
        WHEN 'HOSPITALARIO'         THEN 'DC001'
        WHEN 'UCI'                  THEN 'DC002'
        WHEN 'CUIDADOS_INTERMEDIOS' THEN 'DC003'
        WHEN 'CRONICOS'             THEN 'DC004'
        WHEN 'PALIATIVOS'           THEN 'DC005'
        WHEN 'UCI_ECMO'             THEN 'DC006'
    END;

    SELECT id INTO v_arancel_id
    FROM aranceles
    WHERE codigo = v_codigo_dc AND vigente_hasta IS NULL AND activo = TRUE
    ORDER BY vigente_desde DESC
    LIMIT 1;
    IF v_arancel_id IS NULL THEN
        RAISE EXCEPTION 'No hay arancel día-cama vigente para %', v_codigo_dc;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM cargos_paciente_dia c
        JOIN aranceles a ON a.id = c.arancel_id
        WHERE c.censo_id = p_censo_id AND a.rubro = 'DIA_CAMA' AND NOT c.anulado
    ) THEN
        INSERT INTO cargos_paciente_dia
            (censo_id, ingreso_id, expediente, fecha, arancel_id, cantidad,
             precio_unitario, costo_total, monto_facturable,
             comentarios, capturado_por_uid, capturado_por_nombre)
        VALUES
            (p_censo_id, v_censo.ingreso_id, v_censo.expediente, v_censo.fecha,
             v_arancel_id, 1,
             v_servicio.precio_dia_cama, v_servicio.precio_dia_cama, v_servicio.precio_dia_cama,
             'Día-cama generado automáticamente al cerrar el día',
             v_uid, p_nombre);
    END IF;

    -- Recálculo determinista de facturabilidad, en orden de captura
    FOR r IN
        SELECT c.id, c.ingreso_id, c.fecha, c.capturado_en, c.costo_total,
               c.monto_facturable, c.motivo_no_facturable,
               c.especialidad_interconsulta,
               a.rubro, a.es_interconsulta
        FROM cargos_paciente_dia c
        JOIN aranceles a ON a.id = c.arancel_id
        WHERE c.censo_id = p_censo_id AND NOT c.anulado
        ORDER BY c.capturado_en, c.id
    LOOP
        -- Override manual del auxiliar/jefe ISBM: se respeta tal cual
        IF r.motivo_no_facturable = 'DECISION_ISBM' THEN
            CONTINUE;
        END IF;

        v_fact := r.costo_total;
        v_motivo := NULL;

        -- Regla 2: autorización rechazada
        IF EXISTS (
            SELECT 1 FROM autorizaciones_servicio a
            WHERE a.cargo_id = r.id AND a.estado = 'RECHAZADA'
        ) THEN
            v_fact := 0;
            v_motivo := 'SIN_AUTORIZACION';

        -- Regla 3: tope diario de exámenes del servicio de facturación
        ELSIF r.rubro IN ('LABORATORIO_BASICO', 'LABORATORIO_ADICIONAL',
                          'LABORATORIO_BIOLOGIA_MOLECULAR', 'RX_BASICO',
                          'ESTUDIOS_NEUROFISIOLOGICOS', 'BANCO_SANGRE') THEN
            v_disp := v_servicio.tope_diario_examenes - v_acum_ex;
            IF v_disp <= 0 THEN
                v_fact := 0;
                v_motivo := 'EXCEDE_TOPE_DIARIO_RUBRO';
            ELSIF v_fact > v_disp THEN
                v_fact := v_disp;
                v_motivo := 'EXCEDE_TOPE_DIARIO_RUBRO';
            END IF;
            v_acum_ex := v_acum_ex + v_fact;

        -- Regla 4: interconsulta de la misma especialidad dentro de 48 h
        --          (solo aranceles marcados es_interconsulta)
        ELSIF r.es_interconsulta
              AND r.especialidad_interconsulta IS NOT NULL THEN
            IF EXISTS (
                SELECT 1
                FROM cargos_paciente_dia c2
                JOIN aranceles a2 ON a2.id = c2.arancel_id
                WHERE c2.ingreso_id = r.ingreso_id
                  AND c2.id <> r.id
                  AND NOT c2.anulado
                  AND a2.es_interconsulta
                  AND c2.especialidad_interconsulta = r.especialidad_interconsulta
                  AND c2.fecha >= r.fecha - 2
                  AND (c2.fecha < r.fecha
                       OR (c2.fecha = r.fecha AND (c2.capturado_en, c2.id) < (r.capturado_en, r.id)))
            ) THEN
                v_fact := 0;
                v_motivo := 'INTERCONSULTA_DENTRO_48H';
            END IF;
        END IF;

        IF v_fact <> r.monto_facturable
           OR COALESCE(v_motivo, '') <> COALESCE(r.motivo_no_facturable, '') THEN
            UPDATE cargos_paciente_dia
            SET monto_facturable = v_fact,
                motivo_no_facturable = v_motivo,
                modificado_por_nombre = 'Recalculo de cierre',
                modificado_en = NOW()
            WHERE id = r.id;
        END IF;
    END LOOP;

    UPDATE censo_diario SET
        dia_cerrado        = TRUE,
        cerrado_en         = NOW(),
        cerrado_por_uid    = v_uid,
        cerrado_por_nombre = p_nombre,
        total_servicio_dia = (SELECT COALESCE(SUM(costo_total), 0)
                              FROM cargos_paciente_dia
                              WHERE censo_id = p_censo_id AND NOT anulado),
        total_cobrable_dia = (SELECT COALESCE(SUM(monto_facturable), 0)
                              FROM cargos_paciente_dia
                              WHERE censo_id = p_censo_id AND NOT anulado),
        updated_at         = NOW()
    WHERE id = p_censo_id;
END;
$$;

-- Verificación sugerida tras ejecutar:
--   SELECT codigo, descripcion, es_interconsulta, seccion_consolidado
--   FROM aranceles WHERE codigo IN ('OT003','OT016','OT020','OT021');
--   SELECT COUNT(*) FROM cargos_paciente_dia
--   WHERE motivo_no_facturable = 'INTERCONSULTA_DENTRO_48H';
