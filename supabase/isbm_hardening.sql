-- ============================================================
-- MÓDULO ISBM — Endurecimiento de seguridad (auditoría 2026-07-15)
-- Ejecutar UNA VEZ en el SQL Editor (después de isbm_fase2.sql).
-- ============================================================

-- Las autorizaciones solo pueden NACER pendientes. Sin esto, un usuario
-- con acceso al módulo podía insertar por API una autorización ya
-- APROBADA, saltándose al supervisor/jefe. Aprobar/rechazar sigue
-- restringido por la política de UPDATE (solo supervisor/jefe).
DROP POLICY ins_autorizaciones ON autorizaciones_servicio;
CREATE POLICY ins_autorizaciones ON autorizaciones_servicio FOR INSERT
    TO authenticated
    WITH CHECK (isbm_rol() IS NOT NULL AND estado = 'PENDIENTE');
