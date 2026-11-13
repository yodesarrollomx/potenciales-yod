# Potenciales YOD — el board de cálculo de potencial **y EL PORTERO** (la cerradura de todo el tablero)

Lee este archivo completo antes de tocar nada.

> Reordenado y completado el **2026-09-04**: el CLAUDE.md anterior seguía vigente (contratos del board, reglas de oro, URLs) y se conserva; se le agregó el capítulo del Portero, las decisiones fechadas y los pendientes.

## Qué es

Dos cosas en un mismo repo:

1. **El board de Potenciales** — calculadora de potencial de desarrollos, sheet-driven. Cinco motores vivos: VERTICAL (`mixto.html`), MACROLOTES (`macrolotes.html`), UNIFAMILIAR (`unifamiliar.html`), RESIDENCIAL (`residencial.html`), PATRIMONIAL (`patrimonial.html`), más portal (`index.html`) y mapa (`mapa.html`). Lo usan Alejandro y el equipo YoDesarrollo.
2. **EL PORTERO** (`portero.js`) — la cerradura compartida de **todos** los tableros YOD. No es un archivo de este board: otros repos lo cargan por URL absoluta (`yodesarrollo-board/index.html`, los 5 HTML de `real-miramar-board/` y otros tableros traen `src="https://yodesarrollomx.github.io/potenciales-yod/portero.js"`). Trae además el tema claro/oscuro de todos los boards (bloque «TEMA CLARO / OSCURO» de `portero.js`, hasta el final del archivo).

**Dirección en vivo (curl, 2026-09-04):** `https://yodesarrollomx.github.io/potenciales-yod/` → **200** (casa canónica) · `/portero.js` → **200** · `/accesos.html` → **200** · `https://alexpueblag.github.io/potenciales-yod/` → **200** (cascarón viejo, sigue respondiendo) · `https://tableros.yodesarrollo.mx/potenciales-yod/` → **000, no resuelve** (el DNS del dominio propio no existe todavía).

## Reglas INVIOLABLES

1. **Nunca crear implementación nueva del Apps Script.** Editor → Implementar → Administrar → lápiz → *Nueva versión*. Una nueva cambia la URL `/exec` y rompe TODOS los tableros a la vez, más los `?open=` ya enviados por correo. Ya pasó: 2026-07-12, implementación archivada e irrecuperable (`653795e`).
2. **`portero.js` no es de este board: es de todos.** Se despliega desde este repo y al instante lo cargan Miramar, yodesarrollo-board y los demás tableros que lo usan. Romperlo deja al equipo fuera de todo.
3. **El HTML público no lleva secretos.** La clave vive en la hoja `CONFIG` (servidor); el `client_id` de Google sí es público por diseño (`Code.gs:36`). Verificado: sin `k`, `?recurso=lista` → `{"ok":false,"error":"clave"}`.
4. **Un relevo de emergencia jamás se persiste como destino.** El original va primero en cada llamada; el respaldo solo si aquel falla ahí mismo (`portero.js:16-24`). Persistirlo causó el "pagué Workspace y ya no entra" ([[google-workspace-reactivado-16ago]]).
5. **Nunca se borra una fila del Sheet.** Archivar = `archivado:"si"` (`Code.gs:12`); las pruebas van con `source='test'` y se archivan.
6. **La liga del correo no puede apuntar fuera del sitio.** `destinoSeguro_` (`Code.gs:409-422`) tiene allowlist de 3 bases; quitarla = phishing con token real.
7. **Deploy del front: editar → commit → push → Ctrl+Shift+R.** Nunca publicar desde clones viejos.
8. **No mandar POST al `/exec` para "probar":** escribe filas, manda correos y quema cuota de `MailApp`. Los GET (`meta`, `canje`, `activar`) sí son seguros.

## Archivos

- `portero.js` (~450 líneas) — la cerradura. Canje de liga, gate, bitácora, engrane de admin y tema. Desde la Fase 1 (30-oct-2026), si la página cargó `YodCargador` el canje sale del cargador (uno solo por página, compartido con `shell.js` y la cabina) y la bitácora lleva además los códigos de telemetría del cargador; sin él, o con `?cargador=legacy`, es el GET de siempre.
- **El cargador compartido no vive aquí**: es `https://yodesarrollomx.github.io/yod-portal/os/yod-cargador.js` (familia `marco` de `versiones.json`), cargado en el `<head>` de los 8 HTML justo después de `yod-acceso.js`. Con él activo, la **primera** lectura de `recurso=lista` de cada motor y las listas de `ppp-catalog.js` van caché-primero («pinta lo último conocido, refresca en fondo»); `caso`, `catalogo`, modelo, recibos y guardados siguen por `fetch`. Contrato y propuesta: `CHG-CARGADOR-FASE1-001` en el atlas de yod-portal. Interruptor de reversión sin código: `?cargador=legacy` o `localStorage.yodcg_legacy='1'`. **Entrega 2 (31-oct-2026, `CHG-CARGADOR-FASE1-002`):** cuando un motor o la portada cierran la sesión por un rechazo de credencial, con el cargador activo lo hacen con `YodCargador.sesion.cerrar({token, motivo})` (borra la llave sólo si sigue siendo el token rechazado y purga las copias); sin cargador queda el borrado literal de siempre. `tests/ppp-paridad-cargador-browser.cjs` vigila que los 5 motores den las mismas cifras con y sin cargador.
- `accesos.html` — board de admin: alta/revocación de usuarios y **matriz de permisos por tablero**.
  El botón de la línea 116 abre la hoja ACCESOS (`docs.google.com/spreadsheets/d/1Ld2ytzwYniIXmxu_TuLViN4hPILSg-xMbFpFgPnqf7Y`).
- `index.html` — portal con mapa; redirige los `?open=ID` viejos al board que toca (líneas 12-14).
- `mapa.html`, `macrolotes.html`, `mixto.html`, `unifamiliar.html`, `residencial.html`,
  `patrimonial.html` — los motores. Todos cierran con `<script src="portero.js?v=…">` (el `?v=` lo fija `versiones.json`).
- `ppp-cadena.js` + `ppp-cadena.css` (+ `fonts/`) — el **diagrama en cadena** que va arriba de cada Plan de Potencial (hoy sólo en `mixto.html`): Se vende → Entra y sale → En el banco y prestado → Lo que queda. Sólo presentación: recibe el estado ya confirmado al final de `render()`, no calcula, no usa red ni almacenamiento; sus botones son las versiones del caso. Para instalarlo en otro motor se agrega un adaptador; contrato en `docs/ppp-cadena.md` (`CHG-PPP-CADENA-20261111`).
- `gas/Code.gs` — el backend. **NO está en el repo público** (`.gitignore` excluye `gas/`).
- `gas/parches/2026-09-02-canje-cache.gs` — el parche de caché del canje, ya integrado en Code.gs.
- `.claude/launch.json` — server local `potenciales`, puerto 8765.
- `versiones.json` + `scripts/versiones.cjs` — una sola etiqueta `?v=` por familia: `propia` = archivos de ESTE repo (`portero.js`, `ppp-*`, `modelos.js`…); `marco` = archivos de yod-portal (`os/shell.js`, `os/shell.css`, `os/yod-acceso.js`…).
  **Para cambiar versiones: editar `versiones.json` y correr `node scripts/versiones.cjs --aplicar`; CI falla si una etiqueta no coincide.** Nunca teclear un `?v=` a mano en los HTML.
  Fuera de su alcance: `?v=` armados en JS (p. ej. `portero.js:15` pide `yod-acceso.js?v=1` sólo si la página no lo cargó) y las cargas de `portero.js` desde otros repos por URL absoluta.

## Arquitectura de datos

```
Google Sheet "YOD - POTENCIALES"  (el ID vive en Script Properties, llave SHEET_ID)
  · 1 hoja por tipo: VERTICAL · MACROLOTES · UNIFAMILIAR · RESIDENCIAL · PATRIMONIAL  (1 fila = 1 caso)
  · CONFIG (clave del board, google_client_id) · HISTORIAL · FLUJO · MAPA
  · ACCESOS (correo·nombre·boards·rol·estado·vence) · SESIONES (token·correo·expira·revocada) · LIGAS · BITACORA
        │
        ▼   Apps Script — UN SOLO /exec, scriptId 115k1wTxnEdPaPyAVqDo9-N2mAhS5d50eoQT9W83nxrXe99EfPhwpC_dw
   ORIGINAL:  https://script.google.com/macros/s/AKfycbwlDDCWWzOWYZsUpBU9uqsQ7aenQ469PF6s6FkNlBFS1_cJSU5njG9oQmuyELy5zlqzFg/exec
              → 2026-09-04, con `?recurso=meta`: {"ok":true,"pong":true,"schema":1}  (HTTP 200)
              (el /exec pelado contesta {"ok":false,"error":"clave"} — eso NO es que esté caído)
   RESPALDO:  https://script.google.com/macros/s/AKfycbyrhqMb70Qh8BljAOYnSYBZ8IXUuEclFWPg10NWIv3GJ-nAR597OTsGB4IL-xyUl7Ms/exec
              → 2026-09-04, con `?recurso=meta`: {"ok":true,"pong":true,"portero":"respaldo"}  (HTTP 200)
              (el /exec pelado contesta {"ok":false,"error":"admin"})
        │
        ├─ GET  ?recurso=meta|canje|activar            (sin credencial)
        ├─ GET  ?recurso=lista|caso|flujo|mapa|track|catalogo|accesos-lista|cm   (exigen k)
        └─ POST text/plain JSON (sin preflight): guardar|estado|archivar|pin|trackitem|bitacora
                                                 acceso-solicitar|acceso-google (sin k)
                                                 acceso-alta|acceso-revocar|sesion-crear (solo admin)
        │
        ▼
   portero.js  ──inyecta gate + bitácora + tema──▶  los 8 HTML de este repo
                                                 +  yodesarrollo-board · real-miramar-board · otros tableros
```

> ⚠ **El repo es ESPEJO: lo que corre es lo pegado en el editor de Apps Script.** `gas/Code.gs` ni
> siquiera se sube al repo público (`.gitignore`). Un cambio local no existe hasta que se pega/pushea
> al editor **y** se actualiza la implementación existente. Antes de tocar el .gs, pide el Code.gs
> vivo del editor ([[backend-vivo-no-es-el-repo]]).

> **9-sep-2026 · sincronizado y desplegado.** La copia local `gas/Code.gs` estaba
> **23 líneas atrás** del backend real: le faltaban los dos arreglos del 4-sep
> (boards en blanco = sin acceso, y `AL/TM/TC` para que `TA` dejara de nombrar
> dos cosas). Ya está al día. Y se desplegaron dos versiones que cierran las dos
> mitades del mismo agujero: la **48** deja de escribir `'*'` cuando un alta
> viene sin boards, y la **49** deja de *reportar* `'*'` cuando la fila está en
> blanco — esta última era la que mordía: la matriz pintaba «Todo» palomeado
> para alguien sin ningún tablero y al siguiente clic se lo escribía de verdad.
> **Vive la 49**, sobre la misma implementación `…zlqzFg` (la URL no cambió).
> Verificado en vivo. El detalle y cómo revertir, en `gas/DESPLIEGUE.md`.

### Contrato del board (lo que ya decía este archivo, conservado)

Upsert **por `caso_id`**, no por credenciales. La `palabra` es única entre casos vivos; repetirla → `palabra_ocupada`. Columnas leídas por encabezado y auto-sanadas: agregar columnas en el Sheet nunca rompe; las variables del motor son columnas `in*` editables directo en Sheets. Versiones del mismo caso (comparador, en los 5 boards): `doPost tipo=guardar` acepta `escenarios` (máx 8) → columna `escenarios_json`; las columnas `in*` guardan la versión ACTIVA. `request_id` da idempotencia de 6 h. El correo (MailApp) manda la palabra + `?open=CASO_ID`; ese enlace **nunca** devuelve la clave del board. Un tipo nuevo (p. ej. LOGISTICO) = hoja nueva + entrada en `CFG.HOJAS_TIPO` + motor en el front; la infraestructura se reutiliza tal cual. Respaldo semanal del Sheet a Drive "Potenciales Respaldos" (domingo 3 AM, conserva 8). Preview local: `.claude/launch.json` → server `potenciales`, puerto 8765; sin clave se entra con "Trabajar sin conexión" (no escribe a la nube).

### Contrato del canje (lo delicado)

Tres puertas de entrada, todas terminan en un **token de sesión que viaja como `k`**
(`esCredencialValida_`, `Code.gs:437`, acepta la clave maestra de CONFIG **o** un token vivo de
SESIONES; así ningún board tuvo que cambiar su capa de nube):

| Vía | Cómo entra | Qué pasa |
|---|---|---|
| `?sesion=TOKEN` | liga vieja del correo | se guarda tal cual en `localStorage['pyod_clave_v1']` y se borra de la URL (`portero.js:82-88`) |
| `?liga=TOKEN` | liga de **un solo uso** | `GET ?recurso=activar&liga=…` la canjea por una sesión; la sesión **nunca** viaja en URL; recarga (`portero.js:90-97`) |
| Correo / Google | gate del Portero | `POST acceso-solicitar` (manda la liga) o `POST acceso-google` (valida el `id_token` en `oauth2.googleapis.com/tokeninfo`, exige `aud` == client_id y `email_verified`) |

- Token de sesión: prefijo **`sy`**, ≥20 chars, `Utilities.getUuid()`, dura **90 días** (`CFG.SESION_DIAS`).
- Token de liga: prefijo **`lg`**, dura **30 minutos**, columna `usada` → un solo uso (`activarLiga_`, `Code.gs:499`).
- `GET ?recurso=canje&t=TOKEN[&board=CODE]` devuelve `{ok, token, rol, boards, nombre, correo}` — es
  lo que `portero.js` usa para decidir si pinta el engrane ⚙️ de admin. **El servidor sigue validando
  todo**: el rol del front no autoriza nada.
- **Caché del canje: 10 minutos** (`CANJE_CACHE_S`, parche 2026-09-02). Consecuencia real: revocar a
  alguien o cambiarle boards **tarda hasta 10 min en surtir efecto**, salvo que se llame
  `invalidarCanje_(token)`.
- Verificado en vivo 2026-09-04: `?recurso=canje&t=zzz` → `{"ok":false,"error":"liga"}`;
  `?recurso=activar&liga=lgzzz…` → `{"ok":false,"error":"liga"}` (si `activar` no estuviera
  desplegado la respuesta sería `error:"clave"`, así que **la liga de un solo uso SÍ está en vivo**).

### Códigos de tablero — son DOS juegos distintos, no los confundas

**(a) Código de página, solo para la bitácora** (`portero.js:76-79`), sale del nombre del archivo:
`index→PT · mapa→MP · macrolotes→MA · mixto→MX · unifamiliar→UN · residencial→RE · patrimonial→PA ·
track-alysa→TA · track-maria→TM · track-codesarrollos→TC · accesos→AC`; dentro de
`real-miramar-board`: `index→MR · tramites→MT · direccion→MD · evidencia→ME · cuentas→MC`.
Cualquier otra página = sus 2 primeras letras en mayúscula.

**(b) Código de permiso**, el campo `boards` de la hoja ACCESOS: `*` (todo) o CSV. La matriz de
`accesos.html:208` dibuja 9: `PT` Potenciales · `CO` Codesarrollos · `RM` Miramar · `TA` Operación ·
`FL` Flujo · `IN` Interiores · `IV` Inversión · `MK` Métricas · `OB` Obra. El backend además compara
contra `MA,MX,UN,RE,PA,MP,TM,AL,AC` (`boardPermitido_`, `Code.gs:461`; `BOARD_DE_TIPO`, `Code.gs:460`).
**La matriz conserva los códigos que no dibuja** (`data-boards` + `conservar`) — si eso se rompe,
vuelve el bug de "el permiso se pone y se quita solo" ([[accesos-matriz-borraba-permisos]]).

### Banderas del `<script>` del Portero
- `data-singate` → no pone gate (páginas públicas).
- `data-gate="suave"` → el board tiene gate propio; el Portero no tapa, solo inyecta el botón
  "Entrar con mi correo" dentro de ese gate (`portero.js:236`).

## Decisiones

- **2026-07-12 · Alejandro/Claude** — Nace el Portero: ligas mágicas por correo, sesiones de 90 días que viajan como clave, gate con salida a WhatsApp, bitácora por usuario y board de accesos (`097ff34`). Porqué: había una sola clave compartida para todos.
- **2026-07-12** — El tema claro/oscuro se mete DENTRO de `portero.js` (`43a9ad5`). Porqué: ese archivo ya lo cargaban todos los boards; evitó tocar 13 HTML.
- **2026-07-12** — Backend reconstruido con **nueva URL /exec**: la implementación de producción fue archivada y quedó irrecuperable (`653795e`). De ahí la regla 1.
- **2026-07-14** — Login de Google pasa a GSI `id_token` (`e77d0af`) y todo va con `credentials:'omit'` (`eaa5787`). Porqué: `redirect_uri_mismatch` y ciclo de recargas.
- **2026-07-14** — `accesos.html` apunta a la hoja ACCESOS de **YOD-Potenciales**, no a Control Maestro (`2063047`); ese solo es catálogo de tableros.
- **2026-07-21** — Liga de **un solo uso** `?liga=`, aditiva (`07b7f8f`). Porqué: la liga vieja ERA la sesión de 90 días viajando en la URL de un correo ([[portero-liga-un-solo-uso]]).
- **2026-08-01** — La matriz deja de borrar los códigos que no dibuja (`c83cd92`) y entra el rol **editor** (`d97ca24`). Porqué: era pérdida real de permisos, no un glitch de UI.
- **2026-08-02** — Gate del Portero a oro-tinta AA `#7d5f1e` (`57a8a10`): 0 fallas WCAG en ambos temas, y el gate sale en todos los boards.
- **2026-08-04** — Relevo automático al respaldo en TODAS las vías, ante cualquier fallo (`0434cba`, `11a91c4`, `2aae65a`, `028b0ab`). Porqué: el dominio de Aurum quedó suspendido y el equipo se quedó fuera.
- **2026-08-16 · Alejandro pagó Workspace** — El ORIGINAL siempre primero y el respaldo **deja de pegarse en localStorage**; se limpia `pyod_portero` al cargar (`8d05a2b`). Porqué: tras reactivar Google los navegadores seguían hablándole al respaldo, que no conoce los correos ([[google-workspace-reactivado-16ago]]).
- ~~**2026-08-27** — URLs de tableros a `tableros.yodesarrollo.mx` (`f2cfeec`).~~ **OBSOLETO desde 2026-09-01**: ese dominio no existe en el DNS.
- **2026-09-01** — Mudanza: los tableros viven en `yodesarrollomx.github.io`; la puerta vieja reenvía (`0418e7f`, `a5259e0`). Destino canónico hasta que exista el DNS propio.
- **2026-09-02** — Canje con caché de 10 min (`gas/parches/2026-09-02-canje-cache.gs`). Porqué: cada canje hacía 4-6 lecturas al Sheet (3-25 s con Google lento) y SESIONES crece cada semana.

## Pendientes

| Tema | Dueño | Qué evidencia lo cierra |
|---|---|---|
| Orígenes OAuth: `https://yodesarrollomx.github.io` en "Authorized JavaScript origins" del client `920448126277-…`, y pantalla de consentimiento "En producción". El diagnóstico de [[login-google-boards-fix]] es del 15-jul y nombraba el origen **viejo**; con la mudanza del 1-sep hay que reverificar el nuevo. | Alejandro (Google Cloud Console, no por API) | Abrir un board en yodesarrollomx.github.io → "Continuar con Google" → entra sin `GSI_LOGGER FedCM NetworkError` en consola |
| `CFG.SITE_BASE` sigue en `https://alexpueblag.github.io/potenciales-yod/` (`Code.gs:38`), o sea la casa vieja. Es el destino de respaldo de toda liga mágica. | Alejandro decide; Claude ejecuta en el editor | `Code.gs:38` apuntando a yodesarrollomx **y** implementación existente actualizada |
| Código `IV` (Inversión): la matriz lo ofrece pero [[login-google-boards-fix]] reporta que el Portero no lo reconocía y `yodesarrollo-board` canjea con `&board=IV` fijo. | Claude | Un usuario con `boards=IV` abre el board de Inversión y el canje no devuelve `error:"board"` |
| Revocar tarda hasta 10 min por la caché del canje; no hay borrado masivo en CacheService. | Alejandro (¿es aceptable?) | Decisión escrita; si no, llamar `invalidarCanje_(token)` desde `accesoRevocar_` |
| El Portero protege el GAS, **no el Sheet**. Falta reverificar que "YOD - POTENCIALES" siga en 403 anónimo (lo estaba al 28-jul) y que su `/pub` esté apagado. | Claude / [[yod-vigilante]] | Corrida del vigilante con el libro en 403 y `/pub` apagado |

## Por confirmar (no lo afirmes sin preguntar)

- ¿El ID `1Ld2ytzwYniIXmxu_TuLViN4hPILSg-xMbFpFgPnqf7Y` (botón de `accesos.html:116`) es el mismo
  libro "YOD - POTENCIALES" cuyo ID vive en Script Properties? No pude leer Script Properties.
- ¿El respaldo (`AKfycbyrhq…`) está en la cuenta personal de Gmail y sigue siendo el correcto ahora
  que Workspace ya se pagó? Responde `portero:"respaldo"`, pero no sé de qué cuenta cuelga.
- ¿`gas/Code.gs` local es idéntico al pegado en el editor? El repo es espejo y no hay forma de
  saberlo desde aquí — pregunta: "¿me pasas el Code.gs del editor antes de que lo toque?"
- ¿`AL` (Alquimia) sigue siendo un código de permiso vivo? Aparece en el comentario de `Code.gs:459`
  pero no en la matriz de `accesos.html:208`.

## Qué NO hacer

- No renombrar ni mover `portero.js`: hay repos externos que lo cargan por URL absoluta.
- No mandar POST al `/exec` para probar (escribe filas y manda correos reales).
- No poner datos de tratos ni nombres de casos en el HTML público (ya se sacaron una vez, `4248ca9`).
- No crear implementación nueva del Apps Script. Nunca. Ver regla 1.


## 30-sep-2026 · Contrato autorizado de cálculo nativo en Sheets

Dirección exige que **datos y fórmulas vivan en Sheets**. El tablero leerá los resultados calculados y escribirá las mismas cantidades editables; no debe tener un motor financiero paralelo en JavaScript o Apps Script. Las fórmulas se protegen para la cuenta propietaria y las modificaciones de AI autorizada se auditan. Leer **ARQUITECTURA-SHEETS.md** antes de tocar los motores o su backend.

**Estado real:** los cinco HTML todavía calculan con computar(); la migración no está implementada. El commit 9b88384 amplió inventario documental y no trasladó las fórmulas. El contrato, antes/ahora/futuro y pendientes están registrados en **PPP_Arquitectura** y **PPP_Cambios** del Control Maestro; se corrigió la descripción histórica de SYS-POTENCIALES. Toda nueva escritura debe registrar actor, revisión base, antes/después, fuente, validación y siguiente paso, sin sobrescribir trabajo concurrente. No publicar datos privados en Git.


## 11-nov-2026 · Grafo del sistema en Accesos

Al final de `accesos.html` (sólo admin) vive el grafo de YOD OS con sus controles. Detalle completo en **docs/grafo.md**; propuesta `CHG-GRAFO-ACCESOS-20261111`.

- **`grafo/` es generado: no se edita a mano.** Sale de `grafo-motor/datos/base.json`; tras tocar el motor se regenera con `python3 grafo-motor/rehacer.py inicial`. CI comprueba que lo publicado es lo que genera la base.
- **Ningún flujo escribe en la rama principal.** Un grafo rehecho queda en la rama `grafo-borrador` con su PR: fusionarlo es aprobar; abierto es borrador; cerrarlo lo descarta. Lo vivo (estado, registro, aviso de borrador) va en la rama de datos `grafo-datos`. **Aprobar es un toque con la App del grafo (instalada desde el 13-nov-2026) y dos sin ella** (DEC-21). Sin App, el flujo abre el PR con su credencial y GitHub deja sus pruebas en espera hasta que una persona toca «Approve workflows to run»; después, «Merge pull request» (visto en vivo el 12-nov-2026, PR 66). Con los secretos `GRAFO_APP_ID` y `GRAFO_APP_PRIVATE_KEY`, la rama y el PR del borrador los mueve la App (sólo eso), las pruebas corren solas y basta «Merge pull request» (comprobado en vivo el 13-nov-2026, PR 97; la App es «YOD Grafo borrador», instalada sólo en este repositorio); sin ellos todo vuelve a los dos toques. Lo que el propio grafo escribe aquí (`grafo/`, `grafo-motor/datos/` y el `architecture-impact.json` de cada borrador) no cuenta como «el sistema cambió».
- **Las claves de IA del grafo son sólo secretos de Actions** (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`). Nunca en una página, archivo o registro. Sin claves el grafo se rehace igual. (PPP 2 tiene su propia regla para la clave de su servidor: ver «PPP 2» abajo.)
- **Repo público:** lo de `grafo/` lo abre cualquiera con la liga. Dirección eligió publicar la versión completa (identificadores y pestañas de hojas, y el plan propuesto por tablero). **Nunca** debe llevar repositorios privados ni de clientes externos, hallazgos de seguridad, nombres de personas, folios o nombres de tratos, correos, claves ni identificadores completos de `/exec`; la prueba `LoPublicado` lo vigila. Desde el 12-nov-2026 (DEC-19) tampoco refleja sistemas hechos para otros clientes, aunque el atlas y `yod-portal` publiquen su descripción saneada: la regla `excluir` de `grafo-motor/datos/reglas.json` los saca en cada refresco y una prueba lo vigila; ver `docs/grafo.md`.
- **Las presentaciones leen el grafo aprobado** (`grafo/versiones.json` y `grafo/datos/<id>.json`). Cambiar `grafo-motor/recetas.json` cambia lo que cuentan; las recetas no llevan cifras.
- **Dónde se pinta un error:** en el repositorio donde pasó y en los tableros que viven en él (`grafo/mapa-ids.json`); no en sus vecinos de fila. Comprobado en vivo el 12-nov-2026: rehacer a pedido, el PR del borrador abierto por el flujo, aprobar (los dos toques, sin App) y descartar; el detalle, en `docs/grafo.md`, «Comprobado en producción».
- Pruebas: `python -m unittest discover -s grafo-motor/pruebas -p 'prueba_*.py'` y `node --test tests/grafo-estado.test.cjs tests/grafo-control.test.cjs`.


## 12-nov-2026 · PPP 2, el vivero de planes (`CHG-PPP2-20261112`)

Portal **aparte** del PPP actual: `ppp2.html` + `ppp2.js` + `ppp2.css`, servidor en `server/ppp2/`, plantilla en `ppp2/libro/`. Detalle en **docs/ppp2.md**. No toca los motores, `portero.js`, `accesos.html` ni el Apps Script del Portero.

- **El plan es el autón.** No hay un agente aparte: el plan es su libro, su página, sus documentos y sus herramientas; a veces se habla con él por texto o por voz. La página habla en primera persona y ningún texto nombra a un «autón» como si fuera otro (lo vigila `tests/ppp2-browser.cjs`).
- **El cálculo vive en el libro de cada plan** (Google Sheets, plantilla `ppp2-libro-v1`): tres versiones con el mismo motor de flujo, revisión para fondos, reparto, preguntas, candados, hallazgos, consejo, pruebas, rondas y bitácora. La edad (semilla → plántula → árbol → flor → fruto), **el siguiente paso del plan** (`Resumen!plan.paso`) y hasta el paso de capital de la ronda (`plan.paso_capital`) los calcula el libro. **Nunca** escribir fórmulas financieras en `ppp2.js` ni en `PPP2.gs`.
- **El plan itera (la ronda).** Cuando el consejo regresa una versión —o la que defiende no pasa la revisión para fondos— el servidor mueve capital y arranque de obra en una versión de trabajo, el libro recalcula cada combinación y el plan **propone sólo lo que pasa la revisión**, con un criterio fijo y escrito (`RONDA` y `ronda_` en `PPP2.gs`; explicado en docs/ppp2.md). Nunca toca la base ni la vigente, **ni escribe encima del trabajo de una persona si nadie se lo presta** (`lugarRonda_`); una propuesta del plan a la que alguien le movió una palanca ya es trabajo de esa persona (`delPlan_`). Antes de anotar una propuesta la vuelve a leer del libro. Si no hay mejora, no propone. `latido` (activador por tiempo) lo hace solo; se apaga con `Config!pausa = sí` o con el renglón `latido` = `no` en `Config`. **El latido nunca aprueba, nunca vuelve vigente nada y nunca se presta una versión.**
- **La huella y la evidencia.** Cada versión tiene una huella que cambia si cambian sus números. Pruebas, votos del consejo y rondas guardan la huella de lo que tocaron: si la versión cambia, dejan de contar. Quien escriba un voto del consejo copia del Resumen `plan.huella` a `Consejo!H` y `plan.evidencia` a `Consejo!I`; una sesión vale sólo con los siete votos y con nombre nuevo (`CP-n`).
- **LibreOffice no es Google Sheets.** Los accesorios de pruebas los calcula LibreOffice; los libros viven en Google Sheets. Quien cambie fórmulas del ciclo las comprueba además en un libro de Google Sheets antes de publicar (ya mordió: `ROW(rango)` de un rango que se sale de la hoja da `#N/A` en Sheets y no en LibreOffice; ver `ppp2/libro/README.md`).
- **El libro usa «;» en sus fórmulas** (coma decimal). El servidor nunca escribe una fórmula armada con comas: copia la que ya había (`getFormula` → `setFormula`) o usa `copyTo`. Ya rompió una corrida real (12-nov-2026). Quien escriba fórmulas por la API en un libro así las escribe con «;» y sin matrices entre llaves.
- **Servidor:** Apps Script «PPP 2 · servidor», ligado a la hoja «PPP 2 · Vivero (registro)» de la carpeta «PPP 2 · Vivero» del Drive de Dirección. Su primera implementación fue «Nueva implementación» por ser proyecto nuevo; **de aquí en adelante siempre «Nueva versión» sobre la misma** (cambiar la URL deja a `ppp2.js` sin servidor). La URL vive en `ENDPOINT` de `ppp2.js`. Instalación, latido y reversión: `server/ppp2/INSTALAR.md`. Sólo lectura sin tocar código: hoja `Config`, `pausa = sí`.
- **Permisos:** el servidor canjea la sesión con el Portero (`board=PT`). `admin` aprueba versiones; `admin` y `editor` capturan, corren rondas y le prestan una versión al plan; quien tiene `PT` lee. La página nunca borra `pyod_clave_v1`.
- **El consejo y la investigación corren en el servidor, por la API de IA** (12-nov-2026, Dirección: «hazlo vía en línea… un botón conectado a las APIs», sin depender de chats ni suscripciones). Botón «Convocar al consejo» (y el latido, cuando el libro dice `consejo`), «Investigar» y «Investigar lo que falta» (búsqueda en la web por Anthropic). Una sesión se escribe sólo con los siete votos válidos y si el libro no cambió mientras votaban; un hallazgo se anota sólo si su fuente salió de la búsqueda. **La clave vive sólo en las propiedades del script del servidor PPP 2** (`ANTHROPIC_API_KEY` u `OPENAI_API_KEY`), la pone Dirección: es la excepción, para PPP 2, a «claves de IA sólo como secretos de Actions» (así el expediente de un plan no pasa por un repositorio público). Nunca en la página, el repo, un libro, `Config` ni la bitácora. Cobra por uso. Detalle en docs/ppp2.md, «El consejo y la investigación, por API».
- **Repo público:** ni nombres de planes, ni cifras, ni IDs de libros en código, pruebas, docs, mensajes de commit, descripciones de PR ni `architecture-impact.json`. El plan de `ppp2/libro/ejemplo-plan.json` y sus accesorios son inventados; los datos de planes reales viven fuera del repo.
- **Pruebas:** `node --test tests/ppp2-servidor.test.cjs tests/ppp2-ronda.test.cjs tests/ppp2-libro.test.cjs tests/ppp2-consejo.test.cjs` y `node tests/ppp2-browser.cjs` (corren en `verificar-ppp.yml`). Los accesorios salen de una hoja de cálculo real: **si tocas `ppp2/libro/`, corre `python3 ppp2/libro/regenerar.py`** (necesita LibreOffice); si no, `tests/ppp2-libro.test.cjs` falla.
- **Menú:** «PPP 2» en `yod-portal/os/catalogo.js` (código `PT`, después de Mercado).
