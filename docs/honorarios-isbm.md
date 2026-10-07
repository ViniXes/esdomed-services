# Honorarios ISBM — primera etapa

La ruta `/isbm/honorarios` permite revisar una propuesta mensual con datos reales del censo cerrado. No crea liquidaciones, no afirma que el ISBM haya pagado y no registra pagos a profesionales.

## Diseño encontrado

Fuentes locales consultadas:

- `C:/Users/Usuario/Desktop/isbm-project/especificacion_funcional.md`, sección 10.
- `C:/Users/Usuario/Desktop/isbm-project/backend/apps/honorarios/services.py` y `models.py`.
- `C:/Users/Usuario/Desktop/isbm-project/backend/apps/honorarios/views.py`.
- `C:/Users/Usuario/Desktop/isbm-project/handoff_convenio_isbm_hnes.docx`.
- `C:/Users/Usuario/Desktop/ISBM-Dev/docs/2CONVENIO-HNES-FINAL-2023.docx`.

La especificación plantea generar un período cuando UFI registra un paquete mensual como pagado, guardar la base recibida y distribuir 30% a profesionales y 70% al hospital. Cada detalle conserva identidad, rol, participación, monto asignado, fecha de pago y responsable. El registro es trazabilidad del convenio; no ejecuta transferencias.

La especificación deja pendiente confirmar el criterio con Convenios. El prototipo Django implementa proporcionalidad por días como médico tratante en censos cerrados de los ingresos incluidos en el paquete. Un día-paciente equivale a una fila de censo; no es un día calendario trabajado ni el número de visitas AM/PM.

El documento del convenio recomienda el reparto para los profesionales que intervienen en el servicio. Debe definirse quiénes participan además de los médicos antes de convertir la propuesta en una liquidación.

En ESDOMED, `supabase/isbm_schema.sql` dejó paquetes y honorarios fuera del alcance anterior. La nueva vista no reutiliza la base Django ni introduce pagos en las tablas de cargos clínicos.

## Alcance actual

- Solo lectura de censos cerrados del mes, incluyendo todos los bloques de la consulta.
- Base provisional: suma de los totales cobrables congelados del censo. No sustituye el monto efectivamente recibido por un paquete.
- Propuesta de reparto por días como tratante, pendiente de aprobación del criterio.
- Cálculos en centavos y reparto de los centavos restantes por mayor residuo. Es una adaptación del prototipo para evitar asignaciones negativas cuando hay fondos pequeños y muchos participantes.
- Nombres agrupados por mayúsculas y espacios; no se hace correspondencia aproximada de personas. La distribución definitiva necesitará el uid estable de cada profesional, pues hoy el censo solo conserva su nombre.
- Si falta médico o total cobrable en alguna fila, no se calculan importes individuales.
- Consulta mensual, búsqueda, paginación y estados de carga/error/vacío.

## Siguiente etapa que requiere definición

1. Confirmar participantes y criterio: días-paciente, visitas, cirugías, interconsultas o ponderación.
2. Incorporar el paquete mensual y el registro del monto pagado por ISBM, incluyendo ajustes/glosas aplicables.
3. Definir el permiso de UFI en Firebase y Supabase. No asignar automáticamente ese permiso a los roles operativos existentes.
4. Crear períodos y detalles persistidos con snapshots e identidad estable. Generar de forma transaccional e idempotente, sin borrar detalles que ya tengan pago registrado.
5. Permitir a UFI registrar fecha y respaldo del pago individual con auditoría. La pantalla debe distinguir estimado, liquidado, pendiente y pagado.

Validación del cálculo: `node scripts/test-honorarios.mjs`.
