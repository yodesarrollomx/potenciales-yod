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

## Instalación (una sola vez)

1. Abrir la hoja «PPP 2 · Vivero (registro)» → **Extensiones → Apps Script**.
2. Nombre del proyecto: `PPP 2 · servidor`. Pegar `PPP2.gs` completo en `Código.gs` y guardar.
3. **Implementar → Nueva implementación → Aplicación web**: ejecutar como *Yo*, acceso *Cualquier
   usuario*. Es la primera implementación de un proyecto nuevo, por eso es «Nueva implementación».
4. Autorizar (hoja de cálculo, Drive y llamadas externas) con la cuenta de Dirección.
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

## Revertir

Administrar implementaciones → lápiz → elegir la versión anterior → Implementar. Para dejar el
servidor sólo en lectura sin tocar código: `Config!pausa = sí`.

## Pruebas

`node --test tests/ppp2-servidor.test.cjs` corre el servidor real con dobles de Apps Script y un
libro inventado (`tests/fixtures/ppp2-libro-ejemplo.json`). No hagas POST al `/exec` de
producción para «probar»: escribe en libros reales.
