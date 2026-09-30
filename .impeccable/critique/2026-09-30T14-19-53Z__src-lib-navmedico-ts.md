---
target: sidebar del portal medico
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Usuario\\Desktop\\esdomed-services\\src\\lib\\navMedico.ts"
target_fingerprint: "sha256:1d487b321625f3c5f587d032711aa9ed34a33b63d2d26f54c4fa876fcae399cf"
target_path: "C:\\Users\\Usuario\\Desktop\\esdomed-services\\src\\lib\\navMedico.ts"
timestamp: 2026-09-30T14-19-53Z
slug: src-lib-navmedico-ts
---
Method: dual-agent (A: revisión de diseño · B: detector + navegador)

Alcance: src/lib/navMedico.ts + src/components/Sidebar.tsx (variante medical) + src/app/medico/layout.tsx. Vista viva solo como admin (4 ítems); vista médico revisada en código.

## Design Health Score — 21/40 (Aceptable)

| # | Heurística | Nota | Hallazgo |
|---|---|---|---|
| 1 | Visibilidad del estado | 2 | Censos pierde activo en /medico/censos/demanda-espontanea y /referidos (exact:true, navMedico.ts:28); barra móvil sin sección |
| 2 | Lenguaje del mundo real | 3 | Etiquetas ≠ H1 |
| 3 | Control y libertad | 2 | Jefe UCI/UCIN sale al sidebar ESDOMED (navMedico.ts:82); drawer sin Escape; grupos no persisten |
| 4 | Consistencia | 1 | children + grupos, tonos decorativos, íconos repetidos, tildes |
| 5 | Prevención de errores | 3 | Chevron ~30px pegado al link |
| 6 | Reconocer vs recordar | 2 | 13–21 filas iguales; dos "CONAPINA / FGR" |
| 7 | Flexibilidad | 1 | Sin búsqueda/atajos; orden ≠ frecuencia |
| 8 | Minimalismo | 2 | Ruido de tonos, chevron activo, 5 acciones de cuenta |
| 9 | Recuperación de errores | 2 | Rol incorrecto → /login sin explicación |
| 10 | Ayuda | 3 | Acerca de + SoporteGlobo |

## Design Specificity
Contenido específico del HNES; forma genérica. Variante medical = segundo dialecto visual (activo con degradado + barra + chevron, monograma ES, 8 tonos que bajo .tema-hnes se ven como azul/turquesa aleatorio).
Detector CLI: 4 gray-on-color (Sidebar.tsx:209, :310) — falsos positivos (pareo con hover). Navegador (vista admin): undersized-ui-text (ES, Acerca de 10px, roleLabel 10.8px), nombre truncado, transition-[width] en aside (:537); ai-color-palette del logo = falso positivo. Overlay no confiable.

## Priority Issues
- [P1] Lista plana de 13–21 filas en orden de construcción; Traslados/Fallecidos/Incapacidades en filas 6/8/12. Fix: secciones planas por tarea (navMedico.ts:17-50). → /impeccable layout
- [P1] children (Emergencia, Incapacidades) contradicen la decisión de grupos planos: Censos pierde activo, globo de reposiciones duplicado (:92-97), mis-tap del chevron. Fix: aplanar, quitar exact. → /impeccable distill
- [P1] Indicadores del jefe UCI apunta a /dashboard → cae en el sidebar ESDOMED. Fix: re-export en /medico/cuidados-criticos/indicadores. → /impeccable harden
- [P2] Tonos: default cyan en medical (Sidebar.tsx:111), indigo/violet/teal decorativos, globo bg-red-500 (:60) vs amber=pendiente, HeartPulse en Fallecidos y Egresos de emergencia, KeyRound duplicado. → /impeccable colorize
- [P2] a11y/móvil: sin aria-current, sin focus-visible, drawer cerrado no inert/sin Escape/sin role=dialog, cromo del drawer ~360px, labels a 3 líneas. → /impeccable adapt

## Persona Red Flags
- Residente en el piso: hamburguesa → scroll → Traslados → nuevo; slot de barra móvil = tema.
- Alex: sin Ctrl+K ni atajos.
- Sam: sin aria-current; dos <nav> sin aria-label; toggles genéricos sin aria-controls; globos sin texto SR; 9–10px fijos.
- Médico del comité: dos CONAPINA con globos distintos; etiqueta de 57 caracteres.

## Minor
"Busqueda de telefono", "Buscar Paciente", "Cambiar contrasena" (×6 incl. errores); Anexo 5 → /nueva; slice(1) posicional; admin ve 4 ítems; parpadeo 13→15; /medico↔/comite-lesiones remonta NotificacionesProvider; rol duplicado header/footer; dos "Reposición…" no relacionadas.

## Escalado (recomendado)
1. Registro declarativo único con visibleSi(ctx) + globo + seccion; guards leen del mismo registro.
2. Secciones planas por tarea (≤6 ítems, ≤5 secciones): Solicitudes / Documentos / Pacientes / Emergencia / Cuidados críticos / Lesiones intencionales; llave SIS al menú de cuenta.
3. Profundidad dentro de la página (pestañas) salvo vistas con globo.
4. Barra inferior móvil para médico (Inicio, Traslados, Fallecidos, Incapacidades, Más).
5. Persistir grupos en localStorage + shell compartido entre portales.
6. Ctrl+K desde el registro (primero en ESDOMED).
Evitar: desplegables anidados, reordenar automático por uso, favoritos, rail de íconos, "Más" en escritorio.

## Questions
- ¿Qué 4 destinos sin abrir el drawer?
- ¿Globo = "debes actuar" o "existe algo"?
- ¿Variante medical intencional o residuo?
