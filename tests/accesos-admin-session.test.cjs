'use strict';
// Ejecuta el script inline completo del HTML real. DOM y red exclusivamente sintéticos.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(process.env.ACCESOS_HTML || path.join(__dirname,'../accesos.html'),'utf8');
const source = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(x=>x.trim()).join('\n');
const KEY='pyod_clave_v1', A='sy-prefijo-igual-000000000-A', B='sy-prefijo-igual-000000000-B';
const ORIGINAL='https://original.invalid/exec', BACKUP='https://backup.invalid/exec';
const user=(overrides={})=>({correo:'persona@example.invalid',nombre:'Persona sintética',rol:'editor',boards:'DP,MA,TM',estado:'activo',sesiones_vivas:1,visitas_n:2,...overrides});
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function harness({key=A,search='',cacheRol='admin',loading=false}={}) {
  const store=new Map(key?[[KEY,key]]:[]), cache=new Map([['pyod_rol',JSON.stringify({f:A.slice(0,14),rol:cacheRol})]]);
  store.set('pyod_portero_activo',BACKUP);
  const nodes=new Map(),events={},docEvents={},requests=[],intervals=[],timers=new Map();let timerId=0;
  function attrs(text){const out={};for(const m of text.matchAll(/([\w-]+)="([^"]*)"/g))out[m[1]]=m[2].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');return out;}
  function element(tag='div',attributes={}){
    let inner='',txt='',children=[];const classes=new Set();const listeners={};
    const n={tag,dataset:{},value:attributes.value||'',disabled:false,checked:false,className:'',hidden:false,
      classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},
      addEventListener:(type,fn)=>listeners[type]=fn,emit:(type)=>listeners[type]?.({target:n}),focus:()=>{},
      closest:()=>n.parent,
      querySelectorAll:selector=>{const descendants=children.flatMap(c=>[c,...c.querySelectorAll('*')]);return descendants.filter(c=>selector==='*'||(selector==='input[type=checkbox]'&&c.tag==='input')||(selector.startsWith('[data-')&&selector.slice(1,-1) in c.attributes));},
      attributes, get children(){return children;},
      get innerHTML(){return inner;},set innerHTML(v){inner=v;txt='';children=[];
        if(v.includes('<tr')){for(const row of v.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)){const tr=element('tr',attrs(row[1]));tr.parent=n;children.push(tr);tr.innerHTML=row[2];}}
        else for(const m of v.matchAll(/<(input|button)\b([^>]*)>([^<]*)/g)){const c=element(m[1],attrs(m[2]));c.parent=n;c.checked=/\bchecked\b/.test(m[2]);c.disabled=/\bdisabled\b/.test(m[2]);c.textContent=m[3];children.push(c);}
      },
      get textContent(){return txt;},set textContent(v){txt=v;inner='';children=[];}
    };
    for(const [k,v] of Object.entries(attributes))if(k.startsWith('data-'))n.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=v;
    return n;
  }
  for(const m of html.matchAll(/\bid="([^"]+)"/g)){const n=element();n.id=m[1];nodes.set(n.id,n);}
  const ctx={console,URLSearchParams,AbortController,crypto:{randomUUID:()=> 'synthetic-request-id'},confirm:()=>true,
    localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
    sessionStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)},
    location:{search},navigator:{clipboard:{writeText:async()=>{}}},
    document:{readyState:loading?'loading':'complete',getElementById:id=>nodes.get(id)||null,addEventListener:(t,fn)=>(docEvents[t]??=[]).push(fn)},
    window:{YOD_PORTERO:{original:ORIGINAL,respaldo:BACKUP},YodAccessPolicy:{canOpen:(b,id)=>id==='SYS-DESPACHO'&&b.includes('DP')},addEventListener:(t,fn)=>events[t]=fn,open:()=>{}},
    setInterval:fn=>{intervals.push(fn);return intervals.length;},
    setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),
    fetch:(url,options={})=>new Promise((resolve,reject)=>{const u=new URL(url),body=options.body?JSON.parse(options.body):null;
      options.signal?.addEventListener('abort',()=>reject(Object.assign(new Error('Cancelado por tiempo de espera'),{name:'AbortError'})),{once:true});
      requests.push({url,options,body,resource:u.searchParams.get('recurso')||body?.tipo,token:u.searchParams.get('t')||u.searchParams.get('k')||body?.k,
        resolve:(data)=>resolve({status:200,text:async()=>typeof data==='string'?data:JSON.stringify(data)}),reject});})
  };
  vm.createContext(ctx);vm.runInContext(source,ctx,{filename:'accesos.html'});
  return {ctx,store,cache,nodes,requests,events,timers,
    ready:()=>docEvents.DOMContentLoaded?.forEach(fn=>fn()),
    tick:async()=>{intervals.forEach(fn=>fn());await flush();},
    change:async(token,storage=false)=>{if(token)store.set(KEY,token);else store.delete(KEY);if(storage)events.storage?.({key:KEY});else intervals.forEach(fn=>fn());await flush();},
    respond:async(index,data)=>{assert.ok(requests[index],'solicitud '+index+' presente');requests[index].resolve(data);await flush();},
    fill:()=>{nodes.get('aCorreo').value='alta@example.invalid';nodes.get('aNombre').value='Alta sintética';nodes.get('aRol').value='editor';nodes.get('aBoards').value='DP,TM';nodes.get('aBoards').emit('input');}
  };
}
async function allow(h,users=[user()]){await h.respond(0,{ok:true,rol:'admin'});await h.respond(1,{ok:true,usuarios:users});}
const denied=h=>assert.equal(h.nodes.get('aBtn').disabled,true);
const privateEmpty=h=>{assert.doesNotMatch(h.nodes.get('lista').innerHTML,/persona@example/);assert.doesNotMatch(h.nodes.get('matriz').innerHTML,/persona@example/);assert.equal(h.nodes.get('uCnt').textContent,'');denied(h);};
test('Caché admin obsoleta no evita canje ni concede lista a rol vista',async()=>{
  const h=harness();assert.equal(h.requests[0].resource,'canje');denied(h);
  await h.respond(0,{ok:true,rol:'vista'});assert.equal(h.requests.length,1);privateEmpty(h);
});
test('Caché vista obsoleta no bloquea admin reconocido por servidor',async()=>{
  const h=harness({cacheRol:'vista'});await allow(h);h.fill();assert.equal(h.nodes.get('aBtn').disabled,false);assert.equal(h.requests[1].resource,'accesos-lista');
});
test('Tokens de prefijo común se canjean completos por separado',async()=>{
  assert.equal(A.slice(0,14),B.slice(0,14));const h=harness();await h.respond(0,{ok:true,rol:'vista'});await h.change(B);
  assert.equal(h.requests[1].token,B);await h.respond(1,{ok:true,rol:'admin'});assert.equal(h.requests[2].token,B);
});
for(const response of [{ok:true,rol:'admin'},{ok:false,error:'revocado'}])test('Canje tardío '+JSON.stringify(response)+' no afecta sesión nueva',async()=>{
  const h=harness();await h.change(B);await h.respond(1,{ok:true,rol:'vista'});const view=h.nodes.get('lista').innerHTML;
  await h.respond(0,response);assert.equal(h.nodes.get('lista').innerHTML,view);assert.equal(h.store.get(KEY),B);assert.equal(h.requests.length,2);denied(h);
});
test('Generación descarta canje de A tras cambio A/B/A',async()=>{
  const h=harness();await h.change(B);await h.change(A);await h.respond(2,{ok:true,rol:'vista'});await h.respond(0,{ok:true,rol:'admin'});assert.equal(h.requests.length,3);denied(h);
});
for(const token of [B,''])test('Listado tardío no repinta tras '+(token?'cambio':'logout'),async()=>{
  const h=harness();await h.respond(0,{ok:true,rol:'admin'});await h.change(token);await h.respond(1,{ok:true,usuarios:[user()]});privateEmpty(h);
});
test('Error tardío de listado no limpia la lista de la nueva sesión admin',async()=>{
  const h=harness();await h.respond(0,{ok:true,rol:'admin'});await h.change(B);await h.respond(2,{ok:true,rol:'admin'});await h.respond(3,{ok:true,usuarios:[user({nombre:'Nueva persona'})]});
  h.requests[1].reject(Error('offline anterior'));await flush();assert.match(h.nodes.get('lista').innerHTML,/Nueva persona/);
});
test('Cambio en misma pestaña limpia matriz, controles, mensajes y modal; acciones viejas no escriben',async()=>{
  const h=harness();await allow(h);h.fill();const old=h.nodes.get('lista').querySelectorAll('[data-rea]');
  const action=h.nodes.get('lista').querySelectorAll('[data-liga]')[0];h.nodes.get('ligaOv').classList.add('on');h.nodes.get('ligaUrl').textContent='liga sintética';h.nodes.get('toast').textContent='viejo';
  await h.change(B);privateEmpty(h);assert.equal(h.nodes.get('ligaOv').classList.contains('on'),false);assert.equal(h.nodes.get('ligaUrl').textContent,'');assert.equal(h.nodes.get('toast').textContent,'');assert.equal(h.nodes.get('aCorreo').value,'');
  await action.onclick();assert.equal(h.requests.filter(r=>r.body).length,0);assert.equal(old.length,0);
});
test('Logout en otra pestaña limpia y no consulta sin token',async()=>{
  const h=harness();await allow(h);await h.change('',true);privateEmpty(h);await h.tick();assert.equal(h.requests.length,2);
});
test('Login tardío desde estado sin sesión valida antes de listar',async()=>{
  const h=harness({key:''});assert.equal(h.requests.length,0);denied(h);await h.change(B);assert.equal(h.requests[0].token,B);await allow(h);
});
test('Entrada ?sesion espera DOM y consumo por Portero antes de usar token nuevo',async()=>{
  const h=harness({loading:true,search:'?sesion='+B});assert.equal(h.requests.length,0);h.ready();await h.tick();assert.equal(h.requests.length,0);
  h.store.set(KEY,B);h.ctx.location.search='';await h.tick();assert.equal(h.requests[0].token,B);await allow(h);
});
test('Entrada ?liga espera activación y recarga; nunca administra con sesión guardada',async()=>{
  const h=harness({loading:true,search:'?liga=lg-synthetic'});h.ready();await h.tick();assert.equal(h.requests.length,0);
  h.store.set(KEY,B);h.ctx.location.search='';await h.tick();assert.equal(h.requests.length,0);
  const reloaded=harness({key:B});assert.equal(reloaded.requests[0].token,B);await allow(reloaded);
});
test('Backup guardado se elimina y todas las solicitudes usan ORIGINAL sin persistir destino',async()=>{
  const h=harness();assert.equal(h.store.has('pyod_portero_activo'),false);await allow(h);h.fill();const p=h.nodes.get('aBtn').onclick();await h.respond(2,{ok:true});await p;
  assert.ok(h.requests.every(r=>r.url.startsWith(ORIGINAL)));assert.equal(h.store.has('pyod_portero_activo'),false);
});
for(const resource of ['canje','accesos-lista'])test('Rechazo explícito ORIGINAL en '+resource+' se conserva sin fallback',async()=>{
  const h=harness();if(resource==='accesos-lista')await h.respond(0,{ok:true,rol:'admin'});
  await h.respond(resource==='canje'?0:1,{ok:false,error:'revocado'});await h.tick();assert.match(h.nodes.get('lista').innerHTML,/revocado/);assert.equal(h.requests.length,resource==='canje'?1:2);denied(h);
});
for(const data of ['<html>accounts.google Sign in</html>',null])test('Fallo ORIGINAL '+(data?'HTML':'red')+' no intenta backup ni reintenta canje',async()=>{
  const h=harness();if(data)await h.respond(0,data);else{h.requests[0].reject(Error('offline'));await flush();}await h.tick();assert.equal(h.requests.length,1);denied(h);assert.equal(h.store.get(KEY),A);
});
test('DP permanece en matriz y preview; checkbox conserva códigos no dibujados y upsert completo',async()=>{
  const h=harness();await allow(h);assert.match(h.nodes.get('matriz').innerHTML,/data-code="DP" checked/);assert.match(h.nodes.get('matriz').innerHTML,/verá: Despacho/);
  const checks=h.nodes.get('matriz').querySelectorAll('input[type=checkbox]'),pt=checks.find(c=>c.dataset.code==='PT');pt.checked=true;const p=pt.onchange();
  assert.deepEqual(h.requests[2].body,{k:A,request_id:'synthetic-request-id',tipo:'acceso-alta',correo:user().correo,nombre:user().nombre,rol:'editor',boards:'PT,DP,MA,TM'});
  await h.respond(2,{ok:true,boards:'PT,DP,MA,TM'});await p;
});
test('Alta conserva correo/nombre/rol/boards y no reintenta escritura rechazada',async()=>{
  const h=harness();await allow(h);h.fill();const p=h.nodes.get('aBtn').onclick();await h.respond(2,{ok:false,error:'admin'});await p;await h.tick();
  assert.deepEqual(h.requests[2].body,{k:A,request_id:'synthetic-request-id',tipo:'acceso-alta',correo:'alta@example.invalid',nombre:'Alta sintética',rol:'editor',boards:'DP,TM'});assert.equal(h.requests.length,3);assert.match(h.nodes.get('aMsg').textContent,/administrador/);
});
test('Escritura perdida no se reintenta',async()=>{
  const h=harness();await allow(h);h.fill();const p=h.nodes.get('aBtn').onclick();h.requests[2].reject(Error('ACK perdido'));await p;await h.tick();assert.equal(h.requests.length,3);assert.match(h.nodes.get('aMsg').textContent,/ACK perdido/);
});
test('Reactivar conserva nombre/editor/boards vacíos, sin convertirlos a todo',async()=>{
  const h=harness();await allow(h,[user({estado:'revocado',boards:''})]);const p=h.nodes.get('lista').querySelectorAll('[data-rea]')[0].onclick();
  assert.equal(h.requests[2].body.nombre,user().nombre);assert.equal(h.requests[2].body.rol,'editor');assert.equal(h.requests[2].body.boards,'');await h.respond(2,{ok:true});await p;
});
for(const outcome of ['ok','reject'])test('Resultado '+outcome+' de escritura tras logout no reactiva controles ni muestra éxito',async()=>{
  const h=harness();await allow(h);h.fill();const p=h.nodes.get('aBtn').onclick();await h.change('');
  if(outcome==='ok')await h.respond(2,{ok:true});else h.requests[2].reject(Error('offline'));await p;privateEmpty(h);assert.equal(h.nodes.get('aMsg').textContent,'');assert.equal(h.nodes.get('toast').textContent,'');assert.equal(h.requests.length,3);
});
test('Liga directa tardía tras cambio no abre modal ni copia la liga',async()=>{
  const h=harness();await allow(h);let copies=0;h.ctx.navigator.clipboard.writeText=async()=>copies++;
  const p=h.nodes.get('lista').querySelectorAll('[data-liga]')[0].onclick();await h.change(B);await h.respond(2,{ok:true,liga:'https://synthetic.invalid/'});await p;
  assert.equal(copies,0);assert.equal(h.nodes.get('ligaOv').classList.contains('on'),false);
});
test('Cambio de rol conserva campos completos de la fila sin perder DP ni códigos adicionales',async()=>{
  const h=harness();await allow(h,[user({rol:'admin'})]);const p=h.nodes.get('lista').querySelectorAll('[data-rol]')[0].onclick();
  assert.deepEqual(h.requests[2].body,{k:A,request_id:'synthetic-request-id',tipo:'acceso-alta',correo:user().correo,nombre:user().nombre,rol:'vista',boards:'DP,MA,TM'});await h.respond(2,{ok:true});await p;
});
test('Canje tardío tras logout no habilita ni lista',async()=>{
  const h=harness();await h.change('');await h.respond(0,{ok:true,rol:'admin'});privateEmpty(h);assert.equal(h.requests.length,1);
});
test('Generación descarta listado antiguo incluso al volver al mismo token A',async()=>{
  const h=harness();await h.respond(0,{ok:true,rol:'admin'});await h.change(B);await h.change(A);await h.respond(3,{ok:true,rol:'vista'});await h.respond(1,{ok:true,usuarios:[user()]});privateEmpty(h);
});
test('Sólo el listado más reciente de la misma sesión puede pintar',async()=>{
  const h=harness();await allow(h);h.fill();const p=h.nodes.get('aBtn').onclick();await h.respond(2,{ok:true});await p;
  h.fill();const q=h.nodes.get('aBtn').onclick();await h.respond(4,{ok:true});await q;
  await h.respond(5,{ok:true,usuarios:[user({nombre:'Última lista'})]});await h.respond(3,{ok:true,usuarios:[user({nombre:'Lista vieja'})]});assert.match(h.nodes.get('lista').innerHTML,/Última lista/);assert.doesNotMatch(h.nodes.get('lista').innerHTML,/Lista vieja/);
});
for(const resource of ['canje','accesos-lista'])test('Lectura '+resource+' vencida limpia controles sin cambiar token ni reintentar sola',async()=>{
  const h=harness();if(resource==='accesos-lista')await h.respond(0,{ok:true,rol:'admin'});
  const count=h.requests.length,last=h.requests.at(-1);
  for(const timer of [...h.timers.values()])if(timer.ms===20000)timer.fn();await flush();
  assert.equal(last.options.signal.aborted,true);privateEmpty(h);assert.equal(h.store.get(KEY),A);await h.tick();assert.equal(h.requests.length,count);
  await h.respond(count-1,{ok:true,rol:'admin',usuarios:[user()]});privateEmpty(h);
});
test('Reintento manual vuelve a canjear sin caché y sólo lista tras confirmar admin',async()=>{
  const h=harness();await h.respond(0,{ok:true,rol:'vista'});h.nodes.get('aRetry').onclick();await flush();assert.equal(h.requests[1].resource,'canje');denied(h);
  await h.respond(1,{ok:true,rol:'admin'});await h.respond(2,{ok:true,usuarios:[user()]});h.fill();assert.equal(h.nodes.get('aBtn').disabled,false);assert.equal(h.requests.filter(r=>r.body).length,0);
  await h.change('');assert.equal(h.nodes.get('aRetry').disabled,true);
});
