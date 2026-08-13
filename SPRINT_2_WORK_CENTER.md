# Sprint 2 — Centro de trabajo diario

## Objetivo

Conseguir que cada persona entienda en menos de diez segundos qué debe decidir, priorizar y ejecutar, usando un único motor de trabajo conectado a las solicitudes.

## Alcance P0

- Separar `Mi día`, `Trabajo` y `Bandeja`.
- Mover las aprobaciones accionables a `Mi día`.
- Añadir plan diario, orden, bloqueos, estimación y posposición a las tareas.
- Crear sugerencias automáticas por vencimiento, bloqueo y prioridad.
- Ofrecer vistas de Trabajo en lista, tablero y calendario.
- Mantener el vínculo solicitud → tarea → línea de tiempo.

## Alcance P1

- Tres prioridades principales.
- Progreso del día y minutos planificados.
- Acción rápida para terminar la siguiente tarea.
- Archivo y reactivación segura de procesos con historial.

## Fuera de alcance de este sprint

- Automatizaciones visuales sin código.
- Capacidad por horas, especialidad y ausencias.
- Portal externo.
- Predicción con IA.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Romper tareas existentes | Columnas nuevas opcionales y backfill no requerido |
| Crear otro motor paralelo | Reutilizar `ws_tasks`, `source_id` y `work_events` |
| Confundir aprobaciones con tareas | Aprobaciones solo en Mi día; Trabajo solo ejecución |
| Fechas incorrectas por zona horaria | Día operativo calculado en America/Guayaquil |

## Definición de terminado

- Migración D1 aplicada sin pérdida de datos.
- Mi día permite planificar, posponer, bloquear y completar.
- Trabajo funciona en lista, tablero y calendario.
- Bandeja contiene únicamente novedades.
- Navegación usa `Trabajo`; la ruta anterior redirige.
- QA de escritorio y móvil sin errores de consola.
