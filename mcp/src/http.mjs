import express from 'express';
import { pathToFileURL } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { hostHeaderValidation } from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js';
import { loadConfig } from './config.mjs';
import { PppTransport } from './transport.mjs';
import { PppAdapter } from './ppp.mjs';
import { createServer, SERVER_VERSION } from './server.mjs';

export function createApp(config, { transport, hosts=['localhost','127.0.0.1'], origins=[] }={}) {
  if (config.session || config.write || config.mode!=='http') throw Error('http_solo_lectura_compartida');
  const app=express(); app.disable('x-powered-by');
  app.use(hostHeaderValidation(hosts));
  app.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    if (req.headers.origin && !origins.includes(req.headers.origin)) return res.status(403).json({error:'origen_no_autorizado'});
    if (req.headers.origin) {res.set('Access-Control-Allow-Origin',req.headers.origin);res.set('Vary','Origin');}
    next();
  });
  app.get('/healthz',(_req,res)=>res.json({ok:true,service:'yod-os-mcp',version:SERVER_VERSION,mode:'shared-read-only'}));
  app.get('/',(_req,res)=>res.json({servicio:'MCP YOD OS',version:SERVER_VERSION,endpoint:'/mcp',transporte:'Streamable HTTP',
    uso:'Conecta esta dirección terminada en /mcp en tu cliente MCP. Puedes preguntar por una liga del visor que te hayan compartido.',
    catalogo:'Sólo proyectos publicados explícitamente. No hay acceso al vivero privado ni edición desde esta dirección.',
    documentacion:'https://github.com/yodesarrollomx/potenciales-yod/tree/main/mcp'}));
  let active=0, windowStart=Date.now(), calls=0;
  app.use('/mcp',(req,res,next)=>{
    if (req.url.includes('?')) return res.status(400).json({error:'argumentos_solo_en_cuerpo'});
    if (Date.now()-windowStart>60000) {calls=0;windowStart=Date.now();}
    if (++calls>120 || active>=8) return res.status(429).set('Retry-After','60').json({error:'limite_temporal'});
    next();
  });
  app.options('/mcp',(_req,res)=>res.set({'Access-Control-Allow-Methods':'POST, GET, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type, MCP-Protocol-Version, MCP-Session-Id, Accept','Access-Control-Expose-Headers':'MCP-Session-Id'}).sendStatus(204));
  app.use(express.json({limit:'64kb'}));
  app.post('/mcp',async(req,res)=>{
    active++;
    const adapter=new PppAdapter(config,transport||new PppTransport(config.endpoint));
    const server=createServer(adapter);
    const wire=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    let closed=false;
    const close=()=>{if(closed)return;closed=true;active--;void wire.close();void server.close();};
    res.on('close',close);
    try {await server.connect(wire);await wire.handleRequest(req,res,req.body);}
    catch {if(!res.headersSent)res.status(500).json({jsonrpc:'2.0',id:null,error:{code:-32603,message:'Error interno'}});close();}
  });
  app.get('/mcp',(_req,res)=>res.status(405).set('Allow','POST').json({jsonrpc:'2.0',id:null,error:{code:-32000,message:'Usa POST Streamable HTTP; no hay stream persistente.'}}));
  app.delete('/mcp',(_req,res)=>res.status(405).set('Allow','POST').json({jsonrpc:'2.0',id:null,error:{code:-32000,message:'Sin sesiones HTTP persistentes.'}}));
  app.use((err,_req,res,_next)=>res.status(err.type==='entity.too.large'?413:400).json({error:'solicitud_invalida'}));
  return app;
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const config=await loadConfig(process.env,'http');
    const hosts=(process.env.YOD_MCP_HOSTS||process.env.RENDER_EXTERNAL_HOSTNAME||'localhost,127.0.0.1').split(',').map(x=>x.trim()).filter(Boolean);
    const origins=(process.env.YOD_MCP_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
    const port=Number(process.env.PORT||8788);
    if(!Number.isInteger(port)||port<1||port>65535)throw Error();
    const http=createApp(config,{hosts,origins}).listen(port,process.env.RENDER?'0.0.0.0':(process.env.HOST||'127.0.0.1'),()=>console.error('YOD MCP HTTP listo (sólo lectura compartida).'));
    process.on('SIGTERM',()=>{http.close();setTimeout(()=>process.exit(0),25000).unref();});
  } catch {console.error('YOD MCP HTTP no inició: configuración inválida; nunca admite una sesión privada.');process.exitCode=1;}
}
