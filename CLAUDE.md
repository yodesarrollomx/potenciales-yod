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
  · ACCESOS (correo·nombre·boards·rol·estado·vence·notas·ts_alta·proyectos) · SESIONES (token·correo·expira·revocada) · LIGAS · BITACORA
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
> al editor **y** se actualiza la implementación existente. Antes de tocar el .gs, lee el código
> vivo ([[backend-vivo-no-es-el-repo]]): desde el 13-nov-2026 ya no se le pide a Alejandro, se exporta
> por Drive y se publica desde su Chrome con el método de yod-portal `docs/agentes/publicar-apps-script.md`
> (Buzón: Guías G37, regla 27).

> **13-nov-2026 · vive la 111**, sobre la misma implementación `…zlqzFg`. La **110** suma la cartera
> del folio (`Cartera.gs` y `?recurso=cartera`, sólo lectura) y la **111** las puertas por proyecto:
> ACCESOS gana la columna `proyectos` (folios PRJ en CSV; `*` = todos; en blanco, el equipo ve todo y
> un externo —sin ningún tablero interno— no ve ninguno), Accesos la escribe con `acceso-alta`
> (validada en `Cartera.gs`: un folio mal escrito no se guarda) y `accesos-lista` la devuelve. Las
> publicó Claude desde el Chrome de Dirección. Lo guardado en el editor trae además `HermesAccess.gs`
> y su línea de ruta, de otro agente y sin visto bueno para publicarse: se quitó la línea para ambas
> versiones (el archivo viaja inerte) y sigue en el editor tal cual.

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
- ¿`gas/Code.gs` local es idéntico al pegado en el editor? Ya se puede saber sin preguntar: el
  proyecto se exporta por Drive (`application/vnd.google-apps.script+json`) y se compara archivo por
  archivo (método G37). La copia local no se ha resincronizado desde el 9-sep.
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
- **El cálculo vive en el libro de cada plan** (Google Sheets, plantilla `ppp2-libro-v2` desde el 15-nov-2026; los libros sembrados antes siguen en `v1` y el servidor lee los dos): tres versiones con el mismo motor de flujo, revisión para fondos, reparto, preguntas, candados, hallazgos, consejo, pruebas, rondas y bitácora. La edad (semilla → plántula → árbol → flor → fruto), **el siguiente paso del plan** (`Resumen!plan.paso`) y hasta el paso de capital de la ronda (`plan.paso_capital`) los calcula el libro. **Nunca** escribir fórmulas financieras en `ppp2.js` ni en `PPP2.gs`.
- **El plan itera (la ronda).** Cuando el consejo regresa una versión —o la que defiende no pasa la revisión para fondos— el servidor mueve capital y arranque de obra en una versión de trabajo, el libro recalcula cada combinación y el plan **propone sólo lo que pasa la revisión**, con un criterio fijo y escrito (`RONDA` y `ronda_` en `PPP2.gs`; explicado en docs/ppp2.md). Nunca toca la base ni la vigente, **ni escribe encima del trabajo de una persona si nadie se lo presta** (`lugarRonda_`); una propuesta del plan a la que alguien le movió una palanca ya es trabajo de esa persona (`delPlan_`). Antes de anotar una propuesta la vuelve a leer del libro. Si no hay mejora, no propone. `latido` (activador por tiempo) lo hace solo; se apaga con `Config!pausa = sí` o con el renglón `latido` = `no` en `Config`. **El latido nunca aprueba, nunca vuelve vigente nada y nunca se presta una versión.**
- **La huella y la evidencia.** Cada versión tiene una huella que cambia si cambian sus números. Pruebas, votos del consejo y rondas guardan la huella de lo que tocaron: si la versión cambia, dejan de contar. Quien escriba un voto del consejo copia del Resumen `plan.huella` a `Consejo!H` y `plan.evidencia` a `Consejo!I`; una sesión vale sólo con los siete votos y con nombre nuevo (`CP-n`).
- **LibreOffice no es Google Sheets.** Los accesorios de pruebas los calcula LibreOffice; los libros viven en Google Sheets. Quien cambie fórmulas del ciclo las comprueba además en un libro de Google Sheets antes de publicar (ya mordió: `ROW(rango)` de un rango que se sale de la hoja da `#N/A` en Sheets y no en LibreOffice; ver `ppp2/libro/README.md`).
- **El libro usa «;» en sus fórmulas** (coma decimal). El servidor nunca escribe una fórmula armada con comas: copia la que ya había (`getFormula` → `setFormula`) o usa `copyTo`. Ya rompió una corrida real (12-nov-2026). Quien escriba fórmulas por la API en un libro así las escribe con «;» y sin matrices entre llaves.
- **Servidor:** Apps Script «PPP 2 · servidor», ligado a la hoja «PPP 2 · Vivero (registro)» de la carpeta «PPP 2 · Vivero» del Drive de Dirección. Su primera implementación fue «Nueva implementación» por ser proyecto nuevo; **de aquí en adelante siempre «Nueva versión» sobre la misma** (cambiar la URL deja a `ppp2.js` sin servidor). La URL vive en `ENDPOINT` de `ppp2.js`. Instalación, latido y reversión: `server/ppp2/INSTALAR.md`. Sólo lectura sin tocar código: hoja `Config`, `pausa = sí`.
- **Permisos:** el servidor canjea la sesión con el Portero (`board=PT`). `admin` aprueba versiones; `admin` y `editor` capturan, corren rondas y le prestan una versión al plan; quien tiene `PT` lee. La página nunca borra `pyod_clave_v1`.
- **El consejo y la investigación corren en el servidor, por la API de IA** (12-nov-2026, Dirección: «hazlo vía en línea… un botón conectado a las APIs», sin depender de chats ni suscripciones). Botón «Convocar al consejo» (y el latido, cuando el libro dice `consejo`), «Investigar» y «Investigar lo que falta» (búsqueda en la web por Anthropic). Una sesión se escribe sólo con los siete votos válidos y si el libro no cambió mientras votaban; un hallazgo se anota sólo si su fuente salió de la búsqueda. **La clave vive sólo en las propiedades del script del servidor PPP 2** (`ANTHROPIC_API_KEY` u `OPENAI_API_KEY`), la pone Dirección: es la excepción, para PPP 2, a «claves de IA sólo como secretos de Actions» (así el expediente de un plan no pasa por un repositorio público). Nunca en la página, el repo, un libro, `Config` ni la bitácora. Cobra por uso. Detalle en docs/ppp2.md, «El consejo y la investigación, por API».
- **Repo público:** ni nombres de planes, ni cifras, ni IDs de libros en código, pruebas, docs, mensajes de commit, descripciones de PR ni `architecture-impact.json`. El plan de `ppp2/libro/ejemplo-plan.json` y sus accesorios son inventados; los datos de planes reales viven fuera del repo.
- **Abrir rápido** (12-nov-2026): el servidor guarda lo que leyó de cada libro con una llave que cambia en cuanto el libro cambia (última modificación en Drive + un sello que mueve cada renglón de la bitácora); lo que depende de quién abre se calcula en cada llamada; cada escritura responde con el plan ya leído y el latido deja leídos los planes. La página pinta al instante lo último que vio con esa sesión (prefijo `yodcg_cache_v1:ppp2:`, 12 h, como el cargador) y no guarda nada hasta traer lo nuevo. Detalle en docs/ppp2.md, «Abrir rápido».
- **Pruebas:** `node --test tests/ppp2-servidor.test.cjs tests/ppp2-ronda.test.cjs tests/ppp2-libro.test.cjs tests/ppp2-consejo.test.cjs tests/ppp2-cache.test.cjs` y `node tests/ppp2-browser.cjs` (corren en `verificar-ppp.yml`). Los accesorios salen de una hoja de cálculo real: **si tocas `ppp2/libro/`, corre `python3 ppp2/libro/regenerar.py`** (necesita LibreOffice); si no, `tests/ppp2-libro.test.cjs` falla.
- **El visor en vivo** (14-nov-2026): `visor.html#l=<liga>` + `visor.js` + `visor.css`, servidor en `server/ppp2/Visor.gs` (segundo archivo del mismo proyecto de Apps Script; ruta `ppp2-visor` en `doGet`). Una pantalla de sólo lectura para quien **no** tiene sesión del Portero: la liga es la llave y vive en la hoja `Ligas` del vivero (apagarla = cambiar su `estado`). No carga `portero.js` ni el marco, no escribe en ningún libro y **no calcula finanzas**: pinta la versión que el libro muestra (`plan.version_mostrada`) y dice de qué pestaña sale cada cifra; lo que acomoda para dibujar está listado en docs/ppp2.md. Los límites de la revisión que dibuja son los de `revision_formula` (`ppp2/libro/generar.py`): si cambian allá, cambian en `PRUEBAS` de `visor.js` (lo vigila `tests/ppp2-visor-pagina.test.cjs`). Versiones y varios terrenos sólo se escogen si el renglón de la liga los trae. Ni nombres de planes ni de marcas en la página: el pie de marcas sale de `Config` (`visor_marcas`, `visor_logos`). Un plan sin libro puede traer `origen` (las leyendas lo usan) y huecos (cada cuadro cae en «Aún no hay…» / «sin dato», nunca en ceros); detalle en docs/ppp2.md. Con la sesión del Portero en el navegador el visor la manda como `k` (sólo la lee) y, si el servidor manda `elige`, Dirección escoge ahí «la buena» (`POST ppp2-elige`); sondea cada 3 s. Pruebas: `node --test tests/ppp2-visor.test.cjs tests/ppp2-visor-pagina.test.cjs` y `node tests/ppp2-visor-browser.cjs`.
- **Un solo PPP** (14-nov-2026, Dirección: «unifica… mejora el 1 con lo que nos falta del 2»): el PPP de siempre es la entrada y `ppp2.html#/plan/<id>` es **la ficha de los planes con libro**. `ppp-libro.js` (portada y `mixto.html`, sólo lectura, una pregunta a `ppp2-vivero` por página) lista esos planes en la portada y, si un caso guardado ya tiene su plan (columna `caso_ppp` de la hoja `Planes` del vivero: el `caso_id`), lo abre en su ficha; un motor abierto por `?open=` en ese caso lleva a la ficha (`&clasico=1` lo evita). La ficha lleva arriba los mismos siete cuadros del visor (`VisorPPP.monta`, recurso `ppp2-visor` con sesión) y **Compartir visor** (`POST ppp2-liga`: da, apaga y enciende ligas; sólo escribe la hoja `Ligas`). No se teclean cifras de un plan con libro en los motores: el libro es su modelo. Detalle en docs/ppp2.md, «Un solo PPP».
- **La carátula es el visor y cada cuadro trae su lápiz** (15-nov-2026): la ficha es encabezado, versiones, los siete cuadros, el estado de la versión y la voz del plan; lo demás vive en el expediente, cerrado hasta que se pide. Al abrir un cuadro, «Lo que mueve este cuadro» lista sus datos y palancas con lápiz para `admin` y `editor`: dice con qué está ligado cada uno (`ppp2-relaciones.js`, **generado** de las fórmulas de la plantilla por `ppp2/libro/relaciones.py`: no se edita a mano; si tocas `generar.py`, regenéralo), deja probar otra cifra en la columna Prueba del libro sin que nadie más la vea (`POST ppp2-simular`: escribe, lee y regresa; no anota nada) y guardarla en la versión o en los datos, con **Deshacer**. Se engancha a la hoja del cuadro desde `ppp2.js` sin tocar `visor.js`. Detalle en docs/ppp2.md, «La carátula es el visor».
- **La plantilla v2** (15-nov-2026): el programa y la norma viven en el libro (datos de norma, programa, costo de obra por partes y ritmo de ventas; columna «Uso» en Productos) y cada versión calcula cuántas reglas de la norma no cumple y cuáles (`norma_alertas`, `norma_texto`, en la huella). Se quitaron los datos «de la lámina» que no llegaban a ningún resultado. Detalle en docs/ppp2.md, «La plantilla v2 del libro». Pasar un plan a v2 es un libro nuevo; el v1 se queda como estaba.
- **Menú:** «PPP 2» en `yod-portal/os/catalogo.js` (código `PT`, después de Mercado).

## 15-nov-2026 · El visor con los casos del PPP 1 (fotos)

El visor también enseña casos del PPP de siempre, con **fotos** guardadas en la pestaña `PPP_VISOR` de «YOD - POTENCIALES». Hay una foto por versión de cada caso, y la elegida (por omisión, la última) se rotula como vigente. La liga es `ppp:<caso_id>[:<escenario_id>]`. Las calcula el motor real de cada tablero, corrido sin navegador: `scripts/visor-fotos/nucleo.cjs` más un módulo por motor. Es una excepción autorizada al contrato del 30-sep (ver ARQUITECTURA-SHEETS.md). Contrato, columnas, conciliación (0.5 %) y dudas abiertas: **docs/visor-ppp1.md**. Pruebas: `node --test tests/visor-fotos-nucleo.test.cjs`. El ensayo (`node scripts/visor-fotos/nucleo.cjs ensayo <entrada> <salida>`) no usa red y no escribe dentro del repo. Las hojas las escribe un solo agente, con visto bueno de Dirección.

- **Dirección elige «la buena».** Con su sesión (rol de `roles_aprobar`), el visor le enseña el selector de versiones (`elige.versiones`) y `POST ppp2-elige` mueve la columna `elegida` de `PPP_VISOR` (y `elegida_por`, `elegida_fecha`), con renglón en la bitácora del vivero. Es la **única** escritura del visor fuera de la hoja `Ligas`: no toca libros ni motores. Para los planes con libro no aplica (su versión mostrada es la vigente del libro; cambiarla sería aprobar).
- **Pestañas del visor** (Historial y Archivos): `ppp2-historial`, `ppp2-chat`, `ppp2-archivos` y `ppp2-archivo` en `Visor.gs`, por GET, de sólo lectura y con la misma puerta que `ppp2-visor`. Leen la hoja de historial (renglón `historial_id` de `Config`) y las carpetas de Drive de los proyectos del plan. La columna `audiencia` de `Ligas` decide quién ve qué: `equipo` ve todo (conversación del grupo y pendientes incluidos); en blanco = `externo` (sólo eventos `para_externos` y archivos de «Para compartir»). `solo_direccion` nunca sale. Un archivo se entrega sólo si su cadena de carpetas sube a la carpeta de un proyecto de ese plan (revisado en vivo); no se siguen atajos, no salen libros de planes ni hojas del sistema, y **jamás se cambia un permiso de Drive**. Lo que un navegador ejecuta (HTML, SVG, XML, scripts) sale como `application/octet-stream`: la página sólo enseña dentro de sí `vista` = `pdf` o `imagen` y lo demás lo descarga, nunca lo abre en su origen (ahí vive la sesión del Portero). Los pendientes que nacen de un evento `solo_direccion` tampoco salen. Una subcarpeta del expediente cuyo nombre lleve «privado/a», «restringido/a» o «solo dirección» (sin mayúsculas ni acentos, a cualquier profundidad) no sale para nadie, ni lo de adentro: es la válvula de Dirección (`PESTANAS.PRIVADA`). La lista y el historial se guardan cinco minutos; los bytes, nunca. Contrato y columnas: docs/ppp2.md, «Pestañas del visor». Pruebas: `node --test tests/ppp2-pestanas.test.cjs`.
- **Publicar:** `Visor.gs` y `PPP2.gs` van juntos, como «Nueva versión» de la implementación existente de «PPP 2 · servidor». Antes: renglón `potenciales_id` en `Config` del vivero y la pestaña `PPP_VISOR` con sus columnas (ver docs/visor-ppp1.md).
- **Nada vacío y que cuadre** (15-nov-2026): `scripts/visor-fotos/completa.cjs` corre después del módulo de cada motor y llena lo que quedó en `null`: primero lo que el motor sí da y no se había llevado, después lo que se deduce de sus cifras con las definiciones del libro del PPP 2 (revisión para fondos, firmas, flujo acumulado, respaldo, reparto). En macrolotes y residencial, `v.tierra` es el valor de la tierra (se pague o se aporte) y `v.ganancia` la del visor, después de la tierra a su valor; si el motor no la da con ese sentido queda vacía, con su razón en `conciliacion.vacios` (sólo mapeo, ninguna fórmula nueva). Cada deducción va marcada en `visor_json.deducido` y escrita en docs/visor-ppp1.md («Lo que se deduce»); lo que pediría un supuesto no se llena. También evalúa los criterios de Dirección y calcula una «Propuesta de reestructura» (versión nueva, mismo motor, nunca elegida por omisión; el servidor tampoco la sirve por omisión aunque tenga el mayor `orden`). Amplía la excepción del 30-sep (ARQUITECTURA-SHEETS.md). Pruebas: `node --test tests/visor-fotos-completa.test.cjs`.
- **Opciones y comparativo** (15-nov-2026): `visor-comparar.html#l=<liga>` + `visor-compara.js` + `visor-comparar.css` ponen lado a lado todas las opciones de una liga (sus planes y, si la liga lo deja, sus versiones), factor por factor, con la flecha verde en la mejor y la roja sólo donde la diferencia pasa el umbral del factor; «Descargar PDF» imprime en carta horizontal. Sólo GET al mismo `ppp2-visor`, no depende de `visor.js` y **no calcula**: cada factor es una cifra del libro; la tabla de factores (sentido y umbral) vive en `FACTORES` y en docs/ppp2.md, «Opciones y comparativo», y una prueba las compara. El visor lo enlaza desde su pestaña «Opciones» abriendo esa dirección con la misma liga. Pruebas: `node --test tests/visor-compara.test.cjs` y `node tests/visor-compara-browser.cjs`.

## 15-nov-2026 · El visor explica cada cifra: qué es y de qué depende

Al tocar una cifra, la leyenda sigue breve y ofrece «Qué es y de qué depende ›»: abre, dentro de la hoja, el renglón de esa cifra con qué es, cómo se calcula (con las cifras que el servidor ya trae), cómo está hoy, de qué depende, qué la mueve, por qué importa y de dónde sale. Detalle: docs/ppp2.md, «Qué es cada cifra y de qué depende».

- **Los textos** viven en `visor-explica.js` (una entrada por cifra; se corrigen ahí sin tocar la lógica). **«De qué depende» sale del grafo**: `visor-explica-grafo.js` es **generado** por `python3 ppp2/libro/explica.py` (el recorrido de `relaciones.py`, hacia atrás); no se edita a mano y, si cambias `generar.py`, se regenera junto con `ppp2-relaciones.js`. El campo `opera` de cada texto dice qué lee su fórmula: la prueba lo compara con el grafo.
- **Sin cuentas nuevas en `visor.js`**: sólo formatea lo que llega; lo que no viene se dice sin cifra. Los límites son la regla de la revisión para fondos del PPP (la leyenda dice «La revisión pide», nunca «el banco pide»). En una foto del PPP de siempre se dice que la cifra sale del motor de su tablero y su marca `deducido`; no el grafo del libro.
- Pruebas: `node --test tests/visor-explica.test.cjs` y `node tests/visor-explica-browser.cjs`.

## 15-nov-2026 · Visor 2.0: las pestañas (Plan · Historial · Archivos · Opciones)

Barra fija abajo en `visor.html` (`visor-pestanas.js` + `visor-pestanas.css`; la ficha del plan no los carga). Detalle, contrato de pantalla y qué revisar en un iPhone de verdad: docs/ppp2.md, «Visor 2.0: las pestañas en la pantalla».

- **Sólo lee y no calcula:** las pestañas piden por GET `ppp2-historial`, `ppp2-chat`, `ppp2-archivos` y `ppp2-archivo` (partes desde 0) con la liga y el plan, **sin `k`**; las opciones, con el mismo `ppp2-visor`. La única escritura del visor sigue siendo `ppp2-elige`, cuyo selector vive ahora en «Opciones». Nada de fórmulas financieras en `visor.js` ni en `visor-pestanas.js` (lo vigila `tests/visor-pestanas.test.cjs`).
- **Ninguna respuesta de las pestañas apaga la liga:** el servidor de hoy les contesta `sin_sesion` y cada pestaña dice que todavía no hay; si una dice `liga`, lo confirma el sondeo del plan.
- **Audiencia:** sin `audiencia` = `equipo` no se enseñan conversación ni pendientes aunque lleguen. El chat lleva un ícono de burbuja propio: nunca el logotipo ni los colores de WhatsApp.
- **pdf.js** 3.11.174 `legacy` desde jsDelivr con SRI (script y *worker*) e `isEvalSupported: false`, cargado sólo al abrir un PDF; si se cambia de versión, se recalculan las dos huellas (`PDFJS` en `visor-pestanas.js`) y la prueba de navegador con `PPP_PDFJS_DIR` lo comprueba.
- **«deducido de …»** sale en leyendas y hojas cuando la respuesta trae `deducido` (rutas → `rutasDe`/`FLUJO_RUTA` de `visor.js`).
- **Tipos de archivo:** la pantalla arma cada archivo con el tipo de sus bytes (`ppp2-archivo`) revisado contra `PASIVO` de `visor-pestanas.js`, que debe decir lo mismo que `PESTANAS.PASIVO` de `server/ppp2/Visor.gs` (lo compara una prueba): lo que un navegador ejecuta (HTML, SVG, XML, scripts) no se abre aparte, sólo se guarda.
- Pruebas: `node --test tests/visor-pestanas.test.cjs` y `node tests/visor-pestanas-browser.cjs` (dobles del contrato en `tests/visor-pestanas-dobles.cjs`; el servidor de main de verdad, con hoja de historial y Drive inventados, en `tests/visor-pestanas-mundo.cjs`), además de las del visor.

## 25-nov-2026 · El visor enseña las versiones del Árbol PPP

Al guardar una versión, el Árbol deja su paquete del visor en la pestaña `ARBOL_VISOR` del Maestro (`arbol_visor_pon_`, `server/ppp2/ArbolPPP.gs`) y `Visor.gs` la sirve por la ruta de las fotos con la liga `ppp:arbol-<proyecto>`: una versión por columna, la última por omisión y la que Dirección elija con `ppp2-elige`. El prefijo `arbol-` decide la hoja. El servidor no calcula ni compara: guarda lo del motor con la identidad del libro y sirve sólo datos (las claves de la forma y `cascada`, limpia). Ni nombres de proyectos ni cifras reales en pruebas o docs. Detalle en docs/arbol-ppp.md; encenderlo, en `server/ppp2/INSTALAR.md`. Pruebas: `node --test tests/arbol-ppp-visor.test.cjs`.

## 25-nov-2026 · Consultorios y oficinas con su equivalente en renta

El Árbol suma la opción de producto «Consultorios y oficinas» y, sólo con ella, los nodos RN-01 a RN-05 (renta por m², tasa de capitalización, renta anual, valor en renta y lo que rinde sobre el costo). El visor los pinta en «Costo y ganancia» sólo si llegan (`v.renta_*`); no calcula nada. Las filas nuevas del Maestro se pasan en el orden NODOS/OPCIONES → MAESTRO → FACTORES. Detalle en docs/arbol-ppp.md.

## 25-nov-2026 · Un solo árbol con ramas: edificio, lotes o casas

La pregunta raíz «Qué se desarrolla» (DS-01, de entrada Edificio) abre la rama. Con Edificio las cifras no cambian (75 planes del Maestro iguales al motor anterior). Lotes y Casas usan L-01 a L-09 y ocultan los nodos del edificio; E-17, C-04/C-05/C-07/C-08/C-09, P1-09, P1-01 y PT-01 cuelgan de padres que existen en las tres ramas (un nodo sólo se ve si su padre se ve). El destino P1-03 admite «Venta y renta» y «Renta» para cualquier producto. El paquete del visor lleva `plan.tipo` lotes/casas y el cuadro Terreno los dibuja. Detalle y orden para el Maestro en docs/arbol-ppp.md.
