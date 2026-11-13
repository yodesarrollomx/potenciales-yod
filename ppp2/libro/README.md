# PPP 2 · el libro del plan

Cada plan de PPP 2 es **un libro de Google Sheets con fórmulas nativas**. El libro es la fuente de
verdad: el tablero lo lee y escribe sólo los datos permitidos (ver `server/ppp2/`).

## Pestañas

| Pestaña | Qué tiene |
|---|---|
| Plan | Portada: edad del plan, lo que recibe el dueño, lo que falta para crecer, la siguiente pregunta y **el ciclo del plan** (qué versión defiende, si ya se probó, qué dijo el consejo, cuál es el siguiente paso, la evidencia de hoy y el paso de capital de la ronda) |
| Versiones | V1, V2 y V3 lado a lado: lo que recibe cada parte, el dinero que hace falta, la revisión para fondos y comprobaciones |
| Reparto | Cinco esquemas con el dueño de la tierra, sobre el resultado real del flujo de la versión elegida |
| Datos | Cada cifra con estado (confirmado, supuesto, por confirmar, en conflicto, derivado, falta), fuente, fecha y quién |
| Productos | Hasta seis productos: unidades, m², precio, % pagado durante la obra |
| Candados | Lo que detiene la flor. Todo plan nace con seis, abiertos: tenencia, uso de suelo, agua, vialidad, banco y acuerdo con los dueños |
| Preguntas | Las 96 preguntas del oficio con estado, respuesta, impacto y prioridad |
| Hallazgos | Lo que encuentra el plan o el equipo; no cambia datos hasta que alguien lo acepta |
| Consejo | Votos del consejo de planes por sesión, con la huella de la versión que juzgaron y la evidencia que había ese día |
| Rondas | Cada ronda del plan: de qué versión parte, qué probó, qué propone y por qué |
| Modelo | Palancas por versión (base desde Datos; en azul lo que cambia) y cálculos por versión |
| Flujo V1–V3 | 60 meses: ventas, cobranza, obra en campana, capital, banco contra avance, respaldo y caja |
| Pruebas / Flujo prueba | Pruebas de estrés sobre una columna que se restablece sola |
| Bitácora | Quién cambió qué, antes y después, fuente, revisión y `request_id` |
| Resumen | Clave → valor que lee el servidor |

## Regenerar la plantilla

```bash
python3 ppp2/libro/generar.py plantilla.xlsx                 # en blanco
python3 ppp2/libro/generar.py plan.xlsx --plan datos.json    # con los datos de un plan (JSON fuera del repo)
```

Se sube a Drive convertido a Google Sheets. Los datos de planes reales **no** se guardan en este
repositorio; `ejemplo-plan.json` es inventado.

## Regenerar los accesorios de pruebas

```bash
python3 ppp2/libro/regenerar.py        # necesita LibreOffice (soffice); tarda unos minutos
node --test tests/ppp2-libro.test.cjs tests/ppp2-servidor.test.cjs tests/ppp2-ronda.test.cjs
```

Salen tres accesorios, siempre con el plan inventado:

- `tests/fixtures/ppp2-libro-ejemplo.json` — el libro de ejemplo recalculado (lo usan las pruebas del servidor).
- `tests/fixtures/ppp2-ciclo.json` (`ciclo.py`) — lo que el libro calcula sobre sí mismo, la edad y el
  siguiente paso, en 40 momentos de la vida del plan: sin probar, probada, regresada por el consejo,
  sin mejora, aprobada, vigente, con votos mal escritos o duplicados, con la evidencia cambiada…
- `tests/fixtures/ppp2-rejilla.json` (`rejilla.py`) — lo que el libro calcula para cada combinación de
  capital, arranque de obra y golpe leve que una ronda prueba desde cinco situaciones de partida.

Cada accesorio guarda la huella de estos archivos (`huella_generador` en `generar.py`). Si cambias la
plantilla, el plan de ejemplo o estos guiones y no regeneras, `tests/ppp2-libro.test.cjs` falla.

## Google Sheets no es LibreOffice

Los accesorios los calcula LibreOffice; los libros de verdad viven en Google Sheets. Diferencias que ya
mordieron y que la plantilla resuelve:

- **Libro vacío.** Donde LibreOffice deja una celda vacía, Google Sheets da 0: «¿calcula?» no puede
  depender sólo de que haya un número (ver `calcula` en `hoja_plan`).
- **Idioma.** Un libro con coma decimal separa los argumentos con «;». Quien escriba una fórmula por la
  API la escribe con «;», sin decimales con punto (`3/100`, no `0.03`) y sin matrices entre llaves.
- **Rangos que se salen de la hoja.** Una hoja nace con 1 000 renglones y las fórmulas del ciclo miran
  hasta el 5 004. Google Sheets recorta el rango al leer sus valores (996 valores), pero `ROW(rango)`
  **no** se recorta (5 000 números): multiplicar uno por otro da `#N/A` y se cae todo el ciclo.
  LibreOffice no recorta y no lo enseña. Por eso los números de fila se piden con
  `ROW(OFFSET(celda,0,0,ROWS(rango)))`, que mide lo mismo que los valores (`ROWS` sí da el alto
  recortado); `tests/ppp2-libro.test.cjs` no deja volver a escribir `ROW(` de un rango fijo.
- **Buscar con errores.** `LOOKUP(2,1/(condición),rango)` da `#N/A` en Google Sheets, y
  `MATCH(2,1/(condición),1)` depende de dónde caigan los errores (en LibreOffice falla con algunos
  acomodos). No se usan: la última fila que cumple se saca con `SUMPRODUCT(MAX(condición*fila))`.

Comprobado el 12-nov-2026 en un libro real de Google Sheets. Si cambias fórmulas del ciclo, vuelve a
comprobarlas allá antes de publicar: estas pruebas no ven Google Sheets.
