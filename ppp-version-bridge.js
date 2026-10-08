/* Read the existing PPP and its saved variants. No financial engine or business writes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PPPVersionBridge=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const id=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(v);
 const copy=v=>JSON.parse(JSON.stringify(v));
 function versions(value){
  if(!Array.isArray(value)||!value.length||value.length>8)throw Error('invalid_versions');
  const seen=new Set();return value.map(v=>{
   if(!v||!id(v.id)||seen.has(v.id)||typeof v.nombre!=='string'||!v.inputs||Array.isArray(v.inputs))throw Error('invalid_versions');
   seen.add(v.id);const inputs={};for(const [k,n]of Object.entries(v.inputs))if(/^in[A-Z]\w*$/.test(k)&&(n===null||typeof n==='number'&&Number.isFinite(n)))inputs[k]=n;
   return {id:v.id,nombre:v.nombre.slice(0,160),inputs};
  });
 }
 // Historical boards append new versions and do not record per-version timestamps.
 // Preserve that registration order; never manufacture a date from a label.
 function latestRegistered(value){return versions(value).at(-1).id;}
 function create({modelType,read,win=globalThis.window}={}){
  if(!['macrolotes','vertical','patrimonial'].includes(modelType)||typeof read!=='function')throw Error('invalid_adapter');
  let saved=null,defended=null,binding=null,nonce=null,disposed=false,verified=false;
  const embedded=win&&win.parent!==win&&new URL(win.location.href).searchParams.get('agent')==='1';
  let permitted=false;
  if(embedded)try{const u=new URL(win.document.referrer);permitted=u.origin===win.location.origin&&/^\/yod-portal\/despacho3d\//.test(u.pathname);}catch{}
  function remember({caseId,revision,scenarios,active,states=null,native=false}){
   if(!id(caseId)||typeof revision!=='string'||!revision)throw Error('invalid_case');
   const list=versions(scenarios);if(!list.some(v=>v.id===active))throw Error('invalid_active');
   if(saved?.caseId!==caseId){defended=null;binding=null;nonce=null;}
   saved={caseId,revision,list,active,states:copy(states||{}),native:native===true};verified=true;
   if(!defended)defended=binding?.scenario_id||latestRegistered(list);
   publish();
  }
  function snapshot(){
   if(!saved||!binding)return null;
   const current=read(),version=saved.list.find(v=>v.id===defended);
   if(!version||current.caseId!==saved.caseId)return null;
   const live=versions(current.scenarios),viewed=live.find(v=>v.id===current.active);
   const same=JSON.stringify(live)===JSON.stringify(saved.list);
   const results={};if(saved.native){for(const [k,v]of Object.entries(saved.states[defended]||{}))if(/^[a-zA-Z][a-zA-Z0-9_]{0,60}$/.test(k)&&(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.length<160))results[k]=v;}
   return {case_id:binding.case_id,revision:saved.revision,scenario_id:defended,scenario_name:version.nombre,
    confirmed:verified&&!current.busy&&!current.error,pending:!same||!!current.pending,observed_at:new Date().toISOString(),
    fields:Object.keys(version.inputs).map(k=>({id:k,label:String(current.labels?.[k]||k).slice(0,160),min:-Number.MAX_VALUE,max:Number.MAX_VALUE,editable:false,nullable:true,kind:'number'})),
    inputs:copy(version.inputs),results,metadata:{model_type:modelType,model_revision:saved.native?'sheet-observation-v1':'saved-inputs-v1'},
    version_context:{board_case_id:saved.caseId,defended_scenario_id:defended,viewed_scenario_id:current.active,
     viewed_scenario_name:viewed?.nombre||'',registration_basis:'saved_array_order',read_only:true,
     versions:saved.list.map(v=>({id:v.id,name:v.nombre})),...(viewed?{viewed_inputs:copy(viewed.inputs)}:{})}};
  }
  function publish(){if(disposed||!permitted||!nonce)return;try{const board=snapshot();if(board)win.parent.postMessage({type:'yod:ppp:state',version:1,nonce,board},win.location.origin);}catch{/* A local draft cannot be promoted to an authorized snapshot. */}}
  function receive(e){
   if(disposed||!permitted||e.source!==win.parent||e.origin!==win.location.origin)return;
   const m=e.data;if(!m||m.version!==1||!id(m.case_id)||!saved)return;
   if(m.type==='yod:ppp:hello'){
    if(!id(m.nonce)||(m.board_case_id||m.case_id)!==saved.caseId)return;
    if(m.scenario_id!==undefined&&!saved.list.some(v=>v.id===m.scenario_id))return;
    // Binding and pinned version cannot be replaced within one handshake.
    if(nonce&&(nonce!==m.nonce||binding.case_id!==m.case_id||(m.scenario_id!==undefined&&m.scenario_id!==defended)))return;
    binding={case_id:m.case_id,scenario_id:m.scenario_id};nonce=m.nonce;
    if(m.scenario_id)defended=m.scenario_id;publish();return;
   }
   if(m.nonce!==nonce||m.case_id!==binding?.case_id)return;
   if(m.type==='yod:ppp:read')publish();
   if(m.type==='yod:ppp:apply')win.parent.postMessage({type:'yod:ppp:state',version:1,nonce,receipt:{ok:false,request_id:m.proposal?.request_id,error:'read_only_model'}},win.location.origin);
  }
  if(permitted)win.addEventListener('message',receive);
  return {remember,publish,snapshot,invalidate(){verified=false;publish();},dispose(){disposed=true;saved=null;binding=null;nonce=null;if(permitted)win.removeEventListener('message',receive);}};
 }
 return {create,latestRegistered,versions};
});
