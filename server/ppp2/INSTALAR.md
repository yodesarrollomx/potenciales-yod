# PPP 2 · servidor — cómo se instala y cómo se actualiza

El servidor de PPP 2 es un **Apps Script aparte**, ligado a la hoja «PPP 2 · Vivero (registro)»
de la carpeta «PPP 2 · Vivero» en el Drive de Dirección. **No es** el Apps Script del Portero
(`115k1wTx…`) ni el de Potenciales: no se toca nada de aquéllos.

## Qué hace (y qué no)

- Valida la sesión de quien abre con el Portero (`?recurso=canje&t=…&board=PT`); el original va
  primero y el respaldo sólo si aquél falla en esa misma llamada.
- Lee de cada libro de plan la pestaña `Resumen` (clave → valor) y las tablas de datos, versiones,
  palancas, preguntas, candados, hallazgos, consejo y pruebas.
- Escribe **sólo** celdas permitidas (datos, productos, palancas de versión, estado de versiones,
  preguntas, candados, hallazgos, esquema de reparto) y deja renglón en la `Bitácora` del libro.
- **No calcula nada financiero**: las fórmulas viven en el libro (contrato del 30-sep-2026). Las
  pruebas de estrés cambian la columna `Prueba` del `Modelo`, dejan que el libro recalcule, leen y
  restablecen.
- Corre **la ronda del plan** (`ppp2-ronda`): prueba combinaciones de capital y arranque de obra en
  una versión de trabajo, el libro recalcula cada una y el plan propone sólo lo que pasa la revisión
  para fondos, según el criterio escrito en `docs/ppp2.md`. Nunca toca la base ni la vigente, ni
  escribe encima del trabajo de una persona si nadie se lo presta.
- Convoca **al consejo de planes** (`ppp2-consejo`) e **investiga** (`ppp2-investigar`) por la API de
  IA, con la clave en las propiedades del script (abajo, «La clave de la API»).
- `latido` (activador por tiempo) hace sola la ronda y las pruebas cuando el libro dice que toca y, si
  hay clave, también convoca al consejo.

## Instalación (una sola vez)

1. Abrir la hoja «PPP 2 · Vivero (registro)» → **Extensiones → Apps Script**.
2. Nombre del proyecto: `PPP 2 · servidor`. Pegar `PPP2.gs` completo en `Código.gs` y guardar.
3. **Implementar → Nueva implementación → Aplicación web**: ejecutar como *Yo*, acceso *Cualquier
   usuario*. Es la primera implementación de un proyecto nuevo, por eso es «Nueva implementación».
4. Autorizar (hoja de cálculo, Drive y llamadas externas: el Portero y la API de IA) con la cuenta de
   Dirección.
5. Copiar la URL `/exec` y ponerla en `ENDPOINT` de `ppp2.js`.
6. Comprobar: `…/exec?recurso=ppp2-meta` → `{"ok":true,"pong":true,"servicio":"ppp2",…}`.

La hoja `Config` del vivero guarda la plantilla, la carpeta, las dos URL del Portero, el código de
permiso (`PT`), los roles que aprueban (`admin`) y los que editan (`admin,editor`), y `pausa`
(`sí` = sólo lectura).

## Actualizar el código (siempre así)

1. Pegar el `PPP2.gs` nuevo en el editor y guardar. El proyecto tiene **dos archivos**: `Código.gs`
   (= `PPP2.gs`) y `Visor.gs` (= `Visor.gs`, el visor en vivo); si cambió alguno, se pega ése.
2. **Implementar → Administrar implementaciones → lápiz → Versión: Nueva versión → Implementar.**
3. **Nunca** «Nueva implementación» otra vez: cambiaría la URL `/exec` y la página dejaría de
   encontrar al servidor.

## El latido (para que el plan itere solo)

Una sola vez, en el editor del proyecto: **Activadores** (el reloj de la izquierda) → **Añadir
activador** → función `latido`, implementación *Principal*, fuente *Según tiempo*, *Temporizador de
minutos*, *Cada 30 minutos* → Guardar. En cada latido el servidor revisa los planes activos y, si el
libro de alguno dice `explorar` o `probar` (o `consejo`, si hay clave de la API), da **un** paso. No aprueba ni vuelve vigente nada. Sin
este activador nada corre solo: la página ofrece los mismos pasos con un clic.

Lo que conviene saber:

- **Apagarlo sin borrar el activador:** en la hoja `Config` del vivero, agregar un renglón nuevo con
  clave `latido` y valor `no` (ese renglón no existe hasta que alguien lo agrega). `pausa` = `sí`
  también lo detiene y además deja todo en sólo lectura. El cambio tarda hasta dos minutos en notarse.
- **Mientras corre una ronda, unas pruebas, el consejo o una investigación** (pueden tardar varios
  minutos), el servidor atiende de uno en uno: quien intente guardar algo en cualquier plan recibe el aviso de que hay una ronda
  corriendo y vuelve a intentar al terminar. Leer sí se puede; las cifras de la versión de trabajo
  se ven a medias y la página lo dice.
- **Libro lento:** cada intento de ronda usa hasta unos tres minutos. Si no alcanza, no cambia nada,
  guarda lo que lleva y el siguiente latido continúa. Apps Script limita el tiempo total de los
  activadores por día (90 minutos en cuentas personales, 6 horas en Workspace).
- **Si un paso no sirve, no insiste:** si la ronda no tiene dónde escribir, si el libro no trae lo
  que necesita o si el paso no avanza, el latido espera un día con ese plan (dos horas si fallaron
  unas pruebas, si el libro cambió mientras corría la ronda o si la API de IA no contestó). Si el paso no avanza tres veces
  seguidas, deja de insistir. En cuanto una persona guarda cualquier cambio en el plan, vuelve a
  mirarlo y la cuenta empieza de nuevo.
- **Varios planes:** atiende un plan por latido y empieza por el que sigue al último atendido.
- **La página sabe si el latido corre:** cada latido deja anotada su hora. Si pasan más de dos horas
  sin latir (o nunca se instaló), la página deja de decir «lo hago solo» y dice que no tiene latido.
- **Con `pausa` = `sí`** el servidor no escribe nada, tampoco para dejar como estaba una versión que
  una ronda interrumpida dejó a medias: la página avisa que está a medias hasta que se quite la pausa.
- Lo que hizo queda en la `Bitácora` del vivero y en la del libro.

## El visor en vivo (ligas de sólo lectura)

`visor.html#l=<liga>` enseña un plan en una pantalla a quien no tiene sesión del Portero (ver
`docs/ppp2.md`, «El visor en vivo»). El servidor lo atiende con `?recurso=ppp2-visor&liga=…`, sin
pasar por el Portero y **sin escribir en ningún libro**.

**Una sola vez:**

1. En el editor del proyecto: «+» junto a Archivos → Secuencia de comandos → nombre `Visor` → pegar
   `Visor.gs`. En `Código.gs` va el `PPP2.gs` de este repo (trae la ruta `ppp2-visor` en `doGet`).
   Guardar y publicar **Versión nueva** sobre la implementación de siempre.
2. Las pestañas **`Ligas`** (`liga | plan_id | para | estado | vence | versiones | etiquetas | creada |
   nota`) y **`Aperturas`** (`fecha | liga | para | plan_id | equipo`) las crea el servidor la primera
   vez que alguien da una liga desde un plan. Sin `Aperturas` no se anota quién abre.

**Dar una liga:** en la ficha del plan, **Compartir visor** (quien puede editar): para quién es, qué
versiones ve y, si hace falta, otros planes en la misma liga. Ahí mismo se copia, se ve cuántas veces
se abrió y se apaga. También se puede a mano, con un renglón en `Ligas`:

| columna | qué va |
|---|---|
| `liga` | un texto largo al azar: de 24 a 80 letras, números, `-` o `_`. Es la llave: no se reutiliza ni se acorta |
| `plan_id` | el `plan_id` del plan en la pestaña `Planes`. Varios separados por coma = varios planes (terrenos) en la misma liga |
| `para` | a quién se le dio (sólo para saberlo: sale en `Aperturas`) |
| `estado` | `activa` para que abra. Cualquier otra cosa (`apagada`) la cierra en un minuto |
| `vence` | opcional: fecha `aaaa-mm-dd`; ese día todavía abre, al siguiente ya no |
| `versiones` | en blanco: sólo la versión que el libro muestra. `todas`, o una lista como `1,2`, deja escoger |
| `etiquetas` | con varios planes, el nombre de cada uno en la pantalla, separados por `|` (en el mismo orden) |
| `creada`, `nota` | libres |

La dirección que se comparte es `https://yodesarrollomx.github.io/potenciales-yod/visor.html#l=` seguida
de la liga. **Quien la tenga ve el plan**: si se reenvió de más, se apaga ese renglón y se da otra.

**Un plan y su caso del PPP de siempre.** Para que un caso guardado del PPP abra la ficha de su plan,
en la hoja `Planes` del vivero se pone, en la columna `caso_ppp` del renglón del plan, el identificador
del caso (`caso_id` de su hoja en el libro del PPP). Tarda hasta dos minutos en notarse. Los planes sin
caso salen en la portada del PPP en el grupo «Planes con libro».

**Fotos de casos del PPP de siempre** (renglón de `Config`, una sola vez): clave `potenciales_id`,
valor = el id del libro «YOD - POTENCIALES» (el de su dirección, entre `/d/` y `/edit`). Ese libro lleva
la pestaña `PPP_VISOR` (ver `docs/ppp2.md`, «Fotos de casos del PPP de siempre»; para que Dirección
pueda escoger «la buena» desde el visor debe traer las columnas `elegida`, `elegida_por`,
`elegida_fecha` y `orden`), y la cuenta que ejecuta
el servidor debe poder abrirlo. Sin el renglón o sin la pestaña, una liga `ppp:…` responde «sin plan» y
lo demás sigue igual. En `Ligas`, el `plan_id` de una foto es `ppp:<caso_id>` o
`ppp:<caso_id>:<escenario_id>`; puede ir en la misma liga que planes con libro. Un cambio en `Config`
tarda hasta dos minutos en notarse; una foto nueva, unos segundos.

**Las marcas del pie** (renglones opcionales de `Config`):

| clave | valor | qué hace |
|---|---|---|
| `visor_marcas` | nombres separados por `|` (hasta cuatro) | pinta esos nombres al pie del visor |
| `visor_logos` | el id en Drive de la imagen de cada marca, en el mismo orden, separados por `|` | pinta el logo en vez del nombre |

Cada logo: PNG, JPG, WebP o SVG de hasta 60 KB, en el Drive de la cuenta que ejecuta el servidor (no
hace falta compartirlo con nadie: el servidor lo lee y lo manda dentro de la respuesta). Un cambio de
logo tarda hasta seis horas en verse; de nombres, dos minutos.

Con `pausa` = `sí` el visor sigue abriendo (sólo lee). Para cerrarlo todo de golpe: apagar los
renglones de `Ligas`.

### Las pestañas del visor: historial y archivos

Las pestañas Historial y Archivos del visor se atienden con `ppp2-historial`, `ppp2-chat`, `ppp2-archivos` y
`ppp2-archivo` (`Visor.gs`, sección «pestañas del visor»; contrato y reglas en `docs/ppp2.md`, «Pestañas del
visor»). Sólo leen: no escriben en ninguna hoja ni en ningún libro, y en Drive no cambian ningún permiso ni
hacen nada público. No piden autorización nueva: usan los mismos permisos de siempre (hojas, Drive y llamadas
externas). Sin lo de abajo, el visor sigue igual y esas pestañas salen vacías.

**Lo que hay que agregar antes de publicar (una sola vez):**

1. `Config` del vivero: renglón nuevo con clave `historial_id` y, de valor, el id de la hoja de historial (el de
   su dirección, entre `/d/` y `/edit`). La cuenta que ejecuta el servidor debe poder abrirla. Un cambio en
   `Config` tarda hasta dos minutos en notarse.
2. `Ligas`: columna nueva `audiencia`. `equipo` = ve todo el historial (también la conversación del grupo y los
   pendientes) y todos los archivos del expediente; en blanco o `externo` = sólo lo marcado para externos y lo
   que esté en «Para compartir». Puede ir en cualquier lugar de la hoja (se lee por encabezado). Las ligas que
   ya existen quedan como `externo` hasta que se les escriba `equipo`.
3. Hoja de historial:
   - `Proyectos`: columnas `planes` (los `plan_id` del proyecto separados por coma: `p2…` o
     `ppp:<caso_id>[:<escenario_id>]`) y `carpeta` (el id o la dirección de la carpeta de Drive del expediente).
   - `Eventos`: columnas `archivos` (ids o direcciones de Drive ligados al evento, separados por coma) y
     `para_externos` (`sí` o vacío).
   - Pestaña nueva `Chat`, con encabezados `id | fecha | hora | quien | texto | adjuntos | adjuntos_ids |
     proyectos | visible | origen` (un renglón por mensaje; `fecha` AAAA-MM-DD, `hora` HH:MM; `proyectos` vacío =
     general de la alianza; `visible` = `no` lo oculta en todo visor).
   - `Pendientes` y `Tipos` se leen como ya están. Lo marcado `solo_direccion` nunca sale.
4. En Drive, dentro de la carpeta de cada expediente, una subcarpeta llamada «Para compartir» (justo abajo de la
   del proyecto; mayúsculas, acentos y un número al frente, como «00 Para compartir», dan igual) con lo que
   puede ver un dueño de terreno. No hace falta compartir ninguna carpeta con nadie: el servidor la lee con la
   cuenta que lo ejecuta. Las subcarpetas pueden llevar número al frente («04 Presentaciones»): el grupo se
   reconoce por la palabra (ver `docs/ppp2.md`, «Pestañas del visor», las raíces de cada grupo). Lo que nadie
   deba ver desde el visor —tampoco el equipo— va en una subcarpeta cuyo nombre lleve «privado», «privada»,
   «restringido», «restringida» o «solo dirección» (a cualquier profundidad): ni ella ni lo de adentro sale en
   Archivos ni se entrega. Ojo con «Privada Residencial…» como nombre de carpeta: también queda fuera.

**Publicar:** pegar `Visor.gs` y `PPP2.gs` (trae las cuatro rutas nuevas en `doGet`) y publicar **Versión
nueva** sobre la implementación de siempre (nunca «Nueva implementación»).

**Comprobar** (son GET de sólo lectura; nunca POST): `…/exec?recurso=ppp2-historial&liga=<liga>` debe traer
`"ok":true` con `audiencia`, `dias` y `versiones`; `…&recurso=ppp2-archivos&liga=<liga>`, `"ok":true` con sus
`grupos`. Con una liga apagada, `"error":"liga"`. Y un archivo de más de 3 MB de esa lista, por partes:
`…&recurso=ppp2-archivo&liga=<liga>&id=<id>&parte=1` debe traer `"ok":true` y `"parte":1`. Las partes de un
archivo así se leen con la API de Drive (GET con la credencial del script); si contestan `"error":"interno"` y un
archivo de menos de 3 MB sí sale, falta activar el servicio avanzado «Drive API» del proyecto (Servicios → Drive
API) y volver a publicar la versión.

**Límites que conviene saber:** cada parte de un archivo pesa hasta 3 MB y un archivo hasta 40 MB (uno más
grande sale en la lista con `vista` = `no` y no se entrega). Docs, Hojas, Presentaciones y Dibujos de Google se
entregan exportados a PDF en cada pedido (Google no exporta los muy grandes). La lista de archivos y el
historial tardan hasta cinco minutos en reflejar un cambio; la primera vez que se pide la lista de una carpeta
grande puede tardar varios segundos (recorre hasta 600 archivos y 200 carpetas en 20 s; si no alcanza, la
lista sale marcada `incompleta`).

## La clave de la API (el consejo y la investigación)

El consejo de planes y la investigación corren en este servidor, por la API de IA. Sin clave, la
página dice que el consejo se convoca en cuanto Dirección la ponga, y «Investigar» deja un pedido.

1. Sacar la clave en la consola de la API: **Anthropic** (console.anthropic.com → API Keys → Create
   Key; sirve para el consejo y para investigar en la web) u **OpenAI** (platform.openai.com → API
   keys; sólo para el consejo). La cuenta de la API debe tener saldo: cobra por uso (siete consultas
   por sesión del consejo; una consulta con hasta cuatro búsquedas por investigación).
2. En el editor del proyecto `PPP 2 · servidor`: **Configuración del proyecto** (el engrane de la
   izquierda) → **Propiedades de la secuencia de comandos** → **Agregar propiedad**.
3. Propiedad: `ANTHROPIC_API_KEY` (u `OPENAI_API_KEY`). Valor: pegar la clave. **Guardar propiedades.**
4. No hace falta publicar otra versión: la clave se lee en cada llamada.

**La clave sólo vive ahí.** Nunca en la página, en este repositorio, en un libro, en `Config` ni en la
bitácora; el servidor no la devuelve ni guarda el texto de error del proveedor. Para quitarla, se borra
la propiedad. Si la API la rechaza (vencida, sin saldo o mal copiada), la página lo dice y no se escribe
nada.

Renglones opcionales de `Config` (no existen hasta que alguien los agrega):

| clave | valor | qué hace |
|---|---|---|
| `consejo` | `no` | apaga el consejo y la investigación por API (la página lo dice) |
| `consejo_latido` | `no` | el latido ya no convoca solo al consejo; el botón sigue |
| `consejo_motor` | `openai` | pide OpenAI primero (si no, va Anthropic) |
| `consejo_modelo` | el nombre del modelo | cambia el modelo del motor de `consejo_motor` |

Quien escriba un voto a mano (en un chat, sin el servidor) debe copiar del `Resumen` del libro
`plan.huella` a `Consejo!H` y `plan.evidencia` a `Consejo!I`; sin la huella el voto no cuenta (ver
`docs/ppp2.md`, «Consejo de planes»). El renglón `revision` de `Config` ya no hace falta: sólo dice
cuándo atiende los pedidos una revisión programada, si alguien la instala.

## Libros creados antes del ciclo (12-nov-2026)

El ciclo necesita en cada libro: la pestaña `Rondas`; la sección «El ciclo del plan» de `Plan`
(filas 27 a 47, con el pie en la 49); las claves nuevas al final de `Resumen` (`plan.defiende`,
`plan.paso`, `v1.huella`…, `plan.evidencia`, `plan.paso_capital`, `plan.consejo_sin_leer`); las
columnas `Huella` y `Evidencia` en `Consejo` (H e I) y `Huella` en `Pruebas` (K); y las fórmulas
nuevas de `Plan!B4:B5` y `Consejo!A2:A3`. La plantilla ya las trae. Un libro anterior se actualiza
copiando esas celdas desde un libro generado con `ppp2/libro/generar.py` (en un libro con coma
decimal las fórmulas se escriben con «;»). Sin ellas el servidor sigue leyendo y escribiendo, pero no
hay ronda: sin `plan.paso` el latido no hace nada y sin `plan.paso_capital` la ronda responde `modelo`.

**Lo que ya había deja de contar si no se sella.** Las pruebas y los votos anteriores al ciclo no
traen huella: al poner al día el libro, el plan vuelve a `probar` y, si era árbol, **regresa a
plántula** hasta que se pruebe y el consejo se reúna otra vez. Para conservarlos, al migrar se copia
la huella de la versión (`Resumen!v2.huella`, la que corresponda) en la columna K de las filas de su
última corrida de `Pruebas` y en la columna H de los votos de su última sesión de `Consejo`, y la
evidencia de hoy (`plan.evidencia`) en la columna I de esos votos. Sólo vale si la versión no cambió
desde entonces.

**Renglones de las pestañas.** Una hoja de Google nace con 1 000 renglones y **no hace falta
agrandarla**. Las fórmulas del ciclo funcionan con cualquier tamaño de hoja y sólo leen los renglones
que la hoja tiene (con más renglones vacíos cada recálculo de la ronda tarda más). El servidor agrega
los que necesita en `Rondas`, `Pruebas`, `Consejo`, `Hallazgos` y `Bitácora`. Quien escriba votos o
hallazgos a mano con la API de Google Sheets **no** puede escribir debajo del último renglón: con 1 000
hay lugar para unas 140 sesiones del consejo. Si `Consejo` o `Hallazgos` se llenan, se agregan renglones
al final de la pestaña («Agregar N filas»).

## Libros creados antes del tope de capital (13-nov-2026)

El tope de capital (1/3 de las ventas, sólo aviso; ver `docs/ppp2.md`, «El tope de capital») necesita
en cada libro, y en la plantilla:

- `Datos!din.capital`: concepto «Tope de capital: 1/3 de las ventas (aviso)» y, en el valor, la fórmula
  de 1/3 del total de `Productos` (columna E, renglón Total), redondeada a dos decimales. Si el libro ya
  tenía la cifra a mano y es la misma, nada cambia de número.
- `Versiones`: al final, después de las comprobaciones, un renglón en blanco, la sección «AVISOS» y el
  renglón `capital_sobre_tope` (capital de la versión menos el tope, nunca menos de cero).
- `Resumen`: al final, `v1.capital_sobre_tope`, `v2.capital_sobre_tope` y `v3.capital_sobre_tope`.

Las fórmulas se copian de un libro generado con `ppp2/libro/generar.py` (con «;» en un libro con coma
decimal). Sin estos renglones el servidor y la página siguen igual: sólo no hay aviso.

## Revertir

Administrar implementaciones → lápiz → elegir la versión anterior → Implementar. Para dejar el
servidor sólo en lectura sin tocar código: `Config!pausa = sí`.

## Pruebas

`node --test tests/ppp2-servidor.test.cjs tests/ppp2-ronda.test.cjs tests/ppp2-consejo.test.cjs tests/ppp2-visor.test.cjs` corre
el servidor real con dobles de Apps Script (y una API de IA de juguete), un libro inventado (`tests/fixtures/ppp2-libro-ejemplo.json`) y las cifras reales que
ese libro da para cada combinación de una ronda (`tests/fixtures/ppp2-rejilla.json`). No hagas POST al
`/exec` de producción para «probar»: escribe en libros reales.

## El Árbol PPP (guardar un plan del árbol como columna del libro Maestro)

Tercer archivo del mismo proyecto: `ArbolPPP.gs` (propuesta `ARBOLPPP`; ver `docs/arbol-ppp.md`). Lee la
definición del árbol de las pestañas `ARBOL_*` del libro «PPP Maestro», guarda un plan del árbol como **una
columna en Borrador** de su hoja `MAESTRO` y lee las columnas que el propio árbol guardó. No toca ningún
libro de plan, ni el visor, ni el latido.

**Nace apagado.** Mientras `Config` no tenga el renglón `arbol` = `sí`, las cuatro rutas responden
`apagado`, nada se lee ni se escribe en el Maestro y la página del PPP no enseña el enlace al árbol.
Publicar el código con el árbol apagado no cambia nada de lo que ya funciona.

**Una sola vez, en este orden:**

1. En el editor del proyecto: «+» junto a Archivos → Secuencia de comandos → nombre `ArbolPPP` → pegar
   `ArbolPPP.gs`. En `Código.gs` va el `PPP2.gs` de este repo (trae las rutas `arbol-…` en `doGet` y
   `doPost`, y `arbol` en la respuesta del vivero). Guardar y publicar **Versión nueva** sobre la
   implementación de siempre, con el método de `yod-portal/docs/agentes/publicar-apps-script.md`
   (leer primero el código vivo; comparar lo guardado con lo desplegado; probar sólo con GET).
2. Comprobar con el árbol todavía apagado: `…/exec?recurso=ppp2-meta` contesta como siempre y
   `…/exec?recurso=arbol-definicion&k=<sesión>` contesta `{"ok":false,"error":"apagado"}`.
3. **Probar en una copia privada del Maestro** antes de apuntar al de verdad: en `Config`, renglones
   `maestro_id` (el id de la copia, el de su dirección entre `/d/` y `/edit`), `maestro_plantilla` (la
   letra de la columna plantilla; por omisión `J`) y `arbol` = `sí`. La cuenta que ejecuta el servidor
   debe poder **editar** ese libro. Desde `arbol-ppp/arbol.html`, con sesión: guardar un plan, abrirlo y
   revisar en la copia la columna nueva, sus fórmulas y el renglón de `CAMBIOS`.
4. Sólo entonces, cambiar `maestro_id` al libro Maestro de verdad. Un cambio en `Config` tarda hasta dos
   minutos en notarse.

**Apagarlo:** `arbol` = `no` (o borrar el renglón). `pausa` = `sí` deja leer y no deja guardar.

Lo que hay que saber:

- **Quién puede:** leer, cualquiera con sesión y el tablero `PT`; guardar, los roles de `roles_editar`.
  El árbol guarda siempre en `Borrador`; volver vigente una columna se hace a mano en el libro.
- **No quita ni inserta columnas ni renglones del libro:** una columna nueva va en la primera columna
  **completamente vacía** (sin valores ni fórmulas) a la derecha de la plantilla. Si no hay, responde
  `sin_columnas` y hay que agregar columnas a mano. En `CAMBIOS` sí agrega un renglón por guardado.
- **No toca columnas hechas a mano ni vigentes:** sólo actualiza una columna que el árbol creó (su
  renglón `I-06` dice «Árbol PPP») y que sigue en Borrador, y sólo si nadie la cambió desde que se
  abrió. Cualquier persona con permiso de editar puede actualizar un borrador del árbol, también el
  de otra persona: queda quién en `I-06` y en `CAMBIOS`.
- **El libro debe traer los renglones `I-01`, `I-04` e `I-06`** sin fórmula en la plantilla; si no,
  responde `sin_identidad` y no escribe.
- **Sin fórmulas nuevas:** la columna se copia de la plantilla; el árbol sólo escribe valores en las
  celdas que no tienen fórmula. Al actualizar escribe sólo las celdas que trae la petición.
- **El id del libro vive sólo en `Config`.** Nunca en el código, el repositorio ni un mensaje.
- **No probado en Google Sheets:** las pruebas del repositorio usan un doble en memoria. Sheets puede
  convertir un texto en número o fecha al escribirlo; por eso el paso 3 no se salta.

Pruebas: `node arbol-ppp/conexion/pruebas-gs.cjs` y `node --test tests/arbol-ppp-servidor.test.cjs`.

## El visor enseña las versiones del Árbol

Va con `Visor.gs`, `ArbolPPP.gs` y `Código.gs` (`PPP2.gs`) de este repo, publicados juntos como **Versión nueva** de la implementación de siempre. Publicarlo no cambia nada mientras no exista la pestaña del paso 1.

1. En el libro «PPP Maestro», crear la pestaña `ARBOL_VISOR` con este encabezado en el renglón 1, en este orden (el mismo de `PPP_VISOR`):
   `caso_id`, `tipo`, `escenario_id`, `escenario_nombre`, `estado`, `elegida`, `elegida_por`, `elegida_fecha`, `orden`, `motor_commit`, `huella_entradas`, `calculado`, `origen`, `conciliacion`, `visor_json`. `visor_json` va al final.
2. Abrir un plan en el Árbol y tocar «Guardar en el libro». La respuesta trae `visor: guardado` y en `ARBOL_VISOR` aparece su renglón; `caso_id` es el nombre del proyecto con el prefijo `arbol-`.
3. En la hoja `Ligas` del vivero, poner `ppp:<caso_id>` en el `plan_id` de la liga de ese proyecto (o dar una liga nueva). Abrir el visor con esa liga.
4. Probar que cambia: mover un dato en el Árbol, guardar sobre la misma versión y ver el cambio en el visor sin recargar.

**Apagarlo:** regresar el `plan_id` de la liga a lo que tenía, o renombrar la pestaña `ARBOL_VISOR`. Los renglones no se borran.

