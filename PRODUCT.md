# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dos lados de cada solicitud, **servidos por igual** (confirmado): cada portal se optimiza para su rol, sin prioridad global de uno sobre otro.

- **Quien atiende — ESDOMED** (`esdomed`, `asistente_esdomed`, `admin`): personal de Estadística y Documentos Médicos del Hospital Nacional El Salvador (HNES). Trabaja bandejas: confirma traslados tras revisarlos en el SIS, recibe fallecidos, imprime, emite constancias, importa reportes, arma planes de trabajo y reportes.
- **Quien solicita — las demás áreas del HNES**: médicos (incl. `medico_licenciado_dimes`), Enfermería (cuentas genéricas por servicio; el nombre real es obligatorio al notificar), Trabajo Social, Psicología, Comité de Lesiones (`comite_lesiones`), RRHH, Transporte (`transporte`, `motorista`), ISBM (`isbm_tecnico`, `isbm_supervisor`, `isbm_jefe`) y Convenios. Solicitan, notifican y dan seguimiento a lo que ESDOMED les resuelve.

Las cuentas no se autoregistran: las crea el administrador.

## Product Purpose

ESDOMED Services es la herramienta institucional de ESDOMED del HNES. Entró en funciones el 23 de junio de 2026 para apoyar los procedimientos operativos y administrativos entre ESDOMED y las demás áreas del hospital, consolidando en un solo lugar todos los servicios que ESDOMED ofrece.

Nació para unificar canales que estaban dispersos en Google Forms, Google Sheets y automatizaciones con Apps Script.

El éxito se mide por tres cosas que la plataforma no puede perder (confirmado):

1. **Trazabilidad auditable** — quién hizo qué y cuándo, defendible ante una auditoría de MINSAL.
2. **Rapidez entre áreas** — una solicitud llega y se atiende en minutos, sin llamadas ni seguimiento manual.
3. **Un solo canal** — todo lo que ESDOMED ofrece vive aquí; nada vuelve a Forms, Sheets o WhatsApp.

## Positioning

Es la herramienta propia de ESDOMED, construida por y para el HNES. Conoce lo que una herramienta genérica de formularios o tickets no conoce: el expediente como llave estable de la persona, el catálogo vivo de servicios y camas del hospital, los circuitos reales entre áreas (médico → ESDOMED → impresión/emisión) y los documentos oficiales que el hospital imprime con formato MINSAL.

Complementa al SIS, no lo suplanta: no hay integración técnica con el SIS/SIMMOW; ESDOMED verifica allí manualmente y registra aquí la decisión y su trazabilidad.

## Operating Context

- **Dónde se usa** (confirmado): PC de escritorio en oficina (ESDOMED y áreas administrativas, jornadas largas frente a pantalla); celular en el servicio (médicos y enfermería desde el piso, entre otras tareas); PC compartida del servicio (estaciones de piso con varias personas y cuentas genéricas). La sesión se cierra por inactividad. Es instalable como PWA.
- **SIS / SIMMOW**: fuente externa. Entra por reportes Excel importados (el "Servicio"/"Cama" del reporte es la ubicación actual, no la de ingreso) y por PDFs leídos en el navegador (Hoja de Ingreso/Egreso, FIEH, Certificado de Defunción).
- **Documentos impresos oficiales**: constancia de incapacidad (formato MINSAL), Anexo 5, Hoja de Identificación, plan de trabajo en formato de RH; oficios en Word.
- **Auditoría**: el Comité de Lesiones intencionales (CONAPINA/FGR) es auditado por MINSAL.
- **Tiempo**: hora de El Salvador (UTC-6), formato de 24 h.
- **Integraciones salientes**: APIs máquina a máquina para tableros externos por grupo de servicios.
- **Operación técnica**: push a `master` despliega en Vercel; las reglas de Firestore/Storage las publica el usuario manualmente en la consola.

## Capabilities and Constraints

- **Módulos en producción** (entre otros): traslados de servicio/cama, traslado a otro hospital, fallecidos y defunciones, impresiones, incapacidades (incl. reposición de egresos anteriores a la app), Anexo 5, pacientes (ingresos, egresos, importación), altas y pre-altas, visitas, emergencia y censos, Hospital Día, búsqueda de paciente, cola de expedientes, Trabajo Social, Psicología, Comité de Lesiones, horarios y planes de trabajo, trámites, personal de trabajo, usuarios, RRHH, transporte, ISBM, reportes y productividad.
- **Stack**: Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Firebase (Auth, Firestore, Storage); ISBM es híbrido con Supabase. Sin backend nuevo: preferir soluciones client-side; Cloud Functions solo como mejora opcional.
- **Costos**: lecturas de Firestore y Edge Requests de Vercel (plan Hobby) son recursos escasos; se cuidan en cada vista.
- **Historial intocable**: al personal que trabajó nunca se le elimina, se le da de baja; los registros históricos guardan nombres como snapshot. Todo listado de personal vigente excluye bajas.
- **Nombres de servicio y cama**: se comparan por clave (`mismoServicio()`/`mismaCama()`) y se guarda el nombre canónico del catálogo vivo.
- **Terminología del dominio**: expediente, ingreso/egreso, servicio/cama, traslado, alta, bandeja, emitir, SIS, SIMMOW, FIEH, JVPM, TS/UTS, CONAPINA/FGR, ISBM, DIMES.
- **Pendiente de definir**: estándar de accesibilidad (no se ha fijado uno); si los datos para jefaturas son un criterio de éxito de primer orden (hoy existen reportes y productividad, pero no se declararon innegociables).

## Brand Commitments

- Nombre: **ESDOMED Services**; institución: Hospital Nacional El Salvador (HNES), red MINSAL.
- Identidad institucional HNES, declarada estándar vinculante por el usuario (2026-08-20). Sus reglas visuales viven en `CLAUDE.md` → *Design System*; referencias en `public/paletanueva_tipografia.png` y `manual-uso-de-marca-v2.pdf`. Logo de trazabilidad en `public/1c-trazabilidad-*.svg` (también favicon e ícono PWA); logo MINSAL en los documentos oficiales impresos.
- Voz: español de El Salvador, sobria e institucional. **Sin microcopy explicativo**: H1 + datos; no subtítulos que expliquen la pantalla ni hints de cómo funciona. Si una regla debe comunicarse, va en un toast al ejecutar la acción. Se conservan las letras pequeñas que son datos.
- Personal fallecido se honra en *Personal de trabajo* ("En memoria"); es una excepción deliberada y acotada.

## Evidence on Hand

- Texto institucional y contactos de soporte: `src/lib/acercaDe.ts`.
- Directorio de extensiones: `src/lib/directorioExtensiones.ts`; establecimientos: `src/lib/establecimientos.ts`; catálogo canónico de servicios: `src/lib/servicios.ts`.
- Marca y referencias: `manual-uso-de-marca-v2.pdf`, `public/paletanueva_tipografia.png`, `public/colores institucionales minsal.png`, logos en `public/`.
- Guía para consumidores de las APIs: `docs/api-integraciones-tableros.md`.
- No hay cifras de uso, tiempos de respuesta, testimonios ni métricas de adopción documentados: no inventarlos.

## Product Principles

1. **Trazabilidad antes que comodidad.** Toda acción deja quién y cuándo; lo histórico se conserva, nunca se borra para "limpiar".
2. **Los dos lados de la solicitud pesan igual.** El portal de quien pide y la bandeja de quien atiende se diseñan cada uno para su rol y su escenario.
3. **Un solo canal.** Un flujo de ESDOMED que vive fuera es deuda; lo nuevo entra aquí.
4. **Minutos, no llamadas.** El estado de cada solicitud es visible para ambos lados, y lo pendiente se nota sin buscarlo.
5. **El equipo conoce su trabajo.** La pantalla es para datos y acciones, no para explicar el flujo.
