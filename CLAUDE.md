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

### Creating Users

Los usuarios no se registran solos — los crea el administrador directamente en Firebase Auth y luego se crea su documento en `usuarios/{uid}` con el rol correspondiente. No hay flujo de registro público.

## Design System (estándar vigente — TODA UI nueva lo sigue)

Identidad institucional HNES: paleta en `public/paletanueva_tipografia.png`, logo de trazabilidad en `public/1c-trazabilidad-*.svg` (también es el favicon/ícono PWA).

- **Colores**: azul institucional `#1A4E70`, acento `#2B8CA8`, tinta `#16191C`. El tema global `.tema-hnes` (en `globals.css`, aplicado al `<body>` del layout raíz) re-mapea las familias de Tailwind v4 vía variables CSS: dentro del tema, `blue-*` ES el azul institucional y `cyan-*`/`teal-*` SON el acento. Para UI nueva usar esas familias y ya queda institucional — **no introducir colores decorativos nuevos** ni hex sueltos.
- **Familias semánticas, solo con significado**: `amber` = pendiente/advertencia, `rose`/`red` = error y fallecidos, `emerald`/`green` = éxito/confirmado. Nunca usarlas de adorno.
- **Heros**: degradado único `from-[#0d2739] via-[#1a4e70] to-[#2b8ca8]`. No inventar degradados por módulo.
- **Tipografía**: Inter en todo — títulos (`font-heading`), cuerpo y cintillos `uppercase` (su tracking amplio hace de versalitas). No agregar otras fuentes. (Se carga como `--font-ui` en el layout raíz — cambiar de fuente es tocar solo esa línea. Barlow queda solo para los oficios impresos en Word, como dicta la paleta.)
- **Modo claro y oscuro obligatorios**: las rampas del tema ya cubren ambos; escribir siempre las clases `dark:` siguiendo los patrones de páginas existentes.
- **Sidebar**: ítems sin `tone` salen azul institucional por defecto; `tone` explícito solo para semántica (p. ej. `rose` en Fallecidos/Defunciones).
