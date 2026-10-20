/* Read the existing PPP and its saved variants. Native volume proposals delegate
   to the authenticated transport; this bridge never calculates finances. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PPPVersionBridge=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const id=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(v);
 const copy=v=>JSON.parse(JSON.stringify(v));
 function versions(value){
  if(!Array.isArray(value)||!value.length||value.length>100)throw Error('invalid_versions');
  const seen=new Set();return value.map(v=>{
   if(!v||!id(v.id)||seen.has(v.id)||typeof v.nombre!=='string'||!v.inputs||Array.isArray(v.inputs))throw Error('invalid_versions');
   seen.add(v.id);const inputs={};for(const [k,n]of Object.entries(v.inputs))if(/^in[A-Z]\w*$/.test(k)&&(n===null||typeof n==='number'&&Number.isFinite(n)))inputs[k]=n;
   return {id:v.id,nombre:v.nombre.slice(0,160),inputs};
  });
 }
 // Historical boards append new versions and do not record per-version timestamps.
 // Preserve that registration order; never manufacture a date from a label.
 function latestRegistered(value){return versions(value).at(-1).id;}
 function create({modelType,read,win=globalThis.window,volumeContract=null,applyVolumes=null}={}){
  if(!['macrolotes','vertical','patrimonial'].includes(modelType)||typeof read!=='function')throw Error('invalid_adapter');
  let saved=null,defended=null,binding=null,nonce=null,disposed=false,verified=false,focus=null;
  const navigationRequests=new Map(),volumeRequests=new Map();let volumeBusy=false;
  const navigationTargets=new Set(['plan','terreno','ventas','costos','calendario','volumenes','dArq','dVentas','dCostos','dMacro','dDota','dVolumenes']);
  function observeFocus(event){
   const card=event?.target?.closest?.('.ppp-card[data-card],.card[data-card]');
   if(card){const title=card.querySelector('.ppp-title,h3,h2')?.textContent?.trim()||card.dataset.card;focus={card:card.dataset.card,title:String(title).slice(0,160),fields:[...card.querySelectorAll('input[id]')].map(n=>n.id).filter(k=>/^in[A-Z]\w*$/.test(k))};}
   publish();
  }
  const embedded=win&&win.parent!==win&&new URL(win.location.href).searchParams.get('agent')==='1';
  let permitted=false;
  if(embedded)try{const u=new URL(win.document.referrer);permitted=u.origin===win.location.origin&&/^\/yod-portal\/despacho3d\//.test(u.pathname);}catch{}
  function remember({caseId,revision,scenarios,active,states=null,native=false,volumesByScenario=null,volumeCapability=null}){
   if(!id(caseId)||typeof revision!=='string'||!revision)throw Error('invalid_case');
   const list=versions(scenarios);if(!list.some(v=>v.id===active))throw Error('invalid_active');
   if(saved?.caseId!==caseId){defended=null;binding=null;nonce=null;focus=null;navigationRequests.clear();volumeRequests.clear();}
   const capability=modelType==='vertical'&&native===true?volumeContract?.capability?.(volumeCapability):null,collections={};
   if(capability)for(const v of list)if(volumesByScenario?.[v.id]!==undefined)collections[v.id]=volumeContract.collection(volumesByScenario[v.id],capability.max_volumes);
   saved={caseId,revision,list,active,states:copy(states||{}),native:native===true,volumeCapability:capability,volumes:collections};verified=true;
   if(!defended)defended=binding?.scenario_id||latestRegistered(list);
   publish();
  }
  function snapshot(){
   if(!saved||!binding)return null;
   const current=read(),version=saved.list.find(v=>v.id===defended);
   if(!version||current.caseId!==saved.caseId)return null;
   const live=versions(current.scenarios),viewed=live.find(v=>v.id===current.active);
   const same=JSON.stringify(live)===JSON.stringify(saved.list);
   const keys=[...new Set([...saved.list,...live].flatMap(v=>Object.keys(v.inputs)))];
   const canonical=Object.fromEntries(keys.map(k=>[k,Object.hasOwn(version.inputs,k)?version.inputs[k]:null]));
   const observed={...(viewed?.inputs||{})};
   if(current.pending&&current.draftInputs&&typeof current.draftInputs==='object')for(const[k,v]of Object.entries(current.draftInputs))if(keys.includes(k)&&(v===null||typeof v==='number'&&Number.isFinite(v)))observed[k]=v;
   const sharedFocus=focus&&id(focus.card)&&focus.title?{card:focus.card,title:focus.title,fields:focus.fields.filter(k=>keys.includes(k))}:null;
   const results={};if(saved.native){for(const [k,v]of Object.entries(saved.states[defended]||{}))if(/^[a-zA-Z][a-zA-Z0-9_]{0,60}$/.test(k)&&(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.length<160))results[k]=v;}
   return {case_id:binding.case_id,revision:saved.revision,scenario_id:defended,scenario_name:version.nombre,
    confirmed:verified&&!current.busy&&!current.error,pending:!same||!!current.pending,observed_at:new Date().toISOString(),
    fields:keys.map(k=>({id:k,label:String(current.labels?.[k]||k).slice(0,160),min:-Number.MAX_VALUE,max:Number.MAX_VALUE,editable:false,nullable:true,kind:'number'})),
    inputs:copy(canonical),results,...(saved.volumes[defended]?{volumes:copy(saved.volumes[defended]),capabilities:{volumes:{...saved.volumeCapability,write:saved.volumeCapability.write&&typeof applyVolumes==='function'&&verified&&!current.busy&&!current.error&&!current.pending&&current.active===defended}}}:{}),...(sharedFocus?{focus:sharedFocus}:{}),metadata:{model_type:modelType,model_revision:saved.native?'sheet-observation-v1':'saved-inputs-v1'},
    version_context:{board_case_id:saved.caseId,defended_scenario_id:defended,viewed_scenario_id:current.active,
     viewed_scenario_name:viewed?.nombre||'',registration_basis:'saved_array_order',read_only:true,
     versions:saved.list.map(v=>({id:v.id,name:v.nombre})),...(viewed?{viewed_inputs:copy(observed)}:{})}};
  }
  async function applyNativeVolumes(proposal,reconcileOnly=false){
   reconcileOnly=reconcileOnly||proposal?.reconcile_only===true;
   const originalNonce=nonce,originalBinding=binding,originalCase=saved?.caseId;
   const send=receipt=>{if(!disposed&&nonce===originalNonce&&binding===originalBinding&&saved?.caseId===originalCase)win.parent.postMessage({type:'yod:ppp:state',version:1,nonce,receipt},win.location.origin);};
   if(volumeBusy)return;
   try{
    if(modelType!=='vertical'||!saved?.native||!saved.volumeCapability?.read||!reconcileOnly&&!saved.volumeCapability.write||typeof applyVolumes!=='function'||proposal?.kind!=='native_volumes'||!id(proposal.request_id)||proposal.case_id!==(binding.agent_case_id||binding.case_id)||proposal.board_case_id!==saved.caseId||proposal.scenario_id!==defended)throw Error('propuesta_invalida');
    const volumes=volumeContract.collection(proposal.volumes,saved.volumeCapability.max_volumes,true),fingerprint=JSON.stringify([proposal.case_id,proposal.scenario_id,proposal.revision,volumes]),previous=volumeRequests.get(proposal.request_id);
    if(previous&&previous.fingerprint!==fingerprint)throw Error('request_id_reused');
    if(previous?.receipt){
     const receipt=copy(previous.receipt),current=getVerifiedContext();
     if(receipt.status==='rejected'){send(receipt);return;}
     if(saved.revision!==receipt.revision){if(!current||!saved.volumes[proposal.scenario_id])throw Error('sin_confirmacion');receipt.status='confirmed_superseded';receipt.current_revision=saved.revision;receipt.current_collection=copy(saved.volumes[proposal.scenario_id]);}
     send(receipt);return;
    }
    if(reconcileOnly){const current=read();if(!verified||current.caseId!==saved.caseId||current.active!==proposal.scenario_id||current.busy||current.error)throw Error('sin_confirmacion');}
    if(!previous&&!reconcileOnly){
     const context=getVerifiedContext(),requested=Date.parse(proposal.apply_requested_at),expires=Date.parse(proposal.apply_expires_at),now=Date.now();
     if(!context||context.scenario_id!==defended||proposal.revision!==saved.revision||!volumeContract.equal(proposal.before_volumes,saved.volumes[defended],saved.volumeCapability.max_volumes))throw Error('conflicto_revision');
     if(proposal.user_confirmed!==true||!Number.isFinite(requested)||!Number.isFinite(expires)||requested>now+5000||expires<=now||expires<=requested||expires-requested>300000)throw Error('confirmation_required');
     if(volumeRequests.size>=40)throw Error('recibos_pendientes');volumeRequests.set(proposal.request_id,{fingerprint});
    }
    if(!previous&&reconcileOnly){if(volumeRequests.size>=40)throw Error('recibos_pendientes');volumeRequests.set(proposal.request_id,{fingerprint,readOnly:true});}
    volumeBusy=true;
    const ack=await applyVolumes({context:{verified:true,ready:true,model_type:'vertical',case_id:originalCase,scenario_id:proposal.scenario_id,revision:proposal.revision,native_collection:copy(saved.volumes[defended]),native_capability:copy(saved.volumeCapability)},volumes,request_id:proposal.request_id,reconcile:reconcileOnly||!!previous});
    if(disposed||saved?.caseId!==originalCase||nonce!==originalNonce||binding!==originalBinding)return;
    if(ack?.ok===false&&ack.status==='rejected'){
     if(ack.request_id!==proposal.request_id||ack.case_id!==originalCase||ack.board_case_id!==originalCase||ack.scenario_id!==proposal.scenario_id||ack.base_revision!==proposal.revision||!ack.prewrite_rejection)throw Error('sin_confirmacion');
     const receipt={...ack,case_id:binding.agent_case_id||binding.case_id};volumeRequests.get(proposal.request_id).receipt=copy(receipt);publish();send(receipt);return;
    }
    const superseded=ack?.status==='confirmed_superseded',currentRevision=superseded?ack.current_revision:ack?.revision,currentCollection=superseded?ack.current_collection:ack?.native_collection;
    if(ack?.ok!==true||ack.status!==undefined&&!superseded||ack.request_id!==proposal.request_id||ack.case_id!==originalCase||ack.scenario_id!==proposal.scenario_id||typeof ack.revision!=='string'||saved.revision!==currentRevision||superseded&&ack.revision===currentRevision||!verified||read().caseId!==originalCase||!volumeContract.equalDrivers(ack.native_collection,volumes,saved.volumeCapability.max_volumes)||!volumeContract.equal(saved.volumes[proposal.scenario_id],currentCollection,saved.volumeCapability.max_volumes)||typeof ack.calculated!=='boolean')throw Error('sin_confirmacion');
    const receipt={...ack,case_id:binding.agent_case_id||binding.case_id,base_revision:proposal.revision};volumeRequests.get(proposal.request_id).receipt=copy(receipt);publish();send(receipt);
   }catch(error){send({ok:false,request_id:proposal?.request_id,error:error.message||'propuesta_invalida'});}
   finally{volumeBusy=false;}
  }
  function getVerifiedContext(){
   try{
    if(!saved||!binding||!verified||!saved.native)return null;
    const current=read();if(current.caseId!==saved.caseId||current.busy||current.error||current.pending||!saved.list.some(v=>v.id===current.active)||JSON.stringify(versions(current.scenarios))!==JSON.stringify(saved.list))return null;
    return {case_id:binding.agent_case_id||binding.case_id,board_case_id:saved.caseId,scenario_id:current.active,defended_scenario_id:defended,revision:saved.revision,confirmed:true,pending:false,volume_draft:binding.volume_draft===true};
   }catch{return null;}
  }
  function publish(){if(disposed||!permitted||!nonce)return;try{const board=snapshot();if(board)win.parent.postMessage({type:'yod:ppp:state',version:1,nonce,board,capabilities:{navigate:true},navigation_context:getVerifiedContext()},win.location.origin);}catch{/* A local draft cannot be promoted to an authorized snapshot. */}}
  function navigate(m){
   if(!id(m.request_id)||typeof m.target!=='string')return;
   const fingerprint=JSON.stringify([m.target,m.scenario_id,m.revision,m.board_case_id||binding.case_id]);
   let previous=navigationRequests.get(m.request_id);
   if(!previous){if(navigationRequests.size>=40)navigationRequests.delete(navigationRequests.keys().next().value);previous={fingerprint,attempted:false};navigationRequests.set(m.request_id,previous);}
   let status='unavailable',code='view_unavailable',section=null,context=getVerifiedContext();
   if(previous.fingerprint!==fingerprint)code='request_id_reused';
   else if(!navigationTargets.has(m.target)){status='unsupported';code='target_unsupported';}
   else if(!context)code='reading_unconfirmed';
   else if(m.board_case_id!==undefined&&m.board_case_id!==saved.caseId)code='case_changed';
   else if(typeof m.revision!=='string'||m.revision!==context.revision)code='revision_changed';
   else if(!id(m.scenario_id)||m.scenario_id!==context.scenario_id)code='scenario_changed';
   else if(win.document.activeElement?.isContentEditable||win.document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]')||win.document.activeElement?.closest?.('[contenteditable="true"],[contenteditable=""]'))code='editing_in_progress';
   else if(typeof win.PPPView?.navigate!=='function'||typeof win.PPPView?.navigationState!=='function'){status='unsupported';code='navigation_not_installed';}
   else{
    try{
     if(!previous.attempted){previous.attempted=true;win.PPPView.navigate(m.target);}
     const observed=win.PPPView.navigationState(m.target),fresh=getVerifiedContext();
     if(fresh&&fresh.board_case_id===context.board_case_id&&fresh.scenario_id===context.scenario_id&&fresh.revision===context.revision&&observed?.status==='confirmed'&&typeof observed.section_id==='string'){
      status='confirmed';code=null;section=observed.section_id;context=fresh;
     }else{status=observed?.status==='unsupported'?'unsupported':'unavailable';code=observed?.code||'view_not_confirmed';}
    }catch{code='view_unavailable';}
   }
   win.parent.postMessage({type:'yod:ppp:navigation',version:1,nonce,case_id:binding.case_id,request_id:m.request_id,target:m.target,status,...(code?{code}:{}),...(context?{observed:{case_id:context.case_id,board_case_id:context.board_case_id,scenario_id:context.scenario_id,revision:context.revision,tab:'ppp',target:m.target,...(section?{section_id:section}:{})}}:{})},win.location.origin);
  }
  function receive(e){
   if(disposed||!permitted||e.source!==win.parent||e.origin!==win.location.origin)return;
   const m=e.data;if(!m||m.version!==1||!id(m.case_id)||!saved)return;
   if(m.type==='yod:ppp:hello'){
    if(!id(m.nonce)||(m.board_case_id||m.case_id)!==saved.caseId)return;
    if(m.scenario_id!==undefined&&!saved.list.some(v=>v.id===m.scenario_id))return;
    // Binding and pinned version cannot be replaced within one handshake.
    if(nonce&&(nonce!==m.nonce||binding.case_id!==m.case_id||(m.scenario_id!==undefined&&m.scenario_id!==defended)))return;
    binding=binding||{case_id:m.case_id,scenario_id:m.scenario_id,...(id(m.agent_case_id)?{agent_case_id:m.agent_case_id}:{}),volume_draft:m.presentation?.volume_draft===true};nonce=m.nonce;
    if(m.scenario_id)defended=m.scenario_id;publish();return;
   }
   if(m.nonce!==nonce||m.case_id!==binding?.case_id)return;
   if(m.type==='yod:ppp:navigate'){navigate(m);return;}
   if(m.type==='yod:ppp:volumes-receipt'){void applyNativeVolumes(m.proposal,true);return;}
   if(m.type==='yod:ppp:read')publish();
   if(m.type==='yod:ppp:apply'){
    if(m.proposal?.kind==='native_volumes'){void applyNativeVolumes(m.proposal);return;}
    win.parent.postMessage({type:'yod:ppp:state',version:1,nonce,receipt:{ok:false,request_id:m.proposal?.request_id,error:'read_only_model'}},win.location.origin);
   }
  }
  if(permitted){win.addEventListener('message',receive);for(const name of ['click','input','focusin'])win.document.addEventListener?.(name,observeFocus);}
  return {remember,publish,snapshot,getVerifiedContext,invalidate(){verified=false;publish();},dispose(){disposed=true;saved=null;binding=null;nonce=null;navigationRequests.clear();volumeRequests.clear();if(permitted){win.removeEventListener('message',receive);for(const name of ['click','input','focusin'])win.document.removeEventListener?.(name,observeFocus);}}};
 }
 return {create,latestRegistered,versions};
});
