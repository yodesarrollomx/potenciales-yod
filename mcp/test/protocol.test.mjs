import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createServer } from '../src/server.mjs';
import { createApp } from '../src/http.mjs';
import { loadConfig } from '../src/config.mjs';
import { setup,LIGA } from './helpers.mjs';

test('SDK cliente real descubre herramientas/recursos/prompts y lee visor del servidor PPP',async()=>{
  const {adapter}=await setup({session:'',write:false,mode:'http'}),server=createServer(adapter);
  const [s,c]=InMemoryTransport.createLinkedPair(); const client=new Client({name:'prueba',version:'1'});
  try {
    await server.connect(s);await client.connect(c);
    const list=await client.listTools();assert.equal(list.tools.length,4);assert.ok(list.tools.every(t=>t.annotations.readOnlyHint));
    assert.equal((await client.listResources()).resources[0].uri,'yod://contrato');
    assert.equal((await client.listPrompts()).prompts[0].name,'analizar-plan');
    const r=await client.callTool({name:'ppp_leer_visor',arguments:{liga:LIGA}});assert.equal(r.isError,undefined);assert.equal(r.structuredContent.version,2);
    const bad=await client.callTool({name:'ppp_leer_visor',arguments:{liga:LIGA,k:'sesecreto'}});assert.equal(bad.isError,true);
    const forbidden=await client.callTool({name:'ppp_aplicar_cambio',arguments:{}});assert.equal(forbidden.isError,true);
  } finally {await client.close();await server.close();}
});
test('stdio se inicializa con SDK real sin credenciales ni datos de producción',async()=>{
  const client=new Client({name:'prueba-stdio',version:'1'});
  const transport=new StdioClientTransport({command:process.execPath,args:[new URL('../src/stdio.mjs',import.meta.url).pathname],env:{PATH:process.env.PATH},stderr:'pipe'});
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length,4);
    const r=await client.callTool({name:'yod_capacidades',arguments:{}});
    assert.equal(r.structuredContent.transporte,'stdio');assert.equal(r.structuredContent.adaptadores[0].lectura_privada,false);
    assert.equal((await client.readResource({uri:'yod://contrato'})).contents.length,1);
  } finally {await client.close();}
});
test('Streamable HTTP real: iniciar, descubrir y consultar; bloquea host/origen/edición',async()=>{
  const {config,transport}=await setup({session:'',write:false,mode:'http'});
  const app=createApp(config,{transport});const http=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base=`http://127.0.0.1:${http.address().port}`,client=new Client({name:'prueba-http',version:'1'});
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp')));
    assert.equal((await client.listTools()).tools.length,4);
    const r=await client.callTool({name:'ppp_leer_visor',arguments:{liga:LIGA}});assert.equal(r.structuredContent.version,2);
    assert.equal((await fetch(base+'/healthz')).status,200);
    assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'})).status,403);
    const badHost=await new Promise((resolve,reject)=>{const r=request(base+'/healthz',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});r.on('error',reject);r.end();});
    assert.equal(badHost,403);
    assert.equal((await fetch(base+'/mcp')).status,405);
    assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
    assert.equal((await fetch(base+'/mcp?liga=secret',{method:'POST'})).status,400);
  } finally {await client.close();await new Promise(resolve=>http.close(resolve));}
});
test('configuración impide abrir sesión privada por HTTP y rechaza catálogos no publicados',async()=>{
  await assert.rejects(loadConfig({YOD_PORTERO_SESSION:'sy12345678901234567890'},'http'));
  await assert.rejects(loadConfig({YOD_MCP_WRITE:'1'},'http'));
  await assert.rejects(loadConfig({YOD_PORTERO_SESSION:'clave-maestra'},'stdio'));
  await assert.rejects(loadConfig({YOD_MCP_CATALOG_JSON:JSON.stringify([{id:'x',liga:LIGA,publicada:false}])},'http'));
  const r=await loadConfig({},'http');assert.equal(r.catalog.length,0);assert.equal(r.session,'');
});
