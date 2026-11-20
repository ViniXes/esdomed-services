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

### Jornada del plan — de la persona, no del grupo

En el plan de trabajo, `tipoJornada` (Administrativo/Operativo) decide la meta de horas (`metaHorasAdmin` / `metaHorasOperativas`), la guía de turnos y los días no laborales. Es de la persona: un administrativo destacado en Emergencia, Consulta Externa u otro grupo sigue con jornada y meta administrativas (pedido del usuario, 2026-11-18, caso Boris en Emergencia). Cambiar el grupo no la cambia, salvo elegir el grupo "Administrativo"; se cambia con el selector "Jornada" de la fila. La fila de totales de Emergencia, como la de apoyo diurno y Consulta Externa, cuenta cualquier código (también los MA del administrativo destacado).

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

### Establecimientos en los censos de emergencia

"Lugar de la referencia" y "Centro de salud al que refiere" (demanda espontánea) y "Hospital de referencia" (referidos) usan `BuscadorEstablecimiento`. Arriba van los frecuentes con nombre corto (`ESTABLECIMIENTOS_FRECUENTES` en `src/lib/emergencia/establecimientosCenso.ts`, cada uno con su código SIMMOW), con **DoctorSV siempre primero**: no es hospital ni unidad de salud, pero el usuario lo necesita. Al escribir aparece el catálogo completo de SIMMOW (`establecimientosSimmow.json`: UCSF, ISSS, privados…), sin el propio HES. Un frecuente se guarda con su nombre corto y no se repite desde SIMMOW; lo demás se guarda con el nombre de SIMMOW tal cual.

Reglas: para mostrar, contar o comparar se usa `nombreEstablecimiento()`, que lleva los nombres largos o viejos al corto (el tablero agrupa con `agruparEstablecimientos()` y `clasificacionSis()` compara así). No renombrar un frecuente, porque partiría el tablero; otra forma de escribirlo va en su `alias`. Prueba: `node scripts/test-establecimientos-censo.mjs` (verifica los códigos contra SIMMOW).

### Consulta Externa — subsistema con turnero (en construcción)

`/consulta-externa` es un **subsistema** como Mi horario: layout y menú propios (`src/lib/navConsultaExterna.ts`, acordeón) y "Volver al panel" fijo al pie del Sidebar (prop `regreso`). Se entra desde Pacientes → Consulta Externa en el panel de ESDOMED. El circuito es: ESDOMED carga la "Programación de citas por día" del SIS (.xls) y cada cita queda en la cola de su médico. La llegada de **primera vez** se marca en la recepción de ESDOMED y la de **subsecuente**, en la estación de su especialidad. La enfermera llama al paciente **a su estación** por expediente y nombre, y de ahí lo pasa al consultorio; la agenda sugiere el orden, pero ella elige. La **preconsulta no pasa por el sistema**: se coordina de palabra con enfermería (decisión del usuario).

Reglas:
- **Cuentas.** Las estaciones usan cuentas compartidas, rol `consulta_externa`, una por estación. Su único portal es este, así que no llevan "Volver al panel". Quién entra lo decide `src/lib/accesoConsultaExterna.ts`: mientras `EN_CONSTRUCCION = true`, solo admin.
- **Cuenta de pantalla (TV).** Rol `pantalla_ce` (lo crea el admin en Usuarios; una cuenta sirve para todas las TVs): al entrar va directo a `/consulta-externa/pantalla` y no abre nada más (`veLaPantallaCE()` / `esCuentaPantalla()`). No se cierra por inactividad (`AuthContext`) ni pide términos (`TerminosGate`), porque nadie toca la TV. Las reglas solo le dejan leer `consulta_externa_llamados`, y la excluyen de lo abierto a "cualquier usuario real" (`usuarios` ajenos, `control_ingresos`). Regla para código nuevo: si una regla se abre a todo usuario autenticado, agregar `!isPantallaCE() && !isMensajesCE()`. Nunca dejar sesionada en una TV una cuenta personal o de estación.
- **Mensajes a pantalla (speaker).** Desde el 2026-11-18 se llama con **una sola cuenta compartida por todas las estaciones** (rol `mensajes_ce`, la cuenta "speaker"; decisión del usuario: no habrá cuenta por especialidad). Entra directo a `/consulta-externa/mensajes` (sin menú, pensada para celular; `MensajesPantalla.tsx`): un solo cuadro con forma de TV donde se escribe lo que dirá la pantalla. Al escribir un expediente o un nombre se sugieren los pacientes de la agenda del día (`buscarCitas`, sobre `leerCitasDelDia()`, que se lee al empezar a escribir y se renueva cada 10 min); al elegir uno, el mensaje lleva su expediente. Quien no está citado se escribe como **texto libre** (por eso existe). Abajo, **obligatorio** y **solo estas** (decisión del usuario): "Signos vitales", "Consultorio", "Estación" (cuando solo falta despacharlo) y "Trabajo Social" (un solo lugar, sin especialidad: `DESTINO_TRABAJO_SOCIAL`); si no aplica ninguna, **"Texto libre"** (solo el mensaje, sin "Acercarse a"), que también hay que marcar a propósito para que nadie envíe sin destino por olvido. Las tres primeras van **con su especialidad** (`pideEspecialidad()`) (`destinoSignosVitales()` → "Toma de signos vitales de Cardiología", `destinoConsultorioDe()` → "Consultorio 3 de Cardiología", `destinoEstacionDe()` → "Estación Cardiología", con las 4 estaciones: Cirugía Cardiovascular y de Tórax van a la de Cardiología; los números salen de `consultorios` en `especialidades.ts`, que la prueba compara con el catálogo de agendas). **No se envía hasta completar todos los pasos** (pedido del usuario, 2026-11-18): texto, a dónde va (o "Texto libre"), especialidad o estación y, en consultorio, el número. El texto necesita al menos una letra (pedido del usuario, 2026-11-19): solo números es un expediente al que no se le eligió el paciente de la agenda ni se le escribió el nombre, y no se envía (paso `nombre`). Lo decide `pasoPendienteMensaje()`; los pasos van numerados y con palomita, y el botón no se deshabilita: al tocarlo incompleto, el aviso dice qué falta y la vista va hasta ese paso. (La TV admite el destino vacío: "Texto libre" y los mensajes viejos; en "Enviados hoy" los viejos sin destino salen con "Completar"). `crearMensajePantalla()` arma la entrada (`mensaje: true`, sin `estacionId`) y `publicarMensajePantalla()` la publica; el mismo texto (o el mismo expediente) reemplaza su entrada. No mueve citas. Las reglas solo le dejan leer las citas y leer/escribir `ultimos` del documento de llamados, y lo excluyen de lo abierto a todo usuario real.
- **Pantallas.** Todas las pantallas muestran todos los llamados. Están en `/consulta-externa/pantalla`, fuera del grupo `(area)`, para ir a pantalla completa. Muestran **expediente y nombre** del paciente y "Acercarse a Estación {nombre}" (decisión del usuario, 2026-11-17). Antes se llamaba por código y al consultorio para no exponer nombres (Infectología y Oncología): no volver a eso sin que el usuario lo pida. El nombre va en orden natural con `nombreParaLlamado()` (el SIS escribe "Apellidos, Nombres"). Los llamados viejos solo traen `codigo` y se muestran con `tituloLlamado()`. Deben escuchar un solo documento con los últimos llamados para no gastar lecturas.
- **Voz.** Web Speech API en `src/lib/consultaExterna/voz.ts`, sin backend. Cada llamado suena con un solo "din-don" y el texto se lee **tres veces** (`REPETICIONES_LLAMADO`, pedido del usuario; eran dos hasta el 2026-11-18); todo anuncio pasa por `anunciarLlamado(textoLlamado(llamado))`, que dice "Expediente 11431 guion 26, María Pilar López Gonzales. Acercarse a estación Cardiología." (el guion se dice para que no se lea como resta). Las voces "Natural" de Edge son las mejores; se prefieren las de El Salvador (Lorena, Rodrigo, `PREFERENCIA_REGION`) y nunca se usa una voz que no sea en español (`elegirVoz()`). Cada pantalla elige su voz y si habla desde el botón del pie (panel "Voz de esta pantalla", en localStorage, sirve con cualquier cuenta), porque dos pantallas que se oyen desde el mismo lugar hacen eco. El navegador exige un clic antes de reproducir sonido.
- **Pronunciación.** Las voces naturales dicen en inglés los nombres de origen inglés (Kevin, Jennifer…), y la Web Speech API no acepta SSML para marcar el idioma de una palabra. Por eso hay un diccionario "se escribe → se lee" (`configuracion/pronunciacion_ce`, mapa por clave sin tildes, `pronunciacion.ts`). Se edita en Pantallas, con botones para escuchar antes y después. `aplicarPronunciacion()` cambia solo lo que se lee: la pantalla muestra el nombre tal cual. Hoy lo escribe el admin; la regla que deja escribir a ESDOMED está en el repo, sin publicar.
- **Especialidades y estaciones.** Son seis especialidades y cuatro estaciones; Cardiología atiende además Cirugía Cardiovascular y Cirugía de Tórax. El catálogo, con prefijo y alias, está en `src/lib/consultaExterna/especialidades.ts`. Una especialidad que no esté en el catálogo no se carga: la vista previa la lista.
- **Carga del día.** El `.xls` del SIS es HTML, y SheetJS lo abre con una hoja por agenda de médico. Lo lee `leerProgramacionCitas()` (`programacion.ts`), que guarda la franja y el consultorio de cada cita. Es distinto de `leerProgramacion()` de SIMMOW, que solo busca DUI y nombre. Los consultorios se comparten entre médicos por turnos, así que la cola va por agenda (médico) y el consultorio es solo el destino.
- **Códigos.** Ya no se anuncian ni se muestran (desde 2026-11-17), pero cada cita conserva su número: desempata la cola y el buscador lo acepta. Cada especialidad numera aparte (`numerarNuevas()` en `agenda.ts`), por inicio de franja y luego en el orden del reporte. Una segunda carga del mismo día agrega solo las citas que falten y sigue la numeración. **Nunca se renumera** lo ya cargado.
- **Colecciones.** `consulta_externa_agendas/{YYYY-MM-DD}` guarda los contadores del día; `consulta_externa_citas/{fecha}_{especialidad}_{expediente}` guarda una cita por documento. Ambas se escriben en una sola transacción (`guardarAgendaCE()`). No se copian teléfonos, responsable ni dirección.
- **Estación.** El circuito de una cita es `citado → espera → llamado → atendido`, más `no_respondio` (con "Regresó" vuelve a `espera`). Las reglas son puras, en `circuito.ts` (`aplicarAccion`). Los estados de la primera versión con preconsulta (`llamado_preconsulta`, etc.) se leen como los actuales con `normalizarEstado()`. Toda acción pasa por `ejecutarAccion()` (`estacionDatos.ts`): una transacción que verifica el estado actual (lanza `AccionNoAplica` si otra computadora ya movió la cita) y, si es un llamado, lo publica (expediente, nombre, su estación) en `consulta_externa_llamados/{fecha}` en el mismo paso.
- **Destino del llamado.** Por defecto, la estación. Si la estación sabe en qué consultorio está el médico ese día, lo elige en su columna ("Llamar a", `SelectorConsultorio.tsx`) y los llamados de esa cola dicen "Acercarse a consultorio 3 de Cardiología" (decisión del usuario, 2026-11-18). El consultorio de la agenda del SIS no es confiable (el médico a veces se mete a otro), así que **nunca se usa solo**: solo se señala como "según agenda" en la lista, y "Otro consultorio…" deja escribirlo. Todo destino sale de `destinoDelLlamado()` / `destinoConsultorio()` (`circuito.ts`). La elección se guarda por cola (`claveColaMedico()`) en localStorage del equipo, por estación y día. `ejecutarAccion(…, { consultorio })` guarda el destino dentro del paso del historial (sin campo nuevo, así no cambian las reglas). El llamado manual tiene el mismo selector, y "Volver a llamar" repite el destino de la vez anterior.
- **Limpiar pantallas.** En Pantallas de llamados, solo para el admin (`limpiaPantallasCE()`, pedido del usuario 2026-11-18): `limpiarPantallas()` deja `ultimos: []` en el documento del día y anota `limpiadoEn` / `limpiadoPorNombre`. Solo vacía lo que muestran las TVs, que pasan a "Esperando llamados" sin anunciar nada. Las citas conservan su estado y su historial. Pide confirmación y no necesita reglas nuevas, porque el admin ya escribe ese documento.
- **Llamado manual.** La estación tiene "Llamar escribiendo los datos" (`LlamadoManual.tsx`): nombre y expediente de un paciente que no está en la agenda, o de un día sin agenda cargada. Funciona sin citas cargadas. El **expediente es opcional** (pedido del usuario, 2026-11-18): sin él, la pantalla y la voz dicen solo el nombre, y el llamado no lleva la clave `expediente` (Firestore no acepta `undefined` dentro de un arreglo). `publicarLlamadoManual()` solo toca el documento de llamados, sin crear cita ni historial: el registro queda solo en esa entrada (`manual`, `porNombre`). El `citaId` es `idLlamadoManual()`, así volver a llamar al mismo expediente (o al mismo nombre, si no lo tiene) reemplaza su entrada. Si el expediente tiene cita hoy en la estación, se avisa que lo llame desde su tarjeta, para que la atención quede registrada. Lo escrito hoy se guarda en localStorage del equipo, con "Volver a llamar" y "Quitar de la pantalla" (`quitarLlamadoDePantalla()`, para un nombre mal escrito). No necesita reglas nuevas.
- **Respuesta inmediata.** Una transacción no actualiza la pantalla por adelantado como una escritura normal. Por eso la estación aplica el estado nuevo en local al hacer clic (`optimistas`), lo descarta cuando llega la cita con ese estado y lo revierte si la acción falla. La transacción lee la cita y el documento de llamados en paralelo (la fecha sale del id de la cita). La pantalla "despierta" la voz al activar el sonido (`prepararSonido()`, que dice "Sonido activado"), para que el primer llamado no tarde.
- **Colas.** Hay una cola por médico (su consultorio), y se muestran todos los médicos del día. Se ordenan por franja, luego por llegada y luego por número (`compararCola`); la primera de cada cola lleva "Sigue", pero la enfermera elige.
- **Cuentas de estación.** Llevan `estacionCE` en el perfil (lo escribe la API de usuarios, obligatorio para ese rol). Las reglas solo les dejan mover citas de **su** estación y solo los campos del circuito. Como la cuenta es compartida, se pide el nombre de quien atiende una vez al día (`QuienAtiende`, en localStorage) y va en cada acción.
- **Pantalla.** Escucha solo el documento de llamados y anuncia los ids nuevos; no anuncia lo que ya estaba al abrir ni llamados de más de 2 minutos. La voz se activa por equipo con el botón al pie de la pantalla (también en localStorage). `?demo=1` simula llamados sin Firestore.
- **Turnos en la pantalla.** Pedido del usuario, 2026-11-19: dos mensajes enviados seguidos cambiaban la sección principal mientras todavía se leía el primero. Ahora cada llamado nuevo espera su turno: la sección principal no cambia hasta que termina la lectura (aviso + 3 veces), y lo que espera no sale todavía ni en grande ni en "Últimos llamados". Una pantalla sin voz deja cada llamado en grande lo que tardaría leerse (`duracionLlamadoMs()`), para cambiar al ritmo de la que habla en la misma sala. Ningún turno dura menos de 6 s, aunque falle la voz, y tiene un tope para que una voz trabada no congele la pantalla. Lo que se saca de la pantalla ("Quitar de la pantalla", "Limpiar pantallas", un "Volver a llamar" que lo reemplaza) sale de la cola y, si se está leyendo, se calla (`anunciarLlamado(…, signal)`). Lo que solo salió por el tope de 8 conserva su turno (`quitadoDeLaLista()` en `circuito.ts`). Todo lo que suena, también "Probar" y "Sonido activado", va en una sola fila (`enSonido`), así nada se encima.
- **Prueba.** `node scripts/test-consulta-externa.mjs [xls-del-SIS]` cubre el lector, el catálogo, la numeración, el circuito y la búsqueda. Con un `.xls` real, además imprime el resumen; no guarda nada.

### Consulta Externa — catálogo de tarjetas

`/consulta-externa/tarjetas` (menú "Catálogo de tarjetas"; lo ven la gestión y, en solo lectura, las digitadoras `agenda_ce` Paola y Kathya: `veCatalogoTarjetas()`, pedido del usuario 2026-11-19) lista a todo paciente que haya venido **con DUI** en cualquier agenda cargada del SIS, sin importar la fecha: con DUI en el SIS = ya se le hizo tarjeta (pedido del usuario, 2026-11-19). Se busca por expediente, DUI o cualquier parte del nombre, se filtra por especialidad y se ordena por apellido o por última cita; la ficha de cada paciente lee sus citas cargadas (`leerCitasDeExpediente`).

- **Datos.** `consulta_externa_tarjetas/{f00…f19}`: 20 documentos con un mapa `pacientes: { [expediente]: { dui, paciente, primera, ultima, especialidades } }`. El documento sale de `fragmentoTarjeta()` (número del expediente módulo 20). Abrir el catálogo cuesta a lo más 20 lecturas aunque crezca; cada documento aguanta unos 5,000 pacientes. La lógica es pura, en `src/lib/consultaExterna/tarjetas.ts`.
- **Se llena al cargar la agenda.** Después de `guardarAgendaCE()`, la pantalla de carga llama `actualizarCatalogoTarjetas()` con **todas** las citas del reporte, también las ya cargadas. Es idempotente (`fusionarTarjeta()`: manda el nombre y el DUI de la cita más reciente) y va en su propia transacción. Si falla, las citas ya quedaron y se avisa: volver a subir el mismo archivo completa el catálogo. Regla para código nuevo: toda forma nueva de crear citas en `consulta_externa_citas` debe pasar también por `actualizarCatalogoTarjetas()`.
- **Reconstruir.** `node scripts/reconstruir-catalogo-tarjetas.mjs [--dry-run]` lo rehace desde todas las citas (llenado inicial y reparación).

### Consulta Externa — programación de citas 2027

`/consulta-externa/citas-2027` es donde ESDOMED registra las citas de 2027 mientras el SIS no abre las agendas; cuando se abran, se pasan al SIS desde esa lista. La lista abre en "Últimas registradas" (orden de registro en services, la más nueva arriba, como la cola de ingresos; `ultimasCitasRegistradas()`, 300) y por mes de la cita se ordena para pasarlas al SIS (fecha, especialidad, médico, horario); ambas con filtros de especialidad, médico y estado. Descargas de lo filtrado: Excel con una pestaña por especialidad y PDF (`CitasProgramadasPdf`, carta horizontal, una hoja por especialidad, `window.print()`), las dos en el orden de la lista y con las especialidades en `ORDEN_ESPECIALIDADES` y se marcan "Registrada en SIS" en lote. Objetivo del usuario: datos ordenados para que la migración al SIS no cueste, así que **todo lo que irá al SIS sale de listas cerradas** (especialidad, médico, franja y consultorio). Solo se escriben el expediente y, si services no lo conoce, el nombre.

- **Listas con búsqueda.** Especialidad y médico (en el formulario y en los filtros) usan `ListaConBusqueda` (`src/components/consultaExterna/ListaConBusqueda.tsx`): se escribe para filtrar, con `filtrarOpciones()` (sin tildes ni mayúsculas; primero lo que empieza igual, "car" → Carlos), y la flecha despliega la lista completa. Sigue siendo lista cerrada: lo escrito que no calza con una opción se descarta (si calza con una sola, se toma).
- **Horario opcional.** Las agendas de 2027 aún no tienen horas (pedido del usuario, 2026-11-17): las franjas del catálogo se muestran como sugerencia (otro clic la quita) y la cita se guarda sin horario con `franjaInicio`/`franjaFin` vacíos y el consultorio fijo del médico. `textoFranja()` muestra "Sin horario". No volver a exigirlo sin que el usuario lo pida.

Reglas:
- **Catálogo.** Un solo documento, `consulta_externa_catalogo/programacion` (médicos, consultorios, franjas semanales con cupo). Se edita en `/consulta-externa/citas-2027/catalogo` (botón "Catálogo de agendas" de la pantalla de citas, solo gestión; no está en el menú y la página misma devuelve a citas a quien no gestiona). Mientras no haya uno guardado, la pantalla de citas usa la semilla, para poder registrar desde el primer día. La primera vez se siembra de `src/lib/consultaExterna/catalogoCitasSemilla.json`, que salió del libro *agendas_redistribuidas_ACTUALIZADO_13-10-2026.xlsx* (citas del 01/10 al 23/12/2026; una franja entra si el médico la tuvo 3 o más veces; cupo = máximo observado). Los nombres de médicos y consultorios se escriben **como en el SIS**. El id del médico es el slug del nombre original y no cambia al corregir el nombre.
- **Citas.** `consulta_externa_citas_programadas/{auto}`, estados `pendiente → registrada_sis`, más `anulada` (con motivo; nunca se borra). Guardan médico, consultorio y franja como texto: cambiar el catálogo no toca citas ya registradas. Un cupo lleno se puede pasar como sobrecupo con confirmación. No se guardan teléfonos.
- **Corregir.** Toda cita pendiente se corrige con el lápiz de su fila (lo puede hacer quien registra citas, también `agenda_ce`): abre la cita en el mismo formulario y "Guardar cambios" llama a `editarCitaProgramada()`, que valida igual que al crear, firma `editadaPor/Nombre/En` y agrega a `historialEdiciones` cómo estaba antes. Una cita registrada en el SIS o anulada no se corrige (primero se devuelve a pendiente). En reglas es una rama aparte del `update`: sigue `pendiente`, `editadaPor == uid` y solo cambian los campos de la cita.
- **Eliminar (solo admin).** Lo normal es anular, que deja rastro. El admin además puede borrar para siempre, por fila o la selección (`eliminarCitasProgramadas()`), para cargas de prueba o para deshacer una migración; las reglas ya solo dejan borrar al admin.
- **Migraciones.** Las citas que venían en Excel (Drive) se cargan por script con firebase-admin, con `creadaPor: "migracion"`, `migracion: "<lote>"` (p. ej. `agendas-2027-parte-1`, 1,219 citas del 2026-11-17), sin horario, con el consultorio fijo del médico y el texto original en `observaciones`. Las filas con médico, fecha o expediente dudoso no se cargan: van a un Excel para revisar. El único dato que puede faltar es el nombre del paciente (pedido del usuario): médico, fecha 2027 y expediente son obligatorios. Una cita sin nombre se muestra "Sin nombre" y `buscarPacientePorExpediente()` la salta, para que el nombre salga de otra fuente. **Solo se migran citas con el año escrito como 2027** (pedido del usuario): sin año o con otro año, aunque parezca error de dedo, va a revisar.
- **Paciente.** `buscarPacientePorExpediente()` busca en vivo, en este orden: citas 2027, `consulta_externa_citas` y `personas/{expediente}` (hospitalización). Así, quien se vaya registrando en services aparece solo. Si no está, se escribe "Apellidos, Nombres" a mano y la cita queda con `origenNombre: "manual"`. Lo escrito a mano se guarda con mayúscula inicial como manda la ortografía (`nombrePropio()` en `nombres.ts`: "de", "del", "la"… en minúscula salvo al inicio), sin importar cómo se digitó (pedido del usuario, 2026-11-18). Antes de guardar, `palabrasDudosas()` pinta en ámbar la casilla si una palabra no está en `diccionarioNombres.json` y se parece mucho a una frecuente ("alejndro" → Alejandro), con botón "Corregir". Solo avisa, no bloquea: un nombre raro que no se parece a ninguno no se marca. El diccionario (palabras sueltas que llevan 2 o más personas en services, sin nombres completos) se regenera con `node scripts/generar-diccionario-nombres.mjs`.
- **Acceso.** Registran citas `registraCitas2027`: la gestión de Consulta Externa (mientras `EN_CONSTRUCCION`, solo admin) y el rol **`agenda_ce`** ("Agenda de citas Consulta Externa", se crea en Usuarios). `agenda_ce` es personal que por ahora solo llena las citas 2027 y más adelante pasará a ESDOMED (se le cambia el rol): entra directo a `/consulta-externa/citas-2027` y en el menú solo ve "Citas 2027", una sola pantalla con el formulario arriba y la lista abajo como Control de ingresos (sin Inicio, Llamados ni catálogo de agendas, que solo lee; si abre una ruta vetada, el layout la devuelve a citas 2027) y no tiene "Volver al panel". En reglas, `isAgendaCE()` lee el catálogo y las agendas diarias, crea y actualiza citas programadas, y solo hace `get` de `personas/{expediente}` para el autollenado. Además ve **su horario** como el personal ESDOMED (solo lectura): "Mi horario" en su menú lleva a `/esdomed-horarios` (Inicio, Mi horario y Mi grupo, con "Volver a Citas 2027"); el layout la devuelve de planes y vacaciones, y las reglas le dan solo lectura de `planes_trabajo` y `vacaciones_programadas`. Su fila del plan se encuentra por uid (no tiene código de marcación).
- **Prueba.** `node scripts/test-citas-programadas.mjs` (fechas, catálogo semilla sin choques de consultorio, cupo, validaciones y orden).

### Consulta Externa — expedientes creados (productividad + padrón)

El reporte del SIS "Expedientes creados" (.xlsx, de un día o un rango) se sube desde dos lugares con el mismo componente (`CargaExpedientesCreados`): ESDOMED en `/dashboard/pacientes/expedientes-creados` (Pacientes → "Expedientes creados CE", y botón en Gestión de pacientes), y las digitadoras de Consulta Externa (rol `agenda_ce`, Kathya y Paola) en `/consulta-externa/expedientes-creados` ("Expedientes creados" en su menú, `subeExpedientesCreadosCE`). Ellas lo suben a diario; su acceso es exclusivo a esto, Citas 2027, Catálogo de tarjetas (solo consulta) y Mi horario: no ven el menú Pacientes (pedido del usuario, 2026-11-19). La pantalla tiene dos pestañas: "Subir reporte" y "Lista por fecha" (`ListaExpedientesCreados`: lo ya cargado, por día, con rango de fechas de hasta 3 meses, filtro de texto y Excel; `GET /api/consulta-externa/expedientes-creados?desde=&hasta=`). Solo se toman las filas con área de creación **Consulta Externa** (pedido del usuario, 2026-11-19). El lector es puro (`leerExpedientesCreados()` en `src/lib/consultaExterna/expedientesCreados.ts`); el guardado lo hace `POST /api/consulta-externa/expedientes-creados` con Admin SDK (`ROLES_SUBEN_EXPEDIENTES_CE`: esdomed, asistente_esdomed, admin y agenda_ce), primero en vista previa y luego con `confirmar: true`.

- **Productividad.** `consulta_externa_expedientes_creados/{expediente}`: un registro por expediente, creado una sola vez (`create`), así subir el mismo día o un rango traslapado no cuenta doble. Se acredita a **quien creó el expediente en el SIS** (todos los que vengan en el reporte, no solo las digitadoras), no a quien sube el archivo. El nombre del SIS se empareja con `usuarios.nombre` por nombre completo sin tildes ni mayúsculas (`emparejarCreador()`); si no calza, se guarda igual con el nombre del SIS (`creadoPorSis`). Fecha = `fechaCreacion` (YYYY-MM-DD del reporte).
- **Padrón.** `personas/{expediente}` se crea **solo si no existe**, con los datos tal cual del SIS, `nombreMadre` y `origen: "sis_expedientes_creados_ce"`. Nunca se pisa una persona existente; a una existente solo se le agrega `nombreMadre` si no lo tenía. **No** crea ingresos, pre-ingresos ni atenciones de emergencia: esos pacientes solo quedan para autollenar por expediente, y si luego se hospitalizan, la importación de ingresados completa sus datos (hace merge y no toca `nombreMadre`, que no está en `CAMPOS_PERSONALES`).
- **Vista.** Pestaña "Consulta Externa" en Productividad, junto a Operativos y Administrativos, servida por `GET /api/productividad/expedientes-ce?mes=`. Es **provisional** (tabla por persona): el diseño con listas y gráficos, y quién la ve, quedan pendientes con el usuario; hoy solo admin (`ROLES_VEN_PRODUCTIVIDAD_CE`).
- La colección nueva no tiene reglas: el navegador no la lee ni escribe (todo por API). `configuracion/sincronizacion_expedientes_ce` guarda solo la hora y el rango de la última carga (configuración es de lectura pública: sin nombres).
- **Prueba.** `node scripts/test-expedientes-creados.mjs [reporte.xlsx]`.

### Consulta Externa — actualizaciones de datos en el SIS

`/consulta-externa/actualizaciones` ("Actualizaciones" en el menú de las digitadoras `agenda_ce`, también ESDOMED/admin: `subeExpedientesCreadosCE`) registra cada paciente al que se le actualizaron datos **en el SIS** (pedido del usuario, 2026-11-20). Services **no cambia** los datos del paciente: solo guarda quién, cuándo y qué, para la productividad. Se busca por día (citados en `consulta_externa_citas` ese día + expedientes creados ese día, unidos por expediente con `unirPool()`) o por expediente (padrón `personas`, y si no, sus citas).

- **Tipos.** Por ahora dos (`TIPOS_ACTUALIZACION` en `src/lib/consultaExterna/actualizaciones.ts`): datos personales (documento de identificación) y datos del responsable. Vendrán más: se agregan a esa lista.
- **Datos.** `consulta_externa_actualizaciones/{fecha}_{uid}_{expediente}`: un registro por persona, paciente y día; marcarlo otra vez el mismo día corrige los tipos y no cuenta doble. La fecha es la del registro (hoy, El Salvador), no la del día que se consulta.
- **Tope.** `TOPE_ACTUALIZACIONES_DIA = 100` por persona y día (pedido del usuario; quiere afinarlo después). Lo hace cumplir `POST /api/consulta-externa/actualizaciones` en una transacción con el contador `consulta_externa_actualizaciones_dia/{fecha}_{uid}` (responde 429 al llegar). "Deshacer" (`DELETE`) solo existe para lo de hoy y descuenta.
- **Productividad.** `GET /api/productividad/expedientes-ce` devuelve también las actualizaciones del mes; la pestaña provisional las muestra por persona.
- Sin reglas: todo por API con Admin SDK.

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
