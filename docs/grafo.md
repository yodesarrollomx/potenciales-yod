# Grafo del sistema en Accesos

Propuesta del atlas: `CHG-GRAFO-ACCESOS-20261111` (contrato `CTR-GRAFO-VERSIONES`). Autorizado por Dirección el 11-nov-2026.

## Qué es

Al final de `accesos.html` (sólo con sesión de admin) está la sección «Grafo del sistema»: el mapa de YOD OS dibujado con el visor de Graphify, más sus controles. Sirve para tres cosas:

1. **Ver** cómo se conectan tableros, repositorios, backends, hojas y flujos, y dónde hay algo fallando.
2. **Rehacerlo a pedido** cuando el sistema cambió, dejando el resultado como borrador hasta que Dirección lo apruebe.
3. **Alimentar las presentaciones**: cada grafo aprobado publica las recetas por audiencia y el contrato del Plan de Potencial que lee `yodesarrollo-board/presentacion/grafo/` (propuesta `CHG-PRESENTACION-GRAFO-20261111`).

### Qué trae lo publicado

Este repositorio es público: aunque la sección sólo se enseña al admin, los archivos de `grafo/` los puede abrir cualquiera que tenga la liga. Al preguntarlo, Dirección eligió publicar aquí **la versión completa** (11-nov-2026). Por eso el grafo trae, además del código de los repositorios públicos y del atlas:

- los identificadores y los nombres de pestañas de las hojas de la operación (sin filas ni valores);
- el plan propuesto por tablero: pantallas, zonas, mejoras y hallazgos.

Nunca debe traer, y una prueba lo vigila (`LoPublicado` en `grafo-motor/pruebas/`): repositorios privados ni repositorios de clientes externos, hallazgos de seguridad, nombres de personas, folios o nombres de tratos, correos, claves ni identificadores completos de `/exec` (van abreviados). Las láminas llevan `noindex,nofollow,noarchive` para que los buscadores no las guarden.

**Sólo repositorios públicos.** `grafo-motor/datos/reglas.json` → `publicos` es la lista de repositorios que el grafo puede nombrar, revisada a mano (todos públicos al 12-nov-2026). `refrescar.py` (`solo_publicos`) quita en cada refresco lo que no está en ella: repositorios rastreados y sus piezas, piezas de repositorio, y en los textos cualquier «dueño/repositorio» fuera de la lista, que pasa a «un repositorio privado». El atlas sí conoce repositorios privados; sus nombres **no se guardan** en este repositorio: la base guarda sólo su huella (`no_publicos`), sacada del atlas en cada refresco, y con ella se reconoce y se tapa el nombre en cualquier texto. La prueba busca en todo lo publicado. La visibilidad real la comprueba `rehacer.py`: lee sin credencial cada repositorio de la lista (las casas viejas sólo se tocan) y, si alguno no contesta o el atlas lo marca como no público, **no abre borrador** y lo dice en el pedido. Para sumar un repositorio al grafo hay que agregarlo a `publicos`, y sólo si es público.

Decisión de Dirección del 12-nov-2026 (DEC-19): el grafo **no refleja** sistemas hechos para otros clientes, aunque el atlas y `yod-portal` publiquen su descripción saneada. La regla vive en `grafo-motor/datos/reglas.json` → `excluir` (patrones de id, componente, ruta y texto); `refrescar.py` la aplica al final de cada refresco, después del atlas y de los repositorios, así nada de eso vuelve a entrar, y una prueba (`test_sin_sistemas_de_clientes_externos`) lo vigila. Además, el modelo del atlas se filtra con la misma regla **antes** de sincronizarlo (`filtra_atlas`): componentes, conexiones, contratos, procesos y propuestas (una propuesta que sólo mejoraba algo excluido también sale), y en los textos de lo que se queda el nombre pasa a «otro sistema». Si entrara y se quitara después, cada rehecho lo contaría como «piezas nuevas» y sus nombres quedarían publicados en `grafo/versiones.json` y en la explicación de la IA (pasó el 12-nov-2026 con el borrador G-20261112-1147, que no se aprobó). Y el informe de cada rehecho (archivos nuevos, quitados o cambiados por repositorio, y notas) pasa por la misma regla (`filtra_cambios`), porque es lo que leen la IA, el PR del borrador y `grafo/versiones.json`: el resumen del borrador G-20261112-1351 lo nombraba por archivos nuevos de `yod-portal` en su carpeta, y tampoco se aprobó. Hoy excluye un sistema hecho para un cliente externo: su pieza, contratos, procesos, hoja, almacén, endpoint, llaves de navegador y secretos, y los archivos de `yod-portal` que lo envuelven. Quedan cuatro notas curadas del plan y de los hallazgos que todavía lo nombran: Dirección decide si se quedan (la prueba `test_lo_excluido_no_se_nombra_en_los_textos` sólo las admite a ellas).

`refrescar.py` sólo agrega lo que lee de repositorios públicos y del atlas. Para quitar algo del grafo publicado se edita `grafo-motor/datos/base.json` y se regeneran las láminas.

## Piezas

| Archivo | Qué hace |
|---|---|
| `grafo-motor/datos/base.json` | La base pública del grafo: piezas, ligas, repositorios con su commit y el contrato del plan (nombres de campos, sin valores). |
| `grafo-motor/datos/reglas.json` | Reglas para acomodar cada pieza en su área. |
| `grafo-motor/refrescar.py` | Vuelve a leer los repositorios públicos y el atlas y actualiza la base. |
| `grafo-motor/laminas.py` (+ `lam_*.py`) | Dibuja las láminas de `grafo/` desde la base. Determinista: misma base, mismos archivos. |
| `grafo-motor/recetas.json` | Qué cuenta cada presentación según la audiencia. Sin cifras: nombra campos guardados del plan. |
| `grafo-motor/ia.py` | Pide a OpenAI y a Claude, a la vez, que expliquen qué cambió; usa la primera respuesta válida. |
| `grafo-motor/rehacer.py` | Orquesta: clona, refresca, valida recetas, pide la explicación, lleva las versiones y escribe el registro de impacto del borrador. |
| `grafo-motor/aviso.py` | Textos del PR, del comentario del pedido y del aviso de borrador. |
| `grafo/` | Lo generado: láminas, `versiones.json`, `datos/<id>.json`, `mapa-ids.json`. **No se edita a mano.** |
| `grafo-control.js` | Los controles junto al grafo en Accesos. No trae claves ni escribe nada. |
| `scripts/grafo-estado.cjs` | El vigilante (sólo lectura): corre con lo que pasa en el repositorio y cuando GitHub arranca su horario. |
| `scripts/grafo-rama-datos.sh` | Lee y escribe la rama de datos `grafo-datos`. |
| `.github/workflows/grafo-rehacer.yml` · `grafo-estado.yml` | Los dos flujos. |

## Cómo se rehace

1. En Accesos, **«Rehacer grafo»** → confirmar. Se abre GitHub con el pedido listo (un issue «🕸️ Rehacer grafo»); se toca «Submit new issue». La página no usa ninguna clave: el pedido lo firma la cuenta de GitHub de quien lo manda.
2. El flujo «Grafo · rehacer» comprueba que esa cuenta tiene permiso de escritura en el repositorio. Si no, cierra el pedido sin hacer nada.
3. Rehace el grafo. Si nada de lo que dibuja cambió, lo dice y no abre borrador.
4. Si cambió, pide la explicación a las IA (si hay claves) y deja el grafo nuevo en la rama **`grafo-borrador`** con su PR. Contesta en el pedido y lo cierra.
5. En Accesos aparece el aviso: **¿Lo apruebas ya o lo dejas en borrador?**
   - **Aprobar ya** = fusionar ese PR. Si el flujo lo abrió con su propia credencial (sin la App del grafo), GitHub muestra antes «Approve workflows to run»: se toca primero (sólo deja correr las pruebas) y, cuando quedan en verde, «Merge pull request». Con la App del grafo las pruebas corren solas y basta «Merge pull request». Pages publica el grafo nuevo y las presentaciones lo usan solas.
   - **Dejar en borrador** = no hacer nada. Lo publicado, las presentaciones y sus ligas siguen igual.
   - **Descartar** = cerrar el PR sin fusionar.

«Ver el borrador» lo enseña en la misma página sin publicarlo (`grafo/index.html?rama=grafo-borrador`).

Si el Portero confirma la sesión de administrador pero la lista de usuarios no llega (tardó más de 20 s o no hubo red), Accesos borra lo privado y no deja escribir, pero el grafo y el estado de los sistemas se quedan: son archivos estáticos que no dependen de esa lista. Un rechazo de la sesión sí apaga todo. (12-nov-2026: el Portero tardó y el grafo desaparecía.)

### Por qué un PR

La rama principal está protegida (comprobación obligatoria «Arquitectura YOD»), así que ningún flujo escribe en ella. El borrador lleva su propio `architecture-impact.json` para poder pasar esa comprobación.

Desde el 12-nov-2026 este repositorio deja que un flujo abra PR (Settings → Actions → General → Workflow permissions → «Allow GitHub Actions to create and approve pull requests»), así que el borrador llega con su PR ya abierto.

**Aprobar: dos toques sin la App del grafo, uno con ella** (DEC-21, decisión de Dirección).

- **Sin App (así está hoy).** GitHub, desde junio de 2026, deja «en espera de aprobación» las pruebas de un PR que abre o pone al día un flujo con su propia credencial (`GITHUB_TOKEN`) y lo marca como bloqueado hasta que una persona con permiso de escritura toca **«Approve workflows to run»**; después se toca **«Merge pull request»**. Pedir aparte la comprobación obligatoria no quita ese paso (se probó: el PR siguió bloqueado), por eso el flujo ya no la pide.
- **Con App.** Si el repositorio tiene los secretos `GRAFO_APP_ID` (el App ID o el Client ID) y `GRAFO_APP_PRIVATE_KEY` de una GitHub App instalada sólo aquí, con permisos de contenido y de PR en escritura, el flujo saca con ella un token de una hora (`actions/create-github-app-token`, fijada por commit) y lo usa **sólo** para subir la rama `grafo-borrador` y abrir o poner al día su PR. Lo que hace una App no queda en espera: las pruebas corren solas y aprobar es **«Merge pull request»**. Todo lo demás (el pedido, la rama de datos, los comentarios) sigue con la credencial del flujo, sin más permisos. Si los secretos no están o la App falla, el flujo avisa y sigue como sin App.
- Fuentes: [changelog de GitHub del 11-jun-2026](https://github.blog/changelog/2026-06-11-bot-created-pull-requests-can-run-workflows-if-approved/) y [«Triggering a workflow from a workflow»](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow).

Si el repositorio no permite que un flujo abra PR, el flujo deja la rama y una liga: en esa página se toca «Create pull request» y el trabajo «borrador-abierto» le pone título, explicación y aviso. Un PR abierto así por una persona no pide «Approve workflows to run»: sus pruebas corren solas.

Si otros cambios entran a la rama principal mientras el borrador espera, puede quedar atrás. Accesos lo avisa; se arregla con «Rehacer otra vez».

## Claves de IA

- Secretos de Actions de **este** repositorio: `OPENAI_API_KEY` y `ANTHROPIC_API_KEY`. Basta una; con las dos se pregunta a ambas y gana la primera respuesta válida. Los pone Dirección en Settings → Secrets and variables → Actions.
- Modelos por omisión: `gpt-6.1-sol` y `claude-sonnet-5-5`. Se cambian con las variables `GRAFO_OPENAI_MODEL` y `GRAFO_CLAUDE_MODEL`.
- Sin claves, o si ninguna contesta bien, el grafo se rehace igual; sólo falta la explicación.
- A los modelos se les manda únicamente el resumen público de lo que cambió. Su respuesta se recorta y se valida; es ayuda de lectura, no decide nada.
- Cada explicación gasta una consulta de pago por uso. `workflow_dispatch` con «sin IA» la evita.
- El trabajo «ensayo» de cada PR que toca el grafo dice si las claves existen (sólo sí o no).

## Vigilancia

«Grafo · estado» sólo lee (API de GitHub y páginas estáticas; ningún `/exec`). Corre:

- por horario: pide dos por hora (minutos 17 y 47), pero **GitHub arranca los horarios cuando puede, así que no es «cada hora»**. GitHub avisa que con carga alta los horarios se retrasan y algunos se descartan ([«Events that trigger workflows» · schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)). Medido en esta organización del 8 al 12-nov-2026: cada línea de horario corre unas tres veces al día y con horas de retraso, pida cada 15 minutos, cada hora o cada 3 horas (`sala-cada-hora.yml` de la Sala, con cuatro líneas: cada una, una vez cada 4 a 11 horas; `salud-online.yml` de la cabina pide 96 al día y corrió de 3 a 5). Aquí, el 12-nov: una a las 16:01Z y la siguiente a las 22:16Z. Por eso no depende sólo del reloj;
- en cuanto se aprueba un grafo;
- en cuanto termina en la rama principal una revisión de este repositorio («Arquitectura YOD», «Verificar acceso PPP», «Verificar interfaz PPP»): si falló, se pinta y se abre su chinche en ese momento;
- cuando en este repositorio se abre, se cierra o se reabre una chinche.

Lo de los otros repositorios se ve en la siguiente corrida, sea por horario o por cualquiera de las anteriores. De noche y en fin de semana casi nada lo despierta salvo el horario: lo pintado puede tener horas. Cada corrida deja su hora: es el «revisado» que enseña la página. Para revisar ya: en GitHub, Actions → «Grafo · estado» → «Run workflow» (sólo lee).

Qué mira:

- flujos cuyo último intento falló, con el trabajo y el paso;
- chinches abiertas;
- repositorios que cambiaron después de armar el grafo;
- páginas que responden con error.

Lo pinta en el grafo, lo anota en el registro y abre una chinche (`📌 Grafo: …`) por cada flujo o página que falla, para que la ronda diaria de chinches lo atienda; si esa chinche ya está abierta no abre otra: la reconoce por la clave del error (va en su texto) o por el flujo o la página, aunque esta vez tronara en otro trabajo, en otro paso o con otro código. Así, un flujo que falla, pasa y vuelve a fallar entre revisiones seguidas no llena de chinches (pasó el 12-nov con «Sala · Cada hora», que en cada corrida hace un trabajo distinto). Si no pudo leer cuáles hay abiertas, o GitHub no la dejó abrir, no abre a ciegas: queda en `chinche_pendiente` de `estado.json` y la siguiente revisión la abre si el error sigue. También pone al día el aviso de borrador con lo que de verdad hay en GitHub.

Dos cuidados para que el registro diga la verdad:

- **Un flujo está en rojo si su última corrida en la principal falló**, no si «aparece entre las últimas corridas»: se pregunta por las fallas de los últimos 45 días y luego por la última corrida de ese flujo. Así una falla no desaparece sola porque otros flujos corrieron muchas veces después.
- **Lo que no se pudo leer no se da por resuelto.** Si GitHub no contesta algo de un repositorio, sus errores de antes se conservan y `estado.json` lo anota en `sin_dato`.

Dónde se pinta cada error: en el repositorio donde pasó y en los tableros que **viven** en ese repositorio según el atlas (`grafo/mapa-ids.json`, que genera `laminas.py`). Si en un repositorio viven tableros de varias filas del mapa —la cabina aloja varios—, sólo en los de su propia fila. Una chinche se pinta en el repositorio donde está abierta, aunque hable de otro tablero.

## Rama de datos `grafo-datos`

`estado.json`, `registro.jsonl` y `borrador.json`. La escriben sólo los flujos; las páginas la leen por `raw.githubusercontent.com` (tarda unos minutos en refrescar). No se sirve por Pages ni dispara otros flujos. No se edita a mano.

## Límites conocidos

- Las capas curadas a mano (pantallas propuestas, plan, hallazgos, pestañas y columnas de hojas) no se regeneran solas: `refrescar.py` actualiza lo que se lee del código y del atlas.
- El grafo no ve repositorios privados ni los nombra (ver «Sólo repositorios públicos»).
- «Cambió» significa que hubo commits que tocan algo que el grafo dibuja; no dice si el cambio es bueno. No cuenta lo que el propio grafo escribe en este repositorio: `grafo/`, `grafo-motor/datos/` y el `architecture-impact.json` que cada borrador reescribe.
- La explicación de IA puede equivocarse; lo contado (archivos, piezas, ligas) sale del motor, no del modelo.

## Pruebas

```
python -m unittest discover -s grafo-motor/pruebas -p 'prueba_*.py'
node --test tests/grafo-estado.test.cjs tests/grafo-control.test.cjs
```

En cada PR que toca el grafo, el trabajo «ensayo» corre eso, comprueba que las láminas publicadas son las que genera la base y rehace en seco.

Para regenerar las láminas después de cambiar el motor: `python3 grafo-motor/rehacer.py inicial`.

## Reversión

Revertir el merge, desactivar los dos flujos y borrar las ramas `grafo-datos` y `grafo-borrador`. No hay backend, hojas ni datos de negocio.

## Comprobado en producción (12-nov-2026)

Después de fusionar, con hechos:

- **Publicación.** Pages publicó `accesos.html` y `portero.js` byte a byte con el commit de la rama principal (lo comprueba «Verificar acceso PPP»).
- **Vigilancia.** La primera corrida de «Grafo · estado» creó la rama `grafo-datos` con su estado y su registro. Por horario, GitHub lo corrió una sola vez en las primeras diez horas (a las 16:01Z): desde entonces corre también con lo que pasa en el repositorio y pide dos horarios por hora.
- **Rehacer a pedido.** Un pedido real (issue «🕸️ Rehacer grafo») rehízo el grafo en menos de dos minutos, dejó el borrador en `grafo-borrador`, contestó y cerró el pedido y escribió el aviso. Sin claves de IA: dice «no hay clave» y sigue.
- **PR del borrador.** En la mañana el repositorio no dejaba que el flujo lo abriera: quedó la liga y, al abrirlo a mano, «borrador-abierto» le puso título y explicación y el aviso tomó su número. Con el permiso ya activo (17:37Z) el flujo lo abrió solo.
- **Explicación con IA.** Con la clave de Claude puesta, el primer borrador salió con su explicación (9.7 s). En el siguiente, Claude contestó un JSON mal formado y el borrador salió sin explicación: desde entonces la respuesta se le pide como herramienta con esquema y, si llega mal formada, se pide una vez más.
- **Aprobar.** El PR abierto por el flujo estuvo bloqueado mientras sus cuatro corridas esperaban aprobación. Al aprobarlas una persona (18:03Z) pasó a fusionable y se fusionó (18:08Z). En menos de un minuto Pages publicó, el flujo de cierre anotó «grafo aprobado», quitó el aviso y borró la rama, y el vigilante dio por resueltos los «cambió» de los demás repositorios.
- **Lo que esa primera aprobación sacó a la luz, ya corregido.** El vigilante siguió diciendo que este repositorio «cambió», porque cada borrador reescribe `architecture-impact.json` y ese archivo no contaba como «lo que el grafo escribe»; y «grafo aprobado» quedó anotado dos veces, una por el flujo de cierre y otra por el vigilante. Ahora ese archivo cuenta como propio (en el vigilante y en `refrescar.py`), el vigilante le da diez minutos al flujo de cierre antes de anotar él, y ninguno de los dos repite un cierre que ya está en el registro.
- **Descartar.** Al cerrar el PR sin fusionar se anotó «borrador descartado», se quitó el aviso y se borró la rama.

Falta ver en vivo: la sección del grafo con una sesión real de administrador en el navegador. El aviso de borrador que leen las páginas tarda unos minutos en ponerse al día porque `raw.githubusercontent.com` guarda copia.
