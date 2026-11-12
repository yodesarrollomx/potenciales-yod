# PPP 2 · el plan que se cultiva solo (`CHG-PPP2-20261112`)

Dirección (12-nov-2026) pidió un portal nuevo, **PPP 2**, que empiece de cero **sin borrar nada
del PPP actual**, con una metodología donde «el mismo plan de potencial en sí sea el autón»: el
plan nace, se nutre e investiga. Decisiones del 12-nov: las edades se llaman semilla, plántula,
árbol, flor y fruto; el PPP que se cobra lleva un plan de plántula a árbol; la radiografía muestra
primero lo que recibe el dueño y en cuánto tiempo; el consejo de planes integra jueces del oficio;
se empieza por el primer plan real.

## Las tres piezas

1. **El libro** (`ppp2/libro/`): un Google Sheets por plan con todo el cálculo nativo. Tres
   versiones (V1 base, V2 y V3) se calculan solas con el mismo motor de flujo mensual: ventas por
   producto, cobranza (enganche, pagos durante la obra, saldos al individualizar), obra en campana,
   capital primero, banco contra avance con tope y caja mínima, respaldo si falta dinero, y la
   devolución del dinero con su rendimiento. La revisión para fondos (nueve pruebas de comité) y el
   reparto con el dueño (cinco esquemas) se calculan ahí mismo.
2. **El servidor** (`server/ppp2/PPP2.gs`): Apps Script aparte, ligado al registro «PPP 2 ·
   Vivero». Valida la sesión con el Portero, lee y escribe celdas permitidas con bitácora,
   revisión y `request_id`. No calcula finanzas. Instalación en `server/ppp2/INSTALAR.md`.
3. **La página** (`ppp2.html`, `ppp2.js`, `ppp2.css`): el vivero (tarjetas por plan) y el plan
   vivo (lo que recibe el dueño, versiones, gráfica del dinero, reparto, palancas, preguntas,
   datos con fuente, candados, autón, consejo y bitácora). Sin datos de ningún plan en el HTML.

## Edades

| Edad | Cuándo |
|---|---|
| Semilla | Tiene nombre y datos iniciales, todavía no calcula |
| Plántula | La versión que se muestra calcula |
| Árbol | Dirección aprobó una versión vigente y el consejo de planes votó |
| Flor | Además, todos los candados están cerrados |
| Fruto | Hay acuerdo firmado con el dueño |

La edad la calcula el libro (pestaña Plan); nadie la escribe a mano.

## El autón (honesto)

- «La siguiente pregunta» la elige el libro: entre las preguntas abiertas de la edad del plan, la de
  mayor impacto del oficio y más básica. Es un orden del oficio, no un cálculo de sensibilidad.
- «Investígalo tú» deja un pedido en la pestaña `Pedidos` del vivero; una ronda del autón lo toma
  y deja lo que encuentra en `Hallazgos` con su fuente. Ningún hallazgo cambia un dato solo.
- Las pruebas de estrés sí las calcula el libro: el servidor cambia la columna Prueba, lee y
  restablece.

## Consejo de planes

Jueces del oficio: Alejandro virtual (veto por candado), dueño de la tierra virtual, inversionista
virtual, desarrollador-financiero, arquitecto de norma y cabida, broker de campo y Hormozi (la
oferta). Aprueba con 5 de 7. Sus votos quedan en la pestaña `Consejo` del libro. El consejo
opina; **sólo Dirección vuelve vigente una versión**.

## Invariantes

- El PPP actual (motores, Portero, `recurso=lista|caso`) no cambia.
- Ninguna fórmula financiera fuera del libro.
- Sólo `admin` (Dirección) aprueba versiones; `admin` y `editor` capturan; los demás con `PT` leen.
- Repo público: ni nombres de planes, ni cifras, ni identificadores de libros en código o pruebas.

## Pruebas

`node --test tests/ppp2-servidor.test.cjs tests/ppp2-libro.test.cjs` y `node tests/ppp2-browser.cjs`.
