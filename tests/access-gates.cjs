'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../portero.js'), 'utf8');
const start = source.indexOf('  // La sesión se valida en esta carga.');
const end = source.indexOf('\n})();', start);
assert.ok(start >= 0 && end > start, 'Bloque de sesión vigente presente');
const code = source.slice(start, end);
const KEY = 'pyod_clave_v1';
const A = 'sy-synthetic-session-A', B = 'sy-synthetic-session-B';
function harness({key = A, response = {ok:true,rol:'vista'}, page = 'mixto'} = {}) {
  const store = new Map(key ? [[KEY, key]] : []), cache = new Map();
  const nodes = new Map(), events = {}, timers = []; let calls = 0, prompts = 0, resizes = 0, reloads = 0;
  function node(id) {
    const classes = new Set();
    const n = {id, type:'', textContent:'', children:[], attributes:{}, hidden:false,
      classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
      style:{setProperty:(k,v)=>{n.style[k]=v;}},
      setAttribute:(k,v)=>{n.attributes[k]=v;},
      remove:()=>nodes.delete(n.id),
      querySelector:s=>s === '.gate-box, .mg-box' ? n.box : null,
      appendChild:c=>{n.children.push(c);if(c.id)nodes.set(c.id,c);}
    };
    if(id)nodes.set(id,n); return n;
  }
  ['gate','mapGate','yodLock'].forEach(id=>{node(id).box=node('');});
  node('porteroGate');
  const ctx = {console, LSC:KEY,pagina:page,SIN_GATE:false,MODO_SUAVE:false,
    localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
    sessionStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)},
    document:{readyState:'loading',getElementById:id=>nodes.get(id)||null,createElement:()=>node(''),body:node(''),addEventListener:()=>{}},
    window:{dispatchEvent:()=>{resizes++;}}, Event:function(type){this.type=type;},
    addEventListener:(name,fn)=>events[name]=fn, setTimeout:(f,ms)=>{timers.push({f,ms});return timers.length;},
    location:{reload:()=>reloads++}, overlayCorreo:()=>{prompts++;node('porteroGate');},
    pyodPide:async()=>{calls++;return typeof response==='function'?response():response;}
  };
  vm.createContext(ctx);vm.runInContext(code,ctx);
  return {ctx,store,cache,nodes,events,timers,stats:()=>({calls,prompts,resizes,reloads})};
}
const open=h=>h.nodes.get('gate').classList.contains('off');
test('Una sesión aceptada retira ambos candados sin alterar el permiso del shell',async()=>{
  const h=harness();await h.ctx.engraneAdmin();assert.ok(open(h));assert.ok(h.nodes.get('mapGate').classList.contains('off'));
  assert.equal(h.nodes.get('gate').style.display,'none');assert.equal(h.nodes.has('porteroGate'),false);
  assert.equal(h.nodes.get('yodLock').classList.contains('off'),false);assert.equal(h.store.get(KEY),A);assert.equal(h.stats().resizes,1);
});
test('Una caché heredada no concede acceso ni evita el canje',async()=>{
  const h=harness({response:{ok:false,error:'revocado'}});h.cache.set('pyod_rol',JSON.stringify({f:A.slice(0,14),rol:'admin'}));
  assert.equal(h.ctx.sesionYaValidada(),false);await h.ctx.engraneAdmin();assert.equal(open(h),false);assert.equal(h.stats().calls,1);assert.equal(h.stats().prompts,1);
});
test('Sin red se conserva la sesión, se ofrece reintento y no se abre otro login',async()=>{
  const h=harness({response:()=>{throw Error('offline');}});await h.ctx.engraneAdmin();assert.equal(open(h),false);
  assert.ok(h.nodes.has('pyodReintentar'));assert.equal(h.store.get(KEY),A);assert.equal(h.stats().prompts,0);
});
test('Portero reintenta automáticamente una sesión nueva sin red sin otro login',async()=>{
  let on=false;const h=harness({response:()=>on?{ok:true,rol:'vista'}:{ok:false,error:'servidor'}});
  await h.ctx.engraneAdmin();assert.equal(open(h),false);assert.equal(h.stats().prompts,0);
  assert.equal(h.timers.length,1);assert.equal(h.timers[0].ms,15000);
  on=true;h.timers[0].f();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(open(h),true);assert.equal(h.store.get(KEY),A);
});
test('Portero no vuelve a abrir sesión revocada durante un reintento',async()=>{
  let on=false;const h=harness({response:()=>on?{ok:false,error:'revocado'}:{ok:false,error:'servidor'}});
  await h.ctx.engraneAdmin();on=true;h.timers[0].f();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(open(h),false);assert.equal(h.timers.length,1);assert.equal(h.stats().prompts,1);
});
test('Respuesta aceptada tardía no afecta a otra persona',async()=>{
  let finish;const h=harness({response:()=>new Promise(r=>finish=r)});const p=h.ctx.engraneAdmin();h.store.set(KEY,B);finish({ok:true,rol:'admin'});await p;
  assert.equal(open(h),false);assert.equal(h.nodes.has('engraneBtn'),false);assert.equal(h.store.get(KEY),B);
});
test('Rechazo tardío no borra ni bloquea la sesión que la sustituyó',async()=>{
  let finish;const h=harness({response:()=>new Promise(r=>finish=r)});const p=h.ctx.engraneAdmin();h.store.set(KEY,B);finish({ok:false,error:'liga'});await p;
  assert.equal(h.store.get(KEY),B);assert.equal(h.stats().prompts,0);
});
test('Cerrar sesión durante el canje impide retirar candados',async()=>{
  let finish;const h=harness({response:()=>new Promise(r=>finish=r)});const p=h.ctx.engraneAdmin();h.store.delete(KEY);finish({ok:true,rol:'admin'});await p;assert.equal(open(h),false);
});
test('Solo se aplica la validación más reciente',async()=>{
  const resolvers=[];const h=harness({response:()=>new Promise(r=>resolvers.push(r))});
  const p=h.ctx.engraneAdmin(),q=h.ctx.engraneAdmin();resolvers[1]({ok:false,error:'liga'});await q;resolvers[0]({ok:true,rol:'admin'});await p;assert.equal(open(h),false);
});
test('Sin credencial no se consulta el backend ni se abre el board',async()=>{
  const h=harness({key:''});await h.ctx.engraneAdmin();assert.equal(h.stats().calls,0);assert.equal(open(h),false);
});
test('El administrador obtiene su engrane solo después del canje vigente',async()=>{
  const h=harness({response:{ok:true,rol:'admin'}});await h.ctx.engraneAdmin();assert.ok(h.nodes.has('engraneBtn'));assert.ok(open(h));
});
test('La página administrativa conserva su control específico',async()=>{
  const h=harness({page:'accesos',response:{ok:true,rol:'vista'}});await h.ctx.engraneAdmin();assert.equal(open(h),false);
});
test('Un cambio de sesión en otra pestaña recarga el estado privado del board',()=>{
  const h=harness();h.events.storage({key:KEY});assert.equal(h.stats().reloads,1);
});
test('Se pueden repetir las validaciones sin crear botones duplicados',async()=>{
  const h=harness({response:{ok:false,error:'servidor'}});await h.ctx.engraneAdmin();await h.ctx.engraneAdmin();
  assert.equal(h.nodes.get('gate').box.children.filter(n=>n.id==='pyodReintentar').length,1);
});
