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

1. Pegar el `PPP2.gs` nuevo en el editor y guardar.
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

## Revertir

Administrar implementaciones → lápiz → elegir la versión anterior → Implementar. Para dejar el
servidor sólo en lectura sin tocar código: `Config!pausa = sí`.

## Pruebas

`node --test tests/ppp2-servidor.test.cjs tests/ppp2-ronda.test.cjs tests/ppp2-consejo.test.cjs` corre
el servidor real con dobles de Apps Script (y una API de IA de juguete), un libro inventado (`tests/fixtures/ppp2-libro-ejemplo.json`) y las cifras reales que
ese libro da para cada combinación de una ronda (`tests/fixtures/ppp2-rejilla.json`). No hagas POST al
`/exec` de producción para «probar»: escribe en libros reales.
