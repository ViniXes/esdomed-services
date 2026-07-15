-- ============================================================
-- MÓDULO ISBM — Funciones RPC del cierre del día
-- ============================================================
-- El cierre del día es el punto AUTORITATIVO del dinero: corre como
-- transacción atómica dentro de Postgres (no en el navegador).
--
--   cerrar_dia_censo(censo_id, nombre):
--     1. Bloquea la fila del censo (FOR UPDATE) y valida que esté abierto.
--     2. Genera el cargo día-cama del servicio de facturación del día
--        (si no existe ya uno vigente) con el precio del catálogo.
--     3. Recalcula y congela el snapshot de totales del día.
--     4. Marca dia_cerrado con quién y cuándo.
--
--   reabrir_dia_censo(censo_id, nombre):
--     Permite corregir: destapa el día y anula el snapshot. Al volver a
--     cerrar, todo se recalcula (el cargo día-cama no se duplica).
--
-- SECURITY INVOKER (default): las RLS aplican — solo roles isbm_*.
-- Ejecutar UNA VEZ en el SQL Editor de Supabase (después del schema).
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
BEGIN
    SELECT * INTO v_censo FROM censo_diario WHERE id = p_censo_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El censo % no existe', p_censo_id;
    END IF;
    IF v_censo.dia_cerrado THEN
        RAISE EXCEPTION 'El día ya está cerrado';
    END IF;

    SELECT * INTO v_servicio
    FROM servicios_hospitalarios
    WHERE id = v_censo.servicio_facturacion_id;

    -- Arancel día-cama que corresponde al servicio de facturación
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

    -- Un solo cargo día-cama vigente por censo. El precio sale del catálogo
    -- de servicios (cláusula cuarta del convenio), nunca del cliente.
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


CREATE OR REPLACE FUNCTION reabrir_dia_censo(p_censo_id BIGINT, p_nombre TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE censo_diario SET
        dia_cerrado        = FALSE,
        cerrado_en         = NULL,
        cerrado_por_uid    = NULL,
        cerrado_por_nombre = NULL,
        total_servicio_dia = NULL,
        total_cobrable_dia = NULL,
        updated_at         = NOW()
    WHERE id = p_censo_id AND dia_cerrado;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El censo % no existe o no estaba cerrado', p_censo_id;
    END IF;

    RAISE LOG 'Censo % reabierto por %', p_censo_id, p_nombre;
END;
$$;
