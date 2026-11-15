import test from 'node:test';
import assert from 'node:assert/strict';
import { stat,readFile } from 'node:fs/promises';
import { setup, PLAN, LIGA, LECTOR, EDITOR, filaDe } from './helpers.mjs';
import { PppAdapter, parseLiga } from '../src/ppp.mjs';
import { YodError } from '../src/transport.mjs';
const change={accion:'dato',clave:'terreno.m2',valor:3200,estado:'supuesto',fuente:'Plano sintético de prueba'};
const apply=(a,p)=>a.apply({cambio_id:p.cambio_id,confirmacion:p.confirmacion});

test('visor: cifras iguales al servidor real, fuentes, versión, sin claves/expediente privado ni aperturas',async()=>{
  const {adapter,world,calls}=await setup({session:'',write:false,mode:'http'});
  const direct=world.get({recurso:'ppp2-visor',liga:LIGA});
  const r=await adapter.visor({liga:LIGA});
  assert.equal(r.data.v.ventas,direct.v.ventas);
  assert.equal(r.version,direct.version);
  assert.deepEqual(r.data.flujo,direct.flujo);
  assert.equal(r.origen.fuentes.v,'Resumen: v{version}.{clave}');
  assert.equal(r.naturaleza,'Proyección del Plan de Potencial; no ganancia realizada.');
  for(const key of ['ligas','libro_url','libro_id','yo','preguntas','consejo','palancas'])assert.ok(!(key in r.data),key);
  assert.ok(calls.every(c=>!c.params.k&&!c.params.abre));
});
test('una liga inválida no obtiene datos; no hay caché MCP tras revocar',async()=>{
  const {adapter,world}=await setup();
  await assert.rejects(adapter.visor({liga:LIGA+'x'}),{code:'liga'});
  await adapter.visor({liga:LIGA});
  assert.equal(world.post({tipo:'ppp2-liga',k:EDITOR,plan:PLAN,op:'apagar',liga:LIGA}).ok,true);
  await assert.rejects(adapter.visor({liga:LIGA}),{code:'liga'});
});
test('la selección efectiva se informa aunque el backend restrinja la versión solicitada',async()=>{
  const {adapter}=await setup(); const r=await adapter.visor({liga:LIGA,version:3});
  assert.equal(r.seleccion_solicitada.version,3);assert.equal(r.seleccion_efectiva.version,2);
});
test('una URL nunca elige el servidor ni admite destinos arbitrarios',()=>{
  assert.equal(parseLiga('https://yodesarrollomx.github.io/potenciales-yod/visor.html#l='+LIGA),LIGA);
  for(const url of ['http://localhost/'+LIGA,'https://evil.example/#l='+LIGA,'https://yodesarrollomx.github.io/otro#l='+LIGA])assert.throws(()=>parseLiga(url),{code:'liga_invalida'});
});
test('catálogo vacío por defecto y sólo entradas publicadas con liga vigente',async()=>{
  assert.equal((await (await setup()).adapter.opportunities()).data.oportunidades.length,0);
  const {adapter}=await setup({catalog:[{id:'ejemplo',publicada:true,liga:LIGA},{id:'oculto',publicada:false,liga:LIGA}]});
  const r=await adapter.opportunities();assert.equal(r.data.oportunidades.length,1);assert.equal(r.data.oportunidades[0].id,'ejemplo');
  assert.ok(!JSON.stringify(r).includes(LIGA));
  await assert.rejects(adapter.opportunity('oculto'),{code:'oportunidad_no_publicada'});
});
test('lector puede consultar, nunca preparar ni aplicar un cambio',async()=>{
  const {adapter,calls}=await setup({session:LECTOR});
  const r=await adapter.read({plan:PLAN,seccion:'datos',desde:0,limite:2});
  assert.equal(r.data.contenido.length,2);assert.ok(r.data.total>2);
  await assert.rejects(adapter.prepare({plan:PLAN,cambio:change}),{code:'permiso'});
  assert.equal(calls.filter(c=>c.method==='POST').length,0);
});
test('catálogo consulta sólo una página acotada, devuelve cursor y conserva el orden',async()=>{
  const {adapter,calls}=await setup({catalog:Array.from({length:7},(_,i)=>({id:'ejemplo-'+i,publicada:true,liga:LIGA}))});
  const r=await adapter.opportunities('',0,5);
  assert.equal(calls.length,5);assert.equal(r.data.siguiente,5);
  assert.deepEqual(r.data.oportunidades.map(x=>x.id),['ejemplo-0','ejemplo-1','ejemplo-2','ejemplo-3','ejemplo-4']);
  const last=await adapter.opportunities('',5,5);
  assert.equal(calls.length,7);assert.equal(last.data.siguiente,null);
  await assert.rejects(adapter.opportunities('',0,100),{code:'paginacion_invalida'});
});
test('preparar no escribe; aplicar da recibo y relectura; repetir y reiniciar no duplica',async()=>{
  const {adapter,calls,config,transport,journal}=await setup();
  const p=await adapter.prepare({plan:PLAN,cambio:change});
  assert.equal(calls.filter(c=>c.method==='POST').length,0);
  assert.equal((await stat(journal.path(p.cambio_id))).mode&0o777,0o600);
  assert.ok(!(await readFile(journal.path(p.cambio_id),'utf8')).includes(EDITOR));
  const r=await apply(adapter,p);assert.equal(r.estado,'verificado');assert.equal(r.resultado.comprobado,true);
  assert.equal(r.resultado.despues.valor,3200);
  await apply(adapter,p);
  await apply(new PppAdapter(config,transport,journal),p);
  assert.equal(calls.filter(c=>c.method==='POST').length,1);
  const sent=calls.find(c=>c.method==='POST').params;assert.equal(sent.rev,p.rev);assert.match(sent.request_id,/^mcp-/);
});
test('cambio simultáneo por API rechaza revisión obsoleta sin POST MCP',async()=>{
  const {adapter,world,calls}=await setup();const p=await adapter.prepare({plan:PLAN,cambio:change});
  world.post({k:EDITOR,tipo:'ppp2-dato',plan:PLAN,clave:'terreno.m2',valor:4000,fuente:'Otro autor'});
  await assert.rejects(apply(adapter,p),{code:'revision'});assert.equal(calls.filter(c=>c.method==='POST').length,0);
});
test('cambio directo en libro entre preparar y aplicar se detecta por huella aun con igual rev',async()=>{
  const {adapter,world,calls}=await setup();const p=await adapter.prepare({plan:PLAN,cambio:change});
  const h=world.libro.getSheetByName('Datos');h.getRange(filaDe(h,'terreno.m2'),3).setValue(5000);
  await assert.rejects(apply(adapter,p),{code:'revision'});assert.equal(calls.filter(c=>c.method==='POST').length,0);
});
test('dos aplicaciones concurrentes sólo reclaman un envío',async()=>{
  const {adapter,calls}=await setup();const p=await adapter.prepare({plan:PLAN,cambio:change});
  const r=await Promise.allSettled([apply(adapter,p),apply(adapter,p)]);
  assert.ok(r.some(x=>x.status==='fulfilled'));assert.equal(calls.filter(c=>c.method==='POST').length,1);
});
test('respuesta perdida conserva estado incierto y no vuelve a escribir',async()=>{
  const {adapter,calls}=await setup({fetchOverride:({world,params,opts})=>{
    if(opts.method==='POST'){world.post(params);throw Error('respuesta perdida con secreto');}
    return new Response(JSON.stringify(world.get(params)));
  }});
  const p=await adapter.prepare({plan:PLAN,cambio:change}),r=await apply(adapter,p);
  assert.equal(r.estado,'incierto');assert.equal(r.resultado.reenviar,false);
  await apply(adapter,p);assert.equal(calls.filter(c=>c.method==='POST').length,1);
  assert.ok(!JSON.stringify(r).includes('secreto'));
});
test('caída sólo en relectura conserva aplicado; nunca repite el POST',async()=>{
  let wrote=false;
  const {adapter,calls}=await setup({fetchOverride:({world,params,opts})=>{
    if(opts.method==='POST'){wrote=true;return new Response(JSON.stringify(world.post(params)));}
    if(wrote)throw Error('lectura perdida');return new Response(JSON.stringify(world.get(params)));
  }});
  const p=await adapter.prepare({plan:PLAN,cambio:change});assert.equal((await apply(adapter,p)).estado,'aplicado');
  await apply(adapter,p);assert.equal(calls.filter(c=>c.method==='POST').length,1);
});
test('rechaza campos inventados, fórmulas, unidades ambiguas y aprobación encubierta',async()=>{
  const {adapter,calls}=await setup();
  for(const c of [{...change,k:'inventado'},{...change,clave:'x.noexiste'},{...change,valor:'3,200'},
    {accion:'palanca',version:2,clave:'ventas',valor:500,razon:'test'},
    {accion:'palanca',version:1,clave:'obra_inicio',valor:2,razon:'test'},
    {accion:'version',version:2,campos:{estado:'vigente'},razon:'test'}])await assert.rejects(adapter.prepare({plan:PLAN,cambio:c}));
  assert.equal(calls.filter(c=>c.method==='POST').length,0);
});
test('un ID preparado está ligado a sesión y endpoint; confirmación exacta y vencimiento',async()=>{
  const {adapter,config,transport,journal}=await setup();const p=await adapter.prepare({plan:PLAN,cambio:change});
  await assert.rejects(apply(new PppAdapter({...config,session:LECTOR},transport,journal),p),{code:'cambio_de_otra_sesion'});
  await assert.rejects(adapter.apply({cambio_id:p.cambio_id,confirmacion:'sí'}),{code:'confirmacion_no_coincide'});
  const record=await journal.read(p.cambio_id);record.vence=0;await journal.update(record);
  await assert.rejects(apply(adapter,p),{code:'cambio_vencido'});
});
test('palanca, producto, pregunta, candado, reparto y versión usan contratos nativos',async()=>{
  for(const c of [
    {accion:'palanca',version:2,clave:'obra_inicio',valor:10,razon:'Calendario sintético'},
    {accion:'producto',fila:1,campos:{nombre:'Producto de prueba',fuente:'Ficha sintética'}},
    {accion:'responder',pregunta:'M01.Q01',estado:'respondida',respuesta:'Respuesta sintética',fuente:'Fuente de prueba'},
    {accion:'candado',id:'tenencia',estado:'cerrado',evidencia:'Escritura ficticia sólo de prueba'},
    {accion:'reparto',esquema:3,razon:'Alternativa de prueba'}
  ]) {
    const {adapter}=await setup();const p=await adapter.prepare({plan:PLAN,cambio:c});const r=await apply(adapter,p);
    assert.equal(r.estado,'verificado',c.accion+JSON.stringify(r));
  }
});
test('versiones: escribe el campo nativo; no finge verificación si el doble no recalcula Resumen',async()=>{
  const {adapter,world}=await setup();
  const p=await adapter.prepare({plan:PLAN,cambio:{accion:'version',version:2,campos:{nombre:'Alternativa sintética'},razon:'Organización'}});
  const r=await apply(adapter,p);assert.equal(r.estado,'aplicado');assert.equal(r.resultado.comprobado,false);
  const h=world.libro.getSheetByName('Versiones');assert.equal(h.getRange(filaDe(h,'nombre'),4).getValue(),'Alternativa sintética');
});
