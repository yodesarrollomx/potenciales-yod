# Portada y mapa PPP

La portada y el mapa completo conservan los mismos cinco motores y endpoints. `ppp-home.css` aísla el contenedor del mapa: los z-index de Leaflet, su panel y su gate local quedan dentro del mapa; el sidebar y el velo del shell reciben los toques por delante. No se cambia el shell compartido.

`ppp-catalog.js` consulta `recurso=lista` por cada tipo y muestra los casos conforme termina cada consulta, independientemente de `recurso=mapa`. El desplegable abre inmediatamente, comunica carga/error, limita cada consulta a 25 segundos y reintenta únicamente listas fallidas. `15` significa cinco consultas completas; `9+` indica casos disponibles y lista incompleta. Un error nunca se convierte en una lista vacía. Cambiar credencial cancela las consultas y descarta respuestas tardías; no guarda datos privados en caché. La cifra real depende de las filas que el backend autoriza a cada sesión: 15 es solo el ejemplo sintético de prueba.

Los cinco planificadores forman dos columnas en móvil y tres en escritorio. Cada acceso tiene un SVG local; las descripciones originales completas se conservan en «Qué calcula». Los destinos y controles de los motores se conservan.

## Verificación

`node tests/ppp-home-browser.cjs`, con Playwright y las distribuciones fijas de Leaflet 1.9.4 y gesture-handling 1.2.2 en `PPP_MAP_ASSETS`, recorre Chromium y WebKit con HTML y shell reales. Intercepta todo transporte de negocio y usa 15 casos sintéticos: agrupación, destinos codificados, scroll independiente, sidebar/velo sobre Leaflet, menú sin paneo, consultas parciales, reintento, timeout, vacío real y cambios de sesión. Revisa anchos 320, 390, 430 y 1280. El workflow descarga únicamente assets públicos; ninguna petición de prueba llega a los endpoints de negocio.

También pasan las regresiones de las cinco tarjetas del PPP vertical, sus 81 controles y 40 cuadros KPI. No se modificaron cálculos ni Apps Script. Las pruebas no acreditan sesión real, filas reales ni un iPhone físico. La publicación se verifica por separado comparando los archivos estáticos de Pages con el commit integrado.

No se encontró una chinche enviada a GitHub sobre las tarjetas inferiores al revisar los issues abiertos y los recientes del repositorio. Una chinche guardada solo en IndexedDB del iPhone no está disponible desde GitHub. Esta corrección proviene de la instrucción explícita del propietario.

Reversión: PR que revierta estos archivos y su referencia del atlas, sin borrar ni restaurar casos, sesiones o libros.
