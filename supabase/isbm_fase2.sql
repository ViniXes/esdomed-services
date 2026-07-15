-- ============================================================
-- MÓDULO ISBM — Fase 2: cierre recalculador + vista del tabulador
-- ============================================================
-- Ejecutar UNA VEZ en el SQL Editor de Supabase (después de
-- isbm_schema.sql e isbm_rpc.sql; reemplaza cerrar_dia_censo).
--
-- El cierre del día ahora es el RECALCULADOR AUTORITATIVO:
-- reevalúa la facturabilidad de TODOS los cargos del día en orden
-- de captura, con las reglas del convenio:
--   1. Sin autorizaciones PENDIENTES del día (bloquea el cierre).
--   2. Autorización RECHAZADA  → no facturable (SIN_AUTORIZACION).
--   3. Tope diario de exámenes → el excedente no se factura
--      (EXCEDE_TOPE_DIARIO_RUBRO); tope según servicio facturación.
--   4. Interconsulta repetida de la misma especialidad dentro de
--      48 h → no facturable (INTERCONSULTA_DENTRO_48H).
--   5. El override manual DECISION_ISBM se respeta siempre.
-- Las validaciones del cliente al capturar son solo UX; lo que
-- se cobra es SIEMPRE lo que deja este recálculo.
-- ============================================================

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
               a.rubro
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
        ELSIF r.rubro IN ('OTROS', 'MISCELANEOS')
              AND r.especialidad_interconsulta IS NOT NULL THEN
            IF EXISTS (
                SELECT 1
                FROM cargos_paciente_dia c2
                JOIN aranceles a2 ON a2.id = c2.arancel_id
                WHERE c2.ingreso_id = r.ingreso_id
                  AND c2.id <> r.id
                  AND NOT c2.anulado
                  AND a2.rubro IN ('OTROS', 'MISCELANEOS')
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


-- ============================================================
-- Vista del tabulador — un renglón por ingreso con agregados
-- ============================================================
-- security_invoker: la vista corre con los permisos del usuario,
-- así las RLS de las tablas base siguen aplicando (solo roles ISBM).

CREATE OR REPLACE VIEW v_tabulador_ingresos
WITH (security_invoker = true) AS
SELECT
    i.id,
    i.expediente,
    i.paciente_nombre,
    af.numero_afiliacion_isbm,
    i.fecha_ingreso,
    i.fecha_egreso,
    i.condicion_egreso,
    i.servicio_actual,
    GREATEST(0, COALESCE(i.fecha_egreso, CURRENT_DATE) - i.fecha_ingreso) AS dias_estancia,
    (SELECT COUNT(*) FROM censo_diario cd
      WHERE cd.ingreso_id = i.id)                                   AS dias_censados,
    (SELECT COUNT(*) FROM censo_diario cd
      WHERE cd.ingreso_id = i.id AND cd.dia_cerrado)                AS dias_cerrados,
    (SELECT COALESCE(SUM(c.costo_total), 0) FROM cargos_paciente_dia c
      WHERE c.ingreso_id = i.id AND NOT c.anulado)                  AS total_servicio,
    (SELECT COALESCE(SUM(c.monto_facturable), 0) FROM cargos_paciente_dia c
      WHERE c.ingreso_id = i.id AND NOT c.anulado)                  AS total_cobrable
FROM ingresos i
JOIN afiliaciones af ON af.expediente = i.expediente;
