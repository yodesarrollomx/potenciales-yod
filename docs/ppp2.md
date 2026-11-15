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
a una cifra). El tope de capital es el mayor entre el tope de los datos (`din.capital`: 1/3 de las
ventas, ver «El tope de capital») y el que la versión de partida ya usa: si la de partida usa más que
el tope, se prueban capitales hasta ése; nunca prueba capital negativo. El libro recalcula cada combinación y el servidor sólo compara las cifras
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
4. la que usa menos capital (Dirección, 13-nov-2026: «entre menos se requiera, mejor para el negocio»);
5. la que le deja más al dueño (a décimas de MDP).

Si la mejor es la de partida, o ninguna pasa, no propone nada (**sin mejora**) y todo queda
exactamente como estaba. Cuando ninguna pasa, la ronda anota cuál quedó más cerca, sólo para
informar. Cada ronda queda en la pestaña `Rondas` con lo que probó; si el detalle no cabe en una
celda se recortan las combinaciones (primero sus golpes, luego las que no son la de partida, la
elegida o la más cercana), pero nunca lo que tenía la versión donde escribió.

**No insiste con lo que ya se retiró.** Si el plan ya propuso una combinación desde esa misma
versión (misma huella) y hoy esa propuesta ya no existe —alguien la descartó o la cambió—, no la
vuelve a proponer: la marca como retirada y escoge entre las demás. Si cambian los números de la
versión de partida, todo vuelve a considerarse.

### El tope de capital (sólo aviso)

El capital no es dinero «disponible» esperando: es lo más que puede soportar el proyecto, y **entre
menos se requiera, mejor para el negocio** (Dirección, 13-nov-2026). El libro lo calcula en
`Datos!din.capital` como **1/3 de las ventas de los productos** (`Productos`, total); si alguien escribe
otra cifra, manda esa. La versión base lo usa, la ronda nunca propone más (salvo que la de partida ya
use más) y, entre opciones que pasan y aguantan igual, prefiere la que usa menos capital (regla 4).

Pasarse **sólo da aviso**: `Versiones!capital_sobre_tope` dice cuántos MDP se pasa cada versión (0 si
está dentro) y la página lo marca («Pasa del tope»), pero la revisión para fondos no cambia ni la huella
tampoco. El Resumen trae `v1.capital_sobre_tope`… al final, después de las claves que ya leían los libros
vivos.

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
   Sin datos de ningún plan en el HTML (lo último que vio vive en el navegador de quien lo abrió;
   ver «Abrir rápido»).

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
  condición. Sólo Alejandro virtual puede vetar. Con Anthropic la herramienta «votar» se **ofrece, no se
  fuerza** (`tool_choice` «auto»): forzarla («tool» o «any») la rechazan los modelos de esta generación
  con un 400, y así fue la primera sesión en vivo (12-nov-2026: ningún voto llegó y no se escribió nada).
  El sistema le pide votar sólo con la herramienta; si contesta el objeto en texto, también cuenta.
- **Si la API falla,** no se escribe nada y el aviso dice qué contestó, sólo con los códigos HTTP (por
  ejemplo «La API contestó: 400.»); el texto del proveedor no se guarda ni se enseña.
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

## Abrir rápido: lo que ya se leyó del libro

Abrir un plan leía su libro entero cada vez: de 5 a 8 s sólo en el servidor (medido en el editor el
12-nov-2026: unas 40 lecturas de 0.2 a 0.7 s cada una), más el canje, el arranque del servidor y la
red; en el teléfono, de 26 a 35 s. Desde el 12-nov-2026:

- **El servidor guarda lo que leyó del libro** (CacheService, comprimido y en trozos de 90 KB) con
  una llave que cambia en cuanto el libro cambia: su última modificación en Drive (cualquier cambio,
  también el de una persona directo en la hoja) y un sello que mueve cada renglón de la bitácora, o
  sea cada escritura del servidor, del latido o de una persona desde la página (por si Drive tarda
  en enterarse). Si el libro cambió, la llave ya es otra y se vuelve a leer: nunca se sirve un libro
  viejo. Lo que depende de quién abre o del momento (permisos, liga al libro, latido, ronda en curso,
  clave de la API) se calcula en cada llamada y nunca se guarda con el plan. Si la caché o Drive
  fallan, se lee el libro como siempre.
- **La respuesta de cada escritura trae el plan ya leído** (fuera del candado y sólo si sobra
  tiempo): la página lo pinta sin volver a pedirlo y queda en la caché. Lo que se recuerda del
  `request_id` va sin el plan.
- **El latido deja leído cada plan activo** al terminar (fuera del candado, mientras no pase de
  4 min): abrir un plan después de que el latido trabajó no espera al libro. Si el libro no cambió,
  no lo vuelve a leer.
- **El registro de planes para leer** se guarda 2 min (archivar un plan a mano tarda eso en notarse
  al abrirlo); escribir y el latido siempre lo leen de la hoja, y sembrar lo olvida.
- **La página pinta al instante lo último que vio** con esa misma sesión y trae lo nuevo en fondo,
  con el aviso «Te enseño lo que vi hace… mientras traigo lo último de mi libro». Mientras no llega
  lo nuevo **no guarda nada** (lo dice si se intenta). Sin conexión lo dice, lo deja a la vista y
  ofrece «Intentar de nuevo». Misma disciplina que el cargador de YOD OS (`CHG-CARGADOR-FASE1-001`):
  la copia vive en ese navegador atada al hash de la sesión (otra sesión no la ve), dura 12 h, se
  borra si la sesión se rechaza o el plan deja de estar a su alcance, guarda a lo más tres planes y
  vive bajo el prefijo del cargador (`yodcg_cache_v1:ppp2:`), así que su purga también la limpia.
  `?cargador=legacy` (o `localStorage.yodcg_legacy = '1'`) la apaga.

## El visor en vivo: una liga de sólo lectura (14-nov-2026)

Para quien no tiene sesión del Portero (el grupo de la alianza, el dueño del terreno): **una liga, una
pantalla**. `visor.html#l=<liga>` pinta el plan en ocho espacios iguales —Reparto ocupa dos— con sus
siete temas: terreno, producto, tiempo, costo y ganancia, dinero, reparto, y riesgo y estado. Está
hecha para caber en la pantalla de un teléfono y se ve igual en todos los planes.

- **De dónde sale cada cifra.** Todo viene del libro del plan, de la versión que el libro dice que se
  muestra (`plan.version_mostrada`: la vigente y, si no hay, la propuesta). El servidor lo entrega con
  `?recurso=ppp2-visor&liga=…` (`server/ppp2/Visor.gs`): las claves `v{n}.…` del `Resumen`, `Productos`,
  unas cuantas claves de `Datos`, los renglones mensuales de «Flujo V{n}», el esquema elegido de
  `Reparto`, `Candados` y las `Pruebas` que llevan la huella de esa versión. **Aquí no hay motor
  financiero**: ni el servidor ni la página calculan resultados.
- **Lo único que la página hace con las cifras es acomodarlas para dibujar**, y está escrito en
  `visor.js`: partes de un total (un producto entre el vendible, la tierra entre las ventas, lo
  vendible entre lo construido, cada costo por cada $100 de ventas), sumas por trimestre de los
  renglones mensuales, sumas de renglones del flujo que se enseñan juntos (lo que se le paga al banco
  = pago + interés + apertura; el terreno = tierra + su cierre), el costo del dinero menos el
  rendimiento del capital, ventas menos costo total, unidades entre meses de venta, lo que recibe el
  capital entre lo que puso, y la distancia de cada prueba a su límite.
- **Los límites de la revisión para fondos** que dibujan los anillos de «Riesgo y estado» son los de
  la plantilla del libro (`revision_formula` en `ppp2/libro/generar.py`); `tests/ppp2-visor-pagina.test.cjs`
  falla si dejan de coincidir. Que una versión pase o no lo dice el libro (`v{n}.rv_resultado`), no la
  página. El otro extremo de cada rango es sólo la escala del dibujo.
- **Tocar un cuadro lo abre en la misma página** (no es otra página ni otra dirección): la figura en
  grande y, debajo, el desglose de sus cifras con la pestaña y la clave del libro de donde sale cada
  una. Tocar una figura o una cifra —o pasar el cursor— saca su leyenda: qué hay detrás (las ventas
  por producto, lo que entra de clientes por enganches, pagos y saldos, el saldo de cada mes…) y de
  dónde sale. «Atrás», la × o tocar fuera regresan a la pantalla.
- **En vivo.** Con la página a la vista pregunta cada 3 segundos «¿cambió?» (cada 15 si lleva diez
  minutos sin cambios ni toques; con la pestaña oculta no pregunta) mandando la llave de lo que ya tiene; el servidor contesta `igual`
  sin abrir el libro. La llave es la del plan («Abrir rápido», arriba): cambia en cuanto el libro
  cambia, lo escriba el servidor o una persona en la hoja, y se comparte dos segundos entre todos los
  que miran para no consultar Drive por cada teléfono. Cuando cambia, la página se repinta sola y
  marca el cuadro que cambió. Lo que tarda en verse un cambio hecho a mano en la hoja es lo que tarde
  Drive en anotar la modificación más esos segundos.
- **Las ligas viven en la hoja `Ligas` del vivero** (no en el repo ni en la página): una liga es un
  texto largo al azar, de 24 a 80 letras, números, guion o guion bajo. `estado` = `activa` la deja
  abrir; cualquier otro valor la apaga en un minuto. `vence` (fecha) es opcional. Quien tiene la liga
  ve el plan: la pantalla lo dice al pie.
- **Los selectores sólo aparecen si la liga los trae.** `versiones` en blanco: sólo la versión que el
  libro muestra; `todas`: las que calculan y no están descartadas; `1,2`: esas. Varios `plan_id`
  separados por coma (y sus `etiquetas` separadas por `|`) ponen en la misma liga varios planes —varios
  terrenos del mismo predio, por ejemplo— y la pantalla deja escoger entre ellos. Sin eso, el visor se
  ve siempre igual.
- **Lo que no sale del vivero por una liga:** nombres de personas, preguntas, hallazgos, votos del
  consejo, rondas, palancas, la bitácora (sólo la fecha y el texto del último cambio) ni el
  identificador o la dirección del libro. El visor **sólo lee**: lo único que escribe es un renglón por
  apertura en la hoja `Aperturas` del vivero (fecha, las primeras letras de la liga, para quién es, el
  plan y el tipo de equipo), si esa hoja existe.
- **El pie de marcas** sale de `Config` (`visor_marcas` y, para los logos, `visor_logos`): la página
  no lleva nombres ni logos de nadie. La página tampoco lleva el nombre de ningún plan: la vista previa
  de la liga en un chat es genérica.
- **Cómo se ve y se usa** (15-nov-2026). La pantalla se dibuja a 424 px de ancho y se escala al
  teléfono; si por poco no cabe a lo alto (la barra de Safari), se encoge hasta 10 % más. En pantalla
  ancha y apaisada (escritorio, tableta acostada) los cuadros van en cuatro columnas, dos renglones, y
  caben a lo alto; en una tableta parada, en dos columnas centradas. El texto más chico de los cuadros pasó de
  unos 5 px reales a unos 6.3 en un teléfono de 430 px: «Dinero» y «Riesgo y estado» llevan en el cuadro
  chico sólo la figura y lo esencial (la clave de colores, la holgura corta de cada prueba) y su versión
  completa —la columna de totales, los extremos de cada escala, el siguiente paso— va en la hoja. Las
  cifras van en millones de pesos y lo dice el pie una sola vez. Los colores de texto y de relleno con
  texto encima pasan AA.
- **Estados.** Mientras llega el plan se ve un esqueleto que viene en el propio HTML (las tipografías ya
  no detienen la primera pintura); «Se actualizó» marca el cuadro que cambió y la pastilla vuelve a «En
  vivo» a los pocos segundos; sin red la pastilla lo dice («Sin conexión · reintentando», también con el
  evento `offline` del navegador) y vuelve sola; liga apagada, falta de liga y falla al abrir tienen su
  pantalla (la falla, con «Volver a intentar»). Los cambios de estado se anuncian una vez a los lectores
  de pantalla (`#vzAviso`); el resto de la pantalla no es región viva.
- **La hoja del detalle** sube desde abajo con su asa: se cierra con la ×, Esc, el botón «atrás», tocando
  fuera o bajándola con el dedo desde el encabezado. El foco entra a la hoja (a la ×, de 44 px), no sale
  de ella con Tab y regresa al cuadro al cerrar. Si hay una leyenda abierta, el primer Esc la quita.
- **Leyendas.** En la hoja, un toque que cae a menos de 22 px de una figura la toma (objetivo de 44 px);
  la leyenda se pone arriba del dedo, con aire, para que la mano no la tape. Con `prefers-reduced-motion`
  no hay animaciones.
- **Planes con huecos y su propio origen.** El visor también puede pintar planes que no vienen de un
  libro (el PPP de siempre) con la misma forma de datos. Si lo que llega trae `origen` (texto, en la
  raíz), todas las leyendas «de dónde sale» dicen ese texto en lugar de la pestaña del libro. Sin ninguna
  prueba `rv_*`, «Riesgo y estado» dice «Sin revisión para fondos» (y lo que sí haya de etapa, candados y
  pruebas de estrés) en lugar de anillos vacíos. Una serie o clave que no llegó (firmas por mes, reparto,
  flujo mensual, respaldo, banco, terreno) deja su cuadro en «Aún no hay…» o su renglón en «sin dato»:
  nunca un cero inventado, un guion suelto ni NaN. El servidor no cambia por esto.
  Pruebas que llegan sin número (sólo texto) no cuentan como revisión. En «Terreno», un plan de casas se
  dibuja con tantas casas como unidades (hasta doce; una sola, como una casa).
- **Horizontes largos** (hay planes de más de 150 meses; decisión de Dirección, 15-nov-2026). En el cuadro
  chico, «Tiempo» y «Dinero» conservan siempre la escala de un plan normal (60 meses a la vista): un plan
  más largo se dibuja a lo largo y se recorre de lado con dos dedos en el teléfono, con la rueda o
  arrastrando con el ratón en escritorio; un desvanecido con una flechita en el borde dice que hay más
  (y a la izquierda, cuando ya se avanzó). Un dedo sigue haciendo lo de siempre: desplazar la página y
  tocar para abrir. Lo recorrido se conserva cuando la pantalla se repinta sola. En la hoja, la figura
  grande va completa, con el eje por años (rótulos cada uno, dos, tres o cinco años según quepan) y, en
  «Dinero», barras de seis meses pasados los seis años.
- **Dirección escoge «la buena» desde el visor** (15-nov-2026, lado de la página; el servidor que lo
  entiende ya está en `server/ppp2/Visor.gs` y se publica aparte). Si el navegador tiene la sesión del Portero (`pyod_clave_v1`), el visor
  la manda como `k` en sus lecturas: sólo la lee, nunca la borra ni la escribe. Si la respuesta trae
  `elige: { versiones: [{ v, nombre, buena }] }` (el servidor sólo lo manda a quien puede aprobar), arriba
  sale un selector oscuro, «La versión que ven todos · sólo tú ves esto», con una opción por versión
  rotulada con su nombre y la buena marcada. `v` es el `escenario_id` (un texto, vacío en un caso sin
  escenarios): la página lo devuelve tal cual y nunca lo convierte en número. Tocar otra
  manda `POST` (text/plain, JSON) `{ tipo: 'ppp2-elige', k, plan, v, request_id }` con un `request_id`
  nuevo por toque; la pantalla de Dirección marca la nueva al instante y dice «Listo: todos ven ahora» y el nombre;
  si el servidor responde error, el selector vuelve a la de antes y lo dice. Los demás no ven selector:
  su visor la sigue en el siguiente sondeo, con «Se actualizó». Los selectores de versiones y terrenos
  que la liga deja recorrer a cada quien siguen igual y son otra cosa. Contra el servidor de hoy (que
  ignora `k` y no manda `elige`) el visor se comporta como antes.
- Instalación, alta de ligas y marcas: `server/ppp2/INSTALAR.md`, «El visor en vivo».

### Los mismos cuadros, en la ficha del plan

La ficha del plan (`ppp2.html#/plan/<id>`, con sesión del Portero) lleva arriba, bajo el selector de
versiones, **los mismos siete cuadros** de la versión escogida, con su pop-up y sus leyendas. Los dibuja
el mismo `visor.js` (`VisorPPP.monta(…, { incrustado: true })`: sólo la rejilla, dos columnas en el
teléfono y cuatro en pantalla ancha) con el mismo recurso del servidor, pedido con la sesión
(`?recurso=ppp2-visor&k=…&plan=…&v=…`): ahí se ve cualquier versión viva. Así lo que se discute adentro
y lo que ve el grupo por la liga es el mismo dibujo, de las mismas celdas.

**Compartir visor** (quien puede editar): desde ese mismo lugar se da la liga —para quién es, si ve sólo
la versión que el plan muestra o todas, y si lleva otros planes (varios terrenos)—, se copia, se ve
cuántas veces se abrió y se apaga o se vuelve a encender. Es `POST tipo=ppp2-liga` (`op` = `crear`,
`apagar` o `activar`): escribe sólo en la hoja `Ligas` del vivero (la crea, con `Aperturas`, la primera
vez), deja renglón en la bitácora del vivero sin copiar la liga completa y **no toca ningún libro**.

### Pestañas del visor: historial, archivos y opciones (15-nov-2026)

Dirección pidió cuatro pestañas abajo del visor: **Plan · Historial · Archivos · Opciones**. Plan son los
siete cuadros de siempre (`ppp2-visor`). **Opciones** no necesita nada nuevo del servidor: usa lo que ya trae
`ppp2-visor` (`menu.planes`, `versiones` y, para Dirección, `elige`) y el comparativo
`visor-comparar.html#l=<liga>` (ver «Opciones y comparativo», abajo). **Historial** y **Archivos** tienen
cuatro recursos de sólo lectura en
`server/ppp2/Visor.gs` («pestañas del visor»), con la misma puerta que `ppp2-visor`: liga viva y `plan` dentro
de la liga (sin `plan`, el primero), o la sesión del Portero con `plan` (la ficha). Errores: `liga`, `plan` e
`interno` (con sesión, los del canje, como en `ppp2-visor`). Un servidor anterior contesta a estos recursos
`sin_sesion` o `recurso`, y la página enseña un estado digno.

**Quién ve qué: la columna `audiencia` de la liga** (hoja `Ligas`):

| `audiencia` | Historial | Archivos |
|---|---|---|
| `equipo` (la alianza y sus brokers) | todo: eventos, la conversación del grupo, pendientes abiertos y versiones | todo el expediente: la carpeta de cada proyecto del plan, con sus subcarpetas |
| en blanco, `externo` o cualquier otra cosa | sólo los eventos con `para_externos` = sí; nunca la conversación, eventos de WhatsApp o de pendiente, pendientes, decisiones, ni la fuente o la liga de un evento; versiones, sí | sólo lo que cuelga de una subcarpeta «Para compartir» (también «00 Para compartir») que esté justo abajo de la carpeta del proyecto |

Con la sesión del Portero (la ficha del plan) se ve como `equipo`. Lo marcado `visibilidad` = `solo_direccion`
(eventos y pendientes) **no sale nunca**, en ningún visor, ni los pendientes que nacieron de un evento así (su
`evento_id`), aunque ellos digan otra cosa; un mensaje con `visible` = `no`, tampoco.

**Los recursos** (todos por GET):

1. `?recurso=ppp2-historial&liga=…&plan=…[&si=llave]` → `{ ok, llave, audiencia, proyectos:[{id, nombre}],
   dias:[{fecha, items:[{tipo, hora, titulo, resumen, fuente, url?, archivos:[{id, nombre, tipo}]}], chat}],
   pendientes:[{tarea, responsable, compromiso, estado}], versiones:[{v, nombre, fecha, estado}] }`. Con `si`
   igual a la llave: `{ ok, igual: true, llave }`.
   - **Los días.** Un día entra si ese día hubo algo del plan: un evento de sus proyectos que esa audiencia
     puede ver, un mensaje etiquetado con uno de sus proyectos o una versión con fecha. Su `chat` cuenta los
     mensajes visibles de ese día: los del plan y los generales de la alianza (`proyectos` vacío); un día con
     sólo mensajes generales no entra. Más reciente primero, hasta 365 días y 60 eventos por día, por hora (sin
     hora, al final). Fecha y hora se leen del texto (`AAAA-MM-DD` o `D/M/AAAA`, `HH:MM`) o, si la celda guarda
     una fecha de Sheets, de su valor; una fecha mal escrita o más allá de hoy + 400 días no cuenta.
   - **`tipo`** sale de la columna `tipo` de `Eventos` (la pestaña `Tipos`): `reunion_agendada` → `cita`; uno
     que lleve «whatsapp» escrito como sea («WhatsApp grupo») → `whatsapp` (así un externo nunca lo ve); uno
     desconocido → `documento`. Los demás de la lista del contrato pasan igual.
   - **Un evento** lleva `resumen` (para el equipo, con «Decisiones: …» al final si hay), `fuente` (sólo para el
     equipo) y `url` sólo para el equipo, si es `https`, no es de un espacio privado (documentos, carpetas o
     reuniones de Google, chats con asistentes, WhatsApp) y no lleva una liga, sesión o clave. Los documentos de
     Drive de su columna `archivos` o de `fuente_url` salen en `archivos` sólo si están en una carpeta
     permitida para esa audiencia (y entonces se abren con `ppp2-archivo`).
   - **`pendientes`**: los de los proyectos del plan con estado distinto de `hecho`, por `fecha_compromiso`
     (`compromiso`; sin fecha, al final).
   - **`versiones`**: de un plan con libro, las que la liga deja ver (la misma regla del visor), con
     `fecha` = su aprobación (`v{n}.fecha_aprobacion`) y su estado; de una foto del PPP de siempre, sólo la
     versión servida, con la fecha en que se calculó (`calculado`) y `vigente` si es la elegida. Cada versión
     con fecha es además un evento `version` de ese día.
2. `?recurso=ppp2-chat&liga=…&plan=…&dia=AAAA-MM-DD` → `{ ok, dia, mensajes:[{hora, quien, texto,
   adjuntos:[{nombre, id?}]}] }`. Sólo audiencia `equipo` (si no, `plan`). Los mensajes del plan y los generales
   de ese día, por hora. Un adjunto lleva `id` sólo si el archivo está en una carpeta permitida.
3. `?recurso=ppp2-archivos&liga=…&plan=…` → `{ ok, grupos:[{nombre, archivos:[{id, nombre, fecha, tipo,
   tamano, vista}]}] }`, y `incompleta: true` si no alcanzó a recorrer todo (más de 600 archivos, 200 carpetas,
   8 niveles o 20 s).
   - `tipo` es el tipo MIME (los de Google conservan el suyo); `tamano`, bytes (`null` en los de Google);
     `fecha`, la última modificación (`AAAA-MM-DD HH:mm`); `vista`: `pdf` (PDF, y Docs, Hojas, Presentaciones y
     Dibujos de Google, que se entregan como PDF), `imagen` (PNG, JPG, GIF, WebP), `descarga` o `no` (pasa de
     40 MB, o es de Google y no se exporta, como un formulario).
   - Grupos, en este orden: Presentaciones · Propuestas · Modelos financieros · Terreno y polígonos ·
     Reuniones y minutas · Estudios y oficios · Otros (los vacíos no salen). Cada archivo va al grupo de la
     primera de sus carpetas —de arriba abajo— cuyo nombre lleve una de estas raíces y, si ninguna (un archivo
     suelto, o uno de «Para compartir»), al de su propio nombre; lo demás, a Otros. Sin mayúsculas ni acentos y
     sin importar el número del frente; se prueban en este orden (`PESTANAS.CLASES`):
     `present` → Presentaciones; `propuest`, `cotiz` → Propuestas; `modelo`, `financ`, `flujo`, `corrida`, `ppp` →
     Modelos financieros; `terreno`, `poligon`, `legal`, `escritur`, `predio`, `kmz`, `plano` → Terreno y
     polígonos; `minuta`, `reuni`, `acuerdo`, `transcrip` → Reuniones y minutas; `estudio`, `mercado`, `referenc`,
     `oficio`, `dictamen`, `factib` → Estudios y oficios. Así, las subcarpetas de un expediente («01 Terreno y
     legales», «02 Mercado y referencias», «03 Modelo financiero», «04 Presentaciones», «05 Minutas y
     acuerdos», «06 Propuestas») caen cada una en su grupo. Dentro de cada grupo, lo más reciente primero.
4. `?recurso=ppp2-archivo&liga=…&plan=…&id=…&parte=n` → `{ ok, nombre, tipo, partes, parte, datos }`, con
   `datos` en base64 de hasta 3 MB. **Las partes se cuentan desde 0** (`0 … partes − 1`; sin `parte`, la 0). Los
   de Google se exportan a PDF en cada pedido (`tipo` = `application/pdf`, `nombre` con `.pdf`); lo demás —también
   Word, Excel o PowerPoint— se entrega tal cual, con su tipo, salvo lo que un navegador ejecuta (HTML, SVG,
   XML, scripts o un tipo desconocido): esos bytes salen con `tipo` = `application/octet-stream`
   (`PESTANAS.PASIVO`). Errores: `plan`
   (id mal formado, que no existe, carpeta, atajo, en la papelera, fuera de las carpetas permitidas, el libro de
   un plan u otra hoja del sistema, o una parte que no existe), `grande` (más de 40 MB, o Google no lo pudo
   exportar) e `interno`. Cada parte se lee en su propio pedido (no hay caché de bytes): si el archivo cambia
   entre una parte y otra, las partes ya no casan.

**Cómo se protege un archivo:**

- Cada parámetro se valida con una expresión estricta: ids de Drive (`[A-Za-z0-9_-]{20,80}`), `plan` (las
  mismas formas que el registro y las fotos), `dia` (una fecha real `AAAA-MM-DD`) y `parte` (0 a 99, sin ceros
  a la izquierda). Uno mal formado no se busca.
- Un archivo se entrega sólo si su cadena de carpetas sube —en vivo, en cada pedido, hasta 20 niveles— a la
  carpeta (`carpeta`) de un proyecto **de ese plan**; para un externo, la carpeta de justo abajo debe ser
  «Para compartir». La lista guardada no autoriza nada: un archivo que se saca de la carpeta deja de
  entregarse en ese momento.
- Los atajos no se siguen ni se entregan: un atajo dentro de «Para compartir» no abre lo que apunta (se revisa
  la cadena real del archivo pedido). Lo que está en la papelera, tampoco.
- Nunca salen el libro de ningún plan (`Planes!libro_id`), el vivero, la hoja de historial, el libro de las
  fotos ni la plantilla, aunque estén en una carpeta de proyecto (así se cumple «ni el identificador ni la
  dirección del libro» también aquí).
- Drive sólo se lee, con los permisos del dueño del script: **no se cambia ningún permiso ni se hace nada
  público**. Una parte de un archivo de más de 3 MB se lee con la API de Drive por rango (GET con la credencial
  del dueño), sin cargar el archivo entero.
- Un HTML, SVG o XML del expediente (lo puede subir cualquiera que edite la carpeta) nunca sale con su tipo:
  sale como `application/octet-stream`, para que la página no lo abra como página en su propio origen, donde
  vive la sesión del Portero. La pantalla enseña dentro de la página sólo `vista` = `pdf` o `imagen`; lo demás
  lo descarga.
- La lista guardada se vuelve a filtrar en cada pedido contra los libros y hojas del sistema: un libro que se
  registra después de armada la lista deja de aparecer en ese momento.

**Caché:** el historial y la conversación de un día, cinco minutos (la llave del historial es la huella de lo
leído: preguntar con `si` no vuelve a leer nada); la lista de las carpetas, cinco minutos (la usa también el
historial para saber qué adjuntos se pueden abrir); la última modificación de la hoja de historial se comparte
cinco segundos. Los bytes de un archivo **nunca** se guardan. Nada de esto calcula cifras.

**Antes de publicar, en las hojas** (nada de esto va al repo; detalle en `server/ppp2/INSTALAR.md`):

- `Config` del vivero: renglón `historial_id` con el id de la hoja de historial.
- `Ligas`: columna `audiencia` (`equipo` o `externo`; en blanco = `externo`). Puede ir en cualquier lugar: el
  servidor la lee por encabezado y «Compartir visor» escribe cada dato en su columna (la nueva queda en blanco).
- Hoja de historial, `Proyectos`: columnas `planes` (CSV de `plan_id`: `p2…` o `ppp:<caso>[:<esc>]`; una foto
  casa con cualquier versión del mismo caso) y `carpeta` (el id o la dirección de la carpeta del expediente).
- `Eventos`: columnas `archivos` (CSV de ids o direcciones de Drive) y `para_externos` (`sí` o vacío).
- Pestaña nueva `Chat`: `id | fecha | hora | quien | texto | adjuntos | adjuntos_ids | proyectos | visible |
  origen`, un renglón por mensaje (`adjuntos` separados por coma, en el mismo orden que `adjuntos_ids`).
- En Drive, dentro de cada carpeta de expediente, una subcarpeta «Para compartir» con lo que puede ver un
  dueño de terreno. La cuenta que ejecuta el servidor debe poder abrir las carpetas; no hace falta
  compartirlas con nadie.

Pruebas: `node --test tests/ppp2-pestanas.test.cjs` (historial por audiencia, `solo_direccion`, conversación
oculta, proyecto sin carpeta, archivo fuera de la carpeta, «Para compartir», atajos, partes y límites, ids mal
formados, liga apagada, caché sin bytes y que `ppp2-visor` responde igual).

### Fotos de casos del PPP de siempre (15-nov-2026)

El mismo visor enseña también casos del PPP de siempre (PPP 1), **sin calcular nada y sin abrir sus
libros**: sirve una «foto» ya hecha de cada versión. Contrato completo en `docs/visor-ppp1.md`.

- **Dónde viven:** pestaña `PPP_VISOR` del libro «YOD - POTENCIALES» (no el vivero), un renglón por
  (caso, versión), con columnas `caso_id | tipo | escenario_id | escenario_nombre | estado | elegida |
  elegida_por | elegida_fecha | orden | motor_commit | huella_entradas | calculado | origen |
  conciliacion | visor_json` (se leen por encabezado). El id de ese libro llega por el renglón
  `potenciales_id` de `Config` del vivero; nunca va en el repo. Sin ese renglón, sin la pestaña o sin
  acceso, el visor responde «sin plan» (`error: 'plan'`) y lo demás sigue igual.
- **Cómo se piden:** en `Ligas`, un `plan_id` = `ppp:<caso_id>` o `ppp:<caso_id>:<escenario_id>`, solo o
  mezclado con planes con libro (cada uno con su etiqueta). La ficha con sesión acepta el mismo
  `plan=ppp:…` con el mismo permiso de siempre (sesión del Portero con `PT`); para una foto no ofrece
  «Compartir visor» (sus ligas se dan en la hoja). El id se valida con una expresión estricta
  (`VISOR.FOTO_RE`); uno mal formado no se busca.
- **Cuál se sirve:** de cada versión manda su foto **más reciente** (la de más abajo); si esa quedó
  `propuesta`, la versión no se sirve, aunque haya una `lista` anterior. `ppp:<caso_id>` sirve la versión
  **elegida** (`elegida` = `sí`, una por caso) con su foto más reciente; si la elegida no se puede servir,
  el caso responde «sin plan» (no se pone otra en su lugar); si ninguna está elegida, la de mayor `orden`
  entre las que se pueden servir. `ppp:<caso_id>:<escenario_id>` sirve siempre esa versión. Un caso sin
  escenarios tiene un solo renglón con `escenario_id` vacío y se sirve por `ppp:<caso_id>`.
- **Qué sale:** la forma `ppp2-visor-v1` (más `origen`) tomada del `visor_json`, **clave por clave y con
  su tipo** (`fotoLimpia_`): números finitos o `null`, textos recortados, sí/no; lo que no es de la forma
  no sale. Así la foto no pisa lo que arma el servidor (`ok`, `llave`, `menu`, `puede`, `elige`, `marcas`…)
  ni mete marcado donde la página espera un número. Se revisa que sea un objeto y que no pase de 50 000
  caracteres; no salen `elegida_por`, `motor_commit` ni nombres de personas. `version` y `plan.mostrada`
  son el `orden` del renglón; `versiones` trae sólo la versión servida (la lista completa sólo la ve quien
  aprueba, en `elige`). Si la servida es la elegida, el servidor la rotula vigente: `v.estado` =
  `vigente`, `plan.vigente` = su número y en `origen` «versión vigente». Las versiones de la liga no
  aplican.
- **«¿Cambió?»:** la llave de una foto es su `huella_entradas` + `calculado`, qué versión es y cuál es
  la buena del caso (así cambia cuando Dirección cambia la elegida, también para quien mira una versión
  fija). El índice de la pestaña (sin `visor_json`) se comparte dos segundos entre quienes miran, como
  la llave de un plan; el JSON sólo se vuelve a leer cuando la llave cambia.
- **Dirección escoge «la buena».** Si `ppp2-visor` trae además `k` (sesión del Portero, por liga o por la
  ficha) y su rol puede aprobar (`roles_aprobar` de `Config`), la respuesta de un plan-foto agrega
  `elige: { versiones: [{ v, nombre, buena }] }` (`v` = `escenario_id`, por `orden`; `buena` = la que
  sirve `ppp:<caso_id>`). Sin `k`, con una sesión que no vale o sin ese rol, el campo no sale y nada más
  cambia. Para cambiarla: `POST {tipo: 'ppp2-elige', k, plan, v, request_id}` (sólo quien aprueba;
  `plan` puede ser `ppp:<caso>` o `ppp:<caso>:<esc>`, se elige para el caso). Mueve `elegida`, anota
  `elegida_por` y `elegida_fecha` en la foto más reciente de esa versión (y los borra de las demás del
  caso), deja renglón `visor-elige` en la bitácora del vivero, borra el índice guardado y responde
  `{ok: true, llave}` (la llave que verá la ficha con sesión). Idempotente: por `request_id`, y elegir la
  que ya es la buena no escribe nada; con `pausa` = `sí` no escribe. `v` vacío elige la versión única de
  un caso sin escenarios. Errores: `permiso`, `plan`, `version` (no existe), `propuesta` (su foto más
  reciente no concilió: no se elige), `hoja` (faltan las columnas de elección). Los visores la siguen en lo que
  tardan en preguntar «¿cambió?» (unos segundos).
- **Los planes con libro no se eligen así:** su versión mostrada (`plan.version_mostrada` = `Plan!B6`)
  es la `vigente` del libro y, si no hay, la `propuesta`; cambiarla es aprobar una versión
  (`ppp2-version`, que ya exige `admin`). Por eso `ppp2-elige` responde `plan` para ellos y no llevan
  `elige`.

## Opciones y comparativo: todas las opciones de una liga, lado a lado (15-nov-2026)

Dirección: un plan a veces tiene varias opciones (el mismo proyecto en terrenos de distinto tamaño, o
varias versiones del libro). Se cambia entre ellas en el visor y, cuando se quiere ver todas juntas, se
pide el **comparativo**: «como cuando comparas los specs de un carro nuevo», con todos los factores
alineados, una barrita por factor, la flecha verde en la mejor y la roja sólo donde el cambio es grande.

- **Página propia, misma liga:** `visor-comparar.html#l=<liga>` (también `?l=`) + `visor-compara.js` +
  `visor-comparar.css`. No carga `visor.js`, ni `portero.js`, ni el marco. Sólo GET al mismo recurso del
  visor (`?recurso=ppp2-visor&liga=…`): primero la liga tal cual (trae los planes y las versiones que deja
  ver), luego la versión que muestra cada otro plan (`&plan=`) y luego cada otra versión (`&plan=…&v=…`),
  a lo más tres a la vez y dieciocho opciones. Sólo la primera lleva `abre=1` (trae las marcas del pie y
  deja **un** renglón en `Aperturas`, con el equipo seguido de «· comparar»). No escribe nada más ni guarda
  nada en el navegador. Si una opción no contesta, enseña las demás y lo dice.
- **Columnas = opciones** (en el orden de la liga: planes y, dentro, versiones), con su nombre corto
  (la etiqueta del plan en la liga y/o «V{n} · nombre de la versión»), su terreno y en cuántos factores es
  la mejor. **Renglones = factores**, agrupados como los siete cuadros. Cada celda: la cifra con su unidad,
  una barrita proporcional dentro del renglón (siempre desde cero; con negativos, una raya marca el cero) y
  la marca. Al pasar el cursor, de qué pestaña y clave del libro sale.
- **Encabezado:** cuál opción es la mejor en más factores y en cuáles (las demás, con sus factores si son
  hasta cuatro opciones; con más, sólo cuántos), y en qué queda alguna muy por debajo. Sólo cuenta marcas:
  sin adjetivos.
- **Una liga con una sola opción** lo dice («no hay otra con qué compararla»), no pinta tabla y lleva al
  visor.
- **Descargar PDF** = `window.print()` con la hoja de impresión de `visor-comparar.css`: carta horizontal,
  sin botones, la fila de opciones repetida en cada hoja, el encabezado con la fecha y hora de los datos
  (`leido` y el último `cambio` de las opciones), las marcas de `Config` y el aviso de confidencialidad; el
  pie de cada hoja repite el aviso y lleva «Página n de m».
- **Teléfono primero:** a 430 px la tabla se desliza de lado y a lo alto dentro de su caja, con la columna
  de factores y la fila de opciones fijas; la página no se desliza de lado. En escritorio, si cabe, la tabla
  se ve completa y la página baja entera.

**No es una fórmula financiera.** Cada factor es **una** cifra que el libro ya dio; la página la redondea
como la enseña (MDP a un decimal, porcentajes a una décima de punto, veces a dos decimales, meses y m²
enteros), la compara con la mejor y cuenta marcas. No calcula TIR, márgenes ni sumas que el libro no dé
(las unidades son el total del renglón «Total de unidades» de «Flujo V{n}», no la suma de los productos).
Lo que no llega (vacío, nulo o texto donde va número, como «sin banco») se enseña **no aplica**, sin marca
y sin contar como la peor.

**Las marcas.** Flecha verde hacia arriba (texto alternativo «mejor»): la opción con la mejor cifra del
factor; si empatan a la precisión con que se enseñan, todas; si todas son iguales o hay menos de dos con
cifra, ninguna. Flecha roja hacia abajo («muy por debajo»): **sólo** si el factor declara umbral y la
opción queda más allá de él respecto de la mejor (en el umbral exacto, no). «Dato» es el tamaño del
proyecto: se enseña y se dibuja, pero no tiene mejor ni peor (un terreno chico vende menos sin estar
«peor»). Los factores de resultado (lo que da) son «más es mejor»; los de exposición (lo que pide), «menos
es mejor». La tabla vive en `FACTORES` de `visor-compara.js`; si cambia allá, cambia aquí
(`tests/visor-compara.test.cjs` compara los dos).

| Factor | De dónde sale | Sentido | Rojo si… |
|---|---|---|---|
| Superficie del terreno | Datos · terreno.m2 | dato | — |
| Valor de la tierra | Resumen · v{n}.tierra | dato | — |
| Ventas totales | Resumen · v{n}.ventas | dato | — |
| Área vendible | Datos · lamina.m2_vendibles | dato | — |
| Unidades | Flujo V{n} · total de «Total de unidades» | dato | — |
| Plazo hasta el reparto | Resumen · v{n}.mes_reparto | menos es mejor | más de 25 % peor que la mejor |
| Preventa al arrancar la obra | Resumen · v{n}.rv_preventa | más es mejor | más de 15 puntos abajo de la mejor |
| Costo sin tierra | Resumen · v{n}.costo_sin_tierra | dato | — |
| Ganancia real | Resumen · v{n}.ganancia | más es mejor | más de 25 % peor que la mejor |
| Ganancia sobre ventas | Resumen · v{n}.margen | más es mejor | más de 5 puntos abajo de la mejor |
| Costo del dinero | Resumen · v{n}.costo_dinero | menos es mejor | — |
| Dinero ajeno, máximo | Resumen · v{n}.max_ajeno | menos es mejor | más de 25 % peor que la mejor |
| Crédito del banco, saldo máximo | Resumen · v{n}.banco_max | menos es mejor | — |
| Capital aportado | Resumen · v{n}.capital | menos es mejor | — |
| Dinero que faltaría | Resumen · v{n}.respaldo | menos es mejor | le falta más que a la mejor (más de $0.05 MDP) |
| El dueño recibe | Resumen · v{n}.dueno_recibe | más es mejor | más de 25 % peor que la mejor |
| Veces el valor de su tierra | Resumen · v{n}.dueno_veces | más es mejor | más de 25 % peor que la mejor |
| El dueño cobra lo último | Resumen · v{n}.dueno_meses | menos es mejor | — |
| La alianza recibe | Resumen · v{n}.alianza_recibe | más es mejor | más de 25 % peor que la mejor |
| Revisión para fondos | Resumen · v{n}.rv_resultado | pasar es mejor | no pasa y otra sí |
| Margen antes de financiamiento, sobre costo | Resumen · v{n}.rv_margen | más es mejor | — |
| Aportación: tierra y capital entre costo | Resumen · v{n}.rv_aportacion | más es mejor | — |
| Cobertura: por cobrar entre saldo del banco | Resumen · v{n}.rv_cobertura | más es mejor | — |
| Candados abiertos | Resumen · plan.candados_abiertos | menos es mejor | — |

El rojo se reserva para lo que cambia la decisión (plazo, preventa, ganancia, dinero ajeno, dinero que
faltaría, lo que reciben el dueño y la alianza, la revisión para fondos); los demás factores sólo marcan
la mejor. Un porcentaje relativo no existe si la mejor es cero: ahí no hay rojo relativo. Revisión para
fondos: «Pasa…» está un escalón arriba de «No pasa…»; si ninguna pasa no se marca (contar pruebas sería
otra cuenta). Los planes «foto» del PPP de siempre traen la misma forma con varios campos en nulo: esos
factores salen «no aplica».

**Cómo se enlaza desde el visor (pestaña «Opciones»).** El visor ya sabe si hay opciones: la respuesta
trae `menu.planes` (más de uno = varios terrenos) y `versiones` (más de una = varias versiones). Con
cualquiera de los dos, la pestaña «Opciones» cambia entre ellas como hoy los selectores y ofrece «Comparar
todas», que abre `visor-comparar.html#l=<la misma liga>` en la misma pestaña (atrás regresa al visor). No
hay que pasarle nada más: la página pide todo con la liga. Sin opciones, la pestaña no hace falta (si se
abre igual, la página dice que hay una sola). El comparativo regresa con «Ver el visor»
(`visor.html#l=<liga>`).

Pruebas: `node --test tests/visor-compara.test.cjs` (marcas, umbrales, empates, ausentes, encabezado,
una sola opción, juntar opciones con el servidor real, sólo GET, hoja de impresión) y
`node tests/visor-compara-browser.cjs` (teléfono con la tabla deslizándose y los factores fijos,
escritorio, «Descargar PDF» con un PDF carta horizontal de verdad, una sola opción, liga apagada).

## Un solo PPP: los planes con libro se abren desde el PPP de siempre (14-nov-2026)

Dirección pidió unificar: el PPP de siempre es la entrada y lo que nació aquí como «PPP 2» pasa a ser
**la ficha de los planes que tienen su modelo completo en un libro**. No se borra nada del PPP de
siempre ni se vuelven a teclear cifras en sus motores (darían otros números): el libro aprobado de cada
plan es su modelo, como ya lo es en los casos nativos del PPP.

- **El registro de planes dice a qué caso corresponde cada plan**: columna `caso_ppp` de la hoja
  `Planes` del vivero, con el identificador del caso del PPP (o `mixto:<caso_id>`, si se quiere fijar
  el motor). `ppp2-vivero` la entrega como `caso`.
- **`ppp-libro.js`** (lo cargan la portada y `mixto.html`; una sola pregunta por página, con la sesión
  de siempre, de sólo lectura):
  - en la portada, el renglón de un caso que ya tiene su plan abre la ficha y lo dice («plan con
    libro», con su versión y lo que recibe el dueño); los planes que no tienen caso salen en el grupo
    «Planes con libro»;
  - un motor abierto por su liga (`?open=<caso>`) en un caso que ya tiene su plan avisa y lleva a la
    ficha; con `&clasico=1`, o si el caso se escogió dentro del motor, sólo avisa.
- Sin sesión, sin respuesta o sin planes, `ppp-libro.js` no pinta nada: el PPP de siempre queda igual.
- Lo que sigue (no está hecho): quitar «PPP 2» del menú de YOD OS cuando la portada ya sea la entrada
  de todos, y llevar a la ficha las piezas del PPP de siempre que un plan con libro todavía no tiene
  (presentaciones, mapa, programa arquitectónico).

## La carátula es el visor, y cada cuadro trae su lápiz (15-nov-2026)

Dirección: «dejarla muy limpia la carátula… que sea el mismo lenguaje… cuando le damos clic a una de las
tarjetas te va a mostrar cuáles son los puntos… un lapicito para editar… te va a decir con qué está
relacionado… y alerta si no cumples». Plan y decisiones: encargo `CL-PPP-DEFINITIVO-20261115` del Buzón.

**La carátula** (`ppp2.js`, `pintarPlan`): encabezado, versiones, los siete cuadros del visor, una línea
con el estado de la versión que se ve (y, para Dirección, aprobarla) y la voz del plan. Se quitaron los
bloques que repetían lo que dicen los cuadros (lo que recibe el dueño en grande, las cuatro cifras clave y
la gráfica del dinero). Lo demás vive en **el expediente** (versiones lado a lado, preguntas y evidencia,
rondas y bitácora), cerrado hasta que se pide: `#/plan/<id>` abre limpio; `#/plan/<id>/<sección>` abre esa
sección, y volver a tocarla la cierra.

**Lo que mueve cada cuadro.** Al abrir un cuadro, debajo de su desglose aparece «Lo que mueve este
cuadro»: los datos y palancas que lo alimentan, con su cifra en la versión que se ve, su estado y su
fuente. Es la ingeniería inversa del visor hacia atrás: qué se edita en cada cuadro lo dice `CUADROS` en
`ppp2/libro/relaciones.py`. Se engancha a la hoja del cuadro desde `ppp2.js` (observa `#vzModal`) sin
tocar `visor.js`. Quien edita (`admin` y `editor`) ve un lápiz en cada punto y también junto a «de dónde
sale» en los renglones del propio cuadro que son un dato; quien sólo lee ve los puntos sin lápiz.

**«Está ligado a» sale de las fórmulas.** `python3 ppp2/libro/relaciones.py` arma la plantilla
(`generar.py`), sigue celda por celda las referencias de sus fórmulas desde cada dato y palanca hasta los
resultados de la pestaña Versiones y escribe `ppp2-relaciones.js` (sólo nombres y ligas, ninguna cifra):
por qué cálculos pasa, qué resultados mueve y qué pruebas de la revisión para fondos puede mover. Lista
además lo que **sobra**: datos que el libro pide y que no llegan a ningún resultado del visor (hoy: la
preventa mínima, que ninguna fórmula lee, y la utilidad, el pago al dueño y el área vendible de la lámina,
que sólo cuentan para la edad del plan). Si cambia `generar.py` o el guion y no se regenera,
`tests/ppp2-lapiz.test.cjs` falla.

**Probar antes de guardar** (`POST tipo=ppp2-simular`, sólo `admin` y `editor`): el servidor escribe la
cifra en la columna Prueba del Modelo (la de las pruebas de estrés) para la versión que se ve, el libro
recalcula, se leen las cifras de antes y de después (del Modelo y de `Pruebas!B6:B10`) y la columna vuelve
a como estaba. Los visores leen V1, V2 y V3, nunca la columna Prueba: **nadie más ve el ensayo**. No se
anota en la bitácora porque nada cambió; si la columna no regresa, se anota y se avisa (`error: prueba`).
Un dato se prueba por la palanca que lo copia (`=Datos!$C$n`) **sólo si nadie más lo lee**: si otra fórmula
de Datos, Modelo, Productos o Reparto también lo usa (en la plantilla v1, la comisión, el cierre, los
indirectos, los imprevistos y la tierra entran además a la obra directa que sale de la lámina), probarlo por
la palanca daría otras cifras que guardarlo, así que el servidor contesta `sin_prueba` (`motivo: otros`) y la
página ni ofrece la prueba: lo dice y muestra qué más mueve guardarlo (`dato_otros`, `dato_pasa_por` en el
catálogo). Versiones no cuenta: sólo enseña resultados y avisos que el lápiz no lee. Si la versión tiene su
propia cifra, el dato no la mueve y así se dice (`sin_efecto`); lo mismo con el % pagado durante la obra
probado «en la pestaña Productos» (`como_dato`). Un dato que ninguna palanca copia (el terreno, la obra
directa, los productos) no tiene columna de prueba: se guarda con su fuente y se puede deshacer. Los
avisos de la prueba usan los mismos límites que dibuja el visor (`VisorPPP.PRUEBAS`, los de la revisión
para fondos del libro): dinero que faltaría, ganancia negativa, aportación y preventa.

El resultado dice qué cifra se probó y dónde, y se borra en cuanto se cambia la cifra o el lugar; una
respuesta que llega cuando ya se abrió otro lápiz no se pinta. Enter en la cifra la prueba: guardar es
siempre un toque en «Guardar». Si el libro cambió mientras se probaba (otra persona guardó algo), se dice
en el diálogo y lo último se trae al cerrarlo. Escribir y regresar la columna Prueba cambia la última
modificación del libro en Drive: el siguiente que abra el plan lo lee completo (unos segundos más), nada más.
La hoja `Pruebas!B4` y las fórmulas de la columna Prueba se regresan siempre, también si algo falla a medias,
y se comprueban (fórmulas y cifras) antes de contestar.

**Guardar y deshacer.** Se guarda «sólo en esta versión» (`ppp2-palanca`) o «en los datos del plan»
(`ppp2-dato`, con estado y fuente; los pagos durante la obra van a `ppp2-producto`). La vigente sólo la
cambia Dirección: quien edita puede probar la cifra ahí, pero se guarda en los datos o en otra versión.
Después de guardar, una barra ofrece **Deshacer** unos segundos: regresa exactamente lo que había (si la
versión seguía los datos, vuelve a seguirlos). Deshacer va al plan y a la revisión del guardado: si alguien
cambió el libro desde entonces no escribe (`revision`), y al abrir otro plan la barra se quita. Si el dato
lo calculaba el libro, su fórmula se guarda como texto en la columna L de Datos («Fórmula anterior») y
deshacer la regresa tal cual; lo que una persona haya escrito en esa columna no se pisa.

Lo que sigue: la plantilla definitiva del libro (programa y norma, costo por partes, ritmo de ventas,
alertas de norma) y llevar ahí a los planes.

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

- `node --test tests/ppp2-servidor.test.cjs tests/ppp2-ronda.test.cjs tests/ppp2-libro.test.cjs tests/ppp2-consejo.test.cjs tests/ppp2-cache.test.cjs`
  (`ppp2-consejo`: el consejo y la investigación con una API de juguete; nada sale a la red;
  `ppp2-cache`: lo que ya se leyó del libro, con un Drive cuya última modificación cambia con el
  contenido y una caché que, como la real, no acepta más de 100 KB por valor)
- `node tests/ppp2-browser.cjs` (`PPP2_SOLO=texto` corre sólo los recorridos cuyo nombre lo lleva)
- El lápiz: `node --test tests/ppp2-lapiz.test.cjs` (probar una cifra deja la columna Prueba como estaba
  y no anota nada; el catálogo «está ligado a» está al día con la plantilla y cubre cada palanca) y los
  recorridos «el lápiz…» de `tests/ppp2-browser.cjs`. Si tocas `ppp2/libro/generar.py`, corre también
  `python3 ppp2/libro/relaciones.py`.
- El visor y la unificación: `node --test tests/ppp2-visor.test.cjs tests/ppp2-visor-pagina.test.cjs`
  (la liga, la ficha con sesión, dar y apagar ligas, lo que entrega el servidor; la página contra eso
  mismo: cifras, leyendas, límites de la revisión, planes con huecos y con `origen`) y `node tests/ppp2-visor-browser.cjs` (abrir, tocar,
  cerrar, la hoja —foco, Esc, bajarla con el dedo—, cuatro columnas en pantalla ancha, el selector de Dirección con un servidor simulado (y el error), el ritmo del sondeo y su pausa, cambio en vivo, liga apagada, los cuadros en la ficha, compartir desde el plan, y la portada y
  un motor del PPP de siempre con planes con libro, sobre `tests/fixtures/libro/`).
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
