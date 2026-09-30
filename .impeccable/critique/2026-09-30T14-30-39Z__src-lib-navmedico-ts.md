---
target: sidebar del portal medico (sesion real de medico)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\Usuario\\Desktop\\esdomed-services\\src\\lib\\navMedico.ts"
target_fingerprint: "sha256:1d487b321625f3c5f587d032711aa9ed34a33b63d2d26f54c4fa876fcae399cf"
target_path: "C:\\Users\\Usuario\\Desktop\\esdomed-services\\src\\lib\\navMedico.ts"
timestamp: 2026-09-30T14-30-39Z
slug: src-lib-navmedico-ts
---
Method: dual-agent (A: revisión de diseño en vivo · B: detector + navegador), sesión real de médico base (UCIN Adultos, 13 ítems, sin globos) en localhost:3000; escritorio 1707px + móvil 390px vía iframe.

## Design Health Score — 25/40 (Aceptable)

| # | Heurística | Nota | Hallazgo |
|---|---|---|---|
| 1 | Visibilidad del estado | 2 | /medico/censos/demanda-espontanea sin activo; /medico/censos doble activo; activo fuera de vista en /medico/incapacidades/reposicion |
| 2 | Lenguaje | 3 | Orden de construcción, no de jornada clínica |
| 3 | Control | 3 | Drawer sin Escape/focus trap; jefe UCI sale al sidebar ESDOMED |
| 4 | Consistencia | 2 | Dos gramáticas de submenú, chevron triple, íconos repetidos, casing |
| 5 | Prevención | 3 | Chevron 30×48 pegado al link |
| 6 | Reconocer | 2 | 13 ítems sin agrupar; Anexo 5 cortado en el pliegue de escritorio |
| 7 | Flexibilidad | 1 | Sin atajos, salto rápido ni recientes |
| 8 | Minimalismo | 3 | Cromo móvil pesado; `tone` sin efecto visible |
| 9 | Recuperación | 3 | Mayormente fuera del sidebar |
| 10 | Ayuda | 3 | Acerca de + SoporteGlobo |

## Design Specificity
Paleta institucional y calmada; estructura genérica (lista en orden de construcción). Corrección vs corrida de código: los tonos NO se ven aleatorios (indigo/violet/blue → #4187A8, cyan/teal → #2B8CA8, + rose) — `tone` es config muerta. Foco: existe el outline por defecto de Chrome, no diseñado, no cubre el chevron.
Detector CLI: 4 gray-on-color (Sidebar.tsx:209, :310) falsos positivos. Navegador: /medico 45, /medico/traslados 22, móvil 31; sidebar reales: "ES" y "Acerca de" 10px, nombre/servicio 11px, roleLabel 10.8px, transition: width en aside, degradado del tile ES. Overlay [Human] en localhost:3000/medico/traslados.

## Priority Issues
- [P1] Lista plana de 13 en orden de construcción (navMedico.ts:17-50); Traslados/Fallecidos/Incapacidades en 6/8/12; Anexo 5 cortado. → /impeccable layout
- [P1] Wayfinding: censos sin/doble activo (exact:true navMedico.ts:28), activo fuera de vista, sin aria-current, barra móvil sin sección, jefe UCI cruza a dashboard (:82). Fix: match[], scrollIntoView nearest, aria-current, título en barra móvil, re-export Indicadores. → /impeccable harden
- [P2] Dos gramáticas de submenú + chevron con tres significados; "Atendidos en emerge…" truncado; hijos a 2 líneas. Fix: grupos planos, quitar chevron del activo (Sidebar.tsx:122). → /impeccable distill
- [P2] Drawer móvil: 353/779px de cromo (45%), 8/13 ítems; 20 focusables cerrado; sin dialog/Escape; hamburguesa sin aria-expanded; mascota sobre backdrop; tema en slot principal. → /impeccable adapt
- [P3] Higiene: tone solo semántico + default azul (Sidebar.tsx:70-79, :111); globo red vs amber (:60); KeyRound y HeartPulse duplicados; tildes/ñ; focus-visible diseñado. → /impeccable polish

## Persona Red Flags
- Residente: hamburguesa fuera del pulgar; flujos centrales a 2 toques + scroll; barra sin sección.
- Alex: scroll para Anexo 5/Incapacidades; sin salto por teclado ni recientes.
- Sam: sin aria-current; toggles idénticos sin aria-controls; aside móvil sin nombre; 20 ítems ocultos antes del contenido; foco recortado.
- Casey: label truncado, chevron 30px, mascota sobre backdrop.

## Minor
UCIN Adultos duplicado pie/hero; Censos se origina en Cola de expedientes pero vive bajo Emergencia; scrollbar oscuro; slice(1) posicional; admin ve 4 ítems; remount de NotificacionesProvider entre portales; globo duplicado padre/hijo; indicador N de Next (dev).

## Escalado
1. Registro declarativo { id, href, label, icon, seccion, match[], visibleSi(perfil), globo? }; guards del mismo registro; 0 lecturas.
2. Secciones ≤6: Solicitudes / Documentos / Emergencia (con Cola de expedientes y Censos) / Pacientes / por persona al final; llave SIS a cuenta.
3. Sin globo → pestaña en su página; con globo → fila propia.
4. Barra inferior móvil: Inicio, Traslados, Fallecidos, Incapacidades, Más.
5. Ctrl+K + recientes en localStorage por uid; grupos plegados por uid.
Evitar: anidados, colores por módulo, "Otros", config en Firestore, prefetch, pie creciente, reordenar por uso.

## Questions
- ¿Qué 4 destinos en el celular?
- ¿Censos es lugar o paso de Cola de expedientes?
- ¿El menú describe el trabajo o el organigrama de permisos?
