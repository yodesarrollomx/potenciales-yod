# Apertura exacta del PPP Patrimonial · 140

Propuesta registrada antes del código: atlas `0a548fcabcd2351a4caeceeeec797db9266c0f37`, revisión `2026-10-12.despacho-perfil140.1`, `CHG-DESPACHO-PERFIL-ORDEN-20261012`.
Fecha de preparación: 12-oct-2026 12:38 America/Hermosillo (19:38 UTC). Estado: código en rama; revisión, CI y publicación pendientes.

## Problema y resultado
Antes, abrir un vínculo `?open` esperaba primero el catálogo completo y luego el caso. Una respuesta temporal de catálogo con `ok:false` invocaba la función que borraba el token compartido con YOD OS. La lectura no tenía límite y una respuesta anterior podía reemplazar la selección posterior.

Ahora, el vínculo solicita únicamente su caso. El catálogo sigue disponible mediante Mis casos, con su contrato original. El cargador existente descarta respuestas tardías y acota la lectura a 25 segundos. Los errores transitorios permiten hasta dos reintentos adicionales, a 2 y 5 segundos, únicamente de lectura. Tras agotarlos, el puesto muestra una recuperación local. No se cambia el token del OS.

La respuesta debe coincidir con el ID solicitado y pasar la aceptación del modelo original. Una respuesta ajena, un modelo inválido o un rechazo de acceso no muestra otro caso ni confirma el anterior como actual. Una máscara de estado evita presentar el borrador previo mientras se comprueba la selección. Los datos, escenarios, cálculos y recibos permanecen en el Store existente.

## Alcance e invariantes
- Sólo HTML, transporte lector y organización de apertura; sin cambios GAS, fórmulas, cantidades, URLs, ACL, scopes ni efectos financieros.
- La autenticación del servidor conserva autoridad. El PPP retira su propia superficie ante rechazo; el Portero conserva la administración de la sesión compartida.
- Cambiar selección, credencial o cerrar la página invalida las lecturas y reintentos anteriores.
- `ppp-case-loader.js` existente proporciona límite y generación; `ppp-case-opening.js` coordina esa lectura y sus estados, sin escribir.
- La lectura no genera un encargo ni reanuda objetivos. El mecanismo existente de persistencia y recibos no se reemplaza.
- El punto final de scripts y sus integraciones se conserva; PR24 incorpora allí el expediente, sin mezclar ese trabajo.

## Evidencia
Diagnóstico previo V8 sobre el fragmento exacto anterior: `lista={ok:false,error:lock_busy}` invocó eliminación de sesión y no abrió el caso. Demuestra el defecto de código, no identifica el error particular de una sesión real.

Las regresiones Node cubren caso exacto, error transitorio, timeout, lectura tardía, cambio de credencial, modelo inválido, acceso rechazado y cierre. El ensayo Chromium/WebKit carga el HTML, Store y puente reales y reemplaza solamente transportes con datos sintéticos. Comprueba catálogo independiente, recuperación, identidad, sesión conservada y cero escrituras de negocio. No acredita el expediente privado ni el micrófono físico.

La sintaxis y un diagnóstico aislado de las pruebas pasaron en V8. Node/Playwright requieren el workflow existente Verificar interfaz PPP; no se afirma que ya se ejecutaron. Los SHA, resultados de CI y publicación deben registrarse sobre la versión final.

## Reversión
Revertir esta entrega frontend mediante PR y repetir comprobaciones. No restaurar ni borrar datos de empresa, fórmulas, escenarios, permisos o recibos.

## 12-oct-2026 12:43 America/Hermosillo · revisión de la preparación
El commit inicial `b0f02dbf15a13c01a5c4795b05adab5c49ed2b16` pasó [Interfaz38299045198](https://github.com/yodesarrollomx/potenciales-yod/actions/runs/38299045198), [Acceso38299045249](https://github.com/yodesarrollomx/potenciales-yod/actions/runs/38299045249) y [Arquitectura38299045201](https://github.com/yodesarrollomx/potenciales-yod/actions/runs/38299045201). Node, Chromium y WebKit se ejecutaron realmente, con transportes aislados. Se conservaron pruebas de cantidades, recibos y borradores; no hubo publicación.

La revisión posterior distingue modelo inválido de un conflicto legítimo con un borrador pendiente del mismo caso. Ese conflicto conserva el mensaje y los controles originales para conciliar; no queda oculto detrás del aviso de apertura ni reemplaza cantidades. Se amplía el recorrido a las dos presentaciones nativas (cards y board) y al conflicto de borrador. La nueva versión requiere su propia CI y revisión antes de publicar.
