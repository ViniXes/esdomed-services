# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ESDOMED Services** — Portal operativo interno para el servicio de Estadística y Documentos Médicos (ESDOMED) de un hospital. Conecta médicos con el personal de ESDOMED para tres flujos de trabajo:

1. **Traslados** — Médicos solicitan traslado de servicio/cama; ESDOMED revisa en el SIS del hospital (manualmente, fuera del sistema) y confirma/rechaza en esta app.
2. **Fallecidos** — Médicos notifican pacientes fallecidos vía formulario; ESDOMED confirma de recibido.
3. **Impresiones** — Médicos suben PDFs para imprimir; ESDOMED marca como impreso indicando quién lo hizo.

No hay integración técnica con el SIS del hospital; esa verificación es manual por parte del personal de ESDOMED.

## Stack

- **Next.js 14** (App Router, `src/` directory)
- **TypeScript**
- **Tailwind CSS**
- **Firebase**: Auth, Firestore, Storage

## Commands

```bash
npm run dev       # Servidor de desarrollo en localhost:3000
npm run build     # Build de producción
npm run lint      # ESLint
```

## Environment Variables

Copiar `.env.local` y rellenar con los valores del proyecto Firebase `esdomed-services`:

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

## Architecture

### Routing & Role-based Access

Hay dos roles: `medico` y `esdomed`, almacenados en la colección `usuarios` de Firestore.

| Ruta | Acceso | Descripción |
|---|---|---|
| `/` | público | Redirige según rol |
| `/login` | público | Autenticación |
| `/medico/*` | `medico` | Crear solicitudes |
| `/dashboard/*` | `esdomed` | Gestionar solicitudes |

Las rutas protegidas deben verificar `profile.role` desde `useAuth()` y redirigir si no corresponde.

### Auth Flow

`AuthContext` (`src/contexts/AuthContext.tsx`) maneja todo el estado de autenticación. Al hacer login, además del `User` de Firebase Auth, carga el documento `usuarios/{uid}` de Firestore que contiene el rol y datos del usuario. Usar siempre `useAuth()` para acceder a `user`, `profile`, `loading`.

### Firestore Collections

```
usuarios/{uid}
  - nombre, email, role: "medico"|"esdomed", servicio (solo médicos)

traslados/{id}
  - ver SolicitudTraslado en src/types/index.ts

notificaciones_fallecidos/{id}
  - ver NotificacionFallecido en src/types/index.ts

solicitudes_impresion/{id}
  - ver SolicitudImpresion en src/types/index.ts
```

Todos los tipos están definidos en `src/types/index.ts`.

### Firebase Initialization

`src/lib/firebase.ts` exporta `auth`, `db`, `storage`. Usa `getApps()` para evitar re-inicialización en hot reload. Importar siempre desde ahí, nunca llamar `initializeApp` directamente.

### Nombres de servicio — comparar por clave, escribir el canónico

El catálogo canónico de servicios y camas vive en `src/lib/servicios.ts`; el catálogo **vivo** es `configuracion/servicios` en Firestore (`ServiciosContext`), que arranca sembrado del canónico y ESDOMED puede editar.

El SIS escribe los mismos servicios de varias formas (mayúsculas/minúsculas, tildes, dobles espacios, romano vs. dígito). Regla obligatoria en TODO código que toque un nombre de servicio o de cama:

- **Comparar** con `mismoServicio()` / `mismaCama()` (nunca `a !== b`). Comparar literal fue lo que generó traslados fantasma en la importación: un cambio de caja hacía que un servicio entero pareciera moverse y se escribía un `movimientos` con origen ≡ destino.
- **Guardar** siempre el nombre que devuelve `resolverServicioCanonico()` (el del catálogo vivo), nunca el crudo del reporte.
- Los nombres realmente distintos (siglas como “UCI General 1 Adultos”, formas cortas, nombres históricos) se agregan a `ALIAS_CRUDOS` en `src/lib/servicios.ts`. Las variantes de caja/tilde/espacio NO necesitan alias: las absorbe `claveServicio()`.
- Limpieza de datos ya afectados: `node scripts/limpiar-traslados-fantasma.mjs --dry-run`.

### Catálogo CIE-10 — sale del SIS

`cie-10/codes.json` se genera desde el catálogo del SIS (Administración → Diagnósticos CIE10, `/admin/minsal/siaps/mntcie10/list`) con `node scripts/actualizar-cie10.mjs <archivo-sis.json> [--dry-run]`; el encabezado del script explica la extracción. Código y texto van literales del SIS, para que coincidan con lo que llega en las importaciones. Los inactivos del SIS (p. ej. A90/A91, reemplazados por A97.x) y los códigos que el SIS ya no tiene se conservan con `inactivo`: `cargarCIE10()` los devuelve (la matriz UCI valida contra el catálogo y hay registros que los guardaron) y `buscarCIE10()` no los ofrece. Regla: nunca borrar un código del catálogo; para buscar usar `buscarCIE10()` (ignora tildes e inactivos).

### Camas oficiales y camas extra

`camas` de cada servicio (catálogo vivo y `CAMAS_POR_SERVICIO`) trae **todas** las camas asignables; `camasExtra` es el subconjunto que no es oficial (`CAMAS_EXTRA_POR_SERVICIO`, se marca en Configuración de servicios). Las extras se asignan a pacientes como cualquier otra, pero no cuentan en el denominador del reporte de ocupación: oficiales = `camas` menos `camasExtra` (592 = 397 censables + 195 no censables, más 36 extras). Regla para código nuevo: todo denominador de ocupación excluye `camasExtra`.

### Importación de activos — retención de ya egresados

Al procesar un alta efectiva o confirmar una defunción, el ingreso deja de estar `activo`. Si luego se importa un reporte del SIS que todavía lo trae (descargado antes del alta, o el alta aún no está en el SIS), la importación lo veía como "nuevo" y duplicaba el activo. `src/lib/pacientes/egresoReciente.ts` evalúa el **último egreso** del expediente (ingresos en `pacientes` + defunciones confirmadas en `notificaciones_fallecidos`):

- **Defunción** → nunca se importa, sin confirmación posible.
- **Mismo ingreso** (la fecha de ingreso del reporte no es posterior al día en que empezó la estancia que egresó) → retenido aunque hayan pasado más de 24 h.
- **Alta de hace menos de 24 h** (`VENTANA_REINGRESO_HORAS`, medido desde lo último entre `fechaEgreso` y `egresadoAutoEn`) → retenido.

Los dos últimos entran solo si ESDOMED marca "reingreso real"; el ingreso nuevo guarda `reingresoConfirmado{...}` (quién, cuándo, contra qué egreso). Justo antes de escribir, la importación **revalida** los expedientes a crear (otra importación simultánea o un alta procesada durante la revisión) y omite los que cambiaron. Regla para código nuevo que cree ingresos en lote: pasar por `cargarHistorialEgresos` + `evaluarRetencion`.

### APIs de integración (máquina a máquina)

`src/app/api/integraciones/*` expone datos a OTROS sistemas (tableros externos). Auth por header `x-api-key` = env `INTEGRACIONES_API_KEY` (helper `src/lib/integraciones/auth.ts`, responde 503 si la variable falta); usan `adminDb` (firebase-admin), nunca el SDK cliente. Los tableros por grupo de servicios (Medicina Interna, Cirugía, Convenios, UCI, UCIN, Paliativos, apoyo a RIISS) se definen en `src/lib/integraciones/tableros.ts` y se sirven en `/api/integraciones/tableros/{id}`; `GET /api/integraciones/tableros` devuelve el contrato y `docs/api-integraciones-tableros.md` es la guía para el consumidor. Rangos en hora de El Salvador, `Cache-Control: private, no-store` + caché en memoria de 10 min, conteos con agregación cuando no hace falta agrupar por servicio.

### Reposición de incapacidad (egresos anteriores a la app)

ESDOMED Services arrancó el 23/06/2026; los egresos anteriores no existen en `/pacientes`. Cuando un médico pide una constancia de esos, ESDOMED la **repone** desde `/dashboard/incapacidades/reposicion` (submenú de Incapacidades): sube el FIEH del SIS (se lee en el navegador con el extractor de SIMMOW, `prefillDesdeFieh` en `src/lib/incapacidades/reposicion.ts`; si solo hay escaneo, carga a mano), revisa lo extraído (ingreso **bloqueado**, egreso editable, servicio resuelto contra el catálogo vivo, diagnóstico/recomendaciones como sugerencia) y la **asigna a un médico** (usuarios `medico` vigentes; se sugiere el que coincide por JVPM con el FIEH).

Vive en la misma colección `incapacidades` con `origen: "reposicion"`, `medicoId` = médico asignado, bloque `reposicion{...}` (quién la cargó, cuándo se asignó/completó, lo que decía el FIEH) y el estado propio **`pendiente_medico`** → el médico la ve en su bandeja `/medico/incapacidades/reposicion` (submenú + globo `pendientes.reposiciones`) y la completa con el editor normal (`/medico/incapacidades/[id]/editar`: días adicionales, tratamiento, etc.); al guardar pasa a `pendiente` y sigue el circuito habitual de ESDOMED (emitir → Hoja de Identificación → imprimir). Mientras esté `pendiente_medico` el detalle ESDOMED no deja emitir ni imprimir, pero sí **reasignar** el médico. El médico no puede borrar reposiciones. Regla para código nuevo: todo listado/contador de incapacidades debe contemplar `pendiente_medico` (no es "pendiente de emitir").

### Continuación de incapacidad (sin traslape)

Si al ingresar (o al inicio, en emergencia) el paciente ya tenía otra incapacidad vigente, los patronos rechazan la constancia nueva por traslape. La incapacidad se marca como **continuación** (`continuaDe{ hastaAnterior, incapacidadAnteriorId?, aplicadaPor, aclaracion? }`): el período arranca el día siguiente al fin de la anterior, la estancia ya cubierta no se cuenta otra vez y los días adicionales corren desde ese fin (ej. anterior hasta 28/10, ingreso 19/10, alta 20/10, 90 días → del 29/10 al 26/01, 90 días). Ingreso y alta se imprimen tal cual. El médico la ve detectada (y marcada por defecto) en el formulario; ESDOMED la aplica, cambia o quita desde el detalle (con aclaración obligatoria; también a mano si la anterior no está en el sistema), aun ya emitida, y reimprime. Detección en `src/lib/incapacidades/continuacion.ts` (ignora duplicados del mismo ingreso/atención).

Regla para código nuevo: el período (desde/hasta/total) se calcula **solo** con `calcularPeriodoIncapacidad()` y los días adicionales guardados se derivan con `diasAdicionalesGuardados()` (`src/lib/incapacidades/helpers.ts`); nunca `alta + días` a mano, porque rompe las continuaciones.

### Hoja de inconsistencia de marcación (art. 60)

En `/dashboard/mis-marcaciones` solo se reclaman los días a los que les falta **una** marca (`marcaFaltante()` en `src/lib/inconsistenciasMarcacion/formato.ts`). Sin ninguna marca es un proceso especial de RRHH con documentación de respaldo, y con las dos marcas hay registro: ninguno de los dos se reclama aquí. "Presentar inconsistencia" abre `/dashboard/mis-marcaciones/formato` con una hoja carta por día ya llena (manda el plan; si ese día no tiene turno en él, el horario del reloj); al imprimir se crea el trámite E con esos días y sin adjuntos, y `faltaRecibidoRrhh()` lo muestra como "Falta foto de recibido" hasta que el empleado anexa la foto del recibido de RRHH (no hay estado nuevo: sigue `subido`, así las reglas no cambian y no entra a la bandeja de revisión). Abrir una hoja ya registrada solo la reimprime. El texto de la hoja es el oficial tal cual, con sus erratas: no corregirlo sin que RRHH lo pida. El Vo. Bo. sale de `jefeDe()`: Benjamín Cardoza para todo el personal, y Roberto Centeno Zambrano (Jefe de Unidad de Planificación) cuando quien presenta es Benjamín.

### Anulación de permisos personales (A1/A2)

Un permiso aprobado que el empleado al final no tomó lo anula el admin desde su ficha en Gestión de Trámites, con motivo obligatorio. Solo procede si el trámite no tiene adjuntos: un PDF o foto significa que el permiso sí se hizo, y por eso se comprueba dentro de la transacción y no solo en pantalla. La misma transacción pasa el trámite a `anulado` y devuelve el turno en el plan (`quitarPermisoDeFilas`); una celda editada a mano no se toca. Un anulado ya no ocupa el cupo de un permiso por grupo y día, el empleado no puede editarlo ni adjuntarle nada, y no se reactiva: si hace falta, se presenta otro trámite. Regla para código nuevo: todo conteo de permisos usa `estado === "aprobado"`, nunca "distinto de rechazado".

### Vacaciones programadas (plan de trabajo ESDOMED)

El admin arma una vez al año la programación de vacaciones del personal operativo en `/esdomed-horarios/vacaciones` (colección `vacaciones_programadas/{año}`, importable desde el Excel de la jefatura). Reglas: 15 días exactos dentro del mes (1ra quincena 1–15, 2da 16–30; nunca cruza de mes), máximo 2 por quincena, bloqueadas la 2da de febrero, Semana Santa (calculada con `domingoPascua`), la 1ra de agosto y la 2da de diciembre. El editor del mes la pinta como VAC al abrir (mismo patrón idempotente que los permisos: registro en `fila.vacaciones` con el turno que había, para devolverlo si la vacación se mueve) y al guardar la programación se propaga a los planes ya guardados de meses no terminados; los meses pasados no se tocan. "Copiar mes anterior" nunca copia VAC. Lógica en `src/lib/esdomed/vacaciones.ts`.

### Creating Users

Los usuarios no se registran solos — los crea el administrador directamente en Firebase Auth y luego se crea su documento en `usuarios/{uid}` con el rol correspondiente. No hay flujo de registro público.

### Baja de usuarios (fallecimiento, retiro, traslado) — NUNCA eliminar

Un usuario que deja la institución se **da de baja** desde `/dashboard/usuarios` (botón "Dar de baja", pide fecha efectiva y motivo). La API (`PATCH /api/usuarios/{uid}` con `{ baja: true, fechaBaja, motivoBaja }`) deshabilita la cuenta en Auth, revoca sesiones y escribe `activo: false` + `baja{...}` en el perfil; `{ reactivar: true }` lo revierte. El documento y todo su historial se conservan.

Consecuencias en el resto del sistema (regla para código nuevo: todo listado de personal **vigente** filtra `activo !== false`; los registros históricos guardan el nombre como snapshot y no se tocan):

- Plan de trabajo ESDOMED: el roster excluye a los dados de baja, así que no entran a meses nuevos. Las filas ya guardadas se conservan (`sincronizarFilas(..., { conservarFilasSinUsuario: true })` en el editor) y se etiquetan "Baja"; el asistente puede quitarlas de ese mes con "Quitar del plan".
- Selectores de "quién lo hizo" (fallecidos, altas) excluyen a los dados de baja.
- **Personal de trabajo** (`/dashboard/personal`, grupo "Mi área"): tarjetas del equipo ESDOMED agrupadas por el grupo del plan del mes. La baja lleva `tipo` (catálogo en `src/lib/bajaUsuarios.ts`); con `tipo: "fallecimiento"` la persona sale primero, "En memoria", con tarjeta dorada y estrella. Ese dorado es una excepción deliberada al design system, concentrada en `TarjetaMemorial`; no reutilizarlo como color decorativo.
- `AuthContext` cierra la sesión de un perfil con `activo === false`; el login muestra un aviso propio para `auth/user-disabled`.

**Eliminar** (`DELETE`) borra Auth + documento y hace desaparecer a la persona de cualquier plan que se vuelva a guardar. Reservarlo para cuentas creadas por error, nunca para personal que trabajó.

### Expedientes programados (paciente por llegar)

ESDOMED deja listo el expediente de pacientes que aún no llegan (`Solicitud CODIGO DE INFARTO HNES`, `Solicitud CHAT MARCAPASOS HNES`). Esas dos opciones salen en el campo Servicio de `/dashboard/control-ingresos`, piden "Se presentará en" (hoy o después: un Código Infarto suele llegar el mismo día) y guardan en `expedientes_programados`, **no** en `control_ingresos`: de ahí sale la cola de los médicos. No son servicios, así que no van en el catálogo (define camas y ocupación). La pestaña Programados los lista; "Llegó" abre el formulario con los datos, se elige el servicio real y un lote crea el ingreso y marca el programado como `presentado`. Regla para código nuevo: nada de esta colección se muestra a médicos ni cuenta como ingreso hasta que exista su `control_ingresos`.

### Tablero de censos de emergencia

`/medico/censos/tablero` no lee los censos: lee un documento de contadores por mes (`censo_resumen/{demanda|referidos}-YYYY-MM`), sin datos de pacientes. Arranca en noviembre de 2026 (`MES_INICIO_RESUMEN`); lo anterior fueron pruebas con otros campos y no cuenta. Si el resumen no coincide con los censos, el tablero avisa y ofrece Recalcular. Lo ven los médicos con servicio Emergencia y admin, incluidas las atenciones por persona.

Reglas para código nuevo: todo guardado de un censo pasa por `guardarCenso()` (`src/lib/emergencia/resumenCensoDatos.ts`), que escribe censo y contadores en el mismo lote. Un campo nuevo del formulario se agrega a `contribucion()` (`src/lib/emergencia/resumenCenso.ts`) y a su panel en `VistasCenso.tsx`. Prueba: `node scripts/test-resumen-censos.mjs`.

### Un censo por atención

Una fila de la cola (`control_ingresos`) tiene un solo censo, entre los dos libros. `guardarCenso()` crea el censo vinculado con el id de la fila como id del documento, en una transacción que exige que no exista en ninguno de los dos libros; los censos anteriores a este candado tienen id automático y se encuentran por `controlIngresoId`. Esto evita los duplicados que salían de dos formularios abiertos (otra pestaña, otra computadora, dos médicos, recargar).

Si la fila ya tiene censo, el formulario abre ese registro. Si dos personas chocan al guardar, `guardarCenso()` lanza `CensoYaRegistrado` y no se escribe nada: el aviso ofrece unir lo escrito (`unirFormularios()`: lo guardado manda y las listas se suman) para revisarlo y guardarlo. Lo mismo ocurre al editar si otra persona cambió el registro (`versionLeida`). Una transacción necesita conexión: sin red el formulario avisa y conserva lo escrito, no queda en cola.

Los censos digitados sin pasar por la cola (`controlIngresoId` nulo) quedan fuera a propósito, porque un paciente puede consultar dos veces el mismo día. Prueba: `node scripts/test-unir-censos.mjs`.

La cola de expedientes vigila en vivo solo los censos de ayer y hoy; en la pestaña Histórico el estado de censo de las filas se lee una vez al buscar con `censosDeAtenciones()` (`controlIngresoId` "in" de a 30). Así se puede registrar el censo de una atención de hace días. Si esa lectura falla, el botón se muestra igual, porque el formulario abre el censo que ya exista y `guardarCenso()` impide el duplicado.

### Consulta Externa — subsistema con turnero (en construcción)

`/consulta-externa` es un **subsistema** como Mi horario: layout y menú propios (`src/lib/navConsultaExterna.ts`, acordeón) y "Volver al panel" fijo al pie del Sidebar (prop `regreso`). Se entra desde Pacientes → Consulta Externa en el panel de ESDOMED. El circuito es: ESDOMED carga la "Programación de citas por día" del SIS (.xls) y cada cita recibe un código con prefijo de especialidad (HE-12). La llegada de **primera vez** se marca en la recepción de ESDOMED y la de **subsecuente**, en la estación de su especialidad. La enfermera llama al paciente **directo al consultorio** de su médico; la agenda sugiere el orden, pero ella elige. La **preconsulta no pasa por el sistema**: se coordina de palabra con enfermería (decisión del usuario).

Reglas:
- **Cuentas.** Las estaciones usan cuentas compartidas, rol `consulta_externa`, una por estación. Su único portal es este, así que no llevan "Volver al panel". Quién entra lo decide `src/lib/accesoConsultaExterna.ts`: mientras `EN_CONSTRUCCION = true`, solo admin.
- **Pantallas.** Todas las pantallas muestran todos los llamados. Están en `/consulta-externa/pantalla`, fuera del grupo `(area)`, para ir a pantalla completa. Muestran el código y el destino, **nunca el nombre del paciente** (Infectología y Oncología son sensibles). Deben escuchar un solo documento con los últimos llamados para no gastar lecturas.
- **Voz.** Web Speech API en `src/lib/consultaExterna/voz.ts`, sin backend. Cada llamado suena con un solo "din-don" y el texto se lee **dos veces** (`REPETICIONES_LLAMADO`, pedido del usuario); todo anuncio pasa por `anunciarLlamado()`. Las voces "Natural" de Edge son las mejores. El navegador exige un clic antes de reproducir sonido. Cada pantalla se configura con voz o sin voz, porque dos pantallas que se oyen desde el mismo lugar hacen eco.
- **Especialidades y estaciones.** Son seis especialidades y cuatro estaciones; Cardiología atiende además Cirugía Cardiovascular y Cirugía de Tórax. El catálogo, con prefijo y alias, está en `src/lib/consultaExterna/especialidades.ts`. Una especialidad que no esté en el catálogo no se carga: la vista previa la lista.
- **Carga del día.** El `.xls` del SIS es HTML, y SheetJS lo abre con una hoja por agenda de médico. Lo lee `leerProgramacionCitas()` (`programacion.ts`), que guarda la franja y el consultorio de cada cita. Es distinto de `leerProgramacion()` de SIMMOW, que solo busca DUI y nombre. Los consultorios se comparten entre médicos por turnos, así que la cola va por agenda (médico) y el consultorio es solo el destino.
- **Códigos.** Cada especialidad numera aparte (`numerarNuevas()` en `agenda.ts`), por inicio de franja y luego en el orden del reporte. Una segunda carga del mismo día agrega solo las citas que falten y sigue la numeración. **Nunca se renumera** lo ya cargado, porque el paciente pudo haber recibido su código.
- **Colecciones.** `consulta_externa_agendas/{YYYY-MM-DD}` guarda los contadores del día; `consulta_externa_citas/{fecha}_{especialidad}_{expediente}` guarda una cita por documento. Ambas se escriben en una sola transacción (`guardarAgendaCE()`). No se copian teléfonos, responsable ni dirección.
- **Estación.** El circuito de una cita es `citado → espera → llamado → atendido`, más `no_respondio` (con "Regresó" vuelve a `espera`). Las reglas son puras, en `circuito.ts` (`aplicarAccion`). Los estados de la primera versión con preconsulta (`llamado_preconsulta`, etc.) se leen como los actuales con `normalizarEstado()`. Toda acción pasa por `ejecutarAccion()` (`estacionDatos.ts`): una transacción que verifica el estado actual (lanza `AccionNoAplica` si otra computadora ya movió la cita) y, si es un llamado, lo publica con el consultorio como destino en `consulta_externa_llamados/{fecha}` en el mismo paso.
- **Respuesta inmediata.** Una transacción no actualiza la pantalla por adelantado como una escritura normal. Por eso la estación aplica el estado nuevo en local al hacer clic (`optimistas`), lo descarta cuando llega la cita con ese estado y lo revierte si la acción falla. La transacción lee la cita y el documento de llamados en paralelo (la fecha sale del id de la cita). La pantalla "despierta" la voz al activar el sonido (`prepararSonido()`, que dice "Sonido activado"), para que el primer llamado no tarde.
- **Colas.** Hay una cola por médico (su consultorio), y se muestran todos los médicos del día. Se ordenan por franja, luego por llegada y luego por número (`compararCola`); la primera de cada cola lleva "Sigue", pero la enfermera elige.
- **Cuentas de estación.** Llevan `estacionCE` en el perfil (lo escribe la API de usuarios, obligatorio para ese rol). Las reglas solo les dejan mover citas de **su** estación y solo los campos del circuito. Como la cuenta es compartida, se pide el nombre de quien atiende una vez al día (`QuienAtiende`, en localStorage) y va en cada acción.
- **Pantalla.** Escucha solo el documento de llamados y anuncia los ids nuevos; no anuncia lo que ya estaba al abrir ni llamados de más de 2 minutos. La voz se activa por equipo con el botón al pie de la pantalla (también en localStorage). `?demo=1` simula llamados sin Firestore.
- **Prueba.** `node scripts/test-consulta-externa.mjs [xls-del-SIS]` cubre el lector, el catálogo, la numeración, el circuito y la búsqueda. Con un `.xls` real, además imprime el resumen; no guarda nada.

### Navegación (menú lateral) — registro declarativo

Los menús de médico, comité de lesiones, Psicología, Trabajo Social y el dashboard de ESDOMED/admin (más DIMES y el jefe UCI que entra ahí) se declaran en `src/lib/navRegistro.ts` (tipos `EntradaNav`/`SeccionNav`, `construirMenu`, `rutaVetada`); cada portal tiene su archivo (`navMedico`, `navPsicologia`, `navTrabajoSocial`, `navEsdomed`) y las vistas del comité se definen UNA vez en `navComiteLesiones` (las reusan los tres). Reglas para código nuevo:

- **Quién ve qué** va en `visibleSi(perfil)` de la entrada o sección (reusa los helpers `lib/acceso*.ts`); nunca `slice`/`if` por posición en el layout. Una marca nueva por persona es un predicado. Los globos se declaran con `globo: keyof Pendientes`.
- **Guards desde el mismo registro**: el layout de `/comite-lesiones` veta con `rutaVetada(ENTRADAS_COMITE_LESIONES, …)`; agregar una vista restringida es declarar su `visibleSi`, no tocar el layout.
- **Secciones por tarea**, máximo ~6 entradas cada una; si un grupo crece de más, se parte (p. ej. en ESDOMED los historiales salieron de Administración a "Auditoría"). No usar `children` (ítem que navega Y despliega con flecha: el usuario lo rechazó por confuso).
- **Menú en acordeón** (`<Sidebar variant="portal">`: médico, Psicología, Trabajo Social —también cuando entran a `/comite-lesiones`— y todo el dashboard de ESDOMED/admin; pedido explícito del usuario): arriba **Inicio** suelto; cada sección es un **botón padre de ancho completo** con ícono (`SeccionNav.icon`, `tone: "rose"` solo para Defunciones) y flecha; sus entradas son **hijos con ícono** desplegables debajo, colgados de una línea guía; **un solo grupo abierto a la vez** y se abre solo el de la ruta activa. Siguen con `variant="default"` (encabezados pequeños) los módulos aún no migrados: rol comité, enfermería, RRHH, transporte, ISBM y horarios. No quitar los íconos de los hijos: si un nombre no cabe, ajustar ancho/sangría.
- **Inicio de un portal de área**: `src/components/InicioArea.tsx` (hero institucional + "Pendientes" + "Accesos rápidos"). Los pendientes leen los contadores de `NotificacionesContext` (0 lecturas extra). Psicología en `/psicologia`; Trabajo Social en `/dashboard` (la página se lo muestra a TS en vez del panel de ESDOMED).
- Una vista hermana **sin globo** va como pestaña dentro de su página; con globo (trabajo asignado a esta persona) merece fila propia.
- El Sidebar resalta **un solo ítem**: el href más específico que calce la ruta (no hace falta `exact` para desambiguar prefijos; solo para rutas como Inicio). Lleva `aria-current="page"`, se desplaza solo hasta el activo y en celular la barra superior muestra su nombre.
- Páginas que otro portal necesita (p. ej. matriz/indicadores UCI para el jefe en `/medico/cuidados-criticos/*`) se **reexportan** en la ruta del portal, para no sacar al usuario a otro menú.

## Design System (estándar vigente — TODA UI nueva lo sigue)

Identidad institucional HNES: paleta en `public/paletanueva_tipografia.png`, logo de trazabilidad en `public/1c-trazabilidad-*.svg` (también es el favicon/ícono PWA).

- **Colores**: azul institucional `#1A4E70`, acento `#2B8CA8`, tinta `#16191C`. El tema global `.tema-hnes` (en `globals.css`, aplicado al `<body>` del layout raíz) re-mapea las familias de Tailwind v4 vía variables CSS: dentro del tema, `blue-*` ES el azul institucional y `cyan-*`/`teal-*` SON el acento. Para UI nueva usar esas familias y ya queda institucional — **no introducir colores decorativos nuevos** ni hex sueltos.
- **Familias semánticas, solo con significado**: `amber` = pendiente/advertencia, `rose`/`red` = error y fallecidos, `emerald`/`green` = éxito/confirmado. Nunca usarlas de adorno.
- **Heros**: degradado único `from-[#0d2739] via-[#1a4e70] to-[#2b8ca8]`. No inventar degradados por módulo.
- **Tipografía**: Inter en todo — títulos (`font-heading`), cuerpo y cintillos `uppercase` (su tracking amplio hace de versalitas). No agregar otras fuentes. (Se carga como `--font-ui` en el layout raíz — cambiar de fuente es tocar solo esa línea. Barlow queda solo para los oficios impresos en Word, como dicta la paleta.)
- **Modo claro y oscuro obligatorios**: las rampas del tema ya cubren ambos; escribir siempre las clases `dark:` siguiendo los patrones de páginas existentes.
- **Sidebar**: ítems sin `tone` salen azul institucional por defecto; el único `tone` que acepta `NavItem` es `rose` (Fallecidos/Defunciones). **Excepción deliberada**: los globos de pendientes del menú son rojos (`bg-red-500`) por convención de notificación, aunque la regla general diga amber = pendiente (decisión del usuario, 2026-09-30). No "corregirlos" a amber.
