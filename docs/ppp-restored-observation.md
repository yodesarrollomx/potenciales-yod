# Lectura compartida de una copia nativa restaurada

Propuesta previa a implementación, 19 de octubre de 2026. Alcance: `SYS-POTENCIALES`, contrato existente `CHG-PPP-UI-001` / `CTR-PPP-SHEETS`.

Al abrir un enlace del mismo caso con cantidades pendientes restauradas, el tablero conserva la copia y evita sustituir el borrador por una lectura remota. El puente sólo recibe su modelo al aceptar una respuesta remota: queda sin modelo en esta ruta y los saludos del Despacho no producen ninguna lectura compartida.

La restauración sembrará el puente únicamente después de validar completamente la copia con `PPPCaseLoader.validModel`. Usará las entradas y resultados de esa copia canónica y la invalidará inmediatamente. La necesidad de revalidación también contará como pendiente, incluso si las cantidades locales no difieren. El escenario observado y sus cantidades pendientes continuarán separados del escenario defendido y sus cantidades canónicas.

No se enviarán cantidades pendientes, no se recalcularán resultados, no se sustituirán controles, no se confirmará la copia ni se cambiarán fórmulas, permisos o selección defendida. La relectura explícita ya existente mantendrá su confirmación antes de descartar cantidades pendientes; sólo una respuesta nativa válida volverá a confirmar el puente.

Las pruebas usarán nueve versiones sintéticas, un borrador diferente del valor canónico y un transporte que registra todo POST. Verificarán el saludo tras restaurar, estado pendiente y sin confirmar, conservación del borrador, cancelación de la relectura, aceptación de una respuesta fresca y rechazo de una copia inválida. Publicación y comprobación con una sesión real se registran por separado.

Reversión: revertir el commit mediante PR y repetir las verificaciones. Conservar todos los borradores, libros, versiones y registros de negocio.

Implementado y verificado localmente: la regresión falló antes del cambio por ausencia de snapshots después de los saludos. Con el cambio pasan las 129 pruebas unitarias del PPP, sintaxis de JavaScript e inline HTML, y Chromium aislado con nueve versiones, cero snapshots confirmados antes de relectura, cantidades locales intactas, cancelación/aceptación explícita de relectura y cero POST. Una copia inválida nunca se comparte; una copia sin diferencias de cantidades sigue pendiente de revalidación. También pasa el recorrido existente del puente en los tres modelos. La batería completa Chromium/WebKit corresponde al workflow del PR; todavía no se acredita publicación ni sesión privada de producción.
