'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const index=fs.readFileSync(process.env.INDEX_FILE||'index.html','utf8');
for(const page of ['mixto.html','macrolotes.html','unifamiliar.html','residencial.html','patrimonial.html'])test('tarjeta Nuevo análisis inicia ficha en '+page,()=>{
 const matches=[...index.matchAll(/<a\s+[^>]*class="[^"]*\bppp-main-link\b[^"]*"[^>]*href="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(matches.filter(x=>new URL(x,'https://ppp.test/').pathname.endsWith('/'+page)).length,1,'tarjeta única para cada modalidad');
 const target=matches.find(x=>new URL(x,'https://ppp.test/').pathname.endsWith('/'+page));
 const url=new URL(target,'https://ppp.test/');assert.equal(url.searchParams.get('new'),'1','la tarjeta debe solicitar una ficha nueva');assert.equal(url.searchParams.has('open'),false,'alta no debe abrir un caso guardado');
});
