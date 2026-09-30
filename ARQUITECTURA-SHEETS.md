# PPP — contrato de Sheets y trazabilidad
Decisión de Dirección: 30 de septiembre de 2026. Estado: contrato registrado; migración de cálculo pendiente.

## Fuente única
Google Sheets contiene los datos originales, cantidades editables, supuestos, fórmulas nativas, resultados, flujos y datos para diagramas. El tablero es una vista y superficie de captura del mismo modelo. JavaScript y Apps Script pueden autenticar, validar, transportar, organizar y presentar; no deben implementar una segunda fórmula financiera ni rellenar un resultado calculado como constante.

Los números documentales son entradas con fuente, unidad, fecha y estado de validación. Los valores ausentes permanecen vacíos: no se convierten en cero ni se completan por inferencia silenciosa. Toda diferencia entre fuentes se conserva y se concilia de forma explícita.

## Estado comprobado antes de migrar
Los cinco motores existentes aún ejecutan computar() en el navegador. El libro maestro conserva columnas in*, escenarios_json y resúmenes. Esta arquitectura NO cumple todavía el nuevo contrato. No presentar un archivo con resultados pegados ni un motor de Apps Script como migración terminada.

Se publicó previamente una ampliación genérica del inventario documental del motor vertical (commit 9b88384). No trasladó sus fórmulas a Sheets. El estado real de datos y cambios se registra en las pestañas privadas PPP_Arquitectura y PPP_Cambios de YOD OS · Control Maestro.

## Identidad y versiones
Un libro canónico por caso_id; mantener palabra/códigos existentes y un identificador estable por escenario/version. El libro debe contener entradas ordenadas, cálculo nativo, flujos y diagramas. El registro maestro relaciona caso, proyecto, libro, carpeta, versión activa y revisión del modelo. Una versión publicada se conserva; los escenarios históricos no se sobrescriben.

## Edición
El tablero escribe únicamente las celdas de entrada allowlisted por una tabla de campos en Sheets. Debe rechazar fórmulas como cantidades y no aceptar rangos arbitrarios del cliente. Tras escribir, el servidor relee las celdas calculadas y devuelve la revisión correspondiente. Las mismas entradas pueden editarse en Sheets.

Las fórmulas se protegen para la cuenta propietaria. Una AI opera con la autorización del propietario, sin identidad persistente nueva ni privilegios basados solo en una bandera del navegador. Antes de cambiar una fórmula: guardar texto anterior, nueva fórmula, motivo, referencia y prueba; actualizar revisión del modelo.

## Concurrencia y auditoría
1. Leer el registro de arquitectura, estado actual y revisión del caso.
2. Reservar un alcance de trabajo con actor, task_id, revisión base y vencimiento.
3. Validar autorización del lado del servidor y revisión esperada antes de escribir.
4. Ante conflicto, detener la escritura y conciliar; nunca gana automáticamente el último editor.
5. Registrar evento idempotente con fecha, actor real, fuente, entity_id, versión, campo/rango, antes, después, motivo y evidencia.
6. Releer el resultado, registrar validación, estado publicado o pendiente y el siguiente paso.
7. Liberar la reserva; otro agente debe poder reconstruir antes, ahora y futuro desde el registro.

La bitácora operativa privada guarda cambios de datos y fórmulas. Git guarda código y documentación técnica genérica. No publicar expedientes, nombres de casos, cifras financieras, archivos del backend ni secretos en este repo público. El Control Maestro no sustituye el log por operación: automatizar su generación es parte pendiente de la migración.

## Comportamiento del tablero
Cada lectura muestra revisión, fecha y estado de conexión. Los diagramas usan los resultados y selecciones del mismo libro. Si no hay conexión, indicar que el dato está desactualizado; no mostrar un cálculo local como resultado sincronizado ni confirmar una escritura fallida.

## Migración y evidencia de cierre
| Orden | Trabajo | Evidencia |
| --- | --- | --- |
| 1 | Mapear campos, fuentes y fórmulas de cada motor a celdas/nombres | Diccionario en Sheets con cobertura completa |
| 2 | Construir modelo nativo, escenarios y flujo mensual | Fórmulas reales verificadas; entradas y salidas conciliadas |
| 3 | Proteger fórmulas y validar escritura de cantidades | Colaborador no modifica fórmulas; propietario conserva control |
| 4 | Conectar tablero al cálculo de Sheets | Editar desde ambas superficies devuelve iguales resultados y revisión |
| 5 | Generar diagramas desde las selecciones canónicas | Diagrama y áreas concilian con las mismas celdas |
| 6 | Registrar libros, carpetas y enlaces; integrar casos anteriores | Cada caso conserva ID y tiene libro canónico verificable |
| 7 | Automatizar nuevas altas y trazabilidad | Alta crea expediente/libro y escritura registra antes/después sin duplicados |
| 8 | Retirar motores paralelos de producción | Ningún resultado financiero depende de computar() en cliente/servidor |

Validar igualdad de inventario, áreas, ventas/rentas, presupuesto, deuda, caja, TIR/MOIC y reparto por mes en casos representativos y escenarios guardados. Las tolerancias y reglas de redondeo también viven en Sheets.

## Despliegue
Conservar Portero, códigos y única URL existente del Apps Script. Leer el backend vivo antes de editarlo. Actualizar la implementación existente con Nueva versión; nunca crear otra implementación. No hacer POST de prueba contra producción: puede generar correos y filas reales.

## Coordinación de registros
- YOD OS · Control Maestro: Sistemas, Bitácora, PPP_Arquitectura y PPP_Cambios.
- Repo potenciales-yod: este contrato y CLAUDE.md.
- Repo yod-portal: arquitectura del marco y catálogo, sin duplicar cálculos ni datos.
- Si se localiza un repositorio especializado adicional del ecosistema, enlazar esta decisión allí conservando su historia. La referencia control-maestro-yod de Sistemas no basta para afirmar que ese repo esté accesible.

