# PPP · ficha común y etapas conversadas

CHG-PPP-FICHA-ETAPAS-20261029 · revisión central `2026-10-29.ppp-ficha-etapas.1`.

Propuesta autorizada por Dirección el 29-oct-2026 y registrada antes de implementación. El contrato y los criterios completos viven en [el atlas central](https://github.com/yodesarrollomx/yod-portal/blob/main/docs/arquitectura/ppp-ficha-etapas.md). El workflow debe fijar el commit de ese modelo antes de integrar.

El recorrido solicitado es una ficha mínima común a Vertical (`mixto.html`), Macrolotes, Unifamiliar, Residencial y Patrimonial; apertura de su tablero normal; paneles clicables; una etapa inicial para nuevas altas; y una intención por texto, dictado o voz como «3 etapas de 12 meses» que reorganice el calendario en el libro canónico con verificación de coherencia tras cada modificación. Los casos existentes conservan etapas, escenarios, documentos, IDs e históricos.

`ARQUITECTURA-SHEETS.md` y `CTR-PPP-SHEETS` siguen vigentes. El agente prepara una operación estructurada sobre el caso/escenario/revisión observados; el servidor valida identidad, campos, capacidad y concurrencia. Sheets conserva las fórmulas y devuelve sus resultados. No se acepta una fórmula o rango libre desde conversación ni se crea un motor financiero en cliente/servidor.

El contrato preparado usa `server/PPPStages.gs` y `server/PPPStagesProgram.gs`, conectados al Portero existente por `sheet-stages`. El sobre de negocio es `{caso_id, escenario_id, revision_esperada, request_id, stages:{schema:1, count, duration_months, mode:'sequential', allocation:'preserve'}}`. La lectura contiene `stages_by_scenario`; `stage_receipt.calculated` y `checks` distinguen cálculo confirmado de persistencia o transporte pendientes. El calendario conserva las asignaciones existentes y no se confunde con los volúmenes schema2. La ficha sólo completa valores estructurales; mantiene faltantes financieros explícitos.

Las verificaciones comprueban las cinco entradas, apertura del tablero correcto, interacción de paneles en escritorio/móvil, una etapa nueva sin colapsar históricos, texto final frente a audio provisional, tres duraciones de doce meses, inventario/áreas/recursos/horizonte/flujos coherentes y escritura idempotente con recibo. Conflicto, falta de capacidad o confirmación incierta permanecen visibles y no se presentan como guardado.

Esta revisión documenta el alcance y las invariantes, sin acreditar implementación ni despliegue. Las pruebas con dobles, paridad aislada con fórmulas reales, CI/Pages, versión existente de GAS y lectura final requieren evidencias distintas. No hacer POST de prueba a producción.

## Comportamiento implementado

Las cinco entradas nuevas abren una ficha con los datos mínimos de su tipo. Al guardarla se abre el tablero existente del mismo tipo y se registra la captura en Sheets. Los campos sin dato permanecen vacíos; el tablero no ejecuta su cálculo financiero heredado sobre valores de ejemplo. Las ediciones de áreas y demás campos admitidos guardan una revisión nueva con control de concurrencia y lectura de confirmación.

La captura comienza con una etapa cuya duración aún no está definida. Texto o dictado como «3 etapas de 12 meses» prepara tres etapas consecutivas, conservando las asignaciones. La propuesta se aplica mediante el mismo panel de etapas. En una captura incompleta se guarda un calendario relativo de 36 meses; no se infieren fechas de inicio ni resultados financieros. El micrófono usa el dictado disponible en el navegador y permite revisar el texto antes de aplicar.

Cada operación conserva su identificador. Si Sheets tarda o se pierde la respuesta, el tablero busca el recibo por GET sin repetir la escritura. Mientras se confirma una operación de etapas se bloquean otras ediciones del mismo caso. El navegador cancela la reconciliación al cambiar de caso o sesión.

La ficha, sus guardados y sus consultas de etapas dejan de esperar tras 60 segundos. Ese plazo libera el indicador de espera y muestra «Comprobar guardado»; no significa que Apps Script haya cancelado la operación. La solicitud y los datos se conservan y la recuperación consulta únicamente su recibo por GET. Una respuesta que llegue después del plazo no abre un caso ni sustituye una lectura posterior. Si el servidor todavía no confirma el recibo, el estado continúa pendiente; no se envía otro POST para repetir una creación incierta.

## Límite financiero de esta entrega

Una ficha guardada permanece en `MODELO_PENDIENTE`, incluso si después se llenan todos sus campos. Esta entrega no contiene la migración transaccional de esa captura al programa financiero nativo. `calculated:false` y las comprobaciones financieras pendientes son deliberados; guardar datos o un calendario no acredita utilidad, caja, deuda ni reparto calculados.

El programa vertical nativo completo dispone de un ejecutor de etapas separado, con fórmulas de Sheets y nueve comprobaciones. Su prueba real aislada de una a tres etapas de doce meses conservó inventario e importes. Esa prueba no acredita modelos financieros nativos de los otros cuatro tipos ni convierte automáticamente las nuevas fichas.

La plantilla general de alta financiera se conserva. No se promueve globalmente la plantilla con etapas, porque limitaría la creación existente de proyectos con dos o tres cuerpos. La activación financiera por caso requiere una instalación recuperable desde su propio programa revisado y un recibo durable; pertenece a la siguiente migración, no a la captura inicial publicada.

Reversión: deshabilitar la capacidad nueva y revertir los commits de consumidor/handler, conservando datos e históricos. Volver a la versión previa de la misma implementación GAS cuando corresponda. No borrar etapas, restaurar libros completos ni alterar ACL como parte del rollback.
