# PPP 2 · el libro del plan

Cada plan de PPP 2 es **un libro de Google Sheets con fórmulas nativas**. El libro es la fuente de
verdad: el tablero lo lee y escribe sólo los datos permitidos (ver `server/ppp2/`).

## Pestañas

| Pestaña | Qué tiene |
|---|---|
| Plan | Portada: edad del plan, lo que recibe el dueño, lo que falta para crecer y la siguiente pregunta |
| Versiones | V1, V2 y V3 lado a lado: lo que recibe cada parte, el dinero que hace falta, la revisión para fondos y comprobaciones |
| Reparto | Cinco esquemas con el dueño de la tierra, sobre el resultado real del flujo de la versión elegida |
| Datos | Cada cifra con estado (confirmado, supuesto, por confirmar, en conflicto, derivado, falta), fuente, fecha y quién |
| Productos | Hasta seis productos: unidades, m², precio, % pagado durante la obra |
| Candados | Lo que detiene la flor: tenencia, uso de suelo, agua, vialidad, banco, acuerdo |
| Preguntas | Las 96 preguntas del oficio con estado, respuesta, impacto y prioridad |
| Hallazgos | Lo que encuentra el autón; no cambia datos hasta que alguien lo acepta |
| Consejo | Votos del consejo de planes por sesión |
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

## Regenerar el accesorio de pruebas

```bash
python3 ppp2/libro/generar.py /tmp/ejemplo.xlsx --plan ppp2/libro/ejemplo-plan.json
soffice --headless --calc --convert-to xlsx --outdir /tmp/calc /tmp/ejemplo.xlsx
python3 ppp2/libro/fixture.py /tmp/calc/ejemplo.xlsx /tmp/ejemplo.xlsx tests/fixtures/ppp2-libro-ejemplo.json
node --test tests/ppp2-libro.test.cjs tests/ppp2-servidor.test.cjs
```
