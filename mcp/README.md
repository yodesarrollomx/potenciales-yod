# MCP YOD OS · PPP

Servidor MCP extensible que conecta asistentes con el Plan de Potencial existente.
Implementa `tools`, un recurso de contrato y un prompt con el SDK oficial de MCP.
No duplica las fórmulas ni crea otra base de negocio. MCP es un protocolo de
interoperabilidad; no certifica calidad de datos, ISO 9000 ni rentabilidades.

## Dos conexiones

| Conexión | Identidad | Lo que permite |
|---|---|---|
| Streamable HTTP, `/mcp` | Liga activa del visor para cada consulta | Ver exactamente el alcance compartido; buscar sólo oportunidades publicadas explícitamente |
| stdio, proceso del usuario | Sesión individual del Portero, fuera del chat | Consultar sus PPP2 y preparar/aplicar cambios autorizados |

HTTP no carga ninguna sesión privada y rechaza arrancar si se configura una.
Cada instalación stdio usa una sola identidad. No compartir ese proceso entre
usuarios. El backend valida permisos en cada operación: el modelo no elige su rol.
La liga es una capacidad de acceso: sus destinatarios pueden usarla para leer.

## Arranque

Requiere Node 22 o superior. La edición usa un directorio privado persistente en
Linux/macOS; no colocar los recibos en una carpeta sincronizada públicamente.

```sh
git clone https://github.com/yodesarrollomx/potenciales-yod.git
cd potenciales-yod
npm ci --prefix mcp --ignore-scripts
npm test --prefix mcp
node mcp/src/stdio.mjs
```

En stdio las herramientas privadas se descubren desde el inicio, pero no operan
hasta conectar la cuenta. Así se puede conectar o desconectar sin reiniciar el
asistente. `stdio.mjs` escribe únicamente protocolo en stdout; avisos a stderr.

## Conectar desde YOD (v0.2)

En el mismo equipo donde corren los asistentes, desde este repositorio:

```sh
node mcp/src/cli.mjs conectar
```

Abre una página del propio YOD. Entra con la cuenta que ya usas, selecciona los
planes con libro y, si corresponde, activa los cambios. Pulsa **Conectar este
equipo**. La terminal confirma actor y planes sin mostrar la sesión. El navegador
debe estar en ese equipo, no en un teléfono distinto. Si el navegador pregunta
por acceso a la red local, esta conexión necesita acceder a su proceso local.

El proceso dura hasta cinco minutos y valida la sesión contra la API actual del
PPP. No hay nueva cuenta, llave maestra, API de IA ni servicio contratado. Guarda
la conexión en `~/.local/state/yod-mcp/conexion.json` con permisos 0600 dentro de
un directorio 0700. La credencial es la sesión individual existente; su vigencia
y revocación remota dependen del Portero y de sus cachés actuales. No es OAuth
remoto ni una credencial nueva de alcance reducido emitida por el backend.
El adaptador limita sus herramientas a los planes elegidos y permisos vigentes.

Registra el servidor mediante la CLI nativa de cada cliente instalado:

```sh
node mcp/src/cli.mjs instalar codex
node mcp/src/cli.mjs instalar claude
node mcp/src/cli.mjs instalar hermes --perfil astra
node mcp/src/cli.mjs diagnostico
```

Usa el **perfil real** de Hermes; `astra` es sólo un ejemplo. El instalador añade
`yod-os-local` sin reemplazar otras conexiones. Si ya existe ese nombre se detiene
para conservarlo. Registra rutas absolutas y ningún secreto en la configuración
del cliente. Sigue las opciones de herramientas que muestre la CLI de Hermes.
Abre o recarga MCP en cada asistente y pide `yod_estado`: éste es el acuse del
cliente, distinto del registro de configuración o el diagnóstico del servidor.
Claude Code local y un conector de Claude web son superficies diferentes; esta
instalación no habilita edición en interfaces que sólo admitan MCP remoto.

Para retirar el permiso local sin borrar recibos:

```sh
node mcp/src/cli.mjs desconectar
```

Cada llamada de stdio relee el permiso; una llamada ya enviada puede terminar.
La revocación de la sesión de YOD se hace en sus accesos habituales. Renovar la
conexión crea otra identidad de conexión: las propuestas anteriores no se aplican
con ella. Los recibos permanecen privados en el equipo.

Para HTTP local:

```sh
node mcp/src/http.mjs
```

Dirección local: `http://127.0.0.1:8788/mcp`. `/healthz` comprueba el proceso;
no acredita disponibilidad del backend ni acceso a un plan. En un servidor usar
HTTPS delante del proceso. En Render escucha en `0.0.0.0:$PORT`.

## Conectar clientes

Un cliente remoto compatible con **Streamable HTTP** usa la URL pública terminada
en `/mcp`, sin token del Portero. Para comprobarlo: pedir `yod_capacidades`, después
`ppp_leer_visor` con una liga que ya se haya compartido. No pegar credenciales en
conversaciones, archivos versionados, argumentos de proceso o enlaces.

En clientes que admitan stdio, como Hermes, Claude Desktop/Code y Codex, usar:

- Ejecutable: ruta absoluta de `node` en el equipo del cliente.
- Argumento: ruta absoluta de `potenciales-yod/mcp/src/stdio.mjs`.
- Variables de entorno privadas: las de la tabla inferior.
- Directorio de trabajo: puede ser cualquiera; las rutas internas son relativas al módulo.

Ejemplo de entrada para clientes que utilicen `mcpServers` (sustituir rutas, no
copiar una credencial en este JSON):

```json
{
  "mcpServers": {
    "yod": {
      "command": "/ruta/real/node",
      "args": ["/ruta/real/potenciales-yod/mcp/src/stdio.mjs"]
    }
  }
}
```

La sintaxis de registro de cada cliente puede variar. Configurar las variables
mediante su almacén de secretos o el entorno del proceso que lo inicia. Tener
tokens de un proveedor de IA no sustituye iniciar sesión en YOD. La caducidad y
revocación de la sesión siguen siendo las del Portero. La instalación de este
servidor no instala ni inicia sesión automáticamente en los clientes del usuario.

| Variable | Uso |
|---|---|
| `YOD_PORTERO_SESSION` | Compatibilidad anterior: sesión individual `sy…`, sólo stdio. Tiene prioridad sobre la conexión de archivo; retirarla para usar el flujo nuevo |
| `YOD_MCP_WRITE=1` | Habilita cambios sólo en la configuración anterior por entorno; no concede permisos de backend |
| `YOD_MCP_STATE_DIR` | Conexión y diario privados; predeterminado `~/.local/state/yod-mcp` |
| `YOD_MCP_CATALOG_FILE` | Ruta de catálogo privado de configuración, fuera de Git |
| `YOD_MCP_CATALOG_JSON` | Alternativa al archivo, para variables de entorno en hosting |
| `YOD_PPP_ENDPOINT` | Sólo para despliegue controlado; predeterminado el endpoint de `ppp2.js` |
| `YOD_MCP_HOSTS` | Hosts HTTP exactos separados por coma; Render usa su hostname automático |
| `YOD_MCP_ORIGINS` | Orígenes web exactos permitidos, si se necesita un cliente en navegador |
| `PORT`, `HOST` | HTTP local: 8788 y 127.0.0.1 |

## Herramientas y contrato

| Herramienta | Resultado |
|---|---|
| `yod_capacidades` | Capacidades configuradas, adaptador/versión y límites |
| `yod_estado` | Identidad comprobada, planes elegidos y edición efectiva; sólo stdio |
| `ppp_leer_visor` | Plan, versión efectiva, flujo, reparto, candados, pruebas y procedencia autorizados por la liga |
| `ppp_buscar_oportunidades` | Búsqueda paginada en entradas publicadas; seguir `siguiente` incluso si la página no tiene coincidencias |
| `ppp_leer_oportunidad` | Consulta de una entrada publicada por su ID |
| `ppp_listar_planes` | Planes autorizados de la conexión local, con enlaces a sus fichas |
| `ppp_leer_plan` | Sección paginada, revisión, identidad y permisos efectivos |
| `ppp_preparar_cambio` | Validación y propuesta antes/después, sin escribir en el plan |
| `ppp_aplicar_cambio` | Operación por API existente con revisión y recibo durable |
| `ppp_recibo_cambio` | Consulta del resultado guardado, sin reenvío |

Recurso `yod://contrato`: fuentes, unidades, lectura/escritura y límites.
Prompt `analizar-plan`: guía de consulta trazable, supuestos y faltantes.
Las respuestas usan `structuredContent` y su equivalente textual JSON.
El visor soporta PPP2 y las instantáneas PPP que autorice el backend desplegado;
la edición de esta entrega es exclusivamente PPP2. La selección solicitada y la
efectiva se devuelven por separado porque el visor puede limitar versiones.

## Editar sin tocar Sheets directamente

1. Leer el plan y su sección `datos` o `palancas` para descubrir IDs y unidades.
2. Preparar **una** operación con fuente o razón. La propuesta dura 15 minutos,
   pertenece a la sesión que la preparó y contiene antes/después y revisión.
3. Revisarla dentro del encargo autorizado. Aplicar con el ID y la cadena exacta
   `APLICAR <id>` recibida. Esta cadena identifica la propuesta; no sustituye la
   autorización del usuario ni los permisos del Portero.
4. Comprobar el recibo. La API del PPP guarda, calcula y registra su bitácora.
   MCP relee el campo; sólo entonces informa `verificado`. El recibo enlaza la
   misma ficha del PPP donde debe verse la operación.

Operaciones disponibles: dato, producto, palanca de una versión editable,
respuesta a pregunta, evidencia de candado, estado de hallazgo, esquema de reparto
y nombre/descripción/estado propuesto de una versión. No aprueba versiones
vigentes, no cambia permisos, no escribe fórmulas o rangos, no crea libros y no
dispara rondas de IA ni procesos de pago. Los porcentajes son razones decimales:
`0.20` significa 20%; los MDP son millones de pesos mexicanos.

Ejemplo sintético de `cambio` (descubrir primero la clave real del plan):

```json
{
  "accion": "dato",
  "clave": "terreno.m2",
  "valor": 3200,
  "estado": "supuesto",
  "fuente": "Medición preliminar pendiente de levantamiento"
}
```

El diario usa archivos 0600, directorio 0700, escritura atómica, sincronización a
disco y una reclamación exclusiva antes del POST. Conserva los datos de la
propuesta, pero nunca la sesión. Una respuesta perdida deja `incierto`; un fallo
de relectura conserva `aplicado` sin afirmar comprobación. Repetir el mismo ID
devuelve su recibo. **No preparar otro ID para repetir un envío incierto**: leer
el plan y la bitácora y conciliar primero. No borrar el diario ni sus `.claim`
para forzar reintentos. Un `enviado` tras caída del proceso también requiere
conciliación. Renovar la sesión no transfiere automáticamente propuestas previas.

La revisión del backend evita sobrescribir cambios de API. La huella adicional
detecta cambios de contenido entre preparar y aplicar. Una edición directa de
Sheets después de la última lectura y antes del POST no queda cubierta: para
operación concurrente, usar el motor autorizado como punto de escritura.

## Publicar oportunidades

Compartir una liga permite consultarla; no la agrega al catálogo. El catálogo
arranca vacío. Dirección decide qué planes publicar, crea una liga de alcance
adecuado en el visor y configura fuera de Git una entrada como ésta:

```json
[
  {
    "id": "oportunidad-ejemplo",
    "publicada": true,
    "liga": "IDENTIFICADOR_DE_LIGA_COMPARTIDA"
  }
]
```

Opcionalmente `plan` limita la selección solicitada. Se relee cada liga en cada
consulta; no hay caché MCP. Revocarla impide nuevas lecturas una vez transcurra la
caché de hasta 60 segundos del visor existente. Quitar una entrada del catálogo
requiere recargar la configuración/reiniciar el servicio. Nunca incluir en Git
ligas reales, catálogos privados, sesiones o exportaciones de planes.

## Desplegar y comprobar

Servicio web Node separado. Build: `npm ci --prefix mcp --ignore-scripts`.
Start: `node mcp/src/http.mjs`. Plan gratuito apto para primera conexión; puede
suspenderse por inactividad y tardar en responder al despertar. No introduce
cargos de IA. No compartir variables de otros servicios ni configurar sesión
privada. Mantener despliegue manual y verificar el commit activo.

```sh
npm run --prefix mcp check
npm test --prefix mcp
npm audit --prefix mcp --omit=dev --audit-level=high
node --test tests/*.test.cjs
```

Las pruebas MCP ejecutan el servidor real de Apps Script del repo en su entorno
sintético, además de clientes SDK reales por stdio y HTTP. Comprueban permisos,
revocación, concurrencia, caída de transporte, recibos, selección y contratos.
No escriben planes reales. La versión fuente del backend no acredita la versión
Apps Script desplegada; validar lectura real antes de habilitar un usuario y
usar una copia de pruebas para validar edición contra ese despliegue.

Para detener: quitar la conexión del cliente y parar el proceso/servicio MCP.
No cambia los planes ni requiere restaurar libros. Revertir este directorio
retira la integración; conservar los recibos privados para conciliación.

## Cultivar el sistema

Cada adaptador futuro declara ID, versión, entidades, fuentes, unidades, permisos
y operaciones de negocio; añade pruebas con datos ficticios y registra impacto
en el atlas. Sala, CRM, obra, fotos y pagos aún no están implementados aquí.
Edición remota multiusuario requiere autorización MCP/OAuth y sesiones aisladas;
no se resuelve poniendo una llave maestra en este servidor público.

Referencias: [SDK oficial MCP](https://ts.sdk.modelcontextprotocol.io/server),
[arquitectura YOD](https://github.com/yodesarrollomx/yod-portal/tree/main/docs/arquitectura),
[fuente PPP2](../server/ppp2/PPP2.gs), [visor](../server/ppp2/Visor.gs).
