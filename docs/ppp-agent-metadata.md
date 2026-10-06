# Metadatos de lectura PPP para el agente

El puente `ppp-agent-bridge.js` añade `board.metadata` sin cambiar las cantidades, los resultados ni el protocolo de escritura. El caso, escenario, revisión de datos, confirmación y cambios pendientes conservan sus campos actuales.

```json
{
  "model_type": "patrimonial",
  "model_revision": "patrimonial-sheet-v1",
  "horizon": { "value": 12, "unit": "year" },
  "input_units": { "inTerrenoM2": "m2", "inVacanciaPct": "percent" },
  "result_units": { "yieldOnCost": "ratio" }
}
```

Ejemplo sintético. Tipo y revisión provienen de `modelo_tipo` y `modelo_revision` del modelo validado. El horizonte proviene de `estados[activo].p.horizonte`: no se obtiene del nombre ni se copia entre escenarios.

## Semántica y límites

- Sólo el contrato exacto `patrimonial / patrimonial-sheet-v1` recibe descriptores conocidos. La fuente es `patrimonial-sheet-schema.json`, las etiquetas de `patrimonial.html` y la validación de `ppp-patrimonial-native.js`.
- `horizon` sólo aparece si es un entero entre 1 y 25. Describe el supuesto leído aunque la geometría siga pendiente; no afirma que el modelo sea válido.
- Las unidades son un subconjunto de las claves presentes. `percent` conserva, por ejemplo, una entrada de 5; `ratio` conserva un resultado de 0.05. No se convierten valores. `m2`, `year` y `count` describen área, años y cantidad de unidades.
- No se infiere la moneda de un símbolo $, nombre de campo, idioma o país. Las unidades monetarias permanecen ausentes mientras el contrato no las declare. Tampoco se asignan unidades a campos desconocidos.
- Modelos o revisiones nuevos conservan su identidad, pero no heredan horizonte ni unidades de otro contrato. Los metadatos ausentes no se completan con cero o un valor predeterminado.
- La lectura sigue siendo una instantánea observada en el tablero. Un consumidor debe conservar `confirmed`, `pending`, `revision`, `scenario_id` y `observed_at`; no presentarla como nueva consulta independiente al libro.
- Comparar dos versiones exige considerar modalidad, revisión del modelo, horizonte, unidades, validez y fuentes. Estos metadatos no eligen automáticamente una alternativa ganadora.

## Verificación y reversión

`node --test tests/ppp-agent-bridge.test.cjs` cubre identidad, horizonte por escenario, valores ausentes, revisión desconocida, conservación de cantidades y cero escrituras al capturar. El workflow PPP conserva además sus recorridos sintéticos de navegador.

Revertir esta ampliación elimina sólo los descriptores enviados por el puente. No borra ni restaura expedientes, versiones o registros de Sheets. La integración y publicación se registran por separado de las pruebas en CI.
