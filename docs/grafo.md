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

Nunca debe traer, y una prueba lo vigila (`LoPublicado` en `grafo-motor/pruebas/`): repositorios privados ni repositorios de clientes externos, hallazgos de seguridad, nombres de personas, folios o nombres de tratos, correos, claves ni identificadores completos de `/exec` (van abreviados).

Una precisión, comprobada el 12-nov-2026: el grafo **sí refleja** el sistema de evaluación de personas, que es de otro cliente. Su repositorio es privado y no está en el grafo, pero el atlas y `yod-portal` (los dos públicos) ya publican su descripción saneada —contratos, procesos y la página que lo envuelve, sin nombres ni datos— y el grafo la trae tal cual, en la fila «Fuera del menú». Dejarla o quitarla del grafo es decisión de Dirección; mientras no la tome, se queda como está.

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
| `scripts/grafo-estado.cjs` | Vigilante de cada hora (sólo lectura). |
| `scripts/grafo-rama-datos.sh` | Lee y escribe la rama de datos `grafo-datos`. |
| `.github/workflows/grafo-rehacer.yml` · `grafo-estado.yml` | Los dos flujos. |

## Cómo se rehace

1. En Accesos, **«Rehacer grafo»** → confirmar. Se abre GitHub con el pedido listo (un issue «🕸️ Rehacer grafo»); se toca «Submit new issue». La página no usa ninguna clave: el pedido lo firma la cuenta de GitHub de quien lo manda.
2. El flujo «Grafo · rehacer» comprueba que esa cuenta tiene permiso de escritura en el repositorio. Si no, cierra el pedido sin hacer nada.
3. Rehace el grafo. Si nada de lo que dibuja cambió, lo dice y no abre borrador.
4. Si cambió, pide la explicación a las IA (si hay claves) y deja el grafo nuevo en la rama **`grafo-borrador`** con su PR. Contesta en el pedido y lo cierra.
5. En Accesos aparece el aviso: **¿Lo apruebas ya o lo dejas en borrador?**
   - **Aprobar ya** = fusionar ese PR. Pages publica el grafo nuevo y las presentaciones lo usan solas.
   - **Dejar en borrador** = no hacer nada. Lo publicado, las presentaciones y sus ligas siguen igual.
   - **Descartar** = cerrar el PR sin fusionar.

«Ver el borrador» lo enseña en la misma página sin publicarlo (`grafo/index.html?rama=grafo-borrador`).

### Por qué un PR

La rama principal está protegida (comprobación obligatoria «Arquitectura YOD»), así que ningún flujo escribe en ella. El borrador lleva su propio `architecture-impact.json` para poder pasar esa comprobación, y el flujo la pide para la rama del borrador.

Si el repositorio no permite que un flujo abra PR, el flujo deja la rama y una liga: en esa página se toca «Create pull request» y el trabajo «borrador-abierto» le pone título, explicación y aviso. Son dos toques para aprobar en lugar de uno.

Comprobado en vivo el 12-nov-2026: **hoy este repositorio no lo permite**, así que aprobar son esos dos toques. Para que el PR se abra solo y aprobar sea un toque, Dirección puede activar en GitHub: Settings → Actions → General → Workflow permissions → «Allow GitHub Actions to create and approve pull requests».

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

- por horario, dos veces cada hora. **GitHub arranca los horarios cuando puede**: el 12-nov-2026, recién instalado, lo corrió una sola vez en diez horas. Por eso no depende sólo del reloj;
- en cuanto se aprueba un grafo;
- en cuanto termina en la rama principal una revisión de este repositorio («Arquitectura YOD», «Verificar acceso PPP», «Verificar interfaz PPP»): si falló, se pinta y se abre su chinche en ese momento;
- cuando en este repositorio se abre, se cierra o se reabre una chinche.

Lo de los otros repositorios se ve en la siguiente corrida, sea por horario o por cualquiera de las anteriores. Cada corrida deja su hora: es el «revisado» que enseña la página.

Qué mira:

- flujos cuyo último intento falló, con el trabajo y el paso;
- chinches abiertas;
- repositorios que cambiaron después de armar el grafo;
- páginas que responden con error.

Lo pinta en el grafo, lo anota en el registro y abre una chinche (`📌 Grafo: …`) por cada flujo o página que falla, para que la ronda diaria de chinches lo atienda; si esa chinche ya está abierta no abre otra. También pone al día el aviso de borrador con lo que de verdad hay en GitHub.

Dos cuidados para que el registro diga la verdad:

- **Un flujo está en rojo si su última corrida en la principal falló**, no si «aparece entre las últimas corridas»: se pregunta por las fallas de los últimos 45 días y luego por la última corrida de ese flujo. Así una falla no desaparece sola porque otros flujos corrieron muchas veces después.
- **Lo que no se pudo leer no se da por resuelto.** Si GitHub no contesta algo de un repositorio, sus errores de antes se conservan y `estado.json` lo anota en `sin_dato`.

Dónde se pinta cada error: en el repositorio donde pasó y en los tableros que **viven** en ese repositorio según el atlas (`grafo/mapa-ids.json`, que genera `laminas.py`). Si en un repositorio viven tableros de varias filas del mapa —la cabina aloja varios—, sólo en los de su propia fila. Una chinche se pinta en el repositorio donde está abierta, aunque hable de otro tablero.

## Rama de datos `grafo-datos`

`estado.json`, `registro.jsonl` y `borrador.json`. La escriben sólo los flujos; las páginas la leen por `raw.githubusercontent.com` (tarda unos minutos en refrescar). No se sirve por Pages ni dispara otros flujos. No se edita a mano.

## Límites conocidos

- Las capas curadas a mano (pantallas propuestas, plan, hallazgos, pestañas y columnas de hojas) no se regeneran solas: `refrescar.py` actualiza lo que se lee del código y del atlas.
- El grafo no ve repositorios privados.
- «Cambió» significa que hubo commits que tocan algo que el grafo dibuja; no dice si el cambio es bueno.
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
- **PR del borrador.** El repositorio no deja que el flujo lo abra (ver arriba): quedó la liga. Al abrirlo a mano, «borrador-abierto» le puso título y explicación y el aviso tomó su número; «Arquitectura YOD» pasó en él.
- **Descartar.** Al cerrar el PR sin fusionar se anotó «borrador descartado», se quitó el aviso y se borró la rama.

Falta ver en vivo: **aprobar** un borrador (fusionar su PR) y la sección del grafo con una sesión real de administrador en el navegador. El aviso de borrador que leen las páginas tarda unos minutos en ponerse al día porque `raw.githubusercontent.com` guarda copia.
