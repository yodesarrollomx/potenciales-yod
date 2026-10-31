# Presentaciones desde la versión del PPP

El botón «Mandar hacer presentación con estos números» lee la versión visible y confirmada. Los cinco motores montan `ppp-presentation.js`; la presentación conserva su origen aunque después cambie el tablero.

## Flujo y fuente

1. `presentationContext()` obtiene sólo identidad del PPP, escenario visible, revisión y estado de guardado. Las fichas iniciales nativas usan el recibo leído por `PPPIntake`; los modelos vertical y patrimonial usan sus stores nativos. Las capturas históricas requieren una lectura o un guardado confirmado y comparación con las cantidades actuales.
2. El consumidor solicita `resolvePresentationContext` al Portero existente, mediante `tipo: despacho-v1`. El payload lleva únicamente `board_case_id` y `model_type`. El servidor resuelve el expediente y entrega una sesión corta; nunca se supone que expediente y PPP tengan el mismo ID.
3. `POST /presentations/create` del servicio existente recibe `request_id`, referencias de origen y, cuando procede, presentación y versión editorial de partida. El navegador no entrega resultados financieros. La lectura canónica, los permisos y el snapshot privado pertenecen al servidor.
4. El panel consulta `list` y `status`. Una creación sin respuesta conserva su solicitud exacta bajo un ámbito derivado de la sesión; no reenvía automáticamente. Sólo después de un recibo ausente que confirme solicitud, origen y contrato idempotente se habilita «Reintentar mismo encargo», conservando el payload original. Cerrar el navegador no elimina el trabajo duradero del servicio.
5. La primera versión se abre en `/yodesarrollo-board/presentacion/ppp/?id=…#version=…`. «Crear otra versión» conserva `presentation_id` y envía la versión de contenido de partida. Los cambios de origen quedan visibles; ningún guardado publica o envía al cliente.

`ppp_revision` es una cadena opaca, separada de `source_revision` del expediente, `presentation_version_id`, `version_number` y la revisión publicada. El contexto VIEWED no cambia el comportamiento DEFENDED del bridge usado por el Despacho.

Una ficha confirmada con `MODELO_PENDIENTE` puede encargar un diagnóstico. Sus resultados siguen pendientes. En una captura histórica el servidor puede usar sus entradas guardadas con resultados nulos; el consumidor nunca promueve `computar()` ni el resumen DOM a fuente canónica. Si no hay mapeo de expediente, permiso o lector autorizado, se muestra el impedimento y no se declara un encargo completo.

## Contratos del consumidor

- Origen solicitado: `{board_case_id, viewed_scenario_id, ppp_revision, model_type}`.
- Resolver: `{ok, case_id, board_case_id, endpoint, token, expires_at}`; token sólo en memoria y `expires_at` en milisegundos.
- Trabajo: `{ok, request_id, job_id, phase, source, presentation_id?, presentation_version_id?}`. El origen confirma `ppp_id`, escenario y revisión solicitados.
- Listado: `{ok, jobs, presentations}`; cada versión incluye identidad de presentación y contenido, número editorial, título, fecha y origen.

El servidor valida de nuevo identidad y ámbito. Los controles del navegador no conceden autorización. Se retiran resultados privados al cambiar la sesión o recibir un rechazo de acceso; no se borra `pyod_clave_v1`.

## Verificación y despliegue

`tests/ppp-presentation.test.cjs` cubre referencias, datos pendientes, comparación de capturas, idempotencia, recuperación, identidad, recibos y transporte. `tests/ppp-presentation-browser.cjs` recorre los cinco HTML con solicitudes y datos sintéticos, en escritorio y ambas orientaciones móviles; todos los destinos de negocio están interceptados. El navegador local puede indicarse con `BROWSER_EXECUTABLE`.

El consumidor depende del resolver Portero, las rutas de presentaciones en el servicio de agentes, el lector canónico y el registro/renderizador privado. Tener este código o pasar CI no acredita que esos componentes estén habilitados en producción. La continuación de storyboard a presentación real conserva su aprobación expresa en la misma presentación; esta interfaz no la concede.

Atlas: `2026-10-31.ppp-presentaciones.1`, propuesta `CHG-PPP-PRESENTACIONES-20261031`, pin `d99f27b5da52c5aab5d3c1ff6625937df35ba8f3`. Las etiquetas de recursos se generan desde `versiones.json`; no se editan individualmente.
