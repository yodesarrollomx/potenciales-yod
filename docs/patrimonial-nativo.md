# Patrimonial nativo por caso

Contrato `CTR-PPP-PATRIMONIAL-NATIVO`, propuesta `CHG-PPP-PATRIMONIAL-001`, Atlas `2026-10-01.28-chinches-complementos`.

`PPP_LIBROS` registra cada caso y su libro privado con revisión `patrimonial-sheet-v1`. El registro usa tipo `patrimonial`. Las versiones conservan sus IDs, nombre, base y activa; la fila histórica y las fuentes permanecen intactas. Crear un libro es una migración autorizada con fuentes verificadas, no una prueba del endpoint.

La plantilla genérica está en `patrimonial-sheet-schema.json`. `Campos!A:K` define ID, fila, columna, mínimo, máximo, paso, editable, nullable, tipo, unidad y fuente. Hay 269 campos: 29 controles y cuatro capturas por cada una de 60 puertas. Los límites numéricos son rangos operativos de captura, no límites legales aprobados.

Cada `V_<id>` conserva entradas en B8:B36, resultados en F8:G61, puertas en J8:M67 y resultados/fuentes por puerta en N8:Q67. T8:AB32 contiene hasta 25 años; T40:W339, 300 meses de deuda. Las fórmulas determinan construcción = terreno × CUS, capacidad rentable = construcción × (1 − pasillos% / 100), y promedio = capacidad rentable / puertas. El detalle conserva área y renta individual; un cero capturado se conserva. Una celda vacía usa el promedio o renta global con su fuente explícita.

CUS/terreno faltantes o no positivos mantienen geometría pendiente. Pasillos 0% es válido. Una mezcla superior a la capacidad muestra `EXCEDE_CUS`, conserva la captura y deja pendientes los resultados financieros. CUS es un supuesto que requiere fuente; el modelo no acredita autorización urbanística.

`pppLeerLibro_` devuelve `modelo_tipo: patrimonial`, `campos`, entradas, estados, años y puertas leídos del libro. Esta rama no exige el `horizonPass` vertical ni reutiliza sus coordenadas. La lectura vertical original queda intacta. El presentador nativo usa ese estado y evita ejecutar el motor financiero legacy para los casos registrados; los demás casos conservan su ruta histórica.

`sheet-cantidades` acepta únicamente campos editables, números dentro del rango/tipo y `null` donde Campos lo permite. Mantiene revisión esperada, idempotencia, lock del servidor y auditoría. Las versiones duplicadas exponen solo celdas literales permitidas y conservan fórmulas protegidas. La protección de Google Sheets depende de los permisos del propietario; CAS serializa los escritores del endpoint y detecta una revisión directa anterior a la escritura.

Los cambios se muestran como pendientes hasta leer una respuesta válida. Un conflicto o falta de conexión conserva la última lectura y las cantidades. Un borrador restaurado necesita lectura fresca antes de enviar. Cambiar de caso descarta respuestas tardías del caso anterior. Los metadatos usan su propia revisión de fila y las cantidades no se reenvían como un resumen calculado por el navegador.

Las pruebas públicas usan datos sintéticos. Los libros, fuentes, backend GAS, snapshots y evidencia real permanecen privados. El despliegue actualiza la versión del mismo `/exec`, revalida editor/versión/ACL y conserva trabajo pendiente separado. Rollback: revertir frontend por PR y recuperar la versión anterior del despliegue existente; conservar libro, registro, fuentes e historial.
