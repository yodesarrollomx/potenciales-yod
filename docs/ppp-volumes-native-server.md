# Transporte nativo de volúmenes

La colección pertenece al libro canónico y a un escenario estable. El contrato es `schema:2`: la colección declara `shared_allocation_mode` (`preserve` o `built_area`) y cada volumen conserva su ID y los 21 campos del programa A:U. Catorce campos son entradas; F, H, I, L, M, O y R son derivados de Sheets. El POST sólo admite las catorce entradas. Reducir la cantidad activa conserva todas las filas guardadas y su orden.

`server/PPPVolumes.gs` valida el contrato y administra operaciones durables. `PPPVolumesProgram.gs` enlaza las entradas con el programa del escenario, sus fórmulas y sus protecciones. `PPPVolumesFormulas.gs` produce texto de fórmulas nativas; no evalúa dinero, deuda, caja, reparto ni TIR en JavaScript. Las fórmulas de deuda, PIK y reparto permanecen en la plantilla nativa del escenario.

## Integración con Portero

Conservar la implementación, URL y autorización existentes. La ruta `sheet-volumes` se atiende después de validar la credencial y antes de la caché genérica por `request_id`. Autorizar caso, tablero, escenario y actor antes de consultar una operación. `GET recurso=sheet-volumes-receipt` usa los mismos identificadores y permisos; nunca vuelve a enviar cantidades.

El host aporta `authorize`, `revision`, `readModel`, `readCollection`, `sharedResources`, `validateWrite`, `writeDrivers`, `withLock`, `hash`, `audit`, `protectLedger` y `flush`. El escritor recibe un tercer argumento con `request_id`, `actor`, `payload_hash`, `ledger_sheet_id` y `ledger_row`. Debe conservarlo.

Antes de escribir se comprueban revisión esperada, identidad y orden de filas, fórmulas y su huella, campos editables, entradas activas completas, geometría, reparto explícito de recursos compartidos y horizonte nativo. El motor heredado conserva sus 120 meses; límites de transporte mayores no amplían ese horizonte. Ningún importe ni recurso se completa por inferencia.

El índice guarda el modo en K y cada asignación PA conserva sus dieciséis pesos originales C:R y etiqueta humana S. `preserve` exige que los pesos de los cuerpos activos sumen uno. `built_area` sólo se selecciona explícitamente al revisar la propuesta: Sheets reparte cada recurso por M activo / SUM(M activos), construcción sobre rasante sin sótanos. No reescribe los pesos PA. La capacidad anuncia `allocation_modes` y `shared_resources:[{id,label}]`, sin montos ni fórmulas. El modo pertenece al escenario, a la huella del payload y al recibo.

## Operación durable

1. Registrar actor, caso, escenario, revisión base, huella de payload y antes/después en `Volumenes_Operaciones`.
2. Ejecutar una sola llamada atómica a Sheets `batchUpdate`: catorce entradas, IDs, cantidad activa/filas guardadas, modo de recursos y marcador `applied` en la misma transacción.
3. Releer el marcador, sus identificadores y las celdas canónicas. La igualdad de cantidades sin marcador no acredita que esa solicitud se haya aplicado.
4. Confirmar el recibo sólo con revisión y colección exactas del mismo modelo. `calculated:true` exige fórmulas nativas, conciliación de inventario y áreas, recursos y comprobaciones mensuales.

Un timeout conserva la solicitud original. Otro POST con el mismo ID no escribe otra vez. La consulta puede actualizar el recibo y su auditoría, pero no modifica entradas, fórmulas o recursos. Si un recibo confirmado pertenece a una revisión anterior, retorna el recibo original y el modelo vigente con `volume_receipt_status:'superseded'`; la interfaz conserva su distinción.

Un rechazo anterior al intento de escritura genera `volume_rejection`, ligado al actor, payload e identificadores originales, con `stage:'prewrite'` y `write_attempted:false`. Sólo los nueve errores cerrados del contrato producen esa prueba. Un fallo de transporte no es un rechazo demostrado. El ledger es el registro durable por operación; una indisponibilidad de su espejo de auditoría no autoriza repetir la escritura.

## Migración, plantilla y versiones

La migración es propietaria, con reserva, huella de fórmulas de origen, motivo, referencia y prueba. Copia programa y escenario; conserva los cuerpos existentes, las asignaciones explícitas de recursos y los históricos. Instala por lotes las fórmulas, protege sus celdas y verifica en Sheets Y1 (programa/inventario/áreas/recursos), Y2 (ventas/costos/caja/horizonte) y Y5 (paridad contra el origen). Un fallo deja `validation_failed`, sin habilitar escritura.

Una nueva propuesta parte de una plantilla limpia y validada de un cuerpo. La plantilla no contiene valores, nombres, anotaciones ni versiones de clientes. No se obtiene reduciendo un proyecto existente de tres cuerpos. La duplicación de una versión nativa copia programa, escenario y asignaciones, y religa sus referencias y fila de índice antes de enlazar `Versiones` con la nueva hoja financiera.

El hash de revisión incluye programa, escenario, fórmulas mensuales, índice (incluido modo) y asignaciones con etiquetas por versión. Excluye recibos y consultas del ledger. Los diagramas y la conversación consumen la misma lectura nativa.

## Verificación

Las pruebas con dobles ejecutan autorización, CAS, IDs inactivos, preflight, escritura atómica, marcador de commit, pérdida de respuesta, rechazo demostrado, recibos posteriores y protección de derivados. También verifican las referencias y alcance del plan de fórmulas. No ejecutan un motor financiero alterno.

La aceptación financiera se realiza separadamente en una copia privada: igualdad del programa existente y sus 120 meses, escenarios de uno/dos/tres/dieciséis cuerpos por el mismo API con `built_area` explícito y pesos PA intactos, recursos compartidos una vez, rechazo atómico, reconciliación sin reenvío, plantilla limpia y duplicación. Las pruebas locales no sustituyen esa evidencia ni acreditan una publicación viva.
