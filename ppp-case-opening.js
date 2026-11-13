/* Exact PPP opening: reads only. The native Store remains the authority for calculations and writes. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.PPPCaseOpening=api;})(typeof globalThis==='undefined'?this:globalThis,function(root){
 'use strict';
 const authErrors=new Set(['clave','liga','expirado','revocado','sin_sesion','unauthorized','forbidden']);
 const transientErrors=new Set(['lock_busy','unavailable','timeout','tiempo_agotado','network','servidor','no_disponible','http_error']);
 const localErrors=new Set(['board','modelo_invalido','case_mismatch','invalid_model','no_existe','invalid_response']);
 const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_.:-]{1,256}$/.test(id);
 function isAuthenticationError(code){return authErrors.has(String(code||'').toLowerCase());}
 function safeValidation(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='code,field_id,reason,scenario_id')return null;
  const reasons=value.code==='cantidad_invalida'?['invalid_type']:value.code==='cantidad_fuera_rango'?['missing_required','below_min','above_max','non_integer']:[];
  if(!reasons.includes(value.reason)||!validId(value.scenario_id)||!validId(value.field_id)||!/^(in[A-Z]\w*|unidad(?:0[1-9]|[1-5][0-9]|60)_(?:tipo|nivel|m2|renta))$/.test(value.field_id))return null;
  return {code:value.code,field_id:value.field_id,scenario_id:value.scenario_id,reason:value.reason};
 }
 function failure(error){
  const raw=String(error?.message||'').toLowerCase(),known=authErrors.has(raw)||transientErrors.has(raw)||localErrors.has(raw);
  const code=known?raw:error instanceof TypeError?'network':error?.name==='AbortError'?'timeout':'unavailable';
  const kind=authErrors.has(code)?'authorization':code==='board'?'permission':code==='modelo_invalido'||code==='invalid_model'?'validation':code==='timeout'||code==='tiempo_agotado'?'timeout':code==='network'?'network':error?.fromServer||['servidor','lock_busy','http_error','invalid_response','no_disponible'].includes(code)?'server':'unknown';
  const validation=code==='modelo_invalido'?safeValidation(error?.validation):null;
  const httpStatus=code==='http_error'&&Number.isInteger(error?.httpStatus)&&error.httpStatus>=400&&error.httpStatus<=599?error.httpStatus:null;
  return {code,kind,retryable:transientErrors.has(raw)||error instanceof TypeError||error?.name==='AbortError',...(validation?{validation}:{}),...(httpStatus?{http_status:httpStatus}:{})};
 }
 function describe(value,labelFor=id=>id){
  const {phase,error}=value,validation=safeValidation(value.validation);
  let title=phase==='loading'?'Abriendo tu plan de potencial':phase==='retrying'?'Recuperando conexión':phase==='unauthorized'?'Valida el acceso al plan':'No se pudo abrir este plan';
  let message=phase==='loading'?'Recuperando los datos de este proyecto.':phase==='unauthorized'?'La sesión del plan necesita validarse. El resto de YOD OS conserva su sesión.':error==='board'?'El servidor rechazó el permiso para este tablero. Tu sesión se conserva; revisa el acceso al plan antes de volver a conectar.':error==='modelo_invalido'?'Un supuesto guardado requiere revisión antes de abrir el modelo.':error==='no_existe'?'El caso registrado no está disponible. No se cargó otro caso.':error==='case_mismatch'?'La respuesta no corresponde a este caso. No se aplicó.':error==='invalid_model'?'El modelo no pudo verificarse. Se conservan las cantidades anteriores sin presentar otra lectura como actual.':value.kind==='timeout'?'La lectura superó el tiempo de espera. Puedes volver a conectar.':value.kind==='network'?'El navegador no pudo comunicarse con el servicio. Revisa la conexión y vuelve a intentar.':value.kind==='server'?'El servidor no pudo completar la lectura. No confirmó la causa; puedes volver a intentar.':'La lectura no se confirmó. Puedes volver a intentar; no se enviaron cantidades.';
  if(error==='modelo_invalido'&&validation){
   const reasons={invalid_type:'no contiene una cantidad válida',missing_required:'requiere una cantidad',below_min:'está por debajo del mínimo permitido para este modelo',above_max:'supera el máximo permitido para este modelo',non_integer:'requiere un número entero'};
   message=String(labelFor(validation.field_id)||validation.field_id).slice(0,160)+' '+reasons[validation.reason]+'. Revisa el supuesto guardado y vuelve a conectar cuando esté corregido.';
  }
  if(phase==='retrying')message+=' Se reintentará la lectura automáticamente ('+Math.max(1,Math.min(3,Number(value.attempt)||1))+'/3).';
  const detail=validation?validation.code+' · '+validation.reason+' · versión '+validation.scenario_id:value.http_status?'HTTP '+value.http_status:authErrors.has(error)||transientErrors.has(error)||localErrors.has(error)?error:'';
  if(phase==='ready')return {title:'',message:'',detail:''};
  return {title,message,detail:phase==='loading'?'':detail};
 }
 function create({read,apply,onState=()=>{},onAuthorized=()=>{},onUnauthorized=()=>{},getCredential=()=>null,
  loaderFactory=(fn,ms)=>root.PPPCaseLoader.create(fn,ms),timeoutMs=25000,schedule=setTimeout,cancel=clearTimeout}={}){
  if(typeof read!=='function'||typeof apply!=='function')throw Error('invalid_reader');
  const loader=loaderFactory(read,timeoutMs);let generation=0,pending=null,retryTimer=null,disposed=false;
  function emit(phase,error='',details=null){onState({phase,error,case_id:pending?.id||null,attempt:pending?.attempt||0,...(details?{kind:details.kind,...(details.validation?{validation:details.validation}:{}),...(details.http_status?{http_status:details.http_status}:{})}:{})});}
  function stopRetry(){if(retryTimer!==null)cancel(retryTimer);retryTimer=null;}
  const current=(ticket,credential)=>!disposed&&ticket===generation&&getCredential()===credential&&!!credential;
  async function run(ticket){
   const task=pending,credential=task?.credential;if(!task||!current(ticket,credential))return false;
   task.attempt++;emit('loading');
   try{
    const result=await loader.load(task.params);
    if(!current(ticket,credential)||result===null)return false;
    if(result?.ok!==true){const error=Error(typeof result?.error==='string'?result.error:'unavailable');error.fromServer=true;error.validation=result?.validation;throw error;}
    const value=result.caso;
    if(!value||!validId(value.caso_id)||(task.id&&value.caso_id!==task.id))throw Error('case_mismatch');
    if(apply(value)===false)throw Error('invalid_model');
    if(!current(ticket,credential))return false;
    emit('ready');onAuthorized();return true;
   }catch(error){
    if(!current(ticket,credential))return false;
    const details=failure(error),code=details.code;
    if(isAuthenticationError(code)){emit('unauthorized',code,details);onUnauthorized();return false;}
    if(details.retryable&&task.attempt<3){
     emit('retrying',code,details);
     retryTimer=schedule(()=>{retryTimer=null;if(current(ticket,credential))void run(ticket);},task.attempt===1?2000:5000);
    }else emit('error',code,details);
    return false;
   }
  }
  function open(params,id=null){
   if(disposed)return Promise.resolve(false);generation++;stopRetry();loader.invalidate();
   const credential=getCredential();pending={params:{...params},id,credential,attempt:0};
   if(!credential){emit('unauthorized','sin_sesion');onUnauthorized();return Promise.resolve(false);}
   return run(generation);
  }
  return {
   openId(id){if(!validId(id)){generation++;stopRetry();loader.invalidate();pending=null;emit('error','case_mismatch');return Promise.resolve(false);}return open({recurso:'caso',id},id);},
   openWord(word){if(typeof word!=='string'||!word.trim()||word.length>256)return Promise.resolve(false);return open({recurso:'caso',palabra:word.trim()});},
   retry(){return pending?open(pending.params,pending.id):Promise.resolve(false);},
   invalidate(){generation++;stopRetry();loader.invalidate();pending=null;},
   dispose(){disposed=true;generation++;stopRetry();loader.invalidate();pending=null;}
  };
 }
 return {create,isAuthenticationError,describe};
});
