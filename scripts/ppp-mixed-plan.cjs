#!/usr/bin/env node
'use strict';
// Offline preparation only. Inputs and output must live outside this public repo.
const fs=require('node:fs'),path=require('node:path'),program=require('../ppp-mixed-program.js');
function requests(plan,sheetId){
 if(!Number.isInteger(sheetId)||sheetId<0)throw Error('sheet_id_required');
 const rows=Array.from({length:340},()=>({values:Array.from({length:16},()=>({}))}));
 for(const c of plan.cells){
  const [,col,row]=/^([A-Z]+)(\d+)$/.exec(c.ref);const index=[...col].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0)-1;
  const v=c.formula?{formulaValue:c.formula}:c.value===null?null:typeof c.value==='number'?{numberValue:c.value}:typeof c.value==='boolean'?{boolValue:c.value}:{stringValue:c.value};
  rows[+row-1].values[index]={...(v?{userEnteredValue:v}:{}),note:plan.graph.nodes.find(n=>n.cell_ref===plan.sheet+'!'+c.ref)?.label||''};
 }
 const label=(r,c,text)=>{rows[r-1].values[c-1]={userEnteredValue:{stringValue:text}};};
 label(1,1,'PROGRAMA MULTIUSO · EN REVISIÓN');
 ['Terreno bruto','Área excluida','Base normativa documentada','COS documentado (%)','CUS documentado','Terreno neto','Huella permitida','Construcción permitida'].forEach((s,i)=>label(i+2,1,s));
 ['Construido activo','Vendible activo','Ventas proyectadas','Presupuesto por partidas','Modo de presupuesto','Presupuesto consolidado','Estado del presupuesto','Costo directo elegido','Holgura normativa'].forEach((s,i)=>label(i+2,4,s));
 ['ID','Uso','Producto','Activo','Construido m²','Vendible m²','Unidades','Precio por','Precio MXN','Venta habilitada','Fuente','Estado','Ventas MXN','Eficiencia','Construido activo','Vendible activo'].forEach((s,i)=>label(15,i+1,s));
 ['ID','Partida','Producto','Activa','Base cantidad','Cantidad fija','Costo unitario','Fuente','Estado','Total MXN'].forEach((s,i)=>label(83,i+1,s));
 label(12,1,'No incluye flujo, banco, reparto ni impuestos. No es resultado definitivo.');
 const range=ref=>{const [,col,row]=/^([A-Z]+)(\d+)$/.exec(ref);const index=[...col].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0)-1;return {sheetId,startRowIndex:+row-1,endRowIndex:+row,startColumnIndex:index,endColumnIndex:index+1};};
 const validations=[];
 for(const c of plan.cells.filter(c=>c.editable)){
  const node=plan.graph.nodes.find(n=>n.cell_ref===plan.sheet+'!'+c.ref),id=node.id;
  let condition;
  if(/:status$/.test(id))condition={type:'ONE_OF_LIST',values:program.STATES.map(userEnteredValue=>({userEnteredValue}))};
  else if(/:use$/.test(id))condition={type:'ONE_OF_LIST',values:program.USES.map(userEnteredValue=>({userEnteredValue}))};
  else if(/:price_basis$/.test(id))condition={type:'ONE_OF_LIST',values:['m2','unidad'].map(userEnteredValue=>({userEnteredValue}))};
  else if(id==='budget:mode')condition={type:'ONE_OF_LIST',values:['partidas','consolidado'].map(userEnteredValue=>({userEnteredValue}))};
  else if(/:(active|sale_enabled)$/.test(id))condition={type:'BOOLEAN'};
  else if(/:(gross_m2|excluded_m2|normative_base_m2|cos_pct|cus|built_m2|sellable_m2|units|price|quantity|unit_cost|consolidated)$/.test(id)){
   const tests=[`ISNUMBER(${c.ref})`,`${c.ref}>=0`];
   if(/:units$/.test(id))tests.push(`MOD(${c.ref};1)=0`);
   if(id==='land:cos_pct')tests.push(`${c.ref}<=100`);
   condition={type:'CUSTOM_FORMULA',values:[{userEnteredValue:`=OR(ISBLANK(${c.ref});AND(${tests.join(';')}))`}]};
  }
  if(condition)validations.push({setDataValidation:{range:range(c.ref),rule:{condition,strict:true,showCustomUi:true}}});
 }
 return [{addSheet:{properties:{sheetId,title:plan.sheet,gridProperties:{rowCount:340,columnCount:16}}}},
 {updateCells:{start:{sheetId,rowIndex:0,columnIndex:0},rows,fields:'userEnteredValue,note'}},
 {repeatCell:{range:{sheetId,startRowIndex:0,endRowIndex:340,startColumnIndex:0,endColumnIndex:16},cell:{userEnteredFormat:{wrapStrategy:'WRAP',verticalAlignment:'TOP',textFormat:{fontSize:10}}},fields:'userEnteredFormat'}},
 ...[0,14,82].map(r=>({repeatCell:{range:{sheetId,startRowIndex:r,endRowIndex:r+1,startColumnIndex:0,endColumnIndex:16},cell:{userEnteredFormat:{backgroundColor:{red:.93,green:.93,blue:.93},textFormat:{bold:true}}},fields:'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.bold'}})),
 {updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:0,endIndex:16},properties:{pixelSize:150},fields:'pixelSize'}},
 {updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:2,endIndex:3},properties:{pixelSize:210},fields:'pixelSize'}},
 ...validations,
 {addProtectedRange:{protectedRange:{range:{sheetId},description:'Fórmulas e identidades: modificar mediante una nueva migración; no mover filas.',warningOnly:false,unprotectedRanges:plan.cells.filter(c=>c.editable).map(c=>range(c.ref))}}}];
}
if(require.main===module){
 const [inputFile,outputFile]=process.argv.slice(2);if(!inputFile||!outputFile)throw Error('Usage: input.json output.json (outside repo)');
 const root=path.resolve(__dirname,'..');for(const p of [inputFile,outputFile])if(path.resolve(p).startsWith(root+path.sep))throw Error('private_data_outside_repository');
 const input=JSON.parse(fs.readFileSync(inputFile,'utf8')),plan=program.build(input,{case_id:'private-migration',scenario_id:'base',revision:program.VERSION});
 fs.writeFileSync(outputFile,JSON.stringify({plan,requests:requests(plan,17111701)},null,2));
}
module.exports={requests};
