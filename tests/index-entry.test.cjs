'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const script=fs.readFileSync('ppp-entrada.js','utf8');
function destino(ruta) {
  let next='';
  const location=new URL(ruta,'https://ejemplo.test/potenciales-yod/');location.replace=x=>{next=x;};
  vm.runInNewContext(script,{URL,URLSearchParams,location,document:{addEventListener(){}}});
  return next?new URL(next):null;
}
test('la raíz abre la única cartera y preserva la ruta de un folio',()=>{
  assert.equal(destino('index.html#/plan/p2ejemplo01').hash,'#/plan/p2ejemplo01');
  assert.equal(destino('index.html').pathname,'/potenciales-yod/ppp2.html');
  assert.equal(destino('index.html?archivo=1'),null);
});
for(const page of ['mixto','macrolotes','residencial','unifamiliar','patrimonial']){
  test('alta única y expediente anterior en '+page,()=>{
    assert.match(fs.readFileSync(page+'.html','utf8'),/src="ppp-entrada\.js/);
    assert.equal(destino(page+'.html?new=1').hash,'#/nuevo');
    assert.equal(destino(page+'.html?open=historico&new=1'),null);
    const old=destino('index.html?open=histórico&t='+page);
    assert.equal(old.pathname,'/potenciales-yod/'+page+'.html');
    assert.equal(old.searchParams.get('open'),'histórico');
  });
}
