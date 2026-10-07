# PPP · Recuperación del recibo confirmado

## 2026-10-07 06:14:40 UTC · Propuesta antes de implementar

Problema observado en `d150ee0`: `Store.flush()` valida la respuesta de Sheets y borra `job`. El puente envía un recibo al puesto, pero si falla `/board/resolve` y el navegador recarga, se pierde la relación entre la solicitud y la revisión confirmada. Comparar cantidades no demuestra qué solicitud se ejecutó.

Cambio previsto: conservar en el caché privado ya existente un máximo de ocho recibos mínimos de las solicitudes `board-` del autón. Cada recibo contiene solamente `request_id`, `case_id`, `scenario_id`, `revision` y `acknowledged_at`. Se crea después de validar la respuesta efectiva de `sheet-cantidades`, antes de retirar su trabajo pendiente. No se incluyen cantidades, resultados, credenciales ni copias nuevas del expediente. Una cola llena bloquea otra escritura del autón antes de enviar, sin sobrescribir recibos.

Tras recargar, el caché no acredita sincronización: primero debe leerse y validarse el libro. Se reenvía únicamente un recibo del mismo caso, escenario y revisión confirmados, precedido del snapshot actual. El puesto registra ese mismo recibo mediante `/board/resolve`, que ya es idempotente. Después responde `yod:ppp:receipt-ack` con el mismo request_id/revision y el nonce/case_id del puente. Sólo ese acuse exacto retira el recibo local.

Resultados esperados: una escritura seguida de ACK válido, fallo al registrar el recibo y recarga completa debe terminar con el mismo recibo registrado y una sola escritura. Otras revisiones, escenarios, casos, lecturas sin confirmar y acuses de otra ventana no liberan la cola. Si el almacenamiento local no admite conservar el recibo, la pantalla debe decirlo y no prometer recuperación tras recargar.

Pruebas previstas: Node con Store/puente reales y transporte doble; Chromium y WebKit con HTML/Store/puente reales y libro sintético; fallo HTTP503 de registro, recarga completa, relectura, mismo recibo, acuse exacto; casos negativos y límite de cola. No probar escrituras en endpoints de negocio ni micrófono físico.

Compatibilidad: padres anteriores pueden recibir el recibo sin contestar el acuse; la cola se conserva y no vuelve a escribir cantidades. La entrega coordinada requiere el acuse del puesto de YOD OS. Reversión: revertir código y cachés de assets; nunca borrar datos, recibos ni registros de negocio.

Estado: propuesta registrada. Implementación, CI y publicación pendientes.

## 2026-10-07 06:21:46 UTC · Implementación preparada

Store conserva el recibo mínimo desde la respuesta validada y lo incorpora al caché existente. El puente conserva version:1, reproduce recibos sólo con caso/escenario/revisión confirmados y acepta únicamente el acuse de su padre, origen y nonce vigentes. Una cola llena rechaza otra propuesta antes de crear trabajo o escribir. La pantalla advierte si no puede conservar la confirmación localmente.

Cinco secuencias de Store/puente pasaron ejecutando el JavaScript real en un aislado V8 con transporte sintético: captura desde ACK; recarga con relectura; casos/revisiones/escenarios incompatibles; cola llena sin segunda escritura; caché inválido y cuota. La sintaxis del código y del HTML del ensayo de navegador compila. Esta evidencia todavía no equivale a Node/Chromium/WebKit ni a una escritura privada. Se agregaron regresiones para los tres entornos; CI y publicación pendientes.

## 2026-10-07 06:28:57 UTC · Revisión y ajuste antes del segundo cambio

La primera CI pasó controles Node, arquitectura y acceso. El ensayo añadido de navegador no recibió la primera lectura: su padre sintético enviaba un único saludo antes de que terminara de montarse el Store. Se sustituye ese montaje por el `createWorkspace` real de Portal y el HTML/Store/puente reales de PPP; autenticación y APIs permanecen sintéticas. Así se comprueban también reintentos de handshake, aplicación solicitada, recibo y acuse reales entre ambos módulos. Se guardará captura del DOM efectivamente ejecutado, sin presentarla como oficina 3D completa ni producción privada.

La revisión detectó otro límite: ocho recibos ya registrados cuyo acuse se perdió podían quedar bloqueados al avanzar el libro. La resolución existente del servidor confirma idempotentemente una solicitud ya aplicada con su revisión exacta, incluso cuando la revisión actual avanzó. La propuesta 104 se amplió en Portal `43bb8429953ab0779d7571ed5d2bc47552455f59` antes de este ajuste: después de releer el mismo caso, enviar también recibos históricos exclusivamente para conciliación. Un histórico pendiente sigue rechazado por el servidor si su revisión no coincide; no se convierte una coincidencia de cantidades en prueba. El puesto sólo retira el recibo tras respuesta con request_id exacto y status applied. Los recibos no conciliables quedan conservados y visibles; una cola llena bloquea otra escritura del autón antes de enviarla.

Pruebas añadidas: ocho ACK reales del Store sobreviven a recarga y relectura posterior; acuses exactos liberan posiciones sin repetir escrituras. El ensayo conjunto siembra metadatos sintéticos de ocho recibos anteriores, concilia siete previamente registrados por el servicio doble y conserva el octavo rechazado. Los metadatos locales describen un ACK previamente observado; no son prueba criptográfica de autoría del servidor.

Fuente del puesto para la regresión conjunta: Portal `e1dfb5232fc8aabf175c5c0a2806faf83fa63ae1`. Se prueba además otro ajuste explícito después del histórico rechazado: una escritura por solicitud distinta, sin perder el histórico ni bloquear las posiciones libres. Siete casos de Store/puente pasaron en V8; Node y navegadores en esta revisión todavía requieren CI.

## 2026-10-07 06:36:23 UTC · Primer resultado del recorrido conjunto

En la revisión `f2bc376`, Chromium pasó las tres fases con módulos reales de puesto y PPP: una sola escritura 500→644 pese a resolve503 y recarga completa; conciliación de siete históricos registrados conservando uno rechazado; otro ajuste explícito 644→700 con su solicitud independiente. Se obtuvo una captura del DOM real del ensayo, con terreno644 y recibo confirmado; no es una captura de producción ni del despacho 3D completo.

WebKit interrumpió el ensayo por una excepción del adaptador sintético al recibir un POST sin cuerpo y acceder a `tipo` sobre null. Se corrige solamente ese adaptador para devolver un error400 de petición vacía, sin contarla como escritura ni respuesta del libro. El flujo de cantidades conserva sus comprobaciones estrictas y deberá pasar íntegro en ambas implementaciones del navegador. Node, arquitectura y acceso pasaron; la aceptación final sigue pendiente de la nueva CI.
