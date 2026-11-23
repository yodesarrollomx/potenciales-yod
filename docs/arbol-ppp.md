# PPP · Árbol de decisiones

Propuesta `ARBOLPPP` (cambio `CHG-ARBOL-PPP-20261123`) en el atlas central. Estado: **propuesto; el servidor no está publicado y el árbol nace apagado**. Este documento describe lo que hay en la carpeta `arbol-ppp/` y lo que falta para usarlo.

## Qué es

Una forma de armar un Plan de Potencial paso a paso. Se empieza con el predio y cada dato que se define abre la rama siguiente. Mientras se avanza, la pantalla muestra una vista previa con las siete tarjetas del plan (Reparto, Terreno, Producto, Tiempo, Costo y ganancia, Dinero, Riesgo y estado).

- **Reglas como datos.** Las preguntas, opciones, rangos, fórmulas, alertas y pruebas viven en tablas (`arbol-ppp/definicion/`). El motor las valida contra una lista cerrada de operaciones; no ejecuta código escrito en una hoja.
- **Vista previa rotulada.** Toda cifra que calcula la pantalla dice «Estimado · no sincronizado». El plan completo y lo que se guarda como plan salen del libro, no del navegador.
- **Alertas con ruta.** Cuando un cambio hace que algo deje de pasar, la alerta dice por qué, por dónde llegó y qué cambio lo arreglaría.
- **Nueve pruebas de riesgo.** Cada umbral se puede cambiar por plan. Si difiere del valor por omisión, queda marcado «umbral propio».
- **Áreas del edificio por plan.** Se cambian en m² o en %, se agregan con nombre libre, se renombran y se quitan, cada una con su estado.
- **Comparador.** Dos opciones lado a lado, con el aporte de cada decisión y un veredicto en palabras.
- **Todo es editable.** Opciones, fuentes, rangos, referencias y componentes se editan como datos. La estructura del árbol no se edita desde la pantalla.

## Archivos

| Ruta | Qué es |
| --- | --- |
| `arbol-ppp/motor.js` | Motor puro: carga y valida la definición, evalúa un plan, sugiere, compara y arma el paquete del visor. Sin red, sin almacenamiento y sin `eval`. |
| `arbol-ppp/pantalla.js`, `pantalla.css`, `arbol.html` | Pantalla táctil (430, 375 y 320 px). Sin red; usa el almacenamiento local del navegador para conservar el avance. |
| `arbol-ppp/servidor.js`, `servidor.css`, `arranque.js` | Barra del libro: definición publicada, guardar y abrir. Solo habla con el servidor del PPP 2. |
| `server/ppp2/ArbolPPP.gs` | Rutas del árbol en el servidor del PPP 2; apagadas hasta que la configuración diga `arbol = sí`. |
| `arbol-ppp/definicion/*.csv`, `vertical.json` | Definición del árbol vertical. |
| `arbol-ppp/definicion-tablas.js` | La misma definición lista para la página. La genera `construir-artifact.cjs`; no se edita a mano. |
| `arbol-ppp/conexion/conexion.js` | Paso de un plan a una columna de factores y de regreso. |
| `arbol-ppp/conexion/caso-muestra.cjs`, `siembra.cjs`, `datos/` | Casos inventados y planes sembrados para las pruebas. |
| `arbol-ppp/pruebas/motor-real.cjs`, `arbol-ppp/conexion/pruebas.cjs`, `arbol-ppp/conexion/pruebas-gs.cjs`, `tests/arbol-ppp-servidor.test.cjs` | Pruebas en Node; las dos últimas, del servidor contra un doble de Sheets. |

## Reglas

- **Sin datos de proyectos.** El caso de muestra y el caso con problemas son inventados. Los valores de referencia son iniciales: cada plan pone los suyos.
- **Sin identificadores ni ligas.** Ningún identificador de libro, liga de visor ni llave vive en esta carpeta. El servidor los toma de su configuración.
- **Sin permisos nuevos.** No se agregan códigos del Portero, entradas de menú ni roles.
- **Un dato ausente se queda vacío.** Nunca se convierte en cero. Lo que está en referencia o en «no sé todavía» cuenta como por confirmar.
- **Si cambia la definición**, se regenera `definicion-tablas.js` con `node arbol-ppp/construir-artifact.cjs` y se corren las pruebas.

## Verificación

```
node --check arbol-ppp/motor.js
node --check arbol-ppp/pantalla.js
node --check arbol-ppp/definicion-tablas.js
node --check arbol-ppp/conexion/conexion.js
node arbol-ppp/pruebas/motor-real.cjs
node arbol-ppp/conexion/pruebas.cjs
node arbol-ppp/conexion/pruebas-gs.cjs
node --test tests/arbol-ppp-servidor.test.cjs
```

Las tres primeras son guiones propios: imprimen el total y salen con código 1 si algo falla. Usan datos inventados y el libro de ejemplo de `tests/fixtures/`.

## Guardar y abrir en el libro

Con la sesión de YOD OS que ya está en el navegador, la barra de arriba de `arbol.html` pide al servidor del PPP 2 la definición publicada, guarda el plan como **una columna en Borrador** del libro Maestro y abre los planes que el árbol guardó. Archivos: `arbol-ppp/servidor.js` (el puente), `servidor.css`, `arranque.js` y, en el servidor, `server/ppp2/ArbolPPP.gs`.

- **Nace apagado.** Mientras la configuración del vivero no diga `arbol = sí`, el servidor responde `apagado`, la página del PPP no enseña el enlace y el árbol trabaja como calculadora suelta.
- **Sin sesión, apagado o sin red**, la pantalla usa la definición de la página, lo dice («Sin conexión al libro») y no ofrece guardar. No inventa nada.
- **Permisos del servidor, no de la página.** Leer pide sesión con el tablero `PT`; guardar, los roles que ya editan. No hay códigos ni roles nuevos. La página nunca borra la credencial del Portero.
- **No pisa.** El árbol solo actualiza una columna que él creó, en Borrador y sin cambios desde que se abrió; si no, avisa y ofrece guardar como plan nuevo.
- **El libro guarda valores, no estados.** Al abrir un plan guardado, lo que estaba «confirmado» vuelve como «decidido».
- **Reglas editadas sin publicar no se guardan.** Si hay cambios a las reglas en el navegador, guardar se bloquea: el libro recibe planes calculados con las reglas publicadas.

Instalación, interruptor y prueba en una copia privada: `server/ppp2/INSTALAR.md`, «El Árbol PPP».

## Lo que falta

Nada de lo siguiente está hecho; una prueba en Node o con dobles no demuestra funcionamiento en producción.

1. **Publicar el servidor.** `ArbolPPP.gs` y el `PPP2.gs` de esta rama no están publicados. Va como versión nueva de la misma implementación, con el árbol apagado.
2. **Probar contra Google Sheets** en una copia privada del libro Maestro antes de encenderlo.
3. **Concordancia permanente** entre la vista previa y el libro, con más de un caso.
4. **Prueba en celulares reales**, con lector de pantalla y en otros navegadores.
5. **El visor** todavía no muestra el aviso de plan fuera del horizonte de 60 meses ni usa los umbrales propios en sus indicadores.
6. **Publicar cambios a las reglas** desde la pantalla no existe: «Exportar» arma el texto y una persona lo pega en el libro.

## Reversión

Revertir por revisión el commit que agrega `arbol-ppp/` y repetir las verificaciones. No hay datos de negocio, hojas ni archivos de clientes que restaurar.
