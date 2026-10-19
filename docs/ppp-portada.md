# Portada y mapa PPP

La portada presenta los proyectos guardados antes del mapa y de los accesos para un análisis nuevo. Los cinco motores tienen nombres uniformes; se retiran las descripciones de cálculo y las instrucciones sobre claves. El buscador filtra nombres, alias y estado, con equivalencia de acentos.

`ppp-catalog.js` conserva las cinco consultas autenticadas `recurso=lista`, independientes de `recurso=mapa`. Deduplica por ID y agrupa nombres base iguales dentro del mismo tipo; cada alternativa conserva su enlace y no se elige una automáticamente. Los encabezados permanecen en el flujo de lectura. La portada abre el catálogo de inmediato; el mapa completo conserva su desplegable acotado y su área de desplazamiento.

El mapa de portada queda plegado; al abrirlo se recalcula su tamaño. Su aislamiento limita las capas de Leaflet y conserva el menú del shell por delante. Sus filtros se muestran junto al mapa.

El archivo documental se enlaza en una pestaña privada del libro maestro existente. Contiene planes, estudios, propuestas y referencias con su fuente y pendientes; la mera presencia de un documento no acredita contratación, autoría ni cálculo financiero. No se crean filas con valores de referencia en los motores para representar antecedentes. Su consulta requiere los permisos Google existentes; el enlace no los amplía. Los datos privados permanecen fuera de Git.

## Verificación

`node --test tests/*.test.cjs tests/access-gates.cjs tests/sheets-offline.cjs`: 120 pruebas aprobadas al preparar el cambio. Incluye deduplicación, alternativas, búsqueda por acentos/alias, enlaces codificados, escape HTML y retirada de resultados al cambiar de sesión.

`tests/ppp-home-browser.cjs` con transporte sintético: Chromium local aprobado en 320/390/430/1280 px. Cubre portada, mapa, menú por delante de Leaflet, ausencia de solapamiento en accesos, consultas parciales, recuperación, rechazo, vacío, timeout y cambio de sesión, sin escrituras de negocio. WebKit queda a la comprobación existente de CI; no se afirma prueba en iPhone físico.

Las lecturas de fuentes y la escritura del inventario se verifican privadamente en el libro y la bitácora compartida. La prueba sintética no acredita una sesión real ni la publicación. Publicar y verificar bytes del commit es un paso separado.

Reversión: revertir presentación mediante PR; conservar inventario, casos, versiones, permisos y libros.

## Expedientes recientes

`ppp-projects.js` consulta `brokers_snapshot` (contrato `brokers.v1`) del CRM ya existente con la sesión actual. Mantiene el alcance de dirección o de cada broker; rechaza estructuras o alcances incoherentes, descarta respuestas tardías y retira datos al cambiar la sesión. No guarda copias en el navegador ni ofrece escrituras al CRM.

Un `ppp_id` explícito incorpora situación, documentos e historial al caso guardado. Los demás expedientes aparecen como análisis previos, sin fabricar cálculos ni trasladar valores entre terrenos. La fecha del movimiento corresponde al hecho documentado, separada de la revisión. `?project=ID` abre el expediente autorizado. El botón de actualización vuelve a consultar los cinco tipos de plan y la cartera; las recuperaciones parciales sólo reintentan listas fallidas.

La lectura refleja el CRM al abrir o actualizar. La incorporación de nuevos documentos al CRM sigue requiriendo conciliación de fuentes; este cambio no conecta automáticamente servicios de mensajería ni acredita la sincronización de una bóveda local.

Verificación del lector: 126 pruebas unitarias y recorrido de Chromium aprobados; expedientes sin modelo, enriquecimiento sin duplicados, historial, 320/390/1280 px y retirada tras cierre de sesión. Servicios de negocio interceptados con datos sintéticos.
