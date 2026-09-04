# Potenciales YOD — el board de cálculo de potencial **y EL PORTERO** (la cerradura de todo el tablero)

Lee este archivo completo antes de tocar nada.

> Reordenado y completado el **2026-09-04**: el CLAUDE.md anterior seguía vigente (contratos del board, reglas de oro, URLs) y se conserva; se le agregó el capítulo del Portero, las decisiones fechadas y los pendientes.

## Qué es

Dos cosas en un mismo repo:

1. **El board de Potenciales** — calculadora de potencial de desarrollos, sheet-driven. Cinco motores vivos: VERTICAL (`mixto.html`), MACROLOTES (`macrolotes.html`), UNIFAMILIAR (`unifamiliar.html`), RESIDENCIAL (`residencial.html`), PATRIMONIAL (`patrimonial.html`), más portal (`index.html`) y mapa (`mapa.html`). Lo usan Alejandro y el equipo YoDesarrollo.
2. **EL PORTERO** (`portero.js`) — la cerradura compartida de **todos** los tableros YOD. No es un archivo de este board: otros repos lo cargan por URL absoluta (`yodesarrollo-board/index.html`, `obra-board/index.html`, los 5 HTML de `real-miramar-board/` traen `src="https://yodesarrollomx.github.io/potenciales-yod/portero.js"`). Trae además el tema claro/oscuro de todos los boards (bloque «TEMA CLARO / OSCURO» de `portero.js`, hasta el final del archivo).

**Dirección en vivo (curl, 2026-09-04):** `https://yodesarrollomx.github.io/potenciales-yod/` → **200** (casa canónica) · `/portero.js` → **200** · `/accesos.html` → **200** · `https://alexpueblag.github.io/potenciales-yod/` → **200** (cascarón viejo, sigue respondiendo) · `https://tableros.yodesarrollo.mx/potenciales-yod/` → **000, no resuelve** (el DNS del dominio propio no existe todavía).

## Reglas INVIOLABLES

1. **Nunca crear implementación nueva del Apps Script.** Editor → Implementar → Administrar → lápiz → *Nueva versión*. Una nueva cambia la URL `/exec` y rompe TODOS los tableros a la vez, más los `?open=` ya enviados por correo. Ya pasó: 2026-07-12, implementación archivada e irrecuperable (`653795e`).
2. **`portero.js` no es de este board: es de todos.** Se despliega desde este repo y al instante lo cargan Miramar, obra-board y yodesarrollo-board. Romperlo deja al equipo fuera de todo.
3. **El HTML público no lleva secretos.** La clave vive en la hoja `CONFIG` (servidor); el `client_id` de Google sí es público por diseño (`Code.gs:36`). Verificado: sin `k`, `?recurso=lista` → `{"ok":false,"error":"clave"}`.
4. **Un relevo de emergencia jamás se persiste como destino.** El original va primero en cada llamada; el respaldo solo si aquel falla ahí mismo (`portero.js:16-24`). Persistirlo causó el "pagué Workspace y ya no entra" ([[google-workspace-reactivado-16ago]]).
5. **Nunca se borra una fila del Sheet.** Archivar = `archivado:"si"` (`Code.gs:12`); las pruebas van con `source='test'` y se archivan.
6. **La liga del correo no puede apuntar fuera del sitio.** `destinoSeguro_` (`Code.gs:409-422`) tiene allowlist de 3 bases; quitarla = phishing con token real.
7. **Deploy del front: editar → commit → push → Ctrl+Shift+R.** Nunca publicar desde clones viejos.
8. **No mandar POST al `/exec` para "probar":** escribe filas, manda correos y quema cuota de `MailApp`. Los GET (`meta`, `canje`, `activar`) sí son seguros.

## Archivos

- `portero.js` (378 líneas) — la cerradura. Canje de liga, gate, bitácora, engrane de admin y tema.
- `accesos.html` — board de admin: alta/revocación de usuarios y **matriz de permisos por tablero**.
  El botón de la línea 116 abre la hoja ACCESOS (`docs.google.com/spreadsheets/d/1Ld2ytzwYniIXmxu_TuLViN4hPILSg-xMbFpFgPnqf7Y`).
- `index.html` — portal con mapa; redirige los `?open=ID` viejos al board que toca (líneas 12-14).
- `mapa.html`, `macrolotes.html`, `mixto.html`, `unifamiliar.html`, `residencial.html`,
  `patrimonial.html` — los motores. Todos cierran con `<script src="portero.js?v=relevo5">`.
- `gas/Code.gs` — el backend. **NO está en el repo público** (`.gitignore` excluye `gas/`).
- `gas/parches/2026-09-02-canje-cache.gs` — el parche de caché del canje, ya integrado en Code.gs.
- `.claude/launch.json` — server local `potenciales`, puerto 8765.

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
                                                 +  yodesarrollo-board · obra-board · real-miramar-board
```

> ⚠ **El repo es ESPEJO: lo que corre es lo pegado en el editor de Apps Script.** `gas/Code.gs` ni
> siquiera se sube al repo público (`.gitignore`). Un cambio local no existe hasta que se pega/pushea
> al editor **y** se actualiza la implementación existente. Antes de tocar el .gs, pide el Code.gs
> vivo del editor ([[backend-vivo-no-es-el-repo]]).

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
