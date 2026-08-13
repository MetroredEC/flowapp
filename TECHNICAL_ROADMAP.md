# FlowApp — Roadmap técnico

## Principio de arquitectura

Una solicitud, su aprobación, el trabajo del equipo y la entrega forman una sola unidad trazable. Los módulos de área aportan datos especializados, pero utilizan el mismo motor de procesos, eventos, permisos, SLA y tareas.

## Fase técnica 1 — Núcleo operacional

Objetivo: asegurar consistencia y trazabilidad de extremo a extremo.

- Versiones inmutables de procesos publicados.
- La solicitud conserva la versión con la que fue creada.
- SLA total y fechas operativas principales.
- Línea de tiempo transversal de solicitud y tarea.
- Estados y transiciones validadas en servidor.
- Puente idempotente solicitud → tarea.
- Migración y compatibilidad con datos anteriores.
- Logs correlacionados y pruebas de integridad.

Primer corte vertical:

1. Guardar una versión al crear o editar un proceso.
2. Asociar la versión y el SLA a cada nueva solicitud.
3. Propagar la fecha límite a la tarea generada.
4. Registrar eventos de creación, envío, aprobación, asignación, ejecución y cierre.
5. Mostrar versión, SLA y línea de tiempo en el detalle de la solicitud.

## Fase técnica 2 — Centro de trabajo diario

Objetivo: separar planificación, ejecución y notificaciones.

- Mi día: prioridades, riesgo, bloqueos y aprobaciones.
- Trabajo: lista, tablero, calendario, filtros y acciones masivas.
- Bandeja: únicamente novedades accionables.
- Subtareas, dependencias y bloqueos.
- Vistas y preferencias por usuario.
- Búsqueda global y comandos rápidos.

## Fase técnica 3 — Process Studio 2.0

Objetivo: configurar procesos completos sin cambios de código.

- Formularios condicionales y validaciones.
- Documentos obligatorios.
- Aprobaciones y reglas de asignación.
- SLA por etapa.
- Estados, checklists y criterios de aceptación.
- Formulario de entrega y confirmación.
- Correos, Teams y escalamiento.
- Borradores, publicación, simulación y rollback de versiones.

## Fase técnica 4 — Dominios Metrored

Objetivo: llevar los procesos especializados al núcleo común.

- Marketing: artes, campañas, piezas, revisión y entrega.
- BI: reportes, mejoras, fuentes, validación y publicación.
- Comercial: ferias, tarifarios, convenios y vigencias.
- SSO: cuentas, contactos, oportunidades y forecast.
- Operaciones: traspaso SSO, requisitos y activación.
- Inventario: eventos que generan trabajo operativo.

## Fase técnica 5 — Automatización y capacidad

Objetivo: reducir coordinación y asignación manual.

- Motor Cuando/Si/Entonces.
- Asignación por capacidad, especialidad y disponibilidad.
- Ausencias y límites de trabajo simultáneo.
- Escalamientos y procesos encadenados.
- Notificaciones configurables y resúmenes.

## Fase técnica 6 — Analítica e inteligencia

Objetivo: anticipar riesgos y mejorar procesos.

- Métricas de demanda, ciclo, SLA, devolución y capacidad.
- Cuellos de botella y análisis de permanencia por etapa.
- Alertas predictivas.
- Revisión de completitud y detección de duplicados.
- Resúmenes para equipos y gerencia.

## Definición de terminado para cada corte

- Migración reversible o compatible con datos existentes.
- Autorización validada en backend.
- Logs con trace ID para operaciones críticas.
- TypeScript y compilación de producción sin errores.
- Pruebas de escritorio y móvil.
- Prueba con solicitante, aprobador, ejecutor y administrador.
- Sin diálogos nativos del navegador.
- Despliegue verificado antes de cerrar el corte.

## Distribución de capacidad

- 60% evolución funcional.
- 25% confiabilidad, seguridad y datos.
- 15% QA, correcciones y contingencias.
