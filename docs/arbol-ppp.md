# PPP · Árbol de decisiones

Propuesta `ARBOLPPP` (cambio `CHG-ARBOL-PPP-20261123`) en el atlas central. Estado: **propuesto, en rama, sin fusionar ni desplegar**. Este documento describe lo que hay en la carpeta `arbol-ppp/` y lo que falta para usarlo.

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
| `arbol-ppp/definicion/*.csv`, `vertical.json` | Definición del árbol vertical. |
| `arbol-ppp/definicion-tablas.js` | La misma definición lista para la página. La genera `construir-artifact.cjs`; no se edita a mano. |
| `arbol-ppp/conexion/conexion.js` | Paso de un plan a una columna de factores y de regreso. |
| `arbol-ppp/conexion/caso-muestra.cjs`, `siembra.cjs`, `datos/` | Casos inventados y planes sembrados para las pruebas. |
| `arbol-ppp/pruebas/motor-real.cjs`, `arbol-ppp/conexion/pruebas.cjs` | Pruebas en Node. |

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
```

Las dos pruebas son guiones propios: imprimen el total y salen con código 1 si algo falla. Usan datos inventados y el libro de ejemplo de `tests/fixtures/`.

## Lo que falta

Nada de lo siguiente está hecho; una prueba en Node no demuestra funcionamiento en producción.

1. **Abrirlo desde el plan con sesión.** Hoy `arbol.html` es una página suelta que solo calcula la vista previa: no pide sesión, no lee ningún libro y no guarda en ningún servidor ni libro (conserva el plan, la comparación y las reglas editadas solo en el almacenamiento local del navegador). Falta enlazarla como ruta del PPP único.
2. **Leer la definición y guardar el plan en el libro.** Requiere dos rutas en el servidor existente, como versión nueva de la misma implementación. El borrador del servidor no está en esta rama.
3. **Concordancia permanente** entre la vista previa y el libro, con más de un caso.
4. **Prueba en celulares reales**, con lector de pantalla y en otros navegadores.
5. **El visor** todavía no muestra el aviso de plan fuera del horizonte de 60 meses ni usa los umbrales propios en sus indicadores.

## Reversión

Revertir por revisión el commit que agrega `arbol-ppp/` y repetir las verificaciones. No hay datos de negocio, hojas ni archivos de clientes que restaurar.
