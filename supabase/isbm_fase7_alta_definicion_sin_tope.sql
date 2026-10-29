-- ============================================================
-- MÓDULO ISBM — Fase 7: tope de exámenes POR EXAMEN INDIVIDUAL y
-- estudios de alta definición fuera del tope
-- ============================================================
-- Ejecutar en el SQL Editor de Supabase (es re-ejecutable: si ya
-- corriste una versión anterior de este archivo, córrelo otra vez).
-- Reemplaza
-- cerrar_dia_censo e INCLUYE el cambio de la fase 6 (respetar
-- "Incluido en día-cama"): si no corriste la fase 6, basta con
-- esta; si la corres después, vuelve a correr esta.
--
-- Convenio HNES-ISBM 2023: en todos los días cama, "Estudios
-- diagnósticos de alta definición: Resonancia Magnética Nuclear,
-- Tomografía Axial Computarizada" NO están incluidos → se cobran
-- completos, sin entrar al tope de exámenes. En el día cama
-- HOSPITALARIO tampoco están incluidos el Doppler ni el
-- Electroencefalograma.
--
-- Cambios:
--   1. aranceles.fuera_tope_examenes: NULL | 'SIEMPRE' | 'HOSPITALARIO'.
--   2. Marca TAC/angiotac y RMN/angioresonancia (SIEMPRE) y
--      Doppler + EEG (HOSPITALARIO).
--   3. cerrar_dia_censo no los cuenta para el tope, y el tope pasa a
--      ser POR EXAMEN: precio unitario <= tope del servicio → incluido
--      en el día cama ($0, motivo EXAMEN_INCLUIDO_DIA_CAMA); mayor →
--      se cobra completo. Ya no se acumula ni se recorta.
--   4. UCI / UCI ECMO / Intermedios: TODO el laboratorio (básico,
--      adicional y biología molecular) va incluido en el día cama.
--   5. cargos_paciente_dia.cobrar_por_decision_isbm: el ISBM puede
--      decidir cobrar un examen que la regla dejó incluido; el cierre
--      lo respeta (justificación en justificacion_cobro).
--   6. Saneo de días ABIERTOS con la regla nueva. Los días ya
--      cerrados hay que reabrirlos y cerrarlos de nuevo para que se
--      recalculen.
-- ============================================================

ALTER TABLE aranceles
    ADD COLUMN IF NOT EXISTS fuera_tope_examenes TEXT;
ALTER TABLE aranceles
    DROP CONSTRAINT IF EXISTS aranceles_fuera_tope_examenes_chk;
ALTER TABLE aranceles
    ADD CONSTRAINT aranceles_fuera_tope_examenes_chk
    CHECK (fuera_tope_examenes IS NULL OR fuera_tope_examenes IN ('SIEMPRE', 'HOSPITALARIO'));

-- TAC, angiotac, RMN y angioresonancia: fuera del tope en todo día cama
UPDATE aranceles SET fuera_tope_examenes = 'SIEMPRE'
WHERE codigo IN ('RX004', 'RX005', 'RX006', 'RX007',
                 'RX062', 'RX063', 'RX064', 'RX065',
                 'RX076', 'RX077', 'RX078', 'RX079');

-- Doppler y electroencefalograma: fuera del tope solo en día cama hospitalario
UPDATE aranceles SET fuera_tope_examenes = 'HOSPITALARIO'
WHERE codigo IN ('RX029', 'RX030', 'RX031', 'RX032', 'RX033',
                 'RX034', 'RX035', 'RX036', 'RX037', 'RX038',
                 'NF001', 'NF013', 'NF014', 'NF015');

-- Motivo nuevo: examen bajo el tope, incluido en el día cama (lo pone el
-- sistema; distinto de INCLUIDO_EN_DIA_CAMA, que es la marca manual).
ALTER TABLE cargos_paciente_dia
    DROP CONSTRAINT IF EXISTS cargos_paciente_dia_motivo_no_facturable_check;
ALTER TABLE cargos_paciente_dia
    ADD CONSTRAINT cargos_paciente_dia_motivo_no_facturable_check
    CHECK (motivo_no_facturable IN (
        'EXCEDE_TOPE_DIARIO_RUBRO', 'EXCEDE_TOPE_MENSUAL',
        'SIN_AUTORIZACION', 'INTERCONSULTA_DENTRO_48H',
        'EXCLUIDO_ART_25', 'INCLUIDO_EN_DIA_CAMA',
        'EXAMEN_INCLUIDO_DIA_CAMA',
        'NO_COBRABLE_ARANCEL',
        'DUPLICADO', 'SIN_DOCUMENTO_RESPALDO',
        'ANULADO', 'DECISION_ISBM'));

-- "Cobrar por decisión ISBM": un examen que la regla deja incluido en el
-- día cama ($0) se puede cobrar si el ISBM lo decide. El cierre lo respeta.
ALTER TABLE cargos_paciente_dia
    ADD COLUMN IF NOT EXISTS cobrar_por_decision_isbm BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cargos_paciente_dia
    ADD COLUMN IF NOT EXISTS justificacion_cobro TEXT;

-- Regla única del tope de exámenes (la usan el cierre y el saneo; la app
-- tiene la misma en examenIncluidoEnDiaCama de src/lib/isbm/types.ts):
--   • Fuera del tope (se cobran completos): rubros que no son exámenes,
--     alta definición SIEMPRE (TAC/RMN) y HOSPITALARIO (Doppler/EEG) en
--     día cama hospitalario.
--   • UCI / UCI ECMO / Intermedios: TODO el laboratorio va incluido en el
--     día cama, cueste lo que cueste (convenio).
--   • Lo demás, por examen individual: precio unitario <= tope → incluido.
CREATE OR REPLACE FUNCTION isbm_examen_incluido_dia_cama(
    p_rubro TEXT, p_fuera_tope TEXT, p_precio_unitario NUMERIC,
    p_tipo_facturacion TEXT, p_tope NUMERIC)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_rubro NOT IN ('LABORATORIO_BASICO', 'LABORATORIO_ADICIONAL',
                             'LABORATORIO_BIOLOGIA_MOLECULAR', 'RX_BASICO',
                             'ESTUDIOS_NEUROFISIOLOGICOS', 'BANCO_SANGRE') THEN FALSE
        WHEN COALESCE(p_fuera_tope, '') = 'SIEMPRE' THEN FALSE
        WHEN COALESCE(p_fuera_tope, '') = 'HOSPITALARIO'
             AND p_tipo_facturacion = 'HOSPITALARIO' THEN FALSE
        WHEN p_tipo_facturacion IN ('UCI', 'UCI_ECMO', 'CUIDADOS_INTERMEDIOS')
             AND p_rubro IN ('LABORATORIO_BASICO', 'LABORATORIO_ADICIONAL',
                             'LABORATORIO_BIOLOGIA_MOLECULAR') THEN TRUE
        ELSE p_precio_unitario <= p_tope
    END
$$;

-- Saneo de días ABIERTOS con la regla nueva (solo cargos de exámenes
-- que no tienen otro motivo: autorización rechazada, no cobrable,
-- marcas manuales, cobros por decisión ISBM y anulados no se tocan).
-- Los días cerrados se recalculan al reabrirlos y cerrarlos de nuevo.
UPDATE cargos_paciente_dia c
SET monto_facturable = CASE WHEN t.incluido THEN 0 ELSE c.costo_total END,
    motivo_no_facturable = CASE WHEN t.incluido THEN 'EXAMEN_INCLUIDO_DIA_CAMA' ELSE NULL END,
    modificado_por_nombre = 'Fase 7: tope por examen individual',
    modificado_en = NOW()
FROM (
    SELECT c2.id,
           isbm_examen_incluido_dia_cama(a.rubro, a.fuera_tope_examenes, c2.precio_unitario,
                                         s.tipo_facturacion, s.tope_diario_examenes) AS incluido
    FROM cargos_paciente_dia c2
    JOIN aranceles a ON a.id = c2.arancel_id
    JOIN censo_diario cd ON cd.id = c2.censo_id
    JOIN servicios_hospitalarios s ON s.id = cd.servicio_facturacion_id
    WHERE NOT cd.dia_cerrado
      AND NOT c2.anulado
      AND NOT c2.cobrar_por_decision_isbm
      AND NOT a.es_no_cobrable
      AND a.rubro IN ('LABORATORIO_BASICO', 'LABORATORIO_ADICIONAL',
                      'LABORATORIO_BIOLOGIA_MOLECULAR', 'RX_BASICO',
                      'ESTUDIOS_NEUROFISIOLOGICOS', 'BANCO_SANGRE')
      AND (c2.motivo_no_facturable IS NULL
           OR c2.motivo_no_facturable IN ('EXCEDE_TOPE_DIARIO_RUBRO', 'EXAMEN_INCLUIDO_DIA_CAMA'))
) t
WHERE c.id = t.id;

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
               c.precio_unitario, c.cobrar_por_decision_isbm,
               c.monto_facturable, c.motivo_no_facturable,
               c.especialidad_interconsulta,
               a.rubro, a.es_interconsulta, a.es_no_cobrable, a.fuera_tope_examenes
        FROM cargos_paciente_dia c
        JOIN aranceles a ON a.id = c.arancel_id
        WHERE c.censo_id = p_censo_id AND NOT c.anulado
        ORDER BY c.capturado_en, c.id
    LOOP
        -- Cobro por decisión ISBM: se cobra completo, sin reglas automáticas
        IF r.cobrar_por_decision_isbm THEN
            IF r.monto_facturable <> r.costo_total OR r.motivo_no_facturable IS NOT NULL THEN
                UPDATE cargos_paciente_dia
                SET monto_facturable = r.costo_total,
                    motivo_no_facturable = NULL,
                    modificado_por_nombre = 'Recalculo de cierre',
                    modificado_en = NOW()
                WHERE id = r.id;
            END IF;
            CONTINUE;
        END IF;

        -- Overrides manuales (decisión ISBM o incluido en día-cama): se respetan tal cual
        IF r.motivo_no_facturable IN ('DECISION_ISBM', 'INCLUIDO_EN_DIA_CAMA') THEN
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

        -- Regla 3: tope por EXAMEN INDIVIDUAL (convenio + práctica ISBM,
        --          confirmado por el usuario 2026-10-27): el examen cuyo
        --          precio unitario NO excede el tope del servicio ($100 /
        --          $150 UCI) va incluido en el día cama ($0); el que lo
        --          excede se cobra completo. No se acumula.
        --          En UCI/Intermedios el laboratorio va siempre incluido.
        --          (ver isbm_examen_incluido_dia_cama arriba)
        ELSIF isbm_examen_incluido_dia_cama(r.rubro, r.fuera_tope_examenes, r.precio_unitario,
                                            v_servicio.tipo_facturacion,
                                            v_servicio.tope_diario_examenes) THEN
            v_fact := 0;
            v_motivo := 'EXAMEN_INCLUIDO_DIA_CAMA';

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
--   SELECT codigo, descripcion, fuera_tope_examenes FROM aranceles
--   WHERE fuera_tope_examenes IS NOT NULL ORDER BY codigo;
