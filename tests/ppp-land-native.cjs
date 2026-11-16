/* Recalculate the actual native formula text with synthetic inputs.
 * Requires @oai/artifact-tool from the authoring runtime; no network writes. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const core=require('../server/PPPLandInKind.gs');
const fixture=require('./fixtures/land-native-formulas.json');
async function main(){
 const {Workbook,SpreadsheetFile}=await import(require.resolve('@oai/artifact-tool'));
 const w=Workbook.create(),s=w.worksheets.add('V_synthetic'),p=w.worksheets.add('PV_synthetic'),ix=w.worksheets.add('Volumenes_Indice');
 const value=(cell,v)=>{s.getRange(cell).values=[[v]];},formula=(cell,f)=>{s.getRange(cell).formulas=[[f.replaceAll(';',',')]];};
 const inputs={G8:1000,G49:100,G50:.05,G52:.3,G53:.3,G54:.75,G55:1,G56:6,G57:6,G58:0,G61:.04,G62:.02,G63:.03,G64:.02,G65:.05,G66:7,G67:6,G68:.12,G69:20,G70:1,G71:5000,G72:1000000,G73:1,G74:0,G75:.015,G76:1,G77:.25,G78:.6,G88:1000,G97:10,G113:0,G156:.75,B87:0};
 Object.entries(inputs).forEach(([k,v])=>value(k,v));
 p.getRange('A1:Y113').values=Array.from({length:113},()=>Array(25).fill(0));
 for(const [cell,v]of Object.entries({H7:1000,O7:40000,P7:7,Q7:6,R7:12,S7:1,T7:6,U7:6,B38:13,B39:19,B40:0}))p.getRange(cell).values=[[v]];
 ix.getRange('D2').values=[[1]];
 Object.entries(fixture.finance).forEach(([k,f])=>formula(k,f));
 const shift=(f,row)=>f.replace(/(\$?[A-Z]{1,3})(?!\$)(\d+)/g,(all,c,n)=>c+(Number(n)+row-9));
 const rev=[];
 for(let row=8;row<128;row++){
  const source=row===8?fixture.flowFirst:fixture.flowNext;
  Object.entries(source).forEach(([col,f])=>{const out=row===8?f:shift(f,row);formula(col+row,out);if(col==='L')rev.push(out);});
  value('J'+row,row-7);
 }
 const plan=core.build({revenue:rev});plan.patches.forEach(x=>formula(x.cell,x.formula));
 const terms={method:1,upfront:3000,profit_share:50,annual_rate:20,sales_share:20,delivery_start:13,delivery_months:6,reserved_area:0,commission_in_kind:0};
 const set=t=>core.fields.forEach(f=>value('B'+f[2],t[f[0]]));
 const read=cell=>s.getRange(cell).values[0][0];
 const near=(a,b,label,tolerance=.02)=>assert.ok(typeof a==='number'&&Math.abs(a-b)<=tolerance,`${label}: ${a} != ${b}`);
 for(const method of [1,2,3]){
  set({...terms,method});
  core.solve(area=>{value('B257',area);return read('G252');},1000,.001);
  near(read('G267'),0,'inventory');near(read('G268'),0,'economic reconciliation');near(read('G195'),0,'cash reconciliation');
  near(read('G180'),read('G164'),'native cash receipts');near(read('G181'),read('G174'),'native cash costs');
  near(read('G253')+read('G255'),1000,'physical inventory unchanged');near(read('G166'),3000,'upfront once');
  near(read('G216'),3000+read('G250'),'owner total');
  if(method===1)near(read('G217'),Math.max(0,read('G223'))*.5,'profit share');
  if(method===2)near(read('G217'),17000*.2*(12+2.5)/12,'simple interest on reducing balance');
  if(method===3)near(read('G216'),read('G257')*.2,'sales share includes land and upfront');
  const ownerFlow=s.getRange('AG8:AG127').values.flat().reduce((a,b)=>a+b,0);near(ownerFlow,read('G217'),'owner dated flow');
  console.log(JSON.stringify({method,reserved:read('G253'),cashSales:read('G164'),profit:read('G223'),ownerGain:read('G217'),devGain:read('G218'),debt:read('G188'),peak:read('G191')}));
 }
 // A changed price marks an old allocation unbalanced; no automatic false success.
 value('G49',110);assert.equal(read('G258'),false);value('G49',100);
 value('B255',10);assert.equal(read('G259'),false);value('B255',13);
 await w.recalculate();
 if(process.env.PPP_LAND_XLSX){const out=await SpreadsheetFile.exportXlsx(w);await out.save(process.env.PPP_LAND_XLSX);}
 console.log('PASS native cash, inventory, three contracts, interest schedule and changed-input checks');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
