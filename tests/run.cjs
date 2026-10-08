const fs=require('fs'),vm=require('vm'),assert=require('assert');
function environment(){
 const props={}, sheets={}, calls={writes:0, mails:0, fetch:0}; let failWrite=false, failMail=false;
 function sheet(name){return {name, data:[], getLastRow(){return this.data.length},getMaxRows(){return 1000},getRange(r,c,n,w){const s=this;return {setValues(v){calls.writes++;if(failWrite)throw Error('write');v.forEach((x,i)=>s.data[r-1+i]=x.slice());},clearContent(){s.data.splice(r-1,n)}}},getDataRange(){return {getValues:()=>this.data}},insertRowsAfter(){}}}
 const ss={getId:()=> 'book',getSheetByName:n=>sheets[n],insertSheet:n=>(sheets[n]=sheet(n))};
 const ctx={Date,Logger:{log(){}},Utilities:{formatDate:d=>d.toISOString().slice(0,10),sleep(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>props[k]=v})},SpreadsheetApp:{flush(){}},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},MailApp:{sendEmail(){calls.mails++;if(failMail)throw Error('mail uncertain')}}};
 vm.createContext(ctx);for(const p of ['Config.gs','NoteStatsService.gs','ReportGenerator.gs','MailNotifier.gs','main.gs'])vm.runInContext(fs.readFileSync(__dirname+'/../'+p,'utf8'),ctx);
 const cfg={timezone:'Asia/Tokyo',recipient:'test@example.invalid'};ctx.Config.getInstance=()=>cfg;
 const note=ctx.NoteStatsService.getInstance(cfg);note.getMonthlySpreadsheet=()=>ss;
 const articles=Array.from({length:13},(_,i)=>({id:i+1,name:'article '+i,user:{urlname:'user'},key:'key'+i,read_count:100+i,like_count:10+i}));
 note.fetchArticles=p=>{calls.fetch++;return articles.slice((p-1)*12,p*12)};
 return {ctx,props,calls,note,ss,sheets,articles,setFailWrite:v=>failWrite=v,setFailMail:v=>failMail=v};
}
let e=environment();const s=e.note.getOrCreateSheet(e.ss,'2026-10-08',true);
assert.equal(e.calls.writes,1);assert.equal(s.data.length,15);assert.equal(s.data[14][3],1378);assert.equal(s.data[1][5],"=D2-VLOOKUP($A2,'2026-10-07'!$A:$E,4, false)");
e.note.getOrCreateSheet(e.ss,'2026-10-08',true);assert.equal(e.calls.writes,1);
e=environment();let partial=e.ss.insertSheet('2026-10-08');partial.data=[['partial']];e.note.fetchArticles=()=>{throw Error('API')};assert.throws(()=>e.note.getOrCreateSheet(e.ss,'2026-10-08',true));assert.equal(partial.data[0][0],'partial');assert.equal(Object.keys(e.props).length,0);
e=environment();e.setFailWrite(true);assert.throws(()=>e.note.getOrCreateSheet(e.ss,'2026-10-08',true));assert.equal(Object.keys(e.props).length,0);e.setFailWrite(false);e.note.getOrCreateSheet(e.ss,'2026-10-08',true);assert.equal(e.sheets['2026-10-08'].data.length,15);
e=environment();e.note.fetchArticles=()=>Array(12).fill(e.articles[0]);assert.throws(()=>e.note.getOrCreateSheet(e.ss,'2026-10-08',true),/Duplicate/);assert.equal(e.calls.writes,0);
e=environment();e.ctx.sendNoteDailySummary();e.ctx.sendNoteDailySummary();assert.equal(e.calls.mails,1);
e=environment();e.setFailMail(true);assert.throws(()=>e.ctx.sendNoteDailySummary());e.setFailMail(false);e.ctx.sendNoteDailySummary();assert.equal(e.calls.mails,1);assert(Object.values(e.props).includes('SENDING'));
// Report calculation and full text remain unchanged; verify a known comparison fixture.
e=environment();let today=e.ss.insertSheet('2026-10-08'),yesterday=e.ss.insertSheet('2026-10-07');today.data=[[],[1,'A','url',110,12],[2,'B','url',20,5],['sum','【合計】','',130,17]];yesterday.data=[[],[1,'A','url',100,10],[2,'B','url',20,5],['sum','【合計】','',120,15]];e.props['NOTE_DATA_COMPLETE:book:2026-10-08']='1';vm.runInContext("var RealDate=Date; Date=function(value){return arguments.length ? new RealDate(value) : new RealDate('2026-10-08T00:00:00Z')}; Date.now=RealDate.now;",e.ctx);let report=new e.ctx.ReportGenerator(e.note,{timezone:'Asia/Tokyo'});assert.equal(report.totalPvDiff,10);assert.equal(report.totalLikeDiff,2);assert(report.getBody().includes('「A」: +10PV（スキ +2）'));
console.log('PASS: batch rows/formulas/totals, completed rerun, fetch failure, write failure recovery, duplicate API, sent/uncertain mail, report fixture');
for(const count of [0,1,12,24]){e=environment();e.note.fetchArticles=p=>Array.from({length:count},(_,i)=>({...e.articles[0],id:i+1})).slice((p-1)*12,p*12);const sh=e.note.getOrCreateSheet(e.ss,'2026-10-08',true);assert.equal(sh.data.length,count+2);assert.equal(sh.data[count+1][3],count*100);assert.equal(e.calls.writes,1)}
e=environment();e.note.startedAt=Date.now()-241000;assert.throws(()=>e.note.getOrCreateSheet(e.ss,'2026-10-08',true),/Time budget/);assert.equal(e.calls.writes,0);
e=environment();e.ctx.LockService.getScriptLock=()=>({tryLock:()=>false});e.ctx.sendNoteDailySummary();assert.equal(e.calls.mails,0);assert.equal(e.calls.fetch,0);
e=environment();e.ctx.UrlFetchApp={fetch:()=>({getResponseCode:()=>401,getContentText:()=> '{}'})};assert.throws(()=>e.ctx.NoteStatsService.prototype.fetchArticles.call(e.note,1),/HTTP 401/);e.ctx.UrlFetchApp.fetch=()=>({getResponseCode:()=>200,getContentText:()=> '{}'});assert.throws(()=>e.ctx.NoteStatsService.prototype.fetchArticles.call(e.note,1),/Invalid note API/);
console.log('PASS: 0/1/12/24 articles, time budget, concurrent lock, HTTP/schema errors');
