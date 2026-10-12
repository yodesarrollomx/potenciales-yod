/* Exact PPP opening: reads only. The native Store remains the authority for calculations and writes. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.PPPCaseOpening=api;})(typeof globalThis==='undefined'?this:globalThis,function(root){
 'use strict';
 const authErrors=new Set(['clave','liga','expirado','revocado','sin_sesion','unauthorized','forbidden']);
 const transientErrors=new Set(['lock_busy','unavailable','timeout','tiempo_agotado','network','servidor','no_disponible']);
 const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_.:-]{1,256}$/.test(id);
 function isAuthenticationError(code){return authErrors.has(String(code||'').toLowerCase());}
 function create({read,apply,onState=()=>{},onAuthorized=()=>{},onUnauthorized=()=>{},getCredential=()=>null,
  loaderFactory=(fn,ms)=>root.PPPCaseLoader.create(fn,ms),timeoutMs=25000,schedule=setTimeout,cancel=clearTimeout}={}){
  if(typeof read!=='function'||typeof apply!=='function')throw Error('invalid_reader');
  const loader=loaderFactory(read,timeoutMs);let generation=0,pending=null,retryTimer=null,disposed=false;
  function emit(phase,error=''){onState({phase,error,case_id:pending?.id||null,attempt:pending?.attempt||0});}
  function stopRetry(){if(retryTimer!==null)cancel(retryTimer);retryTimer=null;}
  const current=(ticket,credential)=>!disposed&&ticket===generation&&getCredential()===credential&&!!credential;
  async function run(ticket){
   const task=pending,credential=task?.credential;if(!task||!current(ticket,credential))return false;
   task.attempt++;emit('loading');
   try{
    const result=await loader.load(task.params);
    if(!current(ticket,credential)||result===null)return false;
    if(result?.ok!==true)throw Error(typeof result?.error==='string'?result.error:'unavailable');
    const value=result.caso;
    if(!value||!validId(value.caso_id)||(task.id&&value.caso_id!==task.id))throw Error('case_mismatch');
    if(apply(value)===false)throw Error('invalid_model');
    if(!current(ticket,credential))return false;
    emit('ready');onAuthorized();return true;
   }catch(error){
    if(!current(ticket,credential))return false;
    const code=String(error?.message||'network');
    if(isAuthenticationError(code)){emit('unauthorized',code);onUnauthorized();return false;}
    if((transientErrors.has(code)||error instanceof TypeError)&&task.attempt<3){
     emit('retrying',transientErrors.has(code)?code:'network');
     retryTimer=schedule(()=>{retryTimer=null;if(current(ticket,credential))void run(ticket);},task.attempt===1?2000:5000);
    }else emit('error',transientErrors.has(code)||['case_mismatch','invalid_model','no_existe'].includes(code)?code:'unavailable');
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
 return {create,isAuthenticationError};
});
