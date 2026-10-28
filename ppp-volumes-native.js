/* Native volume contract. No network, storage, financial calculation, or formula
   evaluation. Derived cells are read from Sheets and never enter a write payload. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PPPVolumesNative=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(value);
 const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
 const revision=value=>typeof value==='string'&&value.length>0&&value.length<=256;
 const text=value=>typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=80&&!/[\x00-\x1f]/.test(value)&&!/^[-=+@]/.test(value);
 const fields=[{"id":"name","label":"Nombre","type":"text","nullable":false,"writable":true,"derived":false},{"id":"footprint_m2","label":"Huella","type":"number","nullable":true,"writable":true,"derived":false,"min":0,"max":1000000000,"step":0.01},{"id":"open_courtyard_m2","label":"Patio abierto","type":"number","nullable":true,"writable":true,"derived":false,"min":0,"max":1000000000,"step":0.01},{"id":"residential_levels","label":"Plantas residenciales","type":"integer","nullable":true,"writable":true,"derived":false,"min":1,"max":500,"step":1},{"id":"units_per_level","label":"Viviendas por planta · promedio","type":"number","nullable":true,"writable":true,"derived":false,"min":0,"max":1000000,"step":1e-06},{"id":"units","label":"Viviendas","type":"integer","nullable":true,"writable":false,"derived":true,"min":0,"step":1},{"id":"private_area_per_unit_m2","label":"Área privada por vivienda","type":"number","nullable":true,"writable":true,"derived":false,"min":0,"max":1000000000,"step":0.01},{"id":"private_residential_area_m2","label":"Área privada residencial","type":"number","nullable":true,"writable":false,"derived":true,"min":0,"step":0.01},{"id":"built_residential_area_m2","label":"Área construida residencial","type":"number","nullable":true,"writable":false,"derived":true,"min":0,"step":0.01},{"id":"commercial_ground_m2","label":"Comercio PB","type":"number","nullable":true,"writable":true,"derived":false,"min":0,"max":1000000000,"step":0.01},{"id":"ground_services_m2","label":"Servicios PB","type":"number","nullable":true,"writable":true,"derived":false,"min":0,"max":1000000000,"step":0.01},{"id":"covered_ground_m2","label":"PB cubierta","type":"number","nullable":true,"writable":false,"derived":true,"min":0,"step":0.01},{"id":"gross_area_m2","label":"Área construida total","type":"number","nullable":true,"writable":false,"derived":true,"min":0,"step":0.01},{"id":"basement_area_m2","label":"Sótano","type":"number","nullable":true,"writable":true,"derived":false,"min":0,"max":1000000000,"step":0.01},{"id":"direct_cost","label":"Costo directo","type":"number","nullable":true,"writable":false,"derived":true,"min":0,"step":0.01},{"id":"construction_start_month","label":"Inicio de obra","type":"integer","nullable":true,"writable":true,"derived":false,"min":0,"max":1200,"step":1},{"id":"construction_duration_months","label":"Duración de obra","type":"integer","nullable":true,"writable":true,"derived":false,"min":1,"max":1200,"step":1},{"id":"construction_end_month","label":"Fin de obra","type":"integer","nullable":true,"writable":false,"derived":true,"min":0,"step":1},{"id":"sales_start_month","label":"Inicio de ventas","type":"integer","nullable":true,"writable":true,"derived":false,"min":0,"max":1200,"step":1},{"id":"presale_months","label":"Meses de preventa","type":"integer","nullable":true,"writable":true,"derived":false,"min":1,"max":1200,"step":1},{"id":"delivery_months","label":"Meses de entrega","type":"integer","nullable":true,"writable":true,"derived":false,"min":1,"max":1200,"step":1}];
 const byId=Object.fromEntries(fields.map(f=>[f.id,f])),drivers=fields.filter(f=>f.writable),derived=fields.filter(f=>f.derived);
 const rejectionErrors=['revision_conflict','active_driver_missing','protected_native_driver','native_formula_missing','native_formula_manifest_changed','native_geometry_conflict','native_horizon_conflict','shared_allocation_requires_reconciliation','volume_identity_conflict'];
 function stable(value){if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(object(value))return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';return JSON.stringify(value);}
 function capability(value){
  if(!object(value)||value.schema!==2||value.read!==true||typeof value.write!=='boolean'||!Number.isInteger(value.max_volumes)||value.max_volumes<1||value.max_volumes>32||!Array.isArray(value.fields)||value.fields.length!==21)return null;
  if(!Array.isArray(value.allocation_modes)||value.allocation_modes.length!==2||value.allocation_modes[0]!=='preserve'||value.allocation_modes[1]!=='built_area'||!Array.isArray(value.shared_resources)||value.shared_resources.length>128)return null;
  const resources=[],resourceIds=new Set();for(const resource of value.shared_resources){if(!object(resource)||Object.keys(resource).length!==2||!identifier(resource.id)||resourceIds.has(resource.id)||typeof resource.label!=='string'||!resource.label||resource.label!==resource.label.trim()||resource.label.length>160||/[\x00-\x1f]/.test(resource.label))return null;resourceIds.add(resource.id);resources.push({id:resource.id,label:resource.label});}
  const seen=new Set(),clean=[];
  for(const field of value.fields){
   const def=byId[field?.id];if(!def||seen.has(field.id)||field.type!==def.type||field.nullable!==def.nullable||field.writable!==def.writable||field.derived!==def.derived||typeof field.label!=='string'||!field.label.trim()||field.label.length>160)return null;
   if(def.writable&&def.type!=='text'&&(!Number.isFinite(field.min)||!Number.isFinite(field.max)||field.min<def.min||field.max>def.max||field.min>field.max))return null;
   seen.add(field.id);clean.push({...def,label:field.label,...(def.writable&&def.type!=='text'?{min:field.min,max:field.max}: {})});
  }
  return {schema:2,read:true,write:value.write,max_volumes:value.max_volumes,fields:clean,allocation_modes:['preserve','built_area'],shared_resources:resources};
 }
 function collection(value,maxVolumes=16,write=false){
  if(!Number.isInteger(maxVolumes)||maxVolumes<1||maxVolumes>32||!object(value)||Object.keys(value).some(k=>!['schema','count','shared_allocation_mode','volumes'].includes(k))||value.schema!==2||!['preserve','built_area'].includes(value.shared_allocation_mode)||!Number.isInteger(value.count)||value.count<1||value.count>maxVolumes||!Array.isArray(value.volumes)||value.volumes.length<value.count||value.volumes.length>maxVolumes)throw Error('invalid_volume_collection');
  const seen=new Set(),schema=write?drivers:fields,keys=schema.map(f=>f.id),volumes=value.volumes.map(row=>{
   if(!object(row)||Object.keys(row).length!==2||!identifier(row.id)||seen.has(row.id)||!object(row.values)||Object.keys(row.values).length!==keys.length||Object.keys(row.values).some(k=>!keys.includes(k)))throw Error('invalid_volume_row');
   seen.add(row.id);const values={};
   for(const field of schema){const n=row.values[field.id];if(field.type==='text'){if(!text(n))throw Error('invalid_volume_'+field.id);}else if(n!==null&&(typeof n!=='number'||!Number.isFinite(n)||(field.min!==undefined&&n<field.min||field.max!==undefined&&n>field.max||field.type==='integer'&&!Number.isInteger(n))))throw Error('invalid_volume_'+field.id);values[field.id]=n;}
   return {id:row.id,values};
  });
  return {schema:2,count:value.count,shared_allocation_mode:value.shared_allocation_mode,volumes};
 }
 function project(value,maxVolumes=16){
  try{return collection(value,maxVolumes,true);}catch{}
  const full=collection(value,maxVolumes);
  return {schema:2,count:full.count,shared_allocation_mode:full.shared_allocation_mode,volumes:full.volumes.map(row=>({id:row.id,values:Object.fromEntries(drivers.map(f=>[f.id,row.values[f.id]]))}))};
 }
 function equal(a,b,maxVolumes=16){try{return JSON.stringify(collection(a,maxVolumes))===JSON.stringify(collection(b,maxVolumes));}catch{return false;}}
 function equalDrivers(a,b,maxVolumes=16){try{return JSON.stringify(project(a,maxVolumes))===JSON.stringify(project(b,maxVolumes));}catch{return false;}}
 function request(context,volumes,requestId,{readOnly=false}={}){
  const cap=capability(context?.native_capability);
  if(context?.verified!==true||context.ready!==true||context.model_type!=='vertical'||!identifier(context.case_id)||!identifier(context.scenario_id)||!revision(context.revision)||!identifier(requestId)||!cap?.read||!readOnly&&!cap.write)throw Error('native_volumes_unavailable');
  let full=null;try{full=collection(volumes,cap.max_volumes);}catch{collection(volumes,cap.max_volumes,true);}
  const base=context.native_collection?collection(context.native_collection,cap.max_volumes):null;
  if(full&&!readOnly)for(const row of full.volumes){const before=base?.volumes.find(v=>v.id===row.id);for(const field of derived)if(row.values[field.id]!== (before?.values[field.id]??null))throw Error('derived_volume_field');}
  const output=project(volumes,cap.max_volumes);
  for(const row of output.volumes)for(const field of cap.fields.filter(f=>f.writable&&f.type!=='text')){const n=row.values[field.id];if(n!==null&&(n<field.min||n>field.max))throw Error('invalid_volume_'+field.id);}
  return {tipo:'sheet-volumes',tipo_desarrollo:'VERTICAL',caso_id:context.case_id,escenario_id:context.scenario_id,revision_esperada:context.revision,request_id:requestId,volumes:output};
 }
 function receipt(model,payload,validModel){
  if(typeof validModel!=='function'||!validModel(model,payload.caso_id)||model.ok===false)throw Error(model?.error||'invalid_native_model');
  const cap=capability(model.capabilities?.volumes),r=model.volume_receipt;
  if(!cap||!object(r)||r.request_id!==payload.request_id||r.caso_id!==payload.caso_id||r.escenario_id!==payload.escenario_id||r.base_revision!==payload.revision_esperada||!revision(r.result_revision)||typeof r.calculated!=='boolean'||!model.escenarios.some(e=>e.id===payload.escenario_id))throw Error('unconfirmed_volume_receipt');
  const canonical=collection(model.volumes_by_scenario?.[payload.escenario_id],cap.max_volumes);
  const original=collection(r.volumes,cap.max_volumes);
  if(!equalDrivers(original,payload.volumes,cap.max_volumes))throw Error('volume_readback_mismatch');
  const superseded=r.result_revision!==model.revision;
  if(superseded?model.volume_receipt_status!=='superseded':model.volume_receipt_status!==undefined||!equal(original,canonical,cap.max_volumes))throw Error('volume_readback_mismatch');
  return {ok:true,request_id:payload.request_id,case_id:payload.caso_id,scenario_id:payload.escenario_id,base_revision:payload.revision_esperada,revision:r.result_revision,native_collection:original,calculated:r.calculated,...(superseded?{status:'confirmed_superseded',current_revision:model.revision,current_collection:canonical}:{})};
 }
 async function rejection(response,payload,hash){
  const proof=response?.volume_rejection,keys=['request_id','caso_id','escenario_id','base_revision','actor','payload_hash','stage','write_attempted','error','rejected_at'];
  if(response?.ok!==false||response.error!=='operation_rejected'||!object(proof)||Object.keys(proof).length!==keys.length||Object.keys(proof).some(k=>!keys.includes(k))||proof.request_id!==payload.request_id||proof.caso_id!==payload.caso_id||proof.escenario_id!==payload.escenario_id||proof.base_revision!==payload.revision_esperada||typeof proof.actor!=='string'||!proof.actor||proof.actor.length>256||proof.stage!=='prewrite'||proof.write_attempted!==false||!rejectionErrors.includes(proof.error)||typeof proof.rejected_at!=='string'||!Number.isFinite(Date.parse(proof.rejected_at))||Date.parse(proof.rejected_at)>Date.now()+5000||typeof proof.payload_hash!=='string'||!/^[a-f0-9]{64}$/.test(proof.payload_hash)||typeof hash!=='function')throw Error('unconfirmed_volume_rejection');
  // Rejection checks an already-sent request; it cannot authorize a write.
  const expected=await hash(stable({actor:proof.actor,caso_id:payload.caso_id,escenario_id:payload.escenario_id,base_revision:payload.revision_esperada,volumes:collection(payload.volumes,32,true)}));
  if(expected!==proof.payload_hash)throw Error('unconfirmed_volume_rejection');
  return {ok:false,status:'rejected',error:'operation_rejected',request_id:payload.request_id,case_id:payload.caso_id,board_case_id:payload.caso_id,scenario_id:payload.escenario_id,base_revision:payload.revision_esperada,prewrite_rejection:JSON.parse(JSON.stringify(proof))};
 }
 return {fields,drivers:drivers.map(f=>f.id),derived:derived.map(f=>f.id),rejectionErrors,stable,capability,collection,project,equal,equalDrivers,request,receipt,rejection};
});
