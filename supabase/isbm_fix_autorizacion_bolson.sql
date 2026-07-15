-- ============================================================
-- MÓDULO ISBM — Corrección de regla de autorizaciones (2026-07-15)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase.
-- ============================================================
-- Regla confirmada por ESDOMED: los medicamentos ADICIONALES a cuadro
-- (bolsón) NO requieren autorización. Solo los servicios NO ARANCELADOS
-- que se agreguen al catálogo después la requieren (el jefe los crea
-- desde la página de Aranceles marcando "Req. autorización").
--
-- El seed original traía el bolsón con requiere_autorizacion = TRUE;
-- esto lo corrige en la base ya cargada (el seed del repo ya quedó
-- corregido para futuras cargas). Los umbrales se conservan por si la
-- regla cambiara en el futuro.

UPDATE aranceles
SET requiere_autorizacion = FALSE
WHERE rubro = 'MEDICAMENTOS_ADICIONALES'
  AND requiere_autorizacion = TRUE;

-- Verificación: debe devolver 0
SELECT COUNT(*) AS aranceles_con_autorizacion
FROM aranceles
WHERE requiere_autorizacion = TRUE;
