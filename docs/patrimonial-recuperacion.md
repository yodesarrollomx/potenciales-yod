# Patrimonial #47: recuperación y borradores

Contrato: `CTR-PPP-PATRIMONIAL-NATIVO`. Propuesta: `CHG-PPP-PATRIMONIAL-RECOVERY-047`.

Una publicación posterior omitió el adaptador Patrimonial y dirigía su lectura al validador Vertical. La reproducción aislada arrojó `horizonte_invalido`; el endpoint publicado devolvía `servidor`. La recuperación restaura el transporte tipado sobre la fuente vigente, conservando los demás módulos y el manifiesto. Las fórmulas y cantidades siguen en Sheets.

El snapshot de cada caso se conserva por su ID. Abrir otro caso o crear uno nuevo no descarta cantidades, jobs ni nombre/notas pendientes. El caché anterior se migra al encontrar su mismo ID. Un borrador restaurado requiere lectura fresca antes de escribir; no se usa como lectura confirmada.

Una respuesta perdida conserva el mismo request_id, payload, escenario y revisión esperada. Tras una lectura fresca, Reintentar puede solicitar únicamente ese recibo original. El backend existente devuelve el recibo de su caché antes de CAS. Si el recibo ya no existe, la revisión obsoleta produce conflicto; se conservan los cambios y no se genera otra identidad ni se fuerza una revisión nueva. Después de recuperar un recibo se relee el estado actual antes de enviar cambios posteriores.

Nombre, palabra y notas tienen un borrador separado y durable. Repintar o recargar conserva su texto. Una respuesta incompleta no modifica los metadatos confirmados. Al abandonar el caso se cancela el envío programado y se conservan las cantidades no confirmadas.

El despliegue mantiene el código recuperado tanto en la versión activa como en el editor cuando ambas fuentes coincidían en preflight. Restaurar un editor antiguo sin el adaptador causaría la misma regresión en la publicación siguiente. Toda publicación debe comparar fuente activa, editor, versión y configuración actuales bajo el lock compartido; una fuente concurrente exige revisión antes de escribir.

Pruebas con datos sintéticos: A → B → A, Local/renta cero/CUS ausente, metadatos antes/después del repintado y recarga, recibo perdido/expirado, CAS y cantidades posteriores. La publicación y el cotejo real se registran aparte en #47. No se ejecutan POST de prueba de negocio. El terreno, CUS y pasillos sin fuente permanecen pendientes.

Rollback: revertir la interfaz mediante PR compatible, conservando cachés y jobs. Para GAS, recuperar una versión revisada de la misma implementación y conciliar también el editor; conservar todos los otros módulos y datos. Registrar explícitamente si un rollback de emergencia vuelve a degradar Patrimonial.
