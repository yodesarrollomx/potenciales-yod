import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, stat, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readConnection,saveConnection,disconnect,startConnection,YOD_ORIGIN } from '../src/connection.mjs';
import { loadConfig } from '../src/config.mjs';
import { createServer } from '../src/server.mjs';
import { PppAdapter } from '../src/ppp.mjs';
import { installation } from '../src/cli.mjs';
import { setup,PLAN,EDITOR,LECTOR,ENDPOINT } from './helpers.mjs';

const grant=(session=EDITOR,write=true)=>({id:randomUUID(),session,write,plans:[PLAN],actor:{nombre:'Inventado'},createdAt:new Date().toISOString()});
function destination(flow) {
  const p=new URLSearchParams(new URL(flow.url).hash.slice(1));
  return {url:'http://127.0.0.1:'+p.get('puerto')+'/connect',headers:{Origin:YOD_ORIGIN,'Content-Type':'application/json','X-Yod-Conexion':p.get('reto')}};
}
test('alta real por HTTP local: origen y reto obligatorios, identidad de servidor y archivo privado',async()=>{
  const f=await setup(),flow=await startConnection({stateDir:f.config.stateDir,transport:f.transport}),d=destination(flow);
  const body=JSON.stringify({session:EDITOR,plans:[PLAN],write:true});
  try {
    for(const headers of [{...d.headers,Origin:'https://otro.example'},{...d.headers,'X-Yod-Conexion':'0'.repeat(64)},{...d.headers,'X-Yod-Conexion':'é'.repeat(64)}]) {
      assert.equal((await fetch(d.url,{method:'POST',headers,body})).status,403);
    }
    assert.equal(await readConnection(f.config.stateDir),null);assert.equal(f.calls.length,0);
    const pre=await fetch(d.url,{method:'OPTIONS',headers:d.headers});assert.equal(pre.status,204);
    assert.equal(pre.headers.get('Access-Control-Allow-Origin'),YOD_ORIGIN);
    const r=await fetch(d.url,{method:'POST',headers:d.headers,body}).then(r=>r.json());
    assert.equal(r.ok,true);assert.ok(!JSON.stringify(r).includes(EDITOR));
    assert.equal((await flow.completed).conectado,true);
    const stored=await readConnection(f.config.stateDir);assert.equal(stored.session,EDITOR);assert.notEqual(stored.actor.nombre,'Inventado');
    assert.equal((await stat(join(f.config.stateDir,'conexion.json'))).mode&0o777,0o600);
    assert.deepEqual(f.calls.map(c=>c.method),['GET']);
  } finally {flow.stop();}
});
test('lector no obtiene edición; un plan inventado no entra en el permiso',async()=>{
  for(const b of [{session:LECTOR,plans:[PLAN],write:true},{session:EDITOR,plans:['p2ajeno000'],write:false}]) {
    const f=await setup(),flow=await startConnection({stateDir:f.config.stateDir,transport:f.transport}),d=destination(flow);
    try {
      const r=await fetch(d.url,{method:'POST',headers:d.headers,body:JSON.stringify(b)}).then(r=>r.json());
      assert.equal(r.error,'permiso');assert.equal(await readConnection(f.config.stateDir),null);
    } finally {flow.stop();}
  }
});
test('cancelar durante validación no guarda una conexión tardía',async()=>{
  const f=await setup();let unlock,started;
  const ready=new Promise(r=>{started=r;}),hold=new Promise(r=>{unlock=r;});
  const flow=await startConnection({stateDir:f.config.stateDir,transport:{get:async q=>{started();await hold;return f.transport.get(q);}}}),d=destination(flow);
  const req=fetch(d.url,{method:'POST',headers:d.headers,body:JSON.stringify({session:EDITOR,plans:[PLAN],write:true})}).catch(()=>null);
  await ready;flow.stop();unlock();await req;
  await new Promise(r=>setTimeout(r,25));assert.equal(await readConnection(f.config.stateDir),null);
});
test('configuración actualiza permiso entre llamadas, sin mezclar identidad ni reiniciar MCP',async()=>{
  const f=await setup(),env={YOD_PPP_ENDPOINT:ENDPOINT,YOD_MCP_STATE_DIR:f.config.stateDir};
  const factory=async()=>new PppAdapter(await loadConfig(env),f.transport,f.journal);
  const server=createServer(await factory(),{adapterForRequest:factory}),client=new Client({name:'conexion',version:'1'});
  const [s,c]=InMemoryTransport.createLinkedPair();
  try {
    await server.connect(s);await client.connect(c);
    const call=(name,args={})=>client.callTool({name,arguments:args});
    assert.equal((await call('yod_estado')).structuredContent.conectado,false);
    assert.equal((await call('ppp_listar_planes')).isError,true);
    await saveConnection(f.config.stateDir,grant(EDITOR,false));
    assert.equal((await call('yod_estado')).structuredContent.edicion,false);
    assert.equal((await call('ppp_preparar_cambio',{plan:PLAN,cambio:{accion:'dato',clave:'terreno.m2',valor:3200,estado:'supuesto',fuente:'Ejemplo inventado'}})).structuredContent.error,'escritura_desactivada');
    await saveConnection(f.config.stateDir,grant());
    const state=(await call('yod_estado')).structuredContent;assert.equal(state.conectado,true);assert.equal(state.planes.length,1);
    const count=f.calls.length;
    assert.equal((await call('ppp_leer_plan',{plan:'p2ajeno000'})).structuredContent.error,'plan_no_conectado');assert.equal(f.calls.length,count);
    const proposal=(await call('ppp_preparar_cambio',{plan:PLAN,cambio:{accion:'dato',clave:'terreno.m2',valor:3200,estado:'supuesto',fuente:'Ejemplo inventado'}})).structuredContent;
    const receipt=(await call('ppp_aplicar_cambio',{cambio_id:proposal.cambio_id,confirmacion:proposal.confirmacion})).structuredContent;
    assert.equal(receipt.estado,'verificado');assert.match(receipt.url,/ppp2.html#\/plan\/p2ejemplo001$/);
    await disconnect(f.config.stateDir);
    assert.equal((await call('yod_estado')).structuredContent.conectado,false);
    assert.equal((await call('ppp_leer_plan',{plan:PLAN})).isError,true);
    assert.equal((await call('ppp_recibo_cambio',{cambio_id:proposal.cambio_id})).isError,true);
    assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
  } finally {await client.close();await server.close();}
});
test('archivo compartido o enlace simbólico no se utiliza como conexión',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'yod-permiso-'));await saveConnection(dir,grant());
  await chmod(join(dir,'conexion.json'),0o644);await assert.rejects(readConnection(dir));
  const dir2=await mkdtemp(join(tmpdir(),'yod-enlace-'));await symlink(join(dir,'conexion.json'),join(dir2,'conexion.json'));
  await assert.rejects(readConnection(dir2));
});
test('comandos de instalación conservan argumentos y perfil; no incluyen credenciales',()=>{
  const options={node:'/ruta con espacios/node',script:'/otra ruta/stdio.mjs',profile:'astra',stateDir:'/estado privado'};
  for(const client of ['codex','claude','hermes']) {
    const c=installation(client,options);assert.ok(c.args.includes(options.node));assert.ok(c.args.includes(options.script));
    assert.ok(!JSON.stringify(c).includes(EDITOR));assert.ok(c.args.includes('YOD_MCP_STATE_DIR=/estado privado'));
  }
  assert.throws(()=>installation('hermes'));assert.throws(()=>installation('otro'));
  assert.deepEqual(installation('hermes',options).args.slice(0,2),['-p','astra']);
});
test('Codex nativo registra en configuración aislada y conserva otro MCP',async t=>{
  const run=promisify(execFile);try{await run('codex',['--version']);}catch{t.skip('CLI Codex no instalada en este entorno');return;}
  const dir=await mkdtemp(join(tmpdir(),'yod-codex-config-'));
  const env={...process.env,CODEX_HOME:dir};
  await run('codex',['mcp','add','otro-servidor','--',process.execPath,'-e','void 0'],{env});
  const previous=(await run('codex',['mcp','get','otro-servidor','--json'],{env})).stdout;
  const c=installation('codex');await run(c.command,c.args,{env});
  const saved=JSON.parse((await run(c.command,c.check,{env})).stdout);
  assert.equal(saved.name,'yod-os-local');assert.equal(saved.transport.command,process.execPath);
  assert.equal((await run('codex',['mcp','get','otro-servidor','--json'],{env})).stdout,previous);
  assert.ok(!(await readFile(join(dir,'config.toml'),'utf8')).includes(EDITOR));
});
