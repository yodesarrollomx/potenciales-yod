# Programa multiuso y dependencias nativas

CHG-PPP-MULTIUSO-20261117. Autorización: Dirección pidió revisar las limitaciones y modificar el código para integrar los datos del desarrollo y su grafo. No cambia acuerdos comerciales ni aprueba supuestos.

## Revisión del modelo actual

| Área | Evidencia en código | Límite y cambio necesario |
|---|---|---|
| Alta | `PPPIntake.asModel` | Toda ficha devuelve `MODELO_PENDIENTE`, `calculated:false`; completar campos no instala el modelo financiero. |
| Persistencia | `ppp-intake.js` flush/checkSave | El recibo incierto conserva la operación; falta exponer su diagnóstico en el tablero. Un timeout no demuestra rechazo ni autoriza nueva escritura. |
| Programa | `PPPVolumesFormulas.build` | Vivienda por plantas y comercio PB; oficinas, hotel y comercio multinivel necesitan productos explícitos. |
| Terreno | `mixto.html` computar | Área × COS/CUS no distingue acceso, afectaciones ni base normativa. No inferir permisos a partir del programa. |
| Presupuesto | `mixto.html` computar | Dos costos unitarios y consolidado; requiere partidas con alcance, cantidad y fuente, con modo único de presupuesto. |
| Ingresos | `PPPVolumesFormulas.build` | Precio residencial global; comercio y parking comunes al final. Cada producto requiere unidad de precio y calendario propio. |
| Caja | Generador de volúmenes | Anticipos disponibles y restringidos no son cuentas independientes. Necesitan liberación y conciliación mensual. |
| Honorarios | Modelo/reparto | Registrar una sola partida económica y su receptor; no sumar otra vez lo mostrado en reparto. |
| Financiamiento | Plantilla nativa | Conservar límites, principal, interés, comisión, capital y caja por mes. Cambiar tasa o plazo exige recalcular el libro. |
| Reparto | Plantilla nativa | Separar devolución, preferente, catch-up, residual y honorario; resultados vinculados a caja disponible. |
| Grafo | `ppp40-graph.js` | Requiere aristas ligadas a reglas/versiones. El grafo de código y el de fórmulas son distintos. |
| UX | `mixto.html`, `ppp-intake.js` | Captura pendiente y cálculo confirmado deben distinguirse; navegación móvil por bloques sin lienzo ancho obligatorio. |

## Cambio preparado

Un compilador de fórmulas de programa multiuso, sin evaluar finanzas en JavaScript. Genera entradas, resultados nativos y dependencias desde la misma definición: terreno bruto menos exclusiones; superficies por producto; precio por m²/unidad; presupuesto por cantidad o consolidado; totales que permanecen pendientes si falta una línea activa. Cada producto conserva uso, fuente y estado. Un uso operativo sin contrato específico queda pendiente; no se confunde renta con venta.

El manifiesto de celdas y el grafo se generan juntos. Las aristas de capacidad normativa son controles, no multiplicadores ficticios del programa documental. La implantación, calendario, crédito y cascada requieren contratos adicionales y no se declaran resueltos por este compilador.

## Integración y aceptación

1. Probar con datos sintéticos, fuentes ausentes, ceros válidos, productos inactivos, precios por unidad/m², duplicados y conflictos.
2. Instalar sólo en copia privada mediante migración autorizada y protección de fórmulas. Registrar antes/después y revisión.
3. Conectar el lector/escritor del host activo: caso, escenario, CAS, allowlist, marcador atómico y recibo. No habilitar capacidades por presencia del archivo.
4. Conciliar áreas, ventas, presupuesto y flujo mensual; comprobar fórmulas en Google Sheets antes de promover.
5. Integrar UI y grafo desde el mismo snapshot. Preservar casos previos y pruebas de los cinco motores.

Estado: candidato de código; no instalado en producción. El backend vivo aún requiere lectura y cotejo. Reversión: retirar la capacidad nueva/revertir commit; conservar libros, históricos y operaciones pendientes. No borrar registros para revertir.

## Alcance verificado y limitaciones de integración

- Evaluación nativa en copia aislada con datos sintéticos: construido 400, vendible 300, ventas 6,000,000 y partidas 4,050,000. Gasto compartido contado una vez. Activar producto sin datos deja totales pendientes; seleccionar consolidado 8,000,000 excluye las partidas.
- Las identidades y relaciones de partidas se protegen junto con las fórmulas. Cambiar producto vinculado, base de cantidad, añadir o quitar filas exige recompilar y verificar una nueva revisión. No se presenta una edición estructural como cambio simple de valor.
- El plan incluye validaciones de valores no negativos, unidades enteras, COS máximo 100, estados y listas. El dueño de un libro puede saltarse sus protecciones: el host deberá validar nuevamente al leer/promover.
- La regresión de navegador no pudo arrancar Chromium en este entorno (socket no permitido); no se considera aprobada la UX.
- Pendientes: migración transaccional del host, calendario y flujo por producto, depósitos restringidos, deuda, operación/renta, cascada de reparto, impuestos y vista móvil enlazada al snapshot nativo.
