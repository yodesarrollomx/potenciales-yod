# Portada de proyectos PPP · propuesta y alcance

Cambio de presentación bajo CHG-PPP-UI-001: la lista autenticada de proyectos pasa al primer plano. El mapa es una vista secundaria, aislada; los cinco motores quedan como accesos compactos para un análisis nuevo. Se eliminan explicaciones de cálculo y claves. Un proyecto puede tener varios registros: se agrupan únicamente nombres base iguales, preservando cada identificador y enlace. No se elige automáticamente una alternativa.

Fuentes: los cinco recursos `lista` siguen siendo la autoridad de los casos; `mapa` sólo aporta accesos de recuperación durante fallos de transporte. Un rechazo o vacío confirmado sigue siendo autoritativo. El archivo documental se integra en una pestaña privada del libro maestro existente y se enlaza desde la portada. No se publican nombres, cifras ni expedientes en Git, ni se crean casos con cifras de plantilla para representar documentos.

Invariantes: IDs, versiones, cálculos, guardado, permisos, sesión, URL de Apps Script y motor nativo intactos. Archivo documental con fuente y alcance, sin atribuir autoría ni contratación por tener un documento. Coincidencias dudosas permanecen separadas. Las propuestas históricas no equivalen a planes calculados.

Pruebas: regresiones unitarias, catálogo con identidad repetida, registros alternativos, sesión expirada, errores parciales, enlaces codificados; comprobaciones CSS de flujo y panel del mapa. Navegador y publicación se registran por separado.

Reversión: revertir presentación mediante PR. Conservar el inventario privado y todo el historial de negocio.
