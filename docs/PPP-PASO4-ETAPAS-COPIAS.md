# Paso 4 · Etapas y dependencias en hojas

Esta entrega agrega un planificador de QA para copias aisladas. No cambia el tablero, el Portero, el registro productivo, los permisos ni los motores financieros. Usa el contrato de captura `ppp-intake-v1` ya existente; las fórmulas de calendario continúan en Google Sheets.

## Mapa de dependencias

| Fuente | Destino dependiente | Regla y límite |
| --- | --- | --- |
| `Etapas!B2` · cantidad | Identidades y orden en `A5:B28` | De una a 24 etapas; Macro y Residencial hasta ocho |
| `Etapas!C2` · meses | `C5:E28` · inicio, duración y fin | 72 fórmulas existentes; no se reescriben. La secuencia inicia en mes relativo 1 |
| Cantidad y duración | Horizonte del calendario | Tres de 12 produce meses 1–12, 13–24 y 25–36; dos de 10 produce 1–10 y 11–20 |
| Cantidad y duración · Macro/Residencial | `Inputs` · `inEtapas` y `inMesesUrbEtapa` | Búsqueda por `field_id`, no por posición fija. Se conserva el resto de los inputs |
| Preimagen y objetivo | `_PPP_Paso4_QA` | Una fila por operación, antes/después y huellas de fórmulas. El marcador se escribe en el mismo batch que los drivers |
| Lectura posterior de Sheets | Verificación y recuperación | Debe coincidir con objetivo, diario y fórmulas. Recuperar es solo leer; nunca reenviar el batch |

Las fechas son meses relativos: no hay fecha de arranque suministrada. La prueba no inventa reparto de terreno, inversión, costos o ventas, ni multiplica importes por cantidad de etapas. El estado financiero sigue pendiente, según el contrato de captura.

## Uso del planificador

`scripts/ppp-intake-copy-plan.cjs` exporta `plan`, `verify` y utilidades de lectura. No realiza llamadas remotas ni evalúa fórmulas.

El adaptador debe verificar cuenta, archivo fuente, copia distinta, caso, hojas y permisos; leer metadata y CellData actuales; asegurar un único escritor; y mantener la evidencia privada. El planificador rechaza identidades de hojas iguales, ausencia de fuente, fórmulas en los drivers que pretende escribir, cambios en las 72 fórmulas nativas, bindings ambiguos y espejos incoherentes. Solo modifica constantes conocidas y el diario de la copia.

Antes de llamar `plan`, se proporciona la preimagen observada y vacía de la fila del diario en `operation.journalPreimage`. Esto no es CAS de servidor: el adaptador debe volver a leer los drivers y la fila inmediatamente antes de enviar un único batch. Si el resultado es incierto, conserva la operación y realiza únicamente su lectura de confirmación.

`verify` recibe la lectura de celdas y la fila del diario, comprueba las huellas y exige los resultados efectivos del calendario. Para duración desconocida, Google Sheets omite `effectiveValue` en resultados vacíos; el adaptador debe indicar `effectiveValuesIncluded: true` solo cuando pidió explícitamente ese campo en la lectura nativa. Esa bandera es una atestación del adaptador, no una certificación de ejecución realizada por el módulo. Una lectura solo de fórmulas no acredita recálculo.

## Evidencia real aislada · 29-oct-2026

Se hizo una copia completa de cada uno de los cinco libros QA de captura existentes. En cada copia se ejecutaron tres operaciones atómicas y lecturas posteriores: una etapa con duración desconocida, tres de 12 meses y dos de 10 meses. Luego se recuperó la última operación mediante otra lectura, sin reenviar la escritura. Los libros fuente conservaron tres de 12 meses.

| Comprobación | Resultado |
| --- | --- |
| Operaciones y lecturas posteriores en cinco tipos | 15 de 15 correctas |
| Recuperación final solo de lectura | Cinco de cinco correctas |
| Fórmulas de calendario conservadas | 72 de 72 por copia; misma huella en las tres operaciones |
| Fuentes conservadas | Cinco de cinco iguales a la preimagen de valores, fórmulas, validación y formato |
| Celdas ajenas a la operación preservadas | 482 por copia; 480 en Macro/Residencial por sus dos espejos adicionales |
| Auditoría independiente | Cinco copias en dos de 10; tres IDs únicos por diario; cero errores de Sheets; espejos correctos y fuentes intactas |

Los IDs, snapshots, recibos y evidencias de cuenta se conservan en el registro privado, fuera del repositorio. Los tests de CI usan exclusivamente datos sintéticos; su pase no reemplaza estas lecturas reales.

## Alcance que acredita

Esta QA acredita persistencia, recálculo nativo del calendario, dependencias estructurales y recuperación por lectura en copias de las cinco capturas. No acredita una prueba HTTP del recorrido de producción, permisos del Portero, interpretación de voz, equivalencia financiera de las cinco familias ni la promoción de una ficha pendiente al programa financiero de un caso. La activación financiera por caso conserva su propio contrato y comprobaciones. Esos límites no se sustituyen por una puntuación o por el pase de CI.

La instalación en copias es recuperable mediante el diario y la preimagen. No se reemplaza el módulo productivo de etapas ni se ejecuta una migración financiera como parte de este cambio. Para revertir el código, revertir este commit. Las copias y sus recibos se conservan; no borrar libros ni restaurar filas del negocio.
