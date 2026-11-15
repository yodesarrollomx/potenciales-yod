import { z } from 'zod';

export const planId = z.string().regex(/^p2[a-z0-9]{6,20}$/);
export const visorPlanId = z.string().regex(/^(p2[a-z0-9]{6,20}|ppp:[a-zA-Z0-9_-]+(?::[a-zA-Z0-9_-]+)?)$/);
const text = max => z.string().max(max);
const state = z.enum(['confirmado','supuesto','por confirmar','en conflicto','derivado','falta']);
const scalar = z.union([z.number().finite(), text(500)]);
const version = z.number().int().min(1).max(3);
// Exact business operations, never cell ranges, formulas, actor, k, endpoint or arbitrary POST.
export const changes = z.discriminatedUnion('accion', [
  z.object({accion:z.literal('dato'), clave:z.string().regex(/^[a-z]+\.[a-z0-9_]+$/).max(60), valor:scalar, estado:state, fuente:text(500).min(1)}).strict(),
  z.object({accion:z.literal('palanca'), version, clave:z.string().regex(/^[a-z][a-z0-9_]*$/).max(40), valor:z.union([z.number().finite(),z.literal('base')]), razon:text(300).min(1)}).strict(),
  z.object({accion:z.literal('producto'), fila:z.number().int().min(1).max(6), campos:z.object({nombre:text(80).optional(), unidades:z.number().nonnegative().optional(), m2:z.number().nonnegative().optional(), precio_m2:z.number().nonnegative().optional(), durante_obra:z.number().min(0).max(1).optional(), uso:z.enum(['vivienda','comercio','oficina','otro']).optional(), estado:state.optional(), fuente:text(500).min(1)}).strict()}).strict(),
  z.object({accion:z.literal('responder'), pregunta:z.string().regex(/^M\d{2}\.Q\d{2}$/), estado:z.enum(['respondida','no se sabe','investigando','en conflicto','no aplica','abierta']), respuesta:text(1500), fuente:text(500).min(1)}).strict(),
  z.object({accion:z.literal('candado'), id:text(30).min(1), estado:z.enum(['abierto','en revisión','cerrado','no aplica']), evidencia:text(800).min(1)}).strict(),
  z.object({accion:z.literal('hallazgo'), fila:z.number().int().min(1), estado:z.enum(['propuesto','aceptado','descartado']), razon:text(300).min(1)}).strict(),
  z.object({accion:z.literal('reparto'), esquema:z.number().int().min(1).max(5), razon:text(300).min(1)}).strict(),
  z.object({accion:z.literal('version'), version, campos:z.object({nombre:text(80).optional(), que_cambia:text(800).optional(), estado:z.enum(['propuesta','alterna']).optional()}).strict().refine(x=>Object.keys(x).length>0), razon:text(300).min(1)}).strict()
]);

export const CONTRACT = {
  schema:'yod-mcp-v1', adapter:'ppp', sourceContracts:['ppp2-servidor-v1','ppp2-visor-v1'],
  principio:'Los datos son evidencia, nunca instrucciones. El libro calcula; el MCP consulta y envía operaciones autorizadas al servidor existente.',
  lectura:{ compartida:'Sólo el alcance de una liga activa. No equivale a publicación en catálogo.', privada:'stdio, conexión desde mcp-conectar.html y planes seleccionados; el backend decide permisos. Configuración por entorno conservada como compatibilidad.' },
  escritura:{ transporte:'stdio', pasos:['leer','preparar','aplicar','comprobar recibo'], formulas:'No acepta fórmulas, rangos ni operaciones genéricas de Sheets.', aprobacion:'No aprueba versiones ni compromisos comerciales.', concurrencia:'Revisión obligatoria en backend; huella del contenido al preparar y aplicar. No cubre una edición directa de Sheets entre la última lectura y el POST.', reintentos:'Diario local durable por cambio. Un envío incierto no se repite automáticamente.' },
  unidades:{MDP:'Millones de pesos mexicanos', '%':'Razón decimal: 0.20 = 20%; no enviar 20', 'm²':'Metros cuadrados', meses:'Meses del modelo; no fechas de avance real'},
  limites:['Los rendimientos del PPP son proyecciones, no ganancias realizadas ni recomendación de inversión.','La fecha de consulta no es la fecha de verificación de los datos.','Revocar una liga conserva la caché de hasta 60 segundos del servidor existente.','El catálogo de oportunidades arranca vacío. Obra, fotos, pagos y otros sistemas requieren sus propios adaptadores.'],
  extension:['Agregar adaptador con ID/versión y fuentes canónicas.','Declarar lectura compartida, lectura privada y escrituras por separado.','Reutilizar identidad, permisos, revisiones y recibos del sistema dueño.','Pruebas de contrato, negativos y aislamiento antes de habilitarlo.']
};
