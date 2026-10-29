# PPP · ficha común y etapas conversadas

CHG-PPP-FICHA-ETAPAS-20261029 · revisión central `2026-10-29.ppp-ficha-etapas.1`.

Propuesta autorizada por Dirección el 29-oct-2026 y registrada antes de implementación. El contrato y los criterios completos viven en [el atlas central](https://github.com/yodesarrollomx/yod-portal/blob/main/docs/arquitectura/ppp-ficha-etapas.md). El workflow debe fijar el commit de ese modelo antes de integrar.

El recorrido solicitado es una ficha mínima común a Vertical (`mixto.html`), Macrolotes, Unifamiliar, Residencial y Patrimonial; apertura de su tablero normal; paneles clicables; una etapa inicial para nuevas altas; y una intención por texto, dictado o voz como «3 etapas de 12 meses» que reorganice el calendario en el libro canónico con verificación de coherencia tras cada modificación. Los casos existentes conservan etapas, escenarios, documentos, IDs e históricos.

`ARQUITECTURA-SHEETS.md` y `CTR-PPP-SHEETS` siguen vigentes. El agente prepara una operación estructurada sobre el caso/escenario/revisión observados; el servidor valida identidad, campos, capacidad y concurrencia. Sheets conserva las fórmulas y devuelve sus resultados. No se acepta una fórmula o rango libre desde conversación ni se crea un motor financiero en cliente/servidor.

El contrato preparado usa `server/PPPStages.gs` y `server/PPPStagesProgram.gs`, conectados al Portero existente por `sheet-stages`. El sobre de negocio es `{caso_id, escenario_id, revision_esperada, request_id, stages:{schema:1, count, duration_months, mode:'sequential', allocation:'preserve'}}`. La lectura contiene `stages_by_scenario`; `stage_receipt.calculated` y `checks` distinguen cálculo confirmado de persistencia o transporte pendientes. El calendario conserva las asignaciones existentes y no se confunde con los volúmenes schema2. La ficha sólo completa valores estructurales; mantiene faltantes financieros explícitos.

Las verificaciones comprueban las cinco entradas, apertura del tablero correcto, interacción de paneles en escritorio/móvil, una etapa nueva sin colapsar históricos, texto final frente a audio provisional, tres duraciones de doce meses, inventario/áreas/recursos/horizonte/flujos coherentes y escritura idempotente con recibo. Conflicto, falta de capacidad o confirmación incierta permanecen visibles y no se presentan como guardado.

Esta revisión documenta el alcance y las invariantes, sin acreditar implementación ni despliegue. Las pruebas con dobles, paridad aislada con fórmulas reales, CI/Pages, versión existente de GAS y lectura final requieren evidencias distintas. No hacer POST de prueba a producción.

Reversión: deshabilitar la capacidad nueva y revertir los commits de consumidor/handler, conservando datos e históricos. Volver a la versión previa de la misma implementación GAS cuando corresponda. No borrar etapas, restaurar libros completos ni alterar ACL como parte del rollback.
