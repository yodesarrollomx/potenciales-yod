# PPP · Recuperación del recibo confirmado

## 2026-10-07 06:14:40 UTC · Propuesta antes de implementar

Problema observado en `d150ee0`: `Store.flush()` valida la respuesta de Sheets y borra `job`. El puente envía un recibo al puesto, pero si falla `/board/resolve` y el navegador recarga, se pierde la relación entre la solicitud y la revisión confirmada. Comparar cantidades no demuestra qué solicitud se ejecutó.

Cambio previsto: conservar en el caché privado ya existente un máximo de ocho recibos mínimos de las solicitudes `board-` del autón. Cada recibo contiene solamente `request_id`, `case_id`, `scenario_id`, `revision` y `acknowledged_at`. Se crea después de validar la respuesta efectiva de `sheet-cantidades`, antes de retirar su trabajo pendiente. No se incluyen cantidades, resultados, credenciales ni copias nuevas del expediente. Una cola llena bloquea otra escritura del autón antes de enviar, sin sobrescribir recibos.

Tras recargar, el caché no acredita sincronización: primero debe leerse y validarse el libro. Se reenvía únicamente un recibo del mismo caso, escenario y revisión confirmados, precedido del snapshot actual. El puesto registra ese mismo recibo mediante `/board/resolve`, que ya es idempotente. Después responde `yod:ppp:receipt-ack` con el mismo request_id/revision y el nonce/case_id del puente. Sólo ese acuse exacto retira el recibo local.

Resultados esperados: una escritura seguida de ACK válido, fallo al registrar el recibo y recarga completa debe terminar con el mismo recibo registrado y una sola escritura. Otras revisiones, escenarios, casos, lecturas sin confirmar y acuses de otra ventana no liberan la cola. Si el almacenamiento local no admite conservar el recibo, la pantalla debe decirlo y no prometer recuperación tras recargar.

Pruebas previstas: Node con Store/puente reales y transporte doble; Chromium y WebKit con HTML/Store/puente reales y libro sintético; fallo HTTP503 de registro, recarga completa, relectura, mismo recibo, acuse exacto; casos negativos y límite de cola. No probar escrituras en endpoints de negocio ni micrófono físico.

Compatibilidad: padres anteriores pueden recibir el recibo sin contestar el acuse; la cola se conserva y no vuelve a escribir cantidades. La entrega coordinada requiere el acuse del puesto de YOD OS. Reversión: revertir código y cachés de assets; nunca borrar datos, recibos ni registros de negocio.

Estado: propuesta registrada. Implementación, CI y publicación pendientes.
