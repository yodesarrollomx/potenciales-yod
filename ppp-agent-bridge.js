/* Shared PPP surface. Never transmits credentials and never calculates money. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PPPAgentBridge=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const safeId=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,256}$/.test(v);
 // Units are descriptors of patrimonial-sheet-v1, not conversions or financial calculations.
 // See patrimonial-sheet-schema.json and the labelled inputs in patrimonial.html.
 // Monetary outputs deliberately have no inferred currency.
 const patrimonialInputUnits={inUnidades:'count',inTerrenoM2:'m2',inCus:'ratio',inPasillosPct:'percent',
  inM2Construccion:'m2',inM2Rentable:'m2',inPasillosM2:'m2',inVacanciaPct:'percent',inOpexPct:'percent',
  inSeguroPct:'percent',inCapRateMercado:'percent',inPlusvaliaPct:'percent',inCreditoPct:'percent',
  inTasaCredito:'percent',inPlazoCredito:'year',inHorizonte:'year',inTasaAlternativa:'percent'};
 const patrimonialResultUnits={capacidadConstruida:'m2',yieldOnCost:'ratio',dscr:'ratio',coc:'ratio',recupAnios:'year'};
 function metadataFor(m,state,inputs,results){
  if(!safeId(m.modelo_tipo)||!safeId(m.modelo_revision))return null;
  const metadata={model_type:m.modelo_tipo,model_revision:m.modelo_revision};
  if(m.modelo_tipo!=='patrimonial'||m.modelo_revision!=='patrimonial-sheet-v1')return metadata;
  const years=state.p?.horizonte;
  if(Number.isInteger(years)&&years>=1&&years<=25)metadata.horizon={value:years,unit:'year'};
  const inputUnits=Object.fromEntries(Object.keys(inputs).map(key=>[key,patrimonialInputUnits[key]||
   (/^unidad(?:0[1-9]|[1-5][0-9]|60)_m2$/.test(key)?'m2':null)]).filter(([,unit])=>typeof unit==='string'));
  const resultUnits=Object.fromEntries(Object.entries(patrimonialResultUnits).filter(([key])=>Object.prototype.hasOwnProperty.call(results,key)));
  if(Object.keys(inputUnits).length)metadata.input_units=inputUnits;
  if(Object.keys(resultUnits).length)metadata.result_units=resultUnits;
  return metadata;
 }
 function snapshot(store,labelFor=id=>id){
  if(!store.model)return null;
  const m=store.model,active=store.active(),state=m.estados[m.activo],results={};
  for(const key of ['modeloValido','geometriaEstado','noi','rentaMes','valorCap','equity','patrimH','mensCredito','yieldOnCost','dscr','coc','capacidadConstruida','areaUtil','recupAnios','unidades']){
   const v=state[key];if(v===null||['string','boolean'].includes(typeof v)||typeof v==='number'&&Number.isFinite(v))results[key]=v;
  }
  const metadata=metadataFor(m,state,active.inputs,results);
  return{case_id:store.id,revision:m.revision,scenario_id:m.activo,scenario_name:active.nombre,...(metadata?{metadata}:{}),
   confirmed:store.verified&&!store.busy&&!store.error,pending:store.dirty(),observed_at:new Date().toISOString(),
   fields:m.campos.map(c=>({id:c.id,label:String(labelFor(c.id)||c.id).slice(0,160),min:c.min,max:c.max,editable:c.editable,nullable:c.nullable,kind:c.kind})),
   inputs:{...active.inputs},results,...(store.viewFocus?{focus:store.viewFocus}:{})};
 }
 function validateProposal(store,p){
  if(!p||p.case_id!==store.id||!safeId(p.request_id)||p.scenario_id!==store.model.activo||!Array.isArray(p.cambios)||!p.cambios.length||p.cambios.length>12)throw Error('propuesta_invalida');
  if(store.busy||store.versionBusy||!store.verified||store.error||store.dirty()||p.revision!==store.model.revision)throw Error('conflicto_revision');
  const inputs={},seen=new Set();
  for(const c of p.cambios){
   const f=store.model.campos.find(f=>f.id===c.campo),v=c.valor;
   if(!f?.editable||seen.has(c.campo)||(v===null?!f.nullable:typeof v!=='number'||!Number.isFinite(v)||v<f.min||v>f.max||f.kind==='integer'&&!Number.isInteger(v)))throw Error('campo_invalido');
   seen.add(c.campo);inputs[c.campo]=v;
  }
  return inputs;
 }
 async function apply(store,p){
  // An uncertain write reuses the exact persisted payload and request ID.
  if(store.job?.request_id===p?.request_id){
   if(store.id!==p.case_id||store.job.escenario_id!==p.scenario_id||JSON.stringify(store.job.inputs)!==JSON.stringify(Object.fromEntries(p.cambios.map(c=>[c.campo,c.valor]))))throw Error('propuesta_invalida');
   return store.flush();
  }
  const inputs=validateProposal(store,p);
  store.job={tipo:'sheet-cantidades',caso_id:store.id,escenario_id:store.model.activo,revision_esperada:store.model.revision,inputs,request_id:p.request_id};
  store.notify();return store.flush();
 }
 function mount(store,{win=window,labelFor=id=>id}={}){
  if(win.parent===win||new URL(win.location.href).searchParams.get('agent')!=='1')return{publish(){},dispose(){}};
  const origin=win.location.origin;
  let reference;try{reference=new URL(win.document.referrer);}catch{return{publish(){},dispose(){}};}
  if(reference.origin!==origin||!/^\/yod-portal\/despacho3d\//.test(reference.pathname))return{publish(){},dispose(){}};
  let nonce=null,disposed=false,busy=false;
  function send(payload){if(nonce&&!disposed)win.parent.postMessage({type:'yod:ppp:state',version:1,nonce,...payload},origin);}
  function publish(){const value=snapshot(store,labelFor);if(value)send({board:value});}
  async function receive(e){
   if(disposed||e.origin!==origin||e.source!==win.parent)return;
   const m=e.data;if(!m||m.version!==1||m.case_id!==store.id)return;
   if(m.type==='yod:ppp:hello'&&safeId(m.nonce)){nonce=m.nonce;publish();return;}
   if(m.nonce!==nonce||!nonce)return;
   if(m.type==='yod:ppp:read'){publish();return;}
   if(m.type!=='yod:ppp:apply'||busy)return;
   busy=true;
   try{const ok=await apply(store,m.proposal);publish();send({receipt:{request_id:m.proposal.request_id,ok,revision:store.model.revision,error:ok?null:'sin_confirmacion'}});}
   catch(e){send({receipt:{request_id:m.proposal?.request_id,ok:false,error:e.message==='conflicto_revision'?'conflicto_revision':'propuesta_invalida'}});}
   finally{busy=false;}
  }
  win.addEventListener('message',receive);
  return{publish,dispose(){disposed=true;nonce=null;win.removeEventListener('message',receive);}};
 }
 return{snapshot,validateProposal,apply,mount};
});
