-- ============================================================
-- MÓDULO ISBM — Fase 5: cargos "no realizados" (anotación)
-- ============================================================
-- Ejecutar UNA VEZ en el SQL Editor de Supabase (después de
-- isbm_fase4_no_cobrables.sql).
--
-- Problema: un servicio que se anotó pero NO se hizo (p. ej. una
-- interconsulta que el Excel de Convenios deja como anotación con
-- su justificación) solo se podía sacar de los totales anulándolo,
-- y el anulado se ve tachado, sin motivo, como un error de captura.
--
-- Cambio: el cargo "no realizado" es una anulación con motivo propio.
--   • anulado = TRUE → queda fuera de Total servicio y Facturable en
--     TODOS lados (cierre del día, resumen, consolidado, regla de
--     48 h) sin tocar ninguna suma existente.
--   • no_realizado = TRUE + justificacion_no_realizado → la app lo
--     muestra como anotación ("No realizado — justificación"), no
--     como anulado.
-- ============================================================

ALTER TABLE cargos_paciente_dia
    ADD COLUMN IF NOT EXISTS no_realizado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cargos_paciente_dia
    ADD COLUMN IF NOT EXISTS justificacion_no_realizado TEXT;

-- Un no realizado siempre está fuera de los totales
ALTER TABLE cargos_paciente_dia
    DROP CONSTRAINT IF EXISTS chk_no_realizado_anulado;
ALTER TABLE cargos_paciente_dia
    ADD CONSTRAINT chk_no_realizado_anulado CHECK (NOT no_realizado OR anulado);

-- Verificación sugerida tras ejecutar:
--   SELECT id, fecha, expediente, justificacion_no_realizado
--   FROM cargos_paciente_dia WHERE no_realizado;
