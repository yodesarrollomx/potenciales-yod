# PPP · Jev Images — clasificación visual en sombra
Decisión: 2026-10-28. Estado: **relevo documentado; NO habilitado en tableros públicos ni Sheet**. La fuente de verdad y los contratos de edición/versionado del PPP siguen siendo los actuales. No toca el formulario público de leads `plan-potencial`.
Referencias: https://docs.typesafe.ai/images ; https://github.com/yodesarrollomx/yod-portal/blob/main/docs/JEV-IMAGENES-RELEVO-20261028.md .
## Flujo
1. Registrar artefacto en origen autorizado con proyecto y `caso_id`, versión, fecha, hash, OCR/texto si existe y permisos. No crear un segundo caso sólo por similitud de imagen.
2. Clasificar foto de terreno, plano, croquis, alzado, render, captura financiera o desconocido; exigir revisión humana ante ambigüedad de tipo, identificación de predio, autoría, fecha o versión.
3. Jev experimental sólo sugiere tipo o región dentro de una imagen, **no extrae superficies confiables, no aplica normativa, no calcula rendimiento y no acepta cambios en flujos**. No pasar nombres/finanzas reales al repo público.
4. Terra vincula documentación a etapa y tablero sólo después de cotejar el caso y fuente. Si usuario dicta «tres etapas de doce meses», interpretarlo como propuesta de cambio estructurado; validación de fechas, dependencias, totales, flujo, fórmulas, bases de cálculo y autorización se hace fuera de Jev, en motor y Sheets de referencia.
5. Sol integra cambios mediante adaptador con idempotencia y conciliación de versión (activa, presentada, aceptada); Astra audita fórmula, presentación, evidencia, y rollback. Un resultado de Jev no escribe Sheets, no publica escenarios ni altera aprobaciones.
## Ensayo antes de activar
Flag privado deshabilitado por defecto; comparar lotes de imágenes reales autorizadas con baseline GPT conjunto. Métricas: cobertura, errores, tiempo a propuesta correcta, costo total, revisiones y escrituras evitadas. Umbral 0.95 es una hipótesis de ruta, no una garantía. Guardar manifiesto, revisión de criterios, salida cruda y recibos. Estado final sólo cuando la operación real esté verificada.
Responsables: Sol dirige, Terra ejecuta, Astra dicta PASS/NO PASS/BLOQUEADO; no inventar ejecución continua de chats.
