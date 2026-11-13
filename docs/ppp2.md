# PPP 2 · el plan es el autón (`CHG-PPP2-20261112`)

Dirección (12-nov-2026) pidió un portal nuevo, **PPP 2**, que empiece de cero **sin borrar nada
del PPP actual**, con una metodología donde «el mismo plan de potencial en sí sea el autón».

## La idea

**No hay un agente aparte.** El plan *es* él: su libro de Google Sheets, su página, sus documentos
y las herramientas que se le dan para defenderse y salir adelante. A veces toma forma virtual —se
habla con él por texto o por voz—, pero lo que existe es esa estructura. Por eso la página habla en
primera persona («Me toca mover capital y arranque de obra») y ningún texto nombra a un «autón»
como si fuera otro.

Su trabajo es crecer de semilla a fruto. Para eso **itera**: cuando el consejo le regresa una
versión, no se queda esperando; mueve lo que puede mover, vuelve a calcularse, se prueba y se
presenta de nuevo. Lo que no se arregla así lo pide a quien puede conseguirlo.

## El ciclo

| Paso (`plan.paso`) | Qué pasa | Quién lo hace |
|---|---|---|
| `datos` | Es semilla: faltan datos para calcular | El equipo captura |
| `explorar` | Mueve capital y arranque de obra para proponer algo mejor (**la ronda**) | El plan, solo (latido) o con un clic |
| `proponer` | La versión que defiende no pasa la revisión para fondos y la ronda no encontró cerca una que pase | El equipo, en Versiones |
| `probar` | Se prueba contra los golpes (pruebas de estrés) | El plan, solo (latido) o con un clic |
| `consejo` | Defiende su versión ante el consejo de planes | El servidor, por la API de IA: un botón de la página o el latido |
| `direccion` | El consejo la aprobó: falta que Dirección la vuelva vigente | Dirección |
| `mundo` | El consejo la regresó y la ronda ya no encuentra mejora: falta conseguir lo que pidió el consejo | Personas (candados y datos) |
| `candados` | Es árbol: faltan candados para florecer | Personas |
| `acuerdo` | Es flor: falta firmar con el dueño | Dirección |
| `cumplido` | Es fruto | — |

El paso **lo calcula el libro** (pestaña `Plan`, sección «El ciclo del plan», y `Resumen!plan.paso`);
nadie lo escribe a mano. La página y el servidor (también cuando convoca al consejo) leen la misma celda. Las reglas:

- **Una versión que no pasa la revisión para fondos nunca va a pruebas ni al consejo.** El plan
  explora desde ella; si la ronda no encuentra una que pase, el paso es `proponer`.
- Con una versión que pasa: primero se prueba, luego va al consejo. Si el consejo la aprueba, decide
  Dirección. Si la regresa, el plan explora; si la ronda no encuentra mejora, queda en `mundo`.
- **La base explora primero.** Si lo que el plan defiende es la base (no hay propuesta ni vigente) y
  pasa la revisión, antes de probarse y presentarse mueve sus palancas una vez; aunque alguien haya
  reunido al consejo antes, el paso sigue en `explorar` hasta que esa ronda exista.
- **`mundo` tiene salida**: cada voto guarda la evidencia que había ese día (cuántos candados
  resueltos, datos confirmados, hallazgos aceptados y preguntas respondidas). Cuando esa evidencia
  cambia, el paso vuelve a `consejo` y el plan se presenta otra vez con la misma versión. Si la sesión
  **no anotó** la evidencia, no se sabe contra qué juzgó y el paso también vuelve a `consejo`. Si lo
  que cambia son los números, cambia la huella y el ciclo empieza de nuevo (`probar`). La evidencia
  son **conteos**: cerrar un candado y reabrir otro no se nota, y cualquier pregunta respondida de
  más vuelve a convocar al consejo.
- El paso habla de la versión que el plan **defiende** (su propuesta; si no hay, la vigente). La
  **edad** habla de la vigente. Pueden pedir cosas distintas a la vez —por ejemplo, flor con una
  propuesta nueva regresada—: la página muestra siempre las dos («Para crecer falta» y lo que dice
  el plan).

## La ronda: cómo mueve capital y arranque de obra

El plan parte de la versión que defiende y prueba hasta 15 combinaciones: cinco de **capital** (dos
pasos abajo y dos arriba) por tres de **arranque de obra** (un mes antes, igual, un mes después).
El tamaño del paso de capital lo da el libro (`Resumen!plan.paso_capital`: 3% del costo con tierra,
a una cifra). El tope de capital es el mayor entre el disponible en los datos y el que la versión de
partida ya usa: si la de partida usa más que el disponible, se prueban capitales hasta ése; nunca
prueba capital negativo. El libro recalcula cada combinación y el servidor sólo compara las cifras
que el libro devolvió: no calcula ningún resultado, sólo escoge qué valores probar (la rejilla) y
cuenta en pasos lo que el libro midió.

**Sólo propone lo que pasa la revisión para fondos.** Entre las que pasan se queda con la primera en
este orden:

1. la que **aguanta** tres golpes leves, **cada uno por separado** (precios 5% abajo, obra 5%
   arriba, ventas 25% más lentas): que con ninguno le falte dinero, con el mismo margen con que la
   revisión para fondos da por cero un faltante (0.01 MDP). Si ninguna aguanta, cuenta el golpe que
   deja el mayor faltante y se mide **contra la de partida, en pasos de capital enteros**: una vecina
   gana sólo si le quita a la de partida al menos un paso entero de faltante; quitarle menos no
   cuenta (empatan y deciden las reglas siguientes), y **una a la que le falta más que a la de
   partida nunca le gana**. Si la de partida no pasa la revisión, se mide contra la primera que sí
   pasa en el orden de las reglas 2 a 5;
2. la que pasa sin «aportación justa»;
3. la que no le alarga el plazo al dueño frente a la de partida;
4. la que le deja más al dueño (a décimas de MDP);
5. la que usa menos capital.

Si la mejor es la de partida, o ninguna pasa, no propone nada (**sin mejora**) y todo queda
exactamente como estaba. Cuando ninguna pasa, la ronda anota cuál quedó más cerca, sólo para
informar. Cada ronda queda en la pestaña `Rondas` con lo que probó; si el detalle no cabe en una
celda se recortan las combinaciones (primero sus golpes, luego las que no son la de partida, la
elegida o la más cercana), pero nunca lo que tenía la versión donde escribió.

**No insiste con lo que ya se retiró.** Si el plan ya propuso una combinación desde esa misma
versión (misma huella) y hoy esa propuesta ya no existe —alguien la descartó o la cambió—, no la
vuelve a proponer: la marca como retirada y escoge entre las demás. Si cambian los números de la
versión de partida, todo vuelve a considerarse.

### Dónde escribe

Nunca en la base ni en la vigente, **ni encima del trabajo de una persona si nadie se lo presta**:

- **Libre**: una versión vacía, descartada, o una alterna que el propio plan propuso en una ronda
  anterior **y que nadie tocó**. Si la versión de partida era una propuesta, queda a la vista como
  alterna.
- **En su lugar**: si la versión de partida es una propuesta del propio plan que nadie tocó y no hay
  otra libre, la afina ahí mismo. Una vigente nunca se afina en su lugar.
- **Prestada**: una alterna hecha (o tocada) por una persona —o la propuesta de una persona, para
  afinarla en su lugar— sólo si alguien con permiso de editar se la presta con un clic. El latido
  nunca se presta nada a sí mismo: sin lugar, el plan lo dice en la página y espera.

**Cuándo una versión es «del plan».** No basta la firma. Tiene que cumplirse todo: su «Quién la
propone» es exactamente «El plan · ronda *n*»; la ronda *n* existe en `Rondas` y propuso en esa
versión; Dirección nunca la aprobó; y **sus palancas siguen como la ronda las dejó** (la ronda guarda
un sello de lo escrito en esa columna del Modelo). Si una persona le mueve una palanca, ya es
trabajo de esa persona y el plan no la pisa sin préstamo; si la regresa a como estaba, vuelve a ser
del plan. Que cambien los datos no la vuelve ajena: el sello mira lo capturado, no los resultados.

En los tres casos la ronda anota **cómo estaba** la versión donde escribió (nombre, estado, quién la
propuso y todas sus palancas) en el detalle de la ronda, y la página lo muestra. No hay un botón
para regresarla: quien la quiera de vuelta captura esas palancas otra vez.

### Si algo falla a medias

- Antes de tocar la versión de trabajo guarda un **diario**. Si algo truena o el servidor muere, la
  siguiente escritura (o el siguiente latido) deja la versión —palancas, ficha y el estado de la de
  partida— como estaba. Esa escritura **no continúa**: quien la hizo estaba viendo cifras a medias,
  así que la página recarga y decide con las de verdad. La reparación queda en la bitácora a nombre
  del plan, no de quien la disparó. Lo que alguien haya escrito a mano en esa columna del libro
  mientras la ronda corría se pierde al restaurar.
- El renglón de `Rondas` es lo que da la ronda por hecha (mismo `request_id` y mismo número de
  ronda): si el servidor muere justo después de anotarlo, la propuesta se queda.
- Mientras una ronda corre (o si murió a medias), las cifras de la versión de trabajo **están a
  medias** para quien lee. La página del plan lo dice y no deja aprobar esa versión; la tarjeta del
  vivero, si esa es la versión que muestra, dice que está en trabajo en vez de enseñar una cifra.
- **Libro lento**: cada intento tiene unos tres minutos. Si no alcanza, no afirma nada, deja todo
  como estaba y guarda lo ya leído; el siguiente intento continúa donde se quedó. Lo guardado sólo
  vale si **nada de lo que entra a las cuentas cambió** (datos, productos, reparto y las palancas de
  la base y de la versión de partida), si lo guardado de la de partida es lo que el libro dice hoy
  de ella, y por seis horas; cualquier cambio que una persona guarde en el plan lo tira.
- **Antes de anotar una propuesta la vuelve a leer del libro**, ya escrita: si no coincide con lo que
  usó para escoger (o si los golpes guardados de la elegida ya no dan lo mismo), no afirma nada,
  tira lo guardado y deja todo como estaba (`cambio`).
- Si el libro da un error bajo un golpe, no lo toma por «no le falta nada»: no afirma nada
  (`lectura`).

### Límites conocidos

- La ronda sólo mueve capital y arranque de obra, y sólo cerca de donde está la versión (dos pasos
  y un mes). La primera estructura de un plan nuevo (banco, cobranza, pagos durante la obra) y los
  saltos grandes los hace una persona o el plan en su forma virtual.
- Mientras corre una ronda, unas pruebas, una sesión del consejo o una investigación, **nadie puede
  guardar cambios en ningún plan** (el servidor atiende de uno en uno): la página avisa y hay que
  volver a intentar al terminar. Leer sí se puede.
- Con `Config!pausa = sí` el servidor no escribe nada, tampoco para restaurar una ronda que murió a
  medias: la página avisa que esa versión está a medias hasta que se quite la pausa.
- El libro lee hasta 5 000 votos, 5 000 rondas y 20 000 renglones de pruebas por plan. Si el latido
  da un paso y el libro sigue pidiendo el mismo, lo anota en la bitácora del vivero y espera un día;
  a la tercera vez deja de insistir hasta que una persona guarde algún cambio en el plan.
- El latido atiende un plan por vez y empieza por el que sigue al último atendido: un plan con el
  libro lento no deja sin turno a los demás.
- Una hoja de Google nace con 1 000 renglones. El servidor agrega los que le hagan falta en
  `Rondas`, `Pruebas`, `Consejo`, `Hallazgos` y `Bitácora`. Quien escriba una sesión del consejo a mano
  (en un chat, sin el servidor) no puede escribir debajo del último renglón de la hoja: con 1 000
  renglones hay lugar para unas 140 sesiones; si se llenan, se agregan renglones (ver
  `server/ppp2/INSTALAR.md`).

## La huella: de qué números se está hablando

Cada versión tiene una **huella** (`Resumen!v1.huella`…), una cadena que cambia si cambian sus
números: ventas, costo, tierra, capital usado, banco, dinero ajeno máximo, costo del dinero,
ganancia, lo que recibe el dueño, mes de reparto, arranque de obra, aportación y preventa. Las
pruebas de estrés, los votos del consejo y las rondas guardan la huella de la versión que tocaron.
Si la versión cambia después —por una palanca, un dato o el esquema de reparto—, esas pruebas y esos
votos **dejan de contar** y el plan vuelve a probarse y a defenderse.

## Lo que corre solo y lo que no

- **Solo, en el servidor** (`latido`, un activador por tiempo de Apps Script que se instala una vez;
  ver `server/ppp2/INSTALAR.md`): la ronda y las pruebas, cuando el libro dice `explorar` o `probar`.
  Nunca aprueba ni vuelve vigente nada, no toca la base ni la vigente, ni el trabajo de una persona.
  Se apaga con `Config!pausa = sí` o agregando el renglón `latido` = `no` a `Config`. Sin el
  activador instalado, nada corre solo: la página ofrece los mismos pasos con un clic. **La página
  sólo dice «lo hago solo» si el latido corrió en las últimas dos horas** (el servidor anota cada
  latido); si no, dice que no tiene latido o que está apagado.
- **El consejo y la investigación, también en el servidor, por la API de IA** (ver «El consejo y la
  investigación, por API»): un botón de la página los pide y, si hay clave, el latido convoca solo al
  consejo cuando el libro dice `consejo`. No dependen de un chat ni de una suscripción. Escriben filas
  en `Consejo`, `Hallazgos` y `Bitácora`; nunca datos, palancas, versiones ni fórmulas. Sin la clave,
  la página dice que el consejo se convoca en cuanto Dirección la ponga, y una investigación queda
  pedida (pestaña `Pedidos` del vivero).
- **Personas**: capturar y confirmar datos, cerrar candados, aceptar hallazgos, prestarle una versión
  al plan y **volver vigente una versión (sólo Dirección)**.

## Las tres piezas

1. **El libro** (`ppp2/libro/`): un Google Sheets por plan con todo el cálculo nativo. Tres
   versiones (V1 base, V2 y V3) se calculan solas con el mismo motor de flujo mensual: ventas por
   producto, cobranza (enganche, pagos durante la obra, saldos al individualizar), obra en campana,
   capital primero, banco contra avance con tope y caja mínima, respaldo si falta dinero, y la
   devolución del dinero con su rendimiento. La revisión para fondos (nueve pruebas de comité), el
   reparto con el dueño (cinco esquemas), la edad y el ciclo se calculan ahí mismo.
2. **El servidor** (`server/ppp2/PPP2.gs`): Apps Script aparte, ligado al registro «PPP 2 ·
   Vivero». Valida la sesión con el Portero, lee y escribe celdas permitidas con bitácora,
   revisión y `request_id`, y corre la ronda y las pruebas. Instalación en `server/ppp2/INSTALAR.md`.
3. **La página** (`ppp2.html`, `ppp2.js`, `ppp2.css`): el vivero y el plan vivo. Primero lo que
   recibe el dueño y en cuánto tiempo; después lo que el plan dice de sí mismo, sus versiones, sus
   rondas, cómo aguanta los golpes, cómo se defendió ante el consejo, lo que pide y lo que encontró.
   Sin datos de ningún plan en el HTML.

## Edades

| Edad | Cuándo |
|---|---|
| Semilla | Tiene nombre y datos iniciales, todavía no calcula |
| Plántula | La versión que se muestra calcula |
| Árbol | Hay una versión vigente y la última sesión del consejo **sobre esa misma versión con esa misma huella** la aprobó: votaron los 7, aprueban 5 o más, sin veto |
| Flor | Además, todos los candados están cerrados |
| Fruto | Hay acuerdo firmado con el dueño |

La edad la calcula el libro (pestaña Plan). Que el consejo regrese una propuesta nueva no le quita
el árbol a una vigente ya aprobada.

## Consejo de planes

Siete jueces del oficio: Alejandro virtual (puede vetar por un candado), dueño de la tierra virtual,
inversionista virtual, desarrollador-financiero, arquitecto de norma y cabida, broker de campo y
Hormozi (la oferta). Aprueba con 5 de 7 y sin veto. El consejo opina; **sólo Dirección vuelve
vigente una versión**.

Cada voto es una fila de la pestaña `Consejo`: fecha, sesión, versión, juez, voto (`aprueba`,
`regresa` o `veto`), razón, condición para aprobar, y dos sellos que quien escribe el voto **copia
del Resumen**: la **huella** de la versión (`plan.huella`, columna H) y la **evidencia** de ese día
(`plan.evidencia`, columna I). El libro cuenta así:

- Sólo cuentan los votos de la **última sesión sobre esa versión con esa huella**. Los de otra
  versión, o de números que ya cambiaron, no se suman aunque la sesión se llame igual.
- Una sesión vale sólo si tiene **siete votos**. Si quedó incompleta o se escribió dos veces con el
  mismo nombre (catorce renglones), el paso sigue en `consejo` y se convoca otra. **El libro cuenta
  renglones, no jueces**: quien escribe la sesión cuida que cada juez vote una sola vez; si un juez
  aparece dos veces, la página lo avisa, pero el libro la cuenta.
- El libro cuenta cualquier voto `veto`; sólo Alejandro virtual debe usarlo.
- «La última sesión» es la del último renglón sobre esa versión con esa huella: un renglón suelto con
  otro nombre de sesión pasa a ser la última y, como está incompleta, hay que convocar de nuevo.
- Cada sesión lleva un nombre nuevo: `CP-n`, con *n* = uno más que la mayor que ya exista.
- La versión de un voto se lee por su último carácter («V2», «v2», «2», «V 2» valen). Un voto sin
  huella o sin versión no se puede contar: el libro dice cuántos hay (`plan.consejo_sin_leer`) y la
  página lo avisa.

## El consejo y la investigación, por API

El consejo de planes y la investigación corren en el servidor de PPP 2 (`consejo_`, `investigar_` y
el bloque «el consejo y la investigación, por API» de `PPP2.gs`). Se piden con un botón de la página
(«Convocar al consejo», «Investigar», «Investigar lo que falta»); el latido convoca solo al consejo
cuando el libro dice `consejo` (se apaga con `Config!consejo_latido = no`).

- **La clave.** Dirección la pone una vez en las propiedades del script del servidor:
  `ANTHROPIC_API_KEY` (consejo e investigación) u `OPENAI_API_KEY` (sólo consejo). Nunca viaja a la
  página, al repositorio, al libro ni a la bitácora, y el texto de error del proveedor no se guarda.
  Es la excepción a «las claves de IA sólo como secretos de Actions» (que rige el grafo): aquí el
  servidor que escribe en los libros es el que llama a la API, para que el expediente del plan no pase
  por un repositorio público. Paso a paso en `server/ppp2/INSTALAR.md`.
- **El motor.** Anthropic (`claude-sonnet-5-5`) si hay su clave; si no, OpenAI (`gpt-6.1-sol`).
  `Config!consejo_motor` = `openai` pide OpenAI primero y `Config!consejo_modelo` cambia el modelo de
  ese motor. `Config!consejo = no` apaga el consejo y la investigación por API.
- **Cobra por uso.** Cada sesión son siete consultas (una por juez) y cada investigación, una consulta
  con hasta cuatro búsquedas en la web. Lo paga la cuenta de la API, no la suscripción de nadie.
- **Cómo vota.** El servidor arma el expediente desde el libro, tal como se ve (con sus unidades): lo
  que calculó para la versión que el plan defiende y para la vigente, las pruebas de estrés con esa
  misma huella, el reparto, los productos, los datos con su estado y fuente, los candados, los
  hallazgos, las preguntas respondidas, la última sesión del consejo y las rondas recientes. Cada juez
  lo lee por separado, con su oficio y las reglas de siempre (aprueba sólo si hoy firmaría; razones
  con cifras del expediente; nada de cuentas nuevas), y contesta con un objeto fijo: voto, razón y
  condición. Sólo Alejandro virtual puede vetar.
- **Cuándo se escribe.** Sólo si el libro dice `consejo`, la versión tiene pruebas con su huella y
  llegan **los siete votos válidos** (a quien no contestó bien se le pregunta una vez más). Antes de
  escribir se vuelve a leer el Resumen: si la versión, la huella o la evidencia cambiaron mientras
  votaban, no se escribe nada (`cambio`). La sesión lleva nombre nuevo (`CP-n`), la fecha, la huella y
  la evidencia del Resumen, y un renglón en la bitácora con el motor que votó. Si no llegan los siete,
  no se escribe nada: «no contestó» nunca es «aprobado».
- **La investigación.** Busca fuentes oficiales o primarias (al menos dos búsquedas, hasta cinco) y
  contesta con un objeto `{hallazgos: [...]}`; entrega hasta tres. Sólo se anota un hallazgo cuya fuente
  sea una página que la búsqueda de verdad trajo: se compara el sitio y la ruta (sin `www.`, sin `#…` ni
  consulta, http o https) y en el libro queda la dirección tal como la trajo la búsqueda; una liga
  inventada no pasa. La bitácora y el aviso dicen cuánto buscó (búsquedas, páginas, cuántos propuso),
  para distinguir «no encontré nada» de «no alcancé a buscar» o «ninguna fuente comprobada». «Lo que falta» son los candados abiertos y lo que pidió el consejo en su última sesión (una
  condición que piden varios jueces va una sola vez). Lo que sólo puede entregar una persona
  (escrituras, cartas firmadas, presupuestos) no se investiga.

## Otras herramientas del plan

- «La siguiente pregunta» la elige el libro: entre las preguntas abiertas de la edad del plan, la de
  mayor impacto del oficio y más básica. Es un orden del oficio, no un cálculo de sensibilidad.
- «Investigar» (en una pregunta) y «Investigar lo que falta» (cuando el paso es `mundo`) buscan en la
  web ahí mismo, por la API de Anthropic, y dejan en `Hallazgos` lo que encuentran con su fuente
  (estado `propuesto`). Ningún hallazgo cambia un dato solo: una persona lo acepta. Sin la clave de
  Anthropic, «Investigar» deja un pedido en la pestaña `Pedidos` del vivero y la página dice qué falta
  para atenderlo: no promete una revisión que no existe.
- Todo plan nace con seis candados abiertos (tenencia, uso de suelo, agua, vialidad, banco y acuerdo
  con los dueños). Un árbol sin candados registrados lo dice en vez de quedarse sin salida.
- Las pruebas de estrés las calcula el libro: el servidor cambia la columna Prueba, lee y la deja
  como estaba (con la misma fórmula que tenía, sea cual sea el idioma del libro).

## Invariantes

- El PPP actual (motores, Portero, `recurso=lista|caso`) no cambia.
- Ninguna fórmula financiera fuera del libro: hasta el paso de capital de la ronda lo da el libro.
- Sólo `admin` (Dirección) aprueba versiones; `admin` y `editor` capturan, corren rondas y le
  prestan una versión al plan; los demás con `PT` leen. El latido puede editar la versión de
  trabajo, nunca aprobar ni prestarse nada.
- La base y la vigente no las toca ninguna ronda, y el trabajo de una persona sólo con su permiso.
- Repo público: ni nombres de planes, ni cifras, ni identificadores de libros en código, pruebas,
  documentos o descripciones de cambios.

## Pruebas

- `node --test tests/ppp2-servidor.test.cjs tests/ppp2-ronda.test.cjs tests/ppp2-libro.test.cjs tests/ppp2-consejo.test.cjs`
  (`ppp2-consejo`: el consejo y la investigación con una API de juguete; nada sale a la red)
- `node tests/ppp2-browser.cjs`
- Tres accesorios salen de una hoja de cálculo de verdad (LibreOffice) con el plan inventado, y se
  regeneran juntos con `python3 ppp2/libro/regenerar.py`:
  - `ppp2-libro-ejemplo.json`: el libro de ejemplo recalculado;
  - `ppp2-ciclo.json`: la edad y el siguiente paso en 40 momentos de la vida del plan (`ciclo.py`);
  - `ppp2-rejilla.json`: lo que el libro calcula para cada combinación que una ronda prueba desde
    cinco situaciones de partida (`rejilla.py`). Con él, las pruebas corren **el servidor real sobre
    cifras reales del libro**.
- Cada accesorio guarda la huella de los archivos que lo producen: si alguien cambia la plantilla y
  no los regenera, `tests/ppp2-libro.test.cjs` falla.
- El ciclo «en chico» que usan los mundos de prueba (`cicloDe` en `tests/ppp2-mundo.cjs`) se compara,
  escenario por escenario, con lo que calcula el libro. La mecánica de la ronda (dónde escribe, cómo
  se recupera, el latido) se prueba además con un «libro de juguete» de reglas inventadas.
- **LibreOffice no es Google Sheets.** Los accesorios dicen lo que calcula LibreOffice; lo que corre
  es Google Sheets. El 12-nov-2026 las fórmulas del ciclo se comprobaron además en un libro real de
  Google Sheets (una copia privada de un plan, primero con hojas de 1 000 renglones y luego
  agrandadas): `probar`, `consejo`, `explorar`, `mundo`, `consejo` por evidencia nueva, `candados`,
  `proponer` y `direccion` salieron como en los accesorios, igual que la edad y el conteo de votos
  escritos con mayúsculas o espacios de más. Ahí apareció una diferencia que LibreOffice no enseña
  (los números de fila de un rango que se sale de la hoja; ver `ppp2/libro/README.md`) y se corrigió
  antes de publicar. **Quien cambie las fórmulas del ciclo debe volver a comprobarlas en Google
  Sheets**: las pruebas de este repositorio no alcanzan para eso.
