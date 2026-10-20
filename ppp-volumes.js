/* Independent quantities proposal. No financial engine, native Store, browser
   persistence, network or automatic application of the captured quantities. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PPPVolumes=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(value);
 const normalized=value=>typeof value==='string'?value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase():'';
 const numeric={levels:{integer:true,min:1,max:500},units:{integer:true,min:0,max:1000000},gross_area_m2:{integer:false,min:0,max:1000000000},start_month:{integer:true,min:0,max:1200},duration_months:{integer:true,min:1,max:1200}};
 function validContext(context){return context?.verified===true&&context.ready===true&&normalized(context.project_name)==='torre ruisenor'&&identifier(context.case_id)&&identifier(context.scenario_id)&&typeof context.revision==='string'&&context.revision.length>0&&context.revision.length<=256;}
 function key(context){if(!validContext(context))throw Error('unverified_volume_context');return JSON.stringify([context.case_id,context.scenario_id,context.revision]);}
 function createDraft(context){
  key(context);return{schema:1,case_id:context.case_id,scenario_id:context.scenario_id,base_revision:context.revision,count:1,edit_revision:0,
   volumes:Array.from({length:3},(_,i)=>({id:'volume-'+(i+1),name:'Volumen '+(i+1),levels:null,units:null,gross_area_m2:null,stage:'',start_month:null,duration_months:null}))};
 }
 function checkedDraft(draft){
  if(draft?.schema!==1||!identifier(draft.case_id)||!identifier(draft.scenario_id)||typeof draft.base_revision!=='string'||!draft.base_revision||![1,2,3].includes(draft.count)||!Array.isArray(draft.volumes)||draft.volumes.length!==3||!Number.isSafeInteger(draft.edit_revision)||draft.edit_revision<0)throw Error('invalid_volume_draft');
  for(const [i,volume]of draft.volumes.entries()){
   if(volume.id!=='volume-'+(i+1)||typeof volume.name!=='string'||!volume.name.trim()||volume.name.length>80||typeof volume.stage!=='string'||volume.stage.length>80)throw Error('invalid_volume_draft');
   for(const [field,rule]of Object.entries(numeric)){const value=volume[field];if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)||value<rule.min||value>rule.max||rule.integer&&!Number.isInteger(value)))throw Error('invalid_volume_'+field);}
  }return draft;
 }
 function resizeDraft(draft,count){checkedDraft(draft);if(![1,2,3].includes(count))throw Error('invalid_volume_count');const next=clone(draft);if(next.count!==count){next.count=count;next.edit_revision++;}return next;}
 function updateVolume(draft,id,patch){
  checkedDraft(draft);if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('invalid_volume_patch');const next=clone(draft),volume=next.volumes.find(value=>value.id===id);if(!volume)throw Error('unknown_volume');
  for(const [field,value]of Object.entries(patch)){if(!Object.hasOwn(numeric,field)&&!['name','stage'].includes(field))throw Error('invalid_volume_field');volume[field]=typeof value==='string'?value.trim():value;}
  checkedDraft(next);if(JSON.stringify(next.volumes)!==JSON.stringify(draft.volumes))next.edit_revision++;return next;
 }
 function summarize(draft){
  checkedDraft(draft);const selected=draft.volumes.slice(0,draft.count),quantity=field=>{const values=selected.map(v=>v[field]),captured=values.filter(v=>v!==null),total=captured.reduce((a,b)=>a+b,0);return {value:captured.length===selected.length?total:null,captured:total,filled:captured.length,expected:selected.length,complete:captured.length===selected.length};};
  return {count:draft.count,units:quantity('units'),gross_area_m2:quantity('gross_area_m2'),levels:selected.map(v=>({id:v.id,value:v.levels})),inactive:draft.volumes.slice(draft.count).filter(v=>v.name!=='Volumen '+v.id.slice(-1)||v.stage||Object.keys(numeric).some(k=>v[k]!==null)).length};
 }
 function createMemoryDrafts(){
  const drafts=new Map();return{previous(context){key(context);const value=[...drafts.values()].reverse().find(draft=>draft.case_id===context.case_id&&draft.scenario_id===context.scenario_id&&draft.base_revision!==context.revision&&draft.edit_revision>0);return value?clone(value):null;},read(context){const id=key(context);if(!drafts.has(id))drafts.set(id,createDraft(context));return clone(drafts.get(id));},write(context,draft){const id=key(context);checkedDraft(draft);if(draft.case_id!==context.case_id||draft.scenario_id!==context.scenario_id||draft.base_revision!==context.revision)throw Error('volume_context_changed');drafts.delete(id);drafts.set(id,clone(draft));return clone(draft);},clear(){drafts.clear();},get size(){return drafts.size;}};
 }
 function mount({container,getContext,doc=globalThis.document,win=globalThis.window}){
  if(!container||typeof getContext!=='function')throw Error('invalid_volume_mount');const memory=createMemoryDrafts(),declined=new Set();let context=null,draft=null,disposed=false,activeCase=null;
  const make=(tag,text,cls)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
  const button=(label,action,cls)=>{const node=make('button',label,cls);node.type='button';node.addEventListener('click',action);return node;};
  const heading=make('header',undefined,'pppv-heading'),identity=make('div'),eyebrow=make('small','PROPUESTA POR VOLÚMENES'),title=make('h2','Uno, dos o tres volúmenes'),state=make('span','Pendiente de aplicar al modelo','pppv-status');identity.append(eyebrow,title);heading.append(identity,state);
  const notice=make('p','Borrador en esta pantalla, aún sin aplicar al PPP. Captura cada volumen por separado; el cálculo financiero vigente conserva sus datos.','pppv-notice'),version=make('p','','pppv-version'),selector=make('div',undefined,'pppv-selector');selector.setAttribute('role','group');selector.setAttribute('aria-label','Número de volúmenes');
  const countButtons=[1,2,3].map(count=>{const node=button(count+(count===1?' volumen':' volúmenes'),()=>change(value=>resizeDraft(value,count)));selector.append(node);return node;});
  const continuation=make('section',undefined,'pppv-continuation'),continuationText=make('p'),continueButton=button('Revisar y continuar la propuesta',continueDraft),declineButton=button('Empezar esta revisión en blanco',()=>{if(!current()){revoke();return;}declined.add(key(context));paint();});continuation.append(continuationText,continueButton,declineButton);continuation.hidden=true;
  const totals=make('div',undefined,'pppv-totals'),retained=make('p','','pppv-retained'),cards=make('div',undefined,'pppv-cards'),error=make('p','','pppv-error');error.setAttribute('role','status');
  const footer=make('footer',undefined,'pppv-footer'),download=button('Descargar borrador',downloadDraft,'pppv-download'),scope=make('p','Las sumas son cantidades capturadas. No se calculan utilidad, deuda, TIR ni presupuesto por multiplicar volúmenes.');footer.append(scope,download);
  container.classList.add('ppp-volumes');container.setAttribute('aria-label','Propuesta por volúmenes');container.replaceChildren(heading,notice,version,continuation,selector,totals,retained,cards,error,footer);container.hidden=true;
  const fields=[['levels','Niveles'],['units','Viviendas'],['gross_area_m2','Superficie construida (m²)'],['stage','Etapa'],['start_month','Inicio de etapa · mes'],['duration_months','Duración de etapa · meses']];
  const inputs=[];
  for(let i=0;i<3;i++){
   const card=make('article',undefined,'pppv-card'),label=make('label','Nombre del volumen'),name=make('input'),grid=make('div',undefined,'pppv-fields');name.type='text';name.maxLength=80;name.setAttribute('aria-label','Nombre del volumen '+(i+1));label.append(name);card.append(label,grid);cards.append(card);
   const record={card,name,fields:{}};name.addEventListener('change',()=>change(value=>updateVolume(value,'volume-'+(i+1),{name:name.value})));
   for(const[field,text]of fields){const fieldLabel=make('label',text),input=make('input');input.setAttribute('aria-label',text+' · volumen '+(i+1));if(field==='stage'){input.type='text';input.maxLength=80;input.placeholder='Por definir';}else{const rule=numeric[field];input.type='number';input.min=String(rule.min);input.max=String(rule.max);input.step=rule.integer?'1':'0.01';input.inputMode=rule.integer?'numeric':'decimal';input.placeholder='Sin capturar';}fieldLabel.append(input);grid.append(fieldLabel);record.fields[field]=input;
    input.addEventListener('change',()=>{const raw=input.value.trim(),value=field==='stage'?raw:raw===''?null:Number(raw);change(current=>updateVolume(current,'volume-'+(i+1),{[field]:value}));});
   }inputs.push(record);
  }
  function current(){const value=getContext();return !disposed&&validContext(value)&&context&&key(value)===key(context)?value:null;}
  function change(transform){if(!current()){revoke();return false;}try{const next=transform(draft);draft=memory.write(context,next);error.textContent='';paint();return true;}catch{error.textContent='Revisa el dato: usa cantidades válidas y conserva los campos sin información vacíos.';paint(false);return false;}}
  function quantity(value,unit){const format=n=>n.toLocaleString('es-MX',{maximumFractionDigits:2});if(!value.filled)return 'Sin '+unit+' capturados';return format(value.captured)+' '+unit+' capturados'+(value.complete?'':' · '+value.filled+' de '+value.expected+' volúmenes');}
  function paint(overwrite=true){if(!draft||!context)return;const prior=memory.previous(context),offer=prior&&draft.edit_revision===0&&!declined.has(key(context));continuation.hidden=!offer;continuationText.textContent=offer?'Hay una propuesta capturada sobre la revisión '+prior.base_revision+'. El PPP está ahora en la revisión '+context.revision+'. Puedes revisarla y continuarla como borrador; todavía no se aplicará al modelo.':draft.continued_from_revision?'Propuesta continuada desde la revisión '+draft.continued_from_revision+' a '+context.revision+'. Revisa sus cantidades; sigue pendiente de aplicar al PPP.':'';if(draft.continued_from_revision){continuation.hidden=false;continueButton.hidden=true;declineButton.hidden=true;}else{continueButton.hidden=false;declineButton.hidden=false;}const summary=summarize(draft);version.textContent='Versión '+(context.scenario_name||context.scenario_id)+' · revisión base '+context.revision;countButtons.forEach((node,i)=>node.setAttribute('aria-pressed',String(draft.count===i+1)));totals.replaceChildren(make('strong',quantity(summary.units,'viviendas')),make('strong',quantity(summary.gross_area_m2,'m²')));retained.textContent=summary.inactive?'Se conserva lo capturado de '+summary.inactive+' volumen(es) fuera de esta propuesta. Vuelve a seleccionarlos para recuperarlo.':'';retained.hidden=!summary.inactive;
   for(const[i,record]of inputs.entries()){record.card.hidden=i>=draft.count;if(overwrite){record.name.value=draft.volumes[i].name;for(const[field,input]of Object.entries(record.fields))input.value=draft.volumes[i][field]??'';}}
  }
  function setContext(value){if(disposed)return false;const trusted=getContext();if(!validContext(value)||!validContext(trusted)||key(value)!==key(trusted)){revoke();return false;}if(context&&draft&&key(context)===key(value)){context=clone(value);container.hidden=false;container.dataset.verified='true';return true;}if(activeCase!==null&&activeCase!==value.case_id){memory.clear();declined.clear();}activeCase=value.case_id;context=clone(value);draft=memory.read(context);container.hidden=false;container.dataset.verified='true';container.dataset.volumeScenario=context.scenario_id;error.textContent='';paint();return true;}
  function suspend(){context=null;draft=null;container.hidden=true;delete container.dataset.verified;delete container.dataset.volumeScenario;for(const record of inputs){record.name.value='';for(const input of Object.values(record.fields))input.value='';}totals.replaceChildren();version.textContent='';retained.textContent='';continuation.hidden=true;continuationText.textContent='';error.textContent='';}
  function revoke(){memory.clear();declined.clear();activeCase=null;suspend();}
  function continueDraft(){if(!current()){revoke();return false;}const prior=memory.previous(context);if(!prior||draft.edit_revision!==0||declined.has(key(context)))return false;const next={...prior,base_revision:context.revision,continued_from_revision:prior.base_revision,edit_revision:prior.edit_revision+1};draft=memory.write(context,next);error.textContent='';paint();return true;}
  function downloadDraft(){if(!current()||!draft){revoke();return false;}const payload={...clone(draft),kind:'volume_proposal',status:'draft_not_applied',note:'Cantidades capturadas; sin cálculo ni guardado nativo del PPP.'},blob=new win.Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=win.URL.createObjectURL(blob),link=make('a');link.href=url;link.download='propuesta-volumenes-'+context.scenario_id+'.json';link.click();win.URL.revokeObjectURL(url);return true;}
  const onPageHide=()=>revoke(),onStorage=event=>{if(event.key===null||event.key==='pyod_clave_v1')revoke();};win.addEventListener('pagehide',onPageHide);win.addEventListener('storage',onStorage);
  return{setContext,suspend,revoke,snapshot(){return current()&&draft?clone(draft):null;},dispose(){revoke();disposed=true;win.removeEventListener('pagehide',onPageHide);win.removeEventListener('storage',onStorage);container.replaceChildren();}};
 }
 return{validContext,createDraft,resizeDraft,updateVolume,summarize,createMemoryDrafts,mount};
});
