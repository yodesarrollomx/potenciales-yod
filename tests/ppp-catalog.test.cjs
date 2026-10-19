'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../ppp-catalog.js'),'utf8');
function setup({rows={},fail={},home=true}={}){
 const elements={};function el(id){return elements[id]||=( {id,hidden:false,scrollTop:0,value:'',attrs:{},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,fn){this[k]=fn},querySelector(){return null},querySelectorAll(){return []},closest(){return null},innerHTML:''});}
 let session='test-session';const pending=[],listeners={},calls=[];
 const scope={document:{getElementById:el,querySelector:s=>s==='.projects-panel'&&home?{}:null},localStorage:{getItem:()=>session},location:{href:'https://yodesarrollomx.github.io/potenciales-yod/',origin:'https://yodesarrollomx.github.io'},URL,URLSearchParams,AbortController,Event,Set,Map,console,setTimeout:()=>1,clearTimeout(){},addEventListener:(k,f)=>listeners[k]=f,dispatchEvent(){},fetch:async(url)=>{const t=new URL(url).searchParams.get('tipo');calls.push(t);if(fail[t]==='wait')return new Promise(resolve=>pending.push(()=>resolve({ok:true,json:async()=>({ok:true,casos:rows[t]||[]})})));return {ok:true,json:async()=>fail[t]?{ok:false,error:fail[t]}:{ok:true,casos:rows[t]||[]}};}};scope.window=scope;scope.YOD_PORTERO={original:'https://example.test/api'};vm.runInNewContext(source,scope);
 return {elements,scope,calls,pending,setSession:v=>session=v,settle:()=>new Promise(r=>setImmediate(r))};
}
test('projects are visible on home; exact IDs deduplicate and named alternatives retain both links',async()=>{
 const a={caso_id:'case:a',nombre_caso:'Proyecto prueba · Logística',estado:'EXPLORACIÓN'},b={caso_id:'case:b',nombre_caso:'Proyecto prueba · Venta modular',estado:'EXPLORACIÓN'};
 const s=setup({rows:{macrolotes:[a,b,a]}});await s.settle();const h=s.elements.listaTodos.innerHTML;
 assert.equal(s.elements.listaTodos.hidden,false);assert.equal(s.elements.cntTodos.textContent,'1');assert.equal((h.match(/class="lt-variants"/g)||[]).length,1);assert.equal((h.match(/class="lt-item"/g)||[]).length,2);assert.match(h,/open=case%3Aa/);assert.match(h,/open=case%3Ab/);assert.match(h,/2 registros/);assert.equal(s.calls.length,5);
});
test('search matches aliases and accents without changing total project count',async()=>{
 const s=setup({rows:{vertical:[{caso_id:'v1',nombre_caso:'Proyecto Álamo · Alternativa',palabra:'clave-anterior'}],macrolotes:[{caso_id:'m1',nombre_caso:'Otro proyecto'}]}});await s.settle();s.elements.projectSearch.value='alamo';s.elements.projectSearch.input();assert.match(s.elements.listaTodos.innerHTML,/Proyecto Álamo/);assert.doesNotMatch(s.elements.listaTodos.innerHTML,/class="nm">Otro proyecto/);assert.equal(s.elements.cntTodos.textContent,'2');
 s.elements.projectSearch.value='clave-anterior';s.elements.projectSearch.input();assert.match(s.elements.listaTodos.innerHTML,/Proyecto Álamo/);
});
test('denial and confirmed empty response override map fallbacks; changed session drops late rows',async()=>{
 const s=setup({fail:{vertical:'board',patrimonial:'wait'}});await s.settle();s.scope.PPPCatalog.mapData('test-session',[{tipo:'vertical',nombre:'Private fallback',link:'mixto.html?open=v2'}]);assert.doesNotMatch(s.elements.listaTodos.innerHTML,/Private fallback/);s.setSession('');s.scope.PPPCatalog.load('');s.pending.forEach(f=>f());await s.settle();assert.equal(s.elements.cntTodos.textContent,'0');assert.doesNotMatch(s.elements.listaTodos.innerHTML,/lt-item/);
});
test('content is escaped; standalone map keeps its existing disclosure',async()=>{
 const s=setup({home:false,rows:{vertical:[{caso_id:'id"x',nombre_caso:'<img src=x onerror=bad> · A',estado:'<script>'}]}});await s.settle();assert.equal(s.elements.listaTodos.hidden,true);const h=s.elements.listaTodos.innerHTML;assert.doesNotMatch(h,/<img|<script>/);assert.match(h,/&lt;img/);assert.match(h,/id%22x/);s.elements.btnTodos.onclick();assert.equal(s.elements.listaTodos.hidden,false);
});
