/* Compact view of the existing patrimonial Store. No transport or financial formulas. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PPPAgentCards=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const groups=[
  ['terreno','Terreno y arquitectura',['inTerrenoM2','inCus','inPasillosPct','inM2Construccion','inM2Rentable','inPasillosM2'],['capacidadConstruida','capacidadRentable','rentableSeleccionado']],
  ['ingresos','Renta e ingresos',['inUnidades','inRentaUnidadMes','inVacanciaPct','inOpexBase','inOpexPct','inSeguroPct','inProf'],['rentaMes','noi']],
  ['inversion','Inversión y costos',['inCostoRentM2','inCostoNoRentM2','inProyectoM2','inPermisosM2','inTerrenoCosto','inLegales','inValorM2Zona','inInversionTotal','inTerrenoAportado','inCapRateMercado'],['valorCap','equity','yieldOnCost']],
  ['credito','Crédito',['inCreditoPct','inTasaCredito','inPlazoCredito'],['mensCredito','dscr','coc']],
  ['horizonte','Horizonte patrimonial',['inHorizonte','inPlusvaliaPct','inTasaAlternativa'],['patrimH']]
 ];
 const labels={capacidadConstruida:'Construcción máxima · m²',capacidadRentable:'Capacidad rentable · m²',rentableSeleccionado:'Rentable seleccionado · m²',rentaMes:'Renta mensual',noi:'NOI anual',valorCap:'Valor del activo',equity:'Capital propio',yieldOnCost:'Rendimiento sobre inversión',mensCredito:'Pago mensual del crédito',dscr:'DSCR',coc:'Cash-on-Cash',patrimH:'Patrimonio al horizonte'};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=v=>typeof v==='number'&&Number.isFinite(v)?new Intl.NumberFormat('es-MX',{maximumFractionDigits:2}).format(v):'Pendiente';
 function cards(model,labelFor=id=>id){
  const scenario=model.escenarios.find(e=>e.id===model.activo),state=model.estados[model.activo],known=new Set();
  const result=groups.map(([id,title,ids,outputs])=>{
   const fields=ids.filter(id=>model.campos.some(c=>c.id===id));fields.forEach(id=>known.add(id));
   return{id,title,fields,inputs:fields.map(id=>({id,label:labelFor(id)||id,value:number(scenario.inputs[id])})),results:outputs.map(id=>({id,label:labels[id],value:!state.modeloValido&&!id.startsWith('capacidad')&&id!=='rentableSeleccionado'?'Pendiente':['yieldOnCost','coc'].includes(id)?(Number.isFinite(state[id])?number(state[id]*100)+' %':'Pendiente'):number(state[id])}))};
  });
  const units=model.campos.filter(c=>c.id.startsWith('unidad')).map(c=>c.id);units.forEach(id=>known.add(id));
  if(units.length)result.push({id:'mezcla',title:'Mezcla por puerta',fields:units,inputs:units.map(id=>({id,label:id.replace(/^unidad(\d+)_(.+)$/,(_,n,key)=>'Puerta '+Number(n)+' · '+({tipo:'Tipo (0 depa / 1 local)',nivel:'Nivel (0 PB / 1 PA / 2 RT)',m2:'m² capturados',renta:'Renta capturada'}[key]||key)),value:number(scenario.inputs[id])})),results:[]});
  const remaining=model.campos.filter(c=>!known.has(c.id));if(remaining.length)result.push({id:'otros',title:'Otros supuestos',fields:remaining.map(c=>c.id),inputs:remaining.map(c=>({id:c.id,label:labelFor(c.id)||c.id,value:number(scenario.inputs[c.id])})),results:[]});
  return result;
 }
 function render(root,{store,metadata,labelFor,status,onFocus,refresh}){
  const open=root.querySelector('details.pn-data-card[open]')?.dataset.card||null;
  const focused=root.ownerDocument.activeElement?.closest('summary')?.parentElement?.dataset.card;
  const model=store.model,scenario=store.active(),items=cards(model,labelFor);
  const row=(r,type)=>'<div class="pn-data-row" data-'+type+'="'+esc(r.id)+'"><span>'+esc(r.label)+'</span><strong>'+esc(r.value)+'</strong></div>';
  root.classList.add('pn-agent-cards');
  root.innerHTML='<header class="pn-board-heading"><div><span class="pn-eyebrow">PLAN DE POTENCIAL</span><h1>'+esc(metadata.nombre_caso||metadata.palabra||'Patrimonial')+'</h1><p>'+esc(scenario.nombre)+' · Patrimonial</p></div><span class="pn-read-state">'+(store.verified&&!store.error&&!store.busy&&!store.dirty()?'Sincronizado':'Por confirmar')+'</span></header><p class="pn-status" role="status">'+esc(status)+'</p><p class="pn-board-hint">Abre una tarjeta para revisar sus datos. Pide los cambios al autón que está contigo.</p><div class="pn-data-deck">'+items.map((c,i)=>'<details name="ppp-data" class="pn-data-card" data-card="'+c.id+'" '+(open===c.id?'open':'')+'><summary><span class="pn-card-number">'+String(i+1).padStart(2,'0')+'</span><span class="pn-card-copy"><strong>'+esc(c.title)+'</strong><span>'+c.inputs.slice(0,2).map(r=>esc(r.label)+': '+esc(r.value)).join(' · ')+'</span></span><span class="pn-card-arrow" aria-hidden="true">⌄</span></summary><div class="pn-card-data"><h2>Cantidades y supuestos</h2>'+c.inputs.map(r=>row(r,'input')).join('')+(c.results.length?'<h2>Resultados del libro</h2>'+c.results.map(r=>row(r,'result')).join(''):'')+'</div></details>').join('')+'</div><footer class="pn-board-footer"><span>Revisión '+esc(model.revision.slice(0,12))+'</span><button type="button" data-refresh>'+(store.job?'Comprobar guardado':'Actualizar lectura')+'</button></footer>';
  root.querySelector('[data-refresh]').onclick=refresh;
  root.querySelectorAll('.pn-data-card').forEach(d=>d.addEventListener('toggle',()=>{
   if(!d.isConnected||!root.contains(d))return;
   // Rebuilding after a receipt preserves the opened card, without reopening its peers.
   if(d.open){root.querySelectorAll('.pn-data-card[open]').forEach(other=>{if(other!==d)other.open=false;});}
   const current=root.querySelector('.pn-data-card[open]'),c=items.find(c=>c.id===current?.dataset.card);
   onFocus(c?{card:c.id,title:c.title,fields:c.fields}:null);
  }));
  if(focused)root.querySelector('[data-card="'+focused+'"] summary')?.focus({preventScroll:true});
 }
 return{cards,render};
});
