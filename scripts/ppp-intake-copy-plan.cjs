'use strict';
// Pure planner for an isolated COPY. No HTTP, financial model or formula writer.
const crypto=require('node:crypto');
const TYPES=['vertical','macrolotes','unifamiliar','residencial','patrimonial'];
const HEADERS=['request_id','caso_id','tipo','source_book','copy_book','estado','before_hash','after_hash','preimage_json','target_json','formula_hash','at'];
const clone=v=>JSON.parse(JSON.stringify(v));
const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
const hash=v=>crypto.createHash('sha256').update(stable(v)).digest('hex');
const raw=c=>c?.userEnteredValue||{};
const value=c=>{const v=c?.effectiveValue||raw(c);if(v.errorValue)throw Error('sheet_error');return v.numberValue??v.stringValue??v.boolValue??null;};
const cell=v=>v===null?{}:{userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:String(v)}};
function formula(col,row,sep){const s=col===2?'=IF(B'+row+'="","",IF($C$2="","",1+(B'+row+'-1)*$C$2))':col===3?'=IF(B'+row+'="","",IF($C$2="","",$C$2))':'=IF(B'+row+'="","",IF($C$2="","",C'+row+'+D'+row+'-1))';return s.replace(/,/g,sep);}
function normalized(s){
  if(!s.bookId||!s.sourceBookId||s.bookId===s.sourceBookId||!TYPES.includes(s.type)||!s.caseId||!Number.isInteger(s.stageSheetId)||!Number.isInteger(s.inputsSheetId)||!Number.isInteger(s.journalSheetId)||new Set([s.stageSheetId,s.inputsSheetId,s.journalSheetId]).size!==3)throw Error('copy_scope_required');
  const st=s.stages;if(!Array.isArray(st)||st.length<28)throw Error('stage_snapshot_incomplete');
  if(value(st[0][0])!=='schema'||value(st[0][1])!=='count'||value(st[0][2])!=='duration_months'||value(st[1][0])!==1||value(st[1][3])!=='sequential'||value(st[1][4])!=='preserve'||value(st[1][5])!=='relative_months')throw Error('stage_schema_changed');
  const count=value(st[1][1]),duration=value(st[1][2]);if(!Number.isInteger(count)||count<1||count>24||!(duration===null&&count===1||Number.isInteger(duration)&&duration>0))throw Error('invalid_stage_plan');
  if(raw(st[1][1]).formulaValue||raw(st[1][2]).formulaValue)throw Error('protected_stage_driver');
  const sep=new Intl.NumberFormat(s.locale.replace('_','-'),{useGrouping:false}).format(1.5).includes(',')?';':',';
  for(let i=0;i<24;i++){
    if(raw(st[i+4][0]).formulaValue||raw(st[i+4][1]).formulaValue)throw Error('protected_stage_driver');
    for(let j=2;j<5;j++)if(raw(st[i+4][j]).formulaValue!==formula(j,i+5,sep))throw Error('formula_changed');
    if(value(st[i+4][0])!==(i<count?'stage-'+(i+1):null)||value(st[i+4][1])!==(i<count?i+1:null))throw Error('stage_identity_changed');
  }
  const mirrors={};if(['macrolotes','residencial'].includes(s.type))for(const key of ['inEtapas','inMesesUrbEtapa']){const matches=s.inputs.map((r,i)=>({r,i})).filter(x=>value(x.r[0])===key);if(matches.length!==1||raw(matches[0].r[1]).formulaValue)throw Error('input_binding_changed');mirrors[key]=matches[0].i;}
  if(mirrors.inEtapas!==undefined&&(value(s.inputs[mirrors.inEtapas][1])!==count||value(s.inputs[mirrors.inMesesUrbEtapa][1])!==duration))throw Error('stage_mirror_changed');
  return {count,duration,mirrors,formulaHash:hash(st.slice(4,28).map(r=>r.slice(2,5).map(raw)))};
}
function image(s){const n=normalized(s);return {count:n.count,duration_months:n.duration,identities:s.stages.slice(4,28).map(r=>r.slice(0,2).map(raw)),mirrors:Object.fromEntries(Object.entries(n.mirrors).map(([k,i])=>[k,raw(s.inputs[i][1])])),formula_hash:n.formulaHash};}
function update(sheetId,row,col,rows){return {updateCells:{range:{sheetId,startRowIndex:row,endRowIndex:row+rows.length,startColumnIndex:col,endColumnIndex:col+rows[0].length},rows:rows.map(values=>({values})),fields:'userEnteredValue'}};}
function plan(s,desired,op){
  const n=normalized(s),count=desired.count,duration=desired.duration_months;
  if(!Number.isInteger(count)||count<1||count>(['macrolotes','residencial'].includes(s.type)?8:24)||!(duration===null&&count===1||Number.isInteger(duration)&&duration>0&&count*duration<=1200))throw Error('invalid_stage_plan');
  if(duration!==null&&(['macrolotes','residencial'].includes(s.type))&&(duration<(s.type==='macrolotes'?4:3)||duration>24))throw Error('invalid_stage_plan');
  if(!op.requestId||!op.at||!Number.isInteger(op.journalRow)||op.journalRow<1)throw Error('operation_required');
  if(!Array.isArray(op.journalPreimage)||op.journalPreimage.some(c=>Object.keys(raw(c)).length))throw Error('journal_row_not_empty');
  const before=image(s),target=clone(before);target.count=count;target.duration_months=duration;target.identities=Array.from({length:24},(_,i)=>[raw(cell(i<count?'stage-'+(i+1):null)),raw(cell(i<count?i+1:null))]);
  for(const key of Object.keys(n.mirrors))target.mirrors[key]=raw(cell(key==='inEtapas'?count:duration));
  const requests=[update(s.stageSheetId,1,1,[[cell(count),cell(duration)]]),update(s.stageSheetId,4,0,target.identities.map(r=>r.map(v=>Object.keys(v).length?{userEnteredValue:v}:{})))];
  for(const [key,i]of Object.entries(n.mirrors))requests.push(update(s.inputsSheetId,i,1,[[cell(key==='inEtapas'?count:duration)]]));
  const row=[op.requestId,s.caseId,s.type,s.sourceBookId,s.bookId,'applied',hash(before),hash(target),JSON.stringify(before),JSON.stringify(target),n.formulaHash,op.at];
  requests.push(update(s.journalSheetId,op.journalRow,0,[row.map(cell)]));
  return {requests,receipt:{request_id:op.requestId,book_id:s.bookId,source_book_id:s.sourceBookId,case_id:s.caseId,type:s.type,before_hash:hash(before),after_hash:hash(target),formula_hash:n.formulaHash,target,journal_row:op.journalRow},preimage:before};
}
function verify(s,receipt,journalRow){
  const actual=image(s);if(receipt.book_id!==s.bookId||receipt.source_book_id!==s.sourceBookId||receipt.case_id!==s.caseId||receipt.type!==s.type)throw Error('receipt_context_mismatch');
  const r=journalRow.map(value);if(r[0]!==receipt.request_id||r[1]!==s.caseId||r[2]!==s.type||r[3]!==s.sourceBookId||r[4]!==s.bookId||r[5]!=='applied'||r[6]!==receipt.before_hash||r[7]!==receipt.after_hash||r[10]!==receipt.formula_hash||hash(JSON.parse(r[8]))!==receipt.before_hash||hash(JSON.parse(r[9]))!==receipt.after_hash)throw Error('journal_mismatch');
  if(hash(actual)!==receipt.after_hash||actual.formula_hash!==receipt.formula_hash)throw Error('readback_mismatch');
  // Sheets omits effectiveValue for a calculated blank. Require the caller to
  // attest that its native read explicitly requested effectiveValue; a formulas-
  // only read cannot prove blank output after removing the duration.
  if(actual.duration_months===null&&s.effectiveValuesIncluded!==true)throw Error('effective_values_read_required');
  if(actual.duration_months!==null)for(let i=0;i<actual.count;i++){const r=s.stages[i+4];if(value(r[2])!==1+i*actual.duration_months||value(r[3])!==actual.duration_months||value(r[4])!==(i+1)*actual.duration_months)throw Error('calendar_recalculation_missing');}
  else for(let i=0;i<24;i++)for(let j=2;j<5;j++)if(value(s.stages[i+4][j])!==null&&value(s.stages[i+4][j])!=='')throw Error('calendar_recalculation_missing');
  for(let i=actual.count;i<24;i++)for(let j=2;j<5;j++)if(value(s.stages[i+4][j])!==null&&value(s.stages[i+4][j])!=='')throw Error('calendar_recalculation_missing');
  return {ok:true,recovered_by_read_only:true,financial_calculated:false,calendar:actual,formula_hash:actual.formula_hash};
}
module.exports={plan,verify,normalized,image,hash,stable,value,raw,formula,HEADERS};
