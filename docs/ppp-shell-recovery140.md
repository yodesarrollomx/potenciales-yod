# PPP externo y recuperación dentro del shell · complemento140

Registro: 12-oct-2026 13:10 America/Hermosillo (20:10 UTC). Propuesta previa: `CHG-DESPACHO-PERFIL-ORDEN-20261012`, atlas `0a548fcabcd2351a4caeceeeec797db9266c0f37`. Base integrada: `f9ce02a3d6c226cedee26ebf5eb7a4ab625106e9`.

## Hallazgo de la revisión separada
PR29 corrigió la apertura del caso y pasó sus recorridos embebidos. El shell real agrupa los hijos del body dentro de yod-canvas y yod-shell. La regla de privacidad aplicada sólo a hijos del body podía esconder la shell entera: también desaparecían el aviso y los controles de recuperación en el vínculo externo sin embed.

## Reparación
La shell permanece visible; la misma regla de privacidad se aplica a su superficie de datos. Tanto antes como después de envolver el tablero, el aviso y los gates mantienen su excepción. El dato sin verificar permanece oculto. No se modifica la fuente del shell, el motor, la credencial, el cálculo, el Store, los recibos, los endpoints ni las cantidades.

## Verificación
El workflow PPP existente añade un recorrido sobre Patrimonial standalone sin embed, usando el shell real de la revisión fijada del atlas. Chromium y WebKit, 1280 y 390 píxeles: respuesta de caso retenida por barrera, error de caso, rechazo de acceso y reintento autorizado. Deben verse el aviso y los controles, conservarse el token y recuperarse el modelo, con cero escrituras de negocio. Los servicios son aislados; no se afirman capturas ni mediciones de una sesión privada.

Sintaxis comprobada en V8; CI y publicación de este complemento pendientes. El cierre de la capacidad externa requiere el nuevo SHA, revisión, comprobaciones y publicación reales. La publicación anterior no se revierte ni se presenta como aceptación de este recorrido.

## Reversión
Revertir sólo este complemento frontend mediante PR. Conservar libros, fórmulas, cantidades, escenarios, datos y recibos.
