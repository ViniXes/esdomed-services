-- ============================================================
-- MÓDULO ISBM — Fase 4: ítems no cobrables del tarifario
-- ============================================================
-- Ejecutar UNA VEZ en el SQL Editor de Supabase (después de
-- isbm_fase3_secciones.sql; reemplaza cerrar_dia_censo).
--
-- El tarifario del convenio incluye ítems que se registran pero NO
-- se facturan al ISBM (el hospital los absorbe). Hasta ahora eso
-- solo existía como texto "(no cobrable)" en la descripción de 6
-- aranceles — nada lo aplicaba — y el personal de ISBM confirmó
-- (2026-07-16) que el Expansor de volumen plasmático (MB013)
-- también es no cobrable aunque no trae el rótulo.
--
-- Cambios:
--   1. aranceles.es_no_cobrable — al capturar un cargo de estos
--      ítems queda en $0 con motivo NO_COBRABLE_ARANCEL (visible
--      en captura, cargos, consolidado). Editable por el jefe
--      desde la página de Aranceles.
--   2. Nuevo motivo NO_COBRABLE_ARANCEL en cargos_paciente_dia.
--   3. Marca los 6 "(no cobrable)" + MB013; sanea los cargos ya
--      capturados de esos ítems y recalcula snapshots.
--   4. cerrar_dia_censo lo aplica como primera regla automática.
-- ============================================================

-- ── 1: flag en aranceles ─────────────────────────────────────

ALTER TABLE aranceles
    ADD COLUMN IF NOT EXISTS es_no_cobrable BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2: nuevo motivo en el CHECK de cargos ────────────────────

ALTER TABLE cargos_paciente_dia
    DROP CONSTRAINT IF EXISTS cargos_paciente_dia_motivo_no_facturable_check;
ALTER TABLE cargos_paciente_dia
    ADD CONSTRAINT cargos_paciente_dia_motivo_no_facturable_check
    CHECK (motivo_no_facturable IN (
        'EXCEDE_TOPE_DIARIO_RUBRO', 'EXCEDE_TOPE_MENSUAL',
        'SIN_AUTORIZACION', 'INTERCONSULTA_DENTRO_48H',
        'EXCLUIDO_ART_25', 'INCLUIDO_EN_DIA_CAMA',
        'NO_COBRABLE_ARANCEL',
        'DUPLICADO', 'SIN_DOCUMENTO_RESPALDO',
        'ANULADO', 'DECISION_ISBM'));

-- ── 3: marcar ítems y sanear cargos existentes ───────────────

-- Los 6 rotulados "(no cobrable)" en el tarifario + MB013 Expansor
-- (confirmado por personal ISBM 2026-07-16)
UPDATE aranceles SET es_no_cobrable = TRUE
WHERE codigo IN ('MB001', 'MB009', 'MB013', 'MB023', 'MB030', 'MB031', 'MB032');

-- Cargos ya capturados de ítems no cobrables → $0
UPDATE cargos_paciente_dia c
SET monto_facturable = 0,
    motivo_no_facturable = 'NO_COBRABLE_ARANCEL',
    modificado_por_nombre = 'Migración fase 4 (no cobrables)',
    modificado_en = NOW()
FROM aranceles a
WHERE a.id = c.arancel_id
  AND a.es_no_cobrable
  AND NOT c.anulado
  AND c.monto_facturable <> 0;

-- Snapshots de días cerrados reflejan los montos corregidos
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

-- ── 4: recalculador autoritativo con la regla no cobrable ────
-- Idéntico al de fase 3 más la regla 0: arancel no cobrable → $0
-- antes de evaluar autorización/tope/48 h.

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
               a.rubro, a.es_interconsulta, a.es_no_cobrable
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

        -- Regla 0: ítem no cobrable según el tarifario del convenio
        IF r.es_no_cobrable THEN
            v_fact := 0;
            v_motivo := 'NO_COBRABLE_ARANCEL';

        -- Regla 2: autorización rechazada
        ELSIF EXISTS (
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
--   SELECT codigo, descripcion, es_no_cobrable FROM aranceles WHERE es_no_cobrable;
--   SELECT COUNT(*) FROM cargos_paciente_dia
--   WHERE motivo_no_facturable = 'NO_COBRABLE_ARANCEL';
