const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
function setup() {
  let sent = 0, locked = true, released = 0;
  const props = new Map();
  const ctx = vm.createContext({console, Map, Set, Date,
    Logger:{log(){}}, Utilities:{formatDate(){return '2026-10-08';}, sleep(){}, getUuid(){return 'abcd1234-uuid';}},
    SpreadsheetApp:{flush(){}},
    LockService:{getScriptLock(){return {tryLock(){return locked;},releaseLock(){released++;}};}},
    PropertiesService:{getScriptProperties(){return {getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)};}},
    MailNotifier:function(){this.send=()=>{sent++;};}});
  for(const f of ['Config.gs','NoteStatsService.gs','ReportGenerator.gs','main.gs','RepairComparison.gs']) vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
  return {ctx,props,sent:()=>sent,released:()=>released,setLocked:v=>locked=v};
}
const header=['id','記事タイトル','記事URL','PV数','スキ数','前日比（PV数）','前日比（スキ数）'];
const row=(id,pv=10,like=2,title='title')=>[id,title,'https://note.com/test/n/key',pv,like,'#N/A','#N/A'];
const sum=(pv=10,like=2)=>['sum','【合計】','',pv,like,'#N/A','#N/A'];
const article=(id,pv=10,like=2,title='title')=>({id,name:title,read_count:pv,like_count:like,user:{urlname:'test'},key:'n1'});
class Sheet {
  constructor(values){this.values=structuredClone(values);this.metadata=[];this.writes=0;this.copies=0;this.notes=[];this.corrupt=false;}
  getDataRange(){return {getValues:()=>structuredClone(this.values)};}
  getDeveloperMetadata(){return this.metadata.slice();}
  addDeveloperMetadata(k,v){const m={getKey:()=>k,getValue:()=>v,remove:()=>this.metadata.splice(this.metadata.indexOf(m),1)};this.metadata.push(m);}
  clearContents(){this.values=[];}
  getRange(r,c,n,m){return {setValues:values=>{this.writes++;for(let i=0;i<n;i++){this.values[r-1+i]??=[];for(let j=0;j<m;j++)this.values[r-1+i][c-1+j]=values[i][j];}if(this.corrupt)this.values[r-1][c-1]='BROKEN';},getValues:()=>this.values.slice(r-1,r-1+n).map(a=>a.slice(c-1,c-1+m)),setNote:v=>this.notes.push(v)};}
  copyTo(){this.copies++;this.lastBackup=new Sheet(this.values);return this.lastBackup;}
  setName(v){this.name=v;}
  getSheetId(){return 123;}
  getMaxRows(){return 1000;}
  insertRowsAfter(){}
}
function service(ctx){return new ctx.NoteStatsService({timezone:'Asia/Tokyo'});}
function snapshot(ctx,rows){return ctx.NoteStatsService.inspectRows(rows);}
function json(v){return JSON.parse(JSON.stringify(v));}

test('legacy complete accepted; missing, inconsistent and duplicate totals rejected',()=>{
 const {ctx}=setup();assert.equal(snapshot(ctx,[row(1),sum()]).complete,true);
 for(const rows of [[row(1)],[row(1),sum(9)],[row(1),row(1),sum(20,4)],[sum(),row(1)],[row(1,'10'),sum()]])assert.equal(snapshot(ctx,rows).complete,false);
});
test('header validation and WRITING/COMPLETE marker validation',()=>{
 const {ctx}=setup(), n=service(ctx), s=new Sheet([header,row(1),sum()]);assert.equal(n.readSnapshot(s).complete,true);
 n.setStatus(s,'WRITING');assert.equal(n.readSnapshot(s).complete,false);
 n.setStatus(s,'COMPLETE:1');assert.equal(n.readSnapshot(s).complete,true);
 n.setStatus(s,'COMPLETE:2');assert.equal(n.readSnapshot(s).complete,false);
 s.values[0][0]='bad';n.setStatus(s,'COMPLETE:1');assert.equal(n.readSnapshot(s).complete,false);
});
test('219 partial previous rows versus254 current never produces false numeric diffs',()=>{
 const {ctx}=setup(),n=service(ctx);const before=snapshot(ctx,Array.from({length:219},(_,i)=>row(i+1)));
 const rows=n.buildRows(Array.from({length:254},(_,i)=>article(i+1,20)),before);
 assert.equal(rows.length,255);assert.equal(rows.at(-1)[3],5080);assert.ok(rows.every(r=>typeof r[5]==='string'&&r[5].includes('比較不可')));
});
test('ID identity survives rename and duplicate titles; new article unknown; signed total accurate',()=>{
 const {ctx}=setup(),n=service(ctx);const before=snapshot(ctx,[row(1,10,2,'same'),row(2,30,3,'same'),sum(40,5)]);
 const rows=n.buildRows([article(1,15,3,'renamed'),article(2,25,2,'same'),article(3,7,1)],before);
 assert.equal(rows[0][5],5);assert.equal(rows[1][5],-5);assert.equal(typeof rows[2][5],'string');assert.equal(rows[3][5],7);
});
test('API HTTP, invalid JSON and missing payload fail closed',()=>{
 const {ctx}=setup(),n=service(ctx);
 for(const [code,body] of [[401,'{}'],[200,'bad'],[200,'{}']]){ctx.UrlFetchApp={fetch:()=>({getResponseCode:()=>code,getContentText:()=>body})};assert.throws(()=>n.fetchArticles(1));}
 ctx.UrlFetchApp={fetch:()=>({getResponseCode:()=>200,getContentText:()=>'{"data":{"note_stats":[]}}'})};assert.equal(n.fetchArticles(1).length,0);
});
test('fetch confirms empty final page instead of undocumented page size',()=>{
 const {ctx}=setup(),n=service(ctx);let calls=0;n.fetchArticles=()=>{calls++;return calls<=2?[article(calls)]:[];};assert.equal(n.fetchAllArticles().length,2);assert.equal(calls,3);
});
test('empty capture and repeated ID fail without accepted snapshot',()=>{
 const {ctx}=setup(),n=service(ctx);n.fetchArticles=()=>[];assert.throws(()=>n.fetchAllArticles(),/0件/);
 n.fetchArticles=()=>[article(1)];assert.throws(()=>n.fetchAllArticles(),/重複/);
});
test('cross-month lookup uses prior workbook and never creates it',()=>{
 const {ctx}=setup(),n=service(ctx);let args;n.getMonthlySpreadsheet=(...a)=>{args=a;return null;};assert.equal(ctx.NoteStatsService.previousDate('2026-10-01'),'2026-09-30');assert.equal(n.getSnapshot('2026-09-30').complete,false);assert.deepEqual(args,['2026_09',false]);
});
test('historical read does not create sheet and historical data capture is prohibited',()=>{
 const {ctx}=setup(),n=service(ctx),ss={getSheetByName:()=>null,insertSheet(){throw Error('unexpected write');}};
 assert.equal(n.getOrCreateSheet(ss,'2026-10-07',false),null);assert.throws(()=>n.getOrCreateSheet(ss,'2026-10-07',true),/過去日/);
});
test('complete current snapshot is reused without fetch or write',()=>{
 const {ctx}=setup(),n=service(ctx),s=new Sheet([header,row(1),sum()]);n.fetchAllArticles=()=>{throw Error('must not fetch');};assert.equal(n.getOrCreateSheet({getId:()=> 'book',getSheetByName:()=>s},'2026-10-08',true),s);assert.equal(s.writes,0);
});
test('partial current snapshot backed up, one batch write, and COMPLETE readback',()=>{
 const {ctx}=setup(),n=service(ctx),s=new Sheet([header,row(1)]),original=structuredClone(s.values);
 n.getSnapshot=()=>snapshot(ctx,[]);n.fetchAllArticles=()=>[article(1),article(2)];n.getOrCreateSheet({getId:()=> 'book',getSheetByName:()=>s},'2026-10-08',true);
 assert.equal(s.writes,1);assert.equal(s.copies,1);assert.deepEqual(s.lastBackup.values,original);assert.equal(n.readSnapshot(s).complete,true);assert.equal(s.metadata[0].getValue(),'COMPLETE:2');
});
test('API failure preserves partial original without creating backup or clearing',()=>{
 const {ctx}=setup(),n=service(ctx),s=new Sheet([header,row(1)]),original=structuredClone(s.values);n.getSnapshot=()=>snapshot(ctx,[]);n.fetchAllArticles=()=>{throw Error('API');};assert.throws(()=>n.getOrCreateSheet({getId:()=> 'book',getSheetByName:()=>s},'2026-10-08',true),/API/);assert.deepEqual(s.values,original);assert.equal(s.copies,0);
});
test('write corruption fails verification and remains WRITING',()=>{
 const {ctx}=setup(),n=service(ctx),s=new Sheet([header,row(1)]);s.corrupt=true;n.getSnapshot=()=>snapshot(ctx,[]);n.fetchAllArticles=()=>[article(1)];assert.throws(()=>n.getOrCreateSheet({getId:()=> 'book',getSheetByName:()=>s},'2026-10-08',true),/検証/);assert.equal(s.metadata[0].getValue(),'WRITING');
});
function reportNote(ctx,currentRows,prevRows){const s=new Sheet([header,...currentRows]);return {getMonthlySpreadsheet:()=>({}),getOrCreateSheet:()=>s,readSnapshot:()=>snapshot(ctx,currentRows),getSnapshot:()=>snapshot(ctx,prevRows)};}
test('report says incomparable for missing previous and refuses incomplete current',()=>{
 const {ctx}=setup();let report=new ctx.ReportGenerator(reportNote(ctx,[row(1),sum()],[row(1)]),{timezone:'Asia/Tokyo'});assert.match(report.getSubject(),/比較不可/);assert.match(report.getBody(),/0で補っていません/);assert.equal(report.totalPvDiff,null);
 assert.throws(()=>new ctx.ReportGenerator(reportNote(ctx,[row(1)],[]),{timezone:'Asia/Tokyo'}),/未完了/);
});
test('report totals include decreases and matched renamed article',()=>{
 const {ctx}=setup(),r=new ctx.ReportGenerator(reportNote(ctx,[row(1,8,1,'new'),sum(8,1)],[row(1),sum()]),{timezone:'Asia/Tokyo'});assert.equal(r.totalPvDiff,-2);assert.match(r.getSubject(),/PV -2/);assert.doesNotMatch(r.getSubject(),/\+-/);
});
test('mail is locked and deduplicated, including uncertain send failures',()=>{
 const env=setup(),{ctx}=env;ctx.NoteStatsService.getInstance=()=>({checkBudget(){}});ctx.ReportGenerator=function(){this.todayStr='2026-10-08';this.getSubject=()=>'';this.getBody=()=>'';};ctx.sendNoteDailySummary();ctx.sendNoteDailySummary();assert.equal(env.sent(),1);assert.equal(env.released(),2);
 env.props.clear();ctx.MailNotifier=function(){this.send=()=>{throw Error('uncertain');};};assert.throws(()=>ctx.sendNoteDailySummary(),/uncertain/);assert.equal(env.props.get('NOTE_MAIL:2026-10-08'),'SENDING');ctx.sendNoteDailySummary();
});
test('lock refusal never sends mail',()=>{const env=setup();env.setLocked(false);env.ctx.sendNoteDailySummary();assert.equal(env.sent(),0);});
test('historical repair preview is read-only; apply backs up and changes F:G only',()=>{
 const {ctx}=setup(),n=service(ctx),s=new Sheet([header,row(1),sum()]);n.getMonthlySpreadsheet=()=>({getSheetByName:()=>s});n.getSnapshot=()=>snapshot(ctx,[row(1)]);ctx.NoteStatsService.getInstance=()=>n;
 const old=structuredClone(s.values), preview=ctx.repairSavedNoteComparison('2026-10-08');assert.equal(preview.applied,false);assert.equal(s.writes,0);assert.equal(s.copies,0);
 const result=ctx.repairSavedNoteComparison('2026-10-08',true);assert.equal(result.applied,true);assert.equal(s.copies,1);assert.deepEqual(s.values.map(r=>r.slice(0,5)),old.map(r=>r.slice(0,5)));assert.equal(s.values[1][5],'比較不可（保存データ欠損）');assert.deepEqual(s.lastBackup.values,old);
});
test('historical repair rejects impossible date',()=>{const {ctx}=setup();assert.throws(()=>ctx.repairSavedNoteComparison('2026-02-30'));});

test('preview is read-only even if saved snapshot disappears before report construction',()=>{
 const {ctx}=setup(),n=service(ctx);n.getSnapshot=()=>snapshot(ctx,[row(1),sum()]);
 n.getMonthlySpreadsheet=(month,create)=>{assert.equal(create,false);return null;};
 n.getOrCreateSheet=()=>{throw Error('MUTATION');};ctx.NoteStatsService.getInstance=()=>n;
 assert.throws(()=>ctx.previewNoteDailySummary(),/未完了/);
});
test('preview of saved complete snapshot never fetches, writes or sends',()=>{
 const env=setup(),{ctx}=env,n=service(ctx),s=new Sheet([header,row(1),sum()]);
 n.getSnapshot=()=>snapshot(ctx,[row(1),sum()]);n.getMonthlySpreadsheet=(month,create)=>{assert.equal(create,false);return {getSheetByName:()=>s};};
 n.getOrCreateSheet=()=>{throw Error('MUTATION');};ctx.NoteStatsService.getInstance=()=>n;
 ctx.previewNoteDailySummary();assert.equal(s.writes,0);assert.equal(env.sent(),0);
});

test('global four-minute budget is checked before fetch and mail',()=>{
 const {ctx}=setup(),n=service(ctx);n.startedAt=Date.now()-241000;n.fetchArticles=()=>{throw Error('SHOULD NOT FETCH');};assert.throws(()=>n.fetchAllArticles(),/Time budget/);
 const env=setup();env.ctx.NoteStatsService.getInstance=()=>({checkBudget(){throw Error('budget before mail');}});env.ctx.ReportGenerator=function(){this.getSubject=()=>'';this.getBody=()=>'';};assert.throws(()=>env.ctx.sendNoteDailySummary(),/budget before mail/);assert.equal(env.sent(),0);assert.equal(env.props.size,0);
});
test('PR2 mail marker skips already-sent date before report construction',()=>{
 const env=setup();env.props.set('NOTE_MAIL:2026-10-08','SENT');env.ctx.ReportGenerator=function(){throw Error('must skip');};env.ctx.sendNoteDailySummary();assert.equal(env.sent(),0);
});
test('PR2 completion marker alone cannot authorize incomplete snapshot reuse',()=>{
 const {ctx,props}=setup(),n=service(ctx),s=new Sheet([header,row(1)]);props.set('NOTE_DATA_COMPLETE:book:2026-10-08','1');n.getSnapshot=()=>snapshot(ctx,[]);n.fetchAllArticles=()=>[article(1)];n.getOrCreateSheet({getId:()=> 'book',getSheetByName:()=>s},'2026-10-08',true);assert.equal(s.copies,1);assert.equal(s.writes,1);
});

test('zero-only legacy total is not evidence of a complete snapshot',()=>{const {ctx}=setup();assert.equal(snapshot(ctx,[sum(0,0)]).complete,false);});
test('PR2-sized fixtures preserve article order, counters and one write',()=>{
 for(const count of [1,12,13,24]){
  const {ctx}=setup(),n=service(ctx),s=new Sheet([header]);const articles=Array.from({length:count},(_,i)=>article(i+1,100+i,10+i));let calls=0;
  n.getSnapshot=()=>snapshot(ctx,[]);n.fetchArticles=p=>{calls++;return articles.slice((p-1)*12,p*12);};
  n.getOrCreateSheet({getId:()=> 'book',getSheetByName:()=>s},'2026-10-08',true);assert.equal(s.writes,1);assert.equal(s.values.length,count+2);assert.deepEqual(s.values.slice(1,-1).map(r=>r[0]),articles.map(a=>a.id));assert.equal(s.values.at(-1)[3],articles.reduce((v,a)=>v+a.read_count,0));assert.equal(calls,Math.ceil(count/12)+1);
 }
});
