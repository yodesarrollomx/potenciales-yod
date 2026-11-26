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
- **Apagado o sin red**, la pantalla usa la definición de la página, lo dice («Sin conexión al libro») y no ofrece guardar. No inventa nada. Desde el 23-nov-2026 `arbol.html` pide sesión como el resto de YOD OS (Portero); la calculadora sin sesión es `artifact.html`.
- **Permisos del servidor, no de la página.** Leer pide sesión con el tablero `PT`; guardar, los roles que ya editan. No hay códigos ni roles nuevos. La página nunca borra la credencial del Portero.
- **No toca columnas hechas a mano ni vigentes.** El árbol solo actualiza una columna que él creó, en Borrador y sin cambios desde que se abrió; si no, avisa. Guardar crea por omisión un plan nuevo; reemplazar el plan abierto pide dos toques. Cualquier persona con permiso de editar puede actualizar un borrador del árbol, también el de otra persona.
- **El libro guarda valores, no estados.** Al abrir un plan guardado, lo que estaba «confirmado» vuelve como «decidido».
- **Reglas editadas sin publicar no se guardan.** Si hay cambios a las reglas en el navegador, guardar se bloquea: el libro recibe planes calculados con las reglas publicadas.

### Versiones del proyecto

Al abrir una versión, «Versiones del proyecto» muestra las columnas del Árbol con el mismo nombre de proyecto (I-01), usando mayúsculas y espacios exteriores indistintamente. Las etiquetas de versión repetidas en el historial se distinguen por escenario y columna. Los nombres I-01 deben distinguir los proyectos del Maestro.

«Agregar versión» guarda y abre una copia de la versión guardada, con una etiqueta nueva y en otra columna Borrador. Copia las capturas del libro incluso si el Árbol no las interpreta y usa las fórmulas de la plantilla. El campo I-07 conserva el origen, su revisión y la ficha si sigue en el borrador de origen. CAMBIOS registra el actor y las columnas. Después de editar, «Guardar en el libro» ofrece guardar los cambios en la versión abierta. El selector muestra todas las columnas del proyecto que ya guardó el Árbol. Las nuevas requieren que quede una columna libre en el Maestro.

La creación de versiones requiere la capacidad `puede.versiones` del servidor. Probar el alta, la edición y la reapertura en un Maestro simulado con `node --test tests/arbol-ppp-servidor.test.cjs` antes de actualizar Apps Script.

Instalación, interruptor y prueba en una copia privada: `server/ppp2/INSTALAR.md`, «El Árbol PPP».

## En la portada, un proyecto es una tarjeta

La portada del PPP (`ppp2.js`, `agrupaArbol`) junta las columnas del Maestro que llevan el mismo nombre de proyecto, sin distinguir mayúsculas, acentos ni espacios, y enseña una sola tarjeta por proyecto con cuántas versiones tiene. La tarjeta abre la versión guardada más a la derecha; las demás se escogen adentro, en «Versiones del proyecto». Un plan con libro cuyo proyecto ya vive en el árbol deja de repetirse arriba: no se borra, sigue en su libro y se alcanza desde «Consultar expedientes anteriores». Sólo agrupa lo que el servidor ya manda: no calcula ni escribe. Pruebas: `node --test tests/ppp2-portada-arbol.test.cjs`.

## La barra del libro, corta

Con un proyecto abierto, la barra sólo ofrece «Versiones del proyecto», «Agregar versión» y «Guardar en el libro»: las versiones que se escogen son las de ese proyecto y otro proyecto se abre desde la portada. «Abrir un plan» queda sólo cuando no hay proyecto abierto. La nota de procedencia de la versión ya no ocupa la barra: se lee dentro de «Versiones del proyecto», junto a cada versión. Al llegar de la portada con datos en pantalla, la barra enseña sólo el plan que se pidió, no la lista de todos.

## Entrar al visor desde cada proyecto

La tarjeta del proyecto en la portada y la barra del árbol traen «Ver visor». Abre `visor.html#p=ppp:arbol-<proyecto>`: el visor de ese proyecto **sin liga**, con la sesión del Portero de ese navegador (sólo la lee) por la ruta con sesión de `ppp2-visor`. Sin sesión no pinta nada, y sólo acepta casos `arbol-…`. Ahí Dirección escoge «la buena» y la pantalla se pone al día sola, como con liga; las pestañas (Historial, Archivos, Opciones) son de las ligas y aquí no salen. Para compartir con alguien de fuera sigue haciendo falta una liga en la hoja `Ligas`.

La tarjeta de la portada abre en el árbol la versión que Dirección fijó en el visor; si no ha fijado ninguna, la última guardada. La clave del caso la arman igual la portada (`casoArbol`), el árbol (`casoVisor`) y el servidor (`arbol_caso_`): una prueba las compara.

## El visor enseña las versiones del Árbol

Al tocar «Guardar en el libro», el Árbol manda también el paquete del visor de esa versión (el mismo de la vista previa, `Motor.paqueteVisor`). El servidor lo deja en la pestaña `ARBOL_VISOR` del Maestro, un renglón por columna del Árbol, y el visor lo sirve por la ruta de las fotos (`server/ppp2/Visor.gs`).

- **La liga.** El caso se llama `arbol-<proyecto>`, con el nombre I-01 en minúsculas, sin acentos y con guiones. La liga del visor lleva `plan_id` = `ppp:arbol-<proyecto>`: es un renglón de la hoja `Ligas`, igual que cualquier otra. Para que un proyecto que ya tenía liga enseñe su versión del Árbol se cambia el `plan_id` de su renglón; la liga que tiene la gente no cambia.
- **Las versiones.** Cada columna del proyecto es una versión, numerada 1, 2, 3… en el orden en que se guardó. Por omisión rige la última. Dirección escoge otra con el selector del visor (`ppp2-elige`) y ésa se queda aunque después se guarden más.
- **Cambia sola.** Volver a guardar una columna cambia su revisión, que es la huella de su renglón. Quien tenga el visor abierto ve el cambio en su siguiente sondeo.
- **El servidor no calcula.** Guarda lo que calculó el motor del Árbol, con el nombre y la versión que quedaron en el libro, y al servirlo deja pasar sólo las claves de la forma del visor, más el reparto por socio (`cascada`), limpio. Es la misma excepción al contrato del 30-sep que ya tienen las fotos del PPP de siempre.
- **El interruptor.** Sin la pestaña `ARBOL_VISOR`, el plan se guarda igual y no hay nada que enseñar (`visor: sin_hoja`). Con `arbol` apagado en `Config`, las versiones del Árbol tampoco se sirven. Un caso `arbol-…` sólo se lee del Maestro y los demás sólo de `PPP_VISOR`.
- **Lo que todavía no hace.** «Agregar versión» copia la columna en el servidor y no trae paquete: la versión nueva aparece en el visor cuando se abre y se guarda desde el Árbol. El servidor no compara el paquete con las fórmulas de la columna. El Árbol vertical sólo conoce vivienda de 48, 74 o 98 m², así que un edificio de otro uso sale en el cuadro Producto con nombre de vivienda.

Pruebas: `node --test tests/arbol-ppp-visor.test.cjs` (de punta a punta sobre dobles, con el caso de muestra inventado). Encenderlo: `server/ppp2/INSTALAR.md`, «El visor enseña las versiones del Árbol».

## Consultorios y oficinas: venta y su equivalente en renta (25-nov-2026)

El producto (P1-05) suma la opción **Consultorios y oficinas** (`consultorio`, 30 m² por unidad de referencia) y P1-01 la nombra así en el visor. Los cajones siguen la regla de vivienda (uno por unidad).

Con esa opción, y sólo con ella, aparecen cinco nodos del módulo `vertical/producto` (condición `P1-05.opcion = 'consultorio'`):

| ID | Qué es | Tipo | Referencia o fórmula |
|---|---|---|---|
| RN-01 | Renta mensual por m² | se busca | 625 $/m² al mes (mediana de comparables, nov 2026; rango 50–3000) |
| RN-02 | Tasa de capitalización | regla de oficio | 9 % al año (oficinas en México, 7–9 %; plaza secundaria) |
| RN-03 | Renta anual | calculado | `(PT-03 + E-18) * RN-01 * 12` |
| RN-04 | Valor en renta | calculado | `si(RN-02 > 0, RN-03 / RN-02, 0)` |
| RN-05 | Rinde la renta sobre el costo | calculado | `si(C-17 > 0, RN-03 / C-17, 0)` |

- **Al visor** van como `v.renta_m2`, `v.renta_tasa`, `v.renta_anual` y `v.renta_valor` (en millones) y `v.renta_rinde`, **sólo si la renta anual es mayor que cero**. Sin consultorios el paquete es el de antes (la prueba O01 lo compara sin la huella de la definición).
- **El visor no calcula:** la tarjeta «Costo y ganancia» agrega el renglón «Renta $X/año · vale $Y · rinde Z%» y su detalle «Si se renta en vez de vender», con lo que manda el Árbol.
- **El Maestro:** las filas nuevas van a `ARBOL_NODOS` (5), `ARBOL_OPCIONES` (1) y `ARBOL_FACTORES` (5), y la fórmula de P1-01 cambia. Orden seguro: primero NODOS y OPCIONES, luego los renglones RN-01 a RN-05 de la pestaña `MAESTRO` y al final `ARBOL_FACTORES` (el guardado rechaza un factor que no esté en `MAESTRO`). La copia de pruebas `arbol-ppp/conexion/datos/arbol-desde-maestro.json` ya trae las filas.

## Un solo árbol, tres ramas: edificio, lotes o casas (25-nov-2026)

La primera pregunta después del terreno es **«Qué se desarrolla»** (DS-01, regla de oficio, de entrada *Edificio*). La respuesta abre la rama; todo lo demás (costos, dinero, reparto, pruebas, visor) es el mismo árbol.

- **Edificio** (lo de siempre): con DS-01 en Edificio las cifras no cambian. Se comprobó con los 75 planes reales del Maestro contra el motor anterior: 0 diferencias en el paquete del visor (fuera de la huella de la definición). En los planes «por confirmar» sube 1 (la pregunta nueva).
- **Lotes:** cesiones (L-01, 39 %: vialidades 22, verdes 10, equipamiento 7), eficiencia de la lotificación (L-02, 95 %), tamaño del lote (L-07: 120, 160, 200 o 300 m²) y urbanización por m² vendible (L-03, $1,800). Vendible = terreno × (1 − cesiones) × eficiencia; obra = vendible bruto × urbanización + obras exteriores, con el ajuste de obra. Precio de entrada $4,700 por m² de lote y ritmo 16 meses de venta. Referencias del motor de lotes residenciales del PPP 1.
- **Casas:** lo de lotes más m² construidos por casa (L-05, 120) y costo de la casa (L-06, $14,950 por m²); precio de entrada $25,164 por m² construido (motor de casa unifamiliar).
- **Lo que se oculta fuera del edificio:** E-01 a E-03, E-05, E-07 a E-09, E-12, E-13, E-15, E-16, el tamaño por unidad P1-05 y el costo de obra por m² C-01. Para que el resto se vea en cualquier rama, E-17, C-04, C-05, C-07, C-08, C-09, P1-09, P1-01 y PT-01 cuelgan ahora de nodos que existen en las tres (el motor sólo enseña un nodo si su padre se ve).
- **Renta para cualquier producto:** el destino (P1-03) admite «Venta», «Venta y renta», «Renta» y «Reserva». RN-01 a RN-05 aparecen con «Venta y renta» o «Renta» (y, como antes, con Consultorios y oficinas). Con «Renta» el árbol no cuenta ventas y avisa (AL-P103-1).
- **El visor:** el paquete lleva `plan.tipo` = `lotes` o `casas` según la rama, y el cuadro Terreno dibuja la lotificación o las casas, con el número de lotes o casas en vez de «Construcción total».
- **El Maestro:** filas nuevas en `ARBOL_NODOS` (10), `ARBOL_OPCIONES` (4 de L-07), `MAESTRO` (8 factores) y `ARBOL_FACTORES` (8), más los cambios de `de`, `aparece`, fórmulas y referencias de los nodos de arriba, la lista de P1-03 y dos reglas (AL-P106-1 sólo para edificio; AL-P103-1 nueva redacción). Orden seguro: NODOS y OPCIONES, luego los renglones de `MAESTRO`, al final `ARBOL_FACTORES`.

## El programa por tipología, también en el repo (25-nov-2026)

El Maestro ya traía el programa por tipología (PG-01 a PG-05, los tipos 2 a 4 con nombre, uso, destino, superficie, precio, ritmo, unidades y ventas, PT-04 y PT-05, y N-07 y N-08 para cajones de comercio y oficina), escrito directo en sus pestañas. Ahora `definicion/*.csv`, `vertical.json` y la copia de pruebas lo traen igual que el libro: 177 nodos y 191 factores, en el orden del libro. Con PG-01 = 0 el cálculo es el de antes, por edificio. Cambian sólo rótulos y conteos: la tarjeta Producto enseña «Unidades totales» (PT-01), «por confirmar» sube 1 (PG-01) y las explicaciones nombran los nodos nuevos.
## Cada versión, en el visor desde que nace (25-nov-2026)

- **«Agregar versión» ya trae su visor.** El servidor copia la columna base; enseguida el Árbol lee la copia, el motor saca su paquete (el mismo que daría abrirla y guardarla) y lo guarda sobre esa misma columna **sin cambiar ningún valor** (`visorDeDerivada` en `arbol-ppp/servidor.js`). En `CAMBIOS` quedan dos renglones: la derivación y el guardado del visor. Si este segundo paso falla, la versión queda creada igual y la respuesta dice por qué en `visor`.
- **La portada no ofrece «Ver visor» a un proyecto sin versiones en el visor.** Si el servidor contesta `plan` (no hay ninguna versión guardada en `ARBOL_VISOR`), la tarjeta deja sólo «Abrir en el árbol» (`estado.arbolSinVisor` en `ppp2.js`).
- **«Falta calcular».** Una versión no tiene flujo mientras le falten decisiones que el flujo necesita (tipo de edificio, estacionamiento, arranque de obra, trato con el dueño o crédito del banco). Se resuelve contestándolas en el Árbol y guardando.

## Lo que falta

Al 25-nov-2026 el servidor (v18) y el Árbol están publicados y encendidos sobre el libro Maestro. Queda:

1. **Prueba en celulares reales** (iPhone), con lector de pantalla y en otros navegadores.
2. **El visor** todavía no muestra el aviso de plan fuera del horizonte de 60 meses ni usa los umbrales propios en sus indicadores.
3. **Publicar cambios a las reglas** desde la pantalla no existe: «Exportar» arma el texto y una persona lo pega en el libro.
4. **El reparto en cascada** sigue en su copia de prueba (`reparto-prueba.html`).
5. **Programa por tipología con destino «Venta y renta»:** las ventas de un programa (PG-01 > 0) sólo se cuentan con destino «Venta»; la fórmula de PT-07 no cabe en 500 caracteres con la opción nueva.

## Reversión

Revertir por revisión el commit que agrega `arbol-ppp/` y repetir las verificaciones. No hay datos de negocio, hojas ni archivos de clientes que restaurar.

## Dentro de YOD OS (23-nov-2026)

`arbol.html` se abre con el marco del portal, igual que `ppp2.html`: barra lateral de tableros, barra de arriba con buscador, identidad y «YOD OS › PPP › Árbol» (PPP lleva a la lista de planes), y la puerta del Portero.

- **Colores y letras:** `arbol-ppp/marco.css` sólo reasigna las variables de `pantalla.css` a la paleta del portal (papel, tinta y dorado; Instrument Serif en títulos e Instrument Sans en lo demás) y las siete tarjetas a los tonos del tema claro de los tableros. Siempre claro: `arbol.html` trae `data-theme="light"` y el botón de tema del Portero se oculta. `artifact.html` sigue con los colores del prototipo.
- **El alto:** la pantalla ocupa lo que dejan la barra del marco (65 px; 57 en teléfono) y la barra del libro, que `arranque.js` vuelve a medir cada vez que cambia.
- **Botones flotantes:** el engrane y la chinche quedan apilados abajo a la derecha; en teléfono los controles del mapa pasan a la izquierda para no quedar debajo.
- **Entrada:** en la lista de planes del PPP, «Armar un plan con el árbol» va junto a «Crear plan en blanco», sólo si el servidor dice `arbol = sí`.
