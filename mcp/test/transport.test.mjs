import test from 'node:test';
import assert from 'node:assert/strict';
import { PppTransport } from '../src/transport.mjs';
import { ENDPOINT } from './helpers.mjs';
test('ContentService 302 se sigue como GET sin reenviar cuerpo ni clave',async()=>{
  const calls=[];const transport=new PppTransport(ENDPOINT,{fetchImpl:async(u,o)=>{
    calls.push([u.toString(),o]);
    return calls.length===1?new Response(null,{status:302,headers:{Location:'https://script.googleusercontent.com/macros/echo?user_content_key=ficticio'}}):new Response('{"ok":true}');
  }});
  assert.equal((await transport.post({k:'secret',tipo:'ppp2-dato'})).ok,true);
  assert.equal(calls[1][1].method,'GET');assert.equal(calls[1][1].body,undefined);
  assert.ok(!JSON.stringify(calls[1]).includes('secret'));
});
test('destino de redirección fuera de Google nunca recibe credencial ni petición',async()=>{
  let n=0;const transport=new PppTransport(ENDPOINT,{fetchImpl:async()=>{n++;return new Response(null,{status:302,headers:{Location:'https://evil.example'}});}});
  await assert.rejects(transport.post({k:'secret'}),{code:'resultado_incierto'});assert.equal(n,1);
});
test('errores no filtran mensajes ni HTML, cuerpos demasiado grandes se rechazan',async()=>{
  for(const body of ['<html>secret</html>',JSON.stringify({ok:false,error:'private secret',detalle:'secret'})]) {
    const t=new PppTransport(ENDPOINT,{fetchImpl:async()=>new Response(body)});
    try{await t.get({});assert.fail();}catch(e){assert.ok(!e.message.includes('secret'));}
  }
  const t=new PppTransport(ENDPOINT,{maxBytes:10,fetchImpl:async()=>new Response(JSON.stringify({ok:true,data:'x'.repeat(20)}))});
  await assert.rejects(t.get({}),{code:'fuente_no_disponible'});
});
